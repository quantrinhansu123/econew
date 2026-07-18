import { utils, writeFile } from 'xlsx';
import type { LoadPlanningBoardResponse } from './types';
import { splitLoadStatusLabel } from '../splits/splitLoadStatus';
import { resolveVietnamDistrict, resolveVietnamWard } from '../../../lib/vietnamAddressParts';

const cell = (value?: string | number | null) => (value == null || value === '' ? '' : value);
const headers = ['Vị trí hàng', 'Ngày bốc', 'Mã Tỉnh', 'Quận/Huyện', 'Phường/Xã', 'Tên CTY', 'DV', 'Mặt Hàng', 'Nơi Trả', 'Số Lượng', '', '', 'Ghi chú', 'kế hoạch', 'Lái xe thu hộ', 'BC thu  hộ', 'Mã Bill', 'Ghi chú'];
const extra = (item: unknown, key: string) => (item as Record<string, string | number | null | undefined>)[key];

export function buildLoadPlanningExcelRows(
  board: LoadPlanningBoardResponse,
  showPricing: boolean,
): Array<Array<string | number>> {
  return board.trucks.flatMap((truck) => {
    return truck.items.map((item) => {
      const goods = [item.mat_hang, item.mat_hang_note].filter(Boolean).join(' - ');
      return [
        cell(item.vi_tri_hang ?? item.loading_position),
        cell(item.ngay_boc),
        cell(item.ma_tinh || item.noi_den),
        cell(resolveVietnamDistrict(item.quan_huyen, item.dia_chi)),
        cell(resolveVietnamWard(item.phuong_xa, item.dia_chi)),
        cell(item.ten_cty),
        cell(item.dv || 'TC'),
        goods || cell(item.waybill_code),
        cell(item.noi_tra),
        Number(item.so_luong ?? 0) || '',
        cell(item.loai || 'kiện'),
        cell(item.dia_chi),
        cell(item.mat_hang_note),
        splitLoadStatusLabel(item.load_status),
        Number(extra(item, 'allocated_cod') ?? 0) || '',
        showPricing ? Number(item.allocated_freight ?? 0) || '' : '',
        cell(item.waybill_code),
        cell(extra(item, 'split_note') || extra(item, 'note')),
      ];
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

  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Phan xe');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${fileBaseName}-${stamp}.xlsx`);
  return true;
}
