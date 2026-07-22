export type OrderBulkFieldKey =
  | 'bcGui'
  | 'bcDen'
  | 'maKh'
  | 'dienThoaiKh'
  | 'nguoiGui'
  | 'diaChiGui'
  | 'nguoiNhan'
  | 'dienThoaiNhan'
  | 'diaChiNhan'
  | 'huyen'
  | 'quanHuyen'
  | 'phuongXa'
  | 'soBill'
  | 'soKien'
  | 'dichVu'
  | 'giaoHang'
  | 'ngayDi'
  | 'donGiaDonVi'
  | 'klKg'
  | 'chieuDai'
  | 'chieuRong'
  | 'chieuCao'
  | 'm3'
  | 'nvgn'
  | 'noiDung'
  | 'ghiChu'
  | 'phuongThuc'
  | 'donGia'
  | 'cod'
  | 'giamGia'
  | 'anh1'
  | 'anh2'
  | 'anh3'
  | 'anh4';

export interface OrderBulkColumn {
  key: OrderBulkFieldKey;
  label: string;
  required: boolean;
  sample?: string;
}

export const ORDER_BULK_TEMPLATE_NOTES: Partial<Record<OrderBulkFieldKey, string>> = {
  bcGui: 'bắt buộc',
  bcDen: 'bắt buộc',
  maKh: 'bắt buộc',
  dienThoaiKh: 'tự nhảy theo Mã KH nếu có',
  nguoiGui: 'tự nhảy theo Mã KH',
  diaChiGui: 'tự nhảy theo Mã KH',
  nguoiNhan: 'HCM tự nhảy; tỉnh khác nhập',
  dienThoaiNhan: 'HCM tự nhảy; tỉnh khác nhập',
  diaChiNhan: 'HCM tự nhảy; tỉnh khác nhập',
  soBill: 'không nhập; tự nhảy theo thứ tự',
  dichVu: 'bắt buộc',
  giaoHang: 'bắt buộc',
  ngayDi: 'tự nhảy',
  nvgn: 'tự nhảy',
  phuongThuc: 'bắt buộc',
};

export const ORDER_BULK_COLUMNS: OrderBulkColumn[] = [
  { key: 'bcGui', label: 'BC gửi', required: true, sample: 'HAN' },
  { key: 'bcDen', label: 'BC đến', required: true, sample: 'HCM' },
  { key: 'maKh', label: 'Mã KH', required: true, sample: 'ALPHATIC' },
  { key: 'dienThoaiKh', label: 'Điện thoại KH', required: false, sample: '0901234567' },
  { key: 'nguoiGui', label: 'Người gửi', required: true, sample: 'Công ty ABC' },
  { key: 'diaChiGui', label: 'Địa chỉ gửi', required: false, sample: 'Thanh Trì, Hà Nội' },
  { key: 'nguoiNhan', label: 'Người nhận', required: true, sample: 'Nguyễn Văn A' },
  { key: 'dienThoaiNhan', label: 'ĐT người nhận', required: false, sample: '0888727897' },
  { key: 'diaChiNhan', label: 'Địa chỉ nhận', required: true, sample: '215 Nguyễn Trãi, Q.1, TP.HCM' },
  { key: 'huyen', label: 'Tỉnh/Thành', required: false, sample: 'HỒ CHÍ MINH' },
  { key: 'quanHuyen', label: 'Quận/Huyện', required: false, sample: 'Quận 1' },
  { key: 'phuongXa', label: 'Phường/Xã', required: false, sample: 'Phường Nguyễn Cư Trinh' },
  { key: 'soBill', label: 'Số bill', required: false, sample: '' },
  { key: 'soKien', label: 'Số kiện', required: false, sample: '1' },
  { key: 'dichVu', label: 'Dịch vụ', required: true, sample: 'Tiêu chuẩn 72h' },
  { key: 'giaoHang', label: 'Giao hàng', required: true, sample: 'Văn phòng' },
  { key: 'ngayDi', label: 'Ngày gửi', required: false, sample: '' },
  { key: 'donGiaDonVi', label: 'Tính cước theo', required: false, sample: 'Kg' },
  { key: 'klKg', label: 'Số cân (kg)', required: false, sample: '50' },
  { key: 'chieuDai', label: 'Dài (cm)', required: false, sample: '60' },
  { key: 'chieuRong', label: 'Rộng (cm)', required: false, sample: '40' },
  { key: 'chieuCao', label: 'Cao (cm)', required: false, sample: '25' },
  { key: 'm3', label: 'Số khối (m³)', required: false, sample: '' },
  { key: 'nvgn', label: 'NVGN', required: false, sample: 'ADMIN' },
  { key: 'noiDung', label: 'Nội dung', required: false, sample: 'Hàng mẫu' },
  { key: 'ghiChu', label: 'Ghi chú', required: false, sample: '' },
  { key: 'phuongThuc', label: 'Phương thức', required: true, sample: 'Công nợ tháng' },
  { key: 'donGia', label: 'Đơn giá', required: false, sample: '5000' },
  { key: 'cod', label: 'COD', required: false, sample: '0' },
  { key: 'giamGia', label: 'Phụ phí (công)', required: false, sample: '0' },
  { key: 'anh1', label: 'URL ảnh 1', required: false, sample: '' },
  { key: 'anh2', label: 'URL ảnh 2', required: false, sample: '' },
  { key: 'anh3', label: 'URL ảnh 3', required: false, sample: '' },
  { key: 'anh4', label: 'URL ảnh 4', required: false, sample: '' },
];

export const ORDER_BULK_INSTRUCTIONS = [
  'Cột có dấu * là bắt buộc. Cột không có * để trống được.',
  'BC gửi / BC đến: nhập mã bưu cục (HAN, HCM, …).',
  'Mã KH*: hệ thống tự lấy người gửi và SĐT khách hàng từ hồ sơ Mã KH.',
  'Số bill: để trống, hệ thống tự sinh theo BC gửi khi nhập loạt.',
  'Ngày gửi và NVGN: để trống để hệ thống tự điền.',
  'Tỉnh/Thành nhận là HCM: tự lấy người nhận, SĐT và địa chỉ kho HCM theo Mã KH. Tỉnh khác nhập theo từng đơn.',
  'Cần có ít nhất một trong: Số cân (kg), bộ Dài/Rộng/Cao (cm), hoặc Số khối (m³).',
  'ĐT người nhận phải đúng định dạng SĐT Việt Nam; có thể viết liền, cách hoặc có dấu chấm/gạch.',
  'Ảnh bill/hàng hóa: nhập tối đa 4 URL ảnh công khai vào các cột URL ảnh 1–4.',
  'Xóa dòng mẫu trước khi nhập dữ liệu thật.',
];

export function orderBulkHeaderLabel(column: OrderBulkColumn) {
  return column.required ? `${column.label}*` : column.label;
}
