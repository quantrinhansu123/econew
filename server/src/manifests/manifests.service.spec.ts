import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Roles } from '../common/roles';
import { TripStatus, WaybillState } from '../common/enums';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { ManifestStatus } from './dto/manifest.enums';
import { ManifestWaybillEntity } from './manifest-waybill.entity';
import { ManifestEntity } from './manifest.entity';
import { ManifestsService } from './manifests.service';

const makeRepo = () => ({
  create: jest.fn((value) => ({ ...value })),
  save: jest.fn(async (value) => value),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const dispatcher = { id: 'u1', role_mask: Roles.DISPATCHER, hub_id: '1' } as any;
const manager = { id: 'm1', role_mask: Roles.MANAGER, hub_id: null } as any;

const draftManifest = (overrides: Record<string, any> = {}) => ({
  id: '10',
  manifest_code: 'MF-20260526-001',
  origin_hub_id: '1',
  dest_hub_id: '2',
  seal_code: '',
  status: ManifestStatus.DRAFT,
  manifest_waybills: [],
  created_by: 'u1',
  ...overrides,
});

const waybill = (overrides: Record<string, any> = {}) => ({
  id: '100',
  waybill_code: 'WB100',
  origin_hub_id: '1',
  dest_hub_id: '2',
  current_hub_id: '1',
  current_state: WaybillState.IN_WAREHOUSE,
  status: WaybillState.IN_WAREHOUSE,
  weight: 5,
  cod_amount: 10,
  manifest_id: null,
  ...overrides,
});

describe('ManifestsService', () => {
  let service: ManifestsService;
  let manifestsRepo: ReturnType<typeof makeRepo>;
  let linksRepo: ReturnType<typeof makeRepo>;
  let waybillsRepo: ReturnType<typeof makeRepo>;
  let splitsRepo: ReturnType<typeof makeRepo>;
  let hubsRepo: ReturnType<typeof makeRepo>;
  let tripsRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    manifestsRepo = makeRepo();
    linksRepo = makeRepo();
    waybillsRepo = makeRepo();
    splitsRepo = makeRepo();
    hubsRepo = makeRepo();
    tripsRepo = makeRepo();
    hubsRepo.findOne.mockResolvedValue({ id: '1', is_active: true });
    manifestsRepo.findOne.mockImplementation(async (options: any) => {
      if (options?.where?.manifest_code) return null;
      return draftManifest();
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManifestsService,
        { provide: getRepositoryToken(ManifestEntity), useValue: manifestsRepo },
        { provide: getRepositoryToken(ManifestWaybillEntity), useValue: linksRepo },
        { provide: getRepositoryToken(WaybillEntity), useValue: waybillsRepo },
        { provide: getRepositoryToken(WaybillSplitEntity), useValue: splitsRepo },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepo },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepo },
      ],
    }).compile();

    service = moduleRef.get(ManifestsService);
  });

  it('create manifest thành công và sinh manifest_code unique', async () => {
    manifestsRepo.findOne.mockResolvedValue(null);
    const result = await service.create({ origin_hub_id: '1', dest_hub_id: '2', note: 'N' }, dispatcher);
    expect(result.manifest_code).toMatch(/^MF-\d{8}-001$/);
    expect(result.status).toBe(ManifestStatus.DRAFT);
    expect(manifestsRepo.save).toHaveBeenCalled();
  });

  it('create với hub inactive phải bị chặn', async () => {
    hubsRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create({ origin_hub_id: '1', dest_hub_id: '2' }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAll filter keyword/status/hub/trip/date range', async () => {
    const qb = mockQb();
    manifestsRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[draftManifest()], 1]);
    await service.findAll({ keyword: 'MF', status: ManifestStatus.DRAFT, origin_hub_id: '1', dest_hub_id: '2', trip_id: '9', from_date: '2026-05-01', to_date: '2026-05-26', page: 1, limit: 10 }, manager);
    const whereSql = qb.andWhere.mock.calls.map((call: any[]) => String(call[0])).join(' ');
    expect(whereSql).toContain('manifest.status');
    expect(whereSql).toContain('manifest.origin_hub_id');
    expect(whereSql).toContain('manifest.dest_hub_id');
    expect(whereSql).toContain('trip.id');
    expect(whereSql).toContain('manifest.created_at >=');
    expect(whereSql).toContain('manifest.created_at <=');
  });

  it('user hub chỉ thấy manifest thuộc hub mình', async () => {
    const qb = mockQb();
    manifestsRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    await service.findAll({}, dispatcher);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Object));
  });

  it('user không có hub không thấy manifest nào', async () => {
    const qb = mockQb();
    manifestsRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    await service.findAll({}, { ...dispatcher, hub_id: null });
    expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
  });

  it('addWaybills thành công', async () => {
    const manifest = draftManifest();
    manifestsRepo.findOne.mockImplementation(async (options: any) => options?.where?.manifest_code ? null : manifest);
    waybillsRepo.find.mockResolvedValue([waybill()]);
    linksRepo.create.mockImplementation((value) => value);
    await service.addWaybills('10', { waybill_ids: ['100'] }, dispatcher);
    expect(linksRepo.save).toHaveBeenCalledWith([{ manifest_id: '10', waybill_id: '100' }]);
    expect(waybillsRepo.save).toHaveBeenCalledWith([expect.objectContaining({ manifest_id: '10' })]);
  });

  it('add waybill không ở IN_WAREHOUSE phải bị chặn', async () => {
    waybillsRepo.find.mockResolvedValue([waybill({ status: WaybillState.RECEIVED, current_state: WaybillState.RECEIVED })]);
    await expect(service.addWaybills('10', { waybill_ids: ['100'] }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('add waybill đã thuộc manifest khác phải bị chặn', async () => {
    waybillsRepo.find.mockResolvedValue([waybill({ manifest_id: '99' })]);
    await expect(service.addWaybills('10', { waybill_ids: ['100'] }, dispatcher)).rejects.toBeInstanceOf(ConflictException);
  });

  it('add waybill khác origin hub phải bị chặn', async () => {
    waybillsRepo.find.mockResolvedValue([waybill({ origin_hub_id: '3', current_hub_id: '3' })]);
    await expect(service.addWaybills('10', { waybill_ids: ['100'] }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove waybill khỏi manifest DRAFT thành công', async () => {
    waybillsRepo.findOne.mockResolvedValue(waybill({ manifest_id: '10' }));
    await service.removeWaybill('10', '100', dispatcher);
    expect(linksRepo.delete).toHaveBeenCalledWith({ manifest_id: '10', waybill_id: '100' });
    expect(waybillsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ manifest_id: null }));
  });

  it('remove waybill khỏi manifest CLOSED phải bị chặn', async () => {
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ status: ManifestStatus.CLOSED }));
    await expect(service.removeWaybill('10', '100', dispatcher)).rejects.toBeInstanceOf(ConflictException);
  });

  it('close manifest không có vận đơn phải bị chặn', async () => {
    await expect(service.closeManifest('10', { seal_code: 'S1' }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('close manifest chuyển toàn bộ waybill IN_WAREHOUSE → MANIFEST_CLOSED', async () => {
    const wb = waybill();
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ manifest_waybills: [{ waybill: wb }] }));
    const result = await service.closeManifest('10', { seal_code: 'S1' }, dispatcher);
    expect(result.status).toBe(ManifestStatus.CLOSED);
    expect(waybillsRepo.save).toHaveBeenCalledWith([expect.objectContaining({ current_state: WaybillState.MANIFEST_CLOSED, manifest_id: '10' })]);
  });

  it('close manifest lần hai phải bị chặn', async () => {
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ status: ManifestStatus.CLOSED, manifest_waybills: [{ waybill: waybill() }] }));
    await expect(service.closeManifest('10', { seal_code: 'S1' }, dispatcher)).rejects.toBeInstanceOf(ConflictException);
  });

  it('assignTrip với trip không khớp origin_hub phải bị chặn', async () => {
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ status: ManifestStatus.CLOSED }));
    tripsRepo.findOne.mockResolvedValue({ id: '9', start_hub_id: '3', status: TripStatus.PLANNED });
    await expect(service.assignTrip('10', { trip_id: '9' }, dispatcher)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getPrintableManifest không trả cost_amount/profit/tính năng ẩn', async () => {
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ manifest_waybills: [{ waybill: waybill({ cost_amount: '999', freight_amount: 999, profit: 99 }) }] }));
    const result = await service.getPrintableManifest('10', manager);
    expect(JSON.stringify(result)).not.toContain('cost_amount');
    expect(JSON.stringify(result)).not.toContain('freight_amount');
    expect(JSON.stringify(result)).not.toContain('profit');
  });

  it('delete manifest CLOSED phải bị chặn', async () => {
    manifestsRepo.findOne.mockResolvedValue(draftManifest({ status: ManifestStatus.CLOSED }));
    await expect(service.softDelete('10', manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbidden khi role_mask không đủ quyền', async () => {
    await expect(service.create({ origin_hub_id: '1', dest_hub_id: '2' }, { ...dispatcher, role_mask: Roles.WAREHOUSE })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function mockQb() {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  return qb;
}
