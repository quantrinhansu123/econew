import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { TripStatus, VendorTripPaymentStatus } from '../common/enums';
import { Roles, isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { CreateVendorSettlementDto } from './dto/create-vendor-settlement.dto';
import { VendorPaymentAllocationEntity } from './vendor-payment-allocation.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorSettlementEntity, VendorSettlementItemEntity } from './vendor-settlement.entity';
import { VendorsService } from './vendors.service';

const cents = (amount: unknown) => Math.round(Number(amount || 0) * 100);
const cost = (trip: TripEntity) => Number(trip.trip_cost ?? trip.other_costs ?? 0);
const status = (paid: number, due: number) => paid >= due ? VendorTripPaymentStatus.PAID
  : paid > 0 ? VendorTripPaymentStatus.PARTIAL : VendorTripPaymentStatus.UNPAID;

/** Allocate only within the frozen period, oldest departure first. Amounts use integer cents. */
export function allocateSettlementPayment(amount: number, trips: TripEntity[]) {
  let remaining = cents(amount);
  if (!Number.isFinite(amount) || remaining <= 0 || Math.abs(amount * 100 - remaining) > 0.00001) {
    throw new BadRequestException('Số tiền chi không hợp lệ.');
  }
  const sorted = [...trips].sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()
    || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const result = new Map<string, number>();
  for (const trip of sorted) {
    const allocated = Math.min(Math.max(0, cents(cost(trip)) - cents(trip.vendor_paid_amount)), remaining);
    if (allocated > 0) result.set(String(trip.id), allocated / 100);
    remaining -= allocated;
  }
  if (remaining > 0) throw new BadRequestException('Số tiền vượt quá công nợ còn lại của kỳ.');
  return result;
}

@Injectable()
export class VendorSettlementsService {
  constructor(private readonly dataSource: DataSource, private readonly vendors: VendorsService) {}

  private assertFinance(user: UserEntity) {
    if (!(user.role_mask & (Roles.ACCOUNTANT | Roles.MANAGER | Roles.DIRECTOR))) {
      throw new ForbiddenException('Không có quyền thanh toán NCC.');
    }
  }

  private periodTrips(manager: EntityManager, vendorId: string, dto: CreateVendorSettlementDto, lock = false) {
    if (dto.from_date > dto.to_date) throw new BadRequestException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    const from = new Date(`${dto.from_date}T00:00:00+07:00`);
    const until = new Date(new Date(`${dto.to_date}T00:00:00+07:00`).getTime() + 86_400_000);
    const query = manager.getRepository(TripEntity).createQueryBuilder('trip').leftJoinAndSelect('trip.truck', 'truck')
      .where('COALESCE(trip.vendor_id, truck.vendor_id) = :vendorId', { vendorId })
      .andWhere('trip.departure_time >= :from AND trip.departure_time < :until', { from, until })
      .andWhere('trip.status IN (:...statuses)', { statuses: [TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED] })
      .andWhere('COALESCE(trip.trip_cost, trip.other_costs, 0) > 0').orderBy('trip.id', 'ASC');
    if (lock) query.setLock('pessimistic_write', undefined, ['trip']);
    return query.getMany();
  }

  async preview(vendorId: string, dto: CreateVendorSettlementDto, user: UserEntity) {
    this.assertFinance(user);
    const trips = await this.periodTrips(this.dataSource.manager, vendorId, dto);
    return { trip_count: trips.length, total_amount: trips.reduce((sum, trip) => sum + cents(cost(trip)), 0) / 100,
      paid_amount: trips.reduce((sum, trip) => sum + Math.min(cents(cost(trip)), cents(trip.vendor_paid_amount)), 0) / 100 };
  }

  async list(vendorId: string, user: UserEntity) {
    this.assertFinance(user);
    const periods = await this.dataSource.getRepository(VendorSettlementEntity).find({
      where: { vendor_id: vendorId }, relations: ['items', 'items.trip', 'items.trip.truck'], order: { from_date: 'DESC', id: 'DESC' },
    });
    const allocations = periods.length ? await this.dataSource.getRepository(VendorPaymentAllocationEntity).find({
      where: { settlement_id: In(periods.map((period) => period.id)) }, relations: ['payment'],
    }) : [];
    return { items: periods.map((period) => {
      const trips = period.items.map((item) => ({
        id: item.trip_id, amount: Number(item.amount),
        paid_amount: Math.min(Number(item.amount), Number(item.trip.vendor_paid_amount || 0)),
        departure_time: item.trip.departure_time,
        license_plate: item.trip.truck?.bks || item.trip.truck?.license_plate || item.trip.manual_license_plate || null,
      }));
      const total = trips.reduce((sum, trip) => sum + cents(trip.amount), 0) / 100;
      const paid = trips.reduce((sum, trip) => sum + cents(trip.paid_amount), 0) / 100;
      const payments = new Map<string, { id: string; amount: number; payment_date: Date; description: string | null }>();
      for (const allocation of allocations.filter((row) => row.settlement_id === period.id)) {
        const previous = payments.get(allocation.payment_id);
        payments.set(allocation.payment_id, {
          id: allocation.payment_id, amount: ((previous ? cents(previous.amount) : 0) + cents(allocation.amount)) / 100,
          payment_date: allocation.payment.payment_date, description: allocation.payment.description,
        });
      }
      return { id: period.id, from_date: period.from_date, to_date: period.to_date, created_at: period.created_at,
        total_amount: total, paid_amount: paid, remaining_amount: (cents(total) - cents(paid)) / 100,
        payment_status: status(paid, total), trips,
        payments: [...payments.values()].sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()),
      };
    }) };
  }

  async create(vendorId: string, dto: CreateVendorSettlementDto, user: UserEntity) {
    this.assertFinance(user);
    await this.vendors.findOne(vendorId);
    if (dto.from_date > dto.to_date) throw new BadRequestException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    return this.dataSource.transaction(async (manager) => {
      // Serialize period creation per vendor, including overlapping ranges with no shared trips.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`vendor-settlement:${vendorId}`]);
      const repository = manager.getRepository(VendorSettlementEntity);
      const overlap = await repository.createQueryBuilder('period').where('period.vendor_id = :vendorId', { vendorId })
        .andWhere('period.from_date <= :to AND period.to_date >= :from', { from: dto.from_date, to: dto.to_date }).getOne();
      if (overlap) throw new ConflictException('Khoảng ngày này đã có kỳ chốt. Chọn kỳ đã có để thanh toán tiếp.');
      const trips = await this.periodTrips(manager, vendorId, dto, true);
      if (!trips.length) throw new BadRequestException('Không có chuyến đã khởi hành có cước trong khoảng ngày đã chọn.');
      if ((dto.expected_total != null && cents(dto.expected_total) !== trips.reduce((sum, trip) => sum + cents(cost(trip)), 0))
        || (dto.expected_trip_count != null && dto.expected_trip_count !== trips.length)) {
        throw new ConflictException('Số chuyến hoặc tổng cước đã thay đổi. Xem lại công nợ trước khi chốt.');
      }
      const itemRepository = manager.getRepository(VendorSettlementItemEntity);
      const used = await itemRepository.findOne({ where: { trip_id: In(trips.map((trip) => trip.id)) } });
      if (used) throw new ConflictException('Có chuyến đã thuộc kỳ chốt khác.');
      const period = await repository.save(repository.create({ vendor_id: vendorId, from_date: dto.from_date, to_date: dto.to_date, created_by: user.id }));
      // Freeze the supplier on legacy trips that previously inherited it from the truck.
      await manager.getRepository(TripEntity).update({ id: In(trips.map((trip) => trip.id)), vendor_id: IsNull() }, { vendor_id: vendorId });
      await itemRepository.save(trips.map((trip) => itemRepository.create({
        settlement_id: period.id, trip_id: trip.id, amount: String(cost(trip)),
      })));
      // Link existing allocations for history only: do not increment paid amounts again.
      await manager.getRepository(VendorPaymentAllocationEntity).update(
        { trip_id: In(trips.map((trip) => trip.id)), settlement_id: IsNull() }, { settlement_id: period.id },
      );
      return { id: period.id };
    });
  }

  async unallocatedPayments(vendorId: string, user: UserEntity) {
    this.assertFinance(user);
    const payments = await this.dataSource.getRepository(VendorPaymentEntity).find({
      where: { vendor_id: vendorId }, relations: ['allocations', 'trips'], order: { payment_date: 'DESC' },
    });
    return { items: payments.map((payment) => {
      const allocated = payment.allocations.reduce((sum, row) => sum + cents(row.amount), 0);
      // Legacy links without allocations must be reconciled separately, never counted as unused cash.
      const available = payment.trips.length && !payment.allocations.length ? 0 : Math.max(0, cents(payment.amount) - allocated) / 100;
      return { id: payment.id, payment_date: payment.payment_date, amount: Number(payment.amount),
        available_amount: available, description: payment.description };
    }).filter((payment) => payment.available_amount > 0) };
  }

  async pay(vendorId: string, periodId: string, dto: CreateVendorPaymentDto, user: UserEntity) {
    this.assertFinance(user);
    if (dto.trip_ids?.length || dto.allocations?.length) throw new BadRequestException('Kỳ chốt đã xác định danh sách chuyến.');
    return this.dataSource.transaction(async (manager) => {
      const trips = await this.lockPeriodTrips(manager, vendorId, periodId);
      const plan = allocateSettlementPayment(dto.amount, trips);
      const fund = await manager.getRepository(CashFundEntity).findOne({ where: { id: dto.fund_id, is_active: true } });
      if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng.');
      if (!isManager(user.role_mask) && fund.hub_id && !getAssignedHubIds(user).includes(String(fund.hub_id))) {
        throw new ForbiddenException('Không được ghi vào sổ quỹ của bưu cục khác.');
      }
      const repository = manager.getRepository(VendorPaymentEntity);
      const payment = await repository.save(repository.create({
        vendor_id: vendorId, amount: String(dto.amount), payment_date: dto.payment_date, fund_id: fund.id,
        cost_category: dto.cost_category.trim(), description: dto.description?.trim() || null,
        proof_image_url: dto.proof_image_url?.trim() || null, created_by: user.id,
        trips: trips.filter((trip) => plan.has(trip.id)),
      }));
      await this.applyAllocation(manager, periodId, payment, trips, plan);
      await this.vendors.refreshPayableBalance(vendorId, manager);
      return { id: payment.id };
    });
  }

  async attach(vendorId: string, periodId: string, paymentId: string, amount: number | undefined, user: UserEntity) {
    this.assertFinance(user);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(VendorPaymentEntity);
      const locked = await repository.findOne({ where: { id: paymentId, vendor_id: vendorId }, lock: { mode: 'pessimistic_write' } });
      if (!locked) throw new NotFoundException('Không tìm thấy phiếu chi của NCC này.');
      const payment = await repository.findOneOrFail({ where: { id: paymentId }, relations: ['allocations', 'trips'] });
      if (payment.trips.length && !payment.allocations.length) throw new ConflictException('Phiếu cũ đã gắn chuyến nhưng chưa có phân bổ chi tiết.');
      const available = cents(payment.amount) - payment.allocations.reduce((sum, row) => sum + cents(row.amount), 0);
      const trips = await this.lockPeriodTrips(manager, vendorId, periodId);
      const outstanding = trips.reduce((sum, trip) => sum + Math.max(0, cents(cost(trip)) - cents(trip.vendor_paid_amount)), 0);
      const requested = amount ?? Math.min(available, outstanding) / 100;
      if (cents(requested) > available) throw new BadRequestException('Số tiền vượt phần chưa phân bổ của phiếu chi.');
      const plan = allocateSettlementPayment(requested, trips);
      await this.applyAllocation(manager, periodId, payment, trips, plan);
      const existing = new Set(payment.trips.map((trip) => trip.id));
      payment.trips.push(...trips.filter((trip) => plan.has(trip.id) && !existing.has(trip.id)));
      await repository.save(payment);
      // The original payment already reduced vendor/cash balances. Allocation changes no cash.
      return { id: payment.id, allocated_amount: requested, unallocated_amount: (available - cents(requested)) / 100 };
    });
  }

  private async lockPeriodTrips(manager: EntityManager, vendorId: string, periodId: string) {
    const period = await manager.getRepository(VendorSettlementEntity).findOne({
      where: { id: periodId, vendor_id: vendorId }, lock: { mode: 'pessimistic_write' },
    });
    if (!period) throw new NotFoundException('Không tìm thấy kỳ công nợ của NCC này.');
    const items = await manager.getRepository(VendorSettlementItemEntity).find({ where: { settlement_id: periodId } });
    const trips = await manager.getRepository(TripEntity).createQueryBuilder('trip')
      .where('trip.id IN (:...ids)', { ids: items.map((item) => item.trip_id) })
      .orderBy('trip.id', 'ASC').setLock('pessimistic_write').getMany();
    if (!items.length || trips.length !== items.length || items.some((item) => cents(item.amount) !== cents(cost(trips.find((trip) => trip.id === item.trip_id)!)))) {
      throw new ConflictException('Danh sách hoặc cước chuyến đã thay đổi so với kỳ chốt.');
    }
    return trips;
  }

  private async applyAllocation(manager: EntityManager, periodId: string, payment: VendorPaymentEntity, trips: TripEntity[], plan: Map<string, number>) {
    const allocations = manager.getRepository(VendorPaymentAllocationEntity);
    for (const trip of trips) {
      const increment = plan.get(trip.id);
      if (!increment) continue;
      const existing = await allocations.findOne({ where: { payment_id: payment.id, trip_id: trip.id } });
      await allocations.save(allocations.create({ payment_id: payment.id, trip_id: trip.id, settlement_id: periodId,
        amount: String(((existing ? cents(existing.amount) : 0) + cents(increment)) / 100) }));
      const paid = (cents(trip.vendor_paid_amount) + cents(increment)) / 100;
      trip.vendor_paid_amount = String(paid);
      trip.vendor_payment_status = status(paid, cost(trip));
      if (payment.proof_image_url) trip.vendor_payment_proof_url = payment.proof_image_url;
      await manager.getRepository(TripEntity).save(trip);
    }
  }
}
