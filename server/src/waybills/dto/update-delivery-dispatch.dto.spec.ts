import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateDeliveryDispatchDto } from './update-delivery-dispatch.dto';

describe('UpdateDeliveryDispatchDto', () => {
  const errors = (input: object) => validateSync(plainToInstance(UpdateDeliveryDispatchDto, input));
  const valid = { assignment_type: 'TECHNOLOGY', driver_name: 'Grab', delivery_cost: 150000, expected_version: 0 };

  it('accepts plans and converts numeric form values', () => {
    expect(errors({ ...valid, delivery_cost: '150000', expected_version: '2', scheduled_at: '2026-10-30T08:00:00Z' })).toHaveLength(0);
  });
  it.each([
    { assignment_type: 'CUSTOMER_PICKUP' }, { expected_version: -1 }, { expected_version: 1.5 }, { expected_version: undefined },
    { delivery_cost: -1 }, { delivery_cost: 'not money' }, { note: 'x'.repeat(501) }, { scheduled_at: 'not a date' },
  ])('rejects invalid dispatch data: %o', change => {
    expect(errors({ ...valid, ...change }).length).toBeGreaterThan(0);
  });
});
