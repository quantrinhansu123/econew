import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Brackets, FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { RemittanceStatus, TripStatus, WaybillState } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isDirector, isManager } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { ReconciliationEntity } from '../reconciliations/reconciliation.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { AssignUserHubDto } from './dto/assign-user-hub.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './user.entity';

export type SafeUser = Omit<UserEntity, 'password_hash' | 'refresh_token'>;

const VALID_ROLE_MASK = Roles.WAREHOUSE | Roles.PACKER | Roles.DRIVER | Roles.DISPATCHER | Roles.ACCOUNTANT | Roles.MANAGER | Roles.DIRECTOR;
const ACTIVE_TRIP_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT];
const ACTIVE_WAYBILL_STATES = [WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE, WaybillState.MANIFEST_CLOSED, WaybillState.LOADED, WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB, WaybillState.OUT_FOR_DELIVERY];

@Injectable()
export class UsersService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
    @InjectRepository(ReconciliationEntity) private readonly reconciliationsRepository: Repository<ReconciliationEntity>,
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
  ) {}

  async create(dto: CreateUserDto): Promise<SafeUser> {
    this.validateRoleMask(dto.role_mask);
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    await this.ensureUniqueUser(email, phone);
    if (dto.hub_id) await this.ensureHubExists(dto.hub_id);

    const user = this.usersRepository.create({
      email,
      username: email,
      phone: phone as string,
      full_name: dto.full_name.trim(),
      password_hash: await bcrypt.hash(dto.password, this.saltRounds),
      role_mask: dto.role_mask,
      hub_id: dto.hub_id ?? null,
      is_active: true,
      refresh_token: null,
      last_login_at: null,
    });

    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async findAll(query: QueryUsersDto) {
    if (query.role_mask !== undefined) this.validateRoleMask(query.role_mask);
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const queryBuilder = this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.hub', 'hub');

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      queryBuilder.andWhere(new Brackets((qb) => qb.where('users.email ILIKE :keyword', { keyword }).orWhere('users.full_name ILIKE :keyword', { keyword }).orWhere('users.phone ILIKE :keyword', { keyword })));
    }
    if (query.role_mask !== undefined) queryBuilder.andWhere('(users.role_mask & :roleMask) <> 0', { roleMask: query.role_mask });
    if (query.hub_id) queryBuilder.andWhere('users.hub_id = :hubId', { hubId: query.hub_id });
    if (typeof query.is_active === 'boolean') queryBuilder.andWhere('users.is_active = :isActive', { isActive: query.is_active });

    const [users, total] = await queryBuilder.orderBy('users.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: users.map((user) => this.toSafeUser(user)), meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, actor?: UserEntity): Promise<SafeUser> {
    if (actor && actor.id !== id && !isManager(actor.role_mask)) throw new ForbiddenException('Insufficient role permissions');
    return this.toSafeUser(await this.getUserOrThrow(id));
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.getUserOrThrow(id);
    const email = dto.email === undefined ? undefined : this.normalizeEmail(dto.email);
    const phone = dto.phone === undefined ? undefined : this.normalizePhone(dto.phone);
    if (email || phone) await this.ensureUniqueUser(email, phone, id);

    if (email) {
      user.email = email;
      user.username = email;
    }
    if (dto.phone !== undefined) user.phone = phone as string;
    if (dto.full_name !== undefined) user.full_name = dto.full_name.trim();
    if (dto.password !== undefined) user.password_hash = await bcrypt.hash(dto.password, this.saltRounds);

    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actor?: UserEntity): Promise<SafeUser> {
    if (typeof dto.is_active !== 'boolean') throw new BadRequestException('User status is invalid');
    this.assertNotSelf(id, actor, dto.is_active ? 'activate' : 'deactivate');
    const user = await this.getUserOrThrow(id);
    if (!dto.is_active) await this.assertNoActiveTasks(user, 'deactivate');
    user.is_active = dto.is_active;
    user.refresh_token = null;
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async assignRole(id: string, dto: AssignUserRoleDto, actor?: UserEntity): Promise<SafeUser> {
    this.validateRoleMask(dto.role_mask);
    if (actor && !isManager(actor.role_mask)) throw new ForbiddenException('Insufficient role permissions');
    if (actor && !isDirector(actor.role_mask) && hasRole(dto.role_mask, Roles.DIRECTOR)) throw new ForbiddenException('Only directors can assign director role');

    const user = await this.getUserOrThrow(id);
    if (actor && !isDirector(actor.role_mask) && hasRole(user.role_mask, Roles.DIRECTOR) && !hasRole(dto.role_mask, Roles.DIRECTOR)) throw new ForbiddenException('Only directors can remove director role');
    user.role_mask = dto.role_mask;
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async assignHub(id: string, dto: AssignUserHubDto): Promise<SafeUser> {
    const user = await this.getUserOrThrow(id);
    if (dto.hub_id) await this.ensureHubExists(dto.hub_id);
    user.hub_id = dto.hub_id ?? null;
    return this.toSafeUser(await this.usersRepository.save(user));
  }

  async remove(id: string, actor?: UserEntity): Promise<void> {
    this.assertNotSelf(id, actor, 'delete');
    const user = await this.getUserOrThrow(id);
    await this.assertNoActiveTasks(user, 'delete');
    user.is_active = false;
    user.refresh_token = null;
    await this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { email: this.normalizeEmail(email) } });
  }

  async findActiveUsersByRole(roleMask: number): Promise<SafeUser[]> {
    this.validateRoleMask(roleMask);
    const users = await this.usersRepository.createQueryBuilder('users').where('users.is_active = true').andWhere('(users.role_mask & :roleMask) <> 0', { roleMask }).orderBy('users.full_name', 'ASC').getMany();
    return users.map((user) => this.toSafeUser(user));
  }

  toSafeUser(user: UserEntity): SafeUser {
    const { password_hash: _passwordHash, refresh_token: _refreshToken, ...safeUser } = user;
    return safeUser;
  }

  private normalizeEmail(email: string): string {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Email is invalid');
    return normalized;
  }

  private normalizePhone(phone?: string): string | null {
    return phone?.trim() || null;
  }

  private validateRoleMask(roleMask: number): void {
    if (!Number.isInteger(roleMask) || roleMask <= 0 || (roleMask & ~VALID_ROLE_MASK) !== 0) throw new BadRequestException('Role mask is invalid');
  }

  private async ensureUniqueUser(email?: string, phone?: string | null, ignoredUserId?: string): Promise<void> {
    const where = [email ? { email } : null, phone ? { phone } : null].filter(Boolean) as FindOptionsWhere<UserEntity>[];
    if (!where.length) return;
    const existing = await this.usersRepository.findOne({ where });
    if (existing && existing.id !== ignoredUserId) throw new ConflictException(existing.email === email ? 'Email already exists' : 'Phone already exists');
  }

  private async getUserOrThrow(id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureHubExists(hubId: string): Promise<void> {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId, deleted_at: IsNull() } as never });
    if (!hub) throw new NotFoundException('Hub not found');
  }

  private assertNotSelf(id: string, actor: UserEntity | undefined, action: string): void {
    if (actor?.id === id) throw new BadRequestException(`Cannot ${action} current account`);
  }

  private async assertNoActiveTasks(user: UserEntity, action: string): Promise<void> {
    const checks: Array<Promise<number>> = [];
    if (hasRole(user.role_mask, Roles.DRIVER)) {
      checks.push(this.tripsRepository.count({ where: { status: In(ACTIVE_TRIP_STATUSES), truck: { driver_id: user.id } } as never }));
      checks.push(this.waybillsRepository.count({ where: { last_mile_driver_id: user.id, current_state: In(ACTIVE_WAYBILL_STATES) } }));
    }
    if (hasRole(user.role_mask, Roles.DISPATCHER)) checks.push(this.manifestsRepository.count({ where: { status: In(['DRAFT', 'OPEN', 'PENDING']) } as never }));
    if (hasRole(user.role_mask, Roles.ACCOUNTANT)) checks.push(this.reconciliationsRepository.count({ where: { remittance_status: RemittanceStatus.PENDING } }));
    if (hasRole(user.role_mask, Roles.WAREHOUSE) || hasRole(user.role_mask, Roles.PACKER)) checks.push(this.waybillsRepository.count({ where: { current_state: In([WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE]) } }));

    const counts = await Promise.all(checks);
    if (counts.some((count) => count > 0)) throw new BadRequestException(`Cannot ${action} user with active tasks`);
  }
}

