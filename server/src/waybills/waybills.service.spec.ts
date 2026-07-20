import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WaybillsService } from './waybills.service';
import { Roles } from '../common/roles';
import { WaybillPriority, WaybillStatus } from './dto/waybill.enums';

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
  let cashVouchersRepository: any;

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
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    cashVouchersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(createQueryBuilder),
    };
    const ordersService = {
      createFromWaybillEntry: jest.fn().mockResolvedValue({ id: 'o1', order_code: 'DH20260101-001' }),
    };
    const vendorsService = {} as any;
    service = new WaybillsService(
      waybillsRepository,
      hubsRepository,
      splitsRepository,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { find: jest.fn(), save: jest.fn(), create: jest.fn() } as any,
      { find: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() } as any,
      cashVouchersRepository,
      ordersService as any,
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
