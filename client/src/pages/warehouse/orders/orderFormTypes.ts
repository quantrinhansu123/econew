export type OrderWorkbenchTab = 'khach-hang' | 'hang-hoa' | 'thanh-toan';

export interface BillListItem {
  id: string;
  date: string;
  createdAt?: string | null;
  waybill_code: string;
  package_count: number;
  destination: string;
  senderName: string;
  customerCode: string;
  collectOnDelivery: number;
}

export interface NewOrderFormState {
  maKh: string;
  dienThoaiKh: string;
  nguoiGui: string;
  diaChiGui: string;
  dienThoaiNhan: string;
  noiDen: string;
  originHubId: string;
  destHubId: string;
  huyen: string;
  quanHuyen: string;
  phuongXa: string;
  tenCongTyNhan: string;
  nguoiNhan: string;
  diaChiNhan: string;
  soBill: string;
  loaiBp: string;
  dichVu: string;
  gio: string;
  giaoHang: string;
  klKg: string;
  soKien: string;
  nvgn: string;
  chieuDai: string;
  chieuRong: string;
  chieuCao: string;
  klQuyDoi: string;
  m3: string;
  donGia: string;
  donGiaDonVi: string;
  dichVuGiaTang: string;
  soKhoang: string;
  noiDung: string;
  ghiChu: string;
  billImages: string[];
  xeLay: string;
  buuTaLay: string;
  xePhat: string;
  buuTaPhat: string;
  dvdb: string;
  cuocChinh: string;
  ngayDi: string;
  phuongThuc: string;
  thueSuat: string;
  vat: string;
  cod: string;
  tongCuoc: string;
  giamGia: string;
  thanhToan: string;
  coVat: boolean;
  trangThai: string;
}
