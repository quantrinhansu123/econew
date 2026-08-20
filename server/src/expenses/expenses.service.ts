import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TripStatus } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds, getDefaultHubId } from '../common/user-hub-scope';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { VendorsService } from '../vendors/vendors.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseCategory } from './dto/expense.enums';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseEntity } from './expense.entity';

const EXPENSE_CREATABLE_TRIP_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED];
const EXPENSE_WRITE_ROLES = [Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR];

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseEntity) private readonly expensesRepository: Repository<ExpenseEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(CashFundEntity) private readonly cashFundsRepository: Repository<CashFundEntity>,
    private readonly vendorsService: VendorsService,
  ) {}

  async create(dto: CreateExpenseDto, currentUser: UserEntity): Promise<ExpenseEntity> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const trip = await this.getTrip(String(dto.trip_id));
    if (!EXPENSE_CREATABLE_TRIP_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Expenses can only be recorded for an assigned or departed trip');
    }
    if (dto.amount !== undefined && dto.amount < 0) throw new BadRequestException('Amount must not be negative');
    const vendor = dto.vendor_id != null ? await this.getActiveVendor(String(dto.vendor_id)) : null;
    const fund = dto.fund_id != null ? await this.getActiveFund(String(dto.fund_id), currentUser) : null;
    const hubId = this.resolveExpenseHubId(dto.hub_id, fund, trip, currentUser);
    const expense = this.expensesRepository.create({
      trip_id: String(dto.trip_id),
      category: dto.category?.trim() || ExpenseCategory.OTHER,
      amount: String(dto.amount ?? 0),
      description: dto.description?.trim() || null,
      vendor_id: vendor?.id ?? null,
      hub_id: hubId,
      fund_id: fund?.id ?? null,
      receipt_urls: this.normalizeReceiptUrls(dto.receipt_urls),
      created_by: currentUser.id,
    });
    const saved = await this.expensesRepository.save(expense);
    if (saved.vendor_id) await this.vendorsService.refreshPayableBalance(saved.vendor_id);
    return saved;
  }

  async findAll(query: QueryExpensesDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 10);
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
      .leftJoinAndSelect('expense.vendor', 'vendor')
      .leftJoinAndSelect('expense.fund', 'fund')
      .leftJoinAndSelect('fund.hub', 'fund_hub')
      .orderBy('expense.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.trip_id) qb.andWhere('expense.trip_id = :tripId', { tripId: String(query.trip_id) });
    this.applyHubScope(qb, currentUser);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByTrip(tripId: string, currentUser: UserEntity): Promise<ExpenseEntity[]> {
    await this.getTrip(tripId);
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
      .leftJoinAndSelect('expense.vendor', 'vendor')
      .leftJoinAndSelect('expense.fund', 'fund')
      .leftJoinAndSelect('fund.hub', 'fund_hub')
      .where('expense.trip_id = :tripId', { tripId })
      .orderBy('expense.created_at', 'DESC');
    this.applyHubScope(qb, currentUser);
    return qb.getMany();
  }

  async findCategories(currentUser: UserEntity): Promise<string[]> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const rows = await this.expensesRepository.createQueryBuilder('expense')
      .select('DISTINCT expense.category', 'category')
      .where('expense.category IS NOT NULL')
      .orderBy('expense.category', 'ASC')
      .getRawMany<{ category: string }>();
    return [...new Set([
      ...Object.values(ExpenseCategory),
      ...rows.map((row) => row.category?.trim()).filter((value): value is string => Boolean(value)),
    ])];
  }

  async findCashFunds(currentUser: UserEntity): Promise<CashFundEntity[]> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const qb = this.cashFundsRepository.createQueryBuilder('fund')
      .leftJoinAndSelect('fund.hub', 'hub')
      .where('fund.is_active = true')
      .orderBy('fund.code', 'ASC');
    if (!isManager(currentUser.role_mask) && !hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) {
      const hubIds = getAssignedHubIds(currentUser);
      if (!hubIds.length) throw new ForbiddenException('Tài khoản chưa được gán bưu cục');
      qb.andWhere('(fund.hub_id IS NULL OR fund.hub_id IN (:...hubIds))', { hubIds });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser: UserEntity): Promise<ExpenseEntity> {
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
      .leftJoinAndSelect('expense.vendor', 'vendor')
      .leftJoinAndSelect('expense.fund', 'fund')
      .leftJoinAndSelect('fund.hub', 'fund_hub')
      .where('expense.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const expense = await qb.getOne();
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, currentUser: UserEntity): Promise<ExpenseEntity> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const expense = await this.findOne(id, currentUser);
    const previousVendorId = expense.vendor_id;
    if (dto.trip_id !== undefined) {
      const nextTrip = await this.getTrip(String(dto.trip_id));
      if (!EXPENSE_CREATABLE_TRIP_STATUSES.includes(nextTrip.status)) {
        throw new BadRequestException('Expenses can only be recorded for an assigned or departed trip');
      }
      expense.trip_id = String(dto.trip_id);
      expense.trip = nextTrip;
    }
    if (dto.category !== undefined) expense.category = dto.category.trim() || ExpenseCategory.OTHER;
    if (dto.amount !== undefined) {
      if (dto.amount < 0) throw new BadRequestException('Amount must not be negative');
      expense.amount = String(dto.amount);
    }
    if (dto.description !== undefined) expense.description = dto.description?.trim() || null;
    const nextFund = dto.fund_id === undefined
      ? expense.fund ?? (expense.fund_id ? await this.getActiveFund(expense.fund_id, currentUser) : null)
      : dto.fund_id == null
        ? null
        : await this.getActiveFund(String(dto.fund_id), currentUser);
    if (dto.fund_id !== undefined) {
      expense.fund_id = nextFund?.id ?? null;
      expense.fund = nextFund;
    }
    if (dto.hub_id !== undefined || dto.fund_id !== undefined) {
      expense.hub_id = this.resolveExpenseHubId(dto.hub_id, nextFund, expense.trip, currentUser);
    }
    if (dto.vendor_id !== undefined) {
      const vendor = dto.vendor_id == null ? null : await this.getActiveVendor(String(dto.vendor_id));
      expense.vendor_id = vendor?.id ?? null;
      expense.vendor = vendor;
    }
    if (dto.receipt_urls !== undefined) expense.receipt_urls = this.normalizeReceiptUrls(dto.receipt_urls);
    const saved = await this.expensesRepository.save(expense);
    const affectedVendorIds = [...new Set([previousVendorId, saved.vendor_id].filter((value): value is string => Boolean(value)))];
    await Promise.all(affectedVendorIds.map((vendorId) => this.vendorsService.refreshPayableBalance(vendorId)));
    return saved;
  }

  async remove(id: string, currentUser: UserEntity): Promise<void> {
    this.assertAnyRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const expense = await this.findOne(id, currentUser);
    const vendorId = expense.vendor_id;
    await this.expensesRepository.remove(expense);
    if (vendorId) await this.vendorsService.refreshPayableBalance(vendorId);
  }

  private async getTrip(tripId: string): Promise<TripEntity> {
    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async getActiveVendor(vendorId: string) {
    const vendor = await this.vendorsService.findOne(vendorId);
    if (String(vendor.status || '').toUpperCase() !== 'ACTIVE') {
      throw new BadRequestException('Vendor must be active');
    }
    return vendor;
  }

  private async getActiveFund(fundId: string, currentUser: UserEntity): Promise<CashFundEntity> {
    const fund = await this.cashFundsRepository.findOne({ where: { id: fundId, is_active: true }, relations: ['hub'] });
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
    if (!isManager(currentUser.role_mask) && !hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) {
      const hubIds = getAssignedHubIds(currentUser);
      if (fund.hub_id && !hubIds.includes(String(fund.hub_id))) {
        throw new ForbiddenException('Không được ghi nhận chi phí vào sổ quỹ của bưu cục khác');
      }
    }
    return fund;
  }

  private resolveExpenseHubId(
    requestedHubId: number | undefined,
    fund: CashFundEntity | null,
    trip: TripEntity,
    currentUser: UserEntity,
  ): string {
    const explicitHubId = requestedHubId == null ? null : String(requestedHubId);
    if (fund?.hub_id && explicitHubId && String(fund.hub_id) !== explicitHubId) {
      throw new BadRequestException('Bưu cục khoản chi không khớp với sổ quỹ đã chọn');
    }
    const hubId = String(fund?.hub_id ?? explicitHubId ?? getDefaultHubId(currentUser) ?? trip.start_hub_id);
    if (!isManager(currentUser.role_mask) && !hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) {
      const assignedHubIds = getAssignedHubIds(currentUser);
      if (assignedHubIds.length && !assignedHubIds.includes(hubId)) {
        throw new ForbiddenException('Không được ghi nhận chi phí cho bưu cục khác');
      }
    }
    return hubId;
  }

  private normalizeReceiptUrls(urls?: string[]): string[] {
    return [...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 6);
  }

  private applyHubScope(qb: any, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) return;
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (!assignedHubIds.length) return;
    qb.andWhere(new Brackets((inner) => {
      inner.where('trip.start_hub_id IN (:...userHubIds)', { userHubIds: assignedHubIds })
        .orWhere('trip.end_hub_id IN (:...userHubIds)', { userHubIds: assignedHubIds });
    }));
  }

  private assertAnyRole(currentUser: UserEntity, roles: number[]): void {
    if (!roles.some((role) => hasRole(currentUser.role_mask, role))) {
      throw new ForbiddenException('Insufficient role permissions');
    }
  }
}
