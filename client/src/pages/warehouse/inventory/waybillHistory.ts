import { formatMoney } from '../../../lib/formatMoney';
import { specialGoodsLabels } from '../../../lib/waybillSpecialGoods';

export interface WaybillHistoryFieldChange {
  old_value: unknown;
  new_value: unknown;
}

export interface WaybillHistoryEntry {
  id: string | number;
  waybill_id: string | number;
  action: string;
  changes: Record<string, WaybillHistoryFieldChange>;
  changed_by_id?: string | number | null;
  changed_by_name?: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Tạo vận đơn',
  UPDATED: 'Chỉnh sửa vận đơn',
  COD_FEE_UPDATED: 'Cập nhật COD / cước',
  PHOTOS_UPDATED: 'Cập nhật ảnh bill',
  LEGACY_UPDATE: 'Đã cập nhật trước khi bật lịch sử',
};

const FIELD_LABELS: Record<string, string> = {
  waybill_code: 'Số bill',
  ma_kh: 'Mã khách hàng',
  sender_name: 'Người gửi',
  sender_phone: 'Điện thoại KH',
  sender_address: 'Địa chỉ gửi',
  receiver_company_name: 'Tên công ty nhận',
  receiver_name: 'Người nhận',
  receiver_phone: 'ĐT người nhận',
  receiver_address: 'Địa chỉ nhận',
  noi_den: 'Tỉnh/Thành nhận',
  quan_huyen: 'Quận/Huyện nhận',
  phuong_xa: 'Phường/Xã nhận',
  origin_hub_id: 'HUB gửi',
  dest_hub_id: 'HUB đến',
  package_count: 'Số kiện',
  weight: 'Số cân',
  length: 'Dài',
  width: 'Rộng',
  height: 'Cao',
  volumetric_weight: 'Khối lượng quy đổi',
  the_tich_m3: 'Số khối',
  cod_amount: 'COD',
  freight_amount: 'Tổng cước',
  cc_amount: 'Cước người nhận trả',
  noi_dung: 'Nội dung hàng',
  ghi_chu: 'Ghi chú',
  tinh_chat_hang_hoa: 'Tính chất hàng hóa đặc biệt',
  dich_vu: 'Dịch vụ',
  giao_hang: 'Giao hàng',
  ngay_gui: 'Ngày gửi',
  phuong_thuc: 'Phương thức',
  so_anh: 'Số ảnh bill',
};

const MONEY_FIELDS = new Set(['cod_amount', 'freight_amount', 'cc_amount']);
const CENTIMETER_FIELDS = new Set(['length', 'width', 'height']);

export const waybillHistoryActionLabel = (action: string) => ACTION_LABELS[action] || action;

export const waybillHistoryFieldLabel = (field: string) => FIELD_LABELS[field] || field;

export function formatWaybillHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'tinh_chat_hang_hoa') return specialGoodsLabels(value).join(', ') || '—';
  if (MONEY_FIELDS.has(field)) return formatMoney(value as number | string);
  if (field === 'weight' || field === 'volumetric_weight') return `${value} kg`;
  if (field === 'the_tich_m3') return `${value} m³`;
  if (CENTIMETER_FIELDS.has(field)) return `${value} cm`;
  if (field === 'origin_hub_id' || field === 'dest_hub_id') return `#${value}`;
  return String(value);
}
