import type { WaybillInventoryItem } from './types';
import {
  formatInventoryDate,
  resolveBillingQtyDetail,
  resolveBillingUnit,
  resolveCongSg,
  resolveCustomerName,
  resolveDeliveryStaff,
  resolveDeliveryProcessingSummary,
  resolveMaKh,
  resolveNoiDen,
  resolveOrderStatusBadge,
  resolveWarehouseIntakePresentation,
  resolveInventoryTripHistoryText,
  resolvePackageCountSl,
  resolvePaymentMethod,
  resolveReceiverAddress,
  resolveReceiverPhone,
  resolveRoute,
  resolveServiceType,
  resolveSurcharge,
  resolveTotalAmount,
  resolveUnitPrice,
  resolveUserNote,
  resolveVolumetricWeightKg,
  resolveVolumeM3,
  resolveWeightKg,
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
  'warehouse_intake',
  'delivery_processing',
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
  'stack_position',
  'loaded_at',
  'trip_label',
  'delivery_staff',
  'user_note',
  'route',
  'receiver_phone',
  'weight',
  'volumetric_weight',
  'volume',
  'current_hub',
  'dest_hub',
  'payment_type',
  'cod_amount',
  'priority',
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
      return waybill.sent_date
        ? formatInventoryDate(String(waybill.sent_date))
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
    case 'warehouse_intake': {
      const intake = resolveWarehouseIntakePresentation(waybill);
      return [intake.title, intake.detail, intake.note].filter(Boolean).join(' · ') || EMPTY_VALUE;
    }
    case 'delivery_processing':
      return resolveDeliveryProcessingSummary(waybill) || EMPTY_VALUE;
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
    case 'stack_position':
      return String(waybill.loading_position ?? EMPTY_VALUE);
    case 'loaded_at':
      return waybill.loaded_at ? formatInventoryDate(String(waybill.loaded_at)) : EMPTY_VALUE;
    case 'trip_label':
      return resolveInventoryTripHistoryText(waybill) || EMPTY_VALUE;
    case 'delivery_staff':
      return resolveDeliveryStaff(waybill);
    case 'user_note':
      return resolveUserNote(waybill) || EMPTY_VALUE;
    case 'route':
      return resolveRoute(waybill) || EMPTY_VALUE;
    case 'receiver_phone':
      return resolveReceiverPhone(waybill) || EMPTY_VALUE;
    case 'weight':
      return `${resolveWeightKg(waybill)} kg`;
    case 'volumetric_weight':
      return `${resolveVolumetricWeightKg(waybill)} kg`;
    case 'volume':
      return `${resolveVolumeM3(waybill)} m3`;
    case 'current_hub':
      return [waybill.current_hub?.code, waybill.current_hub?.name].filter(Boolean).join(' · ') || EMPTY_VALUE;
    case 'dest_hub':
      return [waybill.dest_hub?.code, waybill.dest_hub?.name].filter(Boolean).join(' · ') || EMPTY_VALUE;
    case 'payment_type':
      return String(waybill.payment_type || EMPTY_VALUE);
    case 'cod_amount':
      return moneyValue(waybill.allocated_cod ?? waybill.cod_amount);
    case 'priority':
      return String(waybill.priority || EMPTY_VALUE);
    default:
      return EMPTY_VALUE;
  }
}

const normalize = (value: string) => value.trim().toLocaleUpperCase('vi-VN');

const normalizeSearchText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN')
  .replace(/\s+/g, ' ')
  .trim();

const compactSearchText = (value: string) => value.replace(/[^a-z0-9]/g, '');

const SEARCH_IGNORED_FIELD = /(image|photo|url|token|password)/i;

function collectSearchableValues(value: unknown, values: string[], depth = 0, fieldName = ''): void {
  if (value === null || value === undefined || depth > 3 || SEARCH_IGNORED_FIELD.test(fieldName)) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    values.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchableValues(item, values, depth + 1, fieldName));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      collectSearchableValues(item, values, depth + 1, key);
    });
  }
}

export function applyAllOrdersGlobalSearch(
  waybills: WaybillInventoryItem[],
  keyword: string,
): WaybillInventoryItem[] {
  const query = normalizeSearchText(keyword);
  if (!query) return waybills;
  const compactQuery = compactSearchText(query);

  return waybills.filter((waybill) => {
    const values: string[] = [];
    collectSearchableValues(waybill, values);
    return values.some((value) => {
      const normalizedValue = normalizeSearchText(value);
      if (normalizedValue.includes(query)) return true;
      return compactQuery.length >= 2 && compactSearchText(normalizedValue).includes(compactQuery);
    });
  });
}

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
