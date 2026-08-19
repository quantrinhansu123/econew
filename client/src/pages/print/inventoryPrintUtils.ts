import type { InventoryColumnId } from '../warehouse/inventory/inventoryColumns';
import {
  INVENTORY_COLUMNS,
  computeGrandTotals,
  formatInventoryDate,
  resolveBillingQtyDetail,
  resolveCompletionDate,
  resolveCongSg,
  resolveDeliveryStaff,
  resolveDeliveryProcessingSummary,
  resolveFreight,
  resolveCustomerName,
  resolveServiceType,
  resolveBillingUnit,
  resolveUnitPrice,
  resolveTransitFee,
  resolvePaymentMethod,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveRoute,
  resolveReceiverAddress,
  resolveReceiverDistrict,
  resolveReceiverPhone,
  resolveReceiverWard,
  resolvePrintColumnIds,
  resolveOrderStatusBadge,
  resolveWarehouseIntakePresentation,
  resolveInventoryTripHistoryText,
  resolveSurcharge,
  resolveUserNote,
  resolveVolumeM3,
  resolveVolumetricWeightKg,
  resolveWeightKg,
} from '../warehouse/inventory/inventoryColumns';
import type { InventoryFilters, WaybillInventoryItem } from '../warehouse/inventory/types';
import { parseWaybillImages } from '../../lib/waybillImages';

export const INVENTORY_PRINT_STORAGE_KEY = 'eco_inventory_print_v1';

export interface InventoryPrintColumn {
  id: InventoryColumnId;
  label: string;
}

export interface InventoryPrintPayload {
  title?: string;
  printedAt: string;
  filterSummary: string;
  showPricing: boolean;
  columns: InventoryPrintColumn[];
  rows: Record<string, string>[];
  totals: {
    package_count: string;
    weight_kg: string;
    volumetric_weight_kg: string;
    volume_m3: string;
    total_amount: string;
    freight: string;
  };
}

const formatMoney = (n: number) => (n ? n.toLocaleString('vi-VN') : '');

const formatHub = (hub?: { code?: string | null; name?: string | null } | null) =>
  hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') : '';

const packageLabel = (waybill: WaybillInventoryItem) => {
  const packages = Number(waybill.trip_package_count ?? waybill.remaining_packages ?? waybill.package_count ?? 0);
  const totalPackages = Number(waybill.order_total_packages ?? waybill.package_count ?? packages);
  if (!packages && !totalPackages) return '';
  return totalPackages > packages && packages > 0 ? `${packages}/${totalPackages}` : String(packages || totalPackages);
};

export function inventoryPrintCellValue(
  waybill: WaybillInventoryItem,
  colId: InventoryColumnId,
  showPricing: boolean,
  rowIndex?: number,
): string {
  switch (colId) {
    case 'stt':
      return rowIndex != null ? String(rowIndex) : '';
    case 'stack_position':
      return waybill.loading_position ? String(waybill.loading_position) : '';
    case 'order_code':
      return waybill.order_code || '';
    case 'waybill_code':
      return waybill.waybill_code || waybill.code || String(waybill.id);
    case 'barcode':
      return waybill.waybill_code || waybill.code || String(waybill.id);
    case 'customer_name':
      return resolveCustomerName(waybill);
    case 'bill_info':
      return waybill.noi_dung || waybill.mat_hang || '';
    case 'cong_sg':
      return resolveCongSg(waybill);
    case 'service_type':
      return resolveServiceType(waybill);
    case 'trip_label':
      return resolveInventoryTripHistoryText(waybill) || waybill.license_plate || '';
    case 'delivery_staff':
      return resolveDeliveryStaff(waybill).replace(/^—$/, '');
    case 'delivery_processing':
      return resolveDeliveryProcessingSummary(waybill);
    case 'loaded_at':
      return formatInventoryDate(resolveLoadedAt(waybill));
    case 'received_at':
      return formatInventoryDate(waybill.received_at || waybill.created_at);
    case 'noi_den':
      return resolveNoiDen(waybill);
    case 'order_status':
      return resolveOrderStatusBadge(waybill).label;
    case 'warehouse_intake': {
      const intake = resolveWarehouseIntakePresentation(waybill);
      return [intake.title, intake.detail, intake.note].filter(Boolean).join(' · ');
    }
    case 'billing_unit':
      return resolveBillingUnit(waybill);
    case 'billing_qty_detail':
      return resolveBillingQtyDetail(waybill);
    case 'unit_price':
      return formatMoney(resolveUnitPrice(waybill));
    case 'surcharge':
      return showPricing ? formatMoney(resolveSurcharge(waybill)) : '';
    case 'transit_fee':
      return formatMoney(resolveTransitFee(waybill));
    case 'total_amount':
      return showPricing ? formatMoney(resolveFreight(waybill) + resolveTransitFee(waybill)) : '';
    case 'thu_ho_khach':
      return formatMoney(Number((waybill.allocated_cod ?? waybill.cod_amount) || 0));
    case 'payment_method':
      return resolvePaymentMethod(waybill);
    case 'customer_payment_status':
      return waybill.customer_payment_status === 'PAID'
        ? 'Đã TT'
        : waybill.customer_payment_status === 'SENT_STATEMENT'
          ? 'Đã gửi bảng kê'
          : '';
    case 'customer_payment_note':
      return waybill.customer_payment_note || '';
    case 'user_note':
      return resolveUserNote(waybill);
    case 'route': {
      const route = resolveRoute(waybill);
      return route === '—' ? '' : route;
    }
    case 'ma_kh':
      return resolveMaKh(waybill);
    case 'receiver_address':
      return resolveReceiverAddress(waybill);
    case 'bill_images':
      return parseWaybillImages(waybill.delivery_photo_url).join('\n');
    case 'receiver_district':
      return resolveReceiverDistrict(waybill);
    case 'receiver_ward':
      return resolveReceiverWard(waybill);
    case 'receiver_phone': {
      const phone = resolveReceiverPhone(waybill);
      return phone === '—' ? '' : phone;
    }
    case 'package_count':
      return packageLabel(waybill);
    case 'weight':
      return resolveWeightKg(waybill) ? String(Math.round(resolveWeightKg(waybill) * 10) / 10) : '';
    case 'volumetric_weight':
      return resolveVolumetricWeightKg(waybill) ? String(Math.round(resolveVolumetricWeightKg(waybill) * 100) / 100) : '';
    case 'volume':
      return resolveVolumeM3(waybill) ? resolveVolumeM3(waybill).toFixed(2) : '';
    case 'freight':
      return showPricing ? formatMoney(resolveFreight(waybill)) : '';
    case 'sender_info':
      return waybill.sender_info || '';
    case 'receiver_info':
      return waybill.receiver_info || '';
    case 'current_hub':
      return formatHub(waybill.current_hub || waybill.origin_hub);
    case 'dest_hub':
      return formatHub(waybill.dest_hub);
    case 'payment_type':
      return String(waybill.payment_type || '');
    case 'cod_amount':
      return formatMoney(Number(waybill.allocated_cod ?? waybill.cod_amount ?? 0));
    case 'priority':
      return String(waybill.priority || '');
    default:
      return '';
  }
}

/** Giá trị cột ngày hoàn thành dự kiến (in/Excel). */
export function inventoryPrintCompletionDate(waybill: WaybillInventoryItem): string {
  return resolveCompletionDate(waybill);
}

export function buildInventoryQueryForPrint(filters: InventoryFilters) {
  const params = new URLSearchParams({ page: '1', limit: '500' });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.ma_kh.trim()) params.set('ma_kh', filters.ma_kh.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.customerPaymentStatuses.length) params.set('customer_payment_status', filters.customerPaymentStatuses.join(','));
  if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
  if (filters.destHubIds.length) params.set('dest_hub_id', filters.destHubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  if (filters.receivedFrom) params.set('received_from', filters.receivedFrom);
  if (filters.receivedTo) params.set('received_to', filters.receivedTo);
  return params.toString();
}

export function summarizeFilters(filters: InventoryFilters) {
  const parts: string[] = [];
  if (filters.keyword.trim()) parts.push(`Từ khóa: ${filters.keyword.trim()}`);
  if (filters.ma_kh.trim()) parts.push(`Mã KH: ${filters.ma_kh.trim()}`);
  if (filters.statuses.length) parts.push(`TT: ${filters.statuses.join(', ')}`);
  if (filters.customerPaymentStatuses.length) parts.push(`TT thanh toán: ${filters.customerPaymentStatuses.join(', ')}`);
  if (filters.originHubIds.length) parts.push(`Bưu cục gửi: ${filters.originHubIds.length} bưu cục`);
  if (filters.destHubIds.length) parts.push(`HUB đến: ${filters.destHubIds.length} bưu cục`);
  if (filters.receivedFrom || filters.receivedTo) {
    parts.push(`Ngày nhận: ${filters.receivedFrom || '…'} → ${filters.receivedTo || '…'}`);
  }
  return parts.length ? parts.join(' · ') : 'Tất cả đơn tồn kho theo bộ lọc hiện tại';
}

export function mapWaybillsToPrintRows(
  waybills: WaybillInventoryItem[],
  showPricing: boolean,
  visibleColumnIds: InventoryColumnId[],
  columnLabels?: Partial<Record<InventoryColumnId, string>>,
): InventoryPrintPayload {
  const printColumnIds = resolvePrintColumnIds(visibleColumnIds);
  const columns: InventoryPrintColumn[] = printColumnIds.map((id) => ({
    id,
    label: columnLabels?.[id] ?? INVENTORY_COLUMNS.find((c) => c.id === id)?.label ?? id,
  }));

  const rows = waybills.map((waybill, index) => {
    const row: Record<string, string> = {};
    printColumnIds.forEach((colId) => {
      row[colId] = inventoryPrintCellValue(waybill, colId, showPricing, index + 1);
    });
    return row;
  });

  const totalsRaw = computeGrandTotals(waybills, showPricing);

  return {
    printedAt: new Date().toLocaleString('vi-VN'),
    filterSummary: '',
    showPricing,
    columns,
    rows,
    totals: {
      package_count: String(totalsRaw.package_count),
      weight_kg: totalsRaw.weight_kg ? totalsRaw.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '0',
      volumetric_weight_kg: totalsRaw.volumetric_weight_kg
        ? totalsRaw.volumetric_weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
        : '0',
      volume_m3: totalsRaw.volume_m3 ? totalsRaw.volume_m3.toFixed(2) : '0',
      total_amount: showPricing ? formatMoney(totalsRaw.total_amount) : '',
      freight: showPricing ? formatMoney(totalsRaw.freight) : '',
    },
  };
}

const normalizeHubText = (value?: string | null) => String(value || '')
  .trim()
  .toLocaleLowerCase('vi-VN')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export function isHcmDestination(waybill: WaybillInventoryItem): boolean {
  const code = String(waybill.dest_hub?.code || '').trim().toUpperCase();
  if (code) return code === 'HCM';
  const fallback = normalizeHubText(waybill.dest_hub?.name || waybill.noi_den || waybill.customer_destination_province);
  return fallback === 'hcm' || fallback.includes('ho chi minh');
}

export function mapWaybillsToPrintSheets(
  waybills: WaybillInventoryItem[],
  showPricing: boolean,
  visibleColumnIds: InventoryColumnId[],
  filterSummary: string,
  columnLabels?: Partial<Record<InventoryColumnId, string>>,
  options?: { currentHubIsHcm?: boolean },
): InventoryPrintPayload[] {
  if (options?.currentHubIsHcm) {
    const payload = mapWaybillsToPrintRows(waybills, showPricing, visibleColumnIds, columnLabels);
    return [{
      ...payload,
      title: 'Danh sách tồn kho · Bưu cục HCM',
      filterSummary: `${filterSummary} · Tổng danh sách: ${waybills.length} đơn`,
    }];
  }
  const hcmRows = waybills.filter(isHcmDestination);
  const otherRows = waybills
    .filter((waybill) => !isHcmDestination(waybill))
    .sort((left, right) => {
      const leftHub = formatHub(left.dest_hub) || resolveNoiDen(left);
      const rightHub = formatHub(right.dest_hub) || resolveNoiDen(right);
      return leftHub.localeCompare(rightHub, 'vi', { numeric: true, sensitivity: 'base' });
    });
  const groups = [
    { title: 'Danh sách tồn kho · HUB đến HCM', label: 'Bản HCM', rows: hcmRows },
    { title: 'Danh sách tồn kho · Các bưu cục khác', label: 'Bản bưu cục khác', rows: otherRows },
  ].filter((group) => group.rows.length > 0);

  return groups.map((group) => {
    const payload = mapWaybillsToPrintRows(group.rows, showPricing, visibleColumnIds, columnLabels);
    return {
      ...payload,
      title: group.title,
      filterSummary: `${filterSummary} · ${group.label}: ${group.rows.length} đơn`,
    };
  });
}

export function saveInventoryPrintPayload(payload: InventoryPrintPayload | InventoryPrintPayload[]) {
  const bundle: StoredInventoryPrintBundle = {
    version: 2,
    sheets: Array.isArray(payload) ? payload : [payload],
  };
  const json = JSON.stringify(bundle);
  localStorage.setItem(INVENTORY_PRINT_STORAGE_KEY, json);
  try {
    sessionStorage.setItem(INVENTORY_PRINT_STORAGE_KEY, json);
  } catch {
    /* quota */
  }
}

export function loadInventoryPrintPayload(): InventoryPrintPayload | null {
  return loadInventoryPrintPayloads()[0] ?? null;
}

export function loadInventoryPrintPayloads(): InventoryPrintPayload[] {
  const raw =
    localStorage.getItem(INVENTORY_PRINT_STORAGE_KEY) ||
    sessionStorage.getItem(INVENTORY_PRINT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredInventoryPrintBundle | InventoryPrintPayload;
    const sheets: InventoryPrintPayload[] = 'sheets' in parsed && Array.isArray(parsed.sheets)
      ? parsed.sheets
      : [parsed as InventoryPrintPayload];
    return sheets.map(reconcilePrintPayload).filter((payload) => payload.rows.length > 0);
  } catch {
    return [];
  }
}

/** Chỉ lọc các cột hợp lệ trong chính payload; không tự thêm lại cột người dùng đã ẩn. */
export function reconcilePrintPayload(payload: InventoryPrintPayload): InventoryPrintPayload {
  const printColumnIds = resolvePrintColumnIds(payload.columns.map((column) => column.id));

  const columns: InventoryPrintColumn[] = printColumnIds.map((id) => ({
    id,
    label: INVENTORY_COLUMNS.find((c) => c.id === id)?.label ?? id,
  }));

  const rows = payload.rows.map((row) => {
    const next: Record<string, string> = {};
    printColumnIds.forEach((colId) => {
      next[colId] = row[colId] ?? '';
    });
    return next;
  });

  return {
    ...payload,
    columns,
    rows,
    totals: {
      ...payload.totals,
      volumetric_weight_kg: payload.totals.volumetric_weight_kg ?? '0',
      total_amount: payload.totals.total_amount ?? '',
      freight: payload.totals.freight ?? '',
    },
  };
}

interface StoredInventoryPrintBundle {
  version: 2;
  sheets: InventoryPrintPayload[];
}
