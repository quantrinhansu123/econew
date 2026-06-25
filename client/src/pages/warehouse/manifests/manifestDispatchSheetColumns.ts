import type { DispatchPrintColumnId } from '../../print/dispatchPrintColumns';
import type { DispatchFieldKey } from './manifestDispatchDefaults';

export type DispatchSheetColumnId = DispatchPrintColumnId;

export interface DispatchSheetColumnMeta {
  id: DispatchSheetColumnId;
  fieldKey?: DispatchFieldKey;
  /** Cột số lượng gồm cả đơn vị (loai). */
  compositeLoai?: boolean;
  readOnly?: boolean;
  money?: boolean;
  phoneInAddress?: boolean;
  cellClass?: string;
  minWidth?: string;
}

const meta: Partial<Record<DispatchSheetColumnId, DispatchSheetColumnMeta>> = {
  viTriHang: { id: 'viTriHang', readOnly: true, minWidth: '56px' },
  ngayBoc: { id: 'ngayBoc', fieldKey: 'ngay_boc', minWidth: '76px' },
  maTinh: { id: 'maTinh', fieldKey: 'ma_tinh', readOnly: true, minWidth: '86px' },
  tenCtv: { id: 'tenCtv', fieldKey: 'ten_cty', minWidth: '120px' },
  dv: { id: 'dv', fieldKey: 'dv', minWidth: '58px' },
  matHang: { id: 'matHang', fieldKey: 'mat_hang', readOnly: true, minWidth: '180px' },
  noiTra: { id: 'noiTra', fieldKey: 'noi_tra', minWidth: '130px' },
  soLuong: { id: 'soLuong', fieldKey: 'so_luong', compositeLoai: true, minWidth: '90px' },
  diaChiNhan: { id: 'diaChiNhan', fieldKey: 'dia_chi', readOnly: true, phoneInAddress: true, minWidth: '300px' },
  tinhTrangGiaoHang: { id: 'tinhTrangGiaoHang', fieldKey: 'trang_thai_giao', cellClass: 'bg-green-200', minWidth: '140px' },
  ngayHoanThanh: { id: 'ngayHoanThanh', fieldKey: 'ngay_hoan_thanh', minWidth: '100px' },
  keHoach: { id: 'keHoach', fieldKey: 'ke_hoach', minWidth: '120px' },
  tangHaThuKhach: { id: 'tangHaThuKhach', fieldKey: 'cod', money: true, minWidth: '100px' },
  cuoc: { id: 'cuoc', readOnly: true, money: true, minWidth: '92px' },
  laiXeThuHo: { id: 'laiXeThuHo', fieldKey: 'lai_xe_thu_ho', money: true, minWidth: '110px' },
  bcThuHo: { id: 'bcThuHo', fieldKey: 'bc_thu_ho', money: true, minWidth: '92px' },
  maBill: { id: 'maBill', fieldKey: 'ma_bill', readOnly: true, minWidth: '110px' },
  ghiChu: { id: 'ghiChu', fieldKey: 'ghi_chu_bill', readOnly: true, minWidth: '140px' },
  ghiChu1: { id: 'ghiChu1', fieldKey: 'ghi_chu_1', minWidth: '140px' },
  ghiChu2: { id: 'ghiChu2', fieldKey: 'ghi_chu_2', minWidth: '160px' },
  kg: { id: 'kg', fieldKey: 'kg', minWidth: '72px' },
  m3: { id: 'm3', fieldKey: 'm3', minWidth: '72px' },
  duKienToiHcm: { id: 'duKienToiHcm', fieldKey: 'du_kien_toi_hcm', cellClass: 'bg-yellow-100', minWidth: '120px' },
  qd: { id: 'qd', fieldKey: 'qd', minWidth: '72px' },
};

export function getDispatchSheetColumnMeta(id: DispatchSheetColumnId): DispatchSheetColumnMeta {
  return meta[id] ?? { id };
}
