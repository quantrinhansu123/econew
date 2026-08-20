import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';

const createQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn(async () => []),
  getOne: jest.fn(async (): Promise<any> => null),
});

const createRepository = () => {
  const queryBuilder = createQueryBuilder();
  return {
    queryBuilder,
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : {
      id: where.id,
      name: 'Cầu đường',
      description: null,
      is_active: true,
      sort_order: 10,
    })),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};

describe('ExpenseCategoriesService', () => {
  it('normalizes and creates a reusable category', async () => {
    const repository = createRepository();
    const service = new ExpenseCategoriesService(repository as any);

    await expect(service.create({ name: '  Phí   cầu đường  ', sort_order: 20 }, { id: '9' } as any))
      .resolves.toMatchObject({ name: 'Phí cầu đường', sort_order: 20, created_by: '9' });
  });

  it('rejects a duplicate category name', async () => {
    const repository = createRepository();
    repository.queryBuilder.getOne.mockResolvedValueOnce({ id: '2' });
    const service = new ExpenseCategoriesService(repository as any);

    await expect(service.create({ name: 'Cầu đường' }, { id: '9' } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivates categories without deleting historical references', async () => {
    const repository = createRepository();
    const service = new ExpenseCategoriesService(repository as any);

    await expect(service.remove('1')).resolves.toMatchObject({ id: '1', is_active: false });
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
