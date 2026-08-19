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
  WAREHOUSE_RECEIVED: 'Xác nhận đã nhập kho',
  LEGACY_UPDATE: 'Đã cập nhật trước khi bật lịch sử',
  DELIVERY_PREPARATION_READY: 'Khách xác nhận sẵn sàng giao',
  DELIVERY_PREPARATION_SCHEDULED: 'Lưu kho và hẹn ngày giao',
  DELIVERY_PREPARATION_HOLD: 'Lưu kho chờ xử lý',
  DELIVERY_SCHEDULE_DUE: 'Đến hạn cần xử lý giao',
  DELIVERY_ROUTE_ASSIGNED: 'Phân tuyến giao',
  DELIVERY_OUT_FOR_DELIVERY: 'Điều phối xe đi giao',
  DELIVERY_DELIVERED: 'Giao hàng thành công',
  DELIVERY_FAILED: 'Giao hàng không thành công',
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
  current_state: 'Trạng thái vận đơn',
  warehouse_intake_method: 'Hình thức nhập kho',
  warehouse_intake_truck_id: 'Xe lấy hàng',
  warehouse_intake_vendor_id: 'NCC lấy hàng',
  warehouse_intake_driver_id: 'Tài xế lấy hàng',
  warehouse_intake_license_plate: 'BKS xe lấy',
  warehouse_intake_driver_name: 'Tên tài xế lấy',
  warehouse_intake_vendor_name: 'Tên NCC lấy',
  warehouse_intake_note: 'Ghi chú nhập kho',
  route_code: 'Tuyến giao',
  delivery_assignment_type: 'Hình thức giao',
  last_mile_driver_id: 'Tài xế giao',
  last_mile_truck_id: 'Xe giao',
  last_mile_vendor_id: 'NCC giao',
  xe_phat: 'Xe/NCC phát',
  delivery_preparation_status: 'Trạng thái xử lý trước giao',
  delivery_scheduled_at: 'Ngày hẹn giao',
  delivery_hold_reason: 'Lý do lưu kho',
  delivery_preparation_note: 'Ghi chú xử lý giao',
  delivery_confirmed_at: 'Thời gian xác nhận',
  last_delivery_failure_reason: 'Lý do giao không thành công',
  sent_date: 'Ngày gửi trên bill',
  split_status: 'Trạng thái phần hàng',
  trip_id: 'Chuyến nguồn',
};

const MONEY_FIELDS = new Set(['cod_amount', 'freight_amount', 'cc_amount']);
const CENTIMETER_FIELDS = new Set(['length', 'width', 'height']);

export const waybillHistoryActionLabel = (action: string) => ACTION_LABELS[action] || action;

export const waybillHistoryFieldLabel = (field: string) => FIELD_LABELS[field] || field;

export function formatWaybillHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'delivery_assignment_type') {
    return ({
      INTERNAL: 'Xe nội bộ',
      PARTNER: 'Xe đối tác',
      TECHNOLOGY: 'Xe công nghệ',
      CUSTOMER_PICKUP: 'Khách tới HUB lấy',
    } as Record<string, string>)[String(value)] || String(value);
  }
  if (field === 'warehouse_intake_method') {
    return ({
      INTERNAL: 'Xe nội bộ',
      VENDOR: 'Xe nhà cung cấp',
      CUSTOMER_DROPOFF: 'Khách mang đến',
    } as Record<string, string>)[String(value)] || String(value);
  }
  if (field === 'tinh_chat_hang_hoa') return specialGoodsLabels(value).join(', ') || '—';
  if (MONEY_FIELDS.has(field)) return formatMoney(value as number | string);
  if (field === 'weight' || field === 'volumetric_weight') return `${value} kg`;
  if (field === 'the_tich_m3') return `${value} m³`;
  if (CENTIMETER_FIELDS.has(field)) return `${value} cm`;
  if (field === 'origin_hub_id' || field === 'dest_hub_id') return `#${value}`;
  return String(value);
}
