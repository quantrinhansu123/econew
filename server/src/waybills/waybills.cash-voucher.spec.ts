import { DataSource, EntityManager, Repository } from 'typeorm';
import { CustomerPaymentStatus, PaymentType } from '../common/enums';
import { Roles } from '../common/roles';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillsService } from './waybills.service';

describe('WaybillsService cash voucher reconciliation', () => {
  it.each([
    { label: 'CC', paymentType: PaymentType.CC, freight: 850000, cc: 850000, cod: 0, collection: 850000 },
    { label: 'COD', paymentType: PaymentType.COD, freight: 400000, cc: 0, cod: 1000000, collection: 1000000 },
  ])('marks a $label waybill reconciled when its full collection is recorded in a cash fund', async ({ paymentType, freight, cc, cod, collection }) => {
    const waybill = {
      id: '77',
      waybill_code: 'ECOHAN77',
      origin_hub_id: '1',
      dest_hub_id: '2',
      payment_type: paymentType,
      freight_amount: String(freight),
      cost_amount: String(freight),
      cc_amount: String(cc),
      cod_amount: String(cod),
      customer_payment_status: null,
      cod_reconciled_at: null,
      cod_reconciled_by: null,
      cod_fund_id: null,
      cod_collected_amount: '0',
    } as unknown as WaybillEntity;
    const currentUser = {
      id: '9',
      username: 'accountant',
      full_name: 'Kế toán',
      role_mask: Roles.MANAGER,
    } as UserEntity;

    const rawTotals = [{ net_paid: '0' }, { net_paid: String(collection) }];
    const voucherRepository = {
      createQueryBuilder: jest.fn(() => {
        const builder = {
          select: jest.fn(),
          where: jest.fn(),
          andWhere: jest.fn(),
          getRawOne: jest.fn(),
        };
        builder.select.mockReturnValue(builder);
        builder.where.mockReturnValue(builder);
        builder.andWhere.mockReturnValue(builder);
        builder.getRawOne.mockResolvedValue(rawTotals.shift());
        return builder;
      }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: '101', ...value })),
    } as unknown as Repository<WaybillCashVoucherEntity>;
    const transactionalWaybillRepository = {
      save: jest.fn(async (value) => value),
    } as unknown as Repository<WaybillEntity>;
    const fundRepository = {
      findOne: jest.fn(async () => ({ id: '3', is_active: true, hub_id: null })),
    } as unknown as Repository<CashFundEntity>;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === WaybillCashVoucherEntity) return voucherRepository;
        if (entity === WaybillEntity) return transactionalWaybillRepository;
        if (entity === CashFundEntity) return fundRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (callback: (transactionManager: EntityManager) => unknown) => callback(manager)),
    } as unknown as DataSource;
    const rootWaybillRepository = {
      findOne: jest.fn(async () => waybill),
    } as unknown as Repository<WaybillEntity>;
    const service = new WaybillsService(
      rootWaybillRepository,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      dataSource,
      null as never,
      null as never,
    );

    const result = await service.createCashVoucher('77', {
      waybill_code: 'ECOHAN77',
      voucher_type: 'Thu',
      amount: collection,
      fund_id: '3',
    }, currentUser);

    expect(result.customer_payment_status).toBe(CustomerPaymentStatus.PAID);
    expect(waybill.cod_reconciled_at).toBeInstanceOf(Date);
    expect(waybill.cod_reconciled_by).toBe('9');
    expect(waybill.cod_fund_id).toBe('3');
    expect(waybill.cod_collected_amount).toBe(String(collection));
    expect(transactionalWaybillRepository.save).toHaveBeenCalledWith(waybill);
  });
});
