import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WaybillsService } from './waybills.service';
import { Roles } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { OrderEntity } from '../orders/order.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillPriority, WaybillStatus } from './dto/waybill.enums';
import { WaybillSplitLoadStatus } from './dto/waybill-split-load-status.enum';
import { WaybillSplitEntity } from './waybill-split.entity';
import { WaybillEntity } from './waybill.entity';
import { ManifestStatus } from '../manifests/dto/manifest.enums';
import { TripStatus } from '../common/enums';

const manager = { id: 'u1', role_mask: Roles.MANAGER, hub_id: '1' } as any;
const warehouse = { id: 'u2', role_mask: Roles.WAREHOUSE, hub_id: '1' } as any;
const accountant = { id: 'u3', role_mask: Roles.ACCOUNTANT, hub_id: '1' } as any;

const makeWaybill = (overrides: Record<string, any> = {}) => ({
  id: '1',
  waybill_code: 'ECO1',
  sender_info: 'Sender | 090 | A',
  receiver_info: 'Receiver | 091 | B',
  origin_hub_id: '1',
  dest_hub_id: '2',
  current_hub_id: '1',
  current_state: WaybillStatus.RECEIVED,
  status: WaybillStatus.RECEIVED,
  priority: WaybillPriority.NORMAL,
  cod_amount: 0,
  freight_amount: 0,
  cc_amount: 0,
  package_count: 1,
  created_at: new Date('2026-01-01'),
  ...overrides,
});

const createQueryBuilder = () => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    clone: jest.fn().mockImplementation(() => qb),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxSeq: '0' }),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([makeWaybill()]),
    getCount: jest.fn().mockResolvedValue(1),
    getManyAndCount: jest.fn().mockResolvedValue([[makeWaybill()], 1]),
  };
  return qb;
};

const evaluateFirstBrackets = (qb: ReturnType<typeof createQueryBuilder>) => {
  const brackets = qb.andWhere.mock.calls
    .map(([condition]: [any]) => condition)
    .find((condition: any) => typeof condition?.whereFactory === 'function');
  expect(brackets).toBeDefined();
  const inner = {
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
  };
  brackets.whereFactory(inner);
  return inner;
};

describe('WaybillsService', () => {
  let service: WaybillsService;
  let waybillsRepository: any;
  let hubsRepository: any;
  let splitsRepository: any;
  let tripsRepository: any;
  let trucksRepository: any;
  let manifestsRepository: any;
  let manifestWaybillsRepository: any;
  let cashVouchersRepository: any;
  let transactionOrderRepository: any;
  let dataSource: any;
  let ordersService: any;
  let vendorsService: any;

  beforeEach(() => {
    waybillsRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(createQueryBuilder),
    };
    hubsRepository = {
      findOne: jest.fn(async ({ where }: any) => ({ id: where.id, code: where.id === '2' ? 'HCM' : 'HAN', is_active: true })),
    };
    splitsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    tripsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    trucksRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    manifestsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      exist: jest.fn().mockResolvedValue(false),
      createQueryBuilder: jest.fn(createQueryBuilder),
    };
    manifestWaybillsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    cashVouchersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(createQueryBuilder),
    };
    transactionOrderRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const transactionRepositories = new Map<any, any>([
      [WaybillEntity, waybillsRepository],
      [HubEntity, hubsRepository],
      [ManifestEntity, manifestsRepository],
      [ManifestWaybillEntity, manifestWaybillsRepository],
      [WaybillSplitEntity, splitsRepository],
      [TripEntity, tripsRepository],
      [OrderEntity, transactionOrderRepository],
    ]);
    dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => Promise<any>) => callback({
        getRepository: (entity: any) => transactionRepositories.get(entity),
      })),
    };
    ordersService = {
      createFromWaybillEntry: jest.fn().mockResolvedValue({ id: 'o1', order_code: 'DH20260101-001' }),
      syncRoutingFromWaybill: jest.fn().mockResolvedValue(undefined),
    };
    vendorsService = {
      findOne: jest.fn(),
      resolveDefaultVendorId: jest.fn(),
      addPayableDebt: jest.fn(),
    };
    service = new WaybillsService(
      waybillsRepository,
      hubsRepository,
      splitsRepository,
      tripsRepository,
      trucksRepository,
      manifestsRepository,
      manifestWaybillsRepository,
      cashVouchersRepository,
      dataSource,
      ordersService,
      vendorsService,
    );
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.123);
  });

  afterEach(() => jest.restoreAllMocks());

  it('create requires manual waybill_code', async () => {
    await expect(service.create({ waybill_code: '', sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager)).rejects.toThrow(BadRequestException);
  });

  it('create normalizes a legacy hyphenated waybill_code to the contiguous format', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({ waybill_code: 'ECO-HAN-109602', sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager);
    expect(result.waybill_code).toBe('ECOHAN109602');
    expect(result.order_code).toBe('DH20260101-001');
    expect(result.status).toBe(WaybillStatus.RECEIVED);
    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ waybill_code: 'ECOHAN109602', current_state: WaybillStatus.RECEIVED }));
    expect(waybillsRepository.findOne).toHaveBeenCalledWith({
      where: [
        expect.objectContaining({ waybill_code: 'ECOHAN109602' }),
        expect.objectContaining({ waybill_code: 'ECO-HAN-109602' }),
      ],
    });
  });

  it('create stores a missing customer phone as null', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({
      waybill_code: 'ECOHAN1',
      sender_name: 'A',
      sender_address: 'HN',
      receiver_name: 'B',
      receiver_phone: '2',
      receiver_address: 'HCM',
      origin_hub_id: '1',
      dest_hub_id: '2',
      weight: 3,
    }, manager);

    expect(result.sender_phone).toBeNull();
    expect(result.sender_info).toBe('A | HN');
  });

  it('suggests the latest receiver address and matches formatted phone input by digits', async () => {
    const qb = createQueryBuilder();
    qb.getRawMany.mockResolvedValue([
      {
        normalized_phone: '0934 455-122',
        receiver_address: 'Địa chỉ mới',
        receiver_name: 'Người nhận mới',
        receiver_company_name: null,
        last_used_at: '2026-07-23T10:00:00.000Z',
      },
      {
        normalized_phone: '0934455122',
        receiver_address: 'Địa chỉ cũ',
        receiver_name: 'Người nhận cũ',
        receiver_company_name: null,
        last_used_at: '2026-07-22T10:00:00.000Z',
      },
    ]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await expect(service.findReceiverContacts({ phone: '0934-455', limit: 12 })).resolves.toEqual([
      {
        phone: '0934455122',
        receiver_address: 'Địa chỉ mới',
        receiver_name: 'Người nhận mới',
        receiver_company_name: null,
        last_used_at: '2026-07-23T10:00:00.000Z',
      },
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('LIKE :receiverPhone'), {
      receiverPhone: '%0934455%',
    });
  });

  it('create rejects waybill_code with wrong hub prefix', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    await expect(service.create({ waybill_code: 'ECOHCM1', sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager)).rejects.toThrow(BadRequestException);
  });

  it.each(['ECOHAN0', 'ECO-HAN-000', 'ECOHANABC'])('create rejects invalid waybill sequence %s', async (waybillCode) => {
    waybillsRepository.findOne.mockResolvedValue(null);
    await expect(service.create({ waybill_code: waybillCode, sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager)).rejects.toThrow(BadRequestException);
  });

  it('create detects a legacy code as duplicate of its contiguous equivalent', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ id: 'legacy', waybill_code: 'ECO-HAN-109602' }));
    await expect(service.create({ waybill_code: 'ECOHAN109602', sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager)).rejects.toThrow(ConflictException);
  });

  it('update normalizes a legacy waybill code and ignores the same record in duplicate checks', async () => {
    const existing = makeWaybill({
      waybill_code: 'ECO-HAN-7',
      origin_hub: { id: '1', code: 'HAN' },
    });
    waybillsRepository.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);

    await expect(service.update('1', { waybill_code: ' ECO-HAN-7 ' }, manager))
      .resolves.toMatchObject({ waybill_code: 'ECOHAN7' });
    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: '1',
      waybill_code: 'ECOHAN7',
    }));
  });

  it('update persists a mutable destination to the FK, relation, and linked order', async () => {
    const existing = makeWaybill({
      order_id: 'o1',
      dest_hub: { id: '2', code: 'HCM', name: 'Hồ Chí Minh' },
    });
    const danHub = { id: '3', code: 'DAN', name: 'Đà Nẵng', is_active: true };
    waybillsRepository.findOne.mockImplementation(async () => ({ ...existing }));
    hubsRepository.findOne.mockResolvedValue(danHub);

    const result = await service.update('1', { dest_hub_id: '3' }, manager);

    expect(result).toMatchObject({
      dest_hub_id: '3',
      dest_hub: danHub,
    });
    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: '1',
      dest_hub_id: '3',
      dest_hub: danHub,
    }));
    expect(transactionOrderRepository.update).toHaveBeenCalledWith(
      { id: 'o1' },
      { dest_hub_id: '3' },
    );
  });

  it('update rejects an inactive destination hub', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      order_id: 'o1',
      dest_hub: { id: '2', code: 'HCM' },
    }));
    hubsRepository.findOne.mockResolvedValue(null);

    await expect(service.update('1', { dest_hub_id: '3' }, manager))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transactionOrderRepository.update).not.toHaveBeenCalled();
  });

  it('reroutes a MANIFEST_CLOSED waybill on a PLANNED trip into a destination-specific manifest and trip', async () => {
    const sourceTrip = {
      id: 't1',
      truck_id: 'truck-1',
      manifest_id: 'm1',
      start_hub_id: '1',
      end_hub_id: '2',
      departure_time: new Date('2026-07-21T01:00:00Z'),
      arrival_time: new Date('2026-07-21T12:00:00Z'),
      expected_arrival_time: new Date('2026-07-21T12:00:00Z'),
      status: TripStatus.PLANNED,
    };
    const sourceManifest = {
      id: 'm1',
      manifest_code: 'BK-HCM',
      origin_hub_id: '1',
      dest_hub_id: '2',
      status: ManifestStatus.ASSIGNED_TO_TRIP,
      trips: [sourceTrip],
    };
    const sourceLink = {
      manifest_id: 'm1',
      waybill_id: '1',
      loading_position: 4,
      loaded_at: new Date('2026-07-20T02:00:00Z'),
      dispatch_fields: { ma_tinh: 'HCM' },
      manifest: sourceManifest,
    };
    const split = {
      id: 's1',
      waybill_id: '1',
      trip_id: 't1',
      truck_id: 'truck-1',
      package_count: 1,
      load_status: WaybillSplitLoadStatus.LOADED,
    };
    const existing = makeWaybill({
      order_id: 'o1',
      manifest_id: 'm1',
      trip_id: 't1',
      status: WaybillStatus.MANIFEST_CLOSED,
      current_state: WaybillStatus.MANIFEST_CLOSED,
      dest_hub: { id: '2', code: 'HCM' },
    });
    const danHub = { id: '3', code: 'DAN', name: 'Đà Nẵng', is_active: true };

    waybillsRepository.findOne.mockImplementation(async () => ({ ...existing }));
    hubsRepository.findOne.mockResolvedValue(danHub);
    manifestWaybillsRepository.find.mockImplementation(async ({ where }: any) => {
      if (where?.waybill_id) return [sourceLink];
      if (where?.manifest_id === 'm1') {
        return [sourceLink, { manifest_id: 'm1', waybill_id: 'other' }];
      }
      return [];
    });
    splitsRepository.find.mockResolvedValue([split]);
    tripsRepository.findOne.mockResolvedValue(sourceTrip);
    tripsRepository.find.mockResolvedValue([]);
    manifestsRepository.findOne.mockResolvedValue(sourceManifest);
    manifestsRepository.save.mockImplementation(async (value: any) => {
      if (!value.id) value.id = 'm2';
      return value;
    });
    tripsRepository.save.mockImplementation(async (value: any) => {
      if (!value.id) value.id = 't2';
      return value;
    });

    await expect(service.update('1', { dest_hub_id: '3' }, manager))
      .resolves.toMatchObject({ dest_hub_id: '3', dest_hub: danHub });

    expect(manifestsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      origin_hub_id: '1',
      dest_hub_id: '3',
      status: ManifestStatus.CLOSED,
    }));
    expect(tripsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      manifest_id: 'm2',
      start_hub_id: '1',
      end_hub_id: '3',
      status: TripStatus.PLANNED,
    }));
    expect(manifestWaybillsRepository.delete).toHaveBeenCalledWith({
      manifest_id: 'm1',
      waybill_id: '1',
    });
    expect(manifestWaybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      manifest_id: 'm2',
      waybill_id: '1',
      dispatch_fields: expect.objectContaining({ ma_tinh: 'DAN' }),
    }));
    expect(splitsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', trip_id: 't2' }),
    ]);
    expect(transactionOrderRepository.update).toHaveBeenCalledWith(
      { id: 'o1' },
      { dest_hub_id: '3' },
    );
  });

  it('rejects a destination reroute after a split has departed', async () => {
    const existing = makeWaybill({
      order_id: 'o1',
      status: WaybillStatus.MANIFEST_CLOSED,
      current_state: WaybillStatus.MANIFEST_CLOSED,
    });
    waybillsRepository.findOne.mockImplementation(async () => ({ ...existing }));
    hubsRepository.findOne.mockResolvedValue({ id: '3', code: 'DAN', is_active: true });
    manifestWaybillsRepository.find.mockResolvedValue([]);
    splitsRepository.find.mockResolvedValue([{
      id: 's1',
      waybill_id: '1',
      trip_id: 't1',
      load_status: WaybillSplitLoadStatus.DEPARTED,
    }]);

    await expect(service.update('1', { dest_hub_id: '3' }, manager))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transactionOrderRepository.update).not.toHaveBeenCalled();
  });

  const setupMixedDestinationBulkStack = (truckOverrides: Record<string, any> = {}) => {
    const waybills = {
      w1: makeWaybill({
        id: 'w1',
        waybill_code: 'ECOHAN1',
        dest_hub_id: '2',
        origin_hub: { id: '1', code: 'HAN' },
        dest_hub: { id: '2', code: 'HCM' },
      }),
      w2: makeWaybill({
        id: 'w2',
        waybill_code: 'ECOHAN2',
        package_count: 3,
        dest_hub_id: '3',
        origin_hub: { id: '1', code: 'HAN' },
        dest_hub: { id: '3', code: 'DAN' },
      }),
    };
    waybillsRepository.findOne.mockImplementation(async ({ where }: any) => (
      waybills[where.id as keyof typeof waybills] ?? null
    ));
    trucksRepository.findOne.mockResolvedValue({
      id: 'truck-1',
      bks: '29A-12345',
      nha_xe: null,
      vendor_id: null,
      vendor: null,
      ...truckOverrides,
    });
    splitsRepository.find.mockResolvedValue([]);
    let splitSequence = 0;
    splitsRepository.save.mockImplementation(async (value: any) => {
      if (!Array.isArray(value) && !value.id) value.id = `s${++splitSequence}`;
      return value;
    });
    let manifestSequence = 0;
    manifestsRepository.save.mockImplementation(async (value: any) => {
      if (!value.id) value.id = `m${++manifestSequence}`;
      return value;
    });
    let tripSequence = 0;
    tripsRepository.save.mockImplementation(async (value: any) => {
      if (!value.id) value.id = `t${++tripSequence}`;
      return value;
    });
    tripsRepository.findOne.mockResolvedValue(null);
  };

  it('bulk stack deterministically allocates shared vendor cost and links a selected vendor to a legacy truck', async () => {
    setupMixedDestinationBulkStack();
    const selectedVendor = { id: 'vendor-1', name: 'Công ty Anh Dũng', status: 'ACTIVE' };
    vendorsService.findOne.mockResolvedValue(selectedVendor);

    const result = await service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
        { waybill_id: 'w2', truck_id: 'truck-1', package_count: 3 },
      ],
      driver_name: ' Nguyễn Văn A ',
      driver_phone: ' 0901234567 ',
      vendor_id: 'vendor-1',
      vendor_cost: 100.01,
    }, manager);

    expect(result.saved_count).toBe(2);
    expect(result.manifests).toEqual([
      expect.objectContaining({ id: 'm1', dest_hub_id: '2', trip_id: 't1', waybill_count: 1 }),
      expect.objectContaining({ id: 'm2', dest_hub_id: '3', trip_id: 't2', waybill_count: 1 }),
    ]);
    expect(manifestsRepository.create.mock.calls.map(([value]: [any]) => value.dest_hub_id))
      .toEqual(['2', '3']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.end_hub_id))
      .toEqual(['2', '3']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.driver_name))
      .toEqual(['Nguyễn Văn A', 'Nguyễn Văn A']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.driver_phone))
      .toEqual(['0901234567', '0901234567']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.trip_cost))
      .toEqual(['25', '75.01']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.other_costs))
      .toEqual([null, null]);
    for (const [tripData] of tripsRepository.create.mock.calls) {
      expect(tripData.expected_arrival_time.getTime()).toBeGreaterThan(tripData.departure_time.getTime());
      expect(tripData.expected_arrival_time.getTime() - tripData.departure_time.getTime())
        .toBe(3 * 24 * 60 * 60 * 1000);
    }
    expect(vendorsService.findOne).toHaveBeenCalledWith('vendor-1');
    expect(trucksRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      vendor_id: 'vendor-1',
      vendor: selectedVendor,
      nha_xe: 'Công ty Anh Dũng',
    }));
    expect(vendorsService.addPayableDebt).toHaveBeenCalledTimes(2);
    expect(vendorsService.addPayableDebt).toHaveBeenNthCalledWith(
      1, 'vendor-1', 25, 't1', expect.stringContaining('Chi phí chuyến #t1'),
    );
    expect(vendorsService.addPayableDebt).toHaveBeenNthCalledWith(
      2, 'vendor-1', 75.01, 't2', expect.stringContaining('Chi phí chuyến #t2'),
    );
    expect(vendorsService.resolveDefaultVendorId).not.toHaveBeenCalled();
    expect(vendorsService.addPayableDebt.mock.invocationCallOrder[0])
      .toBeGreaterThan(tripsRepository.save.mock.invocationCallOrder[0]);
    expect(vendorsService.addPayableDebt.mock.invocationCallOrder[1])
      .toBeGreaterThan(tripsRepository.save.mock.invocationCallOrder[1]);
    expect(manifestWaybillsRepository.save).toHaveBeenCalledTimes(2);
  });

  it('bulk stack keeps shared vendor cost allocation stable when selection order is reversed', async () => {
    const selectedVendor = { id: 'vendor-1', name: 'Công ty Anh Dũng', status: 'ACTIVE' };
    setupMixedDestinationBulkStack({ vendor_id: 'vendor-1', vendor: selectedVendor });
    vendorsService.findOne.mockResolvedValue(selectedVendor);

    await service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w2', truck_id: 'truck-1', package_count: 3 },
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
      ],
      vendor_id: 'vendor-1',
      vendor_cost: 100.01,
    }, manager);

    const costByDestination = Object.fromEntries(
      tripsRepository.create.mock.calls.map(([value]: [any]) => [value.end_hub_id, Number(value.trip_cost)]),
    );
    expect(costByDestination).toEqual({ '2': 25, '3': 75.01 });
    expect(Object.values(costByDestination).reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(100.01, 2);
    expect(vendorsService.addPayableDebt.mock.calls.map(([, amount, tripId]: [string, number, string]) => [amount, tripId]))
      .toEqual([[25, 't1'], [75.01, 't2']]);
  });

  it('bulk stack keeps legacy line vendor costs local to their destination group', async () => {
    const vendor = { id: 'vendor-1', name: 'Công ty Anh Dũng', status: 'ACTIVE' };
    setupMixedDestinationBulkStack({ vendor_id: 'vendor-1', vendor });

    await service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w2', truck_id: 'truck-1', package_count: 3, vendor_cost: 20.25 },
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1, vendor_cost: 10.1 },
      ],
    }, manager);

    const costByDestination = Object.fromEntries(
      tripsRepository.create.mock.calls.map(([value]: [any]) => [value.end_hub_id, Number(value.trip_cost)]),
    );
    expect(costByDestination).toEqual({ '2': 10.1, '3': 20.25 });
    expect(vendorsService.addPayableDebt.mock.calls.map(([vendorId, amount, tripId]: [string, number, string]) => [vendorId, amount, tripId]))
      .toEqual([['vendor-1', 10.1, 't1'], ['vendor-1', 20.25, 't2']]);
  });

  it('bulk stack rejects shared vendor cost across multiple trucks', async () => {
    await expect(service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
        { waybill_id: 'w2', truck_id: 'truck-2', package_count: 1 },
      ],
      vendor_cost: 100,
    }, manager)).rejects.toBeInstanceOf(BadRequestException);

    expect(trucksRepository.findOne).not.toHaveBeenCalled();
    expect(splitsRepository.save).not.toHaveBeenCalled();
  });

  it('bulk stack rejects duplicate waybills before reading or mutating repositories', async () => {
    await expect(service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
      ],
    }, manager)).rejects.toBeInstanceOf(BadRequestException);

    expect(vendorsService.findOne).not.toHaveBeenCalled();
    expect(trucksRepository.findOne).not.toHaveBeenCalled();
    expect(waybillsRepository.findOne).not.toHaveBeenCalled();
    expect(splitsRepository.find).not.toHaveBeenCalled();
    expect(splitsRepository.save).not.toHaveBeenCalled();
    expect(tripsRepository.save).not.toHaveBeenCalled();
  });

  it('bulk stack rejects an explicit vendor that conflicts with the truck vendor', async () => {
    setupMixedDestinationBulkStack({ vendor_id: 'vendor-existing' });
    vendorsService.findOne.mockResolvedValue({ id: 'vendor-selected', name: 'NCC mới', status: 'ACTIVE' });

    await expect(service.bulkStackOntoTruck({
      items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 }],
      vendor_id: 'vendor-selected',
      vendor_cost: 100,
    }, manager)).rejects.toBeInstanceOf(BadRequestException);

    expect(trucksRepository.save).not.toHaveBeenCalled();
    expect(splitsRepository.save).not.toHaveBeenCalled();
    expect(tripsRepository.save).not.toHaveBeenCalled();
    expect(vendorsService.addPayableDebt).not.toHaveBeenCalled();
  });

  it('bulk stack does not persist a vendor link until every waybill passes pre-validation', async () => {
    setupMixedDestinationBulkStack();
    vendorsService.findOne.mockResolvedValue({ id: 'vendor-1', name: 'NCC mới', status: 'ACTIVE' });
    waybillsRepository.findOne
      .mockReset()
      .mockResolvedValueOnce(makeWaybill({ id: 'w1', waybill_code: 'ECOHAN1' }))
      .mockResolvedValueOnce(null);

    await expect(service.bulkStackOntoTruck({
      items: [
        { waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 },
        { waybill_id: 'missing', truck_id: 'truck-1', package_count: 1 },
      ],
      vendor_id: 'vendor-1',
    }, manager)).rejects.toThrow('Waybill missing not found');

    expect(trucksRepository.save).not.toHaveBeenCalled();
    expect(splitsRepository.save).not.toHaveBeenCalled();
    expect(tripsRepository.save).not.toHaveBeenCalled();
  });

  it('bulk stack rejects an explicitly selected inactive vendor', async () => {
    vendorsService.findOne.mockResolvedValue({ id: 'vendor-inactive', name: 'NCC nghỉ', status: 'INACTIVE' });

    await expect(service.bulkStackOntoTruck({
      items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 }],
      vendor_id: 'vendor-inactive',
      vendor_cost: 100,
    }, manager)).rejects.toBeInstanceOf(BadRequestException);

    expect(trucksRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'shared root cost',
      payload: {
        items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 }],
        vendor_cost: 100,
      },
    },
    {
      label: 'legacy line cost',
      payload: {
        items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 1, vendor_cost: 100 }],
      },
    },
  ])('bulk stack rejects $label from non-manager before financial mutation', async ({ payload }) => {
    await expect(service.bulkStackOntoTruck(payload, warehouse))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(vendorsService.findOne).not.toHaveBeenCalled();
    expect(trucksRepository.findOne).not.toHaveBeenCalled();
    expect(waybillsRepository.findOne).not.toHaveBeenCalled();
    expect(splitsRepository.save).not.toHaveBeenCalled();
    expect(tripsRepository.save).not.toHaveBeenCalled();
    expect(vendorsService.addPayableDebt).not.toHaveBeenCalled();
  });

  it('bulk stack allows an operational vendor link for warehouse users without exposing vendor cost', async () => {
    setupMixedDestinationBulkStack();
    vendorsService.findOne.mockResolvedValue({ id: 'vendor-1', name: 'NCC vận tải', status: 'ACTIVE' });

    const result = await service.bulkStackOntoTruck({
      items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 1 }],
      vendor_id: 'vendor-1',
    }, warehouse);

    expect(trucksRepository.save).toHaveBeenCalledWith(expect.objectContaining({ vendor_id: 'vendor-1' }));
    expect(result.items[0]).not.toHaveProperty('vendor_cost');
    expect(vendorsService.addPayableDebt).not.toHaveBeenCalled();
  });

  it('preview next code uses independent hub prefix sequence', async () => {
    const qb = createQueryBuilder();
    qb.getRawOne.mockResolvedValue({ maxSeq: '7' });
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    waybillsRepository.findOne.mockResolvedValue(null);

    await expect(service.previewNextWaybillCode('1', warehouse)).resolves.toEqual({ waybill_code: 'ECOHAN8' });
    expect(qb.setParameters).toHaveBeenCalledWith({ codePattern: '^ECO-?HAN-?[0-9]+$', codeReplacePattern: '^ECO-?HAN-?' });
  });

  it('create blocks missing or inactive hub', async () => {
    hubsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.create({ waybill_code: 'ECOHAN1', sender_name: 'A', sender_phone: '1', sender_address: 'HN', receiver_name: 'B', receiver_phone: '2', receiver_address: 'HCM', origin_hub_id: '1', dest_hub_id: '2', weight: 3 }, manager)).rejects.toThrow(BadRequestException);
  });

  it('findAll applies keyword/status/hub/priority/date filters', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    await service.findAll({ keyword: 'ECO', status: WaybillStatus.RECEIVED, origin_hub_id: '1', dest_hub_id: '2', priority: WaybillPriority.HIGH, from_date: '2026-01-01', to_date: '2026-01-31' }, manager);
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.current_state IN (:...statuses)', { statuses: [WaybillStatus.RECEIVED] });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.origin_hub_id = :originHubId', { originHubId: '1' });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.priority IN (:...priorities)', { priorities: [WaybillPriority.HIGH] });
  });

  it.each(['ECOHAN108962', 'ECO-HAN-108962'])(
    'findAll matches both legacy and contiguous bill codes for keyword %s',
    async (keyword) => {
      const qb = createQueryBuilder();
      waybillsRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ keyword }, manager);

      const inner = evaluateFirstBrackets(qb);
      expect(inner.orWhere).toHaveBeenCalledWith(
        `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
        { normalizedWaybillKeyword: '%ECOHAN108962%' },
      );
    },
  );

  it('findAll keeps ordinary keyword search unchanged', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ keyword: 'Nguyen Van A' }, manager);

    const inner = evaluateFirstBrackets(qb);
    expect(inner.where).toHaveBeenCalledWith(
      'waybill.waybill_code ILIKE :keyword',
      { keyword: '%Nguyen Van A%' },
    );
    expect(inner.orWhere.mock.calls.some(([condition]) => String(condition).includes('REGEXP_REPLACE'))).toBe(false);
  });

  it('cash voucher search matches bill codes across legacy and contiguous formats', async () => {
    const qb = createQueryBuilder();
    cashVouchersRepository.createQueryBuilder.mockReturnValue(qb);

    await service.searchCashVouchers({ keyword: 'ECOHAN108962' }, manager);

    const inner = evaluateFirstBrackets(qb);
    expect(inner.orWhere).toHaveBeenCalledWith(
      `REGEXP_REPLACE(UPPER(voucher.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
      { normalizedWaybillKeyword: '%ECOHAN108962%' },
    );
    expect(inner.orWhere).toHaveBeenCalledWith(
      `REGEXP_REPLACE(UPPER(waybill.waybill_code), '[-[:space:]]+', '', 'g') ILIKE :normalizedWaybillKeyword`,
      { normalizedWaybillKeyword: '%ECOHAN108962%' },
    );
  });

  it('user hub only sees waybills in assigned hub scope', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    await service.findAll({}, warehouse);
    expect(qb.andWhere).toHaveBeenCalled();
  });

  it('create stores up to four normalized bill images', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({
      waybill_code: 'ECOHAN109603',
      sender_name: 'A',
      sender_phone: '1',
      sender_address: 'HN',
      receiver_name: 'B',
      receiver_phone: '2',
      receiver_address: 'HCM',
      origin_hub_id: '1',
      dest_hub_id: '2',
      weight: 3,
      delivery_photo_url: ' https://example.com/1.jpg | https://example.com/2.jpg ',
    }, manager);
    expect(result.delivery_photo_url).toBe('https://example.com/1.jpg|https://example.com/2.jpg');
  });

  it('inventory combines summary queries and loads only split allocation fields for pending rows', async () => {
    const qb = createQueryBuilder();
    qb.getRawOne.mockResolvedValue({ total_waybills: '1', total_freight: '120000' });
    qb.getMany.mockResolvedValue([makeWaybill({ package_count: 3, freight_amount: 120000 })]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    splitsRepository.find.mockResolvedValue([{ id: 's1', waybill_id: '1', package_count: 1 }]);

    const result = await service.getInventoryTripLines(
      { page: 1, limit: 10, only_incomplete_split: '1' },
      manager,
    );

    expect(qb.addSelect).toHaveBeenCalledWith(
      'COALESCE(SUM(COALESCE(waybill.freight_amount, waybill.cost_amount, 0)), 0)',
      'total_freight',
    );
    expect(splitsRepository.find).toHaveBeenCalledWith({
      select: { id: true, waybill_id: true, package_count: true },
      where: expect.any(Object),
    });
    expect(result.meta).toMatchObject({ total_waybills: 1, total_freight: 120000 });
    expect(result.items[0]).toMatchObject({ remaining_packages: 2, trip_package_count: 2 });
  });

  it('receive transitions RECEIVED to IN_WAREHOUSE', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    const result = await service.receive('1', { delivery_photo_url: 'https://example.com/receive.jpg' }, warehouse);
    expect(result.status).toBe(WaybillStatus.IN_WAREHOUSE);
    expect(result.received_by).toBe(warehouse.id);
    expect(result.delivery_photo_url).toBe('https://example.com/receive.jpg');
  });

  it('receive blocks wrong status', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.IN_WAREHOUSE, current_state: WaybillStatus.IN_WAREHOUSE }));
    await expect(service.receive('1', { delivery_photo_url: 'https://example.com/receive.jpg' }, warehouse)).rejects.toThrow(BadRequestException);
  });

  it('updateStatus accepts valid state machine transition', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    const result = await service.updateStatus('1', { status: WaybillStatus.IN_WAREHOUSE }, warehouse);
    expect(result.status).toBe(WaybillStatus.IN_WAREHOUSE);
  });

  it('updateStatus blocks skipped transition', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    await expect(service.updateStatus('1', { status: WaybillStatus.IN_TRANSIT }, warehouse)).rejects.toThrow(BadRequestException);
  });

  it('updatePhotos works without changing logistics status', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      status: WaybillStatus.IN_TRANSIT,
      current_state: WaybillStatus.IN_TRANSIT,
      manifest_id: 'm1',
    }));
    const result = await service.updatePhotos('1', {
      delivery_photo_url: 'https://example.com/1.jpg|https://example.com/2.jpg',
    }, warehouse);
    expect(result).toMatchObject({
      status: WaybillStatus.IN_TRANSIT,
      delivery_photo_url: 'https://example.com/1.jpg|https://example.com/2.jpg',
    });
  });

  it('assignPriority blocks URGENT without reason', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    await expect(service.assignPriority('1', { priority: WaybillPriority.URGENT }, manager)).rejects.toThrow(BadRequestException);
  });

  it('assignRoute allows RECEIVED and IN_WAREHOUSE', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.RECEIVED }));
    await expect(service.assignRoute('1', { route_code: 'R1' }, manager)).resolves.toMatchObject({ route_code: 'R1', status: WaybillStatus.IN_WAREHOUSE });
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.IN_WAREHOUSE, current_state: WaybillStatus.IN_WAREHOUSE }));
    await expect(service.assignRoute('1', { route_code: 'R2' }, manager)).resolves.toMatchObject({ route_code: 'R2' });
  });

  it('assignRoute blocks invalid status', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.IN_TRANSIT, current_state: WaybillStatus.IN_TRANSIT }));
    await expect(service.assignRoute('1', { route_code: 'R1' }, manager)).rejects.toThrow(BadRequestException);
  });

  it('updateCodFee blocks negative numbers', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    await expect(service.updateCodFee('1', { cod_amount: -1 }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('ACCOUNTANT can update COD after MANIFEST_CLOSED and WAREHOUSE cannot', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.MANIFEST_CLOSED, current_state: WaybillStatus.MANIFEST_CLOSED }));
    await expect(service.updateCodFee('1', { cod_amount: 100 }, accountant)).resolves.toMatchObject({ status: WaybillStatus.MANIFEST_CLOSED });
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.MANIFEST_CLOSED, current_state: WaybillStatus.MANIFEST_CLOSED }));
    await expect(service.updateCodFee('1', { cod_amount: 100 }, warehouse)).rejects.toThrow(ForbiddenException);
  });

  it('cancel only allows RECEIVED or IN_WAREHOUSE', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.IN_WAREHOUSE }));
    await expect(service.cancel('1', { reason: 'customer request' }, warehouse)).resolves.toMatchObject({ status: WaybillStatus.CANCELLED });
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.IN_TRANSIT }));
    await expect(service.cancel('1', { reason: 'customer request' }, warehouse)).rejects.toThrow(BadRequestException);
  });

  it('softDelete blocks MANIFEST_CLOSED waybill', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.MANIFEST_CLOSED }));
    await expect(service.softDelete('1', manager)).rejects.toThrow(BadRequestException);
  });

  it('response omits fee fields for non-manager users', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ cod_amount: 10, freight_amount: 20, cc_amount: 30 }));
    const result = await service.findOne('1', warehouse);
    expect(result).not.toHaveProperty('cod_amount');
    expect(result).not.toHaveProperty('freight_amount');
    expect(result).not.toHaveProperty('cc_amount');
  });

  it('getByCode returns accessible waybill by code', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    await expect(service.getByCode('ECO1', warehouse)).resolves.toMatchObject({ waybill_code: 'ECO1' });
  });

  it('getByCode finds a legacy hyphenated record from the contiguous printed code', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ waybill_code: 'ECO-HAN-108962' }));

    await expect(service.getByCode('ECOHAN108962', warehouse))
      .resolves.toMatchObject({ waybill_code: 'ECO-HAN-108962' });
    expect(waybillsRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.arrayContaining([
        expect.objectContaining({ waybill_code: 'ECOHAN108962' }),
        expect.objectContaining({ waybill_code: 'ECO-HAN-108962' }),
      ]),
    }));
  });

  it('getByCode preserves a legacy zero-padded sequence when building lookup candidates', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ waybill_code: 'ECO-HAN-001' }));

    await expect(service.getByCode('ECOHAN001', warehouse))
      .resolves.toMatchObject({ waybill_code: 'ECO-HAN-001' });
    expect(waybillsRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.arrayContaining([
        expect.objectContaining({ waybill_code: 'ECO-HAN-001' }),
      ]),
    }));
  });

  it('getInventory, getIncoming and getOverdue delegate to filtered lists', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue({ items: [], meta: {} } as any);
    await service.getInventory({}, warehouse);
    await service.getIncoming({}, warehouse);
    await service.getOverdue({}, warehouse);
    expect(findAll).toHaveBeenCalledTimes(3);
  });
});
