import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { clampPaginationLimit } from '../common/pagination';
import { Roles } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { QueryVendorDebtDto } from './dto/query-vendor-debt.dto';
import { QueryVendorPaymentsDto } from './dto/query-vendor-payments.dto';
import { QueryVendorsDto } from './dto/query-vendors.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpsertVendorDto } from './dto/upsert-vendor.dto';
import { VendorDebtEntryEntity } from './vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorEntity } from './vendor.entity';

export const DEFAULT_VENDOR_CODE = 'CONG_LE';
export const DEFAULT_VENDOR_NAME = 'Công lẻ';

const mutableFields: Array<keyof UpsertVendorDto> = ['code', 'name', 'service_type', 'contact_name', 'phone', 'email', 'province', 'contract_type', 'status', 'routes', 'pricing', 'metadata'];

type LedgerRow = {
  id: string;
  type: 'TRIP' | 'PAYMENT' | 'DEBT';
  date: Date;
  amount: number;
  signed_amount: number;
  running_balance: number;
  description: string | null;
  trip_id?: string | null;
  license_plate?: string | null;
  payment_id?: string | null;
  linked_trip_ids?: string[];
};

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(VendorEntity) private readonly vendorsRepository: Repository<VendorEntity>,
    @InjectRepository(VendorDebtEntryEntity) private readonly debtEntriesRepository: Repository<VendorDebtEntryEntity>,
    @InjectRepository(VendorPaymentEntity) private readonly paymentsRepository: Repository<VendorPaymentEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
  ) {}

  async create(dto: UpsertVendorDto, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    if (dto.code) await this.assertUniqueCode(dto.code);
    const vendor = this.vendorsRepository.create(this.pickMutable(dto));
    vendor.status = vendor.status || 'ACTIVE';
    return this.vendorsRepository.save(vendor);
  }

  async findAll(query: QueryVendorsDto) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.vendorsRepository.createQueryBuilder('vendor');
    this.applyFilters(qb, query);
    const [items, total] = await qb.orderBy('vendor.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findActive(query: QueryVendorsDto) {
    return this.findAll({ ...query, status: 'ACTIVE' });
  }

  async findOne(id: string) {
    const vendor = await this.vendorsRepository.findOne({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async update(id: string, dto: UpsertVendorDto, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const vendor = await this.findOne(id);
    if (dto.code && dto.code !== vendor.code) await this.assertUniqueCode(dto.code, id);
    Object.assign(vendor, this.pickMutable(dto));
    return this.vendorsRepository.save(vendor);
  }

  async updateStatus(id: string, dto: UpdateVendorStatusDto, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const vendor = await this.findOne(id);
    vendor.status = dto.status;
    return this.vendorsRepository.save(vendor);
  }

  async updateRoutes(id: string, routes: Record<string, unknown> | unknown[], currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const vendor = await this.findOne(id);
    vendor.routes = routes;
    return this.vendorsRepository.save(vendor);
  }

  async updatePricing(id: string, pricing: Record<string, unknown> | unknown[], currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const vendor = await this.findOne(id);
    vendor.pricing = pricing;
    return this.vendorsRepository.save(vendor);
  }

  async delete(id: string, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.DIRECTOR]);
    await this.findOne(id);
    await this.vendorsRepository.delete(id);
  }

  async getDebtReport(query: QueryVendorDebtDto = {}) {
    const qb = this.vendorsRepository.createQueryBuilder('vendor')
      .leftJoinAndSelect('vendor.trucks', 'trucks')
      .orderBy('vendor.payable_balance', 'DESC');

    if (query.vendor_id) qb.andWhere('vendor.id = :vendorId', { vendorId: String(query.vendor_id) });
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((inner) => {
        inner.where('vendor.name ILIKE :keyword', { keyword })
          .orWhere('vendor.code ILIKE :keyword', { keyword });
      }));
    }

    const vendors = await qb.getMany();
    const balanceMap = await this.computeBalancesForVendors(vendors.map((v) => v.id));

    return {
      items: vendors.map((vendor) => {
        const bal = balanceMap.get(vendor.id) ?? { total_incurred: 0, total_paid: 0, remaining: 0 };
        return {
          id: vendor.id,
          code: vendor.code,
          name: vendor.name,
          payable_balance: bal.remaining,
          total_incurred: bal.total_incurred,
          total_paid: bal.total_paid,
          truck_count: vendor.trucks?.length ?? 0,
          license_plates: (vendor.trucks ?? []).map((t) => t.bks || t.license_plate).filter(Boolean),
        };
      }),
      grand_total: vendors.reduce((sum, v) => sum + (balanceMap.get(v.id)?.remaining ?? 0), 0),
    };
  }

  async getDebtDashboard(vendorId: string, query: QueryVendorDebtDto) {
    const vendor = await this.findOne(vendorId);
    const trips = await this.queryVendorTrips(vendorId, query.from, query.to);
    const periodTotal = trips.reduce((sum, t) => sum + this.tripCost(t), 0);
    const licensePlates = [...new Set(trips.map((t) => t.truck?.bks || t.truck?.license_plate).filter(Boolean))] as string[];
    const balance = (await this.computeBalancesForVendors([vendorId])).get(vendorId)!;

    const paymentsInPeriod = await this.queryVendorPayments(vendorId, query.from, query.to);
    const periodPaid = paymentsInPeriod.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      vendor: { id: vendor.id, code: vendor.code, name: vendor.name },
      period: { from: query.from ?? null, to: query.to ?? null },
      summary: {
        trip_count: trips.length,
        license_plates: licensePlates,
        total_incurred: periodTotal,
        total_paid: periodPaid,
      },
      balance: {
        total_incurred: balance.total_incurred,
        total_paid: balance.total_paid,
        remaining_debt: balance.remaining,
      },
      trips: trips.map((trip) => ({
        id: trip.id,
        departure_time: trip.departure_time,
        status: trip.status,
        trip_cost: this.tripCost(trip),
        license_plate: trip.truck?.bks || trip.truck?.license_plate || null,
        manifest_id: trip.manifest_id,
        manifest_code: trip.manifest?.manifest_code ?? null,
      })),
    };
  }

  async getLedger(vendorId: string, query: QueryVendorDebtDto) {
    await this.findOne(vendorId);
    const rows = await this.buildLedger(vendorId, query.from, query.to);
    const balance = (await this.computeBalancesForVendors([vendorId])).get(vendorId)!;
    return {
      vendor_id: vendorId,
      balance,
      entries: rows,
    };
  }

  async listPayments(vendorId: string) {
    await this.findOne(vendorId);
    return this.paymentsRepository.find({
      where: { vendor_id: vendorId },
      relations: ['trips', 'creator'],
      order: { payment_date: 'DESC' },
    });
  }

  async listAllPayments(query: QueryVendorPaymentsDto = {}) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 50);

    const qb = this.paymentsRepository.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.vendor', 'vendor')
      .leftJoinAndSelect('payment.creator', 'creator')
      .leftJoinAndSelect('payment.trips', 'trips');

    if (query.vendor_id?.trim()) {
      qb.andWhere('payment.vendor_id = :vendorId', { vendorId: query.vendor_id.trim() });
    }
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((inner) => inner
        .where('vendor.code ILIKE :keyword', { keyword })
        .orWhere('vendor.name ILIKE :keyword', { keyword })
        .orWhere('payment.description ILIKE :keyword', { keyword })));
    }
    if (query.from_date) {
      qb.andWhere('payment.payment_date >= :fromDate', { fromDate: query.from_date });
    }
    if (query.to_date) {
      qb.andWhere(`payment.payment_date < (:toDate::date + interval '1 day')`, { toDate: query.to_date });
    }
    if (query.trip_id?.trim()) {
      qb.andWhere('trips.id = :tripId', { tripId: query.trip_id.trim() });
    }

    const totalsQb = qb.clone();
    const totalAmountRaw = await totalsQb
      .select('COALESCE(SUM(payment.amount), 0)', 'sum_amount')
      .getRawOne<{ sum_amount: string }>();

    const [items, total] = await qb
      .orderBy('payment.payment_date', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        total_amount: Number(totalAmountRaw?.sum_amount ?? 0),
      },
    };
  }

  async recordPayment(vendorId: string, dto: CreateVendorPaymentDto, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR]);
    const vendor = await this.findOne(vendorId);
    if (dto.amount <= 0) throw new BadRequestException('Payment amount must be positive');

    let linkedTrips: TripEntity[] = [];
    if (dto.trip_ids?.length) {
      linkedTrips = await this.validateTripsForVendor(vendorId, dto.trip_ids.map(String));
    }

    const payment = await this.paymentsRepository.save(
      this.paymentsRepository.create({
        vendor_id: vendorId,
        amount: String(dto.amount),
        payment_date: dto.payment_date,
        description: dto.description?.trim() || null,
        created_by: currentUser.id,
        trips: linkedTrips,
      }),
    );

    const balance = (await this.computeBalancesForVendors([vendorId])).get(vendorId)!;
    vendor.payable_balance = String(Math.max(0, balance.remaining));
    await this.vendorsRepository.save(vendor);

    return this.paymentsRepository.findOne({
      where: { id: payment.id },
      relations: ['trips', 'creator'],
    });
  }

  async resolveDefaultVendorId(): Promise<string> {
    let vendor = await this.vendorsRepository.findOne({
      where: [{ code: DEFAULT_VENDOR_CODE }, { name: DEFAULT_VENDOR_NAME }],
    });
    if (!vendor) {
      vendor = await this.vendorsRepository.save(
        this.vendorsRepository.create({
          code: DEFAULT_VENDOR_CODE,
          name: DEFAULT_VENDOR_NAME,
          status: 'ACTIVE',
          payable_balance: '0',
        }),
      );
    }
    return vendor.id;
  }

  async addPayableDebt(vendorId: string, amount: number, tripId?: string, description?: string): Promise<void> {
    if (!amount || amount <= 0) return;
    const vendor = await this.findOne(vendorId);
    const current = Number(vendor.payable_balance ?? 0);
    vendor.payable_balance = String(current + amount);
    await this.vendorsRepository.save(vendor);
    await this.debtEntriesRepository.save(
      this.debtEntriesRepository.create({
        vendor_id: vendorId,
        trip_id: tripId ?? null,
        amount: String(amount),
        description: description ?? null,
      }),
    );
  }

  private async queryVendorTrips(vendorId: string, from?: Date, to?: Date): Promise<TripEntity[]> {
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .innerJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .where('truck.vendor_id = :vendorId', { vendorId })
      .andWhere('(COALESCE(trip.trip_cost, 0) > 0 OR COALESCE(trip.other_costs, 0) > 0)');

    if (from) qb.andWhere('trip.departure_time >= :from', { from });
    if (to) qb.andWhere('trip.departure_time <= :to', { to });
    return qb.orderBy('trip.departure_time', 'DESC').getMany();
  }

  private async queryVendorPayments(vendorId: string, from?: Date, to?: Date): Promise<VendorPaymentEntity[]> {
    const qb = this.paymentsRepository.createQueryBuilder('payment')
      .where('payment.vendor_id = :vendorId', { vendorId });
    if (from) qb.andWhere('payment.payment_date >= :from', { from });
    if (to) qb.andWhere('payment.payment_date <= :to', { to });
    return qb.orderBy('payment.payment_date', 'DESC').getMany();
  }

  private async validateTripsForVendor(vendorId: string, tripIds: string[]): Promise<TripEntity[]> {
    const trips = await this.tripsRepository.find({
      where: { id: In(tripIds) },
      relations: ['truck'],
    });
    if (trips.length !== tripIds.length) throw new NotFoundException('One or more trips not found');
    const invalid = trips.filter((t) => t.truck?.vendor_id !== vendorId);
    if (invalid.length) throw new BadRequestException('All trip_ids must belong to this vendor');
    return trips;
  }

  private tripCost(trip: TripEntity): number {
    const cost = Number(trip.trip_cost ?? trip.other_costs ?? 0);
    return Number.isFinite(cost) ? cost : 0;
  }

  private async computeBalancesForVendors(vendorIds: string[]) {
    const map = new Map<string, { total_incurred: number; total_paid: number; remaining: number }>();
    if (!vendorIds.length) return map;

    for (const vendorId of vendorIds) {
      const trips = await this.queryVendorTrips(vendorId);
      const tripIncurred = trips.reduce((sum, t) => sum + this.tripCost(t), 0);
      const stackDebts = await this.debtEntriesRepository.find({
        where: { vendor_id: vendorId, trip_id: IsNull() },
      });
      const stackIncurred = stackDebts.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
      const totalIncurred = tripIncurred + stackIncurred;
      const payments = await this.paymentsRepository.find({ where: { vendor_id: vendorId } });
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      map.set(vendorId, {
        total_incurred: totalIncurred,
        total_paid: totalPaid,
        remaining: totalIncurred - totalPaid,
      });
    }
    return map;
  }

  private async buildLedger(vendorId: string, from?: Date, to?: Date): Promise<LedgerRow[]> {
    const trips = await this.queryVendorTrips(vendorId);
    const payments = await this.paymentsRepository.find({
      where: { vendor_id: vendorId },
      relations: ['trips'],
      order: { payment_date: 'ASC' },
    });

    type RawEvent = Omit<LedgerRow, 'running_balance'>;
    const events: RawEvent[] = [];

    for (const trip of trips) {
      const cost = this.tripCost(trip);
      if (cost <= 0) continue;
      events.push({
        id: `trip-${trip.id}`,
        type: 'TRIP',
        date: trip.departure_time,
        amount: cost,
        signed_amount: cost,
        description: trip.manifest?.manifest_code ? `Chuyến #${trip.id} · ${trip.manifest.manifest_code}` : `Chi phí chuyến #${trip.id}`,
        trip_id: trip.id,
        license_plate: trip.truck?.bks || trip.truck?.license_plate || null,
      });
    }

    for (const payment of payments) {
      events.push({
        id: `payment-${payment.id}`,
        type: 'PAYMENT',
        date: payment.payment_date,
        amount: Number(payment.amount),
        signed_amount: -Number(payment.amount),
        description: payment.description,
        payment_id: payment.id,
        linked_trip_ids: (payment.trips ?? []).map((t) => t.id),
      });
    }

    const stackDebts = await this.debtEntriesRepository.find({
      where: { vendor_id: vendorId, trip_id: IsNull() },
      order: { created_at: 'ASC' },
    });
    for (const entry of stackDebts) {
      const amount = Number(entry.amount ?? 0);
      if (amount <= 0) continue;
      events.push({
        id: `debt-${entry.id}`,
        type: 'DEBT',
        date: entry.created_at,
        amount,
        signed_amount: amount,
        description: entry.description,
      });
    }

    events.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === 'PAYMENT' ? 1 : 0) - (b.type === 'PAYMENT' ? 1 : 0));

    const fromMs = from?.getTime() ?? -Infinity;
    const toMs = to?.getTime() ?? Infinity;
    let opening = 0;
    for (const event of events) {
      if (event.date.getTime() < fromMs) opening += event.signed_amount;
      else break;
    }

    const scoped = events.filter((row) => row.date.getTime() >= fromMs && row.date.getTime() <= toMs);
    let running = opening;
    return scoped.map((event) => {
      running += event.signed_amount;
      return { ...event, running_balance: running };
    });
  }

  private applyFilters(qb: any, query: QueryVendorsDto) {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder.where('vendor.code ILIKE :keyword', { keyword }).orWhere('vendor.name ILIKE :keyword', { keyword }).orWhere('vendor.contact_name ILIKE :keyword', { keyword }).orWhere('vendor.phone ILIKE :keyword', { keyword }).orWhere('vendor.email ILIKE :keyword', { keyword })));
    }
    ['status', 'service_type', 'province', 'contract_type'].forEach((field) => {
      const value = (query as Record<string, string | undefined>)[field];
      if (!value) return;
      const values = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (!values.length) return;

      if (field === 'province') {
        qb.andWhere(
          new Brackets((builder) => {
            values.forEach((provinceValue, index) => {
              builder.orWhere(`CONCAT(',', COALESCE(vendor.province, ''), ',') LIKE :provincePattern${index}`, {
                [`provincePattern${index}`]: `%,${provinceValue},%`,
              });
            });
          }),
        );
        return;
      }

      if (values.length === 1) qb.andWhere(`vendor.${field} = :${field}`, { [field]: values[0] });
      else if (values.length > 1) qb.andWhere(`vendor.${field} IN (:...${field}Values)`, { [`${field}Values`]: values });
    });
  }

  private pickMutable(dto: UpsertVendorDto) {
    return Object.fromEntries(mutableFields.filter((field) => dto[field] !== undefined).map((field) => [field, dto[field]]));
  }

  private async assertUniqueCode(code: string, currentId?: string) {
    const existing = await this.vendorsRepository.findOne({ where: { code } });
    if (existing && existing.id !== currentId) throw new ConflictException('Vendor code already exists');
  }

  private assertRole(currentUser: UserEntity, roles: number[]) {
    if (!roles.some((role) => (currentUser.role_mask & role) !== 0)) throw new ForbiddenException('Insufficient role permissions');
  }
}
