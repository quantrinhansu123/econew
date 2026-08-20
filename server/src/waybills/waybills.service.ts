import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { CustomerPaymentStatus, PaymentType, TripStatus } from '../common/enums';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { clampPaginationLimit } from '../common/pagination';
import { extractVietnamAddressParts } from '../common/vietnam-address';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillChangeLogEntity, WaybillFieldChange } from './waybill-change-log.entity';
import { AssignWaybillPriorityDto } from './dto/assign-waybill-priority.dto';
import { AssignWaybillRouteDto } from './dto/assign-waybill-route.dto';
import { CancelWaybillDto } from './dto/cancel-waybill.dto';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { CreateWaybillCashVoucherDto } from './dto/create-waybill-cash-voucher.dto';
import { CreateBulkWaybillPaymentDto } from './dto/create-bulk-waybill-payment.dto';
import { QueryWaybillCashVouchersDto } from './dto/query-waybill-cash-vouchers.dto';
import { QueryReceiverContactsDto } from './dto/query-receiver-contacts.dto';
import { QueryWaybillsDto } from './dto/query-waybills.dto';
import { ReceiveWaybillDto, WarehouseIntakeMethod } from './dto/receive-waybill.dto';
import { UpdateCodFeeDto } from './dto/update-cod-fee.dto';
import { UpdateCodReconciliationDto } from './dto/update-cod-reconciliation.dto';
import { CorrectWaybillStatusDto, UpdateLastMileCostDto, UpdateWaybillStatusDto } from './dto/update-waybill-status.dto';
import { UpdateWaybillDto } from './dto/update-waybill.dto';
import { WaybillPriority, WaybillStatus } from './dto/waybill.enums';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { TruckStatus } from '../trucks/dto/truck.enums';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { BulkStackOntoTruckDto } from './dto/bulk-stack-onto-truck.dto';
import { BulkUpdateCustomerPaymentStatusDto } from './dto/bulk-update-customer-payment-status.dto';
import { SaveWaybillSplitsDto } from './dto/save-waybill-splits.dto';
import { QueryLoadPlanningBoardDto } from './dto/query-load-planning-board.dto';
import { UpdateSplitLoadStatusDto } from './dto/update-split-load-status.dto';
import { assertSplitLoadStatusTransition, WaybillSplitLoadStatus } from './dto/waybill-split-load-status.enum';
import { UpdateDeliveryPreparationDto } from './dto/update-delivery-preparation.dto';
import { OrdersService } from '../orders/orders.service';
import { OrderEntity } from '../orders/order.entity';
import { VendorsService } from '../vendors/vendors.service';
import { normalizeWaybillPhotos } from '../common/waybill-photos';
import { ProofOfDeliveryDto } from './dto/proof-of-delivery.dto';
import { UpdateWaybillPhotosDto } from './dto/update-waybill-photos.dto';
import { VendorEntity } from '../vendors/vendor.entity';

type WaybillRecord = WaybillEntity & Record<string, any>;
type WaybillAuditValue = string | number | boolean | null;
type WaybillAuditSnapshot = Record<string, WaybillAuditValue>;

export interface ReceiverContactSuggestion {
  phone: string;
  receiver_address: string;
  receiver_name: string | null;
  receiver_company_name: string | null;
  last_used_at: string | Date | null;
}

const FINAL_STATUSES = [WaybillStatus.DELIVERED, WaybillStatus.RETURNED, WaybillStatus.CANCELLED];
const INVENTORY_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.MANIFEST_CLOSED, WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY];
const INCOMPLETE_SPLIT_INVENTORY_STATUSES = [...INVENTORY_STATUSES, WaybillStatus.LOADED, WaybillStatus.IN_TRANSIT];
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
  WaybillStatus.CANCELLED,
];
const MUTABLE_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE];
const ROUTE_ASSIGNABLE_STATUSES = [WaybillStatus.IN_WAREHOUSE, WaybillStatus.AT_DEST_HUB];

const currentVietnamDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const parseNoteField = (note: string | null | undefined, key: string) => {
  const match = (note || '').match(new RegExp(`${key}=([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
};

const normalizeReceiverPhone = (value: string | null | undefined) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = `0${digits}`;
  return digits;
};

const normalizeReceiverAddressKey = (value: string | null | undefined) => String(value || '')
  .trim()
  .toLocaleLowerCase('vi-VN')
  .replace(/\s+/g, ' ')
  .replace(/\s*([,;])\s*/g, '$1');

const plainGoodsNote = (note: string | null | undefined) => {
  const text = (note || '').trim();
  if (!text || /(^|\|)\s*[a-z_]+\s*=/i.test(text)) return '';
  return text;
};

const userFacingWaybillNote = (note: string | null | undefined) => {
  const text = String(note || '').trim();
  if (!text) return '';
  const encodedUserNote = parseNoteField(text, 'user_note');
  if (encodedUserNote) {
    try {
      return decodeURIComponent(encodedUserNote);
    } catch {
      return encodedUserNote;
    }
  }
  return text
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !/^[a-z][a-z0-9_]*\s*=/i.test(part))
    .join(' | ');
};

const STATE_TRANSITIONS: Record<string, WaybillStatus[]> = {
  [WaybillStatus.RECEIVED]: [],
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
    @InjectRepository(WaybillChangeLogEntity) private readonly changeLogsRepository: Repository<WaybillChangeLogEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(WaybillSplitEntity) private readonly splitsRepository: Repository<WaybillSplitEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(VendorEntity) private readonly vendorsRepository: Repository<VendorEntity>,
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
      receiver_info: this.packReceiverContact(dto.receiver_name, dto.receiver_phone, dto.receiver_address),
      weight: dto.weight ?? 0,
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
      sender_name: dto.sender_name?.trim() || null,
      sender_phone: dto.sender_phone?.trim() || null,
      sender_address: dto.sender_address?.trim() || null,
      receiver_company_name: dto.receiver_company_name?.trim() || null,
      receiver_name: dto.receiver_name?.trim() || null,
      receiver_phone: dto.receiver_phone?.trim() || null,
      receiver_address: dto.receiver_address?.trim() || null,
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
      sent_date: dto.sent_date || parseNoteField(dto.note, 'ngay_gui') || currentVietnamDate(),
      received_at: null,
      received_by: null,
      created_by: currentUser.id,
      order_id: order.id,
    });

    try {
      const saved = await this.waybillsRepository.save(record);
      await this.recordWaybillChange(String(saved.id), 'CREATED', currentUser);
      return this.sanitize({ ...saved, order } as WaybillRecord, currentUser);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Waybill code already exists');
      throw error;
    }
  }

  /** Danh bạ suy ra từ vận đơn, giữ mọi cặp SĐT + địa chỉ khác nhau. */
  async findReceiverContacts(query: QueryReceiverContactsDto): Promise<ReceiverContactSuggestion[]> {
    const searchedPhone = normalizeReceiverPhone(query.phone);
    const limit = Math.min(query.limit ?? 12, 20);
    const phoneDigitsExpression = `REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(waybill.receiver_phone), ''), NULLIF(BTRIM(SPLIT_PART(waybill.receiver_info, '|', 2)), '')), '[^0-9]+', '', 'g')`;
    const normalizedPhoneExpression = `CASE
      WHEN ${phoneDigitsExpression} LIKE '84%' AND LENGTH(${phoneDigitsExpression}) >= 11
        THEN '0' || SUBSTRING(${phoneDigitsExpression} FROM 3)
      WHEN LENGTH(${phoneDigitsExpression}) = 9 AND LEFT(${phoneDigitsExpression}, 1) IN ('3', '5', '7', '8', '9')
        THEN '0' || ${phoneDigitsExpression}
      ELSE ${phoneDigitsExpression}
    END`;
    const receiverAddressExpression = `COALESCE(NULLIF(BTRIM(waybill.receiver_address), ''), NULLIF(BTRIM(SPLIT_PART(waybill.receiver_info, '|', 3)), ''))`;
    const receiverNameExpression = `COALESCE(NULLIF(BTRIM(waybill.receiver_name), ''), NULLIF(BTRIM(SPLIT_PART(waybill.receiver_info, '|', 1)), ''))`;

    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .select(normalizedPhoneExpression, 'normalized_phone')
      .addSelect(receiverAddressExpression, 'receiver_address')
      .addSelect(receiverNameExpression, 'receiver_name')
      .addSelect('waybill.receiver_company_name', 'receiver_company_name')
      .addSelect('COALESCE(waybill.updated_at, waybill.created_at)', 'last_used_at')
      .where('waybill.deleted_at IS NULL')
      .andWhere(`${normalizedPhoneExpression} <> ''`)
      .andWhere(`${receiverAddressExpression} IS NOT NULL`)
      .orderBy('COALESCE(waybill.updated_at, waybill.created_at)', 'DESC')
      .addOrderBy('waybill.id', 'DESC')
      .take(200);

    if (searchedPhone) {
      qb.andWhere(`${normalizedPhoneExpression} LIKE :receiverPhone`, {
        receiverPhone: `%${searchedPhone}%`,
      });
    }

    const rows = await qb.getRawMany<{
      normalized_phone?: string | null;
      receiver_address?: string | null;
      receiver_name?: string | null;
      receiver_company_name?: string | null;
      last_used_at?: string | Date | null;
    }>();
    const seenPhoneAddresses = new Set<string>();
    const suggestions: ReceiverContactSuggestion[] = [];

    for (const row of rows) {
      const phone = normalizeReceiverPhone(row.normalized_phone);
      const receiverAddress = row.receiver_address?.trim() || '';
      const contactKey = `${phone}\u0000${normalizeReceiverAddressKey(receiverAddress)}`;
      if (!phone || !receiverAddress || seenPhoneAddresses.has(contactKey)) continue;
      if (searchedPhone && !phone.includes(searchedPhone)) continue;

      seenPhoneAddresses.add(contactKey);
      suggestions.push({
        phone,
        receiver_address: receiverAddress,
        receiver_name: row.receiver_name?.trim() || null,
        receiver_company_name: row.receiver_company_name?.trim() || null,
        last_used_at: row.last_used_at ?? null,
      });
      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  async findAll(query: QueryWaybillsDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.waybillsRepository.createQueryBuilder('waybill').where('waybill.deleted_at IS NULL').leftJoinAndSelect('waybill.origin_hub', 'origin_hub').leftJoinAndSelect('waybill.dest_hub', 'dest_hub').leftJoinAndSelect('waybill.current_hub', 'current_hub').leftJoinAndSelect('waybill.order', 'order').leftJoinAndSelect('waybill.last_mile_driver', 'last_mile_driver');
    this.applyFilters(qb, query);
    this.applyHubScope(qb, currentUser);
    const [items, total] = await qb.orderBy('waybill.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: items.map((item) => this.sanitize(item as WaybillRecord, currentUser)), meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async getDeliveryTasks(query: QueryWaybillsDto, currentUser: UserEntity) {
    await this.activateScheduledDeliveryTasks(currentUser);
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 100);
    const requestedStatuses = this.parseList(query.status);
    const deliveryTripStatuses = !requestedStatuses.length || requestedStatuses.includes(WaybillStatus.IN_TRANSIT)
      ? [TripStatus.IN_TRANSIT, TripStatus.ARRIVED]
      : [TripStatus.ARRIVED];
    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .where('waybill.deleted_at IS NULL')
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .leftJoinAndSelect('waybill.order', 'order')
      .leftJoinAndSelect('waybill.last_mile_driver', 'last_mile_driver')
      .leftJoinAndSelect('waybill.last_mile_truck', 'last_mile_truck')
      .leftJoinAndSelect('waybill.last_mile_vendor', 'last_mile_vendor')
      .leftJoin('waybill_splits', 'delivery_split', 'delivery_split.waybill_id = waybill.id')
      .leftJoin('trips', 'delivery_trip', 'delivery_trip.id = delivery_split.trip_id')
      .andWhere(new Brackets((builder) => builder
        .where('waybill.current_state IN (:...deliveryStates)', {
          deliveryStates: [WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY],
        })
        .orWhere(
          '(delivery_trip.status IN (:...deliveryTripStatuses) AND delivery_split.load_status NOT IN (:...finishedSplitStatuses))',
          {
            deliveryTripStatuses,
            finishedSplitStatuses: [WaybillSplitLoadStatus.DELIVERED, WaybillSplitLoadStatus.RETURNED],
          },
        )))
      .distinct(true);

    this.applyFilters(qb, { ...query, status: undefined });
    this.applyHubScope(qb, currentUser);
    const assignedDeliveryHubIds = getAssignedHubIds(currentUser);
    if (!isManager(currentUser.role_mask) && !hasRole(currentUser.role_mask, Roles.ACCOUNTANT) && assignedDeliveryHubIds.length) {
      qb.andWhere('waybill.dest_hub_id IN (:...deliveryHubIds)', { deliveryHubIds: assignedDeliveryHubIds });
    }

    const waybills = await qb
      .orderBy('waybill.created_at', 'DESC')
      .addOrderBy('waybill.id', 'DESC')
      .getMany();
    const waybillIds = waybills.map((waybill) => String(waybill.id));
    const splits = waybillIds.length
      ? await this.splitsRepository.find({
        where: { waybill_id: In(waybillIds) },
        relations: ['trip', 'trip.truck', 'truck'],
        order: { loading_position: 'ASC', id: 'ASC' },
      })
      : [];
    await this.reconcileTransportStatesForTrips(
      splits.map((split) => split.trip_id).filter((tripId): tripId is string => Boolean(tripId)),
    );
    const activeSplitsByWaybill = splits.reduce<Map<string, WaybillSplitEntity[]>>((map, split) => {
      if (![TripStatus.IN_TRANSIT, TripStatus.ARRIVED].includes(split.trip?.status as TripStatus)) return map;
      if ([WaybillSplitLoadStatus.DELIVERED, WaybillSplitLoadStatus.RETURNED].includes(split.load_status)) return map;
      const rows = map.get(String(split.waybill_id)) ?? [];
      rows.push(split);
      map.set(String(split.waybill_id), rows);
      return map;
    }, new Map());

    const taskItems = waybills.flatMap((waybill) => {
      const sanitized = this.sanitize(waybill as WaybillRecord, currentUser);
      const activeSplits = activeSplitsByWaybill.get(String(waybill.id)) ?? [];
      if (activeSplits.length) {
        return activeSplits.map((split) => {
          const currentState = split.trip?.status === TripStatus.IN_TRANSIT
            ? WaybillStatus.IN_TRANSIT
            : split.load_status === WaybillSplitLoadStatus.OUT_FOR_DELIVERY
            || this.getStatus(waybill as WaybillRecord) === WaybillStatus.OUT_FOR_DELIVERY
              ? WaybillStatus.OUT_FOR_DELIVERY
              : WaybillStatus.AT_DEST_HUB;
          return {
            ...this.mapInventoryTripLine(sanitized, split),
            task_id: `split:${split.id}`,
            current_state: currentState,
            status: currentState,
            trip: split.trip ?? null,
          };
        });
      }
      const currentState = this.getStatus(waybill as WaybillRecord);
      if (![WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY].includes(currentState)) return [];
      return [{
        ...this.mapInventoryTripLine(sanitized, null),
        task_id: `waybill:${waybill.id}`,
        current_state: currentState,
        status: currentState,
      }];
    }).filter((item) => !requestedStatuses.length || requestedStatuses.includes(String(item.current_state)));

    const total = taskItems.length;
    const items = taskItems.slice((page - 1) * limit, page * limit);
    return {
      items,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async reconcileTransportStatesForTrips(tripIds: Array<string | number>): Promise<number> {
    const normalizedTripIds = [...new Set(tripIds.map((id) => String(id)).filter(Boolean))];
    if (!normalizedTripIds.length) return 0;

    const tripSplits = (await this.splitsRepository.find({
      select: { waybill_id: true, trip_id: true },
      where: { trip_id: In(normalizedTripIds) } as any,
    })) ?? [];
    const waybillIds = [...new Set(tripSplits.map((split) => String(split.waybill_id)).filter(Boolean))];
    if (!waybillIds.length) return 0;

    const [waybills, allSplits] = await Promise.all([
      this.waybillsRepository.find({ where: { id: In(waybillIds), deleted_at: IsNull() } as any }),
      this.splitsRepository.find({ where: { waybill_id: In(waybillIds) } as any }),
    ]);
    const splitsByWaybill = allSplits.reduce<Map<string, WaybillSplitEntity[]>>((map, split) => {
      const waybillId = String(split.waybill_id);
      const rows = map.get(waybillId) ?? [];
      rows.push(split);
      map.set(waybillId, rows);
      return map;
    }, new Map());
    const arrivedOrLater = new Set<WaybillSplitLoadStatus>([
      WaybillSplitLoadStatus.ARRIVED,
      WaybillSplitLoadStatus.OUT_FOR_DELIVERY,
      WaybillSplitLoadStatus.DELIVERED,
      WaybillSplitLoadStatus.RETURNED,
    ]);
    const inTransitOrLater = new Set<WaybillSplitLoadStatus>([
      WaybillSplitLoadStatus.DEPARTED,
      WaybillSplitLoadStatus.IN_TRANSIT,
      ...arrivedOrLater,
    ]);
    const stateRank = new Map<WaybillStatus, number>([
      [WaybillStatus.RECEIVED, 1],
      [WaybillStatus.IN_WAREHOUSE, 2],
      [WaybillStatus.MANIFEST_CLOSED, 3],
      [WaybillStatus.LOADED, 4],
      [WaybillStatus.IN_TRANSIT, 5],
      [WaybillStatus.AT_DEST_HUB, 6],
      [WaybillStatus.OUT_FOR_DELIVERY, 7],
      [WaybillStatus.DELIVERED, 8],
      [WaybillStatus.RETURNED, 8],
      [WaybillStatus.CANCELLED, 8],
    ]);
    const changed: WaybillEntity[] = [];

    for (const waybill of waybills) {
      const splits = splitsByWaybill.get(String(waybill.id)) ?? [];
      const allocatedPackages = splits.reduce((sum, split) => sum + Number(split.package_count ?? 0), 0);
      if (!splits.length || allocatedPackages < this.resolveTotalPackages(waybill as WaybillRecord)) continue;

      const splitStatuses = splits.map((split) => split.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD);
      const targetStatus = splitStatuses.every((status) => arrivedOrLater.has(status))
        ? WaybillStatus.AT_DEST_HUB
        : splitStatuses.every((status) => inTransitOrLater.has(status))
          ? WaybillStatus.IN_TRANSIT
          : null;
      if (!targetStatus) continue;

      const currentStatus = this.getStatus(waybill as WaybillRecord);
      if ((stateRank.get(currentStatus) ?? 0) >= (stateRank.get(targetStatus) ?? 0)) continue;

      this.setStatus(waybill as WaybillRecord, targetStatus);
      if (targetStatus === WaybillStatus.IN_TRANSIT) waybill.loaded_at = waybill.loaded_at ?? new Date();
      if (targetStatus === WaybillStatus.AT_DEST_HUB) waybill.current_hub_id = waybill.dest_hub_id;
      waybill.last_audit_action = 'TRIP_SPLIT_STATE_RECONCILE';
      waybill.last_audit_at = new Date();
      changed.push(waybill);
    }

    if (changed.length) await this.waybillsRepository.save(changed);
    return changed.length;
  }

  async updateDeliveryPreparation(id: string, dto: UpdateDeliveryPreparationDto, currentUser: UserEntity) {
    const waybill = await this.findEditable(id, currentUser);
    const previousLastMileVendorId = waybill.last_mile_vendor_id;
    const waybillStatus = this.getStatus(waybill);
    if (waybillStatus !== WaybillStatus.AT_DEST_HUB) {
      const activeDeliverySplits = await this.splitsRepository.find({
        where: { waybill_id: String(waybill.id) },
        relations: ['trip'],
      });
      const hasCallableTrip = activeDeliverySplits.some((split) => (
        [TripStatus.IN_TRANSIT, TripStatus.ARRIVED].includes(split.trip?.status as TripStatus)
        && ![WaybillSplitLoadStatus.DELIVERED, WaybillSplitLoadStatus.RETURNED].includes(split.load_status)
      ));
      if (!hasCallableTrip) {
        throw new BadRequestException('Chỉ xử lý gọi hẹn khi xe đang chạy hoặc đơn đã nhập HUB đến');
      }
    }
    const before = this.buildAuditSnapshot(waybill);
    const now = new Date();
    if (dto.status === 'SCHEDULED') {
      if (!dto.scheduled_at || dto.scheduled_at.getTime() <= now.getTime()) throw new BadRequestException('Ngày hẹn giao phải ở tương lai');
      waybill.delivery_scheduled_at = dto.scheduled_at;
      waybill.delivery_hold_reason = dto.reason?.trim() || null;
    } else if (dto.status === 'HOLD') {
      if (!dto.reason?.trim()) throw new BadRequestException('Phải nhập lý do lưu kho chờ xử lý');
      waybill.delivery_scheduled_at = null;
      waybill.delivery_hold_reason = dto.reason.trim();
    } else {
      waybill.delivery_scheduled_at = null;
      waybill.delivery_hold_reason = null;
    }
    waybill.delivery_preparation_status = dto.status;
    if (dto.status === 'READY') {
      const readyMode = dto.ready_mode
        ?? (waybill.delivery_assignment_type === 'CUSTOMER_PICKUP' ? 'CUSTOMER_PICKUP' : 'DISPATCH');
      if (readyMode === 'CUSTOMER_PICKUP') {
        Object.assign(waybill, {
          delivery_assignment_type: 'CUSTOMER_PICKUP',
          last_mile_driver_id: null,
          last_mile_truck_id: null,
          last_mile_vendor_id: null,
          last_mile_driver_name: null,
          last_mile_license_plate: null,
          last_mile_cost_amount: '0',
          xe_phat: null,
        });
      } else if (waybill.delivery_assignment_type === 'CUSTOMER_PICKUP') {
        waybill.delivery_assignment_type = null;
      }
    } else if (waybill.delivery_assignment_type === 'CUSTOMER_PICKUP') {
      waybill.delivery_assignment_type = null;
    }
    if (dto.note !== undefined) waybill.delivery_preparation_note = dto.note.trim() || null;
    waybill.delivery_confirmed_at = now;
    waybill.updated_by = currentUser.id;
    const saved = await this.waybillsRepository.save(waybill as any);
    await this.recordWaybillChange(String(saved.id), `DELIVERY_PREPARATION_${dto.status}`, currentUser, before, saved);
    if (previousLastMileVendorId && previousLastMileVendorId !== saved.last_mile_vendor_id) {
      await this.vendorsService.refreshPayableBalance(previousLastMileVendorId);
    }
    return this.sanitize(saved as WaybillRecord, currentUser);
  }

  async updateLastMileCost(id: string, dto: UpdateLastMileCostDto, currentUser: UserEntity) {
    const waybill = await this.findEditable(id, currentUser);
    if (!waybill.delivery_assignment_type || waybill.delivery_assignment_type === 'CUSTOMER_PICKUP') {
      throw new BadRequestException('Vận đơn chưa được phân giao chặng cuối');
    }
    const before = this.buildAuditSnapshot(waybill);
    waybill.last_mile_cost_amount = String(dto.amount);
    waybill.updated_by = currentUser.id;
    const saved = await this.waybillsRepository.save(waybill);
    await this.recordWaybillChange(String(saved.id), 'LAST_MILE_COST_UPDATED', currentUser, before, saved);
    if (saved.last_mile_vendor_id) await this.vendorsService.refreshPayableBalance(saved.last_mile_vendor_id);
    return this.sanitize(saved, currentUser);
  }

  private async activateScheduledDeliveryTasks(currentUser: UserEntity): Promise<void> {
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .where('waybill.deleted_at IS NULL')
      .leftJoin('waybill_splits', 'scheduled_split', 'scheduled_split.waybill_id = waybill.id')
      .leftJoin('trips', 'scheduled_trip', 'scheduled_trip.id = scheduled_split.trip_id')
      .andWhere(new Brackets((builder) => builder
        .where('waybill.current_state = :state', { state: WaybillStatus.AT_DEST_HUB })
        .orWhere('scheduled_trip.status IN (:...callableTripStatuses)', {
          callableTripStatuses: [TripStatus.IN_TRANSIT, TripStatus.ARRIVED],
        })))
      .andWhere('waybill.delivery_preparation_status = :scheduled', { scheduled: 'SCHEDULED' })
      .andWhere('waybill.delivery_scheduled_at <= :cutoff', { cutoff })
      .distinct(true);
    this.applyHubScope(qb, currentUser);
    const due = await qb.getMany();
    for (const waybill of due) {
      const before = this.buildAuditSnapshot(waybill as WaybillRecord);
      waybill.delivery_preparation_status = 'NEEDS_ACTION';
      waybill.updated_by = currentUser.id;
      const saved = await this.waybillsRepository.save(waybill);
      await this.recordWaybillChange(String(saved.id), 'DELIVERY_SCHEDULE_DUE', currentUser, before, saved as WaybillRecord);
    }
  }

  async getDeliveryResources(requestedHubId: string | undefined, currentUser: UserEntity) {
    const assignedHubIds = getAssignedHubIds(currentUser);
    const hubId = isManager(currentUser.role_mask)
      ? requestedHubId || assignedHubIds[0]
      : requestedHubId || assignedHubIds[0];
    if (hubId && !isManager(currentUser.role_mask) && !assignedHubIds.includes(String(hubId))) {
      throw new ForbiddenException('User is not assigned to this hub');
    }
    const driversQb = this.usersRepository
      .createQueryBuilder('driver')
      .where('driver.is_active = true')
      .andWhere('(driver.role_mask & :driverRole) <> 0', { driverRole: Roles.DRIVER })
      .distinct(true)
      .orderBy('driver.full_name', 'ASC');
    const drivers = await driversQb.getMany();
    const trucks = await this.trucksRepository.find({
      where: {
        status: In([TruckStatus.AVAILABLE, TruckStatus.ASSIGNED]),
        ownership_type: 'INTERNAL',
        ...(hubId ? { hub_id: String(hubId) } : {}),
      } as any,
      relations: ['driver'],
      order: { license_plate: 'ASC' },
    });
    const vendors = await this.vendorsRepository.find({
      where: { status: 'ACTIVE' } as any,
      order: { name: 'ASC' },
    });
    return {
      drivers: drivers.map((driver) => ({ id: driver.id, name: driver.full_name, username: driver.username, phone: driver.phone, hub_id: driver.hub_id })),
      trucks: trucks.map((truck) => ({ id: truck.id, license_plate: truck.license_plate, bks: truck.bks, loai_xe: truck.loai_xe, ownership_type: truck.ownership_type, hub_id: truck.hub_id, vendor_id: truck.vendor_id, driver_id: truck.driver_id, driver_name: truck.driver?.full_name ?? truck.ten_lai_xe })),
      vendors: vendors.map((vendor) => ({ id: vendor.id, code: vendor.code, name: vendor.name, phone: vendor.phone, service_type: vendor.service_type })),
    };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.waybillsRepository.findOne({
      where: { id, deleted_at: IsNull() } as any,
      relations: ['origin_hub', 'dest_hub', 'current_hub', 'last_mile_driver', 'creator', 'updater', 'cod_reconciler'],
    }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    return this.sanitize(waybill, currentUser);
  }

  async findHistory(id: string, currentUser: UserEntity): Promise<Array<Record<string, any>>> {
    await this.findOne(id, currentUser);
    const logs = await this.changeLogsRepository.find({
      where: { waybill_id: id },
      relations: ['changed_by'],
      order: { created_at: 'DESC' },
      take: 100,
    });
    const canViewPricing = isManager(currentUser.role_mask);
    const canViewCod = canViewPricing || hasRole(currentUser.role_mask, Roles.ACCOUNTANT);
    return logs.map((log) => {
      const changes = Object.fromEntries(Object.entries(log.changes || {}).filter(([field]) => {
        if (['cost_amount', 'freight_amount', 'cc_amount', 'last_mile_cost_amount'].includes(field)) return canViewPricing;
        if (['cod_amount', 'cod_collected_amount'].includes(field)) return canViewCod;
        return true;
      }));
      return {
        id: log.id,
        waybill_id: log.waybill_id,
        action: log.action,
        changes,
        changed_by_id: log.changed_by_id,
        changed_by_name: log.changed_by_name,
        created_at: log.created_at,
        changed_by: this.sanitizeUserSummary(log.changed_by),
      };
    });
  }

  async update(id: string, dto: UpdateWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    const auditBefore = this.buildAuditSnapshot(waybill);
    const collectionAmountBefore = this.getCollectOnDeliveryAmount(waybill);
    const patch: UpdateWaybillDto = { ...dto };
    const nullableReceiverPatch = patch as unknown as Record<
      'receiver_name' | 'receiver_phone' | 'receiver_address',
      string | null | undefined
    >;
    (['receiver_name', 'receiver_phone', 'receiver_address'] as const).forEach((field) => {
      if (nullableReceiverPatch[field] !== undefined) {
        nullableReceiverPatch[field] = nullableReceiverPatch[field]?.trim() || null;
      }
    });
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
    if (patch.sender_name !== undefined || patch.sender_phone !== undefined || patch.sender_address !== undefined) {
      waybill.sender_info = this.packContact(waybill.sender_name, waybill.sender_phone, waybill.sender_address);
    }
    if (patch.receiver_name !== undefined || patch.receiver_phone !== undefined || patch.receiver_address !== undefined) {
      waybill.receiver_info = this.packReceiverContact(waybill.receiver_name, waybill.receiver_phone, waybill.receiver_address);
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

    let saved = destChanged && requestedDestHubId
      ? await this.rerouteDestinationBeforeDeparture(
          id,
          requestedDestHubId,
          currentUser,
          waybill,
          originChanged,
        )
      : await this.waybillsRepository.save(waybill);
    const collectionAmountChanged = this.getCollectOnDeliveryAmount(saved as WaybillRecord) !== collectionAmountBefore;
    if (collectionAmountChanged && saved.cod_reconciled_at) {
      saved = await this.clearCodCollection(saved as WaybillRecord);
    }
    if (patch.package_count !== undefined) {
      await this.synchronizeAllocatedPackageCount(String(saved.id), Math.max(1, Number(saved.package_count ?? 1)));
    }
    if (saved.order_id) {
      await this.ordersService.syncFromWaybill(String(saved.order_id), {
        ma_kh: saved.ma_kh ?? null,
        sender_name: saved.sender_name,
        sender_phone: saved.sender_phone ?? null,
        sender_address: saved.sender_address ?? null,
        receiver_company_name: saved.receiver_company_name ?? null,
        receiver_name: saved.receiver_name ?? null,
        receiver_phone: saved.receiver_phone ?? null,
        receiver_address: saved.receiver_address ?? null,
        origin_hub_id: String(saved.origin_hub_id),
        dest_hub_id: String(saved.dest_hub_id),
        package_count: Math.max(1, Number(saved.package_count ?? 1)),
        weight: Number(saved.weight ?? 0),
        payment_type: String(saved.payment_type),
        freight_amount: String(saved.freight_amount ?? saved.cost_amount ?? 0),
        cod_amount: String(saved.cod_amount ?? 0),
        cc_amount: String(saved.cc_amount ?? 0),
        note: saved.note ?? null,
      });
    }
    await this.recordWaybillChange(String(saved.id), 'UPDATED', currentUser, auditBefore, saved);
    return this.sanitize(saved, currentUser);
  }

  async receive(id: string, dto: ReceiveWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (this.getStatus(waybill) !== WaybillStatus.RECEIVED) throw new BadRequestException('Chỉ đơn cần lấy mới được xác nhận nhập kho');
    const receiveHubId = String(waybill.current_hub_id ?? waybill.origin_hub_id);
    await this.assertHubAccess(receiveHubId, currentUser);

    let truck: TruckEntity | null = null;
    let vendor: VendorEntity | null = null;
    let driver: UserEntity | null = null;
    if (dto.intake_method === WarehouseIntakeMethod.INTERNAL && dto.truck_id) {
      truck = await this.trucksRepository.findOne({ where: { id: String(dto.truck_id) } as any, relations: ['driver'] });
      if (!truck) throw new NotFoundException('Không tìm thấy xe nội bộ đã chọn');
      if (truck.vendor_id) throw new BadRequestException('Xe đã chọn thuộc nhà cung cấp, không phải xe nội bộ');
    }
    if (dto.intake_method === WarehouseIntakeMethod.VENDOR && dto.vendor_id) {
      vendor = await this.vendorsRepository.findOne({ where: { id: String(dto.vendor_id), status: 'ACTIVE' } as any });
      if (!vendor) throw new NotFoundException('Không tìm thấy nhà cung cấp đang hoạt động');
    }
    if (dto.intake_method !== WarehouseIntakeMethod.CUSTOMER_DROPOFF && dto.driver_id) {
      driver = await this.usersRepository.findOne({ where: { id: String(dto.driver_id), is_active: true } as any });
      if (!driver || !hasRole(driver.role_mask, Roles.DRIVER)) throw new BadRequestException('Tài xế lấy hàng không hợp lệ hoặc đã ngừng hoạt động');
    } else if (truck?.driver) {
      driver = truck.driver;
    }

    const before = this.buildAuditSnapshot(waybill);
    const licensePlate = dto.intake_method === WarehouseIntakeMethod.CUSTOMER_DROPOFF
      ? null
      : dto.license_plate?.trim().toUpperCase() || truck?.bks?.trim() || truck?.license_plate?.trim() || null;
    const driverName = dto.intake_method === WarehouseIntakeMethod.CUSTOMER_DROPOFF
      ? null
      : dto.driver_name?.trim() || driver?.full_name?.trim() || truck?.ten_lai_xe?.trim() || null;
    const vendorName = dto.intake_method === WarehouseIntakeMethod.VENDOR
      ? vendor?.name?.trim() || null
      : null;
    const intakeSummary = dto.intake_method === WarehouseIntakeMethod.INTERNAL
      ? ['Xe nội bộ', licensePlate ? `BKS ${licensePlate}` : null, driverName ? `lái xe ${driverName}` : null].filter(Boolean).join(' - ')
      : dto.intake_method === WarehouseIntakeMethod.VENDOR
        ? ['Xe NCC', vendorName, licensePlate ? `BKS ${licensePlate}` : null, driverName ? `lái xe ${driverName}` : null].filter(Boolean).join(' - ')
        : 'Khách mang đến';

    this.setStatus(waybill, WaybillStatus.IN_WAREHOUSE);
    Object.assign(waybill, {
      current_hub_id: receiveHubId,
      delivery_photo_url: dto.delivery_photo_url?.trim()
        ? normalizeWaybillPhotos(dto.delivery_photo_url)
        : waybill.delivery_photo_url,
      received_at: new Date(),
      received_by: currentUser.id,
      warehouse_intake_method: dto.intake_method,
      warehouse_intake_truck_id: dto.intake_method === WarehouseIntakeMethod.INTERNAL && truck ? String(truck.id) : null,
      warehouse_intake_vendor_id: dto.intake_method === WarehouseIntakeMethod.VENDOR && vendor ? String(vendor.id) : null,
      warehouse_intake_driver_id: driver ? String(driver.id) : null,
      warehouse_intake_license_plate: licensePlate,
      warehouse_intake_driver_name: driverName,
      warehouse_intake_vendor_name: vendorName,
      warehouse_intake_note: dto.note?.trim() || null,
      xe_lay: intakeSummary,
      updated_by: currentUser.id,
      last_audit_action: 'WAREHOUSE_RECEIVED',
      last_audit_user_id: currentUser.id,
      last_audit_at: new Date(),
    });
    const saved = await this.waybillsRepository.save(waybill);
    await this.recordWaybillChange(String(saved.id), 'WAREHOUSE_RECEIVED', currentUser, before, saved);
    return this.sanitize(saved, currentUser);
  }

  async updateStatus(id: string, dto: UpdateWaybillStatusDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    const auditBefore = this.buildAuditSnapshot(waybill);
    const previousLastMileVendorId = waybill.last_mile_vendor_id;
    if (dto.status === WaybillStatus.RETURNED && !dto.failure_reason?.trim()) {
      throw new BadRequestException('Phải nhập lý do giao hàng không thành công');
    }
    if (dto.status === WaybillStatus.OUT_FOR_DELIVERY && dto.assignment_type) {
      if (!this.hasAnyRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR])) {
        throw new ForbiddenException('Chỉ điều phối hoặc quản lý được phân tuyến và phân xe giao');
      }
      await this.applyLastMileAssignment(waybill, dto, currentUser);
    }
    const splitDeliveryResult = await this.updateSplitDeliveryStatus(waybill, dto, currentUser, auditBefore);
    if (splitDeliveryResult) {
      const affectedVendorIds = [...new Set([previousLastMileVendorId, splitDeliveryResult.last_mile_vendor_id].filter((value): value is string => Boolean(value)))];
      await Promise.all(affectedVendorIds.map((vendorId) => this.vendorsService.refreshPayableBalance(vendorId)));
      return splitDeliveryResult;
    }
    const currentStatus = this.getStatus(waybill);
    if (!STATE_TRANSITIONS[currentStatus]?.includes(dto.status)) throw new BadRequestException('Invalid waybill state transition');
    if (dto.status === WaybillStatus.DELIVERED && !dto.delivery_photo_url && !waybill.delivery_photo_url) throw new BadRequestException('Delivery photo is required');
    this.setStatus(waybill, dto.status);
    Object.assign(waybill, { updated_by: currentUser.id, note: dto.note ?? waybill.note });
    if (dto.status === WaybillStatus.OUT_FOR_DELIVERY) waybill.last_delivery_failure_reason = null;
    if (dto.status === WaybillStatus.RETURNED) waybill.last_delivery_failure_reason = dto.failure_reason!.trim();
    if (dto.delivery_photo_url) waybill.delivery_photo_url = normalizeWaybillPhotos(dto.delivery_photo_url);
    if (dto.status === WaybillStatus.DELIVERED) Object.assign(waybill, { delivered_at: new Date(), delivery_time: new Date() });
    if (dto.status === WaybillStatus.RETURNED) waybill.returned_at = new Date();
    const saved = await this.saveWithAudit(waybill, currentUser, 'STATUS_CHANGE');
    const affectedVendorIds = [...new Set([previousLastMileVendorId, saved.last_mile_vendor_id].filter((value): value is string => Boolean(value)))];
    await Promise.all(affectedVendorIds.map((vendorId) => this.vendorsService.refreshPayableBalance(vendorId)));
    await this.recordWaybillChange(
      String(saved.id),
      dto.status === WaybillStatus.RETURNED ? 'DELIVERY_FAILED' : `DELIVERY_${dto.status}`,
      currentUser,
      auditBefore,
      saved,
    );
    if (dto.status === WaybillStatus.DELIVERED) {
      await this.markTripAllocationDelivered(id, dto.trip_id);
    }
    return saved;
  }

  async correctStatus(id: string, dto: CorrectWaybillStatusDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    const currentStatus = this.getStatus(waybill);
    if (![WaybillStatus.DELIVERED, WaybillStatus.RETURNED].includes(currentStatus)) {
      throw new BadRequestException('Only delivered or returned waybills can be corrected');
    }
    if (![WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY].includes(dto.status)) {
      throw new BadRequestException('Correction status must be AT_DEST_HUB or OUT_FOR_DELIVERY');
    }

    let correctedWaybillStatus: WaybillStatus = dto.status;
    if (dto.trip_id) {
      const splits = await this.splitsRepository.find({ where: { waybill_id: String(id) } });
      const allocatedPackages = splits.reduce((sum, split) => sum + Number(split.package_count ?? 0), 0);
      if (allocatedPackages < this.resolveTotalPackages(waybill)) {
        correctedWaybillStatus = WaybillStatus.IN_WAREHOUSE;
      }
    }

    this.setStatus(waybill, correctedWaybillStatus);
    Object.assign(waybill, {
      updated_by: currentUser.id,
      note: dto.note ?? waybill.note,
      delivered_at: null,
      delivery_time: null,
      returned_at: null,
    });
    const saved = await this.saveWithAudit(waybill, currentUser, 'STATUS_CORRECTION');
    await this.reopenTripAllocation(id, dto.trip_id);
    return saved;
  }

  async updatePhotos(id: string, dto: UpdateWaybillPhotosDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findEditable(id, currentUser);
    const auditBefore = this.buildAuditSnapshot(waybill);
    waybill.delivery_photo_url = normalizeWaybillPhotos(dto.delivery_photo_url);
    waybill.updated_by = currentUser.id;
    const saved = await this.waybillsRepository.save(waybill);
    await this.recordWaybillChange(String(saved.id), 'PHOTOS_UPDATED', currentUser, auditBefore, saved);
    return this.sanitize(saved, currentUser);
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
    const auditBefore = this.buildAuditSnapshot(waybill);
    const currentStatus = this.getStatus(waybill);
    if (!ROUTE_ASSIGNABLE_STATUSES.includes(currentStatus)) {
      throw new BadRequestException('Route can only be assigned in warehouse or destination hub');
    }
    if (!dto.route_code?.trim()) throw new BadRequestException('Route code is required');
    Object.assign(waybill, { route_code: dto.route_code.trim(), note: dto.note ?? waybill.note, updated_by: currentUser.id });
    const saved = await this.waybillsRepository.save(waybill);
    await this.recordWaybillChange(String(saved.id), 'DELIVERY_ROUTE_ASSIGNED', currentUser, auditBefore, saved);
    return this.sanitize(saved, currentUser);
  }

  async updateCodFee(id: string, dto: UpdateCodFeeDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    const auditBefore = this.buildAuditSnapshot(waybill);
    const collectionAmountBefore = this.getCollectOnDeliveryAmount(waybill);
    if ([dto.cod_amount, dto.freight_amount, dto.cc_amount].some((value) => value !== undefined && value < 0)) throw new BadRequestException('COD and fee amounts cannot be negative');
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill)) && !this.hasAnyRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR])) throw new ForbiddenException('Insufficient role permissions to update locked fees');
    Object.assign(waybill, { ...dto, updated_by: currentUser.id });
    let saved = await this.waybillsRepository.save(waybill);
    const collectionAmountChanged = this.getCollectOnDeliveryAmount(saved as WaybillRecord) !== collectionAmountBefore;
    if (collectionAmountChanged && saved.cod_reconciled_at) {
      saved = await this.clearCodCollection(saved as WaybillRecord);
    }
    await this.recordWaybillChange(String(saved.id), 'COD_FEE_UPDATED', currentUser, auditBefore, saved);
    return this.sanitize(saved, currentUser);
  }

  async updateCodReconciliation(id: string, dto: UpdateCodReconciliationDto, currentUser: UserEntity): Promise<WaybillRecord> {
    if (!this.hasAnyRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR])) {
      throw new ForbiddenException('Insufficient role permissions to reconcile COD');
    }

    return this.dataSource.transaction(async (manager) => {
      const waybillsRepository = manager.getRepository(WaybillEntity);
      const cashVouchersRepository = manager.getRepository(WaybillCashVoucherEntity);
      const cashFundsRepository = manager.getRepository(CashFundEntity);
      const waybill = await waybillsRepository.findOne({
        where: { id, deleted_at: IsNull() } as any,
        relations: ['origin_hub', 'dest_hub', 'current_hub'],
      }) as WaybillRecord | null;
      if (!waybill) throw new NotFoundException('Waybill not found');
      this.assertWaybillAccess(waybill, currentUser);
      const reconciliationBefore = this.getCodReconciliationSnapshot(waybill);

      if (!dto.confirmed) {
        await cashVouchersRepository.delete({ waybill_id: String(waybill.id), source_type: 'COD_COLLECTION' } as any);
        waybill.cod_reconciled_at = null;
        waybill.cod_reconciled_by = null;
        waybill.cod_fund_id = null;
        waybill.cod_collected_amount = '0';
        waybill.updated_by = currentUser.id;
        await this.applyCustomerPaymentStatus(manager, waybill);
        const saved = await waybillsRepository.save(waybill) as WaybillRecord;
        await this.recordWaybillChange(
          String(saved.id),
          'COD_RECONCILIATION_REVERSED',
          currentUser,
          undefined,
          undefined,
          this.diffCodReconciliationSnapshots(reconciliationBefore, this.getCodReconciliationSnapshot(saved)),
          manager.getRepository(WaybillChangeLogEntity),
        );
        return this.sanitize(saved, currentUser) as WaybillRecord;
      }

      const collectAmount = this.getCollectOnDeliveryAmount(waybill);
      if (collectAmount <= 0) {
        throw new BadRequestException('Bill không còn số tiền phải thu khi phát');
      }
      const fundId = dto.fund_id?.trim();
      if (!fundId) throw new BadRequestException('Vui lòng chọn sổ quỹ nhận tiền');
      const fund = await cashFundsRepository.findOne({ where: { id: fundId, is_active: true }, relations: ['hub'] });
      if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
      if (!isManager(currentUser.role_mask) && fund.hub_id && !getAssignedHubIds(currentUser).includes(String(fund.hub_id))) {
        throw new ForbiddenException('Không được ghi nhận tiền vào sổ quỹ của bưu cục khác');
      }

      const existingVoucher = await cashVouchersRepository.findOne({
        where: { waybill_id: String(waybill.id), source_type: 'COD_COLLECTION' } as any,
      });
      const voucher = existingVoucher ?? cashVouchersRepository.create({
        waybill_id: String(waybill.id),
        waybill_code: waybill.waybill_code,
        voucher_type: 'Thu',
        source_type: 'COD_COLLECTION',
        image_url: null,
        created_by_id: currentUser.id,
        created_by_name: currentUser.full_name?.trim() || currentUser.username,
      });
      Object.assign(voucher, {
        amount: String(collectAmount),
        fund_id: String(fund.id),
        note: dto.note?.trim() || null,
      });
      await cashVouchersRepository.save(voucher);

      waybill.cod_reconciled_at = new Date();
      waybill.cod_reconciled_by = currentUser.id;
      waybill.cod_fund_id = String(fund.id);
      waybill.cod_collected_amount = String(collectAmount);
      waybill.updated_by = currentUser.id;
      await this.applyCustomerPaymentStatus(manager, waybill);
      const saved = await waybillsRepository.save(waybill);
      await this.recordWaybillChange(
        String(saved.id),
        'COD_RECONCILED',
        currentUser,
        undefined,
        undefined,
        this.diffCodReconciliationSnapshots(reconciliationBefore, this.getCodReconciliationSnapshot(saved as WaybillRecord)),
        manager.getRepository(WaybillChangeLogEntity),
      );
      return this.sanitize({ ...saved, cod_fund: { id: fund.id, code: fund.code, name: fund.name } } as WaybillRecord, currentUser) as WaybillRecord;
    });
  }

  async cancel(id: string, dto: CancelWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findMutable(id, currentUser);
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) throw new BadRequestException('Only RECEIVED or IN_WAREHOUSE waybills can be cancelled');
    this.setStatus(waybill, WaybillStatus.CANCELLED);
    Object.assign(waybill, { cancelled_at: new Date(), cancel_reason: dto.reason, updated_by: currentUser.id });
    const cleared = waybill.cod_reconciled_at ? await this.clearCodCollection(waybill) : waybill;
    return this.saveWithAudit(cleared as WaybillRecord, currentUser, 'CANCEL');
  }

  async softDelete(id: string, currentUser: UserEntity): Promise<void> {
    if (!hasRole(currentUser.role_mask, Roles.DIRECTOR)) {
      throw new ForbiddenException('Only administrators can delete waybills');
    }
    const waybill = await this.findMutable(id, currentUser);
    if (!MUTABLE_STATUSES.includes(this.getStatus(waybill))) throw new BadRequestException('Cannot delete operated waybill');
    Object.assign(waybill, { deleted_at: new Date(), updated_by: currentUser.id });
    await this.waybillsRepository.save(waybill);
  }

  async getByCode(code: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findWaybillByScannedCode(code, currentUser);
    return this.sanitize(waybill, currentUser);
  }

  async resolveProofOfDelivery(code: string, currentUser: UserEntity) {
    const waybill = await this.findWaybillByScannedCode(code, currentUser);
    const alreadyDelivered = this.getStatus(waybill) === WaybillStatus.DELIVERED;
    return {
      outcome: alreadyDelivered ? 'ALREADY_DELIVERED' : 'READY',
      waybill: {
        id: String(waybill.id),
        waybill_code: waybill.waybill_code,
        current_state: this.getStatus(waybill),
        delivery_photo_url: waybill.delivery_photo_url ?? null,
      },
    };
  }

  async confirmProofOfDelivery(dto: ProofOfDeliveryDto, currentUser: UserEntity) {
    const waybill = await this.findWaybillByScannedCode(dto.waybill_code, currentUser);
    if (this.getStatus(waybill) === WaybillStatus.DELIVERED) {
      return {
        outcome: 'ALREADY_DELIVERED',
        waybill: this.sanitize(waybill, currentUser),
      };
    }

    const auditBefore = this.buildAuditSnapshot(waybill);
    waybill.delivery_photo_url = normalizeWaybillPhotos(
      [waybill.delivery_photo_url, dto.photo_url.trim()].filter(Boolean).join('|'),
    );
    this.setStatus(waybill, WaybillStatus.DELIVERED);
    Object.assign(waybill, {
      delivered_at: new Date(),
      delivery_time: new Date(),
      updated_by: currentUser.id,
    });
    const saved = await this.saveWithAudit(waybill, currentUser, 'PROOF_OF_DELIVERY');
    await this.recordWaybillChange(
      String(waybill.id),
      'PROOF_OF_DELIVERY',
      currentUser,
      auditBefore,
      waybill,
    );
    await this.markTripAllocationDelivered(String(waybill.id));
    return { outcome: 'SUCCESS', waybill: saved };
  }

  private async findWaybillByScannedCode(code: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const rawCode = code.trim();
    if (!rawCode) throw new BadRequestException('Waybill code is required');
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
    return waybill;
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
    const onlyIncompleteSplit = this.isTruthyQueryFlag(query.only_incomplete_split);
    const isGlobalInventoryScope = query.list_scope === 'all_inventory';
    const isGlobalListScope = query.list_scope === 'all_orders' || isGlobalInventoryScope;
    const defaultStatuses = query.list_scope === 'all_orders'
      ? ALL_ORDER_LIST_STATUSES.join(',')
      : onlyIncompleteSplit
        ? INCOMPLETE_SPLIT_INVENTORY_STATUSES.join(',')
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
      .leftJoinAndSelect('waybill.current_hub', 'current_hub')
      .leftJoinAndSelect('waybill.order', 'order')
      .leftJoinAndSelect('waybill.last_mile_driver', 'last_mile_driver')
      .leftJoinAndSelect('waybill.last_mile_truck', 'last_mile_truck')
      .leftJoinAndSelect('waybill.last_mile_vendor', 'last_mile_vendor');
    this.applyFilters(qb, inventoryQuery);
    if (!isGlobalListScope) {
      this.applyHubScope(qb, currentUser);
    }

    const vendorId = query.vendor_id?.trim();
    if (vendorId) {
      qb.distinct(true)
        .leftJoin('waybill_splits', 'vendor_split', 'vendor_split.waybill_id = waybill.id')
        .leftJoin('trucks', 'vendor_split_truck', 'vendor_split_truck.id = vendor_split.truck_id')
        .leftJoin('trips', 'vendor_split_trip', 'vendor_split_trip.id = vendor_split.trip_id')
        .leftJoin('trucks', 'vendor_trip_truck', 'vendor_trip_truck.id = vendor_split_trip.truck_id')
        .andWhere(
          '(waybill.last_mile_vendor_id = :vendorId OR vendor_split_truck.vendor_id = :vendorId OR vendor_trip_truck.vendor_id = :vendorId)',
          { vendorId },
        );
    }

    this.applyIncompleteSplitFilter(qb, query.only_incomplete_split);

    const includeTripHistory = query.list_scope === 'all_orders';
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
        .addOrderBy('waybill.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
    ]);
    const { totalWaybills, totalFreight } = summary;

    const waybillIds = waybills.map((waybill) => waybill.id);
    const splits = waybillIds.length
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
      const belongsToLastMileVendor = Boolean(vendorId) && String(waybill.last_mile_vendor_id || '') === vendorId;

      if (includeTripHistory) {
        const line = this.mapInventoryTripLine(sanitized, null);
        const tripHistory = waybillSplits
          .map((split) => {
            const truck = split.truck ?? split.trip?.truck ?? null;
            return {
              split_id: split.id,
              trip_id: split.trip_id,
              manifest_id: split.trip?.manifest_id ?? null,
              package_count: Number(split.package_count ?? 0),
              license_plate: truck?.bks ?? truck?.license_plate ?? null,
              carrier_label: split.carrier_label ?? truck?.nha_xe ?? null,
              departure_time: split.trip?.departure_time ?? null,
              expected_arrival_time: split.trip?.expected_arrival_time ?? split.expected_arrival_at ?? null,
              arrival_time: split.trip?.arrival_time ?? null,
              status: split.trip?.status ?? null,
              loading_position: split.loading_position ?? null,
            };
          })
          .sort((left, right) => {
            const leftTime = left.departure_time ? new Date(left.departure_time).getTime() : 0;
            const rightTime = right.departure_time ? new Date(right.departure_time).getTime() : 0;
            if (leftTime !== rightTime) return leftTime - rightTime;
            return String(left.trip_id ?? '').localeCompare(String(right.trip_id ?? ''), 'en', { numeric: true });
          });
        const allocatedPackages = tripHistory.reduce((sum, trip) => sum + trip.package_count, 0);
        const remainingPackages = Math.max(0, this.resolveTotalPackages(waybill as WaybillRecord) - allocatedPackages);
        return [{
          ...line,
          remaining_packages: remainingPackages,
          trip_label: tripHistory.length
            ? `${tripHistory.length} chuyến · ${allocatedPackages} kiện đã phân xe`
            : 'Chưa phân xe',
          trip_history: tripHistory,
        }];
      }

      if (onlyIncompleteSplit) {
        const totalPackages = this.resolveTotalPackages(waybill as WaybillRecord);
        const allocated = waybillSplits.reduce((sum, row) => sum + Number(row.package_count ?? 0), 0);
        const remaining = totalPackages - allocated;
        if (remaining <= 0) return [];
        return [this.mapInventoryTripLine(sanitized, null, remaining)];
      }

      if (belongsToLastMileVendor) {
        const line = this.mapInventoryTripLine(sanitized, null);
        return [{
          ...line,
          license_plate: waybill.last_mile_license_plate,
          trip_nha_xe: waybill.last_mile_driver_name,
          allocated_freight: Number(waybill.last_mile_cost_amount ?? 0),
        }];
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
    const assignedHubIds = getAssignedHubIds(currentUser);
    return this.findAll({ ...query, dest_hub_id: query.dest_hub_id ?? (assignedHubIds.length ? assignedHubIds.join(',') : undefined) }, currentUser);
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
      relations: ['fund'],
      order: { created_at: 'DESC' },
    });
  }

  async createCashVoucher(waybillId: string, dto: CreateWaybillCashVoucherDto, currentUser: UserEntity) {
    const waybill = await this.waybillsRepository.findOne({
      where: { id: waybillId, deleted_at: IsNull() } as any,
    }) as WaybillRecord | null;
    if (!waybill) throw new NotFoundException('Waybill not found');
    this.assertWaybillAccess(waybill, currentUser);
    const expectedWaybillCode = dto.waybill_code?.trim();
    if (
      expectedWaybillCode
      && expectedWaybillCode.toLocaleUpperCase('vi-VN') !== waybill.waybill_code.trim().toLocaleUpperCase('vi-VN')
    ) {
      throw new ConflictException(
        `Bill đã chọn không khớp: yêu cầu ${expectedWaybillCode}, dữ liệu hiện tại là ${waybill.waybill_code}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const cashVouchersRepository = manager.getRepository(WaybillCashVoucherEntity);
      const waybillsRepository = manager.getRepository(WaybillEntity);
      const fund = await this.findActiveCashFund(manager, dto.fund_id, currentUser);
      const paymentSummary = await cashVouchersRepository.createQueryBuilder('voucher')
        .select(
          `COALESCE(SUM(CASE WHEN LOWER(voucher.voucher_type) = 'thu' THEN voucher.amount ELSE -voucher.amount END), 0)`,
          'net_paid',
        )
        .where('voucher.waybill_id = :waybillId', { waybillId: String(waybill.id) })
        .getRawOne<{ net_paid: string }>();
      const paidBefore = Number(paymentSummary?.net_paid) || 0;
      const totalDue = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
      const collectAmount = this.getCollectOnDeliveryAmount(waybill);
      const maximumReceivable = Math.max(totalDue, collectAmount);
      const remainingBefore = Math.max(0, maximumReceivable - paidBefore);
      const customerCreditBefore = Math.max(0, paidBefore - totalDue);
      if (dto.source_type === 'CUSTOMER_PAYOUT') {
        if (dto.voucher_type !== 'Chi') {
          throw new BadRequestException('Phiếu chi trả khách phải là loại Chi');
        }
        if (dto.amount > customerCreditBefore) {
          throw new BadRequestException(
            customerCreditBefore <= 0
              ? `Bill ${waybill.waybill_code} không có tiền dư để chi trả khách`
              : `Số tiền chi vượt quá số dư ${customerCreditBefore.toLocaleString('vi-VN')} đ của bill ${waybill.waybill_code}`,
          );
        }
      }
      if (dto.voucher_type === 'Thu' && (maximumReceivable <= 0 || dto.amount > remainingBefore)) {
        throw new BadRequestException(
          maximumReceivable <= 0
            ? `Bill ${waybill.waybill_code} chưa có số tiền cần thanh toán`
            : `Số tiền vượt quá số còn lại cần thu của bill ${waybill.waybill_code}`,
        );
      }

      const record = cashVouchersRepository.create({
        waybill_id: String(waybill.id),
        waybill_code: waybill.waybill_code,
        voucher_type: dto.voucher_type,
        source_type: dto.source_type ?? 'MANUAL',
        amount: String(dto.amount),
        fund_id: String(fund.id),
        note: dto.note?.trim() || null,
        image_url: dto.image_url?.trim() || null,
        created_by_id: currentUser.id,
        created_by_name: currentUser.full_name?.trim() || currentUser.username,
      });
      const saved = await cashVouchersRepository.save(record);
      const netPaid = paidBefore + (dto.voucher_type === 'Thu' ? dto.amount : -dto.amount);
      const nextPaymentStatus = totalDue > 0 && netPaid >= totalDue
        ? CustomerPaymentStatus.PAID
        : waybill.customer_payment_status === CustomerPaymentStatus.PAID
          ? null
          : waybill.customer_payment_status ?? null;

      let waybillChanged = nextPaymentStatus !== (waybill.customer_payment_status ?? null);
      const reconciliationBefore = this.getCodReconciliationSnapshot(waybill);
      if (waybillChanged) {
        waybill.customer_payment_status = nextPaymentStatus;
      }

      if (dto.voucher_type === 'Thu') {
        if (collectAmount > 0 && !waybill.cod_reconciled_at) {
          const fundSummary = await cashVouchersRepository.createQueryBuilder('voucher')
            .select(`COALESCE(SUM(CASE WHEN LOWER(voucher.voucher_type) = 'thu' THEN voucher.amount ELSE -voucher.amount END), 0)`, 'net_paid')
            .where('voucher.waybill_id = :waybillId', { waybillId: String(waybill.id) })
            .andWhere('voucher.fund_id IS NOT NULL')
            .getRawOne<{ net_paid: string }>();
          if ((Number(fundSummary?.net_paid) || 0) >= collectAmount) {
            waybill.cod_reconciled_at = new Date();
            waybill.cod_reconciled_by = currentUser.id;
            waybill.cod_fund_id = String(fund.id);
            waybill.cod_collected_amount = String(collectAmount);
            waybillChanged = true;
          }
        }
      }
      if (waybillChanged) {
        waybill.updated_by = currentUser.id;
        const savedWaybill = await waybillsRepository.save(waybill) as WaybillRecord;
        await this.recordWaybillChange(
          String(savedWaybill.id),
          'COD_RECONCILED',
          currentUser,
          undefined,
          undefined,
          this.diffCodReconciliationSnapshots(reconciliationBefore, this.getCodReconciliationSnapshot(savedWaybill)),
          manager.getRepository(WaybillChangeLogEntity),
        );
      }

      return {
        ...saved,
        customer_payment_status: nextPaymentStatus,
      };
    });
  }

  async createBulkCashPayment(dto: CreateBulkWaybillPaymentDto, currentUser: UserEntity) {
    const waybillIds = dto.items.map((item) => String(item.waybill_id));
    if (new Set(waybillIds).size !== waybillIds.length) {
      throw new BadRequestException('Mỗi bill chỉ được chọn một lần trong một lượt thanh toán');
    }

    return this.dataSource.transaction(async (manager) => {
      const cashVouchersRepository = manager.getRepository(WaybillCashVoucherEntity);
      const waybillsRepository = manager.getRepository(WaybillEntity);
      const fund = await this.findActiveCashFund(manager, dto.fund_id, currentUser);
      const waybills = await waybillsRepository.find({
        where: { id: In(waybillIds), deleted_at: IsNull() } as any,
      }) as WaybillRecord[];
      if (waybills.length !== waybillIds.length) throw new NotFoundException('Một hoặc nhiều bill không tồn tại');

      const waybillById = new Map(waybills.map((waybill) => [String(waybill.id), waybill]));
      const existingVouchers = await cashVouchersRepository.find({
        where: { waybill_id: In(waybillIds) },
      });
      const paidByWaybillId = existingVouchers.reduce<Map<string, number>>((totals, voucher) => {
        const waybillId = String(voucher.waybill_id);
        const amount = Number(voucher.amount) || 0;
        const delta = String(voucher.voucher_type).toLowerCase() === 'thu' ? amount : -amount;
        totals.set(waybillId, (totals.get(waybillId) ?? 0) + delta);
        return totals;
      }, new Map());
      const fundPaidByWaybillId = existingVouchers.reduce<Map<string, number>>((totals, voucher) => {
        if (!voucher.fund_id) return totals;
        const waybillId = String(voucher.waybill_id);
        const amount = Number(voucher.amount) || 0;
        const delta = String(voucher.voucher_type).toLowerCase() === 'thu' ? amount : -amount;
        totals.set(waybillId, (totals.get(waybillId) ?? 0) + delta);
        return totals;
      }, new Map());

      const records = dto.items.map((item) => {
        const waybill = waybillById.get(String(item.waybill_id));
        if (!waybill) throw new NotFoundException(`Bill ${item.waybill_code} không tồn tại`);
        this.assertWaybillAccess(waybill, currentUser);
        if (item.waybill_code.trim().toLocaleUpperCase('vi-VN') !== waybill.waybill_code.trim().toLocaleUpperCase('vi-VN')) {
          throw new ConflictException(
            `Bill đã chọn không khớp: yêu cầu ${item.waybill_code}, dữ liệu hiện tại là ${waybill.waybill_code}`,
          );
        }

        const totalDue = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
        const paidBefore = paidByWaybillId.get(String(waybill.id)) ?? 0;
        const remainingBefore = Math.max(0, totalDue - paidBefore);
        if (totalDue <= 0 || item.amount > remainingBefore) {
          throw new BadRequestException(
            totalDue <= 0
              ? `Bill ${waybill.waybill_code} chưa có số tiền cần thanh toán`
              : `Số tiền vượt quá số còn lại của bill ${waybill.waybill_code}`,
          );
        }
        paidByWaybillId.set(String(waybill.id), paidBefore + item.amount);
        fundPaidByWaybillId.set(String(waybill.id), (fundPaidByWaybillId.get(String(waybill.id)) ?? 0) + item.amount);

        return cashVouchersRepository.create({
          waybill_id: String(waybill.id),
          waybill_code: waybill.waybill_code,
          voucher_type: 'Thu',
          source_type: 'MANUAL',
          amount: String(item.amount),
          fund_id: String(fund.id),
          note: dto.note?.trim() || null,
          image_url: null,
          created_by_id: currentUser.id,
          created_by_name: currentUser.full_name?.trim() || currentUser.username,
        });
      });

      const saved = await cashVouchersRepository.save(records);
      const reconciliationBeforeById = new Map(waybills.map((waybill) => [
        String(waybill.id),
        this.getCodReconciliationSnapshot(waybill),
      ]));
      const changedWaybills = waybills.filter((waybill) => {
        const totalDue = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
        const netPaid = paidByWaybillId.get(String(waybill.id)) ?? 0;
        const nextStatus = totalDue > 0 && netPaid >= totalDue
          ? CustomerPaymentStatus.PAID
          : waybill.customer_payment_status === CustomerPaymentStatus.PAID
            ? null
            : waybill.customer_payment_status ?? null;
        let changed = nextStatus !== (waybill.customer_payment_status ?? null);
        if (changed) waybill.customer_payment_status = nextStatus;
        const collectAmount = this.getCollectOnDeliveryAmount(waybill);
        if (collectAmount > 0 && !waybill.cod_reconciled_at && (fundPaidByWaybillId.get(String(waybill.id)) ?? 0) >= collectAmount) {
          waybill.cod_reconciled_at = new Date();
          waybill.cod_reconciled_by = currentUser.id;
          waybill.cod_fund_id = String(fund.id);
          waybill.cod_collected_amount = String(collectAmount);
          changed = true;
        }
        if (changed) waybill.updated_by = currentUser.id;
        return changed;
      });
      if (changedWaybills.length) await waybillsRepository.save(changedWaybills);
      for (const waybill of changedWaybills) {
        await this.recordWaybillChange(
          String(waybill.id),
          'COD_RECONCILED',
          currentUser,
          undefined,
          undefined,
          this.diffCodReconciliationSnapshots(
            reconciliationBeforeById.get(String(waybill.id))!,
            this.getCodReconciliationSnapshot(waybill),
          ),
          manager.getRepository(WaybillChangeLogEntity),
        );
      }

      return {
        items: saved,
        updated_waybill_ids: waybillIds,
      };
    });
  }

  async searchCashVouchers(query: QueryWaybillCashVouchersDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 200);

    const qb = this.cashVouchersRepository.createQueryBuilder('voucher')
      .innerJoinAndSelect('voucher.waybill', 'waybill')
      .leftJoinAndSelect('voucher.fund', 'fund')
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
    if (this.getStatus(waybill) === WaybillStatus.RECEIVED) {
      throw new BadRequestException('Phải xác nhận đã nhập kho trước khi chia đơn hoặc phân xe');
    }
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

  async releaseUnassignedPackageSplits(id: string, currentUser: UserEntity) {
    await this.findMutable(id, currentUser);
    const unassignedSplits = await this.splitsRepository.find({
      where: { waybill_id: id, trip_id: IsNull() } as any,
    });
    if (!unassignedSplits.length) {
      throw new BadRequestException('Vận đơn không có phân xe rời để nhả');
    }
    await this.splitsRepository.delete({
      id: In(unassignedSplits.map((split) => split.id)),
    });
    return { released_count: unassignedSplits.length };
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
    const stackDepartureTime = dto.departure_time ? new Date(dto.departure_time) : new Date();
    const sharedVendorCostProvided = dto.vendor_cost != null;
    const sharedVendorCost = sharedVendorCostProvided
      ? this.normalizeStackVendorCost(dto.vendor_cost!)
      : 0;
    const legacyVendorCosts = dto.items.map((line) => (
      line.vendor_cost != null ? this.normalizeStackVendorCost(line.vendor_cost) : 0
    ));
    const truckIds = [...new Set(dto.items.map((line) => line.truck_id?.trim()).filter((value): value is string => Boolean(value)))];
    if (sharedVendorCostProvided && truckIds.length > 1) {
      throw new BadRequestException('Shared vendor cost requires all waybills to use the same truck or carrier');
    }

    const selectedVendorId = dto.vendor_id?.trim() || null;
    const selectedVendor = selectedVendorId
      ? await this.vendorsService.findOne(selectedVendorId)
      : null;
    if (selectedVendor?.status && selectedVendor.status.toUpperCase() !== 'ACTIVE') {
      throw new BadRequestException('Selected vendor is not active');
    }
    if (!selectedVendor && !truckIds.length) {
      throw new BadRequestException('Select a vendor or truck before stacking');
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
      is_fully_allocated: boolean;
      split_id: string;
      expected_arrival_at: Date | null;
      truck_id: string | null;
      vendor_id: string | null;
      vendor_cost: number;
      license_plate: string | null;
    }> = [];
    const preparedRows: Array<{
      line: BulkStackOntoTruckDto['items'][number];
      line_index: number;
      waybill: WaybillRecord;
      truck: TruckEntity | null;
      package_count: number;
      total_packages: number;
      is_fully_allocated: boolean;
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
      if (this.getStatus(waybill) === WaybillStatus.RECEIVED) {
        throw new BadRequestException(`Vận đơn ${waybill.waybill_code} chưa được xác nhận nhập kho`);
      }
      if (FINAL_STATUSES.includes(this.getStatus(waybill))) {
        throw new BadRequestException(`Waybill ${waybill.waybill_code} cannot be stacked`);
      }

      const truck = line.truck_id ? trucksById.get(String(line.truck_id)) ?? null : null;
      if (line.truck_id && !truck) throw new NotFoundException(`Truck ${line.truck_id} not found`);

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
        waybill.dest_hub?.code,
        waybill.dest_hub?.name,
        waybill.dest_hub?.transit_days,
      );
      const carrierLabel = truck?.nha_xe?.trim()
        || truck?.vendor?.name?.trim()
        || truck?.bks?.trim()
        || truck?.license_plate?.trim()
        || selectedVendor?.name?.trim()
        || null;

      preparedRows.push({
        line,
        line_index: lineIndex,
        waybill,
        truck,
        package_count: packageCount,
        total_packages: totalPackages,
        is_fully_allocated: allocated + packageCount >= totalPackages,
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
        is_fully_allocated: isFullyAllocated,
        expected_arrival_at: expectedArrivalAt,
        carrier_label: carrierLabel,
      } = prepared;

      const split = await this.splitsRepository.save(this.splitsRepository.create({
        waybill_id: String(line.waybill_id),
        truck_id: line.truck_id ? String(line.truck_id) : null,
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
        license_plate: truck?.bks ?? truck?.license_plate ?? null,
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
        is_fully_allocated: isFullyAllocated,
        split_id: String(split.id),
        expected_arrival_at: split.expected_arrival_at,
        truck_id: line.truck_id ? String(line.truck_id) : null,
        vendor_id: truck?.vendor_id ? String(truck.vendor_id) : selectedVendorId,
        vendor_cost: vendorDebtAmount ?? 0,
        license_plate: truck?.bks ?? truck?.license_plate ?? null,
      });
    }

    const routeGroups = [...stackedRows.reduce((groups, row) => {
      const key = [
        String(row.truck_id ?? row.vendor_id ?? 'NO_CARRIER'),
        String(row.waybill.origin_hub_id),
      ].join(':');
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
      return groups;
    }, new Map<string, typeof stackedRows>()).values()].sort((left, right) => {
      const leftKey = [left[0].truck_id ?? left[0].vendor_id, left[0].waybill.origin_hub_id]
        .map(String)
        .join(':');
      const rightKey = [right[0].truck_id ?? right[0].vendor_id, right[0].waybill.origin_hub_id]
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
      group.sort((a, b) => (a.expected_arrival_at?.getTime() ?? 0) - (b.expected_arrival_at?.getTime() ?? 0));
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
    truckId: string | null,
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

  private async createClosedManifestForStack(rows: Array<{ waybill: WaybillRecord; loading_position: number | null; package_count: number; expected_arrival_at?: Date | null; is_fully_allocated?: boolean }>, currentUser: UserEntity) {
    const firstWaybill = rows[0]?.waybill;
    if (!firstWaybill) return null;

    const manifest = this.manifestsRepository.create({
      manifest_code: await this.generateInventoryManifestCode(),
      seal_code: `AUTO-${Date.now()}`,
      origin_hub_id: String(firstWaybill.origin_hub_id),
      dest_hub_id: String(rows[rows.length - 1]?.waybill.dest_hub_id ?? firstWaybill.dest_hub_id),
      status: ManifestStatus.CLOSED,
    } as any) as unknown as ManifestEntity & Record<string, any>;

    Object.assign(manifest, {
      total_waybills: rows.length,
      total_weight: rows.reduce((sum, row) => {
        const totalPackages = this.resolveTotalPackages(row.waybill);
        return sum + Number(row.waybill.weight ?? 0) * (row.package_count / totalPackages);
      }, 0),
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
      dispatch_fields: { so_luong: String(row.package_count), expected_arrival_at: row.expected_arrival_at?.toISOString() ?? null },
    })));

    const fullyAllocatedWaybills = rows.filter((row) => row.is_fully_allocated !== false);
    fullyAllocatedWaybills.forEach((row) => {
      row.waybill.current_state = WaybillStatus.MANIFEST_CLOSED as any;
      row.waybill.status = WaybillStatus.MANIFEST_CLOSED as any;
      row.waybill.manifest_id = String(savedManifest.id);
      row.waybill.loaded_at = row.waybill.loaded_at ?? new Date();
    });
    if (fullyAllocatedWaybills.length) {
      await this.waybillsRepository.save(fullyAllocatedWaybills.map((row) => row.waybill as WaybillEntity));
    }

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
      ? [WaybillStatus.IN_WAREHOUSE, WaybillStatus.IN_TRANSIT]
      : [WaybillStatus.IN_WAREHOUSE];
    const qb = this.splitsRepository.createQueryBuilder('split')
      .innerJoinAndSelect('split.waybill', 'waybill')
      .leftJoinAndSelect('split.truck', 'truck')
      .leftJoinAndSelect('split.trip', 'trip')
      .leftJoinAndSelect('trip.truck', 'trip_truck')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .leftJoinAndSelect('waybill.order', 'order')
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
    const note = userFacingWaybillNote(split.note) || userFacingWaybillNote(waybill.note);
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
        hubCode,
        waybill.dest_hub?.transit_days,
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
      note: waybill.note,
      split_note: split.note?.trim() || null,
      load_status: split.load_status ?? WaybillSplitLoadStatus.WAITING_LOAD,
      current_state: waybill.current_state,
      delivered_at: waybill.delivered_at,
      delivery_time: waybill.delivery_time,
    };
  }

  private parseContactPhone(info?: string | null): string {
    if (!info) return '';
    const parts = info.split('|').map((part) => part.trim());
    return parts[1] ?? '';
  }

  private computeExpectedArrivalAt(base: Date | string = new Date(), hubCode?: string | null, transitDays?: number | null): Date {
    const date = base instanceof Date ? new Date(base.getTime()) : new Date(base);
    date.setDate(date.getDate() + this.expectedArrivalOffsetDays(hubCode, null, transitDays));
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

  private resolveStackExpectedArrivalAt(
    departureTime: Date,
    explicit?: Date | string | null,
    hubCode?: string | null,
    hubName?: string | null,
    transitDays?: number | null,
  ): Date {
    const expectedArrival = explicit
      ? new Date(explicit)
      : new Date(departureTime.getTime() + this.expectedArrivalOffsetDays(hubCode, hubName, transitDays) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expectedArrival.getTime()) || expectedArrival.getTime() <= departureTime.getTime()) {
      throw new BadRequestException('Expected arrival time must be after stack departure time');
    }
    return expectedArrival;
  }

  private expectedArrivalOffsetDays(hubCode?: string | null, hubName?: string | null, transitDays?: number | null): number {
    const configuredDays = Number(transitDays);
    if (Number.isInteger(configuredDays) && configuredDays > 0) return configuredDays;
    const key = `${hubCode || ''}${hubName || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'D')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    if (['DANANG', 'QUANGNAM', 'QUANGBINH', 'NGHEAN'].some((value) => key.includes(value))) return 1;
    if (['KHANHHOA', 'BINHDINH', 'NINHTHUAN', 'BINHTHUAN'].some((value) => key.includes(value))) return 2;
    if (key.includes('HCM') || key.includes('HOCHIMINH')) return 3;
    return 3;
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
    if (Number.isFinite(fromWaybill) && fromWaybill >= 1) return fromWaybill;
    const fromOrder = Number(waybill.order?.package_count ?? 0);
    return Number.isFinite(fromOrder) && fromOrder >= 1 ? fromOrder : 1;
  }

  /**
   * Khi sửa tổng số kiện của bill, các dòng đã phân xe không được phép giữ tổng
   * lớn hơn số mới. Giảm từ dòng phân mới nhất trước để giữ nguyên các chuyến
   * cũ tối đa có thể, đồng thời cập nhật số lượng dùng bởi bảng kê/in bảng kê.
   */
  private async synchronizeAllocatedPackageCount(waybillId: string, totalPackages: number): Promise<void> {
    const splits = await this.splitsRepository.find({
      where: { waybill_id: waybillId },
      relations: ['trip'],
      order: { created_at: 'ASC', id: 'ASC' },
    });
    const allocatedPackages = splits.reduce((sum, split) => sum + Number(split.package_count ?? 0), 0);
    if (allocatedPackages <= totalPackages) return;

    let excess = allocatedPackages - totalPackages;
    const changedSplits: WaybillSplitEntity[] = [];
    const removedSplitIds: string[] = [];

    for (let index = splits.length - 1; index >= 0 && excess > 0; index -= 1) {
      const split = splits[index];
      const packageCount = Math.max(0, Number(split.package_count ?? 0));
      if (packageCount <= excess) {
        excess -= packageCount;
        removedSplitIds.push(String(split.id));
        continue;
      }
      split.package_count = packageCount - excess;
      excess = 0;
      changedSplits.push(split);
    }

    if (changedSplits.length) await this.splitsRepository.save(changedSplits);
    if (removedSplitIds.length) await this.splitsRepository.delete({ id: In(removedSplitIds) });

    const removed = new Set(removedSplitIds);
    const remainingSplits = splits.filter((split) => !removed.has(String(split.id)));
    const quantityByManifest = remainingSplits.reduce<Map<string, number>>((map, split) => {
      const manifestId = split.trip?.manifest_id ? String(split.trip.manifest_id) : '';
      if (!manifestId) return map;
      map.set(manifestId, (map.get(manifestId) ?? 0) + Number(split.package_count ?? 0));
      return map;
    }, new Map());

    const links = await this.manifestWaybillsRepository.find({
      where: { waybill_id: waybillId },
      order: { manifest_id: 'ASC' },
    });
    if (!links.length) return;

    const updatedLinks: ManifestWaybillEntity[] = [];
    const removedLinks: Array<{ manifest_id: string; waybill_id: string }> = [];
    let unmappedRemaining = remainingSplits.reduce((sum, split) => sum + Number(split.package_count ?? 0), 0)
      - [...quantityByManifest.values()].reduce((sum, quantity) => sum + quantity, 0);

    const mappedLinks = links.filter((link) => quantityByManifest.has(String(link.manifest_id)));
    const unmappedLinks = links.filter((link) => !quantityByManifest.has(String(link.manifest_id)));
    for (const link of [...mappedLinks, ...unmappedLinks]) {
      const manifestId = String(link.manifest_id);
      const mappedQuantity = quantityByManifest.get(manifestId);
      const currentQuantity = Math.max(0, Number(link.dispatch_fields?.so_luong ?? 0));
      const quantity = mappedQuantity ?? Math.min(currentQuantity, Math.max(0, unmappedRemaining));
      if (mappedQuantity === undefined) unmappedRemaining = Math.max(0, unmappedRemaining - quantity);
      if (quantity <= 0) {
        removedLinks.push({ manifest_id: manifestId, waybill_id: waybillId });
        continue;
      }
      link.dispatch_fields = { ...(link.dispatch_fields ?? {}), so_luong: String(quantity) };
      updatedLinks.push(link);
    }

    if (updatedLinks.length) await this.manifestWaybillsRepository.save(updatedLinks);
    for (const link of removedLinks) await this.manifestWaybillsRepository.delete(link);
  }

  private readonly totalPackagesSqlExpr = `GREATEST(1, COALESCE(
    NULLIF(waybill.package_count, 0),
    (SELECT o.package_count FROM orders o WHERE o.id = waybill.order_id),
    1
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

  private async applyLastMileAssignment(
    waybill: WaybillRecord,
    dto: UpdateWaybillStatusDto,
    currentUser: UserEntity,
  ): Promise<void> {
    if (waybill.delivery_preparation_status && waybill.delivery_preparation_status !== 'READY') {
      throw new BadRequestException('Vận đơn phải được xác nhận sẵn sàng giao trước khi điều phối');
    }
    const assignmentType = dto.assignment_type;
    if (!assignmentType) throw new BadRequestException('Phải chọn xe nội bộ, xe đối tác hoặc xe công nghệ');
    const routeCode = dto.route_code?.trim() || waybill.route_code?.trim();
    waybill.route_code = routeCode || null;
    const manualDriverName = dto.driver_name?.trim() || '';
    const manualLicensePlate = dto.license_plate?.trim().toUpperCase() || '';
    const deliveryCost = Number(dto.delivery_cost ?? waybill.last_mile_cost_amount ?? 0);
    if (!Number.isFinite(deliveryCost) || deliveryCost < 0) throw new BadRequestException('Cước giao chặng cuối không hợp lệ');

    if (assignmentType === 'INTERNAL') {
      const driverId = String(dto.driver_id || ((currentUser.role_mask & Roles.DRIVER) !== 0 ? currentUser.id : '')).trim();
      const driver = driverId
        ? await this.usersRepository.findOne({
          where: { id: driverId, is_active: true } as any,
        })
        : null;
      if (driverId && (!driver || (driver.role_mask & Roles.DRIVER) === 0)) throw new BadRequestException('Tài xế nội bộ không hợp lệ');
      const driverName = manualDriverName || driver?.full_name?.trim() || '';
      if (!driverName) throw new BadRequestException('Phải nhập hoặc chọn tài xế nội bộ');

      let truck: TruckEntity | null = null;
      if (dto.truck_id) {
        truck = await this.trucksRepository.findOne({ where: { id: String(dto.truck_id) } as any });
        if (!truck) throw new BadRequestException('Xe nội bộ không hợp lệ');
        if (truck.ownership_type !== 'INTERNAL') throw new BadRequestException('Xe được chọn không phải xe nội bộ');
        if (String(truck.hub_id || '') !== String(waybill.dest_hub_id)) {
          throw new BadRequestException('Xe nội bộ không thuộc HUB đến của vận đơn');
        }
      }
      Object.assign(waybill, {
        delivery_assignment_type: 'INTERNAL',
        last_mile_driver_id: driver?.id ?? null,
        last_mile_truck_id: truck?.id ?? null,
        last_mile_vendor_id: null,
        last_mile_driver_name: driverName,
        last_mile_license_plate: manualLicensePlate || null,
        last_mile_cost_amount: String(deliveryCost),
        xe_phat: manualLicensePlate || null,
      });
      return;
    }

    if (assignmentType === 'PARTNER' && !dto.vendor_id) throw new BadRequestException('Phải chọn đối tác giao hàng');
    const vendor = dto.vendor_id
      ? await this.vendorsRepository.findOne({ where: { id: String(dto.vendor_id), status: 'ACTIVE' } as any })
      : null;
    if (dto.vendor_id && !vendor) throw new BadRequestException('Đơn vị giao hàng không hợp lệ');
    if (assignmentType === 'TECHNOLOGY' && !vendor && !manualDriverName) {
      throw new BadRequestException('Phải chọn hoặc nhập đơn vị xe công nghệ');
    }
    Object.assign(waybill, {
      delivery_assignment_type: assignmentType,
      last_mile_driver_id: null,
      last_mile_truck_id: null,
      last_mile_vendor_id: vendor?.id ?? null,
      last_mile_driver_name: manualDriverName || vendor?.name?.trim() || null,
      last_mile_license_plate: manualLicensePlate || null,
      last_mile_cost_amount: String(deliveryCost),
      xe_phat: manualLicensePlate || null,
    });
  }

  private async updateSplitDeliveryStatus(
    waybill: WaybillRecord,
    dto: UpdateWaybillStatusDto,
    currentUser: UserEntity,
    auditBefore: WaybillAuditSnapshot,
  ): Promise<WaybillRecord | null> {
    if (!dto.trip_id) return null;
    if (![WaybillStatus.OUT_FOR_DELIVERY, WaybillStatus.DELIVERED, WaybillStatus.RETURNED].includes(dto.status)) {
      return null;
    }

    const splitWhere = {
      waybill_id: String(waybill.id),
      trip_id: String(dto.trip_id),
      ...(dto.split_id ? { id: String(dto.split_id) } : {}),
    };
    const splits = await this.splitsRepository.find({ where: splitWhere as any });
    if (!splits.length) {
      if (dto.split_id) throw new BadRequestException('Split line does not belong to the selected trip');
      return null;
    }

    const trip = await this.tripsRepository.findOne({ where: { id: String(dto.trip_id) } });
    if (!trip || trip.status !== TripStatus.ARRIVED) {
      throw new BadRequestException('Delivery can only be updated after the trip arrives');
    }
    if (dto.status === WaybillStatus.DELIVERED && !dto.delivery_photo_url && !waybill.delivery_photo_url) {
      throw new BadRequestException('Delivery photo is required');
    }

    const previousSplitStatus = splits.map((split) => split.load_status).join(', ');
    const splitStatus = dto.status === WaybillStatus.OUT_FOR_DELIVERY
      ? WaybillSplitLoadStatus.OUT_FOR_DELIVERY
      : dto.status === WaybillStatus.DELIVERED
        ? WaybillSplitLoadStatus.DELIVERED
        : WaybillSplitLoadStatus.RETURNED;
    splits.forEach((split) => { split.load_status = splitStatus; });
    await this.splitsRepository.save(splits);

    Object.assign(waybill, { updated_by: currentUser.id, note: dto.note ?? waybill.note });
    if (dto.status === WaybillStatus.OUT_FOR_DELIVERY) waybill.last_delivery_failure_reason = null;
    if (dto.status === WaybillStatus.RETURNED) waybill.last_delivery_failure_reason = dto.failure_reason!.trim();
    if (dto.delivery_photo_url) waybill.delivery_photo_url = normalizeWaybillPhotos(dto.delivery_photo_url);

    const allSplits = await this.splitsRepository.find({ where: { waybill_id: String(waybill.id) } });
    const totalPackages = this.resolveTotalPackages(waybill);
    const allocatedPackages = allSplits.reduce((sum, split) => sum + Number(split.package_count ?? 0), 0);
    if (allocatedPackages >= totalPackages) {
      const allDelivered = allSplits.length > 0
        && allSplits.every((split) => split.load_status === WaybillSplitLoadStatus.DELIVERED);
      const allFinished = allSplits.length > 0
        && allSplits.every((split) => [WaybillSplitLoadStatus.DELIVERED, WaybillSplitLoadStatus.RETURNED].includes(split.load_status));
      const allOutForDelivery = allSplits.length > 0
        && allSplits.every((split) => split.load_status === WaybillSplitLoadStatus.OUT_FOR_DELIVERY);
      if (allDelivered) {
        this.setStatus(waybill, WaybillStatus.DELIVERED);
        Object.assign(waybill, { delivered_at: new Date(), delivery_time: new Date() });
      } else if (allFinished) {
        this.setStatus(waybill, WaybillStatus.RETURNED);
        waybill.returned_at = new Date();
      } else if (allOutForDelivery) {
        this.setStatus(waybill, WaybillStatus.OUT_FOR_DELIVERY);
      }
    }

    const saved = await this.saveWithAudit(waybill, currentUser, 'SPLIT_DELIVERY_STATUS_CHANGE');
    await this.recordWaybillChange(
      String(saved.id),
      dto.status === WaybillStatus.RETURNED ? 'DELIVERY_FAILED' : `DELIVERY_${dto.status}`,
      currentUser,
      auditBefore,
      saved,
      {
        split_status: { old_value: previousSplitStatus || null, new_value: splitStatus },
        trip_id: { old_value: dto.trip_id || null, new_value: dto.trip_id || null },
      },
    );
    if (dto.status === WaybillStatus.DELIVERED) {
      await this.completeTripWhenAllDelivered(String(dto.trip_id));
    }
    return {
      ...saved,
      current_state: dto.status,
      status: dto.status,
      trip_id: String(dto.trip_id),
      split_id: splits[0].id,
    } as unknown as WaybillRecord;
  }

  private async resolveDeliveryTripIds(waybillId: string, requestedTripId?: string): Promise<string[]> {
    const [splits, links] = await Promise.all([
      this.splitsRepository.find({ where: { waybill_id: waybillId } }),
      this.manifestWaybillsRepository.find({
        where: { waybill_id: waybillId },
        relations: ['manifest', 'manifest.trips'],
      }),
    ]);
    const relatedIds = new Set<string>();
    splits.forEach((split) => {
      if (split.trip_id) relatedIds.add(String(split.trip_id));
    });
    links.forEach((link) => link.manifest?.trips?.forEach((trip) => relatedIds.add(String(trip.id))));

    if (requestedTripId) {
      const tripId = String(requestedTripId);
      if (!relatedIds.has(tripId)) {
        throw new BadRequestException('Waybill does not belong to the selected trip');
      }
      return [tripId];
    }

    if (!relatedIds.size) return [];
    const trips = await this.tripsRepository.find({
      where: { id: In([...relatedIds]), status: In([TripStatus.ARRIVED, TripStatus.COMPLETED]) } as any,
    });
    return trips.map((trip) => String(trip.id));
  }

  private async markTripAllocationDelivered(waybillId: string, requestedTripId?: string): Promise<void> {
    const tripIds = await this.resolveDeliveryTripIds(waybillId, requestedTripId);
    if (!tripIds.length) return;

    const splits = await this.splitsRepository.find({
      where: { waybill_id: waybillId, trip_id: In(tripIds) } as any,
    });
    splits.forEach((split) => { split.load_status = WaybillSplitLoadStatus.DELIVERED; });
    if (splits.length) await this.splitsRepository.save(splits);

    for (const tripId of tripIds) await this.completeTripWhenAllDelivered(tripId);
  }

  private async completeTripWhenAllDelivered(tripId: string): Promise<void> {
    const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
    if (!trip || trip.status !== TripStatus.ARRIVED) return;

    const splits = await this.splitsRepository.find({ where: { trip_id: tripId } });
    let allDelivered = splits.length > 0
      ? splits.every((split) => split.load_status === WaybillSplitLoadStatus.DELIVERED)
      : false;

    if (!splits.length && trip.manifest_id) {
      const links = await this.manifestWaybillsRepository.find({
        where: { manifest_id: String(trip.manifest_id) },
        relations: ['waybill'],
      });
      allDelivered = links.length > 0
        && links.every((link) => this.getStatus(link.waybill as WaybillRecord) === WaybillStatus.DELIVERED);
    }
    if (!allDelivered) return;

    trip.status = TripStatus.COMPLETED;
    await this.tripsRepository.save(trip);
    if (trip.manifest_id) {
      const manifest = await this.manifestsRepository.findOne({ where: { id: String(trip.manifest_id) } });
      if (manifest) {
        manifest.status = ManifestStatus.COMPLETED;
        await this.manifestsRepository.save(manifest);
      }
    }
    if (trip.truck_id) {
      const activeTrips = await this.tripsRepository.find({
        where: {
          truck_id: String(trip.truck_id),
          status: In([TripStatus.PLANNED, TripStatus.IN_TRANSIT, TripStatus.ARRIVED]),
        } as any,
      });
      if (!activeTrips.some((item) => String(item.id) !== String(trip.id))) {
        const truck = await this.trucksRepository.findOne({ where: { id: String(trip.truck_id) } });
        if (truck) {
          truck.status = TruckStatus.AVAILABLE;
          await this.trucksRepository.save(truck);
        }
      }
    }
  }

  private async reopenTripAllocation(waybillId: string, requestedTripId?: string): Promise<void> {
    const tripIds = await this.resolveDeliveryTripIds(waybillId, requestedTripId);
    if (!tripIds.length) return;
    const splits = await this.splitsRepository.find({
      where: { waybill_id: waybillId, trip_id: In(tripIds) } as any,
    });
    splits.forEach((split) => { split.load_status = WaybillSplitLoadStatus.IN_TRANSIT; });
    if (splits.length) await this.splitsRepository.save(splits);

    for (const tripId of tripIds) {
      const trip = await this.tripsRepository.findOne({ where: { id: tripId } });
      if (!trip || trip.status !== TripStatus.COMPLETED) continue;
      trip.status = TripStatus.ARRIVED;
      await this.tripsRepository.save(trip);
      if (trip.manifest_id) {
        const manifest = await this.manifestsRepository.findOne({ where: { id: String(trip.manifest_id) } });
        if (manifest) {
          manifest.status = ManifestStatus.IN_TRANSIT;
          await this.manifestsRepository.save(manifest);
        }
      }
      if (trip.truck_id) {
        const truck = await this.trucksRepository.findOne({ where: { id: String(trip.truck_id) } });
        if (truck) {
          truck.status = TruckStatus.IN_TRIP;
          await this.trucksRepository.save(truck);
        }
      }
    }
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
    const waybill = await this.findEditable(id, currentUser);
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
          .orWhere('waybill.sender_name ILIKE :keyword', { keyword })
          .orWhere('waybill.sender_phone ILIKE :keyword', { keyword })
          .orWhere('waybill.sender_address ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_company_name ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_name ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_phone ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_address ILIKE :keyword', { keyword })
          .orWhere('waybill.ma_kh ILIKE :keyword', { keyword })
          .orWhere('waybill.noi_dung ILIKE :keyword', { keyword })
          .orWhere('waybill.noi_den ILIKE :keyword', { keyword })
          .orWhere('waybill.note ILIKE :keyword', { keyword })
          .orWhere('"order".order_code ILIKE :keyword', { keyword })
          .orWhere('"order".ma_kh ILIKE :keyword', { keyword })
          .orWhere('"order".sender_name ILIKE :keyword', { keyword })
          .orWhere('"order".sender_phone ILIKE :keyword', { keyword })
          .orWhere('"order".sender_address ILIKE :keyword', { keyword })
          .orWhere('"order".receiver_company_name ILIKE :keyword', { keyword })
          .orWhere('"order".receiver_name ILIKE :keyword', { keyword })
          .orWhere('"order".receiver_phone ILIKE :keyword', { keyword })
          .orWhere('"order".receiver_address ILIKE :keyword', { keyword })
          .orWhere('"order".note ILIKE :keyword', { keyword })
          .orWhere('origin_hub.code ILIKE :keyword', { keyword })
          .orWhere('origin_hub.name ILIKE :keyword', { keyword })
          .orWhere('dest_hub.code ILIKE :keyword', { keyword })
          .orWhere('dest_hub.name ILIKE :keyword', { keyword });
        if (normalizedWaybillKeyword) {
          builder.orWhere(
            `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
            { normalizedWaybillKeyword },
          );
        }
        const phoneDigits = rawKeyword.replace(/\D/g, '');
        if (phoneDigits.length >= 7) {
          builder.orWhere(
            `REGEXP_REPLACE(CONCAT_WS('', waybill.sender_phone, waybill.receiver_phone, waybill.sender_info, waybill.receiver_info, "order".sender_phone, "order".receiver_phone), '[^0-9]+', '', 'g') LIKE :normalizedPhoneKeyword`,
            { normalizedPhoneKeyword: `%${phoneDigits}%` },
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
    if (query.sent_from) qb.andWhere('waybill.sent_date >= :sentFrom', { sentFrom: query.sent_from });
    if (query.sent_to) qb.andWhere('waybill.sent_date <= :sentTo', { sentTo: query.sent_to });
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
    if (query.list_scope === 'all_orders' || query.list_scope === 'all_inventory') {
      return undefined;
    }
    if (query.ma_kh?.trim() || query.vendor_id?.trim()) {
      return undefined;
    }
    // Khi lọc theo hub khởi hành (vd. thêm đơn vào bảng kê), hàng phải đang ở hub xuất phát.
    if (query.origin_hub_id?.trim()) {
      return query.origin_hub_id;
    }
    const assignedHubIds = getAssignedHubIds(currentUser);
    return assignedHubIds.length === 1 ? assignedHubIds[0] : undefined;
  }

  private applyHubScope(qb: any, currentUser: UserEntity) {
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT) || !assignedHubIds.length) return;
    qb.andWhere(new Brackets((builder) => builder
      .where('waybill.origin_hub_id IN (:...assignedHubIds)', { assignedHubIds })
      .orWhere('waybill.dest_hub_id IN (:...assignedHubIds)', { assignedHubIds })
      .orWhere('waybill.current_hub_id IN (:...assignedHubIds)', { assignedHubIds })));
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
    if (!getAssignedHubIds(currentUser).includes(String(hubId))) throw new ForbiddenException('User is not assigned to this hub');
  }

  private assertWaybillAccess(waybill: WaybillRecord, currentUser: UserEntity) {
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT) || !assignedHubIds.length) return;
    const waybillHubIds = [waybill.origin_hub_id, waybill.dest_hub_id, waybill.current_hub_id]
      .filter((hubId): hubId is string => hubId != null)
      .map(String);
    if (!waybillHubIds.some((hubId) => assignedHubIds.includes(hubId))) {
      throw new ForbiddenException('User cannot access this waybill outside assigned hub');
    }
  }

  async previewNextWaybillCode(originHubId: string | undefined, currentUser: UserEntity): Promise<{ waybill_code: string }> {
    const hubId = originHubId?.trim() || getAssignedHubIds(currentUser)[0];
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

  private auditText(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private auditNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private auditNoteField(note: string | null | undefined, key: string): string | null {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(note || '').match(new RegExp(`(?:^|\\|)\\s*${escapedKey}=([^|]*)`, 'i'));
    return this.auditText(match?.[1]);
  }

  private auditUserNote(note: string | null | undefined): string | null {
    const encoded = this.auditNoteField(note, 'user_note');
    if (encoded) {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }
    return this.auditText(plainGoodsNote(note));
  }

  private buildAuditSnapshot(waybill: WaybillRecord): WaybillAuditSnapshot {
    const note = waybill.note || '';
    const photoCount = String(waybill.delivery_photo_url || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .length;

    return {
      waybill_code: this.auditText(waybill.waybill_code),
      ma_kh: this.auditText(waybill.ma_kh || this.auditNoteField(note, 'ma_kh')),
      sender_name: this.auditText(waybill.sender_name),
      sender_phone: this.auditText(waybill.sender_phone),
      sender_address: this.auditText(waybill.sender_address),
      receiver_company_name: this.auditText(waybill.receiver_company_name),
      receiver_name: this.auditText(waybill.receiver_name),
      receiver_phone: this.auditText(waybill.receiver_phone),
      receiver_address: this.auditText(waybill.receiver_address),
      noi_den: this.auditText(waybill.noi_den || this.auditNoteField(note, 'tinh_den')),
      quan_huyen: this.auditNoteField(note, 'quan_huyen'),
      phuong_xa: this.auditNoteField(note, 'phuong_xa'),
      origin_hub_id: this.auditText(waybill.origin_hub_id),
      dest_hub_id: this.auditText(waybill.dest_hub_id),
      package_count: this.auditNumber(waybill.package_count),
      weight: this.auditNumber(waybill.weight),
      length: this.auditNumber(waybill.length),
      width: this.auditNumber(waybill.width),
      height: this.auditNumber(waybill.height),
      volumetric_weight: this.auditNumber(waybill.volumetric_weight),
      the_tich_m3: this.auditNumber(waybill.the_tich_m3),
      cod_amount: this.auditNumber(waybill.cod_amount),
      freight_amount: this.auditNumber(waybill.freight_amount ?? waybill.cost_amount),
      cc_amount: this.auditNumber(waybill.cc_amount),
      noi_dung: this.auditText(waybill.noi_dung || this.auditNoteField(note, 'content')),
      ghi_chu: this.auditUserNote(note),
      tinh_chat_hang_hoa: this.auditNoteField(note, 'special_goods'),
      dich_vu: this.auditNoteField(note, 'dich_vu'),
      giao_hang: this.auditNoteField(note, 'giao_hang'),
      ngay_gui: this.auditNoteField(note, 'ngay_gui'),
      phuong_thuc: this.auditNoteField(note, 'phuong_thuc') || this.auditText(waybill.payment_type),
      current_state: this.auditText(this.getStatus(waybill)),
      route_code: this.auditText(waybill.route_code),
      delivery_assignment_type: this.auditText(waybill.delivery_assignment_type),
      warehouse_intake_method: this.auditText(waybill.warehouse_intake_method),
      warehouse_intake_truck_id: this.auditText(waybill.warehouse_intake_truck_id),
      warehouse_intake_vendor_id: this.auditText(waybill.warehouse_intake_vendor_id),
      warehouse_intake_driver_id: this.auditText(waybill.warehouse_intake_driver_id),
      warehouse_intake_license_plate: this.auditText(waybill.warehouse_intake_license_plate),
      warehouse_intake_driver_name: this.auditText(waybill.warehouse_intake_driver_name),
      warehouse_intake_vendor_name: this.auditText(waybill.warehouse_intake_vendor_name),
      warehouse_intake_note: this.auditText(waybill.warehouse_intake_note),
      last_mile_driver_id: this.auditText(waybill.last_mile_driver_id),
      last_mile_truck_id: this.auditText(waybill.last_mile_truck_id),
      last_mile_vendor_id: this.auditText(waybill.last_mile_vendor_id),
      last_mile_driver_name: this.auditText(waybill.last_mile_driver_name),
      last_mile_license_plate: this.auditText(waybill.last_mile_license_plate),
      last_mile_cost_amount: this.auditNumber(waybill.last_mile_cost_amount),
      xe_phat: this.auditText(waybill.xe_phat),
      delivery_preparation_status: this.auditText(waybill.delivery_preparation_status),
      delivery_scheduled_at: waybill.delivery_scheduled_at?.toISOString() ?? null,
      delivery_hold_reason: this.auditText(waybill.delivery_hold_reason),
      delivery_preparation_note: this.auditText(waybill.delivery_preparation_note),
      delivery_confirmed_at: waybill.delivery_confirmed_at?.toISOString() ?? null,
      last_delivery_failure_reason: this.auditText(waybill.last_delivery_failure_reason),
      sent_date: this.auditText(waybill.sent_date || this.auditNoteField(note, 'ngay_gui')),
      so_anh: photoCount,
    };
  }

  private diffAuditSnapshots(
    before: WaybillAuditSnapshot,
    after: WaybillAuditSnapshot,
  ): Record<string, WaybillFieldChange> {
    return Object.keys(after).reduce<Record<string, WaybillFieldChange>>((changes, field) => {
      if (before[field] !== after[field]) {
        changes[field] = {
          old_value: before[field] ?? null,
          new_value: after[field] ?? null,
        };
      }
      return changes;
    }, {});
  }

  private async recordWaybillChange(
    waybillId: string,
    action: string,
    currentUser: UserEntity,
    before?: WaybillAuditSnapshot,
    afterWaybill?: WaybillRecord,
    additionalChanges: Record<string, WaybillFieldChange> = {},
    repository: Repository<WaybillChangeLogEntity> = this.changeLogsRepository,
  ): Promise<void> {
    const snapshotChanges = before && afterWaybill
      ? this.diffAuditSnapshots(before, this.buildAuditSnapshot(afterWaybill))
      : {};
    const changes = { ...snapshotChanges, ...additionalChanges };
    if (action !== 'CREATED' && Object.keys(changes).length === 0) return;

    const changedByName = this.auditText(currentUser.full_name)
      || this.auditText(currentUser.username)
      || `User #${currentUser.id}`;
    const log = repository.create({
      waybill_id: waybillId,
      action,
      changes,
      changed_by_id: currentUser.id || null,
      changed_by_name: changedByName,
    });
    await repository.save(log);
  }

  private getCodReconciliationSnapshot(waybill: WaybillRecord) {
    const reconciledAt = waybill.cod_reconciled_at
      ? new Date(waybill.cod_reconciled_at).toISOString()
      : null;
    return {
      cod_reconciled_at: reconciledAt,
      cod_collected_amount: Number(waybill.cod_collected_amount) || 0,
      cod_fund_id: waybill.cod_fund_id ? String(waybill.cod_fund_id) : null,
    };
  }

  private diffCodReconciliationSnapshots(
    before: ReturnType<WaybillsService['getCodReconciliationSnapshot']>,
    after: ReturnType<WaybillsService['getCodReconciliationSnapshot']>,
  ): Record<string, WaybillFieldChange> {
    return Object.keys(after).reduce<Record<string, WaybillFieldChange>>((changes, field) => {
      const key = field as keyof typeof after;
      if (before[key] !== after[key]) {
        changes[key] = { old_value: before[key], new_value: after[key] };
      }
      return changes;
    }, {});
  }

  private packContact(name?: string | null, phone?: string | null, address?: string | null) {
    return [name, phone, address].filter(Boolean).join(' | ');
  }

  private packReceiverContact(name?: string | null, phone?: string | null, address?: string | null) {
    return [name?.trim() || '', phone?.trim() || '', address?.trim() || ''].join(' | ');
  }

  private resolvePaymentType(dto: Pick<CreateWaybillDto, 'note' | 'cc_amount'>): PaymentType {
    const method = parseNoteField(dto.note, 'phuong_thuc');
    if (method === 'Người nhận thanh toán' || Number(dto.cc_amount ?? 0) > 0) return PaymentType.CC;
    if (method === 'COD') return PaymentType.COD;
    return PaymentType.PP;
  }

  private getCollectOnDeliveryAmount(
    waybill: Pick<WaybillEntity, 'cod_amount' | 'cc_amount' | 'payment_type' | 'freight_amount' | 'cost_amount'>,
  ): number {
    const cod = Number(waybill.cod_amount ?? 0) || 0;
    const storedCc = Number(waybill.cc_amount ?? 0) || 0;
    const cc = storedCc > 0
      ? storedCc
      : waybill.payment_type === PaymentType.CC
        ? Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0
        : 0;
    return Math.max(0, cod + cc);
  }

  private async findActiveCashFund(manager: EntityManager, fundId: string, currentUser: UserEntity) {
    const fund = await manager.getRepository(CashFundEntity).findOne({
      where: { id: fundId, is_active: true },
      relations: ['hub'],
    });
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
    if (!isManager(currentUser.role_mask) && fund.hub_id && !getAssignedHubIds(currentUser).includes(String(fund.hub_id))) {
      throw new ForbiddenException('Không được ghi nhận tiền vào sổ quỹ của bưu cục khác');
    }
    return fund;
  }

  private async applyCustomerPaymentStatus(manager: EntityManager, waybill: WaybillRecord): Promise<void> {
    const paymentSummary = await manager.getRepository(WaybillCashVoucherEntity).createQueryBuilder('voucher')
      .select(
        `COALESCE(SUM(CASE WHEN LOWER(voucher.voucher_type) = 'thu' THEN voucher.amount ELSE -voucher.amount END), 0)`,
        'net_paid',
      )
      .where('voucher.waybill_id = :waybillId', { waybillId: String(waybill.id) })
      .getRawOne<{ net_paid: string }>();
    const totalDue = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
    const netPaid = Number(paymentSummary?.net_paid ?? 0) || 0;
    waybill.customer_payment_status = totalDue > 0 && netPaid >= totalDue
      ? CustomerPaymentStatus.PAID
      : waybill.customer_payment_status === CustomerPaymentStatus.PAID
        ? null
        : waybill.customer_payment_status ?? null;
  }

  private async clearCodCollection(waybill: WaybillRecord): Promise<WaybillRecord> {
    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(WaybillCashVoucherEntity).delete({
        waybill_id: String(waybill.id),
        source_type: 'COD_COLLECTION',
      } as any);
      waybill.cod_reconciled_at = null;
      waybill.cod_reconciled_by = null;
      waybill.cod_fund_id = null;
      waybill.cod_collected_amount = '0';
      await this.applyCustomerPaymentStatus(manager, waybill);
      return manager.getRepository(WaybillEntity).save(waybill) as Promise<WaybillRecord>;
    });
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
    const allocatedMetric = (value: unknown, precision = 3) => {
      const numeric = Number(value ?? 0);
      if (!Number.isFinite(numeric)) return value;
      return Number((numeric * ratio).toFixed(precision));
    };
    const truck = split?.truck ?? split?.trip?.truck ?? null;
    const licensePlate = truck?.bks ?? truck?.license_plate ?? null;
    const carrier = split?.carrier_label ?? truck?.nha_xe ?? null;
    const unallocatedLabel = remainingPackages != null && remainingPackages < totalPackages
      ? `Còn ${remainingPackages} kiện · Chưa phân xe`
      : 'Chưa phân xe';

    return {
      ...waybill,
      weight: allocatedMetric(waybill.weight),
      actual_weight: allocatedMetric(waybill.actual_weight ?? waybill.weight),
      volumetric_weight: allocatedMetric(waybill.volumetric_weight),
      the_tich_m3: allocatedMetric(waybill.the_tich_m3, 4),
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
    const collectOnDeliveryAmount = this.getCollectOnDeliveryAmount(waybill);
    const result: Record<string, any> = {
      ...waybill,
      status: this.getStatus(waybill),
      cod_collection_status: collectOnDeliveryAmount <= 0
        ? 'NOT_APPLICABLE'
        : waybill.cod_reconciled_at
          ? 'COLLECTED'
          : 'PENDING',
    };
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) {
      result.customer_payment_due_amount = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0;
    }
    if (waybill.last_mile_driver) {
      result.last_mile_driver = {
        id: waybill.last_mile_driver.id,
        username: waybill.last_mile_driver.username,
        name: waybill.last_mile_driver.full_name,
        phone: waybill.last_mile_driver.phone,
        hub_id: waybill.last_mile_driver.hub_id,
      };
    }
    if (waybill.creator) {
      result.creator = this.sanitizeUserSummary(waybill.creator);
    }
    if (waybill.updater) {
      result.updater = this.sanitizeUserSummary(waybill.updater);
    }
    if (waybill.cod_reconciler) {
      result.cod_reconciler = this.sanitizeUserSummary(waybill.cod_reconciler);
    }
    if (waybill.last_mile_truck) {
      result.last_mile_truck = {
        id: waybill.last_mile_truck.id,
        license_plate: waybill.last_mile_truck.license_plate,
        bks: waybill.last_mile_truck.bks,
        loai_xe: waybill.last_mile_truck.loai_xe,
      };
    }
    if (waybill.last_mile_vendor) {
      result.last_mile_vendor = {
        id: waybill.last_mile_vendor.id,
        code: waybill.last_mile_vendor.code,
        name: waybill.last_mile_vendor.name,
        phone: waybill.last_mile_vendor.phone,
        service_type: waybill.last_mile_vendor.service_type,
      };
    }
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
      delete result.freight_amount;
      delete result.cc_amount;
      if (!hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) delete result.cod_amount;
    }
    delete result.deleted_at;
    return result as WaybillRecord;
  }

  private sanitizeUserSummary(user?: UserEntity | null) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.full_name,
      full_name: user.full_name,
      hub_id: user.hub_id,
    };
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
