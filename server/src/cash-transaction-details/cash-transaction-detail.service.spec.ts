import { CashTransactionDetailService } from './cash-transaction-detail.service';

const createQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(async () => [[{ id: '1', voucher_type: 'Sample' }], 1]),
  getOne: jest.fn(async () => null),
});

const createRepository = () => {
  const qb = createQueryBuilder();
  return {
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : { id: where.id, voucher_type: 'Sample' })),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('CashTransactionDetailService', () => {
  let service: CashTransactionDetailService;
  let cashTransactionDetailRepository: ReturnType<typeof createRepository>;
  let vehicleCostsRepository: ReturnType<typeof createRepository>;

  beforeEach(() => {
    cashTransactionDetailRepository = createRepository();
    vehicleCostsRepository = createRepository();
    vehicleCostsRepository.findOne.mockResolvedValue({ id: '1', voucher_type: 'Sample' });
    service = new CashTransactionDetailService(cashTransactionDetailRepository as any, vehicleCostsRepository as any);
    jest.clearAllMocks();
  });

  it('lists records with paging metadata', async () => {
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('creates, updates, finds, and removes records', async () => {
    await expect(service.create({ vehicle_cost_id: '1', voucher_type: 'Thu', voucher_name: 'Phiếu thu', service_type: 'VT', counterparty_unit: 'ECO', content: 'Test', performed_by: 'Admin', entry_date: '2026-06-02', entry_time: '08:30', amount: 1000 })).resolves.toMatchObject({ id: '1' });
    await expect(service.update('1', { voucher_type: 'Updated' } as any)).resolves.toMatchObject({ id: '1' });
    await expect(service.findOne('1')).resolves.toMatchObject({ id: '1' });
    await expect(service.remove('1')).resolves.toBeUndefined();
  });

  it('rejects missing vehicle_cost_id references', async () => {
    vehicleCostsRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.create({ vehicle_cost_id: '1', voucher_type: 'Thu', voucher_name: 'Phiếu thu', service_type: 'VT', counterparty_unit: 'ECO', content: 'Test', performed_by: 'Admin', entry_date: '2026-06-02', entry_time: '08:30', amount: 1000 })).rejects.toThrow('vehicle_cost_id does not reference an existing vehicle cost');
  });
});
