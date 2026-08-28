import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentType, TripStatus, WaybillState } from '../common/enums';
import { Roles } from '../common/roles';
import { ExpenseEntity } from '../expenses/expense.entity';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { ReconciliationEntity } from '../reconciliations/reconciliation.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { DashboardService } from './dashboard.service';
import { RevenueGroupBy } from './dto/revenue-report-query.dto';

const createQueryBuilder = (options: { count?: number; many?: unknown[]; rawMany?: unknown[]; rawOne?: unknown } = {}) => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options.count ?? 0),
    getMany: jest.fn().mockResolvedValue(options.many ?? []),
    getManyAndCount: jest.fn().mockResolvedValue([options.many ?? [], options.count ?? (options.many ?? []).length]),
    getRawMany: jest.fn().mockResolvedValue(options.rawMany ?? []),
    getRawOne: jest.fn().mockResolvedValue(options.rawOne ?? {}),
  };
  qb.clone = jest.fn(() => qb);
  return qb;
};

const createRepository = () => ({ createQueryBuilder: jest.fn(), findOne: jest.fn() });

const manager = { id: '1', role_mask: Roles.MANAGER, hub_id: null } as UserEntity;
const director = { id: '2', role_mask: Roles.DIRECTOR, hub_id: null } as UserEntity;
const dispatcher = { id: '3', role_mask: Roles.DISPATCHER, hub_id: '10' } as UserEntity;
const accountant = { id: '4', role_mask: Roles.ACCOUNTANT, hub_id: '10' } as UserEntity;
const warehouse = { id: '5', role_mask: Roles.WAREHOUSE, hub_id: '10' } as UserEntity;
const hub = { id: '10', code: 'HAN', name: 'Ha Noi' } as HubEntity;
const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000);
const overdueWaybill = {
  id: '100',
  waybill_code: 'WB100',
  current_state: WaybillState.OUT_FOR_DELIVERY,
  receiver_info: 'Receiver',
  priority: 'HIGH',
  created_at: oldDate,
  received_at: oldDate,
  cost_amount: '100000',
  origin_hub: hub,
  dest_hub: hub,
} as WaybillEntity & { origin_hub: HubEntity; dest_hub: HubEntity };

describe('DashboardService', () => {
  let service: DashboardService;
  let waybillsRepository: ReturnType<typeof createRepository>;
  let tripsRepository: ReturnType<typeof createRepository>;
  let manifestsRepository: ReturnType<typeof createRepository>;
  let hubsRepository: ReturnType<typeof createRepository>;
  let trucksRepository: ReturnType<typeof createRepository>;
  let reconciliationsRepository: ReturnType<typeof createRepository>;
  let expensesRepository: ReturnType<typeof createRepository>;

  beforeEach(async () => {
    waybillsRepository = createRepository();
    tripsRepository = createRepository();
    manifestsRepository = createRepository();
    hubsRepository = createRepository();
    trucksRepository = createRepository();
    reconciliationsRepository = createRepository();
    expensesRepository = createRepository();
    hubsRepository.findOne.mockResolvedValue(hub);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(WaybillEntity), useValue: waybillsRepository },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepository },
        { provide: getRepositoryToken(ManifestEntity), useValue: manifestsRepository },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepository },
        { provide: getRepositoryToken(TruckEntity), useValue: trucksRepository },
        { provide: getRepositoryToken(ReconciliationEntity), useValue: reconciliationsRepository },
        { provide: getRepositoryToken(ExpenseEntity), useValue: expensesRepository },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  const mockFinanceRepositories = () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { cod: '20', cc: '30', remitted: '40' } }));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 2, rawOne: { fuel: '50', other: '60' } }));
  };

  it('getKpiSummary only allows MANAGER/DIRECTOR', async () => {
    await expect(service.getKpiSummary({}, dispatcher)).rejects.toThrow(ForbiddenException);
  });

  it('getKpiSummary returns waybill/trip/manifest totals', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 5, rawOne: { revenue: '1000', cod: '200', cc: '100' } }));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 2, rawOne: { fuel: '100', other: '50' } }));
    manifestsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 3 }));
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { cod: '20', cc: '30', remitted: '40' } }));
    const result = await service.getKpiSummary({}, manager);
    expect(result.total_waybills).toBe(5);
    expect(result.total_trips).toBe(2);
    expect(result.total_manifests).toBe(3);
    expect(result.estimated_profit).toBe(850);
  });

  it('getOverdueWaybills returns overdue list and pagination', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [overdueWaybill], count: 21 }));
    const result = await service.getOverdueWaybills({ page: 2, limit: 20 }, dispatcher);
    expect(result.items[0]).toMatchObject({ id: '100', waybill_code: 'WB100', status: WaybillState.OUT_FOR_DELIVERY });
    expect(result.meta).toEqual({ total: 21, page: 2, limit: 20, total_pages: 2 });
  });

  it('getOverdueWaybills hides cost/profit for non-manager', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [{ ...overdueWaybill, password_hash: 'secret', refresh_token: 'token' }], count: 1 }));
    const result = await service.getOverdueWaybills({}, dispatcher);
    expect(result.items[0]).not.toHaveProperty('cost_amount');
    expect(result.items[0]).not.toHaveProperty('profit');
    expect(result.items[0]).not.toHaveProperty('password_hash');
    expect(result.items[0]).not.toHaveProperty('refresh_token');
  });

  it('getRevenueReport only allows accountant/manager/director', async () => {
    await expect(service.getRevenueReport({}, warehouse)).rejects.toThrow(ForbiddenException);
  });

  it('getRevenueReport groups by day/hub/payment_type', async () => {
    const qb = createQueryBuilder({ rawMany: [{ group_key: '2026-01-01', total: '2', revenue: '300' }] });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    let result = await service.getRevenueReport({ group_by: RevenueGroupBy.DAY }, accountant);
    expect(result.items[0]).toMatchObject({ total_waybills: 2, total_revenue: 300 });
    await service.getRevenueReport({ group_by: RevenueGroupBy.HUB }, accountant);
    await service.getRevenueReport({ group_by: RevenueGroupBy.PAYMENT_TYPE }, accountant);
    expect(qb.groupBy).toHaveBeenCalled();
  });

  it('getWaybillStatusStats returns all state machine statuses', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawMany: [{ key: WaybillState.RECEIVED, count: '2' }] }));
    const result = await service.getWaybillStatusStats({}, dispatcher);
    expect(result.RECEIVED).toBe(2);
    expect(result.IN_WAREHOUSE).toBe(0);
    expect(result.RETURNED).toBe(0);
  });

  it('getTripStatusStats returns all trip statuses', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawMany: [{ key: TripStatus.IN_TRANSIT, count: '4' }] }));
    const result = await service.getTripStatusStats({}, dispatcher);
    expect(result.IN_TRANSIT).toBe(4);
    expect(result.PLANNED).toBe(0);
    expect(result.CANCELLED).toBe(0);
  });

  it('getHubPerformance applies hub scope and returns metrics', async () => {
    hubsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [hub] }));
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 1, rawOne: { amount: '75' } }));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ count: 2 }));
    const result = await service.getHubPerformance({}, manager);
    expect(result[0]).toMatchObject({
      hub_id: '10',
      total_waybills: 1,
      total_trips: 2,
      delivered_waybills: 1,
      returned_waybills: 1,
      overdue_waybills: 1,
      total_inbound: 1,
      total_outbound: 1,
      cod_pending: 75,
    });
  });

  it('getFinanceSummary aggregates COD/CC/remittance/cost', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { revenue: '1000', cod: '300', cc: '200' } }));
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { cod: '50', cc: '60', remitted: '70' } }));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { fuel: '100', other: '150' } }));
    const result = await service.getFinanceSummary({}, manager);
    expect(result).toMatchObject({ total_revenue: 1000, cod_amount: 300, cc_amount: 200, cod_cash_held: 50, cc_cash_held: 60, total_remitted: 70, total_cost: 250, estimated_profit: 750 });
  });

  it('date_from > date_to is blocked', async () => {
    await expect(service.getOverdueWaybills({ date_from: new Date('2026-01-02'), date_to: new Date('2026-01-01') }, dispatcher)).rejects.toThrow(BadRequestException);
  });

  it('treats date-only filters as full calendar days in Vietnam', async () => {
    const qb = createQueryBuilder({ rawMany: [] });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getWaybillStatusStats({
      date_from: new Date('2026-08-28'),
      date_to: new Date('2026-08-28'),
    }, manager);

    const range = qb.where.mock.calls[0][1];
    expect(range.dateFrom.toISOString()).toBe('2026-08-27T17:00:00.000Z');
    expect(range.dateTo.toISOString()).toBe('2026-08-28T16:59:59.999Z');
  });

  it('limit over 100 is capped', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [overdueWaybill], count: 1 }));
    const result = await service.getOverdueWaybills({ limit: 120 }, dispatcher);
    expect(result.meta.limit).toBe(100);
  });

  it('user with hub_id only sees scoped data', async () => {
    const qb = createQueryBuilder({ rawMany: [] });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    await service.getWaybillStatusStats({}, dispatcher);
    expect(qb.andWhere).toHaveBeenCalled();
  });

  it('MANAGER/DIRECTOR see system-wide data', async () => {
    const managerQb = createQueryBuilder({ rawMany: [] });
    const directorQb = createQueryBuilder({ rawMany: [] });
    waybillsRepository.createQueryBuilder.mockReturnValueOnce(managerQb).mockReturnValueOnce(directorQb);
    await service.getWaybillStatusStats({}, manager);
    await service.getWaybillStatusStats({}, director);
    expect(managerQb.andWhere).not.toHaveBeenCalled();
    expect(directorQb.andWhere).not.toHaveBeenCalled();
  });

  it('finance response omits profit for accountant', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { revenue: '1000', cod: '300', cc: '200' } }));
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { cod: '50', cc: '60', remitted: '70' } }));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ rawOne: { fuel: '100', other: '150' } }));
    const result = await service.getFinanceSummary({}, accountant);
    expect(result).not.toHaveProperty('profit');
    expect(result).not.toHaveProperty('estimated_profit');
  });

  it('buildDashboardScope exposes RBAC flags', () => {
    expect(service.buildDashboardScope(manager)).toMatchObject({ canViewSystem: true, canViewFinance: true, canViewProfit: true });
    expect(service.buildDashboardScope(accountant)).toMatchObject({ hubId: '10', canViewSystem: false, canViewFinance: true, canViewProfit: false });
  });
});
