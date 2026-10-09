import { describe, expect, it } from 'vitest';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import type { WaybillInventoryItem } from '../../inventory/types';
import { buildCustomerStatement, customerBillsQuery, buildPaidByWaybill, computeCustomerDebtSummary, computeVoucherMeta, filterBills, getBillFreight, resolvePaidForBill, scopeCashVouchersToBills } from './customerFinanceUtils';

describe('customer payment statement allocation', () => {
  const august = { fromDate: '2026-08-01', toDate: '2026-08-31', billCode: '', paymentType: '' as const };

  it('limits the statement, COD offset and debt to August bills using sent dates', () => {
    const bills: WaybillInventoryItem[] = [
      { id: '1', waybill_code: 'AUG-1', sent_date: '2026-08-01', created_at: '2026-09-01', freight_amount: 4_000_000 },
      { id: '2', waybill_code: 'AUG-2', sent_date: '2026-08-31', received_at: '2026-09-02', freight_amount: 4_115_200 },
      { id: '3', waybill_code: 'SEP-1', sent_date: '2026-09-01', created_at: '2026-08-03', freight_amount: 1_000_000 },
    ];
    const result = buildCustomerStatement(bills, [
      { id: 'p1', waybill_id: '1', voucher_type: 'Thu', source_type: 'MANUAL', amount: 1_000_000, created_at: '2026-10-09' },
      { id: 'p2', waybill_id: '2', voucher_type: 'Thu', source_type: 'COD_COLLECTION', amount: 500_000, created_at: '2026-09-01' },
      { id: 'p3', waybill_id: '3', voucher_type: 'Thu', source_type: 'COD_COLLECTION', amount: 3_920_000, created_at: '2026-08-31' },
      { id: 'old', voucher_type: 'Thu', source_type: 'OPENING_DEBT', amount: 200_000 },
    ], 5_000_000, august);
    expect(result.bills.map((b) => b.id)).toEqual(['1', '2']);
    expect(result.vouchers.map((v) => v.id)).toEqual(['p1', 'p2']);
    expect(result).toMatchObject({ count: 2, totalFreight: 8_115_200, totalPaid: 1_500_000, totalDebt: 6_615_200, openingDebt: 0 });
    expect(result.voucherMeta.cod_offset).toBe(500_000);
  });

  it('keeps inclusive bill date boundaries and legacy sent-date notes', () => {
    expect(filterBills([
      { id: '1', note: 'ngay_gui=2026-08-01', created_at: '2026-09-01' },
      { id: '2', sent_date: '2026-08-31' },
      { id: '3', sent_date: '2026-07-31' },
      { id: '4', sent_date: '2026-09-01' },
    ], august).map((b) => b.id)).toEqual(['1', '2']);
  });

  it('does not use a copied bill code when the voucher has a different waybill id', () => {
    const bills = [{ id: '1', waybill_code: 'AUG-1' }];
    expect(scopeCashVouchersToBills([
      { id: 'wrong', waybill_id: '2', waybill_code: 'AUG-1', voucher_type: 'Thu', amount: 50 },
      { id: 'legacy', waybill_code: 'aug-1', voucher_type: 'Thu', amount: 20 },
    ], bills).map((v) => v.id)).toEqual(['legacy']);
  });

  it('excludes unrelated money when the bill filter has no matches', () => {
    const result = buildCustomerStatement([{ id: '3', sent_date: '2026-09-01', freight_amount: 100 }], [
      { id: 'cod', waybill_id: '3', voucher_type: 'Thu', source_type: 'COD_COLLECTION', amount: 1000 },
    ], 400, august);
    expect(result).toMatchObject({ count: 0, totalFreight: 0, totalPaid: 0, totalDebt: 0 });
    expect(result.vouchers).toEqual([]);
  });

  it('includes opening debt only for an unrestricted customer statement', () => {
    const filters = { ...august, fromDate: '', toDate: '' };
    expect(buildCustomerStatement([], [], 500, filters).totalDebt).toBe(500);
    expect(buildCustomerStatement([], [], 500, filters, false).totalDebt).toBe(0);
  });

  it('preserves source inventory filters and paginates with the API maximum', () => {
    const params = new URLSearchParams(customerBillsQuery('TANLB', 3, {
      query: 'sent_from=2026-08-01&sent_to=2026-08-31&keyword=LB&dest_hub_id=2&customer_payment_status=PAID&ma_kh=WRONG&page=7&limit=25&list_scope=all_orders',
      columnFilters: {},
    }));
    expect(Object.fromEntries(params)).toEqual({ sent_from: '2026-08-01', sent_to: '2026-08-31', keyword: 'LB', dest_hub_id: '2', customer_payment_status: 'PAID', ma_kh: 'TANLB', page: '3', limit: '100', list_scope: 'all_orders' });
  });

  it('changes only the inherited date range when the reconciliation period is edited', () => {
    const scope = { query: 'sent_from=2026-08-01&sent_to=2026-08-31&keyword=LB&list_scope=all_orders', columnFilters: {} };
    const params = new URLSearchParams(customerBillsQuery('TANLB', 1, scope, { fromDate: '2026-09-01', toDate: '2026-09-30' }));
    expect(params.get('sent_from')).toBe('2026-09-01');
    expect(params.get('sent_to')).toBe('2026-09-30');
    expect(params.get('keyword')).toBe('LB');
    const cleared = new URLSearchParams(customerBillsQuery('TANLB', 1, scope, { fromDate: '', toDate: '' }));
    expect(cleared.has('sent_from')).toBe(false);
    expect(cleared.has('sent_to')).toBe(false);
    expect(cleared.get('keyword')).toBe('LB');
  });
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
      openingDebtPaid: 0,
      openingDebtRemaining: 8_000_000,
      totalFreight: 7_000_000,
      totalPaid: 1_500_000,
      totalDebt: 13_500_000,
      count: 2,
    });
  });

  it('subtracts opening-debt receipts without assigning them to a bill', () => {
    const paidMaps = buildPaidByWaybill([{
      id: 'opening-1',
      voucher_type: 'Thu',
      source_type: 'OPENING_DEBT',
      amount: 1_800_000,
    }]);

    expect(computeCustomerDebtSummary([], paidMaps, 3_000_000)).toEqual({
      openingDebt: 3_000_000,
      openingDebtPaid: 1_800_000,
      openingDebtRemaining: 1_200_000,
      totalFreight: 0,
      totalPaid: 0,
      totalDebt: 1_200_000,
      count: 0,
    });
  });

  it('separates automatic COD offset from customer payment and payout', () => {
    const vouchers: WaybillCashVoucher[] = [
      { id: 'cod', waybill_id: '76', voucher_type: 'Thu', source_type: 'COD_COLLECTION', amount: 1_057_000 },
      { id: 'manual', waybill_id: '76', voucher_type: 'Thu', source_type: 'MANUAL', amount: 200_000 },
      { id: 'payout', waybill_id: '76', voucher_type: 'Chi', source_type: 'CUSTOMER_PAYOUT', amount: 500_000 },
    ];
    const paidMaps = buildPaidByWaybill(vouchers);
    const bill = { id: '76', customer_payment_due_amount: 757_000 } as WaybillInventoryItem;

    expect(computeVoucherMeta(vouchers)).toEqual({
      total: 3,
      total_thu: 1_257_000,
      total_chi: 500_000,
      manual_thu: 200_000,
      cod_offset: 1_057_000,
      customer_payout: 500_000,
      net: 757_000,
    });
    expect(computeCustomerDebtSummary([bill], paidMaps, 0).totalDebt).toBe(0);
  });
});
