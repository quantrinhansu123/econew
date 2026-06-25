import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, isManager } from '../common/roles';
import { WaybillState, TripStatus } from '../common/enums';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { AddWaybillsToManifestDto } from './dto/add-waybills-to-manifest.dto';
import { WaybillSplitLoadStatus } from '../waybills/dto/waybill-split-load-status.enum';
import { AssignManifestTripDto } from './dto/assign-manifest-trip.dto';
import { CloseManifestDto } from './dto/close-manifest.dto';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { ManifestStatus } from './dto/manifest.enums';
import { QueryManifestsDto } from './dto/query-manifests.dto';
import { UpdateManifestDto } from './dto/update-manifest.dto';
import { ManifestWaybillEntity } from './manifest-waybill.entity';
import { ManifestEntity } from './manifest.entity';

type ManifestRecord = ManifestEntity & Record<string, any>;
type WaybillRecord = WaybillEntity & Record<string, any>;
type TripRecord = TripEntity & Record<string, any>;

const LOCKED_TRIP_STATUSES = [TripStatus.COMPLETED, 'CANCELLED'];

@Injectable()
export class ManifestsService {
  constructor(
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
    @InjectRepository(ManifestWaybillEntity) private readonly manifestWaybillsRepository: Repository<ManifestWaybillEntity>,
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(WaybillSplitEntity) private readonly waybillSplitsRepository: Repository<WaybillSplitEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
  ) {}

  async create(dto: CreateManifestDto, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    await this.assertHubAccess(dto.origin_hub_id, currentUser);
    await this.assertActiveHub(dto.origin_hub_id);
    await this.assertActiveHub(dto.dest_hub_id);

    const manifest = this.manifestsRepository.create({
      manifest_code: await this.generateUniqueCode(),
      origin_hub_id: dto.origin_hub_id,
      dest_hub_id: dto.dest_hub_id,
      seal_code: dto.seal_code ?? '',
      status: ManifestStatus.DRAFT,
    } as any) as unknown as ManifestRecord;

    Object.assign(manifest, {
      trip_id: null,
      total_waybills: 0,
      total_weight: 0,
      total_cod_amount: 0,
      note: dto.note ?? null,
      closed_at: null,
      closed_by: null,
      assigned_trip_at: null,
      created_by: currentUser.id,
      updated_by: null,
      deleted_at: null,
    });

    try {
      return await this.manifestsRepository.save(manifest) as ManifestRecord;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Manifest code already exists');
      throw error;
    }
  }

  async findAll(query: QueryManifestsDto, currentUser: UserEntity) {
    await this.processScheduledArrivals();
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.manifestsRepository.createQueryBuilder('manifest').leftJoinAndSelect('manifest.origin_hub', 'origin_hub').leftJoinAndSelect('manifest.dest_hub', 'dest_hub').leftJoinAndSelect('manifest.trips', 'trip').leftJoinAndSelect('trip.truck', 'truck').leftJoinAndSelect('truck.driver', 'driver');
    this.applyFilters(qb, query);
    this.applyHubScope(qb, currentUser);
    const [items, total] = await qb.orderBy('manifest.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    await this.enrichTransportSummaries(items as ManifestRecord[]);
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<ManifestRecord> {
    const manifest = await this.loadManifest(id);
    this.assertManifestAccess(manifest, currentUser);
    await this.enrichTransportSummaries([manifest]);
    return manifest;
  }

  async update(id: string, dto: UpdateManifestDto, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    this.assertDraft(manifest);
    if (dto.dest_hub_id) await this.assertActiveHub(dto.dest_hub_id);
    Object.assign(manifest, {
      dest_hub_id: dto.dest_hub_id ?? manifest.dest_hub_id,
      seal_code: dto.seal_code ?? manifest.seal_code,
      note: dto.note ?? manifest.note,
      updated_by: currentUser.id,
    });
    return await this.manifestsRepository.save(manifest) as ManifestRecord;
  }

  async updateExpectedArrival(id: string, dto: { expected_arrival_time?: Date | string | null }, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    const expectedArrivalTime = dto.expected_arrival_time ? new Date(dto.expected_arrival_time) : null;
    if (dto.expected_arrival_time && Number.isNaN(expectedArrivalTime?.getTime())) throw new BadRequestException('expected_arrival_time must be a valid date-time');

    const tripId = manifest.trip_id ?? manifest.trip?.id;
    if (tripId && /^\d+$/.test(String(tripId))) {
      const trip = await this.tripsRepository.findOne({ where: { id: String(tripId) } as any }) as TripRecord | null;
      if (!trip) throw new NotFoundException('Trip not found');
      trip.expected_arrival_time = expectedArrivalTime;
      await this.tripsRepository.save(trip);
      return this.findOne(id, currentUser);
    }

    const links = await this.manifestWaybillsRepository.find({ where: { manifest_id: String(manifest.id) } });
    const waybillIds = links.map((link) => String(link.waybill_id)).filter(Boolean);
    if (!waybillIds.length) throw new BadRequestException('Manifest has no waybill split to update expected arrival');
    const splits = await this.waybillSplitsRepository.find({ where: { waybill_id: In(waybillIds) }, order: { loading_position: 'ASC', id: 'ASC' } });
    if (!splits.length) throw new BadRequestException('Manifest has no transport split to update expected arrival');
    splits.forEach((split) => { split.expected_arrival_at = expectedArrivalTime; });
    await this.waybillSplitsRepository.save(splits);
    return this.findOne(id, currentUser);
  }

  async addWaybills(id: string, dto: AddWaybillsToManifestDto, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.PACKER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    this.assertCanAddWaybills(manifest);

    type ManifestAddLine = { waybill_id: string; package_count?: number; loading_position?: number };
    const rawLines: ManifestAddLine[] = dto.items?.length
      ? dto.items.map((line) => ({
        waybill_id: String(line.waybill_id),
        package_count: line.package_count,
        loading_position: line.loading_position,
      }))
      : (dto.waybill_ids ?? []).map((waybillId) => ({ waybill_id: String(waybillId) }));
    if (!rawLines.length) throw new BadRequestException('Chưa chọn vận đơn để thêm vào bảng kê');

    const lines = [...rawLines.reduce((map, line) => map.set(line.waybill_id, line), new Map<string, ManifestAddLine>()).values()];
    const existingLinks = await this.manifestWaybillsRepository.find({ where: { manifest_id: id } });
    const existingIds = new Set(existingLinks.map((link) => String(link.waybill_id)));
    const linesNeedingLink = lines.filter((line) => !existingIds.has(line.waybill_id));
    const linesAddingPackages = lines.filter((line) => existingIds.has(line.waybill_id));
    if (!lines.length) throw new BadRequestException('Chưa chọn vận đơn để thêm vào bảng kê');

    const newIds = [...new Set(lines.map((line) => line.waybill_id))];
    const waybills = await this.waybillsRepository.find({
      where: { id: In(newIds), deleted_at: IsNull() } as any,
      relations: ['order'],
    }) as WaybillRecord[];
    if (waybills.length !== newIds.length) throw new NotFoundException('One or more waybills not found');

    const waybillById = new Map(waybills.map((waybill) => [String(waybill.id), waybill]));
    for (const waybill of waybills) this.assertWaybillCanBeAdded(manifest, waybill);

    const isClosed = manifest.status === ManifestStatus.CLOSED;
    const now = new Date();
    let nextPosition = existingLinks.reduce((max, link) => Math.max(max, Number(link.loading_position ?? 0)), 0);
    const links: ManifestWaybillEntity[] = [];
    const splitsToSave: WaybillSplitEntity[] = [];
    const linkDispatchUpdates: Array<{ waybill_id: string; package_count: number }> = [];
    const mutatedWaybillIds = new Set<string>();

    const allocatePackages = async (line: ManifestAddLine, createLink: boolean) => {
      const waybill = waybillById.get(line.waybill_id);
      if (!waybill) return;

      const remainingPackages = await this.getRemainingPackages(waybill);
      const packageCount = line.package_count != null ? Number(line.package_count) : remainingPackages;
      if (!Number.isFinite(packageCount) || packageCount <= 0) {
        throw new BadRequestException(`Vận đơn ${waybill.waybill_code} không còn kiện để thêm vào bảng kê`);
      }
      if (packageCount > remainingPackages) {
        throw new BadRequestException(`Vận đơn ${waybill.waybill_code}: số kiện vượt quá còn lại (${remainingPackages})`);
      }

      const loadingPosition = line.loading_position ?? (isClosed ? ++nextPosition : null);
      if (createLink) {
        links.push(this.manifestWaybillsRepository.create({
          manifest_id: id,
          waybill_id: line.waybill_id,
          loading_position: loadingPosition,
          loaded_at: isClosed && packageCount >= remainingPackages ? now : null,
          dispatch_fields: this.buildInitialDispatchFields(waybill, packageCount),
        }));
      } else {
        linkDispatchUpdates.push({ waybill_id: line.waybill_id, package_count: packageCount });
      }

      splitsToSave.push(this.waybillSplitsRepository.create({
        waybill_id: line.waybill_id,
        package_count: packageCount,
        loading_position: loadingPosition,
        load_status: isClosed && packageCount >= remainingPackages
          ? WaybillSplitLoadStatus.LOADED
          : WaybillSplitLoadStatus.WAITING_LOAD,
        expected_arrival_at: this.computeExpectedArrivalAt(waybill),
        created_by: currentUser.id,
      }));

      const isFullyAllocated = packageCount >= remainingPackages;
      if (isFullyAllocated) {
        waybill.manifest_id = id;
        mutatedWaybillIds.add(line.waybill_id);
        if (isClosed) {
          waybill.current_state = WaybillState.MANIFEST_CLOSED;
          waybill.status = WaybillState.MANIFEST_CLOSED;
          waybill.loaded_at = waybill.loaded_at ?? now;
          waybill.updated_by = currentUser.id;
          waybill.last_audit_action = 'MANIFEST_ADD_WAYBILL';
          waybill.last_audit_user_id = currentUser.id;
          waybill.last_audit_at = now;
        }
      }
    };

    for (const line of linesNeedingLink) {
      await allocatePackages(line, true);
    }
    for (const line of linesAddingPackages) {
      await allocatePackages(line, false);
    }

    if (links.length) await this.manifestWaybillsRepository.save(links as any);
    if (splitsToSave.length) await this.waybillSplitsRepository.save(splitsToSave);

    for (const update of linkDispatchUpdates) {
      const link = existingLinks.find((row) => String(row.waybill_id) === update.waybill_id);
      if (!link) continue;
      const currentQty = Number((link.dispatch_fields as Record<string, unknown> | null)?.so_luong ?? 0);
      link.dispatch_fields = {
        ...(link.dispatch_fields ?? {}),
        so_luong: String(currentQty + update.package_count),
      };
      await this.manifestWaybillsRepository.save(link);
    }

    const waybillsToSave = waybills.filter((waybill) => mutatedWaybillIds.has(String(waybill.id)));
    if (waybillsToSave.length) await this.waybillsRepository.save(waybillsToSave as any);
    await this.refreshTotals(manifest, waybills, currentUser.id);
    return this.findOne(id, currentUser);
  }

  async removeWaybill(id: string, waybillId: string, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    this.assertRemovableManifest(manifest);
    const waybill = await this.waybillsRepository.findOne({ where: { id: waybillId, deleted_at: IsNull() } as any }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    await this.manifestWaybillsRepository.delete({ manifest_id: id, waybill_id: waybillId });
    if (waybill.manifest_id === id) {
      waybill.manifest_id = null;
      await this.waybillsRepository.save(waybill as any);
    }
    await this.refreshTotals(manifest, undefined, currentUser.id);
    return this.findOne(id, currentUser);
  }

  async closeManifest(id: string, dto: CloseManifestDto, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    this.assertDraft(manifest);
    const waybills = this.extractWaybills(manifest);
    if (!waybills.length) throw new BadRequestException('Manifest must have at least one waybill');
    if (waybills.some((waybill) => this.getWaybillStatus(waybill) !== WaybillState.IN_WAREHOUSE)) throw new BadRequestException('All waybills must be IN_WAREHOUSE');

    waybills.forEach((waybill) => {
      waybill.current_state = WaybillState.MANIFEST_CLOSED;
      waybill.status = WaybillState.MANIFEST_CLOSED;
      waybill.manifest_id = id;
      waybill.updated_by = currentUser.id;
      waybill.last_audit_action = 'MANIFEST_CLOSE';
      waybill.last_audit_user_id = currentUser.id;
      waybill.last_audit_at = new Date();
    });
    await this.waybillsRepository.save(waybills as any);
    Object.assign(manifest, {
      status: ManifestStatus.CLOSED,
      seal_code: dto.seal_code,
      note: dto.note ?? manifest.note,
      closed_at: new Date(),
      closed_by: currentUser.id,
      updated_by: currentUser.id,
    });
    await this.refreshTotals(manifest, waybills, currentUser.id);
    return await this.manifestsRepository.save(manifest) as ManifestRecord;
  }

  async assignTrip(id: string, dto: AssignManifestTripDto, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    if (manifest.status !== ManifestStatus.CLOSED) throw new BadRequestException('Only CLOSED manifests can be assigned to a trip');
    const trip = await this.tripsRepository.findOne({ where: { id: dto.trip_id } as any }) as TripRecord | null;
    if (!trip) throw new NotFoundException('Trip not found');
    if (LOCKED_TRIP_STATUSES.includes(trip.status)) throw new BadRequestException('Trip is completed or cancelled');
    if (trip.start_hub_id !== manifest.origin_hub_id) throw new BadRequestException('Trip origin hub must match manifest origin hub');
    trip.manifest_id = id;
    await this.tripsRepository.save(trip as TripEntity);
    Object.assign(manifest, { trip_id: dto.trip_id, status: ManifestStatus.ASSIGNED_TO_TRIP, assigned_trip_at: new Date(), updated_by: currentUser.id });
    const savedManifest = await this.manifestsRepository.save(manifest) as ManifestRecord;
    await this.enrichTransportSummaries([savedManifest]);
    return savedManifest;
  }

  async updateDispatchRows(id: string, dto: { rows?: Array<{ waybill_id?: string | number; fields?: Record<string, unknown> }> }, currentUser: UserEntity): Promise<ManifestRecord> {
    this.assertRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    const rowMap = new Map((dto.rows ?? []).map((row) => [String(row.waybill_id ?? ''), row.fields ?? {}]));
    const links = manifest.manifest_waybills ?? [];

    for (const link of links as Array<ManifestWaybillEntity & Record<string, any>>) {
      const fields = rowMap.get(String(link.waybill_id));
      if (!fields) continue;
      link.dispatch_fields = this.sanitizeDispatchFields(fields);
    }

    await this.manifestWaybillsRepository.save(links as ManifestWaybillEntity[]);
    return this.findOne(id, currentUser);
  }

  private parseContactName(info?: string | null): string {
    return (info || '').split('|')[0]?.trim() || '';
  }

  private parseContactPhone(info?: string | null): string {
    if (!info) return '';
    return info.split('|').map((part) => part.trim())[1] || '';
  }

  private parseContactAddress(info?: string | null): string {
    if (!info) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts.slice(2).join(' | ').trim() || parts[0] || '';
  }

  private buildInitialDispatchFields(waybill: WaybillRecord, packageCount: number) {
    const address = waybill.receiver_address?.trim() || this.parseContactAddress(waybill.receiver_info);
    const phone = waybill.receiver_phone?.trim() || this.parseContactPhone(waybill.receiver_info);
    const diaChi = phone ? (address ? `${address} · SĐT: ${phone}` : `SĐT: ${phone}`) : address;
    return this.sanitizeDispatchFields({
      ma_tinh: waybill.noi_den,
      ten_cty: this.parseContactName(waybill.sender_info),
      dv: 'TC',
      mat_hang: waybill.noi_dung || '',
      noi_tra: '',
      so_luong: String(packageCount),
      loai: 'kiện',
      dia_chi: diaChi,
      ma_bill: waybill.waybill_code,
      ghi_chu_bill: waybill.note,
      cod: waybill.cod_amount,
      kg: waybill.weight,
      m3: waybill.the_tich_m3 ?? waybill.volumetric_weight,
    });
  }

  private sanitizeDispatchFields(fields: Record<string, unknown>) {
    const allowed = ['ngay_boc', 'ma_tinh', 'ten_cty', 'dv', 'mat_hang', 'noi_tra', 'so_luong', 'loai', 'dia_chi', 'ghi_chu_1', 'ghi_chu_2', 'ke_hoach', 'lai_xe_thu_ho', 'bc_thu_ho', 'ma_bill', 'ghi_chu_bill', 'kg', 'm3', 'qd', 'du_kien_toi_hcm', 'trang_thai_giao', 'ngay_hoan_thanh', 'cod'];
    return allowed.reduce<Record<string, unknown>>((result, key) => {
      const value = fields[key];
      if (value !== undefined && value !== null) result[key] = typeof value === 'string' ? value.slice(0, 500) : value;
      return result;
    }, {});
  }

  async getPrintableManifest(id: string, currentUser: UserEntity) {
    const manifest = await this.findOne(id, currentUser);
    const waybills = this.extractWaybills(manifest).map((waybill) => ({
      id: waybill.id,
      waybill_code: waybill.waybill_code,
      sender_info: waybill.sender_info,
      receiver_info: waybill.receiver_info,
      weight: waybill.weight,
      payment_type: waybill.payment_type,
      cod_amount: waybill.cod_amount ?? 0,
      package_count: waybill.package_count ?? 1,
    }));
    return {
      id: manifest.id,
      manifest_code: manifest.manifest_code,
      seal_code: manifest.seal_code,
      status: manifest.status,
      route: { origin_hub_id: manifest.origin_hub_id, dest_hub_id: manifest.dest_hub_id, origin_hub: manifest.origin_hub, dest_hub: manifest.dest_hub },
      waybills,
      created_by: manifest.created_by,
      closed_by: manifest.closed_by,
      closed_at: manifest.closed_at,
      total_waybills: manifest.total_waybills ?? waybills.length,
      total_weight: manifest.total_weight ?? waybills.reduce((sum, waybill) => sum + Number(waybill.weight ?? 0), 0),
      total_cod_amount: manifest.total_cod_amount ?? waybills.reduce((sum, waybill) => sum + Number(waybill.cod_amount ?? 0), 0),
    };
  }

  async softDelete(id: string, currentUser: UserEntity): Promise<void> {
    this.assertRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const manifest = await this.findOne(id, currentUser);
    if (manifest.status !== ManifestStatus.DRAFT) throw new BadRequestException('Only DRAFT manifests can be deleted');
    await this.manifestWaybillsRepository.delete({ manifest_id: id });
    await this.manifestsRepository.delete({ id } as any);
  }

  private async loadManifest(id: string): Promise<ManifestRecord> {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Manifest id must be a numeric bigint');

    const manifest = await this.manifestsRepository.findOne({
      where: { id } as any,
      relations: ['origin_hub', 'dest_hub', 'trips', 'trips.truck', 'trips.truck.driver', 'manifest_waybills', 'manifest_waybills.waybill', 'manifest_waybills.waybill.dest_hub'],
    }) as ManifestRecord | null;
    if (!manifest) throw new NotFoundException('Manifest not found');
    this.sortManifestWaybills(manifest);
    return manifest;
  }

  private sortManifestWaybills(manifest: ManifestRecord) {
    const compareLinks = (
      a: ManifestWaybillEntity & Record<string, any>,
      b: ManifestWaybillEntity & Record<string, any>,
    ) => {
      const posA = Number(a.loading_position);
      const posB = Number(b.loading_position);
      const aValid = Number.isFinite(posA) && posA > 0;
      const bValid = Number.isFinite(posB) && posB > 0;
      if (!aValid && !bValid) {
        return String(a.waybill?.waybill_code || a.waybill_id || '').localeCompare(
          String(b.waybill?.waybill_code || b.waybill_id || ''),
          'vi',
        );
      }
      if (!aValid) return 1;
      if (!bValid) return -1;
      if (posA !== posB) return posA - posB;
      return String(a.waybill?.waybill_code || a.waybill_id || '').localeCompare(
        String(b.waybill?.waybill_code || b.waybill_id || ''),
        'vi',
      );
    };

    if (manifest.manifest_waybills?.length) {
      manifest.manifest_waybills.sort(compareLinks);
    }
  }

  private async enrichTransportSummaries(manifests: ManifestRecord[]): Promise<void> {
    const manifestIds = manifests.map((manifest) => String(manifest.id)).filter(Boolean);
    if (!manifestIds.length) return;

    manifests.forEach((manifest) => {
      const trips = (manifest.trips ?? []) as TripRecord[];
      const primaryTrip = trips[0] ?? null;
      if (primaryTrip) manifest.trip = this.mapTripSummary(primaryTrip);
    });

    const needsSplitFallback = manifests.filter((manifest) => !manifest.trip);
    if (!needsSplitFallback.length) return;

    const links = await this.manifestWaybillsRepository.find({ where: { manifest_id: In(needsSplitFallback.map((manifest) => String(manifest.id))) } });
    const manifestByWaybill = new Map<string, ManifestRecord>();
    const manifestById = new Map(needsSplitFallback.map((manifest) => [String(manifest.id), manifest]));
    links.forEach((link) => {
      const manifest = manifestById.get(String(link.manifest_id));
      if (manifest) manifestByWaybill.set(String(link.waybill_id), manifest);
    });

    const waybillIds = [...manifestByWaybill.keys()];
    if (!waybillIds.length) return;

    const splits = await this.waybillSplitsRepository.find({
      where: { waybill_id: In(waybillIds) },
      relations: ['truck', 'truck.driver', 'trip', 'trip.truck'],
      order: { loading_position: 'ASC', id: 'ASC' },
    });

    for (const split of splits as Array<WaybillSplitEntity & Record<string, any>>) {
      const manifest = manifestByWaybill.get(String(split.waybill_id));
      if (!manifest || manifest.trip) continue;
      const trip = split.trip as TripRecord | null;
      const rawTruck = split.truck ?? trip?.truck ?? null;
      const plate = rawTruck?.bks ?? rawTruck?.license_plate ?? split.carrier_label ?? null;
      const truck = rawTruck
        ? { ...rawTruck, bks: rawTruck.bks ?? rawTruck.license_plate ?? plate, license_plate: rawTruck.license_plate ?? rawTruck.bks ?? plate }
        : plate
          ? { bks: plate, license_plate: plate }
          : null;
      manifest.trip = {
        id: trip?.id ?? split.trip_id ?? `split-${split.id}`,
        trip_code: trip?.trip_code ?? trip?.code ?? null,
        code: trip?.code ?? null,
        status: trip?.status ?? split.load_status ?? null,
        arrival_time: trip?.arrival_time ?? split.expected_arrival_at ?? null,
        expected_arrival_time: trip?.expected_arrival_time ?? split.expected_arrival_at ?? null,
        truck,
        driver_name: trip?.driver_name ?? rawTruck?.ten_lai_xe ?? rawTruck?.driver?.full_name ?? rawTruck?.driver?.username ?? null,
        driver_phone: trip?.driver_phone ?? rawTruck?.driver?.phone ?? null,
        carrier_label: split.carrier_label ?? plate ?? rawTruck?.nha_xe ?? rawTruck?.vendor?.name ?? null,
      };
    }
  }

  private mapTripSummary(trip: TripRecord) {
    const truck = trip.truck as Record<string, any> | null | undefined;
    return {
      ...trip,
      driver_name: trip.driver_name ?? truck?.ten_lai_xe ?? truck?.driver?.full_name ?? truck?.driver?.username ?? null,
      driver_phone: trip.driver_phone ?? truck?.driver?.phone ?? null,
      expected_arrival_time: trip.expected_arrival_time ?? trip.arrival_time ?? null,
    };
  }

  private applyFilters(qb: any, query: QueryManifestsDto) {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder.where('manifest.manifest_code ILIKE :keyword', { keyword }).orWhere('manifest.seal_code ILIKE :keyword', { keyword })));
    }
    const statuses = this.parseQueryList(query.status);
    const originHubIds = this.parseQueryList(query.origin_hub_id);
    const destHubIds = this.parseQueryList(query.dest_hub_id);
    const tripIds = this.parseQueryList(query.trip_id);
    if (statuses.length) qb.andWhere('manifest.status IN (:...statuses)', { statuses });
    if (originHubIds.length) qb.andWhere('manifest.origin_hub_id IN (:...originHubIds)', { originHubIds });
    if (destHubIds.length) qb.andWhere('manifest.dest_hub_id IN (:...destHubIds)', { destHubIds });
    if (tripIds.length) qb.andWhere('trip.id IN (:...tripIds)', { tripIds });
    const fromDate = query.from_date ?? query.date_from;
    const toDate = query.to_date ?? query.date_to;
    if (fromDate) qb.andWhere('manifest.created_at >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('manifest.created_at <= :toDate', { toDate });
  }

  private parseQueryList(value?: string | string[]) {
    if (!value) return [];
    const values = Array.isArray(value) ? value : value.split(',');
    return values.map((item) => String(item).trim()).filter(Boolean);
  }

  private applyHubScope(qb: any, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask)) return;
    if (!currentUser.hub_id) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere(new Brackets((builder) => builder.where('manifest.origin_hub_id = :hubId', { hubId: currentUser.hub_id }).orWhere('manifest.dest_hub_id = :hubId', { hubId: currentUser.hub_id })));
  }

  private assertManifestAccess(manifest: ManifestRecord, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask)) return;
    if (!currentUser.hub_id) throw new ForbiddenException('User is not assigned to a hub');
    const userHubId = String(currentUser.hub_id);
    const allowedHubIds = [manifest.origin_hub_id, manifest.dest_hub_id].map((id) => String(id ?? ''));
    if (!allowedHubIds.includes(userHubId)) {
      throw new ForbiddenException('User cannot access this manifest outside assigned hub');
    }
  }

  private async assertHubAccess(hubId: string, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask)) return;
    if (String(currentUser.hub_id ?? '') !== String(hubId)) {
      throw new ForbiddenException('User is not assigned to this hub');
    }
  }

  private async assertActiveHub(hubId: string) {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId, is_active: true, deleted_at: IsNull() } });
    if (!hub) throw new BadRequestException('Hub is missing or inactive');
  }

  private assertDraft(manifest: ManifestRecord) {
    if (manifest.status !== ManifestStatus.DRAFT) throw new ConflictException('Manifest is already closed or locked');
  }

  private assertRemovableManifest(manifest: ManifestRecord) {
    const allowed = [ManifestStatus.DRAFT, ManifestStatus.CLOSED];
    if (!allowed.includes(manifest.status as ManifestStatus)) {
      throw new ConflictException('Cannot remove waybills after manifest is assigned to a trip');
    }
  }

  /** Tự động chuyển chuyến IN_TRANSIT → ARRIVED khi quá expected_arrival_time. */
  private async processScheduledArrivals(): Promise<void> {
    const now = new Date();
    const trips = await this.tripsRepository.find({ where: { status: TripStatus.IN_TRANSIT } as any });
    for (const trip of trips) {
      if (!trip.expected_arrival_time) continue;
      const expected = new Date(trip.expected_arrival_time);
      if (Number.isNaN(expected.getTime()) || expected > now) continue;
      trip.status = TripStatus.ARRIVED;
      trip.arrival_time = trip.arrival_time ?? now;
      await this.tripsRepository.save(trip);
      if (trip.manifest_id) {
        await this.moveManifestWaybills(String(trip.manifest_id), WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB);
      }
    }
  }

  private async moveManifestWaybills(manifestId: string, from: WaybillState, to: WaybillState): Promise<void> {
    const links = await this.manifestWaybillsRepository.find({ where: { manifest_id: manifestId }, relations: ['waybill'] });
    const changed = links
      .map((link) => link.waybill)
      .filter((waybill): waybill is WaybillRecord => Boolean(waybill))
      .filter((waybill) => this.getWaybillStatus(waybill) === from);
    changed.forEach((waybill) => {
      waybill.current_state = to;
      waybill.status = to;
    });
    if (changed.length) await this.waybillsRepository.save(changed as any);
  }

  private async assertCanAddWaybills(manifest: ManifestRecord) {
    const status = manifest.status as ManifestStatus;
    if ([ManifestStatus.DRAFT, ManifestStatus.CLOSED].includes(status)) return;

    if (status === ManifestStatus.ASSIGNED_TO_TRIP) {
      const tripId = manifest.trip_id ?? manifest.trip?.id;
      if (!tripId) return;
      const trip = await this.tripsRepository.findOne({ where: { id: String(tripId) } as any });
      if (trip?.status === TripStatus.PLANNED) return;
    }

    throw new ConflictException('Không thể thêm đơn sau khi xe đã khởi hành');
  }

  private assertWaybillCanBeAdded(manifest: ManifestRecord, waybill: WaybillRecord) {
    const status = this.getWaybillStatus(waybill);
    const allowedStatuses = [WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException('Chỉ thêm được đơn ở trạng thái Đã tạo đơn hoặc Trong kho');
    }
    if (waybill.manifest_id && String(waybill.manifest_id) !== String(manifest.id)) {
      throw new ConflictException('Waybill already belongs to another manifest');
    }
  }

  private extractWaybills(manifest: ManifestRecord): WaybillRecord[] {
    return (manifest.manifest_waybills ?? []).map((link: ManifestWaybillEntity & Record<string, any>) => link.waybill).filter(Boolean) as WaybillRecord[];
  }

  private async refreshTotals(manifest: ManifestRecord, _knownWaybills?: WaybillRecord[], userId?: string) {
    const loaded = await this.loadManifest(manifest.id);
    const waybills = this.extractWaybills(loaded);
    const totals = {
      total_waybills: waybills.length,
      total_weight: waybills.reduce((sum, waybill) => sum + Number(waybill.weight ?? 0), 0),
      total_cod_amount: waybills.reduce((sum, waybill) => sum + Number(waybill.cod_amount ?? 0), 0),
      updated_by: userId ?? manifest.updated_by,
    };
    await this.manifestsRepository.save({ id: loaded.id, ...totals } as any);
    Object.assign(manifest, totals);
  }

  private getWaybillStatus(waybill: WaybillRecord) {
    return waybill.status ?? waybill.current_state;
  }

  private async generateUniqueCode(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const code = `MF-${datePart}-${String(sequence).padStart(3, '0')}`;
      const existing = await this.manifestsRepository.findOne({ where: { manifest_code: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to generate unique manifest code');
  }

  private assertRole(currentUser: UserEntity, roles: number[]) {
    if (!roles.some((role) => (currentUser.role_mask & role) !== 0)) throw new ForbiddenException('Insufficient role permissions');
  }

  private resolveTotalPackages(waybill: WaybillRecord): number {
    const fromWaybill = Number(waybill.package_count ?? 0);
    const fromOrder = Number(waybill.order?.package_count ?? 0);
    return Math.max(1, fromWaybill, fromOrder);
  }

  private async getRemainingPackages(waybill: WaybillRecord): Promise<number> {
    const splits = await this.waybillSplitsRepository.find({ where: { waybill_id: String(waybill.id) } });
    const allocated = splits.reduce((sum, row) => sum + Number(row.package_count ?? 0), 0);
    return this.resolveTotalPackages(waybill) - allocated;
  }

  private computeExpectedArrivalAt(waybill: WaybillRecord): Date {
    const base = waybill.created_at ? new Date(waybill.created_at) : new Date();
    const next = new Date(Number.isNaN(base.getTime()) ? Date.now() : base.getTime());
    next.setDate(next.getDate() + 3);
    return next;
  }
}




