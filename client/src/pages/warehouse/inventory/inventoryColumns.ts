import type { WaybillInventoryItem } from './types';
import { resolveOrderStatusGroup, orderStatusGroupConfig } from './orderStatusUtils';
import { resolveVietnamDistrict, resolveVietnamWard } from '../../../lib/vietnamAddressParts';
import { resolveWaybillDisplayNote } from '../../../lib/waybillSpecialGoods';

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Format ngày in/Excel/màn hình — tránh lệch ngày do timezone khi chuỗi ISO có giờ UTC. */
export function formatInventoryDate(value?: string | null, options?: { short?: boolean }): string {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return options?.short ? `${day}/${month}` : `${day}/${month}/${year}`;
  }
  const dm = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dm) {
    const day = dm[1].padStart(2, '0');
    const month = dm[2].padStart(2, '0');
    if (options?.short) return `${day}/${month}`;
    const year = dm[3]
      ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3])
      : String(new Date().getFullYear());
    return `${day}/${month}/${year}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    ...(options?.short ? {} : { year: 'numeric' }),
    timeZone: VN_TIMEZONE,
  }).format(date);
}

/** Ngày hoàn thành dự kiến = ngày bốc + 3 ngày (theo mẫu bảng kê). */
export function resolveCompletionDate(waybill: WaybillInventoryItem): string {
  const anchor = resolveLoadedAt(waybill);
  if (!anchor) return '';
  const iso = String(anchor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 3);
    return formatInventoryDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      { short: true },
    );
  }
  const dm = String(anchor).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dm) {
    const year = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : new Date().getFullYear();
    const date = new Date(year, Number(dm[2]) - 1, Number(dm[1]));
    date.setDate(date.getDate() + 3);
    return formatInventoryDate(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      { short: true },
    );
  }
  const date = new Date(anchor);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 3);
  return formatInventoryDate(date.toISOString(), { short: true });
}

/** Tỷ lệ % chiều rộng cột khi in / xuất Excel danh sách tồn. */
export const INVENTORY_PRINT_COLUMN_WIDTHS: Partial<Record<InventoryColumnId, number>> = {
  stt: 3.5,
  stack_position: 3.5,
  order_code: 7,
  customer_name: 8,
  waybill_code: 8,
  bill_info: 9,
  cong_sg: 8,
  service_type: 4,
  trip_label: 6,
  loaded_at: 5,
  received_at: 5,
  noi_den: 4,
  order_status: 5.5,
  billing_unit: 3.5,
  billing_qty_detail: 7.5,
  unit_price: 5.5,
  surcharge: 5,
  transit_fee: 5,
  total_amount: 5.5,
  thu_ho_khach: 5.5,
  payment_method: 5.5,
  customer_payment_status: 5.5,
  customer_payment_note: 6,
  user_note: 8,
  route: 5,
  ma_kh: 5,
  receiver_address: 17,
  bill_images: 8,
  receiver_district: 8,
  receiver_ward: 8,
  receiver_phone: 6.5,
  package_count: 4,
  weight: 4.5,
  volumetric_weight: 5.5,
  volume: 4.5,
  cod_amount: 5,
  priority: 4,
  sender_info: 8,
  receiver_info: 8,
  current_hub: 6,
  dest_hub: 6,
  payment_type: 4,
};

export function getInventoryPrintColumnWidth(colId: InventoryColumnId, columnCount: number): number {
  const mapped = INVENTORY_PRINT_COLUMN_WIDTHS[colId];
  if (mapped) return mapped;
  return Math.max(3, 100 / Math.max(columnCount, 1));
}

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
  | 'user_note'
  | 'route'
  | 'ma_kh'
  | 'receiver_address'
  | 'bill_images'
  | 'receiver_district'
  | 'receiver_ward'
  | 'receiver_phone'
  | 'package_count'
  | 'weight'
  | 'volumetric_weight'
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
  { id: 'cong_sg', label: 'Nội dung hàng', defaultVisible: true },
  { id: 'stack_position', label: 'Vị trí', defaultVisible: true },
  { id: 'order_code', label: 'Mã đơn hàng', defaultVisible: false },
  { id: 'customer_name', label: 'Tên khách', defaultVisible: true },
  { id: 'waybill_code', label: 'Mã bill', defaultVisible: true },
  { id: 'bill_info', label: 'Bill / Nội dung hàng', defaultVisible: false },
  { id: 'service_type', label: 'Dịch vụ', defaultVisible: false },
  { id: 'trip_label', label: 'Phân xe', defaultVisible: false },
  { id: 'loaded_at', label: 'Ngày bốc', defaultVisible: true },
  { id: 'received_at', label: 'Ngày nhận đơn', defaultVisible: false },
  { id: 'noi_den', label: 'Tỉnh đến', defaultVisible: true },
  { id: 'order_status', label: 'Trạng thái đơn', defaultVisible: false },
  { id: 'billing_unit', label: 'ĐVT cước', defaultVisible: false },
  { id: 'billing_qty_detail', label: 'Kg / khối', defaultVisible: false, align: 'right' },
  { id: 'unit_price', label: 'Đơn giá', defaultVisible: false, align: 'right' },
  { id: 'surcharge', label: 'Dịch vụ cộng thêm', defaultVisible: false, managerOnly: true, align: 'right' },
  { id: 'transit_fee', label: 'Trung chuyển', defaultVisible: false, align: 'right' },
  { id: 'total_amount', label: 'Thành tiền', defaultVisible: false, managerOnly: true, align: 'right' },
  { id: 'thu_ho_khach', label: 'Thu hộ khách', defaultVisible: false, align: 'right' },
  { id: 'payment_method', label: 'Hình thức TT', defaultVisible: false },
  { id: 'customer_payment_status', label: 'Tình trạng TT', defaultVisible: false },
  { id: 'customer_payment_note', label: 'Ghi chú TT', defaultVisible: false },
  { id: 'user_note', label: 'Ghi chú', defaultVisible: true },
  { id: 'route', label: 'Tuyến', defaultVisible: false },
  { id: 'ma_kh', label: 'Mã KH', defaultVisible: false },
  { id: 'receiver_address', label: 'Địa chỉ nhận', defaultVisible: false },
  { id: 'bill_images', label: 'Hình ảnh', defaultVisible: false },
  { id: 'receiver_district', label: 'Quận', defaultVisible: false },
  { id: 'receiver_ward', label: 'Phường', defaultVisible: false },
  { id: 'receiver_phone', label: 'SĐT người nhận', defaultVisible: false },
  { id: 'package_count', label: 'Số kiện', defaultVisible: true, align: 'right' },
  { id: 'weight', label: 'Trọng lượng thực', defaultVisible: true, align: 'right' },
  { id: 'volumetric_weight', label: 'Trọng lượng quy đổi', defaultVisible: true, align: 'right' },
  { id: 'volume', label: 'CBM', defaultVisible: true, align: 'right' },
  { id: 'freight', label: 'Cước phí', defaultVisible: false, managerOnly: true, align: 'right' },
  { id: 'sender_info', label: 'Người gửi', defaultVisible: false },
  { id: 'receiver_info', label: 'Ng nhận', defaultVisible: false },
  { id: 'current_hub', label: 'Hub hiện tại', defaultVisible: false },
  { id: 'dest_hub', label: 'Hub đến', defaultVisible: true },
  { id: 'payment_type', label: 'TT', defaultVisible: false },
  { id: 'cod_amount', label: 'COD', defaultVisible: true, align: 'right' },
  { id: 'priority', label: 'Ưu tiên', defaultVisible: false },
  { id: 'actions', label: 'Thao tác', defaultVisible: true },
];

export const INVENTORY_COLUMN_STORAGE_KEY = 'eco_inventory_visible_columns_v8';

/** Các cột hiện mặc định lần đầu; người dùng có thể bỏ chọn và lưu lại. */
export const INVENTORY_DEFAULT_COLUMN_IDS: InventoryColumnId[] = [
  'stack_position',
  'loaded_at',
  'noi_den',
  'customer_name',
  'cong_sg',
  'dest_hub',
  'package_count',
  'cod_amount',
  'waybill_code',
  'user_note',
  'weight',
  'volumetric_weight',
  'volume',
];

/** @deprecated Dùng INVENTORY_DEFAULT_COLUMN_IDS. */
export const INVENTORY_FIXED_COLUMN_IDS = INVENTORY_DEFAULT_COLUMN_IDS;

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
  'ma_kh',
  'waybill_code',
  'cong_sg',
  'package_count',
  'service_type',
  'noi_den',
  'receiver_address',
  'bill_images',
  'order_status',
  'trip_label',
  'billing_unit',
  'billing_qty_detail',
  'order_code',
  'loaded_at',
  'receiver_district',
  'receiver_ward',
  'receiver_phone',
  'user_note',
  'sender_info',
  'receiver_info',
  'current_hub',
  'dest_hub',
  'weight',
  'volumetric_weight',
  'volume',
  'priority',
];

/** Cột nhóm thanh toán / cước phí */
export const ALL_ORDERS_FINANCIAL_COLUMN_IDS: InventoryColumnId[] = [
  'unit_price',
  'surcharge',
  'transit_fee',
  'freight',
  'total_amount',
  'thu_ho_khach',
  'payment_method',
  'payment_type',
  'cod_amount',
  'customer_payment_status',
  'customer_payment_note',
];

export const ALL_ORDERS_SUFFIX_COLUMN_IDS: InventoryColumnId[] = ['actions'];

/** Độ rộng cố định giúp bảng danh sách đơn giữ một dòng gọn như Excel. */
export const ALL_ORDERS_COLUMN_WIDTHS: Partial<Record<InventoryColumnId, number>> = {
  stt: 48,
  received_at: 100,
  customer_name: 135,
  ma_kh: 100,
  waybill_code: 120,
  cong_sg: 160,
  package_count: 90,
  service_type: 120,
  noi_den: 110,
  receiver_address: 250,
  bill_images: 90,
  order_status: 115,
  trip_label: 220,
  billing_unit: 110,
  billing_qty_detail: 150,
  order_code: 120,
  loaded_at: 105,
  receiver_district: 130,
  receiver_ward: 130,
  receiver_phone: 130,
  user_note: 180,
  sender_info: 180,
  receiver_info: 220,
  current_hub: 140,
  dest_hub: 140,
  weight: 120,
  volumetric_weight: 145,
  volume: 100,
  priority: 110,
  unit_price: 100,
  surcharge: 150,
  transit_fee: 120,
  freight: 120,
  total_amount: 120,
  thu_ho_khach: 120,
  payment_method: 145,
  payment_type: 100,
  cod_amount: 120,
  customer_payment_status: 115,
  customer_payment_note: 140,
  actions: 112,
};

export const ALL_ORDERS_SELECTABLE_COLUMN_IDS: InventoryColumnId[] = [
  ...ALL_ORDERS_SENDER_COLUMN_IDS,
  ...ALL_ORDERS_FINANCIAL_COLUMN_IDS,
];

export const ALL_ORDERS_DEFAULT_COLUMN_IDS: InventoryColumnId[] = [
  ...ALL_ORDERS_PREFIX_COLUMN_IDS,
  'received_at',
  'customer_name',
  'ma_kh',
  'waybill_code',
  'cong_sg',
  'package_count',
  'service_type',
  'noi_den',
  'receiver_address',
  'bill_images',
  'order_status',
  'trip_label',
  'billing_unit',
  'billing_qty_detail',
  'unit_price',
  'surcharge',
  'total_amount',
  'thu_ho_khach',
  'payment_method',
  'customer_payment_status',
  'customer_payment_note',
  ...ALL_ORDERS_SUFFIX_COLUMN_IDS,
];

/** @deprecated Danh sách đơn hiện cho phép người dùng tùy chọn cột. */
export const ALL_ORDERS_FIXED_COLUMN_IDS = ALL_ORDERS_DEFAULT_COLUMN_IDS;

export function getAllOrdersFixedColumnIds(): InventoryColumnId[] {
  return [...ALL_ORDERS_DEFAULT_COLUMN_IDS];
}

const ALL_ORDERS_COLUMN_LABELS: Partial<Record<InventoryColumnId, string>> = {
  received_at: 'Ngày gửi',
  customer_name: 'Tên khách',
  ma_kh: 'Mã KH',
  waybill_code: 'Bill',
  cong_sg: 'Nội dung',
  trip_label: 'Chuyến / xe',
  service_type: 'Dịch vụ',
  noi_den: 'Nơi đến',
  receiver_address: 'Địa chỉ nhận',
  bill_images: 'Hình ảnh',
  receiver_district: 'Quận/Huyện',
  receiver_ward: 'Phường/Xã',
  order_status: 'Trạng thái',
  billing_qty_detail: 'Kg / khối',
  surcharge: 'Dịch vụ cộng thêm',
  stt: 'STT',
  package_count: 'Số kiện',
  billing_unit: 'ĐVT cước',
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
  const ids = variant === 'all-orders'
    ? normalizeAllOrdersVisibleColumnIds(visibleColumnIds)
    : normalizeInventoryVisibleColumnIds(visibleColumnIds, canViewPricing);
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
  return [...ALL_ORDERS_DEFAULT_COLUMN_IDS];
}

export const ALL_ORDERS_COLUMN_STORAGE_KEY = 'eco_all_orders_visible_columns_v1';

export function normalizeAllOrdersVisibleColumnIds(ids: InventoryColumnId[]): InventoryColumnId[] {
  const selected = new Set(ids.filter((id) => ALL_ORDERS_SELECTABLE_COLUMN_IDS.includes(id)));
  selected.add('waybill_code');
  return [
    ...ALL_ORDERS_PREFIX_COLUMN_IDS,
    ...ALL_ORDERS_SELECTABLE_COLUMN_IDS.filter((id) => selected.has(id)),
    ...ALL_ORDERS_SUFFIX_COLUMN_IDS,
  ];
}

export function loadAllOrdersVisibleColumnIds(): InventoryColumnId[] {
  if (typeof window === 'undefined') return getAllOrdersDefaultVisibleColumnIds();
  const raw = localStorage.getItem(ALL_ORDERS_COLUMN_STORAGE_KEY);
  if (!raw) return getAllOrdersDefaultVisibleColumnIds();
  try {
    return normalizeAllOrdersVisibleColumnIds(JSON.parse(raw) as InventoryColumnId[]);
  } catch {
    return getAllOrdersDefaultVisibleColumnIds();
  }
}

export function saveAllOrdersVisibleColumnIds(ids: InventoryColumnId[]) {
  localStorage.setItem(ALL_ORDERS_COLUMN_STORAGE_KEY, JSON.stringify(normalizeAllOrdersVisibleColumnIds(ids)));
}

export function getDefaultVisibleColumnIds(canViewPricing: boolean): InventoryColumnId[] {
  return normalizeInventoryVisibleColumnIds(INVENTORY_DEFAULT_COLUMN_IDS, canViewPricing);
}

export function normalizeInventoryVisibleColumnIds(
  ids: InventoryColumnId[],
  canViewPricing: boolean,
): InventoryColumnId[] {
  const allowed = new Set(
    INVENTORY_COLUMNS
      .filter((column) => !column.managerOnly || canViewPricing)
      .map((column) => column.id),
  );
  const selected = ids.filter((id, index) => (
    id !== 'actions'
    && id !== 'stt'
    && allowed.has(id)
    && ids.indexOf(id) === index
  ));

  return [...selected, 'actions'];
}

export function loadVisibleColumnIds(canViewPricing: boolean): InventoryColumnId[] {
  if (typeof window === 'undefined') return getDefaultVisibleColumnIds(canViewPricing);
  const raw = localStorage.getItem(INVENTORY_COLUMN_STORAGE_KEY);
  if (!raw) return getDefaultVisibleColumnIds(canViewPricing);
  try {
    const parsed = JSON.parse(raw) as InventoryColumnId[];
    return normalizeInventoryVisibleColumnIds(parsed, canViewPricing);
  } catch {
    return getDefaultVisibleColumnIds(canViewPricing);
  }
}

export function saveVisibleColumnIds(ids: InventoryColumnId[]) {
  localStorage.setItem(INVENTORY_COLUMN_STORAGE_KEY, JSON.stringify(ids));
}

/** Cột in A4 — cùng thứ tự & bộ cột như bảng màn hình, trừ cột thao tác. */
export function resolvePrintColumnIds(visibleColumnIds: InventoryColumnId[]): InventoryColumnId[] {
  const printable = new Set(
    INVENTORY_COLUMNS
      .filter((col) => col.id !== 'actions')
      .map((col) => col.id),
  );
  const selected = visibleColumnIds.filter(
    (id, index) => printable.has(id) && visibleColumnIds.indexOf(id) === index,
  );
  const withoutBill = selected.filter((id) => id !== 'waybill_code');
  return selected.includes('waybill_code') ? [...withoutBill, 'waybill_code'] : withoutBill;
}

const parseNote = (note: string | null | undefined, key: string) => {
  const m = (note || '').match(new RegExp(`${key}=([^|]+)`));
  return m?.[1]?.trim() || '';
};

/**
 * Trường note đang lưu chung ghi chú người dùng và metadata nội bộ dạng key=value.
 * Ưu tiên metadata user_note của đơn mới; đơn cũ vẫn dùng phần văn bản tự do.
 */
export function resolveUserNote(waybill: Pick<WaybillInventoryItem, 'note' | 'notes'>): string {
  return resolveWaybillDisplayNote(waybill.note || waybill.notes || '');
}

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
  const unit = parseNote(waybill.note || waybill.notes, 'billing_unit').trim();
  return /^(cân|can|kg)$/i.test(unit) ? 'Kg' : unit || 'Kg';
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
  return (
    waybill.noi_den?.trim()
    || waybill.customer_destination_province?.trim()
    || parseNote(waybill.note || waybill.notes, 'tinh_den')
    || parseNote(waybill.note || waybill.notes, 'huyen')
    || waybill.dest_hub?.code?.trim().toUpperCase()
    || ''
  );
}

export function resolveReceiverAddress(waybill: WaybillInventoryItem): string {
  if (waybill.receiver_address?.trim()) return waybill.receiver_address.trim();
  const info = waybill.receiver_info || '';
  if (!info.trim()) return '';
  if (info.includes('|')) {
    const parts = info.split('|').map((part) => part.trim());
    return parts[2] || parts[parts.length - 1] || '';
  }
  return info.trim();
}

export function resolveReceiverDistrict(waybill: WaybillInventoryItem): string {
  const address = resolveReceiverAddress(waybill);
  const explicit =
    waybill.receiver_district?.trim()
    || waybill.order?.receiver_district?.trim()
    || parseNote(waybill.note || waybill.notes, 'quan_huyen')
    || parseNote(waybill.order?.note, 'quan_huyen');
  return resolveVietnamDistrict(explicit, address);
}

export function resolveReceiverWard(waybill: WaybillInventoryItem): string {
  const address = resolveReceiverAddress(waybill);
  const explicit =
    waybill.receiver_ward?.trim()
    || waybill.order?.receiver_ward?.trim()
    || parseNote(waybill.note || waybill.notes, 'phuong_xa')
    || parseNote(waybill.order?.note, 'phuong_xa');
  return resolveVietnamWard(explicit, address);
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
  return resolveFreight(waybill);
}

export function resolveBillingQtyDetail(waybill: WaybillInventoryItem): string {
  const kg = resolveWeightKg(waybill);
  const volKg = resolveVolumetricWeightKg(waybill);
  const m3 = resolveVolumeM3(waybill);
  const unit = resolveBillingUnit(waybill);
  const parts: string[] = [];
  if (kg > 0) parts.push(`TT ${kg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`);
  if (volKg > 0) parts.push(`QĐ ${volKg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`);
  if (m3 > 0) parts.push(`${m3.toFixed(2)} CBM`);
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

export function resolveWeightKg(waybill: WaybillInventoryItem): number {
  const n = Number(waybill.actual_weight ?? waybill.weight ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function resolveVolumetricWeightKg(waybill: WaybillInventoryItem): number {
  const direct = Number(waybill.volumetric_weight ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const note = waybill.note || waybill.notes || '';
  const fromNote = Number(parseNote(note, 'volumetric_weight'));
  return Number.isFinite(fromNote) ? fromNote : 0;
}

export function resolveVolumeM3(waybill: WaybillInventoryItem): number {
  const direct = Number((waybill as { the_tich_m3?: number | string }).the_tich_m3 ?? 0);
  if (direct > 0) return direct;
  const note = waybill.note || waybill.notes || '';
  const noteM3 = Number(parseNote(note, 'the_tich_m3'));
  if (noteM3 > 0) return noteM3;
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
  volumetric_weight_kg: number;
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
        volumetric_weight_kg: acc.volumetric_weight_kg + resolveVolumetricWeightKg(w) * ratio,
        volume_m3: acc.volume_m3 + resolveVolumeM3(w) * ratio,
        freight: acc.freight + (includeFreight ? (Number(w.allocated_freight ?? resolveFreight(w)) || 0) : 0),
      };
    },
    { package_count: 0, weight_kg: 0, volumetric_weight_kg: 0, volume_m3: 0, freight: 0 },
  );
}

/** Thu chi chỉ áp dụng khi thanh toán COD hoặc Tiền mặt (CC) */
export function canCollectCashPayment(paymentType: WaybillInventoryItem['payment_type']): boolean {
  const pt = String(paymentType || '').toUpperCase();
  return pt === 'COD' || pt === 'CC';
}
