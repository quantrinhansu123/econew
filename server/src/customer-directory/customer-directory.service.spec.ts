import { CustomerDirectoryService } from './customer-directory.service';

const createQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(async () => [[{ id: '1', full_name: 'Sample' }], 1]),
  getOne: jest.fn(async () => null),
});

const createRepository = () => {
  const qb = createQueryBuilder();
  return {
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : { id: where.id, full_name: 'Sample' })),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('CustomerDirectoryService', () => {
  let service: CustomerDirectoryService;
  let customerDirectoryRepository: ReturnType<typeof createRepository>;

  beforeEach(() => {
    customerDirectoryRepository = createRepository();
    service = new CustomerDirectoryService(customerDirectoryRepository as any);
    jest.clearAllMocks();
  });

  it('lists records with paging metadata', async () => {
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('creates, updates, finds, and removes records', async () => {
    await expect(service.create({ full_name: 'Sample' } as any)).resolves.toMatchObject({ id: '1' });
    await expect(service.update('1', { full_name: 'Updated' } as any)).resolves.toMatchObject({ id: '1' });
    await expect(service.findOne('1')).resolves.toMatchObject({ id: '1' });
    await expect(service.remove('1')).resolves.toBeUndefined();
  });

  it('throws conflict for duplicate customer_code', async () => {
    (customerDirectoryRepository.createQueryBuilder().getOne as jest.Mock).mockResolvedValueOnce({ id: '2' });

    await expect(service.create({ full_name: 'Sample', customer_code: 'KH001' } as any)).rejects.toThrow('customer_code already exists');
  });
});
