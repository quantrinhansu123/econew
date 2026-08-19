import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentType, RemittanceStatus, TripStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { FinanceService } from './finance.service';
import { FinanceReconciliationEntity } from './reconciliation.entity';
import { CashFundEntity } from './cash-fund.entity';

const createQueryBuilder = (options: { one?: unknown; many?: unknown[]; count?: number; rawMany?: unknown[] } = {}) => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(options.one ?? null),
    getMany: jest.fn().mockResolvedValue(options.many ?? []),
    getCount: jest.fn().mockResolvedValue(options.count ?? (options.many ?? []).length),
    getManyAndCount: jest.fn().mockResolvedValue([options.many ?? [], options.count ?? (options.many ?? []).length]),
    getRawMany: jest.fn().mockResolvedValue(options.rawMany ?? []),
  };
  qb.clone = jest.fn(() => qb);
  return qb;
};

const createRepository = () => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => ({ id: value.id ?? '1', remitted_at: value.remitted_at ?? null, ...value })),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const accountant = { id: '10', role_mask: Roles.ACCOUNTANT, hub_id: '1' } as UserEntity;
const manager = { id: '11', role_mask: Roles.MANAGER, hub_id: null } as UserEntity;
const director = { id: '12', role_mask: Roles.DIRECTOR, hub_id: null } as UserEntity;
const warehouse = { id: '13', role_mask: Roles.WAREHOUSE, hub_id: '1' } as UserEntity;
const hub = { id: '1', code: 'HAN', name: 'Ha Noi', is_active: true } as HubEntity;
const reconciliation = {
  id: '1',
  hub_id: '1',
  reconciliation_date: '2026-01-01',
  cod_cash_held: '100',
  cc_cash_held: '50',
  total_remitted: '20',
  remittance_status: RemittanceStatus.PENDING,
  remitted_at: null,
  hub,
} as FinanceReconciliationEntity;
const trip = {
  id: '99',
  truck_id: '8',
  manifest_id: '7',
  start_hub_id: '1',
  end_hub_id: '2',
  fuel_actual: null,
  fuel_cost: null,
  other_costs: null,
  status: TripStatus.IN_TRANSIT,
  departure_time: new Date('2026-01-01'),
} as TripEntity;

describe('FinanceService', () => {
  let service: FinanceService;
  let reconciliationsRepository: ReturnType<typeof createRepository>;
  let hubsRepository: ReturnType<typeof createRepository>;
  let tripsRepository: ReturnType<typeof createRepository>;
  let waybillsRepository: ReturnType<typeof createRepository>;
  let cashFundsRepository: ReturnType<typeof createRepository>;

  beforeEach(async () => {
    reconciliationsRepository = createRepository();
    hubsRepository = createRepository();
    tripsRepository = createRepository();
    waybillsRepository = createRepository();
    cashFundsRepository = createRepository();
    hubsRepository.findOne.mockResolvedValue(hub);
    reconciliationsRepository.findOne.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: getRepositoryToken(FinanceReconciliationEntity), useValue: reconciliationsRepository },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepository },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepository },
        { provide: getRepositoryToken(WaybillEntity), useValue: waybillsRepository },
        { provide: getRepositoryToken(CashFundEntity), useValue: cashFundsRepository },
      ],
    }).compile();

    service = moduleRef.get(FinanceService);
  });

  it('createReconciliation succeeds', async () => {
    const result = await service.createReconciliation({ hub_id: '1', reconciliation_date: '2026-01-01', cod_cash_held: 100, cc_cash_held: 50, total_remitted: 150 }, accountant);
    expect(reconciliationsRepository.save).toHaveBeenCalled();
    expect(result).toMatchObject({ hub_id: '1', remittance_status: RemittanceStatus.REMITTED });
  });

  it('createReconciliation blocks missing hub', async () => {
    hubsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.createReconciliation({ hub_id: '9', reconciliation_date: '2026-01-01', cod_cash_held: 0, cc_cash_held: 0, total_remitted: 0 }, accountant)).rejects.toThrow(NotFoundException);
  });

  it('createReconciliation blocks duplicate hub/date', async () => {
    reconciliationsRepository.findOne.mockResolvedValueOnce(reconciliation);
    await expect(service.createReconciliation({ hub_id: '1', reconciliation_date: '2026-01-01', cod_cash_held: 0, cc_cash_held: 0, total_remitted: 0 }, accountant)).rejects.toThrow(ConflictException);
  });

  it('createReconciliation blocks negative amounts', async () => {
    await expect(service.createReconciliation({ hub_id: '1', reconciliation_date: '2026-01-01', cod_cash_held: -1, cc_cash_held: 0, total_remitted: 0 }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('findReconciliations filters hub/status/date and paginates', async () => {
    const qb = createQueryBuilder({ many: [reconciliation], count: 21 });
    reconciliationsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.findReconciliations({ hub_id: '1', remittance_status: RemittanceStatus.PENDING, date_from: '2026-01-01', date_to: '2026-01-31', page: 2, limit: 20 }, accountant);
    expect(qb.andWhere).toHaveBeenCalledWith('reconciliation.hub_id = :hubId', { hubId: '1' });
    expect(qb.andWhere).toHaveBeenCalledWith('reconciliation.remittance_status = :status', { status: RemittanceStatus.PENDING });
    expect(result.meta).toEqual({ total: 21, page: 2, limit: 20, total_pages: 2 });
  });

  it('user with hub_id only sees own reconciliation while manager/director see system', async () => {
    const scopedQb = createQueryBuilder({ many: [], count: 0 });
    const managerQb = createQueryBuilder({ many: [], count: 0 });
    const directorQb = createQueryBuilder({ many: [], count: 0 });
    reconciliationsRepository.createQueryBuilder.mockReturnValueOnce(scopedQb).mockReturnValueOnce(managerQb).mockReturnValueOnce(directorQb);
    await service.findReconciliations({}, accountant);
    await service.findReconciliations({}, manager);
    await service.findReconciliations({}, director);
    expect(scopedQb.andWhere).toHaveBeenCalledWith('reconciliation.hub_id = :userHubId', { userHubId: '1' });
    expect(managerQb.andWhere).not.toHaveBeenCalledWith('reconciliation.hub_id = :userHubId', expect.anything());
    expect(directorQb.andWhere).not.toHaveBeenCalledWith('reconciliation.hub_id = :userHubId', expect.anything());
  });

  it('findReconciliationById returns detail', async () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...reconciliation, total_remitted: '20', remittance_status: RemittanceStatus.PENDING } }));
    const result = await service.findReconciliationById('1', accountant);
    expect(result).toMatchObject({ id: '1', remaining_amount: 130 });
  });

  it('updateReconciliation blocks REMITTED', async () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...reconciliation, remittance_status: RemittanceStatus.REMITTED } }));
    await expect(service.updateReconciliation('1', { total_remitted: 10 }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('updateReconciliation updates pending amounts', async () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...reconciliation, total_remitted: '20', remittance_status: RemittanceStatus.PENDING } }));
    const result = await service.updateReconciliation('1', { total_remitted: 150 }, accountant);
    expect(result).toMatchObject({ total_remitted: 150, remittance_status: RemittanceStatus.REMITTED });
  });

  it('updateRemittanceStatus only accepts valid statuses and validates remitted amount', async () => {
    await expect(service.updateRemittanceStatus('1', { remittance_status: 'BAD' as RemittanceStatus }, accountant)).rejects.toThrow(BadRequestException);
    reconciliationsRepository.createQueryBuilder.mockReturnValueOnce(createQueryBuilder({ one: { ...reconciliation, total_remitted: '20', remittance_status: RemittanceStatus.PENDING } }));
    await expect(service.updateRemittanceStatus('1', { remittance_status: RemittanceStatus.REMITTED }, accountant)).rejects.toThrow(BadRequestException);
    reconciliationsRepository.createQueryBuilder.mockReturnValueOnce(createQueryBuilder({ one: { ...reconciliation, total_remitted: '150' } }));
    const result = await service.updateRemittanceStatus('1', { remittance_status: RemittanceStatus.REMITTED }, accountant);
    expect(result).toMatchObject({ remittance_status: RemittanceStatus.REMITTED });
  });

  it('getCodReconciliation groups by hub/date/status', async () => {
    const qb = createQueryBuilder({ rawMany: [{ hub_id: '1', reconciliation_date: '2026-01-01', remittance_status: 'DELIVERED', amount: '100', total: '2' }] });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.getCodReconciliation({}, accountant);
    expect(qb.groupBy).toHaveBeenCalledWith('hub_id');
    expect(result.items[0]).toMatchObject({ hub_id: '1', cod_amount: 100, total_waybills: 2 });
  });

  it('getHubReconciliation computes remaining_amount', async () => {
    const qb = createQueryBuilder({ rawMany: [{ hub_id: '1', reconciliation_date: '2026-01-01', cod: '100', cc: '50', remitted: '40' }] });
    reconciliationsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.getHubReconciliation({}, accountant);
    expect(result.items[0]).toMatchObject({ cod_cash_held: 100, cc_cash_held: 50, total_remitted: 40, remaining_amount: 110 });
  });

  it('lists every bill with COD or receiver-paid freight and exposes trip and manifest data', async () => {
    const qb = createQueryBuilder({
      count: 1,
      rawMany: [{
        id: '76',
        waybill_code: 'ECOHAN109076',
        cod_amount: '500000',
        cc_amount: '120000',
        freight_amount: '120000',
        collect_amount: '620000',
        cod_collected_amount: '0',
        payment_type: 'PP',
        payment_note_source: 'ma_kh=KH01|phuong_thuc=Công nợ tháng|unit_price=1500',
        trip_id: '78',
        manifest_code: 'BK-260814-8838',
        cod_reconciled_at: null,
      }],
    });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getHubCodWaybills({ collection_status: 'PENDING' }, accountant);

    expect(qb.andWhere.mock.calls.some(([condition]: [unknown]) => (
      typeof condition === 'string'
      && condition.includes("waybill.payment_type = 'CC'")
      && condition.includes('waybill.cod_amount')
    ))).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.cod_reconciled_at IS NULL');
    expect(result.items[0]).toMatchObject({
      waybill_code: 'ECOHAN109076',
      trip_id: '78',
      manifest_code: 'BK-260814-8838',
      cod_amount: 500000,
      cc_amount: 120000,
      collect_amount: 620000,
      payment_method: 'Công nợ tháng',
      cod_collection_status: 'PENDING',
    });
    expect(result.items[0]).not.toHaveProperty('payment_note_source');
  });

  it('approveInternalTripCost blocks missing trip', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: null }));
    await expect(service.approveInternalTripCost('404', { fuel_cost: 1 }, accountant)).rejects.toThrow(NotFoundException);
  });

  it('approveInternalTripCost blocks negative costs', async () => {
    await expect(service.approveInternalTripCost('99', { fuel_cost: -1 }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('approveInternalTripCost blocks already approved', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...trip, fuel_cost: '10' } }));
    await expect(service.approveInternalTripCost('99', { fuel_cost: 1 }, accountant)).rejects.toThrow(ConflictException);
  });

  it('approveInternalTripCost succeeds for unapproved internal trip', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...trip } }));
    tripsRepository.save.mockImplementation(async (value) => value);
    const result = await service.approveInternalTripCost('99', { fuel_actual: 5, fuel_cost: 10, other_costs: 20 }, accountant);
    expect(result).toMatchObject({ fuel_actual: 5, fuel_cost: 10, other_costs: 20 });
    expect(result).not.toHaveProperty('profit');
  });

  it('approveVendorTripCost blocks already approved', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...trip, truck_id: null, other_costs: '10' } }));
    await expect(service.approveVendorTripCost('99', { other_costs: 1 }, accountant)).rejects.toThrow(ConflictException);
  });

  it('approveVendorTripCost succeeds', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...trip, truck_id: null } }));
    tripsRepository.save.mockImplementation(async (value) => value);
    const result = await service.approveVendorTripCost('99', { fuel_cost: 0, other_costs: 200 }, manager);
    expect(result).toMatchObject({ other_costs: 200, profit_visible: true });
  });

  it('getPendingInternalCosts and getPendingVendorCosts paginate', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [trip], count: 1 }));
    expect((await service.getPendingInternalCosts({}, accountant)).meta.total).toBe(1);
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [{ ...trip, truck_id: null }], count: 1 }));
    expect((await service.getPendingVendorCosts({}, accountant)).meta.total).toBe(1);
  });

  it('ACCOUNTANT can access finance but cannot see profit', async () => {
    const scope = service.buildFinanceScope(accountant);
    expect(scope.canViewProfit).toBe(false);
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ one: { ...trip } }));
    tripsRepository.save.mockImplementation(async (value) => value);
    const result = await service.approveInternalTripCost('99', { fuel_cost: 1 }, accountant);
    expect(result).not.toHaveProperty('profit');
    expect(result).not.toHaveProperty('profit_visible');
  });

  it('blocks non-finance role', async () => {
    await expect(service.findReconciliations({}, warehouse)).rejects.toThrow(ForbiddenException);
  });

  it('date_from > date_to is blocked', async () => {
    await expect(service.findReconciliations({ date_from: '2026-02-01', date_to: '2026-01-01' }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('limit over 100 is capped', async () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [reconciliation], count: 1 }));
    const result = await service.findReconciliations({ limit: 120 }, accountant);
    expect(result.meta.limit).toBe(100);
  });

  it('response does not contain password_hash or refresh_token', async () => {
    reconciliationsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ many: [{ ...reconciliation, password_hash: 'secret', refresh_token: 'token' }], count: 1 }));
    const result = await service.findReconciliations({}, accountant);
    expect(result.items[0]).not.toHaveProperty('password_hash');
    expect(result.items[0]).not.toHaveProperty('refresh_token');
  });
});


