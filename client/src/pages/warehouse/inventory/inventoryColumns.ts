import type { WaybillInventoryItem } from './types';
import { extractProvinceFromAddress, isHubCode, normalizeProvinceLabel } from '../../../lib/vietnamProvince';
import { resolveOrderStatusGroup, orderStatusGroupConfig } from './orderStatusUtils';

export type InventoryColumnId =
  | 'stt'
  | 'cong_sg'
  | 'stack_position'
  | 'order_code'
  | 'waybill_code'
  | 'customer_name'
  | 'bill_info'
  | 'service_type'
  | 'trip_label'
  | 'loaded_at'
  | 'received_at'
  | 'noi_den'
  | 'order_status'
  | 'billing_unit'
  | 'billing_qty_detail'
  | 'unit_price'
  | 'surcharge'
  | 'transit_fee'
  | 'total_amount'
  | 'thu_ho_khach'
  | 'payment_method'
  | 'customer_payment_status'
  | 'customer_payment_note'
  | 'route'
  | 'ma_kh'
  | 'receiver_address'
  | 'receiver_phone'
  | 'package_count'
  | 'weight'
  | 'volume'
  | 'freight'
  | 'sender_info'
  | 'receiver_info'
  | 'current_hub'
  | 'dest_hub'
  | 'payment_type'
  | 'cod_amount'
  | 'priority'
  | 'actions';

export interface InventoryColumnDef {
  id: InventoryColumnId;
  label: string;
  defaultVisible: boolean;
  managerOnly?: boolean;
  align?: 'left' | 'right' | 'center';
}

export const INVENTORY_COLUMNS: InventoryColumnDef[] = [
  { id: 'stt', label: 'STT', defaultVisible: false },
  { id: 'cong_sg', label: 'Cộng SG', defaultVisible: false },
  { id: 'stack_position', label: 'Vị trí Xếp hàng', defaultVisible: true },
  { id: 'order_code', label: 'Mã đơn hàng', defaultVisible: true },
  { id: 'customer_name', label: 'Tên khách', defaultVisible: true },
  { id: 'waybill_code', label: 'Mã vận đơn', defaultVisible: true },
  { id: 'bill_info', label: 'Bill / Cộng SG', defaultVisible: true },
  { id: 'service_type', label: 'Dịch vụ', defaultVisible: true },
  { id: 'trip_label', label: 'Phân xe', defaultVisible: true },
  { id: 'loaded_at', label: 'Ngày bốc hàng', defaultVisible: true },
  { id: 'received_at', label: 'Ngày nhận đơn', defaultVisible: false },
  { id: 'noi_den', label: 'Tỉnh đến', defaultVisible: true },
  { id: 'order_status', label: 'Trạng thái đơn', defaultVisible: true },
  { id: 'billing_unit', label: 'ĐVT', defaultVisible: true },
  { id: 'billing_qty_detail', label: 'Kg / khối', defaultVisible: true, align: 'right' },
  { id: 'unit_price', label: 'Đơn giá', defaultVisible: true, align: 'right' },
  { id: 'surcharge', label: 'Phụ phí', defaultVisible: true, managerOnly: true, align: 'right' },
  { id: 'transit_fee', label: 'Trung chuyển', defaultVisible: true, align: 'right' },
  { id: 'total_amount', label: 'Thành tiền', defaultVisible: true, managerOnly: true, align: 'right' },
  { id: 'thu_ho_khach', label: 'Thu hộ khách', defaultVisible: true, align: 'right' },
  { id: 'payment_method', label: 'Hình thức TT', defaultVisible: true },
  { id: 'customer_payment_status', label: 'Tình trạng TT', defaultVisible: true },
  { id: 'customer_payment_note', label: 'Ghi chú TT', defaultVisible: false },
  { id: 'route', label: 'Tuyến', defaultVisible: true },
  { id: 'ma_kh', label: 'Mã KH', defaultVisible: true },
  { id: 'receiver_address', label: 'Địa chỉ đến', defaultVisible: true },
  { id: 'receiver_phone', label: 'SĐT người nhận', defaultVisible: true },
  { id: 'package_count', label: 'Kiện còn / đơn', defaultVisible: true, align: 'right' },
  { id: 'weight', label: 'Trọng lượng (kg)', defaultVisible: true, align: 'right' },
  { id: 'volume', label: 'Thể tích (m³)', defaultVisible: true, align: 'right' },
  { id: 'freight', label: 'Cước phí', defaultVisible: true, managerOnly: true, align: 'right' },
  { id: 'sender_info', label: 'Người gửi', defaultVisible: false },
  { id: 'receiver_info', label: 'Người nhận', defaultVisible: false },
  { id: 'current_hub', label: 'Hub hiện tại', defaultVisible: false },
  { id: 'dest_hub', label: 'Hub đến', defaultVisible: false },
  { id: 'payment_type', label: 'TT', defaultVisible: false },
  { id: 'cod_amount', label: 'COD', defaultVisible: true, align: 'right' },
  { id: 'priority', label: 'Ưu tiên', defaultVisible: true },
  { id: 'actions', label: 'Thao tác', defaultVisible: true },
];

export const INVENTORY_COLUMN_STORAGE_KEY = 'eco_inventory_visible_columns_v6';

/** Không dùng trên danh sách đơn — thay bằng Bill + Cộng SG riêng */
export const ALL_ORDERS_DISALLOWED_COLUMN_IDS: InventoryColumnId[] = [
  'route',
  'stack_position',
  'bill_info',
];

/** Cột STT — luôn đứng đầu bảng */
export const ALL_ORDERS_PREFIX_COLUMN_IDS: InventoryColumnId[] = ['stt'];

/** Cột nhóm "Thông tin người gửi" — theo bảng Excel danh sách đơn */
export const ALL_ORDERS_SENDER_COLUMN_IDS: InventoryColumnId[] = [
  'received_at',
  'customer_name',
  'waybill_code',
  'cong_sg',
  'service_type',
  'noi_den',
  'receiver_address',
  'order_status',
  'package_count',
  'billing_unit',
  'billing_qty_detail',
];

/** Cột nhóm thanh toán / cước phí */
export const ALL_ORDERS_FINANCIAL_COLUMN_IDS: InventoryColumnId[] = [
  'unit_price',
  'surcharge',
  'total_amount',
  'thu_ho_khach',
  'payment_method',
  'customer_payment_status',
  'customer_payment_note',
];

export const ALL_ORDERS_SUFFIX_COLUMN_IDS: InventoryColumnId[] = ['actions'];

export const ALL_ORDERS_FIXED_COLUMN_IDS: InventoryColumnId[] = [
  ...ALL_ORDERS_PREFIX_COLUMN_IDS,
  ...ALL_ORDERS_SENDER_COLUMN_IDS,
  ...ALL_ORDERS_FINANCIAL_COLUMN_IDS,
  ...ALL_ORDERS_SUFFIX_COLUMN_IDS,
];

/** @deprecated Dùng ALL_ORDERS_FIXED_COLUMN_IDS */
export const ALL_ORDERS_DEFAULT_COLUMN_IDS = ALL_ORDERS_FIXED_COLUMN_IDS;

export function getAllOrdersFixedColumnIds(): InventoryColumnId[] {
  return [...ALL_ORDERS_FIXED_COLUMN_IDS];
}

const ALL_ORDERS_COLUMN_LABELS: Partial<Record<InventoryColumnId, string>> = {
  received_at: 'Ngày nhận',
  customer_name: 'Tên khách',
  waybill_code: 'Bill',
  cong_sg: 'Nội dung',
  service_type: 'Dịch vụ',
  noi_den: 'Nơi đến',
  receiver_address: 'Địa chỉ',
  order_status: 'Trạng thái',
  billing_qty_detail: 'Kg / khối',
  surcharge: 'Phụ phí',
  stt: 'STT',
  package_count: 'SL',
  billing_unit: 'ĐVT',
  unit_price: 'Đơn giá',
  total_amount: 'Thành tiền',
  thu_ho_khach: 'Thu hộ khách',
  payment_method: 'Hình thức thanh toán',
  customer_payment_status: 'Tình trạng TT',
  customer_payment_note: 'Ghi chú',
};

export type InventoryColumnView = InventoryColumnDef & {
  headerClass?: string;
};

export function resolveAllOrdersColumnLabel(id: InventoryColumnId): string {
  return ALL_ORDERS_COLUMN_LABELS[id] ?? INVENTORY_COLUMNS.find((col) => col.id === id)?.label ?? id;
}

export function resolveVisibleColumnViews(
  visibleColumnIds: InventoryColumnId[],
  variant: 'split-pending' | 'all-orders',
  canViewPricing: boolean,
): InventoryColumnView[] {
  const ids = variant === 'all-orders' ? getAllOrdersFixedColumnIds() : visibleColumnIds;
  return ids
    .map((id) => {
      const base = INVENTORY_COLUMNS.find((col) => col.id === id);
      if (!base) return null;
      if (base.managerOnly && !canViewPricing && variant !== 'all-orders') return null;
      if (variant !== 'all-orders') return base;
      const headerClass =
        id === 'total_amount'
          ? 'bg-emerald-100 text-emerald-900'
          : id === 'surcharge'
            ? 'bg-orange-50 text-orange-900'
          : id === 'customer_payment_status'
            ? 'bg-yellow-100 text-yellow-900'
            : undefined;
      return {
        ...base,
        label: resolveAllOrdersColumnLabel(id),
        headerClass,
      };
    })
    .filter((col): col is InventoryColumnView => col != null);
}

export function getAllOrdersDefaultVisibleColumnIds(): InventoryColumnId[] {
  return getAllOrdersFixedColumnIds();
}

export function loadAllOrdersVisibleColumnIds(): InventoryColumnId[] {
  return getAllOrdersFixedColumnIds();
}

export function saveAllOrdersVisibleColumnIds(_ids: InventoryColumnId[]) {
  /* Danh sách đơn: cột cố định theo mockup, không lưu tùy chỉnh */
}

export function getDefaultVisibleColumnIds(canViewPricing: boolean): InventoryColumnId[] {
  return INVENTORY_COLUMNS.filter((col) => {
    if (col.id === 'actions') return true;
    if (col.managerOnly && !canViewPricing) return false;
    return col.defaultVisible;
  }).map((col) => col.id);
}

export function loadVisibleColumnIds(canViewPricing: boolean): InventoryColumnId[] {
  if (typeof window === 'undefined') return getDefaultVisibleColumnIds(canViewPricing);
  const raw = localStorage.getItem(INVENTORY_COLUMN_STORAGE_KEY);
  if (!raw) return getDefaultVisibleColumnIds(canViewPricing);
  try {
    const parsed = JSON.parse(raw) as InventoryColumnId[];
    const allowed = new Set(
      INVENTORY_COLUMNS.filter((c) => !c.managerOnly || canViewPricing).map((c) => c.id),
    );
    const filtered = parsed.filter((id) => allowed.has(id));
    if (!filtered.includes('stack_position')) filtered.unshift('stack_position');
    if (!filtered.includes('order_code')) {
      const stackIdx = filtered.indexOf('stack_position');
      filtered.splice(stackIdx >= 0 ? stackIdx + 1 : 0, 0, 'order_code');
    }
    if (!filtered.includes('waybill_code')) {
      const orderIdx = filtered.indexOf('order_code');
      filtered.splice(orderIdx + 1, 0, 'waybill_code');
    }
    if (!filtered.includes('actions')) filtered.push('actions');
    if (!filtered.includes('priority')) {
      const actionsIdx = filtered.indexOf('actions');
      filtered.splice(actionsIdx >= 0 ? actionsIdx : filtered.length, 0, 'priority');
    }
    return filtered.length ? filtered : getDefaultVisibleColumnIds(canViewPricing);
  } catch {
    return getDefaultVisibleColumnIds(canViewPricing);
  }
}

export function saveVisibleColumnIds(ids: InventoryColumnId[]) {
  localStorage.setItem(INVENTORY_COLUMN_STORAGE_KEY, JSON.stringify(ids));
}

/** Cột in A4 — cùng thứ tự & bộ cột như bảng màn hình (trừ Thao tác). */
export function resolvePrintColumnIds(visibleColumnIds: InventoryColumnId[]): InventoryColumnId[] {
  const visible = new Set(visibleColumnIds);
  return INVENTORY_COLUMNS.filter((col) => col.id !== 'actions' && visible.has(col.id)).map((col) => col.id);
}

const parseNote = (note: string | null | undefined, key: string) => {
  const m = (note || '').match(new RegExp(`${key}=([^|]+)`));
  return m?.[1]?.trim() || '';
};

export function resolveMaKh(waybill: WaybillInventoryItem): string {
  return (waybill as { ma_kh?: string }).ma_kh?.trim() || parseNote(waybill.note || waybill.notes, 'ma_kh') || '—';
}

export function resolveCongSg(waybill: WaybillInventoryItem): string {
  const note = waybill.note || waybill.notes || '';
  return (
    waybill.noi_dung?.trim()
    || parseNote(note, 'content')
    || waybill.mat_hang?.trim()
    || waybill.order?.noi_dung?.trim()
    || '—'
  );
}

export function resolvePackageCountSl(waybill: WaybillInventoryItem): string {
  const count = Number(waybill.package_count ?? waybill.declared_package_count ?? waybill.order_total_packages ?? 0);
  return Number.isFinite(count) && count > 0 ? String(count) : '—';
}

export function resolveCustomerName(waybill: WaybillInventoryItem): string {
  const senderInfo = String(waybill.sender_info || '').trim();
  if (!senderInfo) return '—';
  return senderInfo.split('|')[0]?.trim() || senderInfo;
}

export function resolveServiceType(waybill: WaybillInventoryItem): string {
  return parseNote(waybill.note || waybill.notes, 'dich_vu') || 'Tiêu chuẩn';
}

export function resolveBillingUnit(waybill: WaybillInventoryItem): string {
  return parseNote(waybill.note || waybill.notes, 'billing_unit') || 'Cân';
}

export function resolveUnitPrice(waybill: WaybillInventoryItem): number {
  const note = waybill.note || waybill.notes || '';
  const fromNote = Number(String(parseNote(note, 'unit_price')).replace(/\D/g, ''));
  if (Number.isFinite(fromNote) && fromNote > 0) return fromNote;
  return 0;
}

export function resolveTransitFee(waybill: WaybillInventoryItem): number {
  const fromNote = Number(String(parseNote(waybill.note || waybill.notes, 'trung_chuyen')).replace(/[^\d.-]/g, ''));
  return Number.isFinite(fromNote) && fromNote > 0 ? fromNote : 0;
}

export function resolvePaymentMethod(waybill: WaybillInventoryItem): string {
  const method = parseNote(waybill.note || waybill.notes, 'phuong_thuc');
  if (method) return method;
  const pt = String(waybill.payment_type || '').toUpperCase();
  if (pt === 'COD') return 'COD';
  if (pt === 'CC') return 'Tiền mặt';
  return 'Công nợ';
}

export function resolveNoiDen(waybill: WaybillInventoryItem): string {
  const note = waybill.note || waybill.notes || '';
  const fromNote = parseNote(note, 'tinh_den') || parseNote(note, 'huyen');
  if (fromNote) return normalizeProvinceLabel(fromNote);

  const stored = (waybill as { noi_den?: string }).noi_den?.trim();
  if (stored && !isHubCode(stored)) return normalizeProvinceLabel(stored);

  const address = resolveReceiverAddress(waybill);
  const fromAddress = extractProvinceFromAddress(address);
  if (fromAddress) return fromAddress;

  const hubName = waybill.dest_hub?.name?.trim();
  if (hubName && !isHubCode(hubName)) return hubName;

  return stored || waybill.dest_hub?.code?.toUpperCase() || '—';
}

export function resolveSurcharge(waybill: WaybillInventoryItem): number {
  const note = waybill.note || waybill.notes || '';
  if (note.includes('phu_phi=')) {
    const fromPhuPhi = Number(String(parseNote(note, 'phu_phi')).replace(/\D/g, ''));
    return Number.isFinite(fromPhuPhi) ? fromPhuPhi : 0;
  }
  const fromGiamGia = Number(String(parseNote(note, 'giamGia')).replace(/\D/g, ''));
  if (Number.isFinite(fromGiamGia) && fromGiamGia > 0) return fromGiamGia;
  return 0;
}

export function resolveTotalAmount(waybill: WaybillInventoryItem): number {
  const note = waybill.note || waybill.notes || '';
  if (note.includes('thanh_toan=')) {
    const fromBill = Number(String(parseNote(note, 'thanh_toan')).replace(/\D/g, ''));
    if (Number.isFinite(fromBill)) return fromBill;
  }
  return Math.max(0, resolveFreight(waybill) - resolveSurcharge(waybill));
}

export function resolveBillingQtyDetail(waybill: WaybillInventoryItem): string {
  const kg = resolveWeightKg(waybill);
  const volKg = Number(waybill.volumetric_weight ?? 0);
  const m3 = resolveVolumeM3(waybill);
  const unit = resolveBillingUnit(waybill);
  const parts: string[] = [];
  if (kg > 0) parts.push(`${kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`);
  if (volKg > 0) parts.push(`${volKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg khối`);
  if (m3 > 0) parts.push(`${m3.toFixed(2)} m³`);
  if (!parts.length) return '—';
  return unit ? `${parts.join(' · ')} (${unit})` : parts.join(' · ');
}

export function resolveOrderStatusBadge(waybill: WaybillInventoryItem) {
  return orderStatusGroupConfig[resolveOrderStatusGroup(waybill)];
}

export function resolveRoute(waybill: WaybillInventoryItem): string {
  const route = waybill.route_code?.trim() || waybill.delivery_route?.trim();
  return route || '—';
}

export function resolveReceiverAddress(waybill: WaybillInventoryItem): string {
  if (waybill.receiver_address?.trim()) return waybill.receiver_address.trim();
  const info = waybill.receiver_info || '';
  if (info.includes('|')) {
    const parts = info.split('|').map((p) => p.trim());
    return parts[2] || parts[parts.length - 1] || info;
  }
  return info || '—';
}

export function resolveWeightKg(waybill: WaybillInventoryItem): number {
  const n = Number(waybill.actual_weight ?? waybill.weight ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function resolveVolumeM3(waybill: WaybillInventoryItem): number {
  const direct = Number((waybill as { the_tich_m3?: number | string }).the_tich_m3 ?? 0);
  if (direct > 0) return direct;
  const note = waybill.note || waybill.notes || '';
  const fromNote = Number(parseNote(note, 'volumetric_weight'));
  if (fromNote > 0 && fromNote < 500) return fromNote / 500;
  const vol = Number(waybill.volumetric_weight ?? 0);
  if (vol > 0 && vol < 500) return vol / 500;
  return 0;
}

export function resolveFreight(waybill: WaybillInventoryItem): number {
  const cost = Number(waybill.cost_amount ?? 0);
  const freight = Number(waybill.freight_amount ?? 0);
  return cost || freight || 0;
}

export interface InventoryGrandTotals {
  package_count: number;
  weight_kg: number;
  volume_m3: number;
  freight: number;
}

export function resolveReceiverPhone(waybill: WaybillInventoryItem): string {
  const phone = waybill.receiver_phone?.trim();
  if (phone) return phone;
  const info = waybill.receiver_info || '';
  if (info.includes('|')) {
    const parts = info.split('|').map((p) => p.trim());
    return parts[1] || '—';
  }
  return '—';
}

export function resolveLoadedAt(waybill: WaybillInventoryItem): string | null {
  const loaded = (waybill as { loaded_at?: string | null }).loaded_at;
  return loaded || waybill.received_at || waybill.created_at || null;
}

/** Số ngày lưu kho tính từ ngày bốc/nhận — dùng highlight cảnh báo */
export function getStorageAgeDays(waybill: WaybillInventoryItem): number {
  const anchor = resolveLoadedAt(waybill);
  if (!anchor) return 0;
  const ms = Date.now() - new Date(anchor).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function getStorageAgeRowClass(waybill: WaybillInventoryItem): string {
  const days = getStorageAgeDays(waybill);
  if (days >= 3) return 'bg-red-50 hover:bg-red-100/80';
  if (days >= 1) return 'bg-amber-50 hover:bg-amber-100/80';
  return 'hover:bg-muted/10';
}

export function computeGrandTotals(waybills: WaybillInventoryItem[], includeFreight: boolean): InventoryGrandTotals {
  return waybills.reduce(
    (acc, w) => {
      const packages = Math.max(
        1,
        Number(w.trip_package_count ?? w.package_count ?? w.declared_package_count ?? 0),
      );
      const totalPackages = Math.max(1, Number(w.order_total_packages ?? w.package_count ?? packages));
      const ratio = packages / totalPackages;
      return {
        package_count: acc.package_count + packages,
        weight_kg: acc.weight_kg + resolveWeightKg(w) * ratio,
        volume_m3: acc.volume_m3 + resolveVolumeM3(w) * ratio,
        freight: acc.freight + (includeFreight ? (Number(w.allocated_freight ?? resolveFreight(w)) || 0) : 0),
      };
    },
    { package_count: 0, weight_kg: 0, volume_m3: 0, freight: 0 },
  );
}

/** Thu chi chỉ áp dụng khi thanh toán COD hoặc Tiền mặt (CC) */
export function canCollectCashPayment(paymentType: WaybillInventoryItem['payment_type']): boolean {
  const pt = String(paymentType || '').toUpperCase();
  return pt === 'COD' || pt === 'CC';
}
