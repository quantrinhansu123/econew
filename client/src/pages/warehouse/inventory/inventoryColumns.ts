import type { WaybillInventoryItem } from './types';

export type InventoryColumnId =
  | 'waybill_code'
  | 'loaded_at'
  | 'received_at'
  | 'noi_den'
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
  { id: 'waybill_code', label: 'Mã vận đơn', defaultVisible: true },
  { id: 'loaded_at', label: 'Ngày bốc hàng', defaultVisible: true },
  { id: 'received_at', label: 'Ngày nhận đơn', defaultVisible: false },
  { id: 'noi_den', label: 'Tỉnh đến', defaultVisible: true },
  { id: 'route', label: 'Tuyến', defaultVisible: true },
  { id: 'ma_kh', label: 'Mã KH', defaultVisible: true },
  { id: 'receiver_address', label: 'Địa chỉ đến', defaultVisible: true },
  { id: 'receiver_phone', label: 'SĐT người nhận', defaultVisible: true },
  { id: 'package_count', label: 'Số kiện', defaultVisible: true, align: 'right' },
  { id: 'weight', label: 'Trọng lượng (kg)', defaultVisible: true, align: 'right' },
  { id: 'volume', label: 'Thể tích (m³)', defaultVisible: true, align: 'right' },
  { id: 'freight', label: 'Cước phí', defaultVisible: true, managerOnly: true, align: 'right' },
  { id: 'sender_info', label: 'Người gửi', defaultVisible: false },
  { id: 'receiver_info', label: 'Người nhận', defaultVisible: false },
  { id: 'current_hub', label: 'Hub hiện tại', defaultVisible: false },
  { id: 'dest_hub', label: 'Hub đến', defaultVisible: false },
  { id: 'payment_type', label: 'TT', defaultVisible: false },
  { id: 'cod_amount', label: 'COD', defaultVisible: true, align: 'right' },
  { id: 'priority', label: 'Ưu tiên', defaultVisible: false },
  { id: 'actions', label: 'Thao tác', defaultVisible: true },
];

export const INVENTORY_COLUMN_STORAGE_KEY = 'eco_inventory_visible_columns_v4';

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
    if (!filtered.includes('waybill_code')) filtered.unshift('waybill_code');
    if (!filtered.includes('actions')) filtered.push('actions');
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

export function resolveNoiDen(waybill: WaybillInventoryItem): string {
  const noiDen = (waybill as { noi_den?: string }).noi_den?.trim();
  if (noiDen) return noiDen;
  return waybill.dest_hub?.name || waybill.dest_hub?.code?.toUpperCase() || '—';
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
    (acc, w) => ({
      package_count: acc.package_count + Math.max(1, Number(w.package_count || w.declared_package_count || 0)),
      weight_kg: acc.weight_kg + resolveWeightKg(w),
      volume_m3: acc.volume_m3 + resolveVolumeM3(w),
      freight: acc.freight + (includeFreight ? resolveFreight(w) : 0),
    }),
    { package_count: 0, weight_kg: 0, volume_m3: 0, freight: 0 },
  );
}
