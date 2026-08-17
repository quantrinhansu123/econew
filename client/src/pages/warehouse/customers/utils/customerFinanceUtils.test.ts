import { describe, expect, it } from 'vitest';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import type { WaybillInventoryItem } from '../../inventory/types';
import { buildPaidByWaybill, computeCustomerDebtSummary, getBillFreight, resolvePaidForBill } from './customerFinanceUtils';

describe('customer payment statement allocation', () => {
  it('allocates a receipt only to its exact waybill id, even if a copied bill code is stale', () => {
    const bills: WaybillInventoryItem[] = [
      { id: '76', waybill_code: 'ECOHAN109076' },
      { id: '92', waybill_code: 'ECOHAN109092' },
    ];
    const vouchers: WaybillCashVoucher[] = [{
      id: 'voucher-1',
      waybill_id: '76',
      waybill_code: 'ECOHAN109092',
      voucher_type: 'Thu',
      amount: 8_400_000,
    }];

    const paidMaps = buildPaidByWaybill(vouchers);

    expect(resolvePaidForBill(bills[0], paidMaps)).toBe(8_400_000);
    expect(resolvePaidForBill(bills[1], paidMaps)).toBe(0);
  });

  it('uses the payment-only due amount when pricing fields are hidden for an accountant', () => {
    const bill: WaybillInventoryItem = {
      id: '76',
      waybill_code: 'ECOHAN109076',
      customer_payment_due_amount: 8_400_000,
    };

    expect(getBillFreight(bill)).toBe(8_400_000);
  });

  it('keeps separate payment totals for every selected bill', () => {
    const bills: WaybillInventoryItem[] = [
      { id: '76', waybill_code: 'ECOHAN109076' },
      { id: '92', waybill_code: 'ECOHAN109092' },
    ];
    const paidMaps = buildPaidByWaybill([
      { id: 'p1', waybill_id: '76', waybill_code: 'ECOHAN109076', voucher_type: 'Thu', amount: 2_000_000 },
      { id: 'p2', waybill_id: '92', waybill_code: 'ECOHAN109092', voucher_type: 'Thu', amount: 3_500_000 },
    ]);

    expect(resolvePaidForBill(bills[0], paidMaps)).toBe(2_000_000);
    expect(resolvePaidForBill(bills[1], paidMaps)).toBe(3_500_000);
  });

  it('adds the customer opening debt exactly once to the current debt', () => {
    const bills: WaybillInventoryItem[] = [
      { id: '76', waybill_code: 'ECOHAN109076', customer_payment_due_amount: 4_000_000 },
      { id: '92', waybill_code: 'ECOHAN109092', customer_payment_due_amount: 3_000_000 },
    ];
    const paidMaps = buildPaidByWaybill([
      { id: 'p1', waybill_id: '76', waybill_code: 'ECOHAN109076', voucher_type: 'Thu', amount: 1_500_000 },
    ]);

    expect(computeCustomerDebtSummary(bills, paidMaps, 8_000_000)).toEqual({
      openingDebt: 8_000_000,
      totalFreight: 7_000_000,
      totalPaid: 1_500_000,
      totalDebt: 13_500_000,
      count: 2,
    });
  });
});
