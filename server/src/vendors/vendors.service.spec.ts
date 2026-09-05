import { ForbiddenException } from '@nestjs/common';
import { VendorTripPaymentStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { ExpenseEntity } from '../expenses/expense.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
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
    const waybillsRepository = { find: jest.fn().mockResolvedValue([]) } as any;
    const repositories = new Map<any, any>([
      [VendorEntity, vendorsRepository],
      [VendorDebtEntryEntity, debtEntriesRepository],
      [VendorPaymentEntity, paymentsRepository],
      [TripEntity, tripsRepository],
      [ExpenseEntity, expensesRepository],
      [WaybillEntity, waybillsRepository],
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
    const waybillsRepository = { find: jest.fn().mockResolvedValue([]) } as any;

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
