import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TripStatus } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isManager } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { VendorsService } from '../vendors/vendors.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
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
    const expense = this.expensesRepository.create({
      trip_id: String(dto.trip_id),
      category: dto.category ?? 'OTHER',
      amount: String(dto.amount ?? 0),
      description: dto.description?.trim() || null,
      vendor_id: vendor?.id ?? null,
      hub_id: dto.hub_id != null ? String(dto.hub_id) : currentUser.hub_id,
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
      .where('expense.trip_id = :tripId', { tripId })
      .orderBy('expense.created_at', 'DESC');
    this.applyHubScope(qb, currentUser);
    return qb.getMany();
  }

  async findOne(id: string, currentUser: UserEntity): Promise<ExpenseEntity> {
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
      .leftJoinAndSelect('expense.vendor', 'vendor')
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
    if (dto.category !== undefined) expense.category = dto.category;
    if (dto.amount !== undefined) {
      if (dto.amount < 0) throw new BadRequestException('Amount must not be negative');
      expense.amount = String(dto.amount);
    }
    if (dto.description !== undefined) expense.description = dto.description?.trim() || null;
    if (dto.hub_id !== undefined) expense.hub_id = String(dto.hub_id);
    if (dto.vendor_id !== undefined) {
      const vendor = await this.getActiveVendor(String(dto.vendor_id));
      expense.vendor_id = vendor.id;
      expense.vendor = vendor;
    }
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

  private applyHubScope(qb: any, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) return;
    if (!currentUser.hub_id) return;
    qb.andWhere(new Brackets((inner) => {
      inner.where('trip.start_hub_id = :userHubId', { userHubId: currentUser.hub_id })
        .orWhere('trip.end_hub_id = :userHubId', { userHubId: currentUser.hub_id });
    }));
  }

  private assertAnyRole(currentUser: UserEntity, roles: number[]): void {
    if (!roles.some((role) => hasRole(currentUser.role_mask, role))) {
      throw new ForbiddenException('Insufficient role permissions');
    }
  }
}
