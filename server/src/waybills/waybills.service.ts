import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { CustomerPaymentStatus, PaymentType, TripStatus } from '../common/enums';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { clampPaginationLimit } from '../common/pagination';
import { extractVietnamAddressParts } from '../common/vietnam-address';
import { Roles, hasRole, isManager } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from './waybill.entity';
import { AssignWaybillPriorityDto } from './dto/assign-waybill-priority.dto';
import { AssignWaybillRouteDto } from './dto/assign-waybill-route.dto';
import { CancelWaybillDto } from './dto/cancel-waybill.dto';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { CreateWaybillCashVoucherDto } from './dto/create-waybill-cash-voucher.dto';
import { QueryWaybillCashVouchersDto } from './dto/query-waybill-cash-vouchers.dto';
import { QueryWaybillsDto } from './dto/query-waybills.dto';
import { ReceiveWaybillDto } from './dto/receive-waybill.dto';
import { UpdateCodFeeDto } from './dto/update-cod-fee.dto';
import { UpdateWaybillStatusDto } from './dto/update-waybill-status.dto';
import { UpdateWaybillDto } from './dto/update-waybill.dto';
import { WaybillPriority, WaybillStatus } from './dto/waybill.enums';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { BulkStackOntoTruckDto } from './dto/bulk-stack-onto-truck.dto';
import { BulkUpdateCustomerPaymentStatusDto } from './dto/bulk-update-customer-payment-status.dto';
import { SaveWaybillSplitsDto } from './dto/save-waybill-splits.dto';
import { QueryLoadPlanningBoardDto } from './dto/query-load-planning-board.dto';
import { UpdateSplitLoadStatusDto } from './dto/update-split-load-status.dto';
import { assertSplitLoadStatusTransition, WaybillSplitLoadStatus } from './dto/waybill-split-load-status.enum';
import { OrdersService } from '../orders/orders.service';
import { OrderEntity } from '../orders/order.entity';
import { VendorsService } from '../vendors/vendors.service';
import { normalizeWaybillPhotos } from '../common/waybill-photos';
import { UpdateWaybillPhotosDto } from './dto/update-waybill-photos.dto';

type WaybillRecord = WaybillEntity & Record<string, any>;

const FINAL_STATUSES = [WaybillStatus.DELIVERED, WaybillStatus.RETURNED, WaybillStatus.CANCELLED];
const INVENTORY_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.MANIFEST_CLOSED, WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY];
const ALL_ORDER_LIST_STATUSES = [
  WaybillStatus.RECEIVED,
  WaybillStatus.IN_WAREHOUSE,
  WaybillStatus.MANIFEST_CLOSED,
  WaybillStatus.LOADED,
  WaybillStatus.IN_TRANSIT,
  WaybillStatus.AT_DEST_HUB,
  WaybillStatus.OUT_FOR_DELIVERY,
  WaybillStatus.DELIVERED,
  WaybillStatus.RETURNED,
];
const MUTABLE_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE];
const ROUTE_ASSIGNABLE_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.AT_DEST_HUB];
const parseNoteField = (note: string | null | undefined, key: string) => {
  const match = (note || '').match(new RegExp(`${key}=([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
};

const plainGoodsNote = (note: string | null | undefined) => {
  const text = (note || '').trim();
  if (!text || /(^|\|)\s*[a-z_]+\s*=/i.test(text)) return '';
  return text;
};

const STATE_TRANSITIONS: Record<string, WaybillStatus[]> = {
  [WaybillStatus.RECEIVED]: [WaybillStatus.IN_WAREHOUSE, WaybillStatus.MANIFEST_CLOSED],
  [WaybillStatus.IN_WAREHOUSE]: [WaybillStatus.MANIFEST_CLOSED],
  [WaybillStatus.MANIFEST_CLOSED]: [WaybillStatus.LOADED],
  [WaybillStatus.LOADED]: [WaybillStatus.IN_TRANSIT],
  [WaybillStatus.IN_TRANSIT]: [WaybillStatus.AT_DEST_HUB],
  [WaybillStatus.AT_DEST_HUB]: [WaybillStatus.OUT_FOR_DELIVERY, WaybillStatus.DELIVERED],
  [WaybillStatus.OUT_FOR_DELIVERY]: [WaybillStatus.DELIVERED, WaybillStatus.RETURNED],
};

@Injectable()
export class WaybillsService {
  constructor(
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(WaybillSplitEntity) private readonly splitsRepository: Repository<WaybillSplitEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
    @InjectRepository(ManifestWaybillEntity) private readonly manifestWaybillsRepository: Repository<ManifestWaybillEntity>,
    @InjectRepository(WaybillCashVoucherEntity) private readonly cashVouchersRepository: Repository<WaybillCashVoucherEntity>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly vendorsService: VendorsService,
  ) {}

  async create(dto: CreateWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    await this.assertHubAccess(dto.origin_hub_id, currentUser);
    await this.assertActiveHub(dto.origin_hub_id);
    await this.assertActiveHub(dto.dest_hub_id);

    const originHub = await this.getActiveHub(dto.origin_hub_id);
    const waybillCode = await this.resolveWaybillCode(dto.waybill_code, originHub.code);
    const order = await this.ordersService.createFromWaybillEntry(dto, currentUser);
    const record = this.waybillsRepository.create({
      waybill_code: waybillCode,
      sender_info: this.packContact(dto.sender_name, dto.sender_phone, dto.sender_address),
      receiver_info: this.packContact(dto.receiver_name, dto.receiver_phone, dto.receiver_address),
      weight: dto.weight,
      length: dto.length ?? 0,
      width: dto.width ?? 0,
      height: dto.height ?? 0,
      volumetric_weight: dto.volumetric_weight ?? 0,
      the_tich_m3: dto.the_tich_m3 ?? null,
      payment_type: this.resolvePaymentType(dto),
      cost_amount: String(dto.freight_amount ?? 0),
      current_state: WaybillStatus.RECEIVED as any,
      origin_hub_id: dto.origin_hub_id,
      dest_hub_id: dto.dest_hub_id,
      last_mile_driver_id: null,
      delivery_photo_url: normalizeWaybillPhotos(dto.delivery_photo_url),
      delivery_time: null,
    } as any) as unknown as WaybillRecord;

    Object.assign(record, {
      sender_name: dto.sender_name,
      sender_phone: dto.sender_phone,
      sender_address: dto.sender_address,
      receiver_name: dto.receiver_name,
      receiver_phone: dto.receiver_phone,
      receiver_address: dto.receiver_address,
      current_hub_id: dto.origin_hub_id,
      priority: WaybillPriority.NORMAL,
      cod_amount: dto.cod_amount ?? 0,
      freight_amount: dto.freight_amount ?? 0,
      cc_amount: dto.cc_amount ?? 0,
      package_count: dto.package_count ?? 1,
      note: dto.note ?? null,
      noi_dung: dto.noi_dung?.trim() || parseNoteField(dto.note, 'content') || null,
      ma_kh: parseNoteField(dto.note, 'ma_kh') || null,
      noi_den: dto.noi_den?.trim() || parseNoteField(dto.note, 'tinh_den') || parseNoteField(dto.note, 'huyen') || null,
      xe_lay: dto.xe_lay?.trim() || null,
      xe_phat: dto.xe_phat?.trim() || null,
      expected_delivery_at: dto.expected_delivery_at ? new Date(dto.expected_delivery_at) : null,
      received_at: null,
      received_by: null,
      created_by: currentUser.id,
      order_id: order.id,
    });

    try {
      const saved = await this.waybillsRepository.save(record);
      return this.sanitize({ ...saved, order } as WaybillRecord, currentUser);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Waybill code already exists');
      throw error;
    }
  }

  async findAll(query: QueryWaybillsDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.waybillsRepository.createQueryBuilder('waybill').where('waybill.deleted_at IS NULL').leftJoinAndSelect('waybill.origin_hub', 'origin_hub').leftJoinAndSelect('waybill.dest_hub', 'dest_hub').leftJoinAndSelect('waybill.order', 'order');
    this.applyFilters(qb, query);
    this.applyHubScope(qb, currentUser);
    const [items, total] = await qb.orderBy('waybill.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: items.map((item) => this.sanitize(item as WaybillRecord, currentUser)), meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.waybillsRepository.findOne({ where: { id, deleted_at: IsNull() } as any, relations: ['origin_hub', 'dest_hub'] }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    return this.sanitize(waybill, currentUser);
  }

  async update(id: string, dto: UpdateWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    const patch: UpdateWaybillDto = { ...dto };
    const requestedOriginHubId = patch.origin_hub_id !== undefined ? String(patch.origin_hub_id) : null;
    const requestedDestHubId = patch.dest_hub_id !== undefined ? String(patch.dest_hub_id) : null;
    const originChanged = requestedOriginHubId !== null && requestedOriginHubId !== String(waybill.origin_hub_id);
    const destChanged = requestedDestHubId !== null && requestedDestHubId !== String(waybill.dest_hub_id);

    if (patch.delivery_photo_url !== undefined) {
      const normalizedPhotos = normalizeWaybillPhotos(patch.delivery_photo_url);
      if (normalizedPhotos) patch.delivery_photo_url = normalizedPhotos;
      else {
        waybill.delivery_photo_url = null;
        delete patch.delivery_photo_url;
      }
    }

    let originHub: HubEntity | null = null;
    let destHub: HubEntity | null = null;
    if (requestedOriginHubId !== null) {
      originHub = await this.getActiveHub(requestedOriginHubId);
      if (originChanged) {
        await this.assertHubAccess(requestedOriginHubId, currentUser);
        await this.assertOriginChangeIsUnallocated(id);
      }
      patch.origin_hub_id = requestedOriginHubId;
    }
    if (requestedDestHubId !== null) {
      destHub = await this.getActiveHub(requestedDestHubId);
      patch.dest_hub_id = requestedDestHubId;
    }

    if (patch.waybill_code !== undefined) {
      const originHubCode = originHub
        ? originHub.code
        : waybill.origin_hub?.code
          ?? (await this.getActiveHub(String(waybill.origin_hub_id))).code;
      const normalized = this.normalizeWaybillCode(patch.waybill_code, originHubCode);
      if (normalized !== waybill.waybill_code) {
        await this.assertUniqueWaybillCode(normalized, id);
        waybill.waybill_code = normalized;
      }
      delete patch.waybill_code;
    }

    Object.assign(waybill, patch, { updated_by: currentUser.id });
    if (originHub) waybill.origin_hub = originHub;
    if (destHub) waybill.dest_hub = destHub;
    if (patch.freight_amount !== undefined) waybill.cost_amount = String(patch.freight_amount);
    if (patch.note !== undefined || patch.cc_amount !== undefined || patch.cod_amount !== undefined) {
      waybill.payment_type = this.resolvePaymentType({ ...waybill, ...patch } as CreateWaybillDto);
    }
    if (patch.sender_name || patch.sender_phone || patch.sender_address) {
      waybill.sender_info = this.packContact(waybill.sender_name, waybill.sender_phone, waybill.sender_address);
    }
    if (patch.receiver_name || patch.receiver_phone || patch.receiver_address) {
      waybill.receiver_info = this.packContact(waybill.receiver_name, waybill.receiver_phone, waybill.receiver_address);
    }
    if (patch.note !== undefined) {
      waybill.ma_kh = parseNoteField(patch.note, 'ma_kh') || waybill.ma_kh;
      waybill.noi_dung = patch.noi_dung?.trim() || parseNoteField(patch.note, 'content') || waybill.noi_dung;
    }
    if (patch.noi_dung !== undefined) {
      waybill.noi_dung = patch.noi_dung.trim() || null;
    }
    if (patch.noi_den !== undefined || patch.note !== undefined) {
      waybill.noi_den = patch.noi_den?.trim()
        || parseNoteField(patch.note, 'tinh_den')
        || parseNoteField(patch.note, 'huyen')
        || waybill.noi_den;
    }

    const saved = destChanged && requestedDestHubId
      ? await this.rerouteDestinationBeforeDeparture(
          id,
          requestedDestHubId,
          currentUser,
          waybill,
          originChanged,
        )
      : await this.waybillsRepository.save(waybill);
    if (!destChanged && originChanged && saved.order_id) {
      await this.ordersService.syncRoutingFromWaybill(String(saved.order_id), {
        origin_hub_id: String(saved.origin_hub_id),
      });
    }
    return this.sanitize(saved, currentUser);
  }

  async receive(id: string, dto: ReceiveWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (this.getStatus(waybill) !== WaybillStatus.RECEIVED) throw new BadRequestException('Only RECEIVED waybills can be received');
    const receiveHubId = currentUser.hub_id ?? waybill.origin_hub_id;
    await this.assertHubAccess(receiveHubId, currentUser);
    this.setStatus(waybill, WaybillStatus.IN_WAREHOUSE);
    Object.assign(waybill, { current_hub_id: receiveHubId, delivery_photo_url: normalizeWaybillPhotos(dto.delivery_photo_url), received_at: new Date(), received_by: currentUser.id, updated_by: currentUser.id });
    return this.saveWithAudit(waybill, currentUser, 'RECEIVE');
  }

  async updateStatus(id: string, dto: UpdateWaybillStatusDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    const currentStatus = this.getStatus(waybill);
    if (!STATE_TRANSITIONS[currentStatus]?.includes(dto.status)) throw new BadRequestException('Invalid waybill state transition');
    if (dto.status === WaybillStatus.DELIVERED && !dto.delivery_photo_url && !waybill.delivery_photo_url) throw new BadRequestException('Delivery photo is required');
    this.setStatus(waybill, dto.status);
    Object.assign(waybill, { updated_by: currentUser.id, note: dto.note ?? waybill.note });
    if (dto.delivery_photo_url) waybill.delivery_photo_url = normalizeWaybillPhotos(dto.delivery_photo_url);
    if (dto.status === WaybillStatus.DELIVERED) Object.assign(waybill, { delivered_at: new Date(), delivery_time: new Date() });
    if (dto.status === WaybillStatus.RETURNED) waybill.returned_at = new Date();
    return this.saveWithAudit(waybill, currentUser, 'STATUS_CHANGE');
  }

  async updatePhotos(id: string, dto: UpdateWaybillPhotosDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    waybill.delivery_photo_url = normalizeWaybillPhotos(dto.delivery_photo_url);
    waybill.updated_by = currentUser.id;
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  async assignPriority(id: string, dto: AssignWaybillPriorityDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (FINAL_STATUSES.includes(this.getStatus(waybill))) throw new BadRequestException('Finalized waybills cannot change priority');
    if (dto.priority === WaybillPriority.URGENT && !(dto.reason || dto.note)) throw new BadRequestException('URGENT priority requires a reason');
    Object.assign(waybill, { priority: dto.priority, priority_reason: dto.reason ?? dto.note ?? null, updated_by: currentUser.id });
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  async assignRoute(id: string, dto: AssignWaybillRouteDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    const currentStatus = this.getStatus(waybill);
    if (!ROUTE_ASSIGNABLE_STATUSES.includes(currentStatus)) {
      throw new BadRequestException('Route can only be assigned in warehouse or destination hub');
    }
    if (!dto.route_code?.trim()) throw new BadRequestException('Route code is required');
    if (currentStatus === WaybillStatus.RECEIVED) {
      this.setStatus(waybill, WaybillStatus.IN_WAREHOUSE);
      Object.assign(waybill, {
        current_hub_id: waybill.current_hub_id ?? waybill.origin_hub_id,
        received_at: waybill.received_at ?? new Date(),
        received_by: waybill.received_by ?? currentUser.id,
      });
    }
    Object.assign(waybill, { route_code: dto.route_code.trim(), note: dto.note ?? waybill.note, updated_by: currentUser.id });
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  async updateCodFee(id: string, dto: UpdateCodFeeDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if ([dto.cod_amount, dto.freight_amount, dto.cc_amount].some((value) => value !== undefined && value < 0)) throw new BadRequestException('COD and fee amounts cannot be negative');
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill)) && !this.hasAnyRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR])) throw new ForbiddenException('Insufficient role permissions to update locked fees');
    Object.assign(waybill, { ...dto, updated_by: currentUser.id });
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  async cancel(id: string, dto: CancelWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) throw new BadRequestException('Only RECEIVED or IN_WAREHOUSE waybills can be cancelled');
    this.setStatus(waybill, WaybillStatus.CANCELLED);
    Object.assign(waybill, { cancelled_at: new Date(), cancel_reason: dto.reason, updated_by: currentUser.id });
    return this.saveWithAudit(waybill, currentUser, 'CANCEL');
  }

  async softDelete(id: string, currentUser: UserEntity): Promise<void> {
    const waybill = await this.findMutable(id, currentUser);
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) throw new BadRequestException('Cannot delete operated waybill');
    Object.assign(waybill, { deleted_at: new Date(), updated_by: currentUser.id });
    await this.waybillsRepository.save(waybill);
  }

  async getByCode(code: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const rawCode = code.trim();
    const compactCode = rawCode.toUpperCase().replace(/[-\s]+/g, '');
    const candidates = [...new Set([
      rawCode,
      rawCode.toUpperCase(),
      ...this.getEquivalentWaybillCodes(compactCode),
    ])];
    const waybill = await this.waybillsRepository.findOne({
      where: candidates.map((waybillCode) => ({
        waybill_code: waybillCode,
        deleted_at: IsNull(),
      })) as any,
      relations: ['origin_hub', 'dest_hub'],
    }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    return this.sanitize(waybill, currentUser);
  }

  getInventory(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({
      ...query,
      status: query.status ?? INVENTORY_STATUSES.join(','),
      current_hub_id: this.resolveInventoryHubFilter(query, currentUser),
    }, currentUser);
  }

  async getInventoryTripLines(query: QueryWaybillsDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const defaultStatuses = query.list_scope === 'all_orders'
      ? ALL_ORDER_LIST_STATUSES.join(',')
      : INVENTORY_STATUSES.join(',');
    const inventoryQuery = {
      ...query,
      status: query.status ?? defaultStatuses,
      current_hub_id: this.resolveInventoryHubFilter(query, currentUser),
      page,
      limit,
    };

    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .where('waybill.deleted_at IS NULL')
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .leftJoinAndSelect('waybill.order', 'order');
    this.applyFilters(qb, inventoryQuery);
    this.applyHubScope(qb, currentUser);

    const vendorId = query.vendor_id?.trim();
    if (vendorId) {
      qb.distinct(true)
        .innerJoin('waybill_splits', 'vendor_split', 'vendor_split.waybill_id = waybill.id')
        .leftJoin('trucks', 'vendor_split_truck', 'vendor_split_truck.id = vendor_split.truck_id')
        .leftJoin('trips', 'vendor_split_trip', 'vendor_split_trip.id = vendor_split.trip_id')
        .leftJoin('trucks', 'vendor_trip_truck', 'vendor_trip_truck.id = vendor_split_trip.truck_id')
        .andWhere(
          '(vendor_split_truck.vendor_id = :vendorId OR vendor_trip_truck.vendor_id = :vendorId)',
          { vendorId },
        );
    }

    this.applyIncompleteSplitFilter(qb, query.only_incomplete_split);

    const onlyIncompleteSplit = this.isTruthyQueryFlag(query.only_incomplete_split);
    const needsSplits = Boolean(vendorId) || onlyIncompleteSplit || query.list_scope !== 'all_orders';
    const includeFreightTotal = isManager(currentUser.role_mask);

    const loadSummary = async () => {
      if (vendorId) {
        const [freightRow, totalWaybills] = await Promise.all([
          includeFreightTotal
            ? qb.clone()
              .select('COALESCE(SUM(COALESCE(waybill.freight_amount, waybill.cost_amount, 0)), 0)', 'total_freight')
              .getRawOne<{ total_freight: string }>()
            : Promise.resolve(null),
          qb.clone().getCount(),
        ]);
        return {
          totalWaybills,
          totalFreight: includeFreightTotal ? Number(freightRow?.total_freight) || 0 : undefined,
        };
      }

      const summaryQb = qb.clone()
        .select('COUNT(DISTINCT waybill.id)', 'total_waybills');
      if (includeFreightTotal) {
        summaryQb.addSelect(
          'COALESCE(SUM(COALESCE(waybill.freight_amount, waybill.cost_amount, 0)), 0)',
          'total_freight',
        );
      }
      const summary = await summaryQb.getRawOne<{ total_waybills: string; total_freight?: string }>();
      return {
        totalWaybills: Number(summary?.total_waybills) || 0,
        totalFreight: includeFreightTotal ? Number(summary?.total_freight) || 0 : undefined,
      };
    };

    const [summary, waybills] = await Promise.all([
      loadSummary(),
      qb.clone()
        .orderBy('waybill.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
    ]);
    const { totalWaybills, totalFreight } = summary;

    const waybillIds = waybills.map((waybill) => waybill.id);
    const splits = needsSplits && waybillIds.length
      ? onlyIncompleteSplit && !vendorId
        ? await this.splitsRepository.find({
          select: {
            id: true,
            waybill_id: true,
            package_count: true,
          },
          where: { waybill_id: In(waybillIds) },
        })
        : await this.splitsRepository.find({
          where: { waybill_id: In(waybillIds) },
          relations: ['trip', 'trip.truck', 'truck'],
          order: { loading_position: 'ASC', id: 'ASC' },
        })
      : [];

    const splitsByWaybill = splits.reduce<Map<string, WaybillSplitEntity[]>>((map, row) => {
      if (vendorId && !this.splitBelongsToVendor(row, vendorId)) return map;
      const list = map.get(row.waybill_id) ?? [];
      list.push(row);
      map.set(row.waybill_id, list);
      return map;
    }, new Map());

    const items = waybills.flatMap((waybill) => {
      const sanitized = this.sanitize(waybill as WaybillRecord, currentUser);
      const waybillSplits = splitsByWaybill.get(waybill.id) ?? [];

      if (onlyIncompleteSplit) {
        const totalPackages = this.resolveTotalPackages(waybill as WaybillRecord);
        const allocated = waybillSplits.reduce((sum, row) => sum + Number(row.package_count ?? 0), 0);
        const remaining = totalPackages - allocated;
        if (remaining <= 0) return [];
        return [this.mapInventoryTripLine(sanitized, null, remaining)];
      }

      if (!waybillSplits.length) {
        return vendorId ? [] : [this.mapInventoryTripLine(sanitized, null)];
      }
      return waybillSplits.map((split) => this.mapInventoryTripLine(sanitized, split));
    });

    return {
      items,
      meta: {
        total: totalWaybills,
        total_waybills: totalWaybills,
        total_lines: items.length,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(totalWaybills / limit)),
        only_incomplete_split: onlyIncompleteSplit,
        total_freight: totalFreight,
      },
    };
  }

  getIncoming(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, dest_hub_id: query.dest_hub_id ?? currentUser.hub_id ?? undefined }, currentUser);
  }

  getOverdue(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, to_date: new Date().toISOString() }, currentUser);
  }

  async bulkUpdateCustomerPaymentStatus(dto: BulkUpdateCustomerPaymentStatusDto, _currentUser: UserEntity) {
    const ids = [...new Set((dto.waybill_ids ?? []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('waybill_ids is required');

    const rows = await this.waybillsRepository.find({
      where: { id: In(ids), deleted_at: IsNull() } as any,
      select: ['id', 'customer_payment_status', 'customer_payment_note'],
    }) as WaybillRecord[];
    if (rows.length !== ids.length) throw new NotFoundException('One or more waybills not found');

    const status = dto.status ?? null;
    const note = dto.note?.trim() || null;
    for (const row of rows) {
      row.customer_payment_status = status;
      row.customer_payment_note = note;
    }
    await this.waybillsRepository.save(rows);

    return {
      updated_count: rows.length,
      waybill_ids: rows.map((row) => row.id),
      status,
    };
  }

  async getPackageSplits(id: string, currentUser: UserEntity) {
    const waybill = await this.waybillsRepository.findOne({
      where: { id, deleted_at: IsNull() } as any,
      relations: ['origin_hub', 'dest_hub', 'order'],
    }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    const sanitized = this.sanitize(waybill, currentUser);
    const splits = await this.splitsRepository.find({
      where: { waybill_id: id },
      relations: ['trip', 'trip.truck', 'truck'],
      order: { loading_position: 'ASC', id: 'ASC' },
    });
    return this.buildSplitResponse(sanitized as WaybillRecord, splits);
  }

  async listCashVouchersForWaybill(waybillId: string, currentUser: UserEntity) {
    await this.findOne(waybillId, currentUser);
    return this.cashVouchersRepository.find({
      where: { waybill_id: waybillId },
      order: { created_at: 'DESC' },
    });
  }

  async createCashVoucher(waybillId: string, dto: CreateWaybillCashVoucherDto, currentUser: UserEntity) {
    const waybill = await this.findOne(waybillId, currentUser);
    const record = this.cashVouchersRepository.create({
      waybill_id: waybill.id,
      waybill_code: waybill.waybill_code,
      voucher_type: dto.voucher_type,
      amount: String(dto.amount),
      note: dto.note?.trim() || null,
      image_url: dto.image_url?.trim() || null,
      created_by_id: currentUser.id,
      created_by_name: currentUser.full_name?.trim() || currentUser.username,
    });
    return this.cashVouchersRepository.save(record);
  }

  async searchCashVouchers(query: QueryWaybillCashVouchersDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 200);

    const qb = this.cashVouchersRepository.createQueryBuilder('voucher')
      .innerJoinAndSelect('voucher.waybill', 'waybill')
      .where('waybill.deleted_at IS NULL');

    this.applyHubScope(qb, currentUser);

    if (query.ma_kh?.trim()) {
      const maKh = query.ma_kh.trim();
      qb.andWhere(new Brackets((builder) => builder
        .where('UPPER(TRIM(waybill.ma_kh)) = UPPER(TRIM(:maKh))', { maKh })
        .orWhere('waybill.note ILIKE :maKhNotePattern', { maKhNotePattern: `%ma_kh=${maKh}%` })));
    }

    if (query.keyword?.trim()) {
      const rawKeyword = query.keyword.trim();
      const keyword = `%${rawKeyword}%`;
      const normalizedWaybillKeyword = this.normalizeWaybillSearchKeyword(rawKeyword);
      qb.andWhere(new Brackets((builder) => {
        builder
          .where('voucher.waybill_code ILIKE :keyword', { keyword })
          .orWhere('waybill.waybill_code ILIKE :keyword', { keyword })
          .orWhere('waybill.ma_kh ILIKE :keyword', { keyword })
          .orWhere('voucher.note ILIKE :keyword', { keyword });
        if (normalizedWaybillKeyword) {
          builder
            .orWhere(
              `REGEXP_REPLACE(UPPER(voucher.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
              { normalizedWaybillKeyword },
            )
            .orWhere(
              `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
              { normalizedWaybillKeyword },
            );
        }
      }));
    }

    if (query.voucher_type) {
      qb.andWhere('voucher.voucher_type = :voucherType', { voucherType: query.voucher_type });
    }
    if (query.from_date) {
      qb.andWhere('voucher.created_at >= :fromDate', { fromDate: query.from_date });
    }
    if (query.to_date) {
      qb.andWhere(`voucher.created_at < (:toDate::date + interval '1 day')`, { toDate: query.to_date });
    }

    const totalsQb = qb.clone();
    const totalsRaw = await totalsQb
      .select('voucher.voucher_type', 'voucher_type')
      .addSelect('COALESCE(SUM(voucher.amount), 0)', 'sum_amount')
      .groupBy('voucher.voucher_type')
      .getRawMany<{ voucher_type: string; sum_amount: string }>();

    let totalThu = 0;
    let totalChi = 0;
    for (const row of totalsRaw) {
      const amount = Number(row.sum_amount) || 0;
      if (String(row.voucher_type).toLowerCase() === 'thu') totalThu += amount;
      else if (String(row.voucher_type).toLowerCase() === 'chi') totalChi += amount;
    }

    const [items, total] = await qb
      .orderBy('voucher.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        total_thu: totalThu,
        total_chi: totalChi,
        net: totalThu - totalChi,
      },
    };
  }

  async savePackageSplits(id: string, dto: SaveWaybillSplitsDto, currentUser: UserEntity) {
    const waybill = await this.findMutable(id, currentUser);
    if (FINAL_STATUSES.includes(this.getStatus(waybill))) {
      throw new BadRequestException('Cannot split a finalized waybill');
    }

    const waybillWithOrder = await this.waybillsRepository.findOne({
      where: { id, deleted_at: IsNull() } as any,
      relations: ['order'],
    });
    const totalPackages = this.resolveTotalPackages((waybillWithOrder ?? waybill) as WaybillRecord);
    const allocated = dto.splits.reduce((sum, line) => sum + line.package_count, 0);
    if (allocated > totalPackages) {
      throw new BadRequestException(`Allocated packages (${allocated}) exceed order total (${totalPackages})`);
    }

    for (const line of dto.splits) {
      if (!line.trip_id && !line.truck_id) {
        throw new BadRequestException('Each split line requires trip_id or truck_id');
      }
      if (line.trip_id) {
        const trip = await this.tripsRepository.findOne({ where: { id: String(line.trip_id) }, relations: ['truck'] });
        if (!trip) throw new NotFoundException(`Trip ${line.trip_id} not found`);
        if (!line.truck_id && trip.truck_id) line.truck_id = trip.truck_id;
        if (!line.carrier_label?.trim()) {
          line.carrier_label = trip.truck?.nha_xe ?? trip.truck?.license_plate ?? trip.driver_name ?? undefined;
        }
      }
      if (line.truck_id) {
        const truck = await this.trucksRepository.findOne({ where: { id: String(line.truck_id) } });
        if (!truck) throw new NotFoundException(`Truck ${line.truck_id} not found`);
        if (!line.carrier_label?.trim()) {
          line.carrier_label = truck.nha_xe ?? truck.license_plate ?? truck.bks ?? undefined;
        }
      }
    }

    const existingRows = await this.splitsRepository.find({ where: { waybill_id: id } });
    const statusById = new Map(existingRows.map((row) => [String(row.id), row.load_status]));

    await this.splitsRepository.delete({ waybill_id: id });
    const rows = dto.splits.map((line) => this.splitsRepository.create({
      waybill_id: id,
      trip_id: line.trip_id ? String(line.trip_id) : null,
      truck_id: line.truck_id ? String(line.truck_id) : null,
      package_count: line.package_count,
      loading_position: line.loading_position ?? null,
      carrier_label: line.carrier_label?.trim() || null,
      note: line.note?.trim() || null,
      load_status: line.load_status
        ?? (line.id ? statusById.get(String(line.id)) : null)
        ?? WaybillSplitLoadStatus.WAITING_LOAD,
      expected_arrival_at: line.expected_arrival_at
        ? new Date(line.expected_arrival_at)
        : null,
      created_by: currentUser.id,
    }));
    if (rows.length) await this.splitsRepository.save(rows);

    return this.getPackageSplits(id, currentUser);
  }

  async bulkStackOntoTruck(dto: BulkStackOntoTruckDto, currentUser: UserEntity) {
    const vendorCostSubmitted = dto.vendor_cost != null
      || dto.items.some((line) => line.vendor_cost != null);
    if (vendorCostSubmitted && !isManager(currentUser.role_mask)) {
      throw new ForbiddenException('Only managers can assign vendor cost');
    }
    const requestedWaybillIds = dto.items.map((line) => String(line.waybill_id));
    if (new Set(requestedWaybillIds).size !== requestedWaybillIds.length) {
      throw new BadRequestException('Each waybill can only appear once in a stack request');
    }

    const saved: Array<Record<string, unknown>> = [];
    const stackDepartureTime = new Date();
    const sharedVendorCostProvided = dto.vendor_cost != null;
    const sharedVendorCost = sharedVendorCostProvided
      ? this.normalizeStackVendorCost(dto.vendor_cost!)
      : 0;
    const legacyVendorCosts = dto.items.map((line) => (
      line.vendor_cost != null ? this.normalizeStackVendorCost(line.vendor_cost) : 0
    ));
    const truckIds = [...new Set(dto.items.map((line) => String(line.truck_id)))];
    if (sharedVendorCostProvided && truckIds.length !== 1) {
      throw new BadRequestException('Shared vendor cost requires all waybills to use the same truck');
    }

    const selectedVendorId = dto.vendor_id?.trim() || null;
    const selectedVendor = selectedVendorId
      ? await this.vendorsService.findOne(selectedVendorId)
      : null;
    if (selectedVendor?.status && selectedVendor.status.toUpperCase() !== 'ACTIVE') {
      throw new BadRequestException('Selected vendor is not active');
    }
    const trucksById = new Map<string, TruckEntity>();
    const trucksPendingVendorLink: TruckEntity[] = [];
    for (const truckId of truckIds) {
      const truck = await this.trucksRepository.findOne({
        where: { id: truckId },
        relations: ['vendor'],
      });
      if (!truck) throw new NotFoundException(`Truck ${truckId} not found`);

      if (selectedVendorId && selectedVendor) {
        const currentVendorId = truck.vendor_id ? String(truck.vendor_id) : null;
        if (currentVendorId && currentVendorId !== selectedVendorId) {
          throw new BadRequestException(`Truck ${truckId} is assigned to a different vendor`);
        }
        if (!currentVendorId) {
          truck.vendor_id = selectedVendorId;
          truck.vendor = selectedVendor;
          truck.nha_xe = truck.nha_xe?.trim() || selectedVendor.name?.trim() || null;
          trucksPendingVendorLink.push(truck);
        } else if (!truck.vendor) {
          truck.vendor = selectedVendor;
        }
      }
      trucksById.set(truckId, truck);
    }

    const stackedRows: Array<{
      waybill: WaybillRecord;
      loading_position: number | null;
      package_count: number;
      split_id: string;
      expected_arrival_at: Date | null;
      truck_id: string;
      vendor_id: string | null;
      vendor_cost: number;
      license_plate: string | null;
    }> = [];
    const preparedRows: Array<{
      line: BulkStackOntoTruckDto['items'][number];
      line_index: number;
      waybill: WaybillRecord;
      truck: TruckEntity;
      package_count: number;
      total_packages: number;
      expected_arrival_at: Date;
      carrier_label: string | null;
    }> = [];

    for (const [lineIndex, line] of dto.items.entries()) {
      const waybill = await this.waybillsRepository.findOne({
        where: { id: String(line.waybill_id), deleted_at: IsNull() } as any,
        relations: ['order', 'origin_hub', 'dest_hub'],
      }) as WaybillRecord | null;
      if (!waybill) throw new NotFoundException(`Waybill ${line.waybill_id} not found`);
      this.assertWaybillAccess(waybill, currentUser);
      if (FINAL_STATUSES.includes(this.getStatus(waybill))) {
        throw new BadRequestException(`Waybill ${waybill.waybill_code} cannot be stacked`);
      }

      const truck = trucksById.get(String(line.truck_id));
      if (!truck) throw new NotFoundException(`Truck ${line.truck_id} not found`);

      const existingSplits = await this.splitsRepository.find({ where: { waybill_id: String(line.waybill_id) } });
      const totalPackages = this.resolveTotalPackages(waybill);
      const allocated = existingSplits.reduce((sum, row) => sum + Number(row.package_count ?? 0), 0);
      const remaining = totalPackages - allocated;
      const packageCount = line.package_count ?? remaining;
      if (packageCount <= 0) {
        throw new BadRequestException(`Waybill ${waybill.waybill_code} has no remaining packages to stack`);
      }
      if (allocated + packageCount > totalPackages) {
        throw new BadRequestException(`Waybill ${waybill.waybill_code}: allocated packages exceed order total`);
      }

      const expectedArrivalAt = this.resolveStackExpectedArrivalAt(
        stackDepartureTime,
        line.expected_arrival_at,
      );
      const carrierLabel = truck.nha_xe?.trim()
        || truck.vendor?.name?.trim()
        || truck.bks?.trim()
        || truck.license_plate?.trim()
        || null;

      preparedRows.push({
        line,
        line_index: lineIndex,
        waybill,
        truck,
        package_count: packageCount,
        total_packages: totalPackages,
        expected_arrival_at: expectedArrivalAt,
        carrier_label: carrierLabel,
      });
    }

    for (const truck of trucksPendingVendorLink) {
      await this.trucksRepository.save(truck);
    }

    for (const prepared of preparedRows) {
      const {
        line,
        line_index: lineIndex,
        waybill,
        truck,
        package_count: packageCount,
        total_packages: totalPackages,
        expected_arrival_at: expectedArrivalAt,
        carrier_label: carrierLabel,
      } = prepared;

      const split = await this.splitsRepository.save(this.splitsRepository.create({
        waybill_id: String(line.waybill_id),
        truck_id: String(line.truck_id),
        package_count: packageCount,
        loading_position: line.loading_position ?? null,
        carrier_label: carrierLabel,
        note: line.note?.trim() || null,
        expected_arrival_at: expectedArrivalAt,
        load_status: WaybillSplitLoadStatus.LOADED,
        created_by: currentUser.id,
      }));

      const legacyVendorCost = legacyVendorCosts[lineIndex];
      const vendorDebtAmount = legacyVendorCost > 0
        ? legacyVendorCost
        : undefined;

      const ratio = packageCount / totalPackages;
      const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
      saved.push({
        split_id: split.id,
        waybill_id: split.waybill_id,
        waybill_code: waybill.waybill_code,
        truck_id: split.truck_id,
        license_plate: truck.bks ?? truck.license_plate ?? null,
        nha_xe: carrierLabel,
        loading_position: split.loading_position,
        package_count: split.package_count,
        expected_arrival_at: split.expected_arrival_at,
        ...(isManager(currentUser.role_mask) ? { vendor_cost: vendorDebtAmount } : {}),
        allocated_freight: isManager(currentUser.role_mask) ? Math.round(totalFreight * ratio) : undefined,
      });
      stackedRows.push({
        waybill,
        loading_position: split.loading_position,
        package_count: Number(split.package_count),
        split_id: String(split.id),
        expected_arrival_at: split.expected_arrival_at,
        truck_id: String(line.truck_id),
        vendor_id: truck.vendor_id ? String(truck.vendor_id) : null,
        vendor_cost: vendorDebtAmount ?? 0,
        license_plate: truck.bks ?? truck.license_plate ?? null,
      });
    }

    const routeGroups = [...stackedRows.reduce((groups, row) => {
      const key = [
        String(row.truck_id),
        String(row.waybill.origin_hub_id),
        String(row.waybill.dest_hub_id),
      ].join(':');
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
      return groups;
    }, new Map<string, typeof stackedRows>()).values()].sort((left, right) => {
      const leftKey = [left[0].truck_id, left[0].waybill.origin_hub_id, left[0].waybill.dest_hub_id]
        .map(String)
        .join(':');
      const rightKey = [right[0].truck_id, right[0].waybill.origin_hub_id, right[0].waybill.dest_hub_id]
        .map(String)
        .join(':');
      return leftKey.localeCompare(rightKey, 'en', { numeric: true });
    });
    const sharedCostAllocations = sharedVendorCostProvided
      ? this.allocateStackVendorCost(
        sharedVendorCost,
        routeGroups.map((group) => group.reduce((sum, row) => sum + row.package_count, 0)),
      )
      : [];
    const manifestResults: Array<{
      id: string;
      manifest_code: string;
      origin_hub_id: string;
      dest_hub_id: string;
      trip_id: string | null;
      waybill_count: number;
    }> = [];
    for (const [groupIndex, group] of routeGroups.entries()) {
      const manifest = await this.createClosedManifestForStack(group, currentUser);
      if (!manifest) throw new ConflictException('Không thể tạo bảng kê cho nhóm HUB đến');
      let tripId: string | null = null;
      const vendorCost = sharedVendorCostProvided
        ? sharedCostAllocations[groupIndex]
        : group.reduce((sum, row) => sum + Math.round(row.vendor_cost * 100), 0) / 100;
      const trip = await this.createInTransitTripForStack(
        manifest,
        group[0].truck_id,
        group.map((row) => ({
          split_id: row.split_id,
          expected_arrival_at: row.expected_arrival_at,
        })),
        group,
        stackDepartureTime,
        {
          driver_name: dto.driver_name,
          driver_phone: dto.driver_phone,
          trip_cost: vendorCost,
        },
      );
      tripId = trip.id;
      if (vendorCost > 0) {
        const pricedRow = group.find((row) => row.vendor_cost > 0) ?? group[0];
        const vendorId = selectedVendorId
          ?? pricedRow.vendor_id
          ?? await this.vendorsService.resolveDefaultVendorId();
        await this.vendorsService.addPayableDebt(
          vendorId,
          vendorCost,
          trip.id,
          `Chi phí chuyến #${trip.id} · ${pricedRow.license_plate ?? ''} · bảng kê ${manifest.manifest_code}`,
        );
      }
      manifestResults.push({
        id: String(manifest.id),
        manifest_code: manifest.manifest_code,
        origin_hub_id: String(manifest.origin_hub_id),
        dest_hub_id: String(manifest.dest_hub_id),
        trip_id: tripId,
        waybill_count: group.length,
      });
    }

    const firstManifest = manifestResults[0] ?? null;
    return {
      saved_count: saved.length,
      manifest_id: firstManifest?.id ?? null,
      manifest_code: firstManifest?.manifest_code ?? null,
      trip_id: firstManifest?.trip_id ?? null,
      manifests: manifestResults,
      items: saved,
    };
  }

  async backfillInTransitTripsForDestHub(destHubId: string) {
    return this.backfillInTransitTripsForHub(destHubId);
  }

  async backfillInTransitTripsForHub(hubId?: string) {
    const qb = this.manifestsRepository
      .createQueryBuilder('manifest')
      .leftJoin(TripEntity, 'existingTrip', 'existingTrip.manifest_id = manifest.id')
      .where('manifest.status IN (:...statuses)', { statuses: [ManifestStatus.CLOSED, ManifestStatus.IN_TRANSIT] })
      .andWhere('existingTrip.id IS NULL');

    if (hubId) {
      qb.andWhere('(manifest.dest_hub_id = :hubId OR manifest.origin_hub_id = :hubId)', { hubId: String(hubId) });
    }

    const manifests = await qb.getMany();

    let created = 0;
    for (const manifest of manifests) {
      const manifestLinks = await this.manifestWaybillsRepository.find({
        where: { manifest_id: String(manifest.id) },
      });
      const waybillIds = manifestLinks.map((row) => row.waybill_id);
      if (!waybillIds.length) continue;

      const splits = await this.splitsRepository.find({
        where: {
          waybill_id: In(waybillIds),
          load_status: In([WaybillSplitLoadStatus.LOADED, WaybillSplitLoadStatus.DEPARTED]),
        } as any,
      });
      if (!splits.length) continue;

      const truckId = splits.find((split) => split.truck_id)?.truck_id;
      if (!truckId) continue;

      const waybills = await this.waybillsRepository.find({
        where: { id: In(waybillIds), deleted_at: IsNull() } as any,
      });

      await this.createInTransitTripForStack(
        manifest,
        String(truckId),
        splits.map((split) => ({
          split_id: split.id,
          expected_arrival_at: split.expected_arrival_at,
        })),
        waybills.map((waybill) => ({ waybill: waybill as WaybillRecord })),
      );
      created += 1;
    }

    return created;
  }

  private async createInTransitTripForStack(
    manifest: ManifestEntity,
    truckId: string,
    splitRows: Array<{ split_id: string | number; expected_arrival_at?: Date | string | null }>,
    _waybillRows: Array<{ waybill: WaybillRecord }>,
    departureTime = new Date(),
    tripDetails: {
      driver_name?: string;
      driver_phone?: string;
      trip_cost?: number;
    } = {},
  ): Promise<TripEntity> {
    const expectedTimes = splitRows
      .map((row) => (row.expected_arrival_at ? new Date(row.expected_arrival_at) : null))
      .filter((value): value is Date => value != null && !Number.isNaN(value.getTime()));
    const expectedArrival = expectedTimes.length
      ? new Date(Math.max(...expectedTimes.map((value) => value.getTime())))
      : null;

    const existingTrip = await this.tripsRepository.findOne({
      where: { manifest_id: String(manifest.id) } as any,
    });
    if (existingTrip) {
      const splitIds = splitRows.map((row) => String(row.split_id)).filter(Boolean);
      if (splitIds.length) {
        await this.splitsRepository.update({ id: In(splitIds) }, { trip_id: existingTrip.id });
      }
      return existingTrip;
    }

    const trip = await this.tripsRepository.save(this.tripsRepository.create({
      truck_id: truckId,
      manifest_id: String(manifest.id),
      start_hub_id: String(manifest.origin_hub_id),
      end_hub_id: String(manifest.dest_hub_id),
      departure_time: departureTime,
      arrival_time: expectedArrival,
      expected_arrival_time: expectedArrival,
      status: TripStatus.PLANNED,
      driver_name: tripDetails.driver_name?.trim() || null,
      driver_phone: tripDetails.driver_phone?.trim() || null,
      trip_cost: tripDetails.trip_cost && tripDetails.trip_cost > 0
        ? String(tripDetails.trip_cost)
        : null,
      other_costs: null,
    }));

    manifest.status = ManifestStatus.CLOSED;
    await this.manifestsRepository.save(manifest);

    const splitIds = splitRows.map((row) => String(row.split_id)).filter(Boolean);
    if (splitIds.length) {
      await this.splitsRepository.update({ id: In(splitIds) }, { trip_id: trip.id });
    }

    return trip;
  }

  private async createClosedManifestForStack(rows: Array<{ waybill: WaybillRecord; loading_position: number | null }>, currentUser: UserEntity) {
    const firstWaybill = rows[0]?.waybill;
    if (!firstWaybill) return null;

    const manifest = this.manifestsRepository.create({
      manifest_code: await this.generateInventoryManifestCode(),
      seal_code: `AUTO-${Date.now()}`,
      origin_hub_id: String(firstWaybill.origin_hub_id),
      dest_hub_id: String(firstWaybill.dest_hub_id),
      status: ManifestStatus.CLOSED,
    } as any) as unknown as ManifestEntity & Record<string, any>;

    Object.assign(manifest, {
      total_waybills: rows.length,
      total_weight: rows.reduce((sum, row) => sum + Number(row.waybill.weight ?? 0), 0),
      closed_at: new Date(),
      closed_by: currentUser.id,
      created_by: currentUser.id,
      updated_by: currentUser.id,
    });

    const savedManifest = await this.manifestsRepository.save(manifest) as ManifestEntity & Record<string, any>;

    await this.manifestWaybillsRepository.save(rows.map((row, index) => this.manifestWaybillsRepository.create({
      manifest_id: String(savedManifest.id),
      waybill_id: String(row.waybill.id),
      loading_position: row.loading_position ?? index + 1,
      loaded_at: new Date(),
    })));

    rows.forEach((row) => {
      row.waybill.current_state = WaybillStatus.MANIFEST_CLOSED as any;
      row.waybill.loaded_at = row.waybill.loaded_at ?? new Date();
    });
    await this.waybillsRepository.save(rows.map((row) => row.waybill as WaybillEntity));

    return savedManifest;
  }

  private async generateInventoryManifestCode(
    repository: Repository<ManifestEntity> = this.manifestsRepository,
  ) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `BK-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const exists = await repository.exist({ where: { manifest_code: code } });
      if (!exists) return code;
    }
    return `BK-${Date.now()}`;
  }

  async updateSplitLoadStatus(splitId: string, dto: UpdateSplitLoadStatusDto, currentUser: UserEntity) {
    const split = await this.splitsRepository.findOne({
      where: { id: splitId },
      relations: ['waybill', 'trip', 'trip.truck', 'truck'],
    });
    if (!split?.waybill) throw new NotFoundException('Split line not found');
    this.assertWaybillAccess(split.waybill as WaybillRecord, currentUser);

    const currentLoadStatus = (split.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD) as WaybillSplitLoadStatus;
    try {
      assertSplitLoadStatusTransition(currentLoadStatus, dto.load_status);
    } catch {
      throw new BadRequestException('Chỉ được chuyển trạng thái từng bước một.');
    }
    split.load_status = dto.load_status;
    split.updated_at = new Date();
    await this.splitsRepository.save(split);

    const waybill = split.waybill as WaybillRecord;
    const totalPackages = Math.max(1, Number(waybill.package_count ?? 1));
    const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
    const totalCod = Number(waybill.cod_amount ?? 0);
    const ratio = split.package_count / totalPackages;
    const trip = split.trip;
    const truck = split.truck ?? trip?.truck ?? null;

    return {
      id: split.id,
      waybill_id: split.waybill_id,
      trip_id: split.trip_id,
      truck_id: split.truck_id ?? trip?.truck_id ?? null,
      package_count: split.package_count,
      loading_position: split.loading_position,
      carrier_label: split.carrier_label,
      note: split.note,
      load_status: split.load_status,
      license_plate: truck?.bks ?? truck?.license_plate ?? null,
      nha_xe: truck?.nha_xe ?? split.carrier_label,
      trip_status: trip?.status ?? null,
      allocated_freight: Math.round(totalFreight * ratio),
      allocated_cod: Math.round(totalCod * ratio),
    };
  }

  async getLoadPlanningBoard(query: QueryLoadPlanningBoardDto, currentUser: UserEntity) {
    const splitLoadStatuses = this.parseList(query.load_status);
    const waybillLoadStatuses = splitLoadStatuses.includes(WaybillSplitLoadStatus.IN_TRANSIT)
      ? [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.IN_TRANSIT]
      : [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE];
    const qb = this.splitsRepository.createQueryBuilder('split')
      .innerJoinAndSelect('split.waybill', 'waybill')
      .leftJoinAndSelect('split.truck', 'truck')
      .leftJoinAndSelect('split.trip', 'trip')
      .leftJoinAndSelect('trip.truck', 'trip_truck')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .where('waybill.deleted_at IS NULL')
      .andWhere('waybill.current_state IN (:...waybillLoadStatuses)', { waybillLoadStatuses });

    const truckIds = this.parseList(query.truck_id);
    if (truckIds.length) {
      qb.andWhere('(split.truck_id IS NOT NULL OR trip.truck_id IS NOT NULL)')
        .andWhere('(split.truck_id IN (:...truckIds) OR trip.truck_id IN (:...truckIds))', { truckIds });
    } else {
      qb.andWhere('split.truck_id IS NOT NULL');
    }

    this.applyFilters(qb, {
      keyword: query.keyword,
      origin_hub_id: query.origin_hub_id,
      dest_hub_id: query.dest_hub_id,
    });
    this.applyHubScope(qb, currentUser);

    if (splitLoadStatuses.length) qb.andWhere('split.load_status IN (:...splitLoadStatuses)', { splitLoadStatuses });

    if (query.date_from) {
      qb.andWhere('COALESCE(waybill.loaded_at, waybill.received_at, waybill.created_at) >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere(`COALESCE(waybill.loaded_at, waybill.received_at, waybill.created_at) < (:dateTo::date + interval '1 day')`, { dateTo: query.date_to });
    }

    if (query.ten_cty?.trim()) {
      const tenCty = query.ten_cty.trim();
      qb.andWhere(new Brackets((builder) => builder
        .where('UPPER(TRIM(waybill.ma_kh)) = UPPER(TRIM(:tenCty))', { tenCty })
        .orWhere('waybill.note ILIKE :tenCtyNotePattern', { tenCtyNotePattern: `%ma_kh=${tenCty}%` })
        .orWhere('waybill.sender_info ILIKE :tenCtySender', { tenCtySender: `%${tenCty}%` })));
    }

    if (query.vendor_id?.trim()) {
      const vendorId = query.vendor_id.trim();
      qb.andWhere(
        '(truck.vendor_id = :vendorId OR trip_truck.vendor_id = :vendorId)',
        { vendorId },
      );
    }

    const splits = await qb
      .orderBy('truck.bks', 'ASC')
      .addOrderBy('truck.license_plate', 'ASC')
      .addOrderBy('split.loading_position', 'ASC')
      .addOrderBy('split.id', 'ASC')
      .getMany();

    type TruckGroup = {
      truck_id: string;
      vendor_id: string | null;
      license_plate: string | null;
      nha_xe: string | null;
      ten_lai_xe: string | null;
      trip_id: string | null;
      trip_status: string | null;
      manifest_code: string | null;
      total_packages: number;
      total_weight: number;
      total_freight: number;
      items: Record<string, unknown>[];
    };

    const truckMap = new Map<string, TruckGroup>();
    splits.forEach((split, index) => {
      const waybill = split.waybill as WaybillRecord;
      if (!waybill) return;
      const truck = split.truck ?? split.trip?.truck ?? null;
      const truckId = String(split.truck_id);
      const group: TruckGroup = truckMap.get(truckId) ?? {
        truck_id: truckId,
        vendor_id: truck?.vendor_id ?? null,
        license_plate: truck?.bks ?? truck?.license_plate ?? null,
        nha_xe: truck?.nha_xe ?? null,
        ten_lai_xe: truck?.ten_lai_xe ?? null,
        trip_id: split.trip_id ?? null,
        trip_status: split.trip?.status ?? null,
        manifest_code: split.trip?.manifest?.manifest_code ?? null,
        total_packages: 0,
        total_weight: 0,
        total_freight: 0,
        items: [],
      };

      const item = this.mapLoadPlanningItem(waybill, split, index, currentUser);
      group.items.push(item);
      group.total_packages += Number(split.package_count ?? 0);
      group.total_weight += Number(waybill.weight ?? 0) * (Number(split.package_count ?? 1) / Math.max(1, Number(waybill.package_count ?? 1)));
      group.total_freight += Number(item.allocated_freight ?? 0);
      truckMap.set(truckId, group);
    });

    const trucks = [...truckMap.values()].slice(0, query.limit ?? 50);
    const totalItems = trucks.reduce((sum, truck) => sum + truck.items.length, 0);

    return {
      trucks: trucks.map((truck) => ({
        ...truck,
        total_weight: Math.round(truck.total_weight * 100) / 100,
        total_freight: isManager(currentUser.role_mask) ? truck.total_freight : undefined,
        items: truck.items.map((item) => {
          const row = { ...item };
          if (!isManager(currentUser.role_mask)) delete row.allocated_freight;
          return row;
        }),
      })),
      total_trucks: trucks.length,
      total_items: totalItems,
    };
  }

  private mapLoadPlanningItem(waybill: WaybillRecord, split: WaybillSplitEntity, index: number, _currentUser: UserEntity) {
    const wbExtra = waybill as WaybillRecord;
    const position = split.loading_position ?? index + 1;
    const destHub = waybill.dest_hub;
    const hubCode = (destHub?.code ?? waybill.noi_den ?? 'HCM').toUpperCase();
    const companyName = waybill.ma_kh?.trim()
      || parseNoteField(waybill.note, 'ma_kh')
      || this.parseContactName(waybill.sender_info)
      || waybill.waybill_code;
    const routeCode = waybill.route_code?.trim();
    const dv = routeCode && routeCode.length <= 4
      ? routeCode.toUpperCase()
      : String(wbExtra.dich_vu ?? wbExtra.loai_bp ?? 'TC').slice(0, 4).toUpperCase() || 'TC';
    const note = split.note?.trim() ?? waybill.note?.trim() ?? '';
    const parenthetical = note.match(/\([^)]+\)/)?.[0] ?? null;
    const goodsBody = this.resolveGoodsContent(waybill) || waybill.waybill_code;
    const matHangNote = parenthetical ?? (note && /xe|kiện|lô/i.test(note) ? note : null);
    const deliveryType = String(wbExtra.loai_giao_hang ?? '').trim() || 'Giao tận nơi';
    const noiTra = `Kho ${hubCode} ${deliveryType}`;
    const quantity = Number(split.package_count ?? waybill.package_count ?? 1);
    const unitRaw = String(wbExtra.don_gia_don_vi ?? '').toLowerCase();
    const loai = unitRaw.includes('pallet') ? 'pallet' : 'kiện';
    const address = waybill.receiver_address?.trim() || this.parseContactAddress(waybill.receiver_info);
    const addressParts = extractVietnamAddressParts(address);
    const receiverDistrict = parseNoteField(waybill.note, 'quan_huyen') || addressParts.district;
    const receiverWard = parseNoteField(waybill.note, 'phuong_xa') || addressParts.ward;
    const truck = split.truck ?? split.trip?.truck ?? null;
    const truckLabel = String(split.carrier_label ?? wbExtra.xe_phat ?? truck?.nha_xe ?? truck?.ten_lai_xe ?? '').trim();
    const totalPackages = Math.max(1, Number(waybill.package_count ?? 1));
    const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
    const totalCod = Number(waybill.cod_amount ?? 0);
    const ratio = quantity / totalPackages;
    const receiverPhone = waybill.receiver_phone?.trim() || this.parseContactPhone(waybill.receiver_info);

    return {
      split_id: split.id,
      waybill_id: waybill.id,
      waybill_code: waybill.waybill_code,
      loading_position: position,
      vi_tri_hang: position,
      ngay_boc: this.formatDispatchDate(waybill.loaded_at ?? waybill.received_at ?? waybill.created_at),
      ngay_toi: this.formatDispatchDate(split.expected_arrival_at ?? this.computeExpectedArrivalAt(
        split.created_at ?? waybill.loaded_at ?? waybill.received_at ?? waybill.created_at ?? new Date(),
      )),
      ma_tinh: hubCode,
      ten_cty: companyName,
      dv,
      mat_hang: goodsBody,
      mat_hang_note: matHangNote,
      noi_tra: noiTra,
      so_luong: quantity,
      loai,
      dia_chi: address,
      quan_huyen: receiverDistrict || null,
      phuong_xa: receiverWard || null,
      noi_den: waybill.noi_den,
      weight: waybill.weight,
      the_tich_m3: waybill.the_tich_m3,
      xe_phat: truckLabel || null,
      origin_hub: waybill.origin_hub,
      dest_hub: waybill.dest_hub,
      allocated_freight: Math.round(totalFreight * ratio),
      allocated_cod: Math.round(totalCod * ratio),
      receiver_phone: receiverPhone || null,
      split_note: split.note?.trim() || null,
      load_status: split.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD,
    };
  }

  private parseContactPhone(info?: string | null): string {
    if (!info) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[1] ?? '';
  }

  private computeExpectedArrivalAt(base: Date | string = new Date()): Date {
    const date = base instanceof Date ? new Date(base.getTime()) : new Date(base);
    date.setDate(date.getDate() + 3);
    return date;
  }

  private normalizeStackVendorCost(value: number): number {
    const numericValue = Number(value);
    const cents = Math.round(numericValue * 100);
    if (
      !Number.isFinite(numericValue)
      || numericValue < 0
      || Math.abs(numericValue * 100 - cents) > 1e-6
    ) {
      throw new BadRequestException('Vendor cost must be non-negative and have at most 2 decimal places');
    }
    return cents / 100;
  }

  private allocateStackVendorCost(totalCost: number, packageWeights: number[]): number[] {
    if (!packageWeights.length) return [];
    const totalPackages = packageWeights.reduce((sum, value) => sum + value, 0);
    if (totalPackages <= 0) throw new BadRequestException('Cannot allocate vendor cost without packages');

    const totalCents = Math.round(totalCost * 100);
    let cumulativePackages = 0;
    let allocatedCents = 0;
    return packageWeights.map((packageCount, index) => {
      cumulativePackages += packageCount;
      const cumulativeTarget = index === packageWeights.length - 1
        ? totalCents
        : Math.round((totalCents * cumulativePackages) / totalPackages);
      const groupCents = cumulativeTarget - allocatedCents;
      allocatedCents = cumulativeTarget;
      return groupCents / 100;
    });
  }

  private resolveStackExpectedArrivalAt(departureTime: Date, explicit?: Date | string | null): Date {
    const expectedArrival = explicit
      ? new Date(explicit)
      : new Date(departureTime.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expectedArrival.getTime()) || expectedArrival.getTime() <= departureTime.getTime()) {
      throw new BadRequestException('Expected arrival time must be after stack departure time');
    }
    return expectedArrival;
  }

  private formatDispatchDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }

  private parseContactName(info?: string | null): string {
    if (!info) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[0] ?? '';
  }

  private parseContactAddress(info?: string | null): string {
    if (!info) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[2] ?? parts[parts.length - 1] ?? '';
  }

  private applyIncompleteSplitFilter(qb: SelectQueryBuilder<WaybillEntity>, flag?: string) {
    if (!this.isTruthyQueryFlag(flag)) return;

    qb.andWhere(`(
      SELECT COALESCE(SUM(incomplete_split.package_count), 0)
      FROM waybill_splits incomplete_split
      WHERE incomplete_split.waybill_id = waybill.id
    ) < ${this.totalPackagesSqlExpr}`);
  }

  private resolveTotalPackages(waybill: WaybillRecord): number {
    const fromWaybill = Number(waybill.package_count ?? 0);
    const fromOrder = Number(waybill.order?.package_count ?? 0);
    return Math.max(1, fromWaybill, fromOrder);
  }

  private readonly totalPackagesSqlExpr = `GREATEST(1, COALESCE(waybill.package_count, 0), COALESCE(
    (SELECT o.package_count FROM orders o WHERE o.id = waybill.order_id),
    0
  ))`;

  private isTruthyQueryFlag(flag?: string): boolean {
    return ['1', 'true', 'yes'].includes(String(flag ?? '').trim().toLowerCase());
  }

  private buildSplitResponse(waybill: WaybillRecord, splits: WaybillSplitEntity[]) {
    const totalPackages = this.resolveTotalPackages(waybill);
    const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
    const totalCod = Number(waybill.cod_amount ?? 0);
    const allocated = splits.reduce((sum, row) => sum + row.package_count, 0);

    return {
      waybill_id: waybill.id,
      waybill_code: waybill.waybill_code,
      total_packages: totalPackages,
      allocated_packages: allocated,
      remaining_packages: totalPackages - allocated,
      total_freight: totalFreight,
      total_cod: totalCod,
      splits: splits.map((row) => {
        const ratio = row.package_count / totalPackages;
        const trip = row.trip;
        const truck = row.truck ?? trip?.truck ?? null;
        return {
          id: row.id,
          waybill_id: row.waybill_id,
          trip_id: row.trip_id,
          truck_id: row.truck_id ?? trip?.truck_id ?? null,
          package_count: row.package_count,
          loading_position: row.loading_position,
          carrier_label: row.carrier_label,
          note: row.note,
          load_status: row.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD,
          license_plate: truck?.bks ?? truck?.license_plate ?? null,
          nha_xe: truck?.nha_xe ?? row.carrier_label,
          trip_status: trip?.status ?? null,
          allocated_freight: Math.round(totalFreight * ratio),
          allocated_cod: Math.round(totalCod * ratio),
        };
      }),
    };
  }

  private async findEditable(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.waybillsRepository.findOne({
      where: { id, deleted_at: IsNull() } as any,
      relations: ['origin_hub', 'dest_hub'],
    }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    if (this.getStatus(waybill) === WaybillStatus.CANCELLED) {
      throw new ConflictException('Cancelled waybill cannot be updated');
    }
    return waybill;
  }

  private async assertOriginChangeIsUnallocated(waybillId: string): Promise<void> {
    const [manifestLink, split] = await Promise.all([
      this.manifestWaybillsRepository.findOne({ where: { waybill_id: waybillId } }),
      this.splitsRepository.findOne({ where: { waybill_id: waybillId } }),
    ]);
    if (manifestLink || split) {
      throw new ConflictException('Không thể đổi bưu cục gửi sau khi vận đơn đã được xếp xe hoặc vào bảng kê');
    }
  }

  private async rerouteDestinationBeforeDeparture(
    waybillId: string,
    nextDestHubId: string,
    currentUser: UserEntity,
    finalWaybill: WaybillRecord,
    syncOriginHub: boolean,
  ): Promise<WaybillRecord> {
    return this.dataSource.transaction(async (manager) => {
      const waybillRepo = manager.getRepository(WaybillEntity);
      const orderRepo = manager.getRepository(OrderEntity);
      const hubRepo = manager.getRepository(HubEntity);
      const manifestRepo = manager.getRepository(ManifestEntity);
      const manifestLinkRepo = manager.getRepository(ManifestWaybillEntity);
      const splitRepo = manager.getRepository(WaybillSplitEntity);
      const tripRepo = manager.getRepository(TripEntity);

      const waybill = await waybillRepo.findOne({
        where: { id: waybillId, deleted_at: IsNull() } as any,
        lock: { mode: 'pessimistic_write' },
      }) as WaybillRecord | null;
      if (!waybill) throw new NotFoundException('Waybill not found');

      const nextDestHub = await hubRepo.findOne({
        where: { id: nextDestHubId, is_active: true, deleted_at: IsNull() },
      });
      if (!nextDestHub) throw new BadRequestException('Hub is missing or inactive');
      const persistWaybillAndOrder = async () => {
        Object.assign(waybill, finalWaybill, {
          dest_hub_id: String(nextDestHub.id),
          dest_hub: nextDestHub,
          updated_by: currentUser.id,
        });
        const saved = await waybillRepo.save(waybill) as WaybillRecord;
        if (saved.order_id) {
          await orderRepo.update(
            { id: String(saved.order_id) },
            {
              dest_hub_id: String(nextDestHub.id),
              ...(syncOriginHub ? { origin_hub_id: String(saved.origin_hub_id) } : {}),
            },
          );
        }
        return saved;
      };
      if (String(waybill.dest_hub_id) === String(nextDestHubId)) {
        return persistWaybillAndOrder();
      }

      const links = await manifestLinkRepo.find({
        where: { waybill_id: waybillId },
        relations: ['manifest', 'manifest.trips'],
      });
      if (links.length > 1) {
        throw new ConflictException('Vận đơn đang thuộc nhiều bảng kê; cần xử lý dữ liệu trùng trước khi đổi HUB đến');
      }

      const splits = await splitRepo.find({
        where: { waybill_id: waybillId },
        relations: ['trip'],
      });
      const movableLoadStatuses = new Set<WaybillSplitLoadStatus>([
        WaybillSplitLoadStatus.WAITING_LOAD,
        WaybillSplitLoadStatus.LOADED,
      ]);
      if (splits.some((split) => !movableLoadStatuses.has(split.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD))) {
        throw new ConflictException('Xe đã khởi hành; không thể đổi HUB đến của vận đơn');
      }

      const relatedTripIds = new Set<string>();
      links[0]?.manifest?.trips?.forEach((trip) => relatedTripIds.add(String(trip.id)));
      splits.forEach((split) => {
        if (split.trip_id) relatedTripIds.add(String(split.trip_id));
      });
      if (relatedTripIds.size > 1) {
        throw new ConflictException('Vận đơn đang được phân trên nhiều chuyến; không thể tự động đổi HUB đến');
      }

      let sourceTrip: TripEntity | null = null;
      const sourceTripId = [...relatedTripIds][0];
      if (sourceTripId) {
        sourceTrip = await tripRepo.findOne({
          where: { id: sourceTripId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!sourceTrip || sourceTrip.status !== TripStatus.PLANNED) {
          throw new ConflictException('Xe đã khởi hành; không thể đổi HUB đến của vận đơn');
        }
      }

      const sourceLink = links[0] ?? null;
      let sourceManifest = sourceLink?.manifest ?? null;
      if (sourceManifest) {
        const lockedManifest = await manifestRepo.findOne({
          where: { id: String(sourceManifest.id) },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedManifest) throw new ConflictException('Không tìm thấy bảng kê hiện tại của vận đơn');
        sourceManifest = lockedManifest;
        if (![ManifestStatus.DRAFT, ManifestStatus.CLOSED, ManifestStatus.ASSIGNED_TO_TRIP].includes(sourceManifest.status as ManifestStatus)) {
          throw new ConflictException('Bảng kê đã khởi hành hoặc đã khóa; không thể đổi HUB đến');
        }
      } else if (sourceTrip) {
        throw new ConflictException('Chuyến xe thiếu liên kết bảng kê; không thể tự động đổi HUB đến');
      } else if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) {
        throw new ConflictException('Vận đơn đã khóa logistics; không thể đổi HUB đến');
      }

      if (sourceManifest && sourceLink) {
        const sourceManifestLinks = await manifestLinkRepo.find({
          where: { manifest_id: String(sourceManifest.id) },
        });

        if (sourceManifestLinks.length <= 1) {
          sourceManifest.dest_hub_id = String(nextDestHub.id);
          await manifestRepo.save(sourceManifest);
          if (sourceTrip) {
            sourceTrip.end_hub_id = String(nextDestHub.id);
            await tripRepo.save(sourceTrip);
          }
          sourceLink.dispatch_fields = {
            ...(sourceLink.dispatch_fields ?? {}),
            ma_tinh: nextDestHub.code || nextDestHub.name || String(nextDestHub.id),
          };
          await manifestLinkRepo.save(sourceLink);
        } else {
          let targetTrip: TripEntity | null = null;
          let targetManifest: ManifestEntity | null = null;

          if (sourceTrip) {
            const candidates = await tripRepo.find({
              where: {
                truck_id: sourceTrip.truck_id,
                start_hub_id: sourceTrip.start_hub_id,
                end_hub_id: String(nextDestHub.id),
                status: TripStatus.PLANNED,
              } as any,
              relations: ['manifest'],
            });
            const sourceDeparture = new Date(sourceTrip.departure_time).getTime();
            const matchingCandidates = candidates.filter((candidate) => (
              new Date(candidate.departure_time).getTime() === sourceDeparture
              && candidate.manifest
              && String(candidate.manifest.origin_hub_id) === String(sourceManifest!.origin_hub_id)
              && String(candidate.manifest.dest_hub_id) === String(nextDestHub.id)
            ));
            if (matchingCandidates.length > 1) {
              throw new ConflictException('Có nhiều bảng kê đích phù hợp; không thể tự động tách HUB');
            }
            targetTrip = matchingCandidates[0] ?? null;
            targetManifest = targetTrip?.manifest ?? null;
          }

          if (!targetManifest) {
            targetManifest = manifestRepo.create({
              manifest_code: await this.generateInventoryManifestCode(manifestRepo),
              seal_code: `AUTO-REROUTE-${Date.now()}`,
              origin_hub_id: String(sourceManifest.origin_hub_id),
              dest_hub_id: String(nextDestHub.id),
              status: sourceTrip ? ManifestStatus.CLOSED : sourceManifest.status,
            });
            targetManifest = await manifestRepo.save(targetManifest);
          }

          if (sourceTrip && !targetTrip) {
            targetTrip = tripRepo.create({
              truck_id: sourceTrip.truck_id,
              manifest_id: String(targetManifest.id),
              start_hub_id: String(sourceTrip.start_hub_id),
              end_hub_id: String(nextDestHub.id),
              departure_time: sourceTrip.departure_time,
              arrival_time: sourceTrip.arrival_time,
              expected_arrival_time: sourceTrip.expected_arrival_time,
              driver_name: sourceTrip.driver_name,
              driver_phone: sourceTrip.driver_phone,
              status: TripStatus.PLANNED,
            });
            targetTrip = await tripRepo.save(targetTrip);
          }

          const movedLink = manifestLinkRepo.create({
            manifest_id: String(targetManifest.id),
            waybill_id: waybillId,
            loading_position: sourceLink.loading_position,
            loaded_at: sourceLink.loaded_at,
            dispatch_fields: {
              ...(sourceLink.dispatch_fields ?? {}),
              ma_tinh: nextDestHub.code || nextDestHub.name || String(nextDestHub.id),
            },
          });
          await manifestLinkRepo.delete({
            manifest_id: String(sourceManifest.id),
            waybill_id: waybillId,
          });
          await manifestLinkRepo.save(movedLink);

          if (sourceTrip && targetTrip) {
            const splitsToMove = splits.filter((split) => String(split.trip_id ?? '') === String(sourceTrip!.id));
            splitsToMove.forEach((split) => {
              if (split.truck_id && targetTrip!.truck_id && String(split.truck_id) !== String(targetTrip!.truck_id)) {
                throw new ConflictException('Xe của kiện hàng không khớp chuyến đích');
              }
              split.trip_id = String(targetTrip!.id);
            });
            if (splitsToMove.length) await splitRepo.save(splitsToMove);
          }
        }
      }

      return persistWaybillAndOrder();
    });
  }

  private async findMutable(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findOne(id, currentUser);
    if (waybill.manifest_id || waybill.trip_id) throw new ConflictException('Waybill is locked by manifest or trip');
    return waybill;
  }

  private applyFilters(qb: any, query: QueryWaybillsDto) {
    if (query.keyword?.trim()) {
      const rawKeyword = query.keyword.trim();
      const keyword = `%${rawKeyword}%`;
      const normalizedWaybillKeyword = this.normalizeWaybillSearchKeyword(rawKeyword);
      qb.andWhere(new Brackets((builder) => {
        builder
          .where('waybill.waybill_code ILIKE :keyword', { keyword })
          .orWhere('waybill.sender_info ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_info ILIKE :keyword', { keyword })
          .orWhere('waybill.ma_kh ILIKE :keyword', { keyword });
        if (normalizedWaybillKeyword) {
          builder.orWhere(
            `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
            { normalizedWaybillKeyword },
          );
        }
      }));
    }

    if (query.ma_kh?.trim()) {
      const maKh = query.ma_kh.trim();
      qb.andWhere(new Brackets((builder) => builder
        .where('UPPER(TRIM(waybill.ma_kh)) = UPPER(TRIM(:maKh))', { maKh })
        .orWhere('waybill.note ILIKE :maKhNotePattern', { maKhNotePattern: `%ma_kh=${maKh}%` })));
    }

    if (query.noi_den?.trim()) {
      const noiDenRaw = query.noi_den.trim();
      const hubCode = noiDenRaw.toUpperCase();
      if (/^[A-Z]{2,8}$/.test(hubCode)) {
        qb.andWhere('UPPER(dest_hub.code) = :hubCode', { hubCode });
      } else {
        const noiDen = `%${noiDenRaw}%`;
        qb.andWhere(new Brackets((builder) => builder
          .where('waybill.noi_den ILIKE :noiDen', { noiDen })
          .orWhere('waybill.receiver_address ILIKE :noiDen', { noiDen })
          .orWhere('waybill.receiver_info ILIKE :noiDen', { noiDen })
          .orWhere('waybill.note ILIKE :noiDenNote', { noiDenNote: `%tinh_den=${noiDenRaw}%` })));
      }
    }

    if (query.billing_unit?.trim()) {
      const billingUnits = this.parseList(query.billing_unit);
      if (billingUnits.length) {
        qb.andWhere(new Brackets((builder) => {
          billingUnits.forEach((unit, index) => {
            const param = `billingUnit${index}`;
            const pattern = `%billing_unit=${unit}%`;
            if (index === 0) builder.where(`waybill.note ILIKE :${param}`, { [param]: pattern });
            else builder.orWhere(`waybill.note ILIKE :${param}`, { [param]: pattern });
          });
        }));
      }
    }

    const statuses = this.parseList(query.status);
    if (statuses.length) qb.andWhere('waybill.current_state IN (:...statuses)', { statuses });

    const hubIds = this.parseList(query.current_hub_id ?? query.hub_id);
    if (hubIds.length) qb.andWhere('COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)', { hubIds });

    const paymentTypes = this.parseList(query.payment_type);
    if (paymentTypes.length) qb.andWhere('waybill.payment_type IN (:...paymentTypes)', { paymentTypes });

    const customerPaymentStatuses = this.parseList(query.customer_payment_status);
    if (customerPaymentStatuses.length) qb.andWhere('waybill.customer_payment_status IN (:...customerPaymentStatuses)', { customerPaymentStatuses });

    const priorities = this.parseList(query.priority);
    if (priorities.length) qb.andWhere('waybill.priority IN (:...priorities)', { priorities });

    if (query.origin_hub_id) {
      const originIds = this.parseList(query.origin_hub_id);
      if (originIds.length === 1) qb.andWhere('waybill.origin_hub_id = :originHubId', { originHubId: originIds[0] });
      else if (originIds.length > 1) qb.andWhere('waybill.origin_hub_id IN (:...originHubIds)', { originHubIds: originIds });
    }
    if (query.dest_hub_id) {
      const destIds = this.parseList(query.dest_hub_id);
      if (destIds.length === 1) qb.andWhere('waybill.dest_hub_id = :destHubId', { destHubId: destIds[0] });
      else if (destIds.length > 1) qb.andWhere('waybill.dest_hub_id IN (:...destHubIds)', { destHubIds: destIds });
    }
    if (query.route_code) qb.andWhere('waybill.route_code = :routeCode', { routeCode: query.route_code });

    const fromDate = query.received_from ?? query.from_date;
    const toDate = query.received_to ?? query.to_date;
    if (fromDate) qb.andWhere('COALESCE(waybill.received_at, waybill.created_at) >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('COALESCE(waybill.received_at, waybill.created_at) <= :toDate', { toDate });
  }

  private parseList(value?: string | null): string[] {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  private splitBelongsToVendor(split: WaybillSplitEntity, vendorId: string) {
    const truckVendorId = split.truck?.vendor_id ?? split.trip?.truck?.vendor_id ?? null;
    return truckVendorId != null && String(truckVendorId) === String(vendorId);
  }

  private resolveInventoryHubFilter(query: QueryWaybillsDto, currentUser: UserEntity) {
    if (query.current_hub_id?.trim() || query.hub_id?.trim()) {
      return query.current_hub_id ?? query.hub_id;
    }
    if (query.ma_kh?.trim() || query.vendor_id?.trim()) {
      return undefined;
    }
    // Khi lọc theo hub khởi hành (vd. thêm đơn vào bảng kê), hàng phải đang ở hub xuất phát.
    if (query.origin_hub_id?.trim()) {
      return query.origin_hub_id;
    }
    return currentUser.hub_id ?? undefined;
  }

  private applyHubScope(qb: any, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask) || !currentUser.hub_id) return;
    qb.andWhere(new Brackets((builder) => builder.where('waybill.origin_hub_id = :hubId', { hubId: currentUser.hub_id }).orWhere('waybill.dest_hub_id = :hubId', { hubId: currentUser.hub_id }).orWhere('waybill.current_hub_id = :hubId', { hubId: currentUser.hub_id })));
  }

  private async assertActiveHub(hubId: string) {
    await this.getActiveHub(hubId);
  }

  private async getActiveHub(hubId: string) {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId, is_active: true, deleted_at: IsNull() } });
    if (!hub) throw new BadRequestException('Hub is missing or inactive');
    return hub;
  }

  private async assertHubAccess(hubId: string, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask)) return;
    if (currentUser.hub_id !== hubId) throw new ForbiddenException('User is not assigned to this hub');
  }

  private assertWaybillAccess(waybill: WaybillRecord, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask) || !currentUser.hub_id) return;
    if (![waybill.origin_hub_id, waybill.dest_hub_id, waybill.current_hub_id].includes(currentUser.hub_id)) throw new ForbiddenException('User cannot access this waybill outside assigned hub');
  }

  async previewNextWaybillCode(originHubId: string | undefined, currentUser: UserEntity): Promise<{ waybill_code: string }> {
    const hubId = originHubId?.trim() || currentUser.hub_id;
    if (!hubId) throw new BadRequestException('origin_hub_id is required');
    await this.assertHubAccess(hubId, currentUser);
    const hub = await this.getActiveHub(hubId);
    return { waybill_code: await this.generateUniqueCode(hub.code) };
  }

  private async resolveWaybillCode(explicit: string | undefined, originHubCode: string): Promise<string> {
    const normalized = this.normalizeWaybillCode(explicit, originHubCode);
    await this.assertUniqueWaybillCode(normalized);
    return normalized;
  }

  private normalizeWaybillCode(explicit: string | undefined, originHubCode: string): string {
    const code = explicit?.trim();
    if (!code) throw new BadRequestException('Waybill code is required');

    const compactCode = code.toUpperCase().replace(/[-\s]+/g, '');
    const expectedPrefix = this.formatEcoBillPrefix(originHubCode);
    if (!compactCode.startsWith(expectedPrefix)) {
      throw new BadRequestException(`Waybill code must start with ${expectedPrefix}`);
    }

    const suffix = compactCode.slice(expectedPrefix.length);
    if (!/^[0-9]+$/.test(suffix)) {
      throw new BadRequestException(`Waybill code must follow ${expectedPrefix}<number>`);
    }

    const sequence = Number(suffix);
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      throw new BadRequestException('Waybill sequence must be a positive integer');
    }

    return this.formatEcoBillCode(originHubCode, sequence);
  }

  private async assertUniqueWaybillCode(code: string, excludeId?: string) {
    const variants = this.getEquivalentWaybillCodes(code);
    const existing = await this.waybillsRepository.findOne({
      where: variants.map((waybillCode) => ({
        waybill_code: waybillCode,
        deleted_at: IsNull(),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      })) as any,
    });
    if (existing) throw new ConflictException('Waybill code already exists');
  }

  private getEquivalentWaybillCodes(code: string): string[] {
    const match = /^ECO([A-Z]+)([0-9]+)$/.exec(code);
    if (!match) return [code];
    const [, hubCode, sequence] = match;
    return [code, `ECO-${hubCode}-${sequence}`];
  }

  private normalizeWaybillSearchKeyword(keyword: string): string | null {
    const compactKeyword = keyword.trim().toUpperCase().replace(/[-\s]+/g, '');
    return /^ECO[A-Z]{2,8}[0-9]+$/.test(compactKeyword)
      ? `%${compactKeyword}%`
      : null;
  }

  private async getMaxEcoBillSequence(hubCode: string): Promise<number> {
    const prefix = this.formatEcoBillPrefix(hubCode);
    const normalizedHubCode = prefix.slice(3);
    const row = await this.waybillsRepository
      .createQueryBuilder('waybill')
      .select(
        `MAX(
          CASE
            WHEN waybill.waybill_code ~* :codePattern
            THEN CAST(REGEXP_REPLACE(waybill.waybill_code, :codeReplacePattern, '', 'i') AS BIGINT)
            ELSE NULL
          END
        )`,
        'maxSeq',
      )
      .where('waybill.deleted_at IS NULL')
      .setParameters({
        codePattern: `^ECO-?${normalizedHubCode}-?[0-9]+$`,
        codeReplacePattern: `^ECO-?${normalizedHubCode}-?`,
      })
      .getRawOne<{ maxSeq: string | null }>();

    return Number(row?.maxSeq ?? 0) || 0;
  }

  private formatEcoBillPrefix(hubCode: string): string {
    const normalizedHubCode = String(hubCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalizedHubCode) throw new BadRequestException('Hub code is required');
    return `ECO${normalizedHubCode}`;
  }

  private formatEcoBillCode(hubCode: string, sequence: number): string {
    return `${this.formatEcoBillPrefix(hubCode)}${Math.max(1, Math.floor(sequence))}`;
  }

  private async generateUniqueCode(hubCode: string): Promise<string> {
    let sequence = (await this.getMaxEcoBillSequence(hubCode)) + 1;

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = this.formatEcoBillCode(hubCode, sequence + attempt);
      const existing = await this.waybillsRepository.findOne({
        where: { waybill_code: code, deleted_at: IsNull() } as any,
      });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to generate unique waybill code');
  }

  private getStatus(waybill: WaybillRecord): WaybillStatus {
    return (waybill.status ?? waybill.current_state) as WaybillStatus;
  }

  private setStatus(waybill: WaybillRecord, status: WaybillStatus) {
    waybill.status = status;
    waybill.current_state = status as any;
  }

  private hasAnyRole(user: UserEntity, roles: number[]) {
    return roles.some((role) => hasRole(user.role_mask, role));
  }

  private packContact(name?: string | null, phone?: string | null, address?: string | null) {
    return [name, phone, address].filter(Boolean).join(' | ');
  }

  private resolvePaymentType(dto: Pick<CreateWaybillDto, 'note' | 'cc_amount'>): PaymentType {
    const method = parseNoteField(dto.note, 'phuong_thuc');
    if (method === 'Người nhận thanh toán' || Number(dto.cc_amount ?? 0) > 0) return PaymentType.CC;
    if (method === 'COD') return PaymentType.COD;
    return PaymentType.PP;
  }

  private async saveWithAudit(waybill: WaybillRecord, currentUser: UserEntity, action: string): Promise<WaybillRecord> {
    waybill.last_audit_action = action;
    waybill.last_audit_user_id = currentUser.id;
    waybill.last_audit_at = new Date();
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  private mapInventoryTripLine(
    waybill: WaybillRecord,
    split: WaybillSplitEntity | null,
    remainingPackages?: number,
  ) {
    const totalPackages = this.resolveTotalPackages(waybill);
    const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
    const totalCod = Number(waybill.cod_amount ?? 0);
    const tripPackages = remainingPackages ?? (split ? split.package_count : totalPackages);
    const ratio = tripPackages / totalPackages;
    const truck = split?.truck ?? split?.trip?.truck ?? null;
    const licensePlate = truck?.bks ?? truck?.license_plate ?? null;
    const carrier = split?.carrier_label ?? truck?.nha_xe ?? null;
    const unallocatedLabel = remainingPackages != null && remainingPackages < totalPackages
      ? `Còn ${remainingPackages} kiện · Chưa phân xe`
      : 'Chưa phân xe';

    return {
      ...waybill,
      mat_hang: this.resolveGoodsContent(waybill) || null,
      split_id: split?.id ?? null,
      trip_id: split?.trip_id ?? null,
      truck_id: split?.truck_id ?? split?.trip?.truck_id ?? null,
      trip_package_count: tripPackages,
      order_total_packages: totalPackages,
      remaining_packages: remainingPackages ?? (split ? null : totalPackages),
      trip_label: split
        ? [licensePlate, carrier, split.trip_id ? `Chuyến #${split.trip_id}` : null].filter(Boolean).join(' · ') || 'Đã phân xe'
        : unallocatedLabel,
      license_plate: licensePlate,
      trip_nha_xe: carrier,
      trip_status: split?.trip?.status ?? null,
      loading_position: split?.loading_position ?? null,
      split_note: split?.note ?? null,
      split_load_status: split?.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD,
      allocated_freight: split ? Math.round(totalFreight * ratio) : totalFreight,
      allocated_cod: split ? Math.round(totalCod * ratio) : totalCod,
    };
  }

  private sanitize(waybill: WaybillRecord, currentUser: UserEntity): WaybillRecord {
    const result: Record<string, any> = { ...waybill, status: this.getStatus(waybill) };
    result.noi_dung = this.resolveGoodsContent(waybill) || null;
    if (waybill.order?.order_code) {
      result.order_code = waybill.order.order_code;
      result.order_id = waybill.order_id ?? waybill.order.id;
    }
    if (!result.receiver_phone && result.receiver_info) {
      const parts = String(result.receiver_info).split(' | ').map((p: string) => p.trim());
      if (parts[1]) result.receiver_phone = parts[1];
    }
    if (!isManager(currentUser.role_mask)) {
      delete result.cost_amount;
      delete result.cod_amount;
      delete result.freight_amount;
      delete result.cc_amount;
    }
    delete result.deleted_at;
    return result as WaybillRecord;
  }

  private resolveGoodsContent(waybill: WaybillRecord): string {
    return (
      String(waybill.noi_dung ?? '').trim() ||
      parseNoteField(waybill.note, 'content') ||
      parseNoteField(waybill.order?.note, 'content') ||
      String((waybill.order as Record<string, unknown> | null | undefined)?.goods_description ?? '').trim() ||
      String((waybill.order as Record<string, unknown> | null | undefined)?.noi_dung ?? '').trim() ||
      plainGoodsNote(waybill.order?.note)
    );
  }
}



