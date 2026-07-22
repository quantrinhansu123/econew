import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentType, TripStatus, WaybillState } from '../common/enums';
import { Roles, hasRole, isManager } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { GlobalSearchDto, GlobalSearchType } from './dto/global-search.dto';
import { SearchTripsDto } from './dto/search-trips.dto';
import { SearchWaybillsDto } from './dto/search-waybills.dto';
import { SearchResultEntity } from './search-result.entity';

type Paginated<T> = { items: T[]; meta: { total: number; page: number; limit: number; total_pages: number } };
type WaybillSearchRow = WaybillEntity & { origin_hub?: HubEntity; dest_hub?: HubEntity };
type TripSearchRow = TripEntity & { truck?: TruckEntity | null; manifest?: ManifestEntity; start_hub?: HubEntity; end_hub?: HubEntity };
type WaybillQueryFilters = Omit<Partial<SearchWaybillsDto>, 'status' | 'payment_type'> & {
  status?: string;
  payment_type?: string;
};
type TripQueryFilters = Omit<Partial<SearchTripsDto>, 'status'> & { status?: string };

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
  ) {}

  async globalSearch(dto: GlobalSearchDto, currentUser: UserEntity): Promise<Paginated<SearchResultEntity>> {
    this.validateRole(currentUser);
    const page = dto.page ?? 1;
    const limit = this.resolveLimit(dto.limit);
    this.validateDateRange(dto.date_from, dto.date_to);
    const keyword = this.normalizeKeyword(dto.keyword);
    const type = dto.type ?? GlobalSearchType.ALL;
    const offset = (page - 1) * limit;

    const selectedStatuses = this.parseCsv(dto.status);
    const selectedPaymentTypes = this.parseCsv(dto.payment_type);
    const waybillStatuses = selectedStatuses.filter((status) => this.isWaybillStatus(status));
    const tripStatuses = selectedStatuses.filter((status) => this.isTripStatus(status));
    const includeWaybills = type !== GlobalSearchType.TRIP && (!selectedStatuses.length || waybillStatuses.length > 0);
    const includeTrips = type !== GlobalSearchType.WAYBILL
      && selectedPaymentTypes.length === 0
      && (!selectedStatuses.length || tripStatuses.length > 0);

    const [waybills, waybillTotal] = !includeWaybills
      ? [[], 0] as [WaybillSearchRow[], number]
      : await this.buildWaybillQuery({
        keyword,
        status: waybillStatuses.join(',') || undefined,
        payment_type: dto.payment_type,
        origin_hub_id: dto.origin_hub_id,
        dest_hub_id: dto.dest_hub_id,
        date_from: dto.date_from,
        date_to: dto.date_to,
        page: 1,
        limit: 100,
      }, currentUser).getManyAndCount() as [WaybillSearchRow[], number];

    const [trips, tripTotal] = !includeTrips
      ? [[], 0] as [TripSearchRow[], number]
      : await this.buildTripQuery({
        keyword,
        status: tripStatuses.join(',') || undefined,
        start_hub_id: dto.origin_hub_id,
        end_hub_id: dto.dest_hub_id,
        departure_from: dto.date_from,
        departure_to: dto.date_to,
        page: 1,
        limit: 100,
      }, currentUser).getManyAndCount() as [TripSearchRow[], number];

    const results = this.mapGlobalResults(waybills, trips)
      .sort((left, right) => this.resultTime(right).getTime() - this.resultTime(left).getTime());
    const total = type === GlobalSearchType.WAYBILL
      ? waybillTotal
      : type === GlobalSearchType.TRIP
        ? tripTotal
        : waybillTotal + tripTotal;

    return this.paginateItems(results.slice(offset, offset + limit), total, page, limit);
  }

  async searchWaybills(dto: SearchWaybillsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.validateRole(currentUser);
    const page = dto.page ?? 1;
    const limit = this.resolveLimit(dto.limit);
    this.validateDateRange(dto.date_from, dto.date_to);
    await this.validateHubFilter(dto.origin_hub_id, currentUser);
    await this.validateHubFilter(dto.dest_hub_id, currentUser);
    const qb = this.buildWaybillQuery({ ...dto, keyword: this.normalizeKeyword(dto.keyword), limit }, currentUser);
    const [items, total] = await qb.getManyAndCount();
    return this.paginateItems(items.map((item) => this.sanitizeWaybill(item as WaybillSearchRow, currentUser)), total, page, limit);
  }

  async searchTrips(dto: SearchTripsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.validateRole(currentUser);
    const page = dto.page ?? 1;
    const limit = this.resolveLimit(dto.limit);
    this.validateDateRange(dto.departure_from, dto.departure_to);
    await this.validateHubFilter(dto.start_hub_id, currentUser);
    await this.validateHubFilter(dto.end_hub_id, currentUser);
    await this.validateTruckFilter(dto.truck_id);
    await this.validateManifestFilter(dto.manifest_id);
    const qb = this.buildTripQuery({ ...dto, keyword: this.normalizeKeyword(dto.keyword), limit }, currentUser);
    const [items, total] = await qb.getManyAndCount();
    return this.paginateItems(items.map((item) => this.sanitizeTrip(item as TripSearchRow, currentUser)), total, page, limit);
  }

  buildWaybillQuery(dto: WaybillQueryFilters, currentUser: UserEntity): SelectQueryBuilder<WaybillEntity> {
    const page = dto.page ?? 1;
    const limit = this.resolveLimit(dto.limit);
    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .select([
        'waybill.id', 'waybill.waybill_code', 'waybill.sender_info', 'waybill.receiver_info', 'waybill.payment_type', 'waybill.current_state',
        'waybill.origin_hub_id', 'waybill.dest_hub_id', 'waybill.current_hub_id', 'waybill.last_mile_driver_id', 'waybill.created_at', 'waybill.cost_amount',
        'waybill.sender_phone', 'waybill.receiver_phone', 'waybill.receiver_address', 'waybill.ma_kh', 'waybill.noi_den',
        'waybill.weight', 'waybill.length', 'waybill.width', 'waybill.height', 'waybill.volumetric_weight',
        'origin_hub.id', 'origin_hub.code', 'origin_hub.name', 'dest_hub.id', 'dest_hub.code', 'dest_hub.name',
      ])
      .orderBy('waybill.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.keyword) {
      const keyword = `%${dto.keyword}%`;
      const normalizedWaybillKeyword = this.normalizeWaybillCodeKeyword(dto.keyword);
      qb.andWhere(new Brackets((inner) => {
        inner
          .where('waybill.waybill_code ILIKE :keyword', { keyword })
          .orWhere('waybill.sender_info ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_info ILIKE :keyword', { keyword })
          .orWhere('waybill.sender_phone ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_phone ILIKE :keyword', { keyword })
          .orWhere('waybill.receiver_address ILIKE :keyword', { keyword })
          .orWhere('waybill.ma_kh ILIKE :keyword', { keyword })
          .orWhere('waybill.noi_den ILIKE :keyword', { keyword });
        if (normalizedWaybillKeyword) {
          inner.orWhere(
            `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
            { normalizedWaybillKeyword },
          );
        }
      }));
    }
    this.applyCsvFilter(qb, 'waybill.current_state', 'status', dto.status);
    this.applyCsvFilter(qb, 'waybill.payment_type', 'paymentType', dto.payment_type);
    this.applyCsvFilter(qb, 'waybill.origin_hub_id', 'originHubId', dto.origin_hub_id);
    this.applyCsvFilter(qb, 'waybill.dest_hub_id', 'destHubId', dto.dest_hub_id);
    if (dto.date_from) qb.andWhere('waybill.created_at >= :dateFrom', { dateFrom: dto.date_from });
    if (dto.date_to) qb.andWhere('waybill.created_at <= :dateTo', { dateTo: dto.date_to });
    this.applyWaybillScope(qb, currentUser);
    return qb;
  }

  buildTripQuery(dto: TripQueryFilters, currentUser: UserEntity): SelectQueryBuilder<TripEntity> {
    const page = dto.page ?? 1;
    const limit = this.resolveLimit(dto.limit);
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('trip.manifest', 'manifest')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .select([
        'trip.id', 'trip.truck_id', 'trip.manifest_id', 'trip.start_hub_id', 'trip.end_hub_id', 'trip.departure_time', 'trip.arrival_time', 'trip.status', 'trip.created_at',
        'trip.fuel_actual', 'trip.fuel_cost', 'trip.other_costs',
        'truck.id', 'truck.license_plate', 'truck.driver_id', 'manifest.id', 'manifest.manifest_code', 'start_hub.id', 'start_hub.code', 'start_hub.name', 'end_hub.id', 'end_hub.code', 'end_hub.name',
      ])
      .addSelect('COALESCE(trip.departure_time, trip.created_at)', 'trip_sort_time')
      .orderBy('trip_sort_time', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.keyword) {
      const keyword = `%${dto.keyword}%`;
      const numericKeyword = /^\d+$/.test(dto.keyword) ? dto.keyword : null;
      qb.andWhere(new Brackets((inner) => {
        inner.where('truck.license_plate ILIKE :keyword', { keyword })
          .orWhere('manifest.manifest_code ILIKE :keyword', { keyword })
          .orWhere('start_hub.code ILIKE :keyword', { keyword })
          .orWhere('start_hub.name ILIKE :keyword', { keyword })
          .orWhere('end_hub.code ILIKE :keyword', { keyword })
          .orWhere('end_hub.name ILIKE :keyword', { keyword });
        if (numericKeyword) inner.orWhere('trip.id = :numericKeyword', { numericKeyword });
      }));
    }
    this.applyCsvFilter(qb, 'trip.status', 'status', dto.status);
    if (dto.truck_id) qb.andWhere('trip.truck_id = :truckId', { truckId: dto.truck_id });
    if (dto.manifest_id) qb.andWhere('trip.manifest_id = :manifestId', { manifestId: dto.manifest_id });
    this.applyCsvFilter(qb, 'trip.start_hub_id', 'startHubId', dto.start_hub_id);
    this.applyCsvFilter(qb, 'trip.end_hub_id', 'endHubId', dto.end_hub_id);
    if (dto.departure_from) qb.andWhere('trip.departure_time >= :departureFrom', { departureFrom: dto.departure_from });
    if (dto.departure_to) qb.andWhere('trip.departure_time <= :departureTo', { departureTo: dto.departure_to });
    this.applyTripScope(qb, currentUser);
    return qb;
  }

  normalizeKeyword(keyword?: string): string | undefined {
    const normalized = keyword?.trim();
    if (!normalized) return undefined;
    if (normalized.length < 2) throw new BadRequestException('Keyword must be at least 2 characters');
    return normalized;
  }

  private normalizeWaybillCodeKeyword(keyword: string): string | null {
    const compactKeyword = keyword.trim().toUpperCase().replace(/[-\s]+/g, '');
    return /^ECO[A-Z]{2,8}[0-9]+$/.test(compactKeyword)
      ? `%${compactKeyword}%`
      : null;
  }

  mapGlobalResults(waybills: WaybillSearchRow[], trips: TripSearchRow[]): SearchResultEntity[] {
    const waybillResults = waybills.map((waybill) => ({
      id: waybill.id,
      type: 'WAYBILL' as const,
      code: waybill.waybill_code,
      title: `Waybill ${waybill.waybill_code}`,
      subtitle: `${waybill.sender_info} → ${waybill.receiver_info}`,
      status: waybill.current_state,
      hub_summary: `${this.hubLabel(waybill.origin_hub)} → ${this.hubLabel(waybill.dest_hub)}`,
      created_at: waybill.created_at,
      matched_fields: ['waybill_code', 'sender_info', 'receiver_info'],
    }));
    const tripResults = trips.map((trip) => ({
      id: trip.id,
      type: 'TRIP' as const,
      code: trip.manifest?.manifest_code ?? `TRIP-${trip.id}`,
      title: `Trip ${trip.id}`,
      subtitle: [trip.truck?.license_plate, trip.manifest?.manifest_code].filter(Boolean).join(' · '),
      status: trip.status,
      hub_summary: `${this.hubLabel(trip.start_hub)} → ${this.hubLabel(trip.end_hub)}`,
      departure_time: trip.departure_time,
      matched_fields: ['id', 'license_plate', 'manifest_code', 'hub'],
    }));
    return [...waybillResults, ...tripResults];
  }

  private validateRole(currentUser: UserEntity): void {
    if (currentUser.role_mask > 0) return;
    throw new ForbiddenException('Insufficient role permissions for search');
  }

  private async validateHubFilter(hubId: string | undefined, currentUser: UserEntity): Promise<void> {
    if (!hubId) return;
    const hub = await this.hubsRepository.findOne({ where: { id: hubId } });
    if (!hub) throw new NotFoundException('Hub not found');
    if (
      !isManager(currentUser.role_mask)
      && !hasRole(currentUser.role_mask, Roles.ACCOUNTANT)
      && currentUser.hub_id
      && currentUser.hub_id !== hubId
    ) throw new ForbiddenException('User cannot search outside assigned hub');
  }

  private async validateTruckFilter(truckId?: string): Promise<void> {
    if (!truckId) return;
    const truck = await this.trucksRepository.findOne({ where: { id: truckId } });
    if (!truck) throw new NotFoundException('Truck not found');
  }

  private async validateManifestFilter(manifestId?: string): Promise<void> {
    if (!manifestId) return;
    const manifest = await this.manifestsRepository.findOne({ where: { id: manifestId } });
    if (!manifest) throw new NotFoundException('Manifest not found');
  }

  private validateDateRange(from?: Date, to?: Date): void {
    if (from && Number.isNaN(from.getTime())) throw new BadRequestException('Invalid from date');
    if (to && Number.isNaN(to.getTime())) throw new BadRequestException('Invalid to date');
    if (from && to && from.getTime() > to.getTime()) throw new BadRequestException('Date range from must be before or equal to to');
  }

  private resolveLimit(limit = 20): number {
    return Math.min(limit, 100);
  }

  private applyWaybillScope(qb: SelectQueryBuilder<WaybillEntity>, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) return;
    if (hasRole(currentUser.role_mask, Roles.DRIVER)) {
      qb.andWhere('waybill.last_mile_driver_id = :driverId', { driverId: currentUser.id });
      return;
    }
    if (!currentUser.hub_id) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner
      .where('waybill.origin_hub_id = :userHubId', { userHubId: currentUser.hub_id })
      .orWhere('waybill.dest_hub_id = :userHubId', { userHubId: currentUser.hub_id })
      .orWhere('waybill.current_hub_id = :userHubId', { userHubId: currentUser.hub_id })));
  }

  private applyTripScope(qb: SelectQueryBuilder<TripEntity>, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask)) return;
    if (hasRole(currentUser.role_mask, Roles.DRIVER)) {
      qb.andWhere('truck.driver_id = :driverId', { driverId: currentUser.id });
      return;
    }
    if (!currentUser.hub_id) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner
      .where('trip.start_hub_id = :userHubId', { userHubId: currentUser.hub_id })
      .orWhere('trip.end_hub_id = :userHubId', { userHubId: currentUser.hub_id })));
  }

  private sanitizeWaybill(waybill: WaybillSearchRow, currentUser: UserEntity): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: waybill.id,
      waybill_code: waybill.waybill_code,
      sender_info: waybill.sender_info,
      receiver_info: waybill.receiver_info,
      payment_type: waybill.payment_type,
      status: waybill.current_state,
      origin_hub_id: waybill.origin_hub_id,
      dest_hub_id: waybill.dest_hub_id,
      current_hub_id: waybill.current_hub_id,
      last_mile_driver_id: waybill.last_mile_driver_id,
      created_at: waybill.created_at,
      weight: waybill.weight,
      length: waybill.length,
      width: waybill.width,
      height: waybill.height,
      volumetric_weight: waybill.volumetric_weight,
      origin_hub: waybill.origin_hub ? this.safeHub(waybill.origin_hub) : undefined,
      dest_hub: waybill.dest_hub ? this.safeHub(waybill.dest_hub) : undefined,
    };
    if (isManager(currentUser.role_mask) || hasRole(currentUser.role_mask, Roles.ACCOUNTANT)) result.cost_amount = waybill.cost_amount;
    return result;
  }

  private sanitizeTrip(trip: TripSearchRow, currentUser: UserEntity): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: trip.id,
      truck_id: trip.truck_id,
      manifest_id: trip.manifest_id,
      start_hub_id: trip.start_hub_id,
      end_hub_id: trip.end_hub_id,
      departure_time: trip.departure_time,
      arrival_time: trip.arrival_time,
      status: trip.status,
      created_at: trip.created_at,
      fuel_actual: trip.fuel_actual,
      fuel_cost: trip.fuel_cost,
      other_costs: trip.other_costs,
      truck: trip.truck ? { id: trip.truck.id, license_plate: trip.truck.license_plate, driver_id: trip.truck.driver_id } : null,
      manifest: trip.manifest ? { id: trip.manifest.id, manifest_code: trip.manifest.manifest_code } : undefined,
      start_hub: trip.start_hub ? this.safeHub(trip.start_hub) : undefined,
      end_hub: trip.end_hub ? this.safeHub(trip.end_hub) : undefined,
    };
    if (isManager(currentUser.role_mask)) result.profit_visible = true;
    return result;
  }

  private safeHub(hub: HubEntity): Record<string, string> {
    return { id: hub.id, code: hub.code, name: hub.name };
  }

  private hubLabel(hub?: HubEntity): string {
    if (!hub) return 'N/A';
    return hub.code ? `${hub.code} - ${hub.name}` : hub.name;
  }

  private paginateItems<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  private resultTime(result: SearchResultEntity): Date {
    return result.departure_time ?? result.created_at ?? new Date(0);
  }

  private parseCsv(value?: string): string[] {
    return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
  }

  private applyCsvFilter(
    qb: SelectQueryBuilder<WaybillEntity> | SelectQueryBuilder<TripEntity>,
    column: string,
    parameter: string,
    rawValue?: string,
  ): void {
    const values = this.parseCsv(rawValue);
    if (!values.length) return;
    if (values.length === 1) {
      qb.andWhere(`${column} = :${parameter}`, { [parameter]: values[0] });
      return;
    }
    qb.andWhere(`${column} IN (:...${parameter})`, { [parameter]: values });
  }

  private isWaybillStatus(status?: string): status is WaybillState {
    return !!status && Object.values(WaybillState).includes(status as WaybillState);
  }

  private isTripStatus(status?: string): status is TripStatus {
    return !!status && Object.values(TripStatus).includes(status as TripStatus);
  }
}
