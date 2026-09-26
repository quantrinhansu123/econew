import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CustomerPaymentStatus } from '../common/enums';
import { Roles } from '../common/roles';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillCashVoucherEntity } from './waybill-cash-voucher.entity';
import { WaybillChangeLogEntity } from './waybill-change-log.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillsService } from './waybills.service';

describe('WaybillsService cash voucher sync', () => {
  const currentUser = { id: '9', username: 'accountant', role_mask: Roles.MANAGER } as UserEntity;

  function setup(sourceType: WaybillCashVoucherEntity['source_type'] = 'MANUAL') {
    const voucher = {
      id: '10', waybill_id: '77', waybill_code: 'ECOHAN77', source_type: sourceType,
      voucher_type: 'Thu', amount: '36486662000', fund_id: '3',
    } as WaybillCashVoucherEntity;
    const otherVoucher = {
      id: '11', waybill_id: '77', voucher_type: 'Thu', amount: '500000', fund_id: '3',
    } as WaybillCashVoucherEntity;
    const waybill = {
      id: '77', waybill_code: 'ECOHAN77', freight_amount: '1500000', cost_amount: '1500000',
      cod_amount: '0', cc_amount: '0', customer_payment_status: null, cod_reconciled_at: null,
    } as WaybillEntity;
    const builder = {
      select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ net_paid: String(Number(voucher.amount) + 500000) })),
    };
    const voucherRepository = {
      findOne: jest.fn(async () => voucher),
      find: jest.fn(async () => [voucher, otherVoucher]),
      save: jest.fn(async (record) => record),
      createQueryBuilder: jest.fn(() => builder),
    };
    const waybillRepository = {
      findOne: jest.fn(async () => waybill),
      save: jest.fn(async (record) => record),
    };
    const logRepository = {
      create: jest.fn((record) => record),
      save: jest.fn(async (record) => record),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === WaybillCashVoucherEntity) return voucherRepository;
        if (entity === WaybillEntity) return waybillRepository;
        if (entity === CashFundEntity) return { findOne: async () => ({ id: '3', name: 'Quỹ HAN', hub_id: null }) };
        if (entity === WaybillChangeLogEntity) return logRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    } as unknown as EntityManager;
    const dataSource = {
      manager,
      transaction: jest.fn(async (callback: (transactionManager: EntityManager) => unknown) => callback(manager)),
    } as unknown as DataSource;
    const service = Object.create(WaybillsService.prototype) as WaybillsService;
    Object.assign(service, { dataSource });
    return { service, voucher, waybill, voucherRepository, waybillRepository, logRepository };
  }

  it('updates the receipt, payment status and audit while accounting for other receipts', async () => {
    const { service, voucher, waybill, voucherRepository, waybillRepository, logRepository } = setup();
    const preview = await service.previewCashVoucherSync('10', currentUser);
    expect(preview).toMatchObject({ current_amount: 36486662000, new_amount: 1000000, other_paid: 500000 });

    await service.syncCashVoucherWithWaybill('10', { expected_amount: preview.new_amount, expected_current_amount: preview.current_amount }, currentUser);

    expect(voucher.amount).toBe('1000000');
    expect(voucherRepository.save).toHaveBeenCalledWith(voucher);
    expect(waybill.customer_payment_status).toBe(CustomerPaymentStatus.PAID);
    expect(waybillRepository.save).toHaveBeenCalledWith(waybill);
    expect(logRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CASH_VOUCHER_SYNCED',
      changes: expect.objectContaining({ cash_voucher_amount: { old_value: 36486662000, new_value: 1000000 } }),
    }));
  });

  it('rejects automatic COD collection receipts', async () => {
    const { service } = setup('COD_COLLECTION');
    await expect(service.previewCashVoucherSync('10', currentUser)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a stale confirmation before changing the receipt', async () => {
    const { service, voucherRepository } = setup();
    await expect(service.syncCashVoucherWithWaybill('10', { expected_amount: 1200000, expected_current_amount: 36486662000 }, currentUser))
      .rejects.toBeInstanceOf(ConflictException);
    expect(voucherRepository.save).not.toHaveBeenCalled();
  });
});
