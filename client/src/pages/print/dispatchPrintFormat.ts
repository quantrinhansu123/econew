import { formatDisplayNumber } from '../warehouse/orders/orderFormUtils';

export interface DispatchPrintRow {
  viTriHang: string;
  ngayBoc: string;
  maTinh: string;
  tenCtv: string;
  dv: string;
  matHang: string;
  matHangNote: string;
  noiTra: string;
  soLuong: string;
  donVi: string;
  nguoiNhanPhone: string;
  nguoiNhanDiaChi: string;
  diaChiNhan: string;
  tinhTrangGiaoHang: string;
  ngayHoanThanh: string;
  keHoach: string;
  tangHaThuKhach: string;
  cuoc: string;
  laiXeThuHo: string;
  bcThuHo: string;
  maBill: string;
  ghiChu: string;
  ghiChu1: string;
  ghiChu2: string;
  kg: string;
  m3: string;
  duKienToiHcm: string;
  qd: string;
  isEmpty?: boolean;
}

export interface DispatchPrintTotals {
  soLuong: number;
  tangHaThuKhach: number;
  cuoc: number;
  kg: number;
  m3: number;
}

export { DISPATCH_PRINT_COLUMNS, DISPATCH_PRINT_HEADERS } from './dispatchPrintColumns';

export const DISPATCH_PRINT_MIN_ROWS = 10;

export const formatDispatchMoney = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return '';
  return formatDisplayNumber(num, 0);
};

export function formatDispatchQuantity(soLuong: string, donVi: string) {
  const qty = soLuong.trim();
  const unit = donVi.trim() || 'kiện';
  if (!qty) return '';
  return { qty, unit, text: `${qty} ${unit}` };
}

export function buildEmptyDispatchRow(position: number): DispatchPrintRow {
  return {
    viTriHang: String(position),
    ngayBoc: '',
    maTinh: '',
    tenCtv: '',
    dv: '',
    matHang: '',
    matHangNote: '',
    noiTra: '',
    soLuong: '',
    donVi: '',
    nguoiNhanPhone: '',
    nguoiNhanDiaChi: '',
    diaChiNhan: '',
    tinhTrangGiaoHang: '',
    ngayHoanThanh: '',
    keHoach: '',
    tangHaThuKhach: '',
    cuoc: '',
    laiXeThuHo: '',
    bcThuHo: '',
    maBill: '',
    ghiChu: '',
    ghiChu1: '',
    ghiChu2: '',
    kg: '',
    m3: '',
    duKienToiHcm: '',
    qd: '',
    isEmpty: true,
  };
}

export function padDispatchRows(rows: DispatchPrintRow[], minRows = DISPATCH_PRINT_MIN_ROWS): DispatchPrintRow[] {
  if (rows.length >= minRows) return rows;
  const padded = [...rows];
  for (let i = rows.length; i < minRows; i += 1) {
    padded.push(buildEmptyDispatchRow(i + 1));
  }
  return padded;
}
