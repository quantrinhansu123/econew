import type { WaybillInventoryItem } from './types';
import {
  formatInventoryDate,
  resolveBillingQtyDetail,
  resolveBillingUnit,
  resolveCongSg,
  resolveCustomerName,
  resolveMaKh,
  resolveNoiDen,
  resolveOrderStatusBadge,
  resolvePackageCountSl,
  resolvePaymentMethod,
  resolveReceiverAddress,
  resolveServiceType,
  resolveSurcharge,
  resolveTotalAmount,
  resolveUnitPrice,
} from './inventoryColumns';
import type { InventoryColumnId } from './inventoryColumns';

export type AllOrdersColumnFilters = Partial<Record<InventoryColumnId, string>>;

export type AllOrdersColumnFilterOption = {
  value: string;
  label: string;
  count: number;
};

const EMPTY_VALUE = '—';

export const ALL_ORDERS_FILTERABLE_COLUMN_IDS: InventoryColumnId[] = [
  'received_at',
  'customer_name',
  'ma_kh',
  'waybill_code',
  'cong_sg',
  'service_type',
  'noi_den',
  'receiver_address',
  'order_status',
  'package_count',
  'billing_unit',
  'billing_qty_detail',
  'unit_price',
  'surcharge',
  'total_amount',
  'thu_ho_khach',
  'payment_method',
  'customer_payment_status',
  'customer_payment_note',
];

const paymentStatusLabel = (waybill: WaybillInventoryItem) => {
  const status = String(waybill.customer_payment_status || '').toUpperCase();
  if (status === 'PAID') return 'Đã TT';
  if (status === 'SENT_STATEMENT') return 'Đã gửi bảng kê';
  return EMPTY_VALUE;
};

const moneyValue = (value: number | string | null | undefined, zeroIsEmpty = false) => {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE;
  const amount = Number(value);
  return Number.isFinite(amount) && (!zeroIsEmpty || amount !== 0) ? `${amount} đ` : EMPTY_VALUE;
};

export function getAllOrdersColumnValue(waybill: WaybillInventoryItem, columnId: InventoryColumnId): string {
  switch (columnId) {
    case 'received_at':
      return waybill.received_at || waybill.created_at
        ? formatInventoryDate(String(waybill.received_at || waybill.created_at))
        : EMPTY_VALUE;
    case 'customer_name':
      return resolveCustomerName(waybill);
    case 'ma_kh':
      return resolveMaKh(waybill);
    case 'waybill_code':
      return String(waybill.waybill_code || waybill.code || waybill.id || EMPTY_VALUE);
    case 'cong_sg':
      return resolveCongSg(waybill);
    case 'service_type':
      return resolveServiceType(waybill);
    case 'noi_den':
      return resolveNoiDen(waybill) || EMPTY_VALUE;
    case 'receiver_address':
      return resolveReceiverAddress(waybill) || EMPTY_VALUE;
    case 'order_status':
      return resolveOrderStatusBadge(waybill).label || EMPTY_VALUE;
    case 'package_count':
      return resolvePackageCountSl(waybill);
    case 'billing_unit':
      return resolveBillingUnit(waybill);
    case 'billing_qty_detail':
      return resolveBillingQtyDetail(waybill) || EMPTY_VALUE;
    case 'unit_price':
      return moneyValue(resolveUnitPrice(waybill), true);
    case 'surcharge':
      return moneyValue(resolveSurcharge(waybill));
    case 'total_amount':
      return moneyValue(resolveTotalAmount(waybill));
    case 'thu_ho_khach':
      return moneyValue(waybill.allocated_cod ?? waybill.cod_amount);
    case 'payment_method':
      return resolvePaymentMethod(waybill);
    case 'customer_payment_status':
      return paymentStatusLabel(waybill);
    case 'customer_payment_note':
      return waybill.customer_payment_note?.trim() || EMPTY_VALUE;
    default:
      return EMPTY_VALUE;
  }
}

const normalize = (value: string) => value.trim().toLocaleUpperCase('vi-VN');

export function applyAllOrdersColumnFilters(
  waybills: WaybillInventoryItem[],
  filters: AllOrdersColumnFilters,
): WaybillInventoryItem[] {
  const activeFilters = Object.entries(filters).filter((entry): entry is [InventoryColumnId, string] => Boolean(entry[1]));
  if (!activeFilters.length) return waybills;

  return waybills.filter((waybill) => activeFilters.every(
    ([columnId, expected]) => normalize(getAllOrdersColumnValue(waybill, columnId)) === normalize(expected),
  ));
}

export function buildAllOrdersColumnFilterOptions(
  waybills: WaybillInventoryItem[],
  columnId: InventoryColumnId,
): AllOrdersColumnFilterOption[] {
  if (!ALL_ORDERS_FILTERABLE_COLUMN_IDS.includes(columnId)) return [];

  const values = new Map<string, AllOrdersColumnFilterOption>();
  for (const waybill of waybills) {
    const value = getAllOrdersColumnValue(waybill, columnId);
    const key = normalize(value);
    const current = values.get(key);
    if (current) current.count += 1;
    else values.set(key, { value, label: value === EMPTY_VALUE ? '(Trống)' : value, count: 1 });
  }

  return [...values.values()].sort((left, right) => (
    left.label.localeCompare(right.label, 'vi', { numeric: true, sensitivity: 'base' })
  ));
}
