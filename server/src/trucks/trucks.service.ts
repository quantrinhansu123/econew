import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { TripStatus } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { CreateTruckDto } from './dto/create-truck.dto';
import { QueryTrucksDto } from './dto/query-trucks.dto';
import { RestoreInternalTruckDto } from './dto/restore-internal-truck.dto';
import { TruckStatus } from './dto/truck.enums';
import { UpdateTruckStatusDto } from './dto/update-truck-status.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { VendorsService } from '../vendors/vendors.service';
import { TruckEntity } from './truck.entity';
import { HubEntity } from '../hubs/hub.entity';

const ACTIVE_TRIP_STATUSES = [TripStatus.PLANNED, 'LOADING', TripStatus.IN_TRANSIT, 'ARRIVED_PENDING_CONFIRM'];
const TRIP_LOCK_STATUSES = [TripStatus.PLANNED, 'LOADING', TripStatus.IN_TRANSIT, TripStatus.ARRIVED, 'ARRIVED_PENDING_CONFIRM'];
const INTERNAL_HUB_CODES = new Set(['HAN', 'HCM']);
const DUPLICATE_PLATE_MESSAGE = 'BKS đã tồn tại. Hãy tìm BKS trong danh sách xe và chọn Chỉnh sửa.';

@Injectable()
export class TrucksService {
  constructor(
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    private readonly vendorsService: VendorsService,
  ) {}

  async create(dto: CreateTruckDto, currentUser: UserEntity): Promise<TruckEntity> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const licensePlate = this.normalizePlate(dto.license_plate);
    await this.assertUniquePlate(licensePlate);
    const ownershipType = dto.ownership_type ?? 'VENDOR';
    const hubId = dto.hub_id?.trim() || null;
    if (ownershipType === 'INTERNAL') {
      if (!hubId) throw new BadRequestException('Xe nội bộ phải được gán bưu cục hoạt động');
      await this.assertInternalHub(hubId);
    } else if (dto.driver_id) {
      await this.assertDriverExists(dto.driver_id);
    }
    const vendorId = ownershipType === 'INTERNAL'
      ? null
      : dto.vendor_id?.trim() || (await this.vendorsService.resolveDefaultVendorId());
    const truck = this.trucksRepository.create({
      license_plate: licensePlate,
      payload: dto.payload,
      driver_id: ownershipType === 'INTERNAL' ? null : dto.driver_id ?? null,
      fuel_consumption_limit: dto.fuel_consumption_limit ?? 0,
      status: dto.status ?? TruckStatus.AVAILABLE,
      ownership_type: ownershipType,
      hub_id: hubId,
      ten_lai_xe: ownershipType === 'INTERNAL' ? null : dto.ten_lai_xe?.trim() || null,
      nha_xe: ownershipType === 'INTERNAL' ? null : dto.nha_xe?.trim() || null,
      bks: dto.bks?.trim().toUpperCase() || licensePlate,
      loai_xe: dto.loai_xe?.trim() || null,
      khu_vuc: dto.khu_vuc?.trim() || null,
      vendor_id: vendorId,
    });

    try {
      return await this.trucksRepository.save(truck);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException(DUPLICATE_PLATE_MESSAGE);
      throw error;
    }
  }

  async findAll(query: QueryTrucksDto, _currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.trucksRepository
      .createQueryBuilder('truck')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('truck.hub', 'hub');
    this.applyFilters(qb, query);
    const [items, total] = await qb.orderBy('truck.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findAvailableTrucks(query: QueryTrucksDto, currentUser: UserEntity) {
    const result = await this.findAll({ ...query, status: TruckStatus.AVAILABLE }, currentUser);
    return { ...result, items: result.items.filter((truck) => truck.status === TruckStatus.AVAILABLE) };
  }

  async findLegacy(query: QueryTrucksDto, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    if (!query.keyword?.trim()) throw new BadRequestException('Nhập BKS cần tìm trong dữ liệu cũ');
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.trucksRepository
      .createQueryBuilder('truck')
      .leftJoinAndSelect('truck.driver', 'driver')
      .leftJoinAndSelect('truck.vendor', 'vendor')
      .leftJoinAndSelect('truck.hub', 'hub');
    this.applyFilters(qb, {
      ...query,
      ownership_type: undefined,
      hub_id: undefined,
      hub_codes: undefined,
    });
    qb.andWhere(new Brackets((builder) => builder
      .where("COALESCE(truck.ownership_type, '') <> 'INTERNAL'")
      .orWhere('truck.hub_id IS NULL')
      .orWhere("UPPER(COALESCE(hub.code, '')) NOT IN ('HAN', 'HCM')")));
    const [items, total] = await qb.orderBy('truck.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, _currentUser: UserEntity): Promise<TruckEntity> {
    const truck = await this.trucksRepository.findOne({ where: { id } as any, relations: ['driver', 'trips', 'vendor', 'hub'] });
    if (!truck) throw new NotFoundException('Truck not found');
    return truck;
  }

  async update(id: string, dto: UpdateTruckDto, currentUser: UserEntity): Promise<TruckEntity> {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const truck = await this.findOne(id, currentUser);
    const nextOwnershipType = dto.ownership_type ?? truck.ownership_type ?? 'VENDOR';
    const nextHubId = dto.hub_id !== undefined ? dto.hub_id?.trim() || null : truck.hub_id;
    if (nextOwnershipType === 'INTERNAL') {
      if (!nextHubId) throw new BadRequestException('Xe nội bộ phải được gán bưu cục hoạt động');
      await this.assertInternalHub(nextHubId);
    }
    if (dto.license_plate) {
      const licensePlate = this.normalizePlate(dto.license_plate);
      await this.assertUniquePlate(licensePlate, id);
      truck.license_plate = licensePlate;
    }
    if (nextOwnershipType !== 'INTERNAL' && dto.driver_id !== undefined) {
      if (dto.driver_id) await this.assertDriverExists(dto.driver_id);
      truck.driver_id = dto.driver_id || null;
    }
    Object.assign(truck, {
      payload: dto.payload ?? truck.payload,
      fuel_consumption_limit: dto.fuel_consumption_limit ?? truck.fuel_consumption_limit,
      status: dto.status ?? truck.status,
      driver_id: nextOwnershipType === 'INTERNAL' ? null : truck.driver_id,
      ten_lai_xe: nextOwnershipType === 'INTERNAL' ? null : dto.ten_lai_xe !== undefined ? dto.ten_lai_xe.trim() || null : truck.ten_lai_xe,
      nha_xe: nextOwnershipType === 'INTERNAL' ? null : dto.nha_xe !== undefined ? dto.nha_xe.trim() || null : truck.nha_xe,
      bks: dto.bks !== undefined ? dto.bks.trim().toUpperCase() || truck.license_plate : truck.bks,
      loai_xe: dto.loai_xe !== undefined ? dto.loai_xe.trim() || null : truck.loai_xe,
      khu_vuc: dto.khu_vuc !== undefined ? dto.khu_vuc.trim() || null : truck.khu_vuc,
      vendor_id: nextOwnershipType === 'INTERNAL'
        ? null
        : dto.vendor_id !== undefined ? dto.vendor_id?.trim() || null : truck.vendor_id,
      ownership_type: nextOwnershipType,
      hub_id: nextHubId,
    });
    return this.trucksRepository.save(truck);
  }

  async restoreInternal(id: string, dto: RestoreInternalTruckDto, currentUser: UserEntity): Promise<TruckEntity> {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const truck = await this.findOne(id, currentUser);
    if (!this.isLegacyTruck(truck)) {
      throw new BadRequestException('BKS này đã thuộc danh sách xe nội bộ đang hoạt động');
    }
    const hubId = dto.hub_id.trim();
    const hub = await this.assertInternalHub(hubId);

    return this.trucksRepository.manager.transaction(async (manager) => {
      const transactionalTrucks = manager.getRepository(TruckEntity);
      const transactionalTrips = manager.getRepository(TripEntity);
      const activeTrips = await transactionalTrips.count({
        where: { truck_id: id, status: In(TRIP_LOCK_STATUSES as any[]) } as any,
      });
      if (activeTrips > 0) {
        throw new BadRequestException('Xe đang có chuyến hoạt động, cần hoàn tất chuyến trước khi khôi phục');
      }

      const historicalTrips = await transactionalTrips.find({ where: { truck_id: id } as any });
      const changedTrips = historicalTrips.filter((trip) => {
        let changed = false;
        if (!trip.vendor_id && truck.vendor_id) {
          trip.vendor_id = String(truck.vendor_id);
          changed = true;
        }
        if (!trip.driver_name && truck.ten_lai_xe) {
          trip.driver_name = truck.ten_lai_xe;
          changed = true;
        }
        if (!trip.driver_phone && truck.driver?.phone) {
          trip.driver_phone = truck.driver.phone;
          changed = true;
        }
        return changed;
      });
      if (changedTrips.length) await transactionalTrips.save(changedTrips);

      Object.assign(truck, {
        ownership_type: 'INTERNAL',
        hub_id: hubId,
        driver_id: null,
        ten_lai_xe: null,
        nha_xe: null,
        vendor_id: null,
        driver: null,
        vendor: null,
        hub,
        bks: truck.bks?.trim().toUpperCase() || truck.license_plate,
      });
      return transactionalTrucks.save(truck);
    });
  }

  async updateStatus(id: string, dto: UpdateTruckStatusDto, currentUser: UserEntity): Promise<TruckEntity> {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const truck = await this.findOne(id, currentUser);
    if ([TruckStatus.MAINTENANCE, TruckStatus.INACTIVE].includes(dto.status)) await this.assertNoActiveTrips(id, 'change status');
    truck.status = dto.status;
    return this.trucksRepository.save(truck);
  }

  async softDelete(id: string, currentUser: UserEntity) {
    this.assertRole(currentUser, [Roles.DIRECTOR]);
    await this.findOne(id, currentUser);
    await this.assertNoActiveTrips(id, 'delete truck');
    await this.trucksRepository.delete(id);
  }

  private applyFilters(qb: any, query: QueryTrucksDto) {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(
        new Brackets((builder) =>
          builder
            .where('truck.license_plate ILIKE :keyword', { keyword })
            .orWhere('truck.bks ILIKE :keyword', { keyword })
            .orWhere('truck.ten_lai_xe ILIKE :keyword', { keyword })
            .orWhere('truck.nha_xe ILIKE :keyword', { keyword })
            .orWhere('truck.loai_xe ILIKE :keyword', { keyword })
            .orWhere('truck.khu_vuc ILIKE :keyword', { keyword }),
        ),
      );
    }
    const statuses = this.parseList(query.status);
    if (statuses.length) qb.andWhere('truck.status IN (:...statuses)', { statuses });
    if (query.loai_xe?.trim()) qb.andWhere('truck.loai_xe = :loaiXe', { loaiXe: query.loai_xe.trim() });
    if (query.driver_id) qb.andWhere('truck.driver_id = :driverId', { driverId: query.driver_id });
    if (query.vendor_id) qb.andWhere('truck.vendor_id = :vendorId', { vendorId: query.vendor_id });
    if (query.ownership_type) qb.andWhere('truck.ownership_type = :ownershipType', { ownershipType: query.ownership_type });
    if (query.hub_id) qb.andWhere('truck.hub_id = :hubId', { hubId: query.hub_id });
    const hubCodes = this.parseList(query.hub_codes).map((code) => code.toUpperCase());
    if (hubCodes.length) qb.andWhere('UPPER(hub.code) IN (:...hubCodes)', { hubCodes });
  }

  private parseList(value?: string): string[] {
    return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  }

  private isLegacyTruck(truck: TruckEntity): boolean {
    const hubCode = String(truck.hub?.code || '').toUpperCase();
    return truck.ownership_type !== 'INTERNAL' || !truck.hub_id || !INTERNAL_HUB_CODES.has(hubCode);
  }

  private async assertUniquePlate(licensePlate: string, ignoreId?: string) {
    const qb = this.trucksRepository.createQueryBuilder('truck').where('truck.license_plate = :licensePlate', { licensePlate });
    if (ignoreId) qb.andWhere('truck.id != :ignoreId', { ignoreId });
    const existing = await qb.getOne();
    if (existing) throw new ConflictException(DUPLICATE_PLATE_MESSAGE);
  }

  private async assertDriverExists(driverId: string): Promise<UserEntity> {
    const driver = await this.usersRepository.findOne({ where: { id: driverId } as any });
    if (!driver) throw new NotFoundException('Driver not found');
    if ((driver.role_mask & Roles.DRIVER) === 0) throw new BadRequestException('Assigned user must have DRIVER role');
    return driver;
  }

  private async assertInternalHub(hubId: string): Promise<HubEntity> {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId, is_active: true, deleted_at: null } as any });
    if (!hub) throw new NotFoundException('Bưu cục không tồn tại hoặc đã ngừng hoạt động');
    if (!INTERNAL_HUB_CODES.has(String(hub.code || '').toUpperCase())) {
      throw new BadRequestException('Xe nội bộ chỉ được gán bưu cục Hà Nội (HAN) hoặc TP.HCM (HCM)');
    }
    return hub;
  }

  private async assertNoActiveTrips(truckId: string, action: string) {
    const activeTrips = await this.tripsRepository.count({ where: { truck_id: truckId, status: In(TRIP_LOCK_STATUSES as any[]) } as any });
    if (activeTrips > 0) throw new BadRequestException(`Cannot ${action} with active trips`);
  }

  private normalizePlate(licensePlate: string) {
    const normalized = licensePlate.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Truck license plate is required');
    return normalized;
  }

  private assertRole(currentUser: UserEntity, roles: number[]) {
    if (!roles.some((role) => (currentUser.role_mask & role) !== 0)) throw new ForbiddenException('Insufficient role permissions');
  }
}
