import { utils, writeFile } from 'xlsx';
import type { LoadPlanningManifest, ManifestWaybill } from './types';

type ManifestExcelWaybill = ManifestWaybill & Record<string, unknown>;

const headers = ['Vị trí hàng', 'Ngày bốc', 'Mã Tỉnh', 'Tên CTY', 'DV', 'Mặt Hàng', 'Nơi Trả', 'Số Lượng', '', '', 'Ghi chú', 'kế hoạch', 'Lái xe thu hộ', 'BC thu  hộ', 'Mã Bill', 'Ghi chú'];
const cell = (value: unknown) => (value == null || value === '' ? '' : value);
const first = (waybill: ManifestExcelWaybill, keys: string[]) => keys.map((key) => waybill[key]).find((value) => value != null && value !== '') ?? '';

function normalizeWaybills(manifest: LoadPlanningManifest): ManifestExcelWaybill[] {
  if (manifest.waybills?.length) return manifest.waybills as ManifestExcelWaybill[];
  return (manifest.manifest_waybills || []).map((link) => link.waybill).filter(Boolean) as ManifestExcelWaybill[];
}

export function buildManifestDetailExcelRows(manifest: LoadPlanningManifest) {
  return normalizeWaybills(manifest).map((waybill) => [
    cell(first(waybill, ['vi_tri_hang', 'loading_position', 'position'])),
    cell(first(waybill, ['ngay_boc', 'loaded_at', 'received_at', 'created_at'])),
    cell(first(waybill, ['ma_tinh', 'noi_den', 'dest_province'])),
    cell(first(waybill, ['ten_cty', 'customer_name', 'receiver_company', 'receiver_info'])),
    cell(first(waybill, ['dv', 'service_type']) || 'TC'),
    cell([first(waybill, ['mat_hang', 'goods_name', 'item_name']), first(waybill, ['mat_hang_note', 'goods_note'])].filter(Boolean).join(' - ') || waybill.waybill_code),
    cell(first(waybill, ['noi_tra', 'dropoff', 'receiver_address'])),
    cell(first(waybill, ['so_luong', 'package_count', 'declared_package_count'])),
    cell(first(waybill, ['loai', 'package_type'])),
    cell(first(waybill, ['dia_chi', 'address'])),
    cell(first(waybill, ['ghi_chu_hang', 'split_note', 'note', 'notes'])),
    cell(first(waybill, ['ke_hoach', 'plan_note', 'loading_plan'])),
    cell(first(waybill, ['lai_xe_thu_ho', 'driver_collect_amount', 'allocated_cod', 'cod_amount'])),
    cell(first(waybill, ['bc_thu_ho', 'hub_collect_amount', 'allocated_freight', 'cost_amount', 'freight_amount'])),
    cell(first(waybill, ['ma_bill', 'waybill_code', 'code'])),
    cell(first(waybill, ['ghi_chu', 'manifest_note', 'delivery_note'])),
  ]);
}

export function downloadManifestDetailExcel(manifest: LoadPlanningManifest) {
  const rows = buildManifestDetailExcelRows(manifest);
  if (!rows.length) return false;

  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Chi tiet bang ke');

  const baseName = manifest.manifest_code || manifest.code || `bang-ke-${manifest.id}`;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${baseName}-chi-tiet-${stamp}.xlsx`);
  return true;
}
