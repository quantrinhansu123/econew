import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TripStatus } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isManager } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseEntity } from './expense.entity';

const EXPENSE_CREATABLE_TRIP_STATUSES = [TripStatus.IN_TRANSIT, TripStatus.ARRIVED, TripStatus.COMPLETED];
const EXPENSE_WRITE_ROLES = [Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR];

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseEntity) private readonly expensesRepository: Repository<ExpenseEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
  ) {}

  async create(dto: CreateExpenseDto, currentUser: UserEntity): Promise<ExpenseEntity> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const trip = await this.getTrip(String(dto.trip_id));
    if (!EXPENSE_CREATABLE_TRIP_STATUSES.includes(trip.status)) {
      throw new BadRequestException('Expenses can only be recorded after trip starts');
    }
    if (dto.amount !== undefined && dto.amount < 0) throw new BadRequestException('Amount must not be negative');
    const expense = this.expensesRepository.create({
      trip_id: String(dto.trip_id),
      category: dto.category ?? 'OTHER',
      amount: String(dto.amount ?? 0),
      description: dto.description?.trim() || null,
      hub_id: dto.hub_id != null ? String(dto.hub_id) : currentUser.hub_id,
      created_by: currentUser.id,
    });
    return this.expensesRepository.save(expense);
  }

  async findAll(query: QueryExpensesDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 10);
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
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
      .where('expense.trip_id = :tripId', { tripId })
      .orderBy('expense.created_at', 'DESC');
    this.applyHubScope(qb, currentUser);
    return qb.getMany();
  }

  async findOne(id: string, currentUser: UserEntity): Promise<ExpenseEntity> {
    const qb = this.expensesRepository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.trip', 'trip')
      .where('expense.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const expense = await qb.getOne();
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, currentUser: UserEntity): Promise<ExpenseEntity> {
    this.assertAnyRole(currentUser, EXPENSE_WRITE_ROLES);
    const expense = await this.findOne(id, currentUser);
    if (expense.trip.status === TripStatus.COMPLETED) throw new BadRequestException('Cannot update expense for a completed trip');
    if (dto.trip_id !== undefined) {
      const nextTrip = await this.getTrip(String(dto.trip_id));
      if (nextTrip.status === TripStatus.COMPLETED) throw new BadRequestException('Cannot move expense to a completed trip');
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
    return this.expensesRepository.save(expense);
  }

  async remove(id: string, currentUser: UserEntity): Promise<void> {
    this.assertAnyRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const expense = await this.findOne(id, currentUser);
    if (expense.trip.status === TripStatus.COMPLETED) throw new BadRequestException('Cannot delete expense for a completed trip');
    await this.expensesRepository.remove(expense);
  }

  private async getTrip(tripId: string): Promise<TripEntity> {
    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
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
