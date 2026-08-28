import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryVendorsDto } from './query-vendors.dto';

describe('QueryVendorsDto', () => {
  it('transforms a valid query-string limit into an integer', async () => {
    const dto = plainToInstance(QueryVendorsDto, { page: '1', limit: '200' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(200);
  });

  it('still rejects limits above the supported maximum', async () => {
    const dto = plainToInstance(QueryVendorsDto, { limit: '501' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });
});
