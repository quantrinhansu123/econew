import type { NewOrderFormState } from './orderFormTypes';

export const ORDER_TABS = [
  { id: 'khach-hang' as const, label: 'Thông tin khách hàng' },
  { id: 'hang-hoa' as const, label: 'Thông tin hàng hóa' },
  { id: 'thanh-toan' as const, label: 'Thanh toán' },
];

export const LOAI_BP_OPTIONS = ['CPN', 'Hỏa tốc', 'Tiết kiệm'];
export const DICH_VU_OPTIONS = ['Tiêu chuẩn 72h', 'Nhanh 48h', 'Chậm 4-6 ngày'] as const;
export const GIO_OPTIONS = ['8h', '10h', '12h', '14h', '16h', '18h'];
export const GIAO_HANG_OPTIONS = ['Văn phòng', 'Tận nơi', 'Lấy tại kho'];
export const DON_GIA_DON_VI_OPTIONS = ['Cân', 'Khối', 'Trọn gói', 'Chuyến', 'Lô'];
export const PHUONG_THUC_OPTIONS = [
  'Công nợ',
  'Công nợ tháng',
  'Công nợ chuyến',
  'Người nhận thanh toán',
  'Đã thanh toán',
];

export const todayInputValue = () => new Date().toISOString().slice(0, 10);

export const emptyOrderForm = (): NewOrderFormState => ({
  maKh: '',
  dienThoaiKh: '',
  nguoiGui: '',
  diaChiGui: '',
  dienThoaiNhan: '',
  noiDen: 'HCM',
  originHubId: '',
  destHubId: '',
  huyen: '',
  quanHuyen: '',
  phuongXa: '',
  nguoiNhan: '',
  diaChiNhan: '',
  soBill: '',
  loaiBp: 'CPN',
  dichVu: 'Tiêu chuẩn 72h',
  gio: '16h',
  giaoHang: 'Văn phòng',
  klKg: '',
  soKien: '1',
  nvgn: 'ADMIN',
  chieuDai: '0',
  chieuRong: '0',
  chieuCao: '0',
  klQuyDoi: '',
  m3: '',
  donGia: '0',
  donGiaDonVi: 'Cân',
  dichVuGiaTang: 'Tiêu chuẩn',
  soKhoang: '',
  noiDung: '',
  ghiChu: '',
  billImages: [],
  xeLay: '',
  buuTaLay: '',
  xePhat: '',
  buuTaPhat: '',
  dvdb: '0',
  cuocChinh: '',
  ngayDi: todayInputValue(),
  phuongThuc: 'Công nợ tháng',
  thueSuat: '0%',
  vat: '0',
  cod: '0',
  tongCuoc: '',
  giamGia: '0',
  thanhToan: '',
  coVat: false,
  trangThai: 'RECEIVED',
});

export const sampleOrderForm = (): NewOrderFormState => ({
  ...emptyOrderForm(),
  maKh: 'ALPHATIC',
  nguoiGui: 'ALPHATIC',
  dienThoaiNhan: '0888727897',
  noiDen: 'HCM',
  huyen: 'HỒ CHÍ MINH',
  quanHuyen: 'Quận 1',
  phuongXa: 'Phường Nguyễn Cư Trinh',
  nguoiNhan: 'Tuấn Nguyễn',
  diaChiNhan: '215i Nguyễn Trãi, P. Nguyễn Cư Trinh, Quận 1, TP HCM',
  soBill: 'ECOHAN1',
  klKg: '50',
  soKien: '1',
  klQuyDoi: '50',
  m3: '0.060',
  noiDung: 'APT5171-1HN',
  cuocChinh: '250000',
  tongCuoc: '250000',
  thanhToan: '250000',
});
