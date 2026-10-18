import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EstimateDeliveryDistanceDto } from './estimate-delivery-distance.dto';

describe('EstimateDeliveryDistanceDto', () => {
  it('trims the delivery address', async () => {
    const dto = plainToInstance(EstimateDeliveryDistanceDto, { dest_hub_id: '2', receiver_address: '  123 Nguyễn Huệ  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.receiver_address).toBe('123 Nguyễn Huệ');
  });

  it.each([
    { dest_hub_id: '0', receiver_address: '123 Nguyễn Huệ' },
    { dest_hub_id: '2; DROP TABLE hubs', receiver_address: '123 Nguyễn Huệ' },
    { dest_hub_id: '2', receiver_address: '    ' },
    { dest_hub_id: '2', receiver_address: 'a'.repeat(501) },
    { dest_hub_id: '2', receiver_address: { malicious: true } },
  ])('rejects invalid input: %o', async (input) => {
    expect((await validate(plainToInstance(EstimateDeliveryDistanceDto, input))).length).toBeGreaterThan(0);
  });

  it('rejects client attempts to enable expensive features or change the limit', async () => {
    const dto = plainToInstance(EstimateDeliveryDistanceDto, {
      dest_hub_id: '2', receiver_address: '123 Nguyễn Huệ', routingPreference: 'TRAFFIC_AWARE', limit: 100_000,
    });
    expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length).toBe(2);
  });

  it('accepts coordinate-only input without requiring an address', async () => {
    const dto = plainToInstance(EstimateDeliveryDistanceDto, { dest_hub_id: '2', receiver_coordinates: '10.7,106.6' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('does not accept an absent address and empty coordinates', async () => {
    const dto = plainToInstance(EstimateDeliveryDistanceDto, { dest_hub_id: '2', receiver_coordinates: '  ' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
