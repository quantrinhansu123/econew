import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { TripStatus, WaybillState } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { TripEntity } from '../trips/trip.entity';
import { UserHubEntity } from '../users/user-hub.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { CreateHubDto } from './dto/create-hub.dto';
import { QueryHubsDto } from './dto/query-hubs.dto';
import { UpdateHubStatusDto } from './dto/update-hub-status.dto';
import { UpdateHubDto } from './dto/update-hub.dto';
import { HubEntity } from './hub.entity';

const ACTIVE_WAYBILL_STATES = [
  WaybillState.RECEIVED,
  WaybillState.IN_WAREHOUSE,
  WaybillState.MANIFEST_CLOSED,
  WaybillState.IN_TRANSIT,
  WaybillState.AT_DEST_HUB,
  WaybillState.OUT_FOR_DELIVERY,
  WaybillState.RETURNED,
];

const ACTIVE_TRIP_STATUSES = [TripStatus.PLANNED, TripStatus.IN_TRANSIT];

@Injectable()
export class HubsService {
  constructor(
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(UserHubEntity) private readonly userHubsRepository: Repository<UserHubEntity>,
  ) {}

  async create(dto: CreateHubDto): Promise<HubEntity> {
    this.validateAddress(dto);
    const normalizedCode = this.normalizeCode(dto.code);
    const existing = await this.hubsRepository.findOne({ where: { code: normalizedCode } });

    if (existing) {
      throw new ConflictException('Hub code already exists');
    }

    const hub = this.hubsRepository.create({ ...this.normalizeDto(dto), code: normalizedCode, is_active: true });
    return this.hubsRepository.save(hub);
  }

  async findAll(query: QueryHubsDto) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const queryBuilder = this.hubsRepository.createQueryBuilder('hub').where('hub.deleted_at IS NULL');

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('hub.code ILIKE :keyword', { keyword })
            .orWhere('hub.name ILIKE :keyword', { keyword })
            .orWhere('hub.address ILIKE :keyword', { keyword });
        }),
      );
    }

    if (typeof query.status === 'boolean') {
      queryBuilder.andWhere('hub.is_active = :status', { status: query.status });
    }

    if (query.province?.trim()) {
      queryBuilder.andWhere('hub.province ILIKE :province', { province: `%${query.province.trim()}%` });
    }

    if (query.district?.trim()) {
      queryBuilder.andWhere('hub.district ILIKE :district', { district: `%${query.district.trim()}%` });
    }

    if (query.type) {
      queryBuilder.andWhere('hub.type = :type', { type: query.type });
    }

    const [items, total] = await queryBuilder.orderBy('hub.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();

    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string): Promise<HubEntity> {
    const hub = await this.hubsRepository.findOne({ where: { id, deleted_at: IsNull() } });
    if (!hub) {
      throw new NotFoundException('Hub not found');
    }
    return hub;
  }

  async update(id: string, dto: UpdateHubDto): Promise<HubEntity> {
    this.validateAddress(dto);
    const hub = await this.findOne(id);

    if (dto.code !== undefined) {
      const normalizedCode = this.normalizeCode(dto.code);
      const existing = await this.hubsRepository.findOne({ where: { code: normalizedCode } });
      if (existing && existing.id !== id) {
        throw new ConflictException('Hub code already exists');
      }
      hub.code = normalizedCode;
    }

    Object.assign(hub, this.normalizeDto(dto, false));
    return this.hubsRepository.save(hub);
  }

  async updateStatus(id: string, dto: UpdateHubStatusDto): Promise<HubEntity> {
    const hub = await this.findOne(id);

    if (typeof dto.is_active !== 'boolean') {
      throw new BadRequestException('Hub status is invalid');
    }

    if (!dto.is_active) {
      await this.assertNoActiveDependencies(id, 'deactivate');
    }

    hub.is_active = dto.is_active;
    return this.hubsRepository.save(hub);
  }

  async remove(id: string): Promise<void> {
    const hub = await this.findOne(id);
    await this.assertNoActiveDependencies(id, 'delete');
    hub.is_active = false;
    hub.deleted_at = new Date();
    await this.hubsRepository.save(hub);
  }

  findActiveHubs(): Promise<HubEntity[]> {
    return this.hubsRepository.find({
      where: { is_active: true, deleted_at: IsNull() },
      order: { code: 'ASC' },
    });
  }

  private normalizeCode(code: string): string {
    const normalizedCode = code?.trim().toUpperCase();
    if (!normalizedCode) {
      throw new BadRequestException('Hub code is required');
    }
    return normalizedCode;
  }

  private normalizeDto<T extends Partial<CreateHubDto>>(dto: T, includeCode = true): Partial<HubEntity> {
    const normalized: Partial<HubEntity> = {};
    const textFields = ['name', 'province', 'district', 'ward', 'address', 'phone', 'manager_name', 'manager_phone', 'coordinates'] as const;

    if (includeCode && dto.code !== undefined) normalized.code = this.normalizeCode(dto.code);
    if (dto.type !== undefined) normalized.type = dto.type;
    if (dto.latitude !== undefined) normalized.latitude = dto.latitude;
    if (dto.longitude !== undefined) normalized.longitude = dto.longitude;

    textFields.forEach((field) => {
      if (dto[field] !== undefined) {
        (normalized as Record<string, unknown>)[field] = dto[field]?.trim() || null;
      }
    });

    return normalized;
  }

  private validateAddress(dto: Partial<CreateHubDto>): void {
    const requiredAddressFields = ['province', 'district', 'address'] as const;
    requiredAddressFields.forEach((field) => {
      if (dto[field] !== undefined && !dto[field]?.trim()) {
        throw new BadRequestException(`Hub ${field} is invalid`);
      }
    });
  }

  private async assertNoActiveDependencies(id: string, action: 'deactivate' | 'delete'): Promise<void> {
    const [activeWaybills, activeTrips, activeUsers, activeUserHubLinks] = await Promise.all([
      this.waybillsRepository.count({
        where: [
          { origin_hub_id: id, current_state: In(ACTIVE_WAYBILL_STATES) },
          { dest_hub_id: id, current_state: In(ACTIVE_WAYBILL_STATES) },
        ],
      }),
      this.tripsRepository.count({
        where: [
          { start_hub_id: id, status: In(ACTIVE_TRIP_STATUSES) },
          { end_hub_id: id, status: In(ACTIVE_TRIP_STATUSES) },
        ],
      }),
      this.usersRepository.count({ where: { hub_id: id, is_active: true } }),
      this.userHubsRepository.count({ where: { hub_id: id, user: { is_active: true } } }),
    ]);

    if (activeWaybills > 0) {
      throw new BadRequestException(`Cannot ${action} hub with active waybills`);
    }

    if (activeTrips > 0) {
      throw new BadRequestException(`Cannot ${action} hub with active trips`);
    }

    if (activeUsers > 0 || activeUserHubLinks > 0) {
      throw new BadRequestException(`Cannot ${action} hub with active users`);
    }
  }
}
