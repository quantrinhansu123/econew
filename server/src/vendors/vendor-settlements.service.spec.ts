import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Roles } from '../common/roles';
import { TripEntity } from '../trips/trip.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorPaymentAllocationEntity } from './vendor-payment-allocation.entity';
import { VendorSettlementEntity, VendorSettlementItemEntity } from './vendor-settlement.entity';
import { CreateVendorSettlementDto } from './dto/create-vendor-settlement.dto';
import { allocateSettlementPayment, VendorSettlementsService } from './vendor-settlements.service';

const user = { id: '1', role_mask: Roles.MANAGER } as any;
const range = { from_date: '2026-08-01', to_date: '2026-08-31' };
const payment = (amount: number) => ({ amount, fund_id: '1', cost_category: 'Cước NCC', payment_date: new Date('2026-11-11T05:00:00Z') });

function fixture() {
  const trips: any[] = [
    { id: '2', vendor_id: '12', trip_cost: '800', vendor_paid_amount: '0', departure_time: new Date('2026-08-31T16:59:59Z'), status: 'COMPLETED' },
    { id: '1', vendor_id: '12', trip_cost: '1000', vendor_paid_amount: '0', departure_time: new Date('2026-08-01T00:00:00Z'), status: 'COMPLETED' },
    { id: '3', vendor_id: '12', trip_cost: '3000', vendor_paid_amount: '0', departure_time: new Date('2026-08-31T17:00:00Z'), status: 'COMPLETED' },
  ];
  const tables = new Map<any, any[]>([
    [TripEntity, trips], [VendorSettlementEntity, []], [VendorSettlementItemEntity, []],
    [VendorPaymentEntity, []], [VendorPaymentAllocationEntity, []],
    [CashFundEntity, [{ id: '1', is_active: true, hub_id: '1' }]],
  ]);
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (value?.type === 'in') return value.value.includes(row[key]);
    if (value?.type === 'isNull') return row[key] == null;
    return row[key] === value;
  });
  const hydrate = (entity: any, row: any) => {
    if (entity === VendorSettlementEntity) row.items = tables.get(VendorSettlementItemEntity)!.filter((item) => item.settlement_id === row.id)
      .map((item) => ({ ...item, trip: trips.find((trip) => trip.id === item.trip_id) }));
    if (entity === VendorPaymentEntity) {
      row.trips ||= [];
      row.allocations = tables.get(VendorPaymentAllocationEntity)!.filter((item) => item.payment_id === row.id);
    }
    if (entity === VendorPaymentAllocationEntity) row.payment = tables.get(VendorPaymentEntity)!.find((item) => item.id === row.payment_id);
    return row;
  };
  const repositories = new Map<any, any>();
  for (const [entity, rows] of tables) {
    const repository: any = {
      create: (value: any) => ({ ...value }),
      save: jest.fn(async (value: any) => {
        if (Array.isArray(value)) return Promise.all(value.map((item) => repository.save(item)));
        if (![VendorSettlementItemEntity, VendorPaymentAllocationEntity].includes(entity)) value.id ||= String(rows.length + 1);
        const existing = entity === VendorSettlementItemEntity ? rows.find((row) => row.trip_id === value.trip_id)
          : entity === VendorPaymentAllocationEntity ? rows.find((row) => row.payment_id === value.payment_id && row.trip_id === value.trip_id)
            : rows.find((row) => row.id === value.id);
        if (existing) Object.assign(existing, value); else rows.push(value);
        return value;
      }),
      find: jest.fn(async (options: any = {}) => rows.filter((row) => matches(row, options.where)).map((row) => hydrate(entity, row))),
      findOne: jest.fn(async (options: any) => {
        const found = rows.find((row) => matches(row, options.where));
        return found ? hydrate(entity, found) : null;
      }),
      findOneOrFail: async (options: any) => repository.findOne(options),
      update: async (where: any, patch: any) => rows.filter((row) => matches(row, where)).forEach((row) => Object.assign(row, patch)),
      createQueryBuilder: () => {
        const params: any = {};
        const qb: any = {};
        for (const method of ['where', 'andWhere']) qb[method] = (_sql: string, values: any) => { Object.assign(params, values); return qb; };
        for (const method of ['leftJoinAndSelect', 'orderBy', 'setLock']) qb[method] = () => qb;
        qb.getOne = async () => rows.find((row) => row.vendor_id === params.vendorId && row.from_date <= params.to && row.to_date >= params.from) || null;
        qb.getMany = async () => rows.filter((row) => params.ids ? params.ids.includes(row.id)
          : row.vendor_id === params.vendorId && row.departure_time >= params.from && row.departure_time < params.until && params.statuses.includes(row.status));
        return qb;
      },
    };
    repositories.set(entity, repository);
  }
  const manager = { getRepository: (entity: any) => repositories.get(entity), query: jest.fn().mockResolvedValue([]) };
  const dataSource = { ...manager, manager, transaction: jest.fn(async (work: any) => work(manager)) };
  const vendors = { findOne: jest.fn().mockResolvedValue({ id: '12' }), refreshPayableBalance: jest.fn() };
  return { service: new VendorSettlementsService(dataSource as any, vendors as any), tables, repositories, trips, dataSource, vendors };
}

describe('vendor settlement payments', () => {
  it('settles the 246,996,000 VND August period in three installments of 100m, 100m and 46.996m', async () => {
    const f = fixture();
    f.trips.find((trip) => trip.id === '1').trip_cost = '100000000';
    f.trips.find((trip) => trip.id === '2').trip_cost = '146996000';
    const period = await f.service.create('12', range, user);
    for (const [amount, remaining, paymentStatus] of [
      [100000000, 146996000, 'PARTIAL'],
      [100000000, 46996000, 'PARTIAL'],
      [46996000, 0, 'PAID'],
    ] as const) {
      await f.service.pay('12', period.id, payment(amount), user);
      expect((await f.service.list('12', user)).items[0]).toMatchObject({
        total_amount: 246996000, remaining_amount: remaining, payment_status: paymentStatus,
      });
    }
    expect(f.trips.filter((trip) => ['1', '2'].includes(trip.id)).every((trip) => trip.vendor_payment_status === 'PAID')).toBe(true);
    expect(f.trips.find((trip) => trip.id === '3').vendor_paid_amount).toBe('0');
  });

  it('keeps the August snapshot, accumulates November payments, and marks its trips paid without touching September', async () => {
    const f = fixture();
    const period = await f.service.create('12', range, user);
    expect(f.tables.get(VendorSettlementItemEntity)).toHaveLength(2);
    await f.service.pay('12', period.id, payment(1000), user);
    let result = (await f.service.list('12', user)).items[0];
    expect(result).toMatchObject({ total_amount: 1800, paid_amount: 1000, remaining_amount: 800, payment_status: 'PARTIAL' });
    expect(f.trips.find((trip) => trip.id === '1').vendor_payment_status).toBe('PAID');
    await f.service.pay('12', period.id, payment(800), user);
    result = (await f.service.list('12', user)).items[0];
    expect(result).toMatchObject({ paid_amount: 1800, remaining_amount: 0, payment_status: 'PAID' });
    expect(result.payments).toHaveLength(2);
    expect(f.trips.find((trip) => trip.id === '2').vendor_payment_status).toBe('PAID');
    expect(f.trips.find((trip) => trip.id === '3').vendor_paid_amount).toBe('0');
    expect(f.vendors.refreshPayableBalance).toHaveBeenCalledTimes(2);
  });

  it('allocates an old payment partially, keeps its excess available, and never creates a second expense', async () => {
    const f = fixture();
    const old = { id: '50', vendor_id: '12', amount: '2500', payment_date: new Date('2026-09-10'), trips: [], description: 'Đã chuyển tiền' };
    f.tables.get(VendorPaymentEntity)!.push(old);
    const period = await f.service.create('12', range, user);
    await f.service.attach('12', period.id, '50', 1000, user);
    await f.service.attach('12', period.id, '50', 800, user);
    expect(f.tables.get(VendorPaymentEntity)).toHaveLength(1);
    expect(old.amount).toBe('2500');
    expect(f.vendors.refreshPayableBalance).not.toHaveBeenCalled();
    expect((await f.service.list('12', user)).items[0].payment_status).toBe('PAID');
    expect((await f.service.unallocatedPayments('12', user)).items[0]).toMatchObject({ id: '50', available_amount: 700 });
    await expect(f.service.attach('12', period.id, '50', 701, user)).rejects.toBeInstanceOf(BadRequestException);
    const september = await f.service.create('12', { from_date: '2026-09-01', to_date: '2026-09-30' }, user);
    await f.service.attach('12', september.id, '50', 700, user);
    expect(f.tables.get(VendorPaymentEntity)).toHaveLength(1);
    expect(f.trips.find((trip) => trip.id === '3').vendor_paid_amount).toBe('700');
    expect((await f.service.unallocatedPayments('12', user)).items).toHaveLength(0);
  });

  it('does not double count money allocated to a trip before closing its period', async () => {
    const f = fixture();
    f.trips.find((trip) => trip.id === '1').vendor_paid_amount = '600';
    f.tables.get(VendorPaymentEntity)!.push({ id: '50', vendor_id: '12', amount: '600', payment_date: new Date(), trips: [f.trips[1]] });
    f.tables.get(VendorPaymentAllocationEntity)!.push({ payment_id: '50', trip_id: '1', amount: '600', settlement_id: null });
    const period = await f.service.create('12', range, user);
    expect((await f.service.list('12', user)).items[0]).toMatchObject({ paid_amount: 600, remaining_amount: 1200 });
    await f.service.pay('12', period.id, payment(1200), user);
    expect((await f.service.list('12', user)).items[0]).toMatchObject({ paid_amount: 1800, remaining_amount: 0 });
  });

  it('rejects overlapping periods and overpayments before recording cash', async () => {
    const f = fixture();
    const period = await f.service.create('12', range, user);
    await expect(f.service.create('12', { ...range, from_date: '2026-08-15' }, user)).rejects.toBeInstanceOf(ConflictException);
    await expect(f.service.pay('12', period.id, payment(1801), user)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tables.get(VendorPaymentEntity)).toHaveLength(0);
    expect(f.dataSource.manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['vendor-settlement:12']);
  });

  it('requires the reviewed total and trip count to still match at closing time', async () => {
    const f = fixture();
    await expect(f.service.create('12', { ...range, expected_total: 1700, expected_trip_count: 2 }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(f.tables.get(VendorSettlementEntity)).toHaveLength(0);
  });

  it('rejects reversed date ranges, empty periods, and a changed snapshot', async () => {
    const f = fixture();
    await expect(f.service.create('12', { from_date: '2026-08-31', to_date: '2026-08-01' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(f.service.create('12', { from_date: '2025-01-01', to_date: '2025-01-31' }, user)).rejects.toBeInstanceOf(BadRequestException);
    const period = await f.service.create('12', range, user);
    f.trips[0].trip_cost = '900';
    await expect(f.service.pay('12', period.id, payment(500), user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces finance permissions, vendor ownership and fund hub scope', async () => {
    const f = fixture();
    await expect(f.service.create('12', range, { ...user, role_mask: Roles.DISPATCHER })).rejects.toBeInstanceOf(ForbiddenException);
    const period = await f.service.create('12', range, user);
    await expect(f.service.pay('13', period.id, payment(500), user)).rejects.toThrow('Không tìm thấy kỳ');
    await expect(f.service.pay('12', period.id, payment(500), { ...user, role_mask: Roles.ACCOUNTANT, hub_id: '2' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tables.get(VendorPaymentEntity)).toHaveLength(0);
  });

  it('uses exact cents for partial payments and stable FIFO ordering', () => {
    expect([...allocateSettlementPayment(0.03, [
      { id: '2', trip_cost: '0.02', vendor_paid_amount: '0', departure_time: new Date('2026-08-02') },
      { id: '1', trip_cost: '0.02', vendor_paid_amount: '0.01', departure_time: new Date('2026-08-01') },
    ] as any)]).toEqual([['1', 0.01], ['2', 0.02]]);
  });

  it.each(['2026-02-30', '2026-08-01T00:00:00Z'])('rejects invalid or non-date-only boundaries: %s', async (date) => {
    expect(await validate(plainToInstance(CreateVendorSettlementDto, { from_date: date, to_date: '2026-08-31' }))).not.toHaveLength(0);
  });
});
