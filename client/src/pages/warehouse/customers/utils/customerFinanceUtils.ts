import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import type { WaybillInventoryItem } from '../../inventory/types';
import type { CashVoucherFilters, CashVoucherMeta } from '../panels/CustomerCashVouchersPanel';
import { formatMoney as formatSharedMoney } from '../../../../lib/formatMoney';
import { resolveLoadedAt } from '../../inventory/inventoryColumns';
import type { AllOrdersColumnFilters } from '../../inventory/allOrdersColumnFilters';

export interface CustomerBillScope {
  query: string;
  columnFilters: AllOrdersColumnFilters;
}

export function customerBillsQuery(customerCode: string, page: number, scope?: CustomerBillScope, period?: Pick<BillFilters, 'fromDate' | 'toDate'>) {
  const params = new URLSearchParams(scope?.query);
  if (period) {
    if (period.fromDate) params.set('sent_from', period.fromDate); else params.delete('sent_from');
    if (period.toDate) params.set('sent_to', period.toDate); else params.delete('sent_to');
  }
  params.set('ma_kh', customerCode);
  if (!params.has('list_scope')) params.set('list_scope', 'all_orders');
  params.set('limit', '100');
  params.set('page', String(page));
  return params.toString();
}

export const formatMoney = (value?: number | string | null, empty = '—') =>
  formatSharedMoney(value, { empty });

export interface BillFilters {
  fromDate: string;
  toDate: string;
  billCode: string;
  paymentType: '' | 'PP' | 'CC' | 'COD';
}

export interface PaidByWaybillMaps {
  byWaybillId: Map<string, number>;
  byBillCode: Map<string, number>;
  openingDebtPaid: number;
}

export function isDateInRange(value: string | null | undefined, fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return true;
  if (!value) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`);
    from.setHours(0, 0, 0, 0);
    if (date < from) return false;
  }
  if (toDate) {
    const to = new Date(`${toDate}T00:00:00`);
    to.setHours(23, 59, 59, 999);
    if (date > to) return false;
  }
  return true;
}

export function filterCashVouchers(vouchers: WaybillCashVoucher[], filters: CashVoucherFilters) {
  return vouchers.filter((voucher) => {
    if (filters.voucherType && String(voucher.voucher_type) !== filters.voucherType) return false;
    return isDateInRange(voucher.created_at, filters.fromDate, filters.toDate);
  });
}

export function computeVoucherMeta(vouchers: WaybillCashVoucher[]): CashVoucherMeta {
  let totalThu = 0;
  let totalChi = 0;
  let codOffset = 0;
  let customerPayout = 0;
  for (const voucher of vouchers) {
    const amount = Number(voucher.amount) || 0;
    if (String(voucher.voucher_type).toLowerCase() === 'thu') {
      totalThu += amount;
      if (voucher.source_type === 'COD_COLLECTION') codOffset += amount;
    }
    else if (String(voucher.voucher_type).toLowerCase() === 'chi') {
      totalChi += amount;
      if (voucher.source_type === 'CUSTOMER_PAYOUT') customerPayout += amount;
    }
  }
  return {
    total: vouchers.length,
    total_thu: totalThu,
    total_chi: totalChi,
    manual_thu: totalThu - codOffset,
    cod_offset: codOffset,
    customer_payout: customerPayout,
    net: totalThu - totalChi,
  };
}

export function buildPaidByWaybill(vouchers: WaybillCashVoucher[]): PaidByWaybillMaps {
  const byWaybillId = new Map<string, number>();
  const byBillCode = new Map<string, number>();
  let openingDebtPaid = 0;

  for (const voucher of vouchers) {
    const amount = Number(voucher.amount) || 0;
    const delta = String(voucher.voucher_type).toLowerCase() === 'thu' ? amount : -amount;
    if (voucher.source_type === 'OPENING_DEBT') {
      openingDebtPaid += delta;
      continue;
    }
    if (voucher.waybill_id != null) {
      const key = String(voucher.waybill_id);
      byWaybillId.set(key, (byWaybillId.get(key) ?? 0) + delta);
    } else if (voucher.waybill_code) {
      const code = String(voucher.waybill_code).trim().toUpperCase();
      byBillCode.set(code, (byBillCode.get(code) ?? 0) + delta);
    }
  }

  return { byWaybillId, byBillCode, openingDebtPaid };
}

export function resolvePaidForBill(item: WaybillInventoryItem, maps: PaidByWaybillMaps) {
  const idKey = String(item.id);
  if (maps.byWaybillId.has(idKey)) return maps.byWaybillId.get(idKey)!;
  const code = (item.waybill_code || item.order_code || '').trim().toUpperCase();
  return code ? (maps.byBillCode.get(code) ?? 0) : 0;
}

export function getBillFreight(item: WaybillInventoryItem) {
  return Number(item.customer_payment_due_amount ?? item.freight_amount ?? item.cost_amount ?? 0) || 0;
}

export function computeCustomerDebtSummary(
  items: WaybillInventoryItem[],
  paidMaps: PaidByWaybillMaps,
  openingDebt: number | string | null | undefined,
  includePayments = true,
) {
  let totalFreight = 0;
  let totalPaid = 0;
  for (const item of items) {
    totalFreight += getBillFreight(item);
    if (includePayments) totalPaid += resolvePaidForBill(item, paidMaps);
  }
  const normalizedOpeningDebt = Math.max(0, Number(openingDebt) || 0);
  const openingDebtPaid = Math.max(0, paidMaps.openingDebtPaid || 0);
  const openingDebtRemaining = Math.max(0, normalizedOpeningDebt - openingDebtPaid);
  return {
    openingDebt: normalizedOpeningDebt,
    openingDebtPaid,
    openingDebtRemaining,
    totalFreight,
    totalPaid,
    totalDebt: openingDebtRemaining + totalFreight - totalPaid,
    count: items.length,
  };
}

export function filterBills(items: WaybillInventoryItem[], filters: BillFilters) {
  const billKeyword = filters.billCode.trim().toUpperCase();
  return items.filter((item) => {
    if (!isDateInRange(resolveLoadedAt(item), filters.fromDate, filters.toDate)) return false;
    if (filters.paymentType && String(item.payment_type || '').toUpperCase() !== filters.paymentType) return false;
    if (billKeyword) {
      const code = (item.waybill_code || item.order_code || String(item.id)).toUpperCase();
      if (!code.includes(billKeyword)) return false;
    }
    return true;
  });
}

export function hasBillFilters(filters: BillFilters) {
  return Boolean(filters.fromDate || filters.toDate || filters.billCode.trim() || filters.paymentType);
}

export function scopeCashVouchersToBills(vouchers: WaybillCashVoucher[], items: WaybillInventoryItem[], includeOpeningDebt = false) {
  const ids = new Set(items.map((item) => String(item.id)));
  const codes = new Set(items.map((item) => (item.waybill_code || item.order_code || '').trim().toUpperCase()).filter(Boolean));
  return vouchers.filter((voucher) => {
    if (voucher.source_type === 'OPENING_DEBT') return includeOpeningDebt;
    if (voucher.waybill_id != null) return ids.has(String(voucher.waybill_id));
    return Boolean(voucher.waybill_code && codes.has(voucher.waybill_code.trim().toUpperCase()));
  });
}

export function buildCustomerStatement(
  items: WaybillInventoryItem[], vouchers: WaybillCashVoucher[],
  openingDebt: number | string | null | undefined, filters: BillFilters, includeOpeningDebt = true,
) {
  const bills = filterBills(items, filters);
  const includeDebt = includeOpeningDebt && !hasBillFilters(filters);
  const scopedVouchers = scopeCashVouchersToBills(vouchers, bills, includeDebt);
  const paidMaps = buildPaidByWaybill(scopedVouchers);
  return {
    bills, vouchers: scopedVouchers, paidMaps, voucherMeta: computeVoucherMeta(scopedVouchers),
    ...computeCustomerDebtSummary(bills, paidMaps, includeDebt ? openingDebt : 0),
  };
}
