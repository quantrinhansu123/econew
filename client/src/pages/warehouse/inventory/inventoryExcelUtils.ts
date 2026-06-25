import { utils, writeFile } from 'xlsx';
import {
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
  resolveReceiverAddress,
  resolveReceiverPhone,
  resolveVolumeM3,
  resolveWeightKg,
} from './inventoryColumns';
import type { BadgeConfig, WaybillInventoryItem } from './types';

const cell = (value?: string | number | null) => (value == null || value === '' ? '' : value);
const dateCell = (value?: string | null) => (value ? new Date(value).toLocaleDateString('vi-VN') : '');
const numberCell = (value: number) => (Number.isFinite(value) && value !== 0 ? value : '');

function packageLabel(waybill: WaybillInventoryItem) {
  const packages = Number(waybill.trip_package_count ?? waybill.remaining_packages ?? waybill.package_count ?? 0);
  const totalPackages = Number(waybill.order_total_packages ?? waybill.package_count ?? packages);
  if (!packages && !totalPackages) return '';
  return totalPackages > packages && packages > 0 ? `${packages}/${totalPackages}` : String(packages || totalPackages);
}

export function buildInventoryExcelRows(
  waybills: WaybillInventoryItem[],
  showPricing: boolean,
  statusConfig: Record<string, BadgeConfig>,
  priorityConfig: Record<string, BadgeConfig>,
): Record<string, string | number>[] {
  return waybills.map((waybill, index) => {
    const status = String(waybill.current_state || waybill.status || '');
    const priority = String(waybill.priority || '');
    const row: Record<string, string | number> = {
      STT: index + 1,
      'Mã đơn hàng': cell(waybill.order_code),
      'Tên khách': resolveCustomerName(waybill),
      'Mã vận đơn': cell(waybill.waybill_code || waybill.code),
      'Bill/Cộng SG': cell(waybill.noi_dung || waybill.mat_hang),
      'Dịch vụ': resolveServiceType(waybill),
      'Phân xe': cell(waybill.trip_label || waybill.license_plate || 'Chưa phân xe'),
      'Ngày bốc hàng': dateCell(resolveLoadedAt(waybill)),
      'Ngày nhận đơn': dateCell(waybill.received_at || waybill.created_at || null),
      'Trạng thái': statusConfig[status]?.label || status,
      'Tỉnh đến': resolveNoiDen(waybill),
      ĐVT: resolveBillingUnit(waybill),
      'Đơn giá': numberCell(resolveUnitPrice(waybill)),
      'Trung chuyển': numberCell(resolveTransitFee(waybill)),
      'Tuyến': cell(waybill.route_code || waybill.delivery_route),
      'Mã KH': resolveMaKh(waybill),
      'Người gửi': cell(waybill.sender_info),
      'Người nhận': cell(waybill.receiver_info),
      'Địa chỉ đến': resolveReceiverAddress(waybill),
      'SĐT người nhận': resolveReceiverPhone(waybill),
      'Số kiện': packageLabel(waybill),
      'Trọng lượng (kg)': numberCell(resolveWeightKg(waybill)),
      'Thể tích (m³)': numberCell(resolveVolumeM3(waybill)),
      'Thanh toán': cell(waybill.payment_type),
      'Hình thức TT': resolvePaymentMethod(waybill),
      'Tình trạng TT': waybill.customer_payment_status === 'PAID' ? 'Đã TT' : waybill.customer_payment_status === 'SENT_STATEMENT' ? 'Đã gửi bảng kê' : '',
      'Ghi chú TT': cell(waybill.customer_payment_note),
      COD: numberCell(Number(waybill.allocated_cod ?? waybill.cod_amount ?? 0)),
      'Ưu tiên': priorityConfig[priority]?.label || priority,
      'Hub hiện tại': cell(waybill.current_hub?.name || waybill.current_hub?.code),
      'Hub đến': cell(waybill.dest_hub?.name || waybill.dest_hub?.code),
      'Ghi chú': cell(waybill.split_note || waybill.note || waybill.notes),
    };
    if (showPricing) {
      const cuocPhi = Number(waybill.allocated_freight ?? resolveFreight(waybill)) || 0;
      row['Cước phí'] = numberCell(cuocPhi);
      row['Thành tiền'] = numberCell(cuocPhi + resolveTransitFee(waybill));
    }
    return row;
  });
}

export function downloadInventoryExcel(
  waybills: WaybillInventoryItem[],
  showPricing: boolean,
  statusConfig: Record<string, BadgeConfig>,
  priorityConfig: Record<string, BadgeConfig>,
  fileBaseName: string,
) {
  const rows = buildInventoryExcelRows(waybills, showPricing, statusConfig, priorityConfig);
  if (!rows.length) return false;

  const worksheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Danh sach don');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${fileBaseName}-${stamp}.xlsx`);
  return true;
}
