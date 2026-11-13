import { BadRequestException } from '@nestjs/common';
import { CustomerPaymentStatus } from '../common/enums';
import { resolveCustomerPaymentStatus } from './customer-payment-status';
import { WaybillsService } from './waybills.service';

describe('no-charge customer payment status', () => {
  it('keeps zero-priced pending orders separate from explicitly marked no-charge orders', () => {
    expect(resolveCustomerPaymentStatus(null, 0, 0)).toBeNull();
    expect(resolveCustomerPaymentStatus(CustomerPaymentStatus.NO_CHARGE, 0, 0)).toBe(CustomerPaymentStatus.NO_CHARGE);
    expect(resolveCustomerPaymentStatus(CustomerPaymentStatus.NO_CHARGE, 0, 1000)).toBe(CustomerPaymentStatus.NO_CHARGE);
  });

  it.each([
    [0, null], [50, CustomerPaymentStatus.PARTIAL], [100, CustomerPaymentStatus.PAID],
  ])('returns to the payment workflow if freight is added (paid %s)', (paid, expected) => {
    expect(resolveCustomerPaymentStatus(CustomerPaymentStatus.NO_CHARGE, 100, paid as number)).toBe(expected);
  });

  function setup(rows: any[]) {
    const service = Object.create(WaybillsService.prototype) as WaybillsService;
    const repository = { find: jest.fn(async () => rows), save: jest.fn(async (values) => values) };
    const audit = jest.fn(async () => {});
    Object.assign(service, { waybillsRepository: repository, recordWaybillChange: audit });
    return { service, repository, audit };
  }

  it('marks and unmarks an order without changing charges or creating a receipt', async () => {
    const row = { id: '9007199254740993', freight_amount: '0', cost_amount: '0', customer_payment_status: null };
    const { service, repository, audit } = setup([row]);
    const user = { id: '99', role_mask: 64 } as any;
    await service.bulkUpdateCustomerPaymentStatus({ waybill_ids: [row.id], status: CustomerPaymentStatus.NO_CHARGE }, user);
    expect(row).toMatchObject({ customer_payment_status: CustomerPaymentStatus.NO_CHARGE, freight_amount: '0', cost_amount: '0' });
    expect(audit).toHaveBeenCalledWith(row.id, 'UPDATED', user, undefined, undefined, {
      customer_payment_status: { old_value: null, new_value: CustomerPaymentStatus.NO_CHARGE },
    });
    await service.bulkUpdateCustomerPaymentStatus({ waybill_ids: [row.id], status: null }, user);
    expect(row.customer_payment_status).toBeNull();
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('rejects a charged order before marking any order in a bulk request', async () => {
    const rows = [
      { id: '1', freight_amount: '0', customer_payment_status: null },
      { id: '2', freight_amount: '100000', customer_payment_status: null },
    ];
    const { service, repository, audit } = setup(rows);
    await expect(service.bulkUpdateCustomerPaymentStatus({ waybill_ids: ['1', '2'], status: CustomerPaymentStatus.NO_CHARGE }, { id: '99' } as any))
      .rejects.toThrow(BadRequestException);
    expect(rows.every((row) => row.customer_payment_status === null)).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    ['update', 0, null],
    ['update', 50, CustomerPaymentStatus.PARTIAL],
    ['updateCodFee', 100, CustomerPaymentStatus.PAID],
  ])('recalculates a no-charge order when %s adds freight (paid %s)', async (method, paid, expected) => {
    const row = { id: '1', freight_amount: '0', cost_amount: '0', customer_payment_status: CustomerPaymentStatus.NO_CHARGE };
    const { service, repository } = setup([row]);
    const builder = {
      select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ net_paid: String(paid) })),
    };
    Object.assign(service, {
      findEditable: async () => row,
      findMutable: async () => row,
      buildAuditSnapshot: () => ({}),
      getCollectOnDeliveryAmount: () => 0,
      getStatus: () => 'IN_WAREHOUSE',
      sanitize: (value: unknown) => value,
      dataSource: { manager: { getRepository: () => ({ createQueryBuilder: () => builder }) } },
    });
    const user = { id: '99', role_mask: 64 } as any;
    const result = method === 'update'
      ? await service.update('1', { freight_amount: 100 }, user)
      : await service.updateCodFee('1', { freight_amount: 100 }, user);
    expect(result.customer_payment_status).toBe(expected);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ customer_payment_status: expected }));
  });
});
