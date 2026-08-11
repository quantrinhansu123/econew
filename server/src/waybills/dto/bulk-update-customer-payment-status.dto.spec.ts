import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerPaymentStatus } from '../../common/enums';
import { BulkUpdateCustomerPaymentStatusDto } from './bulk-update-customer-payment-status.dto';

describe('BulkUpdateCustomerPaymentStatusDto', () => {
  it('keeps bigint waybill ids as exact strings', async () => {
    const waybillId = '9007199254740993';
    const dto = plainToInstance(BulkUpdateCustomerPaymentStatusDto, {
      waybill_ids: [waybillId],
      status: CustomerPaymentStatus.PAID,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.waybill_ids).toEqual([waybillId]);
  });
});
