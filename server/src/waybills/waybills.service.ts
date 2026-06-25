import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { PaymentType } from '../common/enums';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { clampPaginationLimit } from '../common/pagination';
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
import { SaveWaybillSplitsDto } from './dto/save-waybill-splits.dto';
import { QueryLoadPlanningBoardDto } from './dto/query-load-planning-board.dto';
import { UpdateSplitLoadStatusDto } from './dto/update-split-load-status.dto';
import { assertSplitLoadStatusTransition, WaybillSplitLoadStatus } from './dto/waybill-split-load-status.enum';
import { OrdersService } from '../orders/orders.service';
import { VendorsService } from '../vendors/vendors.service';

type WaybillRecord = WaybillEntity & Record<string, any>;

const FINAL_STATUSES = [WaybillStatus.DELIVERED, WaybillStatus.RETURNED, WaybillStatus.CANCELLED];
const INVENTORY_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.MANIFEST_CLOSED, WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY];
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
      length: 0,
      width: 0,
      height: 0,
      volumetric_weight: dto.volumetric_weight ?? 0,
      the_tich_m3: dto.the_tich_m3 ?? null,
      payment_type: this.resolvePaymentType(dto),
      cost_amount: String(dto.freight_amount ?? 0),
      current_state: WaybillStatus.RECEIVED as any,
      origin_hub_id: dto.origin_hub_id,
      dest_hub_id: dto.dest_hub_id,
      last_mile_driver_id: null,
      delivery_photo_url: null,
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
    const waybill = await this.findMutable(id, currentUser);
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) throw new ConflictException('Waybill is locked by manifest or trip');
    if (dto.waybill_code !== undefined) {
      const normalized = dto.waybill_code.trim().toUpperCase();
      if (!normalized) throw new BadRequestException('Waybill code is required');
      if (normalized !== waybill.waybill_code) {
        await this.assertUniqueWaybillCode(normalized, id);
        waybill.waybill_code = normalized;
      }
      delete dto.waybill_code;
    }
    Object.assign(waybill, dto, { updated_by: currentUser.id });
    if (dto.freight_amount !== undefined) waybill.cost_amount = String(dto.freight_amount);
    if (dto.note !== undefined || dto.cc_amount !== undefined || dto.cod_amount !== undefined) waybill.payment_type = this.resolvePaymentType(dto);
    if (dto.sender_name || dto.sender_phone || dto.sender_address) waybill.sender_info = this.packContact(waybill.sender_name, waybill.sender_phone, waybill.sender_address);
    if (dto.receiver_name || dto.receiver_phone || dto.receiver_address) waybill.receiver_info = this.packContact(waybill.receiver_name, waybill.receiver_phone, waybill.receiver_address);
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  async receive(id: string, dto: ReceiveWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (this.getStatus(waybill) !== WaybillStatus.RECEIVED) throw new BadRequestException('Only RECEIVED waybills can be received');
    const receiveHubId = currentUser.hub_id ?? waybill.origin_hub_id;
    await this.assertHubAccess(receiveHubId, currentUser);
    this.setStatus(waybill, WaybillStatus.IN_WAREHOUSE);
    Object.assign(waybill, { current_hub_id: receiveHubId, delivery_photo_url: dto.delivery_photo_url, received_at: new Date(), received_by: currentUser.id, updated_by: currentUser.id });
    return this.saveWithAudit(waybill, currentUser, 'RECEIVE');
  }

  async updateStatus(id: string, dto: UpdateWaybillStatusDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    const currentStatus = this.getStatus(waybill);
    if (!STATE_TRANSITIONS[currentStatus]?.includes(dto.status)) throw new BadRequestException('Invalid waybill state transition');
    if (dto.status === WaybillStatus.DELIVERED && !dto.delivery_photo_url && !waybill.delivery_photo_url) throw new BadRequestException('Delivery photo is required');
    this.setStatus(waybill, dto.status);
    Object.assign(waybill, { updated_by: currentUser.id, note: dto.note ?? waybill.note });
    if (dto.delivery_photo_url) waybill.delivery_photo_url = dto.delivery_photo_url;
    if (dto.status === WaybillStatus.DELIVERED) Object.assign(waybill, { delivered_at: new Date(), delivery_time: new Date() });
    if (dto.status === WaybillStatus.RETURNED) waybill.returned_at = new Date();
    return this.saveWithAudit(waybill, currentUser, 'STATUS_CHANGE');
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
    const waybill = await this.waybillsRepository.findOne({ where: { waybill_code: code, deleted_at: IsNull() } as any, relations: ['origin_hub', 'dest_hub'] }) as WaybillRecord | null;
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
    const inventoryQuery = {
      ...query,
      status: query.status ?? INVENTORY_STATUSES.join(','),
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

    const [waybills, totalWaybills] = await qb
      .orderBy('waybill.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const waybillIds = waybills.map((waybill) => waybill.id);
    const splits = waybillIds.length
      ? await this.splitsRepository.find({
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

    const onlyIncompleteSplit = this.isTruthyQueryFlag(query.only_incomplete_split);

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
      },
    };
  }

  getIncoming(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, dest_hub_id: query.dest_hub_id ?? currentUser.hub_id ?? undefined }, currentUser);
  }

  getOverdue(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, to_date: new Date().toISOString() }, currentUser);
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
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder
        .where('voucher.waybill_code ILIKE :keyword', { keyword })
        .orWhere('waybill.waybill_code ILIKE :keyword', { keyword })
        .orWhere('waybill.ma_kh ILIKE :keyword', { keyword })
        .orWhere('voucher.note ILIKE :keyword', { keyword })));
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
    const saved: Array<Record<string, unknown>> = [];
    const manifestWaybills: Array<{ waybill: WaybillRecord; loading_position: number | null }> = [];

    for (const line of dto.items) {
      const waybill = await this.waybillsRepository.findOne({
        where: { id: String(line.waybill_id), deleted_at: IsNull() } as any,
        relations: ['order', 'origin_hub', 'dest_hub'],
      }) as WaybillRecord | null;
      if (!waybill) throw new NotFoundException(`Waybill ${line.waybill_id} not found`);
      this.assertWaybillAccess(waybill, currentUser);
      if (FINAL_STATUSES.includes(this.getStatus(waybill))) {
        throw new BadRequestException(`Waybill ${waybill.waybill_code} cannot be stacked`);
      }

      const truck = await this.trucksRepository.findOne({
        where: { id: String(line.truck_id) },
        relations: ['vendor'],
      });
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

      const expectedArrivalAt = this.computeExpectedArrivalAt(waybill);
      const carrierLabel = truck.nha_xe?.trim()
        || truck.vendor?.name?.trim()
        || truck.bks?.trim()
        || truck.license_plate?.trim()
        || null;

      const split = await this.splitsRepository.save(this.splitsRepository.create({
        waybill_id: String(line.waybill_id),
        truck_id: String(line.truck_id),
        package_count: packageCount,
        loading_position: line.loading_position ?? null,
        carrier_label: carrierLabel,
        note: line.note?.trim() || null,
        expected_arrival_at: expectedArrivalAt,
        load_status: WaybillSplitLoadStatus.DEPARTED,
        created_by: currentUser.id,
      }));

      let vendorDebtAmount: number | undefined;
      if (line.vendor_cost != null && line.vendor_cost > 0) {
        const vendorId = truck.vendor_id ?? await this.vendorsService.resolveDefaultVendorId();
        const plate = truck.bks ?? truck.license_plate ?? '';
        await this.vendorsService.addPayableDebt(
          vendorId,
          line.vendor_cost,
          undefined,
          `Xếp hàng ${waybill.waybill_code} · ${plate} · split #${split.id}`,
        );
        vendorDebtAmount = line.vendor_cost;
      }

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
        vendor_cost: vendorDebtAmount,
        allocated_freight: isManager(currentUser.role_mask) ? Math.round(totalFreight * ratio) : undefined,
      });
      manifestWaybills.push({ waybill, loading_position: split.loading_position });
    }

    const manifest = manifestWaybills.length ? await this.createClosedManifestForStack(manifestWaybills, currentUser) : null;

    return { saved_count: saved.length, manifest_id: manifest?.id ?? null, manifest_code: manifest?.manifest_code ?? null, items: saved };
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

  private async generateInventoryManifestCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `BK-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const exists = await this.manifestsRepository.exist({ where: { manifest_code: code } });
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
      ngay_toi: this.formatDispatchDate(split.expected_arrival_at ?? this.computeExpectedArrivalAt(waybill)),
      ma_tinh: hubCode,
      ten_cty: companyName,
      dv,
      mat_hang: goodsBody,
      mat_hang_note: matHangNote,
      noi_tra: noiTra,
      so_luong: quantity,
      loai,
      dia_chi: address,
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

  private computeExpectedArrivalAt(waybill: WaybillRecord): Date {
    const base = waybill.created_at ?? waybill.received_at ?? new Date();
    const date = base instanceof Date ? new Date(base.getTime()) : new Date(base);
    date.setDate(date.getDate() + 3);
    return date;
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

  private async findMutable(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findOne(id, currentUser);
    if (waybill.manifest_id || waybill.trip_id) throw new ConflictException('Waybill is locked by manifest or trip');
    return waybill;
  }

  private applyFilters(qb: any, query: QueryWaybillsDto) {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder.where('waybill.waybill_code ILIKE :keyword', { keyword }).orWhere('waybill.sender_info ILIKE :keyword', { keyword }).orWhere('waybill.receiver_info ILIKE :keyword', { keyword }).orWhere('waybill.ma_kh ILIKE :keyword', { keyword })));
    }

    if (query.ma_kh?.trim()) {
      const maKh = query.ma_kh.trim();
      qb.andWhere(new Brackets((builder) => builder
        .where('UPPER(TRIM(waybill.ma_kh)) = UPPER(TRIM(:maKh))', { maKh })
        .orWhere('waybill.note ILIKE :maKhNotePattern', { maKhNotePattern: `%ma_kh=${maKh}%` })));
    }

    const statuses = this.parseList(query.status);
    if (statuses.length) qb.andWhere('waybill.current_state IN (:...statuses)', { statuses });

    const hubIds = this.parseList(query.current_hub_id ?? query.hub_id);
    if (hubIds.length) qb.andWhere('COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)', { hubIds });

    const paymentTypes = this.parseList(query.payment_type);
    if (paymentTypes.length) qb.andWhere('waybill.payment_type IN (:...paymentTypes)', { paymentTypes });

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
    const code = explicit?.trim();
    if (!code) throw new BadRequestException('Waybill code is required');
    const normalized = code.toUpperCase();
    const expectedPrefix = this.formatEcoBillPrefix(originHubCode);
    if (!normalized.startsWith(`${expectedPrefix}-`)) {
      throw new BadRequestException(`Waybill code must start with ${expectedPrefix}-`);
    }
    await this.assertUniqueWaybillCode(normalized);
    return normalized;
  }

  private async assertUniqueWaybillCode(code: string, excludeId?: string) {
    const existing = await this.waybillsRepository.findOne({
      where: { waybill_code: code, deleted_at: IsNull() } as any,
    });
    if (existing && String(existing.id) !== String(excludeId ?? '')) {
      throw new ConflictException('Waybill code already exists');
    }
  }

  private async getMaxEcoBillSequence(hubCode: string): Promise<number> {
    const prefix = this.formatEcoBillPrefix(hubCode);
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
        codePattern: `^${prefix}-[0-9]+$`,
        codeReplacePattern: `^${prefix}-`,
      })
      .getRawOne<{ maxSeq: string | null }>();

    return Number(row?.maxSeq ?? 0) || 0;
  }

  private formatEcoBillPrefix(hubCode: string): string {
    const normalizedHubCode = String(hubCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalizedHubCode) throw new BadRequestException('Hub code is required');
    return `ECO-${normalizedHubCode}`;
  }

  private formatEcoBillCode(hubCode: string, sequence: number): string {
    return `${this.formatEcoBillPrefix(hubCode)}-${Math.max(1, Math.floor(sequence))}`;
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

  private mapInventoryTripLine(waybill: WaybillRecord, split: WaybillSplitEntity | null, remainingPackages?: number) {
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



