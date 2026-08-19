import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentType, RemittanceStatus, TripStatus, WaybillState } from '../common/enums';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds, getDefaultHubId } from '../common/user-hub-scope';
import { ExpenseEntity } from '../expenses/expense.entity';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { ReconciliationEntity } from '../reconciliations/reconciliation.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryOverdueDto } from './dto/query-overdue.dto';
import { RevenueGroupBy, RevenueReportQueryDto } from './dto/revenue-report-query.dto';

type Scope = { hubId?: string; canViewSystem: boolean; canViewFinance: boolean; canViewProfit: boolean };
type Paginated<T> = { items: T[]; meta: { total: number; page: number; limit: number; total_pages: number } };
type RawCount = { key?: string; count?: string; total?: string; amount?: string; revenue?: string; cod?: string; cc?: string; remitted?: string; fuel?: string; other?: string };

const WAYBILL_STATUSES = [WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE, WaybillState.MANIFEST_CLOSED, WaybillState.LOADED, WaybillState.IN_TRANSIT, WaybillState.AT_DEST_HUB, WaybillState.OUT_FOR_DELIVERY, WaybillState.DELIVERED, WaybillState.RETURNED];
const TRIP_STATUSES = ['PLANNED', 'LOADING', 'IN_TRANSIT', 'ARRIVED_PENDING_CONFIRM', 'COMPLETED', 'CANCELLED'];

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(ManifestEntity) private readonly manifestsRepository: Repository<ManifestEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(TruckEntity) private readonly trucksRepository: Repository<TruckEntity>,
    @InjectRepository(ReconciliationEntity) private readonly reconciliationsRepository: Repository<ReconciliationEntity>,
    @InjectRepository(ExpenseEntity) private readonly expensesRepository: Repository<ExpenseEntity>,
  ) {}

  async getKpiSummary(query: QueryDashboardDto, currentUser: UserEntity) {
    this.assertAnyRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const scope = this.buildDashboardScope(currentUser);

    const waybillQb = this.baseWaybillQuery(range, scope);
    const tripQb = this.baseTripQuery(range, scope);
    const manifestQb = this.baseManifestQuery(range, scope);
    const finance = await this.getFinanceSummary(range, currentUser);

    const [totalWaybills, totalTrips, totalManifests, deliveredWaybills, returnedWaybills, inTransitWaybills, overdueWaybills] = await Promise.all([
      waybillQb.clone().getCount(),
      tripQb.clone().getCount(),
      manifestQb.clone().getCount(),
      waybillQb.clone().andWhere('waybill.current_state = :delivered', { delivered: WaybillState.DELIVERED }).getCount(),
      waybillQb.clone().andWhere('waybill.current_state = :returned', { returned: WaybillState.RETURNED }).getCount(),
      waybillQb.clone().andWhere('waybill.current_state = :inTransit', { inTransit: WaybillState.IN_TRANSIT }).getCount(),
      this.countOverdueWaybills(range, scope),
    ]);

    return {
      total_waybills: totalWaybills,
      total_trips: totalTrips,
      total_manifests: totalManifests,
      delivered_waybills: deliveredWaybills,
      returned_waybills: returnedWaybills,
      overdue_waybills: overdueWaybills,
      in_transit_waybills: inTransitWaybills,
      pending_cod_amount: finance.pending_cod_amount,
      total_revenue: finance.total_revenue,
      total_cost: finance.total_cost,
      estimated_profit: finance.estimated_profit,
    };
  }

  async getOverdueWaybills(query: QueryOverdueDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertAnyRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const scope = this.buildDashboardScope(currentUser);
    const page = range.page ?? 1;
    const limit = this.resolveLimit(range.limit);
    const qb = this.overdueWaybillQuery(range, scope)
      .leftJoinAndSelect('waybill.origin_hub', 'origin_hub')
      .leftJoinAndSelect('waybill.dest_hub', 'dest_hub')
      .select(['waybill.id', 'waybill.waybill_code', 'waybill.current_state', 'waybill.receiver_info', 'waybill.priority', 'waybill.created_at', 'waybill.received_at', 'waybill.updated_at', 'waybill.cost_amount', 'origin_hub.id', 'origin_hub.code', 'origin_hub.name', 'dest_hub.id', 'dest_hub.code', 'dest_hub.name'])
      .orderBy('waybill.created_at', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return this.paginate(items.map((item) => this.mapOverdueWaybill(item as WaybillEntity & { origin_hub?: HubEntity; dest_hub?: HubEntity }, currentUser)), total, page, limit);
  }

  async getRevenueReport(query: RevenueReportQueryDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertAnyRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const scope = this.buildDashboardScope(currentUser);
    const page = range.page ?? 1;
    const limit = this.resolveLimit(range.limit);
    const groupBy = query.group_by ?? RevenueGroupBy.DAY;
    const qb = this.baseWaybillQuery(range, scope);
    this.applyPaymentAndStatus(qb, range);
    this.applyRevenueGrouping(qb, groupBy);
    const totalRows = await qb.clone().getRawMany();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany();
    const items = rows.map((row) => ({ group: row.group_key, total_waybills: Number(row.total ?? 0), total_revenue: Number(row.revenue ?? 0), payment_type: row.payment_type, hub_id: row.hub_id }));
    return this.paginate(items, totalRows.length, page, limit);
  }

  async getWaybillStatusStats(query: QueryDashboardDto, currentUser: UserEntity) {
    this.assertAnyRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const qb = this.baseWaybillQuery(range, this.buildDashboardScope(currentUser));
    const rows = await qb.select('waybill.current_state', 'key').addSelect('COUNT(*)', 'count').groupBy('waybill.current_state').getRawMany<RawCount>();
    return this.fillStats(WAYBILL_STATUSES, rows);
  }

  async getTripStatusStats(query: QueryDashboardDto, currentUser: UserEntity) {
    this.assertAnyRole(currentUser, [Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const qb = this.baseTripQuery(range, this.buildDashboardScope(currentUser));
    const rows = await qb.select('trip.status', 'key').addSelect('COUNT(*)', 'count').groupBy('trip.status').getRawMany<RawCount>();
    return this.fillStats(TRIP_STATUSES, rows);
  }

  async getHubPerformance(query: QueryDashboardDto, currentUser: UserEntity) {
    this.assertAnyRole(currentUser, [Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const hubs = await this.hubsRepository.createQueryBuilder('hub').select(['hub.id', 'hub.code', 'hub.name']).getMany();
    const scope = this.buildDashboardScope(currentUser);
    return Promise.all(hubs.map(async (hub) => {
      const hubScope = { ...scope, hubId: hub.id };
      const waybillQb = this.baseWaybillQuery(range, hubScope);
      return {
        hub_id: hub.id,
        hub_code: hub.code,
        hub_name: hub.name,
        total_inbound: await waybillQb.clone().andWhere('waybill.dest_hub_id = :hubId', { hubId: hub.id }).getCount(),
        total_outbound: await waybillQb.clone().andWhere('waybill.origin_hub_id = :hubId', { hubId: hub.id }).getCount(),
        delivered_count: await waybillQb.clone().andWhere('waybill.current_state = :status', { status: WaybillState.DELIVERED }).getCount(),
        returned_count: await waybillQb.clone().andWhere('waybill.current_state = :status', { status: WaybillState.RETURNED }).getCount(),
        overdue_count: await this.countOverdueWaybills(range, hubScope),
        cod_pending: Number((await waybillQb.clone().select('COALESCE(SUM(CASE WHEN waybill.payment_type = :cod THEN waybill.cost_amount ELSE 0 END), 0)', 'amount').setParameter('cod', PaymentType.COD).getRawOne<RawCount>())?.amount ?? 0),
      };
    }));
  }

  async getFinanceSummary(query: QueryDashboardDto, currentUser: UserEntity) {
    this.assertAnyRole(currentUser, [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR]);
    const range = await this.normalizeQuery(query, currentUser);
    const scope = this.buildDashboardScope(currentUser);
    const waybillFinance = await this.baseWaybillQuery(range, scope)
      .select('COALESCE(SUM(waybill.cost_amount), 0)', 'revenue')
      .addSelect('COALESCE(SUM(CASE WHEN waybill.payment_type = :cod THEN waybill.cost_amount ELSE 0 END), 0)', 'cod')
      .addSelect('COALESCE(SUM(CASE WHEN waybill.payment_type = :cc THEN waybill.cost_amount ELSE 0 END), 0)', 'cc')
      .setParameters({ cod: PaymentType.COD, cc: PaymentType.CC })
      .getRawOne<RawCount>();
    const reconciliation = await this.baseReconciliationQuery(range, scope)
      .select('COALESCE(SUM(reconciliation.cod_cash_held), 0)', 'cod')
      .addSelect('COALESCE(SUM(reconciliation.cc_cash_held), 0)', 'cc')
      .addSelect('COALESCE(SUM(reconciliation.total_remitted), 0)', 'remitted')
      .getRawOne<RawCount>();
    const tripCosts = await this.baseTripQuery(range, scope)
      .select('COALESCE(SUM(trip.fuel_cost), 0)', 'fuel')
      .addSelect('COALESCE(SUM(trip.other_costs), 0)', 'other')
      .getRawOne<RawCount>();
    const totalRevenue = Number(waybillFinance?.revenue ?? 0);
    const totalCost = Number(tripCosts?.fuel ?? 0) + Number(tripCosts?.other ?? 0);
    const result: Record<string, number> = {
      total_revenue: totalRevenue,
      cod_amount: Number(waybillFinance?.cod ?? 0),
      cc_amount: Number(waybillFinance?.cc ?? 0),
      pending_cod_amount: Number(waybillFinance?.cod ?? 0),
      cod_cash_held: Number(reconciliation?.cod ?? 0),
      cc_cash_held: Number(reconciliation?.cc ?? 0),
      total_remitted: Number(reconciliation?.remitted ?? 0),
      fuel_cost: Number(tripCosts?.fuel ?? 0),
      other_costs: Number(tripCosts?.other ?? 0),
      total_cost: totalCost,
    };
    if (isManager(currentUser.role_mask)) result.estimated_profit = totalRevenue - totalCost;
    return result;
  }

  buildDashboardScope(currentUser: UserEntity): Scope {
    return { hubId: getDefaultHubId(currentUser), canViewSystem: isManager(currentUser.role_mask), canViewFinance: hasRole(currentUser.role_mask, Roles.ACCOUNTANT) || isManager(currentUser.role_mask), canViewProfit: isManager(currentUser.role_mask) };
  }

  private async normalizeQuery<T extends QueryDashboardDto>(query: T, currentUser: UserEntity): Promise<T> {
    const dateTo = query.date_to ?? new Date();
    const dateFrom = query.date_from ?? new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dateFrom.getTime())) throw new BadRequestException('Invalid date_from');
    if (Number.isNaN(dateTo.getTime())) throw new BadRequestException('Invalid date_to');
    if (dateFrom.getTime() > dateTo.getTime()) throw new BadRequestException('date_from must be before or equal to date_to');
    if (query.payment_type && !Object.values(PaymentType).includes(query.payment_type)) throw new BadRequestException('Invalid payment_type');
    if (query.hub_id) {
      const hub = await this.hubsRepository.findOne({ where: { id: query.hub_id } });
      if (!hub) throw new NotFoundException('Hub not found');
      if (!isManager(currentUser.role_mask) && getAssignedHubIds(currentUser).length && !getAssignedHubIds(currentUser).includes(String(query.hub_id))) throw new ForbiddenException('User cannot view dashboard outside assigned hub');
    }
    return { ...query, date_from: dateFrom, date_to: dateTo, limit: this.resolveLimit(query.limit) };
  }

  private baseWaybillQuery(query: QueryDashboardDto, scope: Scope): SelectQueryBuilder<WaybillEntity> {
    const qb = this.waybillsRepository.createQueryBuilder('waybill').where('waybill.created_at BETWEEN :dateFrom AND :dateTo', { dateFrom: query.date_from, dateTo: query.date_to });
    this.applyWaybillScope(qb, query.hub_id ?? scope.hubId, scope.canViewSystem);
    this.applyPaymentAndStatus(qb, query);
    return qb;
  }

  private baseTripQuery(query: QueryDashboardDto, scope: Scope): SelectQueryBuilder<TripEntity> {
    const qb = this.tripsRepository.createQueryBuilder('trip').where('trip.created_at BETWEEN :dateFrom AND :dateTo', { dateFrom: query.date_from, dateTo: query.date_to });
    this.applyTripScope(qb, query.hub_id ?? scope.hubId, scope.canViewSystem);
    if (query.status) qb.andWhere('trip.status = :status', { status: query.status });
    return qb;
  }

  private baseManifestQuery(query: QueryDashboardDto, scope: Scope): SelectQueryBuilder<ManifestEntity> {
    const qb = this.manifestsRepository.createQueryBuilder('manifest').where('manifest.created_at BETWEEN :dateFrom AND :dateTo', { dateFrom: query.date_from, dateTo: query.date_to });
    if (!scope.canViewSystem || query.hub_id) {
      const hubId = query.hub_id ?? scope.hubId;
      if (!hubId) throw new ForbiddenException('User is not assigned to a hub');
      qb.andWhere(new Brackets((inner) => inner.where('manifest.origin_hub_id = :hubId', { hubId }).orWhere('manifest.dest_hub_id = :hubId', { hubId })));
    }
    return qb;
  }

  private baseReconciliationQuery(query: QueryDashboardDto, scope: Scope): SelectQueryBuilder<ReconciliationEntity> {
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation').where('reconciliation.reconciliation_date BETWEEN :dateFrom AND :dateTo', { dateFrom: query.date_from, dateTo: query.date_to });
    if (!scope.canViewSystem || query.hub_id) {
      const hubId = query.hub_id ?? scope.hubId;
      if (!hubId) throw new ForbiddenException('User is not assigned to a hub');
      qb.andWhere('reconciliation.hub_id = :hubId', { hubId });
    }
    return qb;
  }

  private overdueWaybillQuery(query: QueryDashboardDto, scope: Scope): SelectQueryBuilder<WaybillEntity> {
    const qb = this.baseWaybillQuery(query, scope);
    const now = new Date();
    qb.andWhere(new Brackets((inner) => inner
      .where('waybill.current_state IN (:...warehouseStates) AND COALESCE(waybill.received_at, waybill.created_at) <= :warehouseCutoff', { warehouseStates: [WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE], warehouseCutoff: new Date(now.getTime() - 48 * 60 * 60 * 1000) })
      .orWhere('waybill.current_state = :inTransit AND waybill.created_at <= :transitCutoff', { inTransit: WaybillState.IN_TRANSIT, transitCutoff: new Date(now.getTime() - 72 * 60 * 60 * 1000) })
      .orWhere('waybill.current_state = :outForDelivery AND waybill.created_at <= :deliveryCutoff', { outForDelivery: WaybillState.OUT_FOR_DELIVERY, deliveryCutoff: new Date(now.getTime() - 24 * 60 * 60 * 1000) })
      .orWhere('waybill.current_state = :atDestHub AND waybill.created_at <= :destinationCutoff', { atDestHub: WaybillState.AT_DEST_HUB, destinationCutoff: new Date(now.getTime() - 24 * 60 * 60 * 1000) })));
    return qb;
  }

  private async countOverdueWaybills(query: QueryDashboardDto, scope: Scope): Promise<number> {
    return this.overdueWaybillQuery(query, scope).getCount();
  }

  private applyPaymentAndStatus(qb: SelectQueryBuilder<WaybillEntity>, query: QueryDashboardDto): void {
    if (query.payment_type) qb.andWhere('waybill.payment_type = :paymentType', { paymentType: query.payment_type });
    if (query.status) qb.andWhere('waybill.current_state = :status', { status: query.status });
  }

  private applyWaybillScope(qb: SelectQueryBuilder<WaybillEntity>, hubId: string | undefined, canViewSystem: boolean): void {
    if (canViewSystem && !hubId) return;
    if (!hubId) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner.where('waybill.origin_hub_id = :hubId', { hubId }).orWhere('waybill.dest_hub_id = :hubId', { hubId }).orWhere('waybill.current_hub_id = :hubId', { hubId })));
  }

  private applyTripScope(qb: SelectQueryBuilder<TripEntity>, hubId: string | undefined, canViewSystem: boolean): void {
    if (canViewSystem && !hubId) return;
    if (!hubId) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner.where('trip.start_hub_id = :hubId', { hubId }).orWhere('trip.end_hub_id = :hubId', { hubId })));
  }

  private applyRevenueGrouping(qb: SelectQueryBuilder<WaybillEntity>, groupBy: RevenueGroupBy): void {
    if (groupBy === RevenueGroupBy.DAY) qb.select("DATE_TRUNC('day', waybill.created_at)", 'group_key').addSelect('COUNT(*)', 'total').addSelect('COALESCE(SUM(waybill.cost_amount), 0)', 'revenue').groupBy('group_key').orderBy('group_key', 'DESC');
    if (groupBy === RevenueGroupBy.HUB) qb.select('waybill.origin_hub_id', 'group_key').addSelect('waybill.origin_hub_id', 'hub_id').addSelect('COUNT(*)', 'total').addSelect('COALESCE(SUM(waybill.cost_amount), 0)', 'revenue').groupBy('waybill.origin_hub_id').orderBy('group_key', 'ASC');
    if (groupBy === RevenueGroupBy.PAYMENT_TYPE) qb.select('waybill.payment_type', 'group_key').addSelect('waybill.payment_type', 'payment_type').addSelect('COUNT(*)', 'total').addSelect('COALESCE(SUM(waybill.cost_amount), 0)', 'revenue').groupBy('waybill.payment_type').orderBy('group_key', 'ASC');
  }

  private mapOverdueWaybill(waybill: WaybillEntity & { origin_hub?: HubEntity; dest_hub?: HubEntity }, currentUser: UserEntity): Record<string, unknown> {
    const baseTime = waybill.received_at ?? waybill.created_at;
    const result: Record<string, unknown> = {
      id: waybill.id,
      waybill_code: waybill.waybill_code,
      status: waybill.current_state,
      hub: this.hubLabel(waybill.dest_hub ?? waybill.origin_hub),
      receiver_info: waybill.receiver_info,
      overdue_hours: Math.max(0, Math.floor((Date.now() - baseTime.getTime()) / 36e5)),
      priority: waybill.priority,
    };
    if (isManager(currentUser.role_mask)) result.cost_amount = waybill.cost_amount;
    return result;
  }

  private fillStats(statuses: string[], rows: RawCount[]): Record<string, number> {
    const counts = new Map(rows.map((row) => [String(row.key), Number(row.count ?? 0)]));
    return Object.fromEntries(statuses.map((status) => [status, counts.get(status) ?? 0]));
  }

  private assertAnyRole(currentUser: UserEntity, roles: number[]): void {
    if (roles.some((role) => hasRole(currentUser.role_mask, role))) return;
    throw new ForbiddenException('Insufficient role permissions for dashboard');
  }

  private resolveLimit(limit = 20): number {
    return Math.min(limit, 100);
  }

  private paginate<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  private hubLabel(hub?: HubEntity): string {
    if (!hub) return 'N/A';
    return hub.code ? `${hub.code} - ${hub.name}` : hub.name;
  }
}
