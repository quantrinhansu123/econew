import { utils, writeFile } from 'xlsx';
import type { LoadPlanningBoardResponse } from './types';
import { splitLoadStatusLabel } from '../splits/splitLoadStatus';

const cell = (value?: string | number | null) => (value == null || value === '' ? '' : value);

export function buildLoadPlanningExcelRows(
  board: LoadPlanningBoardResponse,
  showPricing: boolean,
): Record<string, string | number>[] {
  return board.trucks.flatMap((truck) => {
    const plate = truck.license_plate || '';
    const nhaXe = truck.nha_xe || '';
    return truck.items.map((item) => {
      const goods = [item.mat_hang, item.mat_hang_note].filter(Boolean).join(' - ');
      const row: Record<string, string | number> = {
        'Biển số xe': plate,
        'Nhà xe (NCC)': nhaXe,
        'Mã vận đơn': cell(item.waybill_code),
        'Vị trí': cell(item.vi_tri_hang ?? item.loading_position),
        'Trạng thái': splitLoadStatusLabel(item.load_status),
        'Ngày bốc': cell(item.ngay_boc),
        'Ngày tới': cell(item.ngay_toi),
        'Mã tỉnh': cell(item.ma_tinh || item.noi_den),
        'Tên CTY': cell(item.ten_cty),
        'DV': cell(item.dv || 'TC'),
        'Mặt hàng': goods || cell(item.waybill_code),
        'Nơi trả': cell(item.noi_tra),
        'Số lượng': Number(item.so_luong ?? 0) || '',
        'Loại': cell(item.loai || 'kiện'),
        'Địa chỉ': cell(item.dia_chi),
      };
      if (showPricing) {
        row['Cước phí'] = Number(item.allocated_freight ?? 0) || '';
      }
      return row;
    });
  });
}

export function downloadLoadPlanningExcel(
  board: LoadPlanningBoardResponse,
  showPricing: boolean,
  fileBaseName = 'phan-xe-uu-tien',
) {
  const rows = buildLoadPlanningExcelRows(board, showPricing);
  if (!rows.length) return false;

  const worksheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Phan xe');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${fileBaseName}-${stamp}.xlsx`);
  return true;
}
