import { CustomersService } from './customers.service';

describe('CustomersService opening debt', () => {
  it('stores the opening debt and returns it as a number', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: '1' })),
    };
    const service = new CustomersService(repository as never);

    const result = await service.create({
      code: 'abc',
      name: 'Khach ABC',
      opening_debt: 1_500_000,
    });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ABC',
      opening_debt: '1500000',
    }));
    expect(result.opening_debt).toBe(1_500_000);
  });

  it('updates an existing opening debt without changing the customer code', async () => {
    const existing = { id: '1', code: 'ABC', name: 'Khach ABC', opening_debt: '0' };
    const repository = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (value) => value),
    };
    const service = new CustomersService(repository as never);

    const result = await service.update('1', { opening_debt: 2_750_000 });

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ABC',
      opening_debt: '2750000',
    }));
    expect(result.opening_debt).toBe(2_750_000);
  });
});
