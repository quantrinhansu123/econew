import { validate } from 'class-validator';
import { CreateWaybillDto } from './create-waybill.dto';

describe('CreateWaybillDto', () => {
  it('accepts a waybill without a customer phone', async () => {
    const dto = Object.assign(new CreateWaybillDto(), {
      waybill_code: 'ECOHAN1',
      sender_name: 'Khách gửi',
      sender_address: 'Hà Nội',
      receiver_name: 'Khách nhận',
      receiver_phone: '0901234567',
      receiver_address: 'TP.HCM',
      origin_hub_id: '1',
      dest_hub_id: '2',
      weight: 1,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
