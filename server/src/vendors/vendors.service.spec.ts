import { VendorsService } from './vendors.service';

const chain = () => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
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
