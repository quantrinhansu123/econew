import { ForbiddenException } from '@nestjs/common';
import { VendorTripPaymentStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { ExpenseEntity } from '../expenses/expense.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { VendorDebtEntryEntity } from './vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorEntity } from './vendor.entity';
import { VendorsService } from './vendors.service';

const chain = () => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  setLock: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
});

describe('VendorsService payment safety', () => {
  const managerUser = { id: 'manager-1', role_mask: Roles.MANAGER } as any;
  const dispatcher = { id: 'dispatcher-1', role_mask: Roles.DISPATCHER } as any;

  function createPaymentService() {
    const vendor = { id: '12', opening_debt: '0', payable_balance: '400' } as any;
    const trip = {
      id: '75',
      vendor_id: '12',
      trip_cost: '1000',
      other_costs: null,
      vendor_paid_amount: '600',
      vendor_payment_status: VendorTripPaymentStatus.PARTIAL,
      vendor_payment_proof_url: 'https://example.test/proof.jpg',
    } as any;
    const payment = { id: '9', vendor_id: '12', amount: '200', trips: [trip] } as any;
    const vendorQb = chain();
    vendorQb.getMany.mockResolvedValue([vendor]);
    const tripQb = chain();
    tripQb.getMany.mockResolvedValue([trip]);
    const vendorsRepository = {
      findOne: jest.fn().mockResolvedValue(vendor),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn().mockReturnValue(vendorQb),
    } as any;
    const debtEntriesRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const paymentsRepository = {
      find: jest.fn()
        .mockResolvedValueOnce([payment])
        .mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tripsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(tripQb),
      save: jest.fn(async (value) => value),
    } as any;
    const manifestWaybillsRepository = {} as any;
    const expensesRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const splitsRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const waybillsRepository = { find: jest.fn().mockResolvedValue([]), manager: { getRepository: () => splitsRepository } } as any;
    const repositories = new Map<any, any>([
      [VendorEntity, vendorsRepository],
      [VendorDebtEntryEntity, debtEntriesRepository],
      [VendorPaymentEntity, paymentsRepository],
      [TripEntity, tripsRepository],
      [ExpenseEntity, expensesRepository],
      [WaybillEntity, waybillsRepository],
      [WaybillSplitEntity, splitsRepository],
    ]);
    const transaction = jest.fn(async (work) => work({
      getRepository: (entity: any) => repositories.get(entity),
    }));
    paymentsRepository.manager = { transaction };

    return {
      service: new VendorsService(
        vendorsRepository,
        debtEntriesRepository,
        paymentsRepository,
        tripsRepository,
        manifestWaybillsRepository,
        expensesRepository,
        waybillsRepository,
      ),
      payment,
      trip,
      paymentsRepository,
      tripsRepository,
      tripQb,
      vendorsRepository,
      transaction,
    };
  }

  it('xóa phiếu chi cập nhật ngược số đã trả của chuyến trong cùng transaction', async () => {
    const context = createPaymentService();

    await expect(context.service.deletePayments(['9'], managerUser)).resolves.toEqual({
      deleted_count: 1,
      deleted_ids: ['9'],
    });

    expect(context.transaction).toHaveBeenCalledTimes(1);
    expect(context.tripQb.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, ['trip']);
    expect(context.paymentsRepository.remove).toHaveBeenCalledWith([context.payment]);
    expect(context.tripsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: '75',
      vendor_paid_amount: '400',
      vendor_payment_status: VendorTripPaymentStatus.PARTIAL,
    }));
    expect(context.vendorsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: '12',
      payable_balance: '1000',
    }));
  });

  it('không cho điều phối viên xóa phiếu thanh toán NCC', async () => {
    const context = createPaymentService();

    await expect(context.service.deletePayments(['9'], dispatcher)).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.paymentsRepository.remove).not.toHaveBeenCalled();
    expect(context.transaction).not.toHaveBeenCalled();
  });
});

describe('VendorsService opening debt', () => {
  const vendor = {
    id: '12',
    code: 'NCC12',
    name: 'NCC 12',
    opening_debt: '1500000',
    payable_balance: '1500000',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    trucks: [],
  } as any;

  function createService() {
    const vendorQb = chain();
    vendorQb.getMany.mockResolvedValue([vendor]);
    const tripQb = chain();
    tripQb.getMany.mockResolvedValue([]);

    const vendorsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(vendorQb),
      findOne: jest.fn().mockResolvedValue(vendor),
    } as any;
    const debtEntriesRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const paymentsRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const tripsRepository = { createQueryBuilder: jest.fn().mockReturnValue(tripQb) } as any;
    const manifestWaybillsRepository = {} as any;
    const expensesRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const waybillsRepository = { find: jest.fn().mockResolvedValue([]), manager: { getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }) } } as any;

    return new VendorsService(
      vendorsRepository,
      debtEntriesRepository,
      paymentsRepository,
      tripsRepository,
      manifestWaybillsRepository,
      expensesRepository,
      waybillsRepository,
    );
  }

  it('cộng công nợ tồn vào báo cáo phải trả', async () => {
    const result = await createService().getDebtReport();

    expect(result.items[0]).toMatchObject({
      total_incurred: 1_500_000,
      total_paid: 0,
      payable_balance: 1_500_000,
    });
    expect(result.grand_total).toBe(1_500_000);
  });

  it('tạo dòng công nợ đầu kỳ trong sổ cái', async () => {
    const result = await createService().getLedger(vendor.id, {});

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: 'OPENING',
      amount: 1_500_000,
      running_balance: 1_500_000,
      description: 'Công nợ tồn đầu kỳ',
    });
  });
});

describe('VendorsService delivery assignment costs', () => {
  it('counts actual split costs once, excludes plans, and preserves legacy bills', async () => {
    const vendor = { id: '12', opening_debt: '0', payable_balance: '0', created_at: new Date() } as any;
    const bill = { id: '1', waybill_code: 'ECO1', created_at: new Date(), last_mile_vendor_id: '12', last_mile_cost_amount: '300000' };
    const splits = { find: jest.fn().mockResolvedValueOnce([
      { id: 's1', waybill_id: '1', waybill: bill, delivery_dispatch: { kind: 'ASSIGNMENT', vendor_id: '12', delivery_cost: 100000 } },
      { id: 's2', waybill_id: '1', waybill: bill, delivery_dispatch: { kind: 'PLAN', vendor_id: '12', delivery_cost: 900000 } },
    ]).mockResolvedValueOnce([{ waybill_id: '1' }]) };
    const waybills = { find: jest.fn().mockResolvedValue([bill, { ...bill, id: '2', waybill_code: 'ECO2', last_mile_cost_amount: '50000' }]), manager: { getRepository: () => splits } };
    const tripQb = chain(); tripQb.getMany.mockResolvedValue([]);
    const vendors = { findOne: jest.fn().mockResolvedValue(vendor), save: jest.fn(async value => value) };
    const empty = { find: jest.fn().mockResolvedValue([]) };
    const service = new VendorsService(vendors as any, empty as any, empty as any, { createQueryBuilder: () => tripQb } as any, {} as any, empty as any, waybills as any);
    await service.refreshPayableBalance('12');
    expect(vendors.save).toHaveBeenCalledWith(expect.objectContaining({ payable_balance: '150000' }));
  });
});

describe('VendorsService payment allocation', () => {
  it('allocates one payment sequentially by each trip outstanding balance', () => {
    const context = (() => {
      const makeRepository = () => ({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(chain()) });
      return new VendorsService(
        makeRepository() as any,
        makeRepository() as any,
        makeRepository() as any,
        makeRepository() as any,
        makeRepository() as any,
        makeRepository() as any,
        makeRepository() as any,
      );
    })();
    const trips = [
      { id: '75', trip_cost: '1000', vendor_paid_amount: '600' },
      { id: '76', trip_cost: '800', vendor_paid_amount: '0' },
    ] as any;

    const result = (context as any).buildPaymentAllocations(900, trips);

    expect([...result.entries()]).toEqual([
      ['75', 400],
      ['76', 500],
    ]);
  });

  it('requires explicit allocations to equal the payment and not exceed a trip balance', () => {
    const makeRepository = () => ({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(chain()) });
    const service = new VendorsService(
      makeRepository() as any,
      makeRepository() as any,
      makeRepository() as any,
      makeRepository() as any,
      makeRepository() as any,
      makeRepository() as any,
      makeRepository() as any,
    );
    const trips = [{ id: '75', trip_cost: '1000', vendor_paid_amount: '600' }] as any;

    expect(() => (service as any).buildPaymentAllocations(500, trips, [{ trip_id: 75, amount: 500 }]))
      .toThrow('Phân bổ vượt dư nợ chuyến #75');
    expect(() => (service as any).buildPaymentAllocations(400, trips, [{ trip_id: 75, amount: 400 }]))
      .not.toThrow();
  });
});
