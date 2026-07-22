import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentType, TripStatus, WaybillState } from '../common/enums';
import { Roles } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { GlobalSearchType } from './dto/global-search.dto';
import { SearchService } from './search.service';

const createQueryBuilder = (items: unknown[] = [], total = items.length) => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([items, total]),
});

const createRepository = () => ({
  createQueryBuilder: jest.fn(),
  findOne: jest.fn(),
});

const evaluateFirstBrackets = (qb: ReturnType<typeof createQueryBuilder>) => {
  const brackets = qb.andWhere.mock.calls
    .map(([condition]) => condition)
    .find((condition) => typeof condition?.whereFactory === 'function');
  expect(brackets).toBeDefined();
  const inner = {
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
  };
  brackets.whereFactory(inner);
  return inner;
};

const manager = { id: '10', role_mask: Roles.MANAGER, hub_id: null } as UserEntity;
const director = { id: '11', role_mask: Roles.DIRECTOR, hub_id: null } as UserEntity;
const accountant = { id: '14', role_mask: Roles.ACCOUNTANT, hub_id: '1' } as UserEntity;
const staff = { id: '12', role_mask: Roles.WAREHOUSE, hub_id: '1' } as UserEntity;
const driver = { id: '13', role_mask: Roles.DRIVER, hub_id: '1' } as UserEntity;

const originHub = { id: '1', code: 'HAN', name: 'Ha Noi' } as HubEntity;
const destHub = { id: '2', code: 'HCM', name: 'Ho Chi Minh' } as HubEntity;
const waybill = {
  id: '100',
  waybill_code: 'WB100',
  sender_info: 'Alice',
  receiver_info: 'Bob',
  payment_type: PaymentType.COD,
  current_state: WaybillState.IN_WAREHOUSE,
  origin_hub_id: '1',
  dest_hub_id: '2',
  current_hub_id: '1',
  last_mile_driver_id: '13',
  cost_amount: '50000',
  created_at: new Date('2026-01-02T00:00:00.000Z'),
  origin_hub: originHub,
  dest_hub: destHub,
} as WaybillEntity & { origin_hub: HubEntity; dest_hub: HubEntity };
const trip = {
  id: '200',
  truck_id: '300',
  manifest_id: '400',
  start_hub_id: '1',
  end_hub_id: '2',
  departure_time: new Date('2026-01-03T00:00:00.000Z'),
  arrival_time: null,
  status: TripStatus.PLANNED,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  truck: { id: '300', license_plate: '30A-12345', driver_id: '13' },
  manifest: { id: '400', manifest_code: 'MF400' },
  start_hub: originHub,
  end_hub: destHub,
} as TripEntity & { truck: TruckEntity; manifest: ManifestEntity; start_hub: HubEntity; end_hub: HubEntity };

describe('SearchService', () => {
  let service: SearchService;
  let waybillsRepository: ReturnType<typeof createRepository>;
  let tripsRepository: ReturnType<typeof createRepository>;
  let hubsRepository: ReturnType<typeof createRepository>;
  let trucksRepository: ReturnType<typeof createRepository>;
  let manifestsRepository: ReturnType<typeof createRepository>;

  beforeEach(async () => {
    waybillsRepository = createRepository();
    tripsRepository = createRepository();
    hubsRepository = createRepository();
    trucksRepository = createRepository();
    manifestsRepository = createRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(WaybillEntity), useValue: waybillsRepository },
        { provide: getRepositoryToken(TripEntity), useValue: tripsRepository },
        { provide: getRepositoryToken(HubEntity), useValue: hubsRepository },
        { provide: getRepositoryToken(TruckEntity), useValue: trucksRepository },
        { provide: getRepositoryToken(ManifestEntity), useValue: manifestsRepository },
      ],
    }).compile();

    service = moduleRef.get(SearchService);
    hubsRepository.findOne.mockResolvedValue(originHub);
    trucksRepository.findOne.mockResolvedValue({ id: '300' });
    manifestsRepository.findOne.mockResolvedValue({ id: '400' });
  });

  it('globalSearch with ALL returns both WAYBILL and TRIP', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder([waybill], 1));
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder([trip], 1));
    const result = await service.globalSearch({ type: GlobalSearchType.ALL, keyword: 'WB', page: 1, limit: 20 }, manager);
    expect(result.items.map((item) => item.type).sort()).toEqual(['TRIP', 'WAYBILL']);
    expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, total_pages: 1 });
  });

  it('globalSearch with WAYBILL only returns waybills', async () => {
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder([waybill], 1));
    const result = await service.globalSearch({ type: GlobalSearchType.WAYBILL, keyword: 'WB' }, manager);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('WAYBILL');
    expect(tripsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('globalSearch with TRIP only returns trips', async () => {
    tripsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder([trip], 1));
    const result = await service.globalSearch({ type: GlobalSearchType.TRIP, keyword: 'MF' }, manager);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('TRIP');
    expect(waybillsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('searchWaybills finds by waybill_code', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.searchWaybills({ keyword: 'WB100' }, manager);
    expect(qb.andWhere).toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({ waybill_code: 'WB100' });
  });

  it.each(['ECOHAN108962', 'ECO-HAN-108962'])(
    'searchWaybills matches legacy and contiguous bill codes when searching %s',
    async (keyword) => {
      const qb = createQueryBuilder([{ ...waybill, waybill_code: 'ECO-HAN-108962' }], 1);
      waybillsRepository.createQueryBuilder.mockReturnValue(qb);

      await service.searchWaybills({ keyword }, manager);

      const inner = evaluateFirstBrackets(qb);
      expect(inner.orWhere).toHaveBeenCalledWith(
        `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
        { normalizedWaybillKeyword: '%ECOHAN108962%' },
      );
    },
  );

  it('globalSearch applies contiguous bill-code matching to legacy records', async () => {
    const qb = createQueryBuilder([{ ...waybill, waybill_code: 'ECO-HAN-108962' }], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.globalSearch({
      type: GlobalSearchType.WAYBILL,
      keyword: 'ECOHAN108962',
    }, manager);

    const inner = evaluateFirstBrackets(qb);
    expect(inner.orWhere).toHaveBeenCalledWith(
      expect.stringContaining('REGEXP_REPLACE(UPPER(waybill.waybill_code)'),
      { normalizedWaybillKeyword: '%ECOHAN108962%' },
    );
  });

  it('searchWaybills finds by sender_info/receiver_info', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.searchWaybills({ keyword: 'Alice' }, manager);
    expect(result.items[0]).toMatchObject({ sender_info: 'Alice', receiver_info: 'Bob' });
    const inner = evaluateFirstBrackets(qb);
    expect(inner.orWhere.mock.calls.some(([condition]) => String(condition).includes('REGEXP_REPLACE'))).toBe(false);
  });

  it('searchWaybills also searches customer code, phones and receiver address', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.searchWaybills({ keyword: '0934455122' }, manager);

    const inner = evaluateFirstBrackets(qb);
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.sender_phone ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.receiver_phone ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.receiver_address ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.ma_kh ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.noi_dung ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.note ILIKE :keyword', { keyword: '%0934455122%' });
    expect(inner.orWhere).toHaveBeenCalledWith(
      expect.stringContaining('REGEXP_REPLACE(COALESCE(waybill.receiver_phone'),
      { normalizedReceiverPhoneKeyword: '%0934455122%' },
    );
  });

  it('returns the bill fields needed by the search result screen', async () => {
    const searchableWaybill = {
      ...waybill,
      ma_kh: 'ADAO',
      receiver_name: 'Kho A Đào HCM',
      receiver_phone: '0934455122',
      receiver_address: '129 Trần Đại Nghĩa',
      noi_dung: 'Máy phát điện',
    } as WaybillEntity & { origin_hub: HubEntity; dest_hub: HubEntity };
    waybillsRepository.createQueryBuilder.mockReturnValue(createQueryBuilder([searchableWaybill], 1));

    const result = await service.searchWaybills({ keyword: 'máy phát' }, manager);

    expect(result.items[0]).toMatchObject({
      waybill_code: 'WB100',
      ma_kh: 'ADAO',
      noi_dung: 'Máy phát điện',
      receiver_name: 'Kho A Đào HCM',
      receiver_phone: '0934455122',
    });
  });

  it('globalSearch accepts multi-select status and hub filters from the UI', async () => {
    const waybillQb = createQueryBuilder([waybill], 1);
    const tripQb = createQueryBuilder([trip], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(waybillQb);
    tripsRepository.createQueryBuilder.mockReturnValue(tripQb);

    await service.globalSearch({
      status: `${WaybillState.RECEIVED},${WaybillState.IN_WAREHOUSE},${TripStatus.PLANNED}`,
      origin_hub_id: '1,2',
      dest_hub_id: '2',
    }, manager);

    expect(waybillQb.andWhere).toHaveBeenCalledWith(
      'waybill.current_state IN (:...status)',
      { status: [WaybillState.RECEIVED, WaybillState.IN_WAREHOUSE] },
    );
    expect(waybillQb.andWhere).toHaveBeenCalledWith(
      'waybill.origin_hub_id IN (:...originHubId)',
      { originHubId: ['1', '2'] },
    );
    expect(tripQb.andWhere).toHaveBeenCalledWith('trip.status = :status', { status: TripStatus.PLANNED });
  });

  it('globalSearch applies payment filters to waybills and excludes trips', async () => {
    const waybillQb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(waybillQb);

    await service.globalSearch({
      payment_type: `${PaymentType.PP},${PaymentType.COD}`,
    }, manager);

    expect(waybillQb.andWhere).toHaveBeenCalledWith(
      'waybill.payment_type IN (:...paymentType)',
      { paymentType: [PaymentType.PP, PaymentType.COD] },
    );
    expect(tripsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('searchWaybills filters status/payment_type/origin_hub_id/dest_hub_id', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    await service.searchWaybills({ status: WaybillState.IN_WAREHOUSE, payment_type: PaymentType.COD, origin_hub_id: '1', dest_hub_id: '2' }, manager);
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.current_state = :status', { status: WaybillState.IN_WAREHOUSE });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.payment_type = :paymentType', { paymentType: PaymentType.COD });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.origin_hub_id = :originHubId', { originHubId: '1' });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.dest_hub_id = :destHubId', { destHubId: '2' });
  });

  it('searchTrips finds by truck_id/manifest_id', async () => {
    const qb = createQueryBuilder([trip], 1);
    tripsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.searchTrips({ truck_id: '300', manifest_id: '400' }, manager);
    expect(qb.andWhere).toHaveBeenCalledWith('trip.truck_id = :truckId', { truckId: '300' });
    expect(qb.andWhere).toHaveBeenCalledWith('trip.manifest_id = :manifestId', { manifestId: '400' });
    expect(result.items[0]).toMatchObject({ truck_id: '300', manifest_id: '400' });
  });

  it('searchTrips filters status/start_hub_id/end_hub_id/departure_time range', async () => {
    const qb = createQueryBuilder([trip], 1);
    tripsRepository.createQueryBuilder.mockReturnValue(qb);
    const departureFrom = new Date('2026-01-01T00:00:00.000Z');
    const departureTo = new Date('2026-01-04T00:00:00.000Z');
    await service.searchTrips({ status: TripStatus.PLANNED, start_hub_id: '1', end_hub_id: '2', departure_from: departureFrom, departure_to: departureTo }, manager);
    expect(qb.andWhere).toHaveBeenCalledWith('trip.status = :status', { status: TripStatus.PLANNED });
    expect(qb.andWhere).toHaveBeenCalledWith('trip.start_hub_id = :startHubId', { startHubId: '1' });
    expect(qb.andWhere).toHaveBeenCalledWith('trip.end_hub_id = :endHubId', { endHubId: '2' });
    expect(qb.andWhere).toHaveBeenCalledWith('trip.departure_time >= :departureFrom', { departureFrom });
    expect(qb.andWhere).toHaveBeenCalledWith('trip.departure_time <= :departureTo', { departureTo });
  });

  it('date_from > date_to is blocked', async () => {
    await expect(service.searchWaybills({ date_from: new Date('2026-01-02'), date_to: new Date('2026-01-01') }, manager)).rejects.toThrow(BadRequestException);
  });

  it('limit over 100 is capped', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.searchWaybills({ limit: 120 }, manager);
    expect(result.meta.limit).toBe(100);
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('user with hub_id only sees data in assigned hub', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    await service.searchWaybills({}, staff);
    expect(qb.andWhere).toHaveBeenCalled();
  });

  it('MANAGER/DIRECTOR see system-wide data', async () => {
    const managerQb = createQueryBuilder([waybill], 1);
    const directorQb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValueOnce(managerQb).mockReturnValueOnce(directorQb);
    await service.searchWaybills({}, manager);
    await service.searchWaybills({}, director);
    expect(managerQb.andWhere).not.toHaveBeenCalled();
    expect(directorQb.andWhere).not.toHaveBeenCalled();
  });

  it('ACCOUNTANT sees the shared cross-hub bill list', async () => {
    const qb = createQueryBuilder([waybill], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.searchWaybills({}, accountant);

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('response hides sensitive fields and profit without manager/director', async () => {
    const wbQb = createQueryBuilder([{ ...waybill, password_hash: 'secret', refresh_token: 'token' }], 1);
    waybillsRepository.createQueryBuilder.mockReturnValue(wbQb);
    const waybillResult = await service.searchWaybills({}, staff);
    expect(waybillResult.items[0]).not.toHaveProperty('password_hash');
    expect(waybillResult.items[0]).not.toHaveProperty('refresh_token');
    expect(waybillResult.items[0]).not.toHaveProperty('cost_amount');

    const tripQb = createQueryBuilder([trip], 1);
    tripsRepository.createQueryBuilder.mockReturnValue(tripQb);
    const tripResult = await service.searchTrips({}, driver);
    expect(tripResult.items[0]).not.toHaveProperty('profit');
    expect(tripResult.items[0]).not.toHaveProperty('profit_visible');
  });

  it('pagination returns total, page, limit, total_pages', async () => {
    const qb = createQueryBuilder([waybill], 45);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    const result = await service.searchWaybills({ page: 2, limit: 20 }, manager);
    expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, total_pages: 3 });
  });

  it('normalizeKeyword trims and blocks too short keywords', () => {
    expect(service.normalizeKeyword('  abc  ')).toBe('abc');
    expect(service.normalizeKeyword('   ')).toBeUndefined();
    expect(() => service.normalizeKeyword('a')).toThrow(BadRequestException);
  });

  it('mapGlobalResults returns normalized result format', () => {
    const result = service.mapGlobalResults([waybill], [trip]);
    expect(result[0]).toMatchObject({ id: '100', type: 'WAYBILL', code: 'WB100', status: WaybillState.IN_WAREHOUSE });
    expect(result[1]).toMatchObject({ id: '200', type: 'TRIP', code: 'MF400', status: TripStatus.PLANNED });
  });

  it('throws ForbiddenException when filtering outside assigned hub', async () => {
    hubsRepository.findOne.mockResolvedValue(destHub);
    await expect(service.searchWaybills({ origin_hub_id: '2' }, staff)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when filtered hub/truck/manifest does not exist', async () => {
    hubsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.searchWaybills({ origin_hub_id: '9' }, manager)).rejects.toThrow(NotFoundException);
    trucksRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.searchTrips({ truck_id: '999' }, manager)).rejects.toThrow(NotFoundException);
    manifestsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.searchTrips({ manifest_id: '999' }, manager)).rejects.toThrow(NotFoundException);
  });
});
