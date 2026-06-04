import { CarrierDirectoryService } from './carrier-directory.service';

const createQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(async () => [[{ id: '1', region: 'Sample' }], 1]),
  getOne: jest.fn(async () => null),
});

const createRepository = () => {
  const qb = createQueryBuilder();
  return {
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : { id: where.id, region: 'Sample' })),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('CarrierDirectoryService', () => {
  let service: CarrierDirectoryService;
  let carrierDirectoryRepository: ReturnType<typeof createRepository>;

  beforeEach(() => {
    carrierDirectoryRepository = createRepository();
    service = new CarrierDirectoryService(carrierDirectoryRepository as any);
    jest.clearAllMocks();
  });

  it('lists records with paging metadata', async () => {
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('creates, updates, finds, and removes records', async () => {
    await expect(service.create({ region: 'Sample' } as any)).resolves.toMatchObject({ id: '1' });
    await expect(service.update('1', { region: 'Updated' } as any)).resolves.toMatchObject({ id: '1' });
    await expect(service.findOne('1')).resolves.toMatchObject({ id: '1' });
    await expect(service.remove('1')).resolves.toBeUndefined();
  });
});
