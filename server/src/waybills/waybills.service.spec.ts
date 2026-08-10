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
import { PaymentType, TripStatus } from '../common/enums';

const manager = { id: 'u1', role_mask: Roles.MANAGER, hub_id: '1' } as any;
const warehouse = { id: 'u2', role_mask: Roles.WAREHOUSE, hub_id: '1' } as any;
const accountant = { id: 'u3', role_mask: Roles.ACCOUNTANT, hub_id: '1' } as any;
const director = { id: 'u4', role_mask: Roles.DIRECTOR, hub_id: null } as any;

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
    leftJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
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
  let changeLogsRepository: any;
  let hubsRepository: any;
  let splitsRepository: any;
  let tripsRepository: any;
  let trucksRepository: any;
  let usersRepository: any;
  let vendorsRepository: any;
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
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(createQueryBuilder),
    };
    changeLogsRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      find: jest.fn().mockResolvedValue([]),
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
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
    };
    usersRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    vendorsRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
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
      syncFromWaybill: jest.fn().mockResolvedValue(undefined),
    };
    vendorsService = {
      findOne: jest.fn(),
      resolveDefaultVendorId: jest.fn(),
      addPayableDebt: jest.fn(),
      refreshPayableBalance: jest.fn(),
    };
    service = new WaybillsService(
      waybillsRepository,
      changeLogsRepository,
      hubsRepository,
      splitsRepository,
      tripsRepository,
      trucksRepository,
      usersRepository,
      vendorsRepository,
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

  it('create keeps a past sent date separate from the system creation time', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({
      waybill_code: 'ECOHAN2', sender_name: 'A', origin_hub_id: '1', dest_hub_id: '2',
      sent_date: '2026-07-31',
    }, manager);

    expect(result.sent_date).toBe('2026-07-31');
    expect(result.created_at).not.toBe(result.sent_date);
  });

  it('create stores an empty receiver name without shifting phone and address fields', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({
      waybill_code: 'ECOHAN1',
      sender_name: 'A',
      receiver_phone: '0901234567',
      receiver_address: 'TP.HCM',
      origin_hub_id: '1',
      dest_hub_id: '2',
      weight: 3,
    }, manager);

    expect(result.receiver_name).toBeNull();
    expect(result.receiver_info).toBe(' | 0901234567 | TP.HCM');
  });

  it('create accepts missing receiver information and stores nullable detail fields', async () => {
    waybillsRepository.findOne.mockResolvedValue(null);
    const result = await service.create({
      waybill_code: 'ECOHAN1',
      sender_name: 'A',
      origin_hub_id: '1',
      dest_hub_id: '2',
      weight: 3,
    }, manager);

    expect(result.receiver_name).toBeNull();
    expect(result.receiver_phone).toBeNull();
    expect(result.receiver_address).toBeNull();
    expect(result.receiver_info).toBe(' |  | ');
    expect(changeLogsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATED',
      changes: {},
      changed_by_id: manager.id,
    }));
  });

  it('suggests every distinct address for a phone and matches formatted phone input by digits', async () => {
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
      {
        normalized_phone: '0934455122',
        receiver_address: '  ĐỊA CHỈ MỚI  ',
        receiver_name: 'Bản ghi trùng',
        receiver_company_name: null,
        last_used_at: '2026-07-21T10:00:00.000Z',
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
      {
        phone: '0934455122',
        receiver_address: 'Địa chỉ cũ',
        receiver_name: 'Người nhận cũ',
        receiver_company_name: null,
        last_used_at: '2026-07-22T10:00:00.000Z',
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

  it('update clears all receiver information when the form sends blank values', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      receiver_name: 'B',
      receiver_phone: '2',
      receiver_address: 'HCM',
    }));

    const result = await service.update('1', {
      receiver_name: ' ',
      receiver_phone: ' ',
      receiver_address: ' ',
    }, manager);

    expect(result.receiver_name).toBeNull();
    expect(result.receiver_phone).toBeNull();
    expect(result.receiver_address).toBeNull();
    expect(result.receiver_info).toBe(' |  | ');
    expect(changeLogsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATED',
      changes: expect.objectContaining({
        receiver_name: { old_value: 'B', new_value: null },
        receiver_phone: { old_value: '2', new_value: null },
        receiver_address: { old_value: 'HCM', new_value: null },
      }),
    }));
  });

  it('returns the newest field-level edit history for a manager', async () => {
    const history = [{
      id: '9',
      waybill_id: '1',
      action: 'UPDATED',
      changes: { cod_amount: { old_value: 0, new_value: 500000 } },
      changed_by_name: 'Quản trị viên',
      created_at: new Date('2026-08-05T08:00:00.000Z'),
    }];
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    changeLogsRepository.find.mockResolvedValue(history);

    await expect(service.findHistory('1', manager)).resolves.toEqual(history);
    expect(changeLogsRepository.find).toHaveBeenCalledWith({
      where: { waybill_id: '1' },
      order: { created_at: 'DESC' },
      take: 100,
    });
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

  it('update synchronizes revised bill values to the linked order', async () => {
    const existing = makeWaybill({
      order_id: 'o1',
      sender_name: 'Người gửi cũ',
      sender_phone: '0900000000',
      sender_address: 'Hà Nội',
      receiver_name: 'Người nhận cũ',
      receiver_phone: '0911111111',
      receiver_address: 'Hồ Chí Minh',
      package_count: 154,
      weight: 4125,
      payment_type: 'PP',
      note: 'ma_kh=KH01|content=Hàng cũ',
    });
    waybillsRepository.findOne.mockResolvedValue(existing);

    const result = await service.update('1', {
      sender_name: 'Người gửi mới',
      receiver_company_name: 'Công ty nhận mới',
      receiver_name: 'Người nhận mới',
      receiver_phone: '0988888888',
      receiver_address: 'Thủ Đức, Hồ Chí Minh',
      package_count: 86,
      weight: 4000,
      freight_amount: 120000,
      cod_amount: 500000,
      cc_amount: 120000,
      note: 'ma_kh=KH01|content=Hàng mới',
    }, manager);

    expect(result.package_count).toBe(86);
    expect(ordersService.syncFromWaybill).toHaveBeenCalledWith('o1', expect.objectContaining({
      sender_name: 'Người gửi mới',
      receiver_company_name: 'Công ty nhận mới',
      receiver_name: 'Người nhận mới',
      receiver_phone: '0988888888',
      receiver_address: 'Thủ Đức, Hồ Chí Minh',
      package_count: 86,
      weight: 4000,
      freight_amount: '120000',
      cod_amount: '500000',
      cc_amount: '120000',
      note: 'ma_kh=KH01|content=Hàng mới',
    }));
  });

  it('update reduces an allocated trip split and manifest quantity when package count decreases', async () => {
    const existing = makeWaybill({ package_count: 112, order_id: 'o1' });
    const split = {
      id: 's120',
      waybill_id: '1',
      trip_id: '45',
      package_count: 112,
      created_at: new Date('2026-08-08T10:00:00Z'),
      trip: { id: '45', manifest_id: 'm45' },
    } as WaybillSplitEntity;
    const manifestLink = {
      manifest_id: 'm45',
      waybill_id: '1',
      dispatch_fields: { so_luong: '112', ghi_chu_1: 'Giữ nguyên' },
    } as unknown as ManifestWaybillEntity;
    waybillsRepository.findOne.mockResolvedValue(existing);
    splitsRepository.find.mockResolvedValue([split]);
    manifestWaybillsRepository.find.mockResolvedValue([manifestLink]);

    await service.update('1', { package_count: 86 }, manager);

    expect(splitsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's120', package_count: 86 }),
    ]);
    expect(splitsRepository.delete).not.toHaveBeenCalled();
    expect(manifestWaybillsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        manifest_id: 'm45',
        dispatch_fields: expect.objectContaining({ so_luong: '86', ghi_chu_1: 'Giữ nguyên' }),
      }),
    ]);
  });

  it('update removes excess from the newest allocated split first', async () => {
    const existing = makeWaybill({ package_count: 112 });
    const firstSplit = {
      id: 's1', waybill_id: '1', package_count: 70,
      created_at: new Date('2026-08-08T09:00:00Z'), trip: null,
    } as WaybillSplitEntity;
    const newestSplit = {
      id: 's2', waybill_id: '1', package_count: 42,
      created_at: new Date('2026-08-08T10:00:00Z'), trip: null,
    } as WaybillSplitEntity;
    waybillsRepository.findOne.mockResolvedValue(existing);
    splitsRepository.find.mockResolvedValue([firstSplit, newestSplit]);

    await service.update('1', { package_count: 86 }, manager);

    expect(firstSplit.package_count).toBe(70);
    expect(newestSplit.package_count).toBe(16);
    expect(splitsRepository.save).toHaveBeenCalledWith([newestSplit]);
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
      expect.objectContaining({ id: 'm1', dest_hub_id: '3', trip_id: 't1', waybill_count: 2 }),
    ]);
    expect(manifestsRepository.create.mock.calls.map(([value]: [any]) => value.dest_hub_id))
      .toEqual(['3']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.end_hub_id))
      .toEqual(['3']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.driver_name))
      .toEqual(['Nguyễn Văn A']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.driver_phone))
      .toEqual(['0901234567']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.trip_cost))
      .toEqual(['100.01']);
    expect(tripsRepository.create.mock.calls.map(([value]: [any]) => value.other_costs))
      .toEqual([null]);
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
    expect(vendorsService.addPayableDebt).toHaveBeenCalledTimes(1);
    expect(vendorsService.addPayableDebt).toHaveBeenNthCalledWith(
      1, 'vendor-1', 100.01, 't1', expect.stringContaining('Chi phí chuyến #t1'),
    );
    expect(vendorsService.resolveDefaultVendorId).not.toHaveBeenCalled();
    expect(vendorsService.addPayableDebt.mock.invocationCallOrder[0])
      .toBeGreaterThan(tripsRepository.save.mock.invocationCallOrder[0]);
    expect(manifestWaybillsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('bulk stack một phần giữ số kiện còn lại trong tồn kho', async () => {
    setupMixedDestinationBulkStack();
    const partialWaybill = makeWaybill({
      id: 'w1',
      waybill_code: 'ECOHAN138',
      package_count: 138,
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      origin_hub: { id: '1', code: 'HAN' },
      dest_hub: { id: '2', code: 'HCM' },
    });
    waybillsRepository.findOne.mockResolvedValue(partialWaybill);

    await service.bulkStackOntoTruck({
      items: [{ waybill_id: 'w1', truck_id: 'truck-1', package_count: 38 }],
    }, manager);

    expect(partialWaybill.current_state).toBe(WaybillStatus.IN_WAREHOUSE);
    expect(partialWaybill.status).toBe(WaybillStatus.IN_WAREHOUSE);
    expect(waybillsRepository.save).not.toHaveBeenCalled();
    expect(manifestWaybillsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ dispatch_fields: expect.objectContaining({ so_luong: '38' }) }),
    ]);
  });

  it('bulk stack cho phép chọn NCC khi chưa có biển số xe', async () => {
    setupMixedDestinationBulkStack();
    vendorsService.findOne.mockResolvedValue({ id: 'vendor-1', name: 'Xe lẻ', status: 'ACTIVE' });

    await service.bulkStackOntoTruck({
      items: [{ waybill_id: 'w1', package_count: 1 }],
      vendor_id: 'vendor-1',
      departure_time: new Date('2025-08-07T01:00:00Z'),
    }, manager);

    expect(splitsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ truck_id: null, carrier_label: 'Xe lẻ' }));
    expect(tripsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      truck_id: null,
      departure_time: new Date('2025-08-07T01:00:00Z'),
    }));
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
    expect(costByDestination).toEqual({ '2': 100.01 });
    expect(Object.values(costByDestination).reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(100.01, 2);
    expect(vendorsService.addPayableDebt.mock.calls.map(([, amount, tripId]: [string, number, string]) => [amount, tripId]))
      .toEqual([[100.01, 't1']]);
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
    expect(costByDestination).toEqual({ '2': 30.35 });
    expect(vendorsService.addPayableDebt.mock.calls.map(([vendorId, amount, tripId]: [string, number, string]) => [vendorId, amount, tripId]))
      .toEqual([['vendor-1', 30.35, 't1']]);
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
    await service.findAll({ keyword: 'ECO', status: WaybillStatus.RECEIVED, origin_hub_id: '1', dest_hub_id: '2', priority: WaybillPriority.HIGH, from_date: '2026-01-01', to_date: '2026-01-31', sent_from: '2025-12-31', sent_to: '2026-01-15' }, manager);
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.current_state IN (:...statuses)', { statuses: [WaybillStatus.RECEIVED] });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.origin_hub_id = :originHubId', { originHubId: '1' });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.priority IN (:...priorities)', { priorities: [WaybillPriority.HIGH] });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.sent_date >= :sentFrom', { sentFrom: '2025-12-31' });
    expect(qb.andWhere).toHaveBeenCalledWith('waybill.sent_date <= :sentTo', { sentTo: '2026-01-15' });
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

  it('findAll searches contact, customer, and goods data across the whole bill', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ keyword: '0934 455-122' }, manager);

    const inner = evaluateFirstBrackets(qb);
    const keyword = { keyword: '%0934 455-122%' };
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.sender_phone ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.receiver_phone ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.noi_dung ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith('waybill.ma_kh ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith('"order".sender_name ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith('"order".receiver_company_name ILIKE :keyword', keyword);
    expect(inner.orWhere).toHaveBeenCalledWith(
      `REGEXP_REPLACE(CONCAT_WS('', waybill.sender_phone, waybill.receiver_phone, waybill.sender_info, waybill.receiver_info, "order".sender_phone, "order".receiver_phone), '[^0-9]+', '', 'g') LIKE :normalizedPhoneKeyword`,
      { normalizedPhoneKeyword: '%0934455122%' },
    );
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
    expect(qb.andWhere).toHaveBeenCalledWith(
      'waybill.current_state IN (:...statuses)',
      { statuses: expect.arrayContaining([WaybillStatus.IN_TRANSIT]) },
    );
  });

  it('inventory uses the revised waybill package count when the linked order is stale', async () => {
    const qb = createQueryBuilder();
    qb.getMany.mockResolvedValue([makeWaybill({
      package_count: 86,
      order: { id: 'o1', package_count: 154 },
    })]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    splitsRepository.find.mockResolvedValue([]);

    const result = await service.getInventoryTripLines(
      { page: 1, limit: 10, only_incomplete_split: '1' },
      manager,
    );

    expect(result.items[0]).toMatchObject({
      package_count: 86,
      remaining_packages: 86,
      trip_package_count: 86,
      order_total_packages: 86,
    });
  });

  it('all-orders does not silently limit a manager to the assigned hub', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getInventoryTripLines({ list_scope: 'all_orders' }, manager);

    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)',
      { hubIds: ['1'] },
    );
  });

  it('all-orders shows warehouse staff bills from every hub', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getInventoryTripLines({ list_scope: 'all_orders' }, warehouse);

    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)',
      { hubIds: ['1'] },
    );
  });

  it('all-inventory shows addable stock from every hub without including final statuses', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getInventoryTripLines({ list_scope: 'all_inventory', only_incomplete_split: '1' }, warehouse);

    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'COALESCE(waybill.current_hub_id, waybill.origin_hub_id) IN (:...hubIds)',
      { hubIds: ['1'] },
    );
    const statusCall = qb.andWhere.mock.calls.find((call: any[]) => call[0] === 'waybill.current_state IN (:...statuses)');
    expect(statusCall?.[1]?.statuses).toEqual(expect.arrayContaining([WaybillStatus.IN_WAREHOUSE, WaybillStatus.IN_TRANSIT]));
    expect(statusCall?.[1]?.statuses).not.toEqual(expect.arrayContaining([WaybillStatus.DELIVERED, WaybillStatus.CANCELLED]));
  });

  it('all-orders includes cancelled bills and keeps pagination order stable by creation time', async () => {
    const qb = createQueryBuilder();
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getInventoryTripLines({ list_scope: 'all_orders' }, manager);

    expect(qb.andWhere).toHaveBeenCalledWith(
      'waybill.current_state IN (:...statuses)',
      { statuses: expect.arrayContaining([WaybillStatus.CANCELLED]) },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('waybill.created_at', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('waybill.id', 'DESC');
  });

  it('all-orders keeps one bill row and exposes every split trip with its package count and status', async () => {
    const qb = createQueryBuilder();
    qb.getMany.mockResolvedValue([makeWaybill({ package_count: 187 })]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    splitsRepository.find.mockResolvedValue([
      {
        id: 's41', waybill_id: '1', trip_id: '41', package_count: 127,
        trip: {
          id: '41', status: TripStatus.COMPLETED, departure_time: new Date('2026-08-06T01:00:00Z'),
          truck: { bks: '15H-29078' },
        },
      },
      {
        id: 's46', waybill_id: '1', trip_id: '46', package_count: 60,
        trip: {
          id: '46', status: TripStatus.IN_TRANSIT, departure_time: new Date('2026-08-08T01:00:00Z'),
          truck: { bks: '29E-078.04' },
        },
      },
    ]);

    const result = await service.getInventoryTripLines({ list_scope: 'all_orders' }, manager);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      remaining_packages: 0,
      trip_history: [
        expect.objectContaining({ trip_id: '41', package_count: 127, license_plate: '15H-29078', status: TripStatus.COMPLETED }),
        expect.objectContaining({ trip_id: '46', package_count: 60, license_plate: '29E-078.04', status: TripStatus.IN_TRANSIT }),
      ],
    });
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

  it('confirms a COD waybill for hub reconciliation', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ payment_type: PaymentType.COD }));

    const result = await service.updateCodReconciliation('1', { confirmed: true }, accountant);

    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      cod_reconciled_at: expect.any(Date),
      cod_reconciled_by: accountant.id,
      updated_by: accountant.id,
    }));
    expect(result.cod_reconciled_at).toEqual(expect.any(Date));
  });

  it('rejects hub COD reconciliation for a non-COD waybill', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ payment_type: PaymentType.PP }));

    await expect(service.updateCodReconciliation('1', { confirmed: true }, accountant)).rejects.toThrow(BadRequestException);
  });

  it('ACCOUNTANT can update COD after MANIFEST_CLOSED and WAREHOUSE cannot', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ status: WaybillStatus.MANIFEST_CLOSED, current_state: WaybillStatus.MANIFEST_CLOSED }));
    await expect(service.updateCodFee('1', { cod_amount: 100 }, accountant)).resolves.toMatchObject({ status: WaybillStatus.MANIFEST_CLOSED });
    expect(changeLogsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COD_FEE_UPDATED',
      changes: expect.objectContaining({
        cod_amount: { old_value: 0, new_value: 100 },
      }),
    }));
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
    await expect(service.softDelete('1', director)).rejects.toThrow(BadRequestException);
  });

  it('reconcileTransportStatesForTrips repairs a fully arrived waybill stuck in warehouse', async () => {
    const waybill = makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      package_count: 171,
      dest_hub_id: '2',
    });
    const arrivedSplit = {
      id: '116',
      waybill_id: '1',
      trip_id: '39',
      package_count: 171,
      load_status: WaybillSplitLoadStatus.ARRIVED,
    };
    splitsRepository.find
      .mockResolvedValueOnce([arrivedSplit])
      .mockResolvedValueOnce([arrivedSplit]);
    waybillsRepository.find.mockResolvedValue([waybill]);

    await expect(service.reconcileTransportStatesForTrips(['39'])).resolves.toBe(1);

    expect(waybillsRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        current_state: WaybillStatus.AT_DEST_HUB,
        current_hub_id: '2',
        last_audit_action: 'TRIP_SPLIT_STATE_RECONCILE',
      }),
    ]);
  });

  it('reconcileTransportStatesForTrips keeps a partially allocated order in warehouse', async () => {
    const waybill = makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      package_count: 187,
    });
    const arrivedSplit = {
      id: 's41',
      waybill_id: '1',
      trip_id: '41',
      package_count: 127,
      load_status: WaybillSplitLoadStatus.ARRIVED,
    };
    splitsRepository.find
      .mockResolvedValueOnce([arrivedSplit])
      .mockResolvedValueOnce([arrivedSplit]);
    waybillsRepository.find.mockResolvedValue([waybill]);

    await expect(service.reconcileTransportStatesForTrips(['41'])).resolves.toBe(0);
    expect(waybillsRepository.save).not.toHaveBeenCalled();
  });

  it('getDeliveryTasks đưa phần kiện của chuyến đã đến vào danh sách giao', async () => {
    const waybill = makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      package_count: 138,
      weight: 1380,
      volumetric_weight: 690,
      the_tich_m3: 13.8,
    });
    const qb = createQueryBuilder();
    qb.getMany.mockResolvedValue([waybill]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    splitsRepository.find.mockResolvedValue([{
      id: 's38',
      waybill_id: '1',
      trip_id: 't1',
      package_count: 38,
      load_status: WaybillSplitLoadStatus.ARRIVED,
      trip: { id: 't1', status: TripStatus.ARRIVED, truck_id: null },
    }]);

    const result = await service.getDeliveryTasks({
      status: `${WaybillStatus.AT_DEST_HUB},${WaybillStatus.OUT_FOR_DELIVERY}`,
      page: 1,
      limit: 100,
    }, manager);

    expect(result.items).toEqual([
      expect.objectContaining({
        task_id: 'split:s38',
        split_id: 's38',
        trip_id: 't1',
        current_state: WaybillStatus.AT_DEST_HUB,
        trip_package_count: 38,
        order_total_packages: 138,
        weight: 380,
        volumetric_weight: 190,
        the_tich_m3: 3.8,
      }),
    ]);
  });

  it('getDeliveryTasks đưa xe đang chạy vào bước gọi hẹn trước và vẫn giữ trạng thái chuyến riêng', async () => {
    const waybill = makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      package_count: 187,
    });
    const qb = createQueryBuilder();
    qb.getMany.mockResolvedValue([waybill]);
    waybillsRepository.createQueryBuilder.mockReturnValue(qb);
    splitsRepository.find.mockResolvedValue([{
      id: 's46', waybill_id: '1', trip_id: '46', package_count: 60,
      load_status: WaybillSplitLoadStatus.IN_TRANSIT,
      trip: { id: '46', status: TripStatus.IN_TRANSIT, departure_time: new Date('2026-08-08T01:00:00Z'), truck_id: null },
    }]);

    const result = await service.getDeliveryTasks({ status: WaybillStatus.IN_TRANSIT, page: 1, limit: 100 }, manager);

    expect(result.items).toEqual([
      expect.objectContaining({
        task_id: 'split:s46',
        trip_id: '46',
        current_state: WaybillStatus.IN_TRANSIT,
        trip_status: TripStatus.IN_TRANSIT,
        trip_package_count: 60,
      }),
    ]);
  });

  it('updateDeliveryPreparation allows calling the receiver while the split trip is in transit', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
    }));
    splitsRepository.find.mockResolvedValue([{
      id: 's46', waybill_id: '1', load_status: WaybillSplitLoadStatus.IN_TRANSIT,
      trip: { id: '46', status: TripStatus.IN_TRANSIT },
    }]);

    const result = await service.updateDeliveryPreparation('1', { status: 'READY' }, manager);

    expect(result).toMatchObject({ delivery_preparation_status: 'READY' });
    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ delivery_preparation_status: 'READY' }));
  });

  it('giao phần kiện không đổi toàn bộ vận đơn khỏi danh sách tồn', async () => {
    const split = {
      id: 's38',
      waybill_id: '1',
      trip_id: 't1',
      package_count: 38,
      load_status: WaybillSplitLoadStatus.ARRIVED,
    };
    const waybill = makeWaybill({
      current_state: WaybillStatus.IN_WAREHOUSE,
      status: WaybillStatus.IN_WAREHOUSE,
      package_count: 138,
    });
    waybillsRepository.findOne.mockResolvedValue(waybill);
    splitsRepository.find.mockResolvedValue([split]);
    tripsRepository.findOne.mockResolvedValue({ id: 't1', status: TripStatus.ARRIVED, manifest_id: null, truck_id: null });

    const result = await service.updateStatus('1', {
      status: WaybillStatus.DELIVERED,
      delivery_photo_url: 'https://example.com/partial-delivery.jpg',
      trip_id: 't1',
      split_id: 's38',
    }, manager);

    expect(split.load_status).toBe(WaybillSplitLoadStatus.DELIVERED);
    expect(waybill.current_state).toBe(WaybillStatus.IN_WAREHOUSE);
    expect(result).toMatchObject({
      current_state: WaybillStatus.DELIVERED,
      trip_id: 't1',
      split_id: 's38',
    });
    expect(tripsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: TripStatus.COMPLETED }));
  });

  it('updateStatus cho phép giao đơn đã nằm trong bảng kê và tự hoàn tất chuyến', async () => {
    const split = {
      id: 's1', waybill_id: '1', trip_id: 't1', package_count: 1,
      load_status: WaybillSplitLoadStatus.IN_TRANSIT,
    };
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      current_state: WaybillStatus.OUT_FOR_DELIVERY,
      status: WaybillStatus.OUT_FOR_DELIVERY,
      manifest_id: 'm1',
    }));
    splitsRepository.find.mockResolvedValue([split]);
    manifestWaybillsRepository.find.mockResolvedValue([]);
    tripsRepository.find.mockResolvedValue([{ id: 't1', status: TripStatus.ARRIVED }]);
    tripsRepository.findOne.mockResolvedValue({ id: 't1', status: TripStatus.ARRIVED, manifest_id: 'm1', truck_id: null });
    manifestsRepository.findOne.mockResolvedValue({ id: 'm1', status: ManifestStatus.IN_TRANSIT });

    await service.updateStatus('1', {
      status: WaybillStatus.DELIVERED,
      delivery_photo_url: 'https://example.com/delivered.jpg',
      trip_id: 't1',
    }, warehouse);

    expect(split.load_status).toBe(WaybillSplitLoadStatus.DELIVERED);
    expect(tripsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: TripStatus.COMPLETED }));
    expect(manifestsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: ManifestStatus.COMPLETED }));
  });

  it('lưu phân công tài xế và xe nội bộ khi nhận giao chặng cuối', async () => {
    const waybill = makeWaybill({
      current_state: WaybillStatus.AT_DEST_HUB,
      status: WaybillStatus.AT_DEST_HUB,
      dest_hub_id: '2',
    });
    waybillsRepository.findOne.mockResolvedValue(waybill);
    usersRepository.findOne.mockResolvedValue({ id: 'd1', full_name: 'Tài xế A', role_mask: Roles.DRIVER, hub_id: '2', is_active: true });
    trucksRepository.findOne.mockResolvedValue({ id: 'x1', license_plate: '51A-12345', bks: '51A-12345' });

    await service.updateStatus('1', {
      status: WaybillStatus.OUT_FOR_DELIVERY,
      assignment_type: 'INTERNAL',
      route_code: 'HCM-Q1',
      driver_id: 'd1',
      truck_id: 'x1',
      driver_name: 'Tài xế A',
      license_plate: '51A-12345',
      delivery_cost: 150000,
    }, manager);

    expect(waybill).toMatchObject({
      current_state: WaybillStatus.OUT_FOR_DELIVERY,
      delivery_assignment_type: 'INTERNAL',
      last_mile_driver_id: 'd1',
      last_mile_truck_id: 'x1',
      last_mile_vendor_id: null,
      last_mile_driver_name: 'Tài xế A',
      last_mile_license_plate: '51A-12345',
      last_mile_cost_amount: '150000',
      xe_phat: '51A-12345',
      route_code: 'HCM-Q1',
    });
  });

  it('lưu đối tác khi phân giao chặng cuối', async () => {
    const waybill = makeWaybill({ current_state: WaybillStatus.AT_DEST_HUB, status: WaybillStatus.AT_DEST_HUB });
    waybillsRepository.findOne.mockResolvedValue(waybill);
    vendorsRepository.findOne.mockResolvedValue({ id: 'v1', name: 'Đối tác HCM', status: 'ACTIVE' });

    await service.updateStatus('1', {
      status: WaybillStatus.OUT_FOR_DELIVERY,
      assignment_type: 'PARTNER',
      route_code: 'HCM-Q2',
      vendor_id: 'v1',
      driver_name: 'Tài xế đối tác',
      license_plate: '50H-67890',
    }, manager);

    expect(waybill).toMatchObject({
      delivery_assignment_type: 'PARTNER',
      last_mile_driver_id: null,
      last_mile_truck_id: null,
      last_mile_vendor_id: 'v1',
      last_mile_driver_name: 'Tài xế đối tác',
      last_mile_license_plate: '50H-67890',
      xe_phat: '50H-67890',
    });
  });

  it('bắt buộc và lưu lý do khi giao hàng không thành công', async () => {
    const waybill = makeWaybill({ current_state: WaybillStatus.OUT_FOR_DELIVERY, status: WaybillStatus.OUT_FOR_DELIVERY });
    waybillsRepository.findOne.mockResolvedValue(waybill);

    await expect(service.updateStatus('1', { status: WaybillStatus.RETURNED }, manager)).rejects.toThrow(BadRequestException);
    await service.updateStatus('1', { status: WaybillStatus.RETURNED, failure_reason: 'Khách hẹn lại ngày khác' }, manager);

    expect((waybill as any).last_delivery_failure_reason).toBe('Khách hẹn lại ngày khác');
    expect(changeLogsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELIVERY_FAILED' }));
  });

  it('correctStatus mở lại chuyến khi sửa nhầm đơn đã giao', async () => {
    const split = {
      id: 's1', waybill_id: '1', trip_id: 't1', package_count: 1,
      load_status: WaybillSplitLoadStatus.DELIVERED,
    };
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      current_state: WaybillStatus.DELIVERED,
      status: WaybillStatus.DELIVERED,
      manifest_id: 'm1',
      delivered_at: new Date(),
    }));
    splitsRepository.find.mockResolvedValue([split]);
    manifestWaybillsRepository.find.mockResolvedValue([]);
    tripsRepository.findOne.mockResolvedValue({ id: 't1', status: TripStatus.COMPLETED, manifest_id: 'm1', truck_id: null });
    manifestsRepository.findOne.mockResolvedValue({ id: 'm1', status: ManifestStatus.COMPLETED });

    const result = await service.correctStatus('1', { status: WaybillStatus.AT_DEST_HUB, trip_id: 't1' }, manager);

    expect(result.status).toBe(WaybillStatus.AT_DEST_HUB);
    expect(split.load_status).toBe(WaybillSplitLoadStatus.IN_TRANSIT);
    expect(tripsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: TripStatus.ARRIVED }));
  });

  it('correctStatus giữ phần kiện chưa đi trong tồn kho', async () => {
    const split = {
      id: 's38', waybill_id: '1', trip_id: 't1', package_count: 38,
      load_status: WaybillSplitLoadStatus.DELIVERED,
    };
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({
      current_state: WaybillStatus.DELIVERED,
      status: WaybillStatus.DELIVERED,
      package_count: 138,
      delivered_at: new Date(),
    }));
    splitsRepository.find.mockResolvedValue([split]);
    tripsRepository.findOne.mockResolvedValue({ id: 't1', status: TripStatus.COMPLETED, manifest_id: null, truck_id: null });

    const result = await service.correctStatus('1', {
      status: WaybillStatus.AT_DEST_HUB,
      trip_id: 't1',
    }, manager);

    expect(result.status).toBe(WaybillStatus.IN_WAREHOUSE);
    expect(split.load_status).toBe(WaybillSplitLoadStatus.IN_TRANSIT);
  });

  it('softDelete only allows DIRECTOR and soft deletes mutable waybills', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill());
    await expect(service.softDelete('1', manager)).rejects.toThrow(ForbiddenException);

    const waybill = makeWaybill();
    waybillsRepository.findOne.mockResolvedValue(waybill);
    await expect(service.softDelete('1', director)).resolves.toBeUndefined();
    expect(waybillsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      deleted_at: expect.any(Date),
      updated_by: director.id,
    }));
  });

  it('response omits fee fields for non-manager users', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ cod_amount: 10, freight_amount: 20, cc_amount: 30 }));
    const result = await service.findOne('1', warehouse);
    expect(result).not.toHaveProperty('cod_amount');
    expect(result).not.toHaveProperty('freight_amount');
    expect(result).not.toHaveProperty('cc_amount');
  });

  it('response exposes only COD amount to accountant for hub reconciliation', async () => {
    waybillsRepository.findOne.mockResolvedValue(makeWaybill({ cod_amount: 10, cost_amount: 15, freight_amount: 20, cc_amount: 30 }));
    const result = await service.findOne('1', accountant);
    expect(result.cod_amount).toBe(10);
    expect(result).not.toHaveProperty('cost_amount');
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
