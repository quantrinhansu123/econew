import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Like, Repository } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { PaymentType } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isManager } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from './waybill.entity';
import { AssignWaybillPriorityDto } from './dto/assign-waybill-priority.dto';
import { AssignWaybillRouteDto } from './dto/assign-waybill-route.dto';
import { CancelWaybillDto } from './dto/cancel-waybill.dto';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { QueryWaybillsDto } from './dto/query-waybills.dto';
import { ReceiveWaybillDto } from './dto/receive-waybill.dto';
import { UpdateCodFeeDto } from './dto/update-cod-fee.dto';
import { UpdateWaybillStatusDto } from './dto/update-waybill-status.dto';
import { UpdateWaybillDto } from './dto/update-waybill.dto';
import { WaybillPriority, WaybillStatus } from './dto/waybill.enums';

type WaybillRecord = WaybillEntity & Record<string, any>;

const FINAL_STATUSES = [WaybillStatus.DELIVERED, WaybillStatus.RETURNED, WaybillStatus.CANCELLED];
const INVENTORY_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE, WaybillStatus.MANIFEST_CLOSED, WaybillStatus.AT_DEST_HUB, WaybillStatus.OUT_FOR_DELIVERY];
const MUTABLE_STATUSES = [WaybillStatus.RECEIVED, WaybillStatus.IN_WAREHOUSE];
const STATE_TRANSITIONS: Record<string, WaybillStatus[]> = {
  [WaybillStatus.RECEIVED]: [WaybillStatus.IN_WAREHOUSE],
  [WaybillStatus.IN_WAREHOUSE]: [WaybillStatus.MANIFEST_CLOSED],
  [WaybillStatus.MANIFEST_CLOSED]: [WaybillStatus.IN_TRANSIT],
  [WaybillStatus.IN_TRANSIT]: [WaybillStatus.AT_DEST_HUB],
  [WaybillStatus.AT_DEST_HUB]: [WaybillStatus.OUT_FOR_DELIVERY],
  [WaybillStatus.OUT_FOR_DELIVERY]: [WaybillStatus.DELIVERED, WaybillStatus.RETURNED],
};

@Injectable()
export class WaybillsService {
  constructor(
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
  ) {}

  async create(dto: CreateWaybillDto, currentUser: UserEntity): Promise<WaybillRecord> {
    await this.assertHubAccess(dto.origin_hub_id, currentUser);
    await this.assertActiveHub(dto.origin_hub_id);
    await this.assertActiveHub(dto.dest_hub_id);

    const waybillCode = await this.generateUniqueCode();
    const record = this.waybillsRepository.create({
      waybill_code: waybillCode,
      sender_info: this.packContact(dto.sender_name, dto.sender_phone, dto.sender_address),
      receiver_info: this.packContact(dto.receiver_name, dto.receiver_phone, dto.receiver_address),
      weight: dto.weight,
      length: 0,
      width: 0,
      height: 0,
      volumetric_weight: 0,
      payment_type: dto.cod_amount ? PaymentType.COD : PaymentType.PP,
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
      expected_delivery_at: dto.expected_delivery_at ? new Date(dto.expected_delivery_at) : null,
      created_by: currentUser.id,
    });

    try {
      return this.sanitize(await this.waybillsRepository.save(record), currentUser);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Waybill code already exists');
      throw error;
    }
  }

  async findAll(query: QueryWaybillsDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 20);
    const qb = this.waybillsRepository.createQueryBuilder('waybill').where('waybill.deleted_at IS NULL').leftJoinAndSelect('waybill.origin_hub', 'origin_hub').leftJoinAndSelect('waybill.dest_hub', 'dest_hub');
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
    Object.assign(waybill, dto, { updated_by: currentUser.id });
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
    if (![WaybillStatus.IN_WAREHOUSE, WaybillStatus.AT_DEST_HUB].includes(this.getStatus(waybill))) throw new BadRequestException('Route can only be assigned in warehouse or destination hub');
    if (!dto.route_code?.trim()) throw new BadRequestException('Route code is required');
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
    return this.findAll({ ...query, status: query.status ?? INVENTORY_STATUSES.join(','), current_hub_id: query.current_hub_id ?? query.hub_id ?? currentUser.hub_id ?? undefined }, currentUser);
  }

  getIncoming(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, dest_hub_id: query.dest_hub_id ?? currentUser.hub_id ?? undefined }, currentUser);
  }

  getOverdue(query: QueryWaybillsDto, currentUser: UserEntity) {
    return this.findAll({ ...query, to_date: new Date().toISOString() }, currentUser);
  }

  private async findMutable(id: string, currentUser: UserEntity): Promise<WaybillRecord> {
    const waybill = await this.findOne(id, currentUser);
    if (waybill.manifest_id || waybill.trip_id) throw new ConflictException('Waybill is locked by manifest or trip');
    return waybill;
  }

  private applyFilters(qb: any, query: QueryWaybillsDto) {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder.where('waybill.waybill_code ILIKE :keyword', { keyword }).orWhere('waybill.sender_info ILIKE :keyword', { keyword }).orWhere('waybill.receiver_info ILIKE :keyword', { keyword })));
    }

    const statuses = this.parseList(query.status);
    if (statuses.length) qb.andWhere('waybill.current_state IN (:...statuses)', { statuses });

    const hubIds = this.parseList(query.current_hub_id ?? query.hub_id);
    if (hubIds.length) qb.andWhere('COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)', { hubIds });

    const paymentTypes = this.parseList(query.payment_type);
    if (paymentTypes.length) qb.andWhere('waybill.payment_type IN (:...paymentTypes)', { paymentTypes });

    const priorities = this.parseList(query.priority);
    if (priorities.length) qb.andWhere('waybill.priority IN (:...priorities)', { priorities });

    if (query.origin_hub_id) qb.andWhere('waybill.origin_hub_id = :originHubId', { originHubId: query.origin_hub_id });
    if (query.dest_hub_id) qb.andWhere('waybill.dest_hub_id = :destHubId', { destHubId: query.dest_hub_id });
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
  private applyHubScope(qb: any, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask) || !currentUser.hub_id) return;
    qb.andWhere(new Brackets((builder) => builder.where('waybill.origin_hub_id = :hubId', { hubId: currentUser.hub_id }).orWhere('waybill.dest_hub_id = :hubId', { hubId: currentUser.hub_id }).orWhere('waybill.current_hub_id = :hubId', { hubId: currentUser.hub_id })));
  }

  private async assertActiveHub(hubId: string) {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId, is_active: true, deleted_at: IsNull() } });
    if (!hub) throw new BadRequestException('Hub is missing or inactive');
  }

  private async assertHubAccess(hubId: string, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask)) return;
    if (currentUser.hub_id !== hubId) throw new ForbiddenException('User is not assigned to this hub');
  }

  private assertWaybillAccess(waybill: WaybillRecord, currentUser: UserEntity) {
    if (isManager(currentUser.role_mask) || !currentUser.hub_id) return;
    if (![waybill.origin_hub_id, waybill.dest_hub_id, waybill.current_hub_id].includes(currentUser.hub_id)) throw new ForbiddenException('User cannot access this waybill outside assigned hub');
  }

  async previewNextWaybillCode(): Promise<{ waybill_code: string }> {
    return { waybill_code: await this.generateUniqueCode() };
  }

  private async generateUniqueCode(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `ECO${year}${month}${day}-`;
    let sequence = await this.waybillsRepository.count({ where: { waybill_code: Like(`${prefix}%`) } }) + 1;

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = `${prefix}${String(sequence).padStart(3, '0')}`;
      const existing = await this.waybillsRepository.findOne({ where: { waybill_code: code } });
      if (!existing) return code;
      sequence += 1;
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

  private async saveWithAudit(waybill: WaybillRecord, currentUser: UserEntity, action: string): Promise<WaybillRecord> {
    waybill.last_audit_action = action;
    waybill.last_audit_user_id = currentUser.id;
    waybill.last_audit_at = new Date();
    return this.sanitize(await this.waybillsRepository.save(waybill), currentUser);
  }

  private sanitize(waybill: WaybillRecord, currentUser: UserEntity): WaybillRecord {
    const result: Record<string, any> = { ...waybill, status: this.getStatus(waybill) };
    if (!result.receiver_phone && result.receiver_info) {
      const parts = String(result.receiver_info).split(' | ').map((p: string) => p.trim());
      if (parts[1]) result.receiver_phone = parts[1];
    }
    if (!isManager(currentUser.role_mask)) {
      delete result.cost_amount;
      delete result.freight_amount;
      delete result.cc_amount;
    }
    delete result.deleted_at;
    return result as WaybillRecord;
  }
}



