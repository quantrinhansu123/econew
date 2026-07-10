import type { StackOntoTruckFormRow, StackOntoTruckSharedFields } from '../warehouse/inventory/stackOntoTruckUtils';
import type { WaybillInventoryItem } from '../warehouse/inventory/types';
import type { LoadPlanningBoardFilters, LoadPlanningBoardItem, LoadPlanningBoardResponse, LoadPlanningTruckGroup } from '../warehouse/load-planning/types';
import { splitLoadStatusLabel } from '../warehouse/splits/splitLoadStatus';
import type { DispatchPrintColumnId } from './dispatchPrintColumns';
import { loadVisibleDispatchColumnIds } from './dispatchPrintColumns';
import type { DispatchPrintRow, DispatchPrintTotals } from './dispatchPrintFormat';
import { formatDispatchMoney } from './dispatchPrintFormat';

export const LOAD_PLANNING_PRINT_STORAGE_KEY = 'eco_load_planning_print_v2';

export interface LoadPlanningPrintGroup {
  truckLabel: string;
  licensePlate: string;
  nhaXe: string;
  manifestCode: string;
  driverName?: string;
  driverPhone?: string;
  expectedArrival?: string | null;
  rows: DispatchPrintRow[];
  totals: DispatchPrintTotals;
}

export interface LoadPlanningPrintPayload {
  title: string;
  printedAt: string;
  filterSummary: string;
  showPricing: boolean;
  visibleColumnIds?: DispatchPrintColumnId[];
  groups: LoadPlanningPrintGroup[];
}

const fmt = (value?: string | number | null) => (value == null || value === '' ? '' : String(value));

const DISPATCH_COMPLETION_DAYS = 3;

function normalizeNgayBoc(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}`;
  return raw;
}

function parseDispatchDayMonth(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (!day || month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getDate() !== day || date.getMonth() !== month - 1) return null;
  return date;
}

function formatDispatchDayMonth(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function addDaysToDispatchDate(ngayBoc: string, days: number) {
  const date = parseDispatchDayMonth(ngayBoc);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return formatDispatchDayMonth(date);
}

const isCarrierGoodsNote = (note: string, item: LoadPlanningBoardItem) => {
  const normalized = note.trim().toLowerCase();
  if (/^xe\s/.test(normalized)) return true;
  const carrier = String(item.xe_phat ?? '').trim().toLowerCase();
  if (carrier && (normalized === carrier || normalized === `xe ${carrier}`)) return true;
  return false;
};

const extra = (item: LoadPlanningBoardItem, key: string) =>
  (item as unknown as Record<string, string | number | null | undefined>)[key];

function parseNoteField(note: string | null | undefined, key: string) {
  const match = (note || '').match(new RegExp(`${key}=([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function resolveWaybillGoods(waybill: WaybillInventoryItem | undefined) {
  const record = waybill as (WaybillInventoryItem & { item_name?: string | null }) | undefined;
  return String(
    record?.mat_hang ||
      record?.noi_dung ||
      record?.item_name ||
      parseNoteField(record?.note || record?.notes, 'content') ||
      parseNoteField(record?.order?.note, 'content') ||
      record?.order?.goods_description ||
      record?.order?.noi_dung ||
      '',
  ).trim();
}

function mapItemToDispatchRow(item: LoadPlanningBoardItem, showPricing: boolean): DispatchPrintRow {
  const cod = Number(extra(item, 'allocated_cod') ?? 0);
  const freight = Number(item.allocated_freight ?? 0);

  return {
    viTriHang: fmt(item.vi_tri_hang ?? item.loading_position),
    ngayBoc: fmt(item.ngay_boc),
    maTinh: fmt(item.ma_tinh || item.noi_den),
    tenCtv: fmt(item.ten_cty),
    dv: fmt(item.dv || 'TC'),
    matHang: fmt(item.mat_hang || item.waybill_code),
    matHangNote:
      item.mat_hang_note && item.mat_hang !== item.mat_hang_note && !isCarrierGoodsNote(String(item.mat_hang_note), item)
        ? fmt(item.mat_hang_note)
        : '',
    noiTra: fmt(item.noi_tra),
    soLuong: fmt(item.so_luong),
    donVi: fmt(item.loai || 'kiện'),
    nguoiNhanPhone: fmt(extra(item, 'receiver_phone')),
    nguoiNhanDiaChi: fmt(item.dia_chi),
    diaChiNhan: fmt(item.dia_chi),
    tinhTrangGiaoHang: splitLoadStatusLabel(item.load_status),
    ngayHoanThanh: addDaysToDispatchDate(normalizeNgayBoc(fmt(item.ngay_boc)), DISPATCH_COMPLETION_DAYS),
    keHoach: '',
    tangHaThuKhach: formatDispatchMoney(cod),
    cuoc: showPricing ? formatDispatchMoney(freight) : '',
    laiXeThuHo: '',
    bcThuHo: '',
    maBill: fmt(item.waybill_code),
    ghiChu: fmt(extra(item, 'split_note') || item.mat_hang_note),
    ghiChu1: '',
    ghiChu2: '',
    kg: fmt(item.weight),
    m3: fmt(item.the_tich_m3),
    duKienToiHcm: '',
    qd: '',
  };
}

function buildGroupTotals(rows: DispatchPrintRow[], showPricing: boolean): DispatchPrintTotals {
  return rows.reduce(
    (acc, row) => ({
      soLuong: acc.soLuong + (Number(row.soLuong) || 0),
      tangHaThuKhach:
        acc.tangHaThuKhach +
        Number(String(row.tangHaThuKhach).replace(/\./g, '').replace(/,/g, '') || 0),
      cuoc:
        acc.cuoc +
        (showPricing ? Number(String(row.cuoc).replace(/\./g, '').replace(/,/g, '') || 0) : 0),
      kg: acc.kg + (Number(row.kg) || 0),
      m3: acc.m3 + (Number(row.m3) || 0),
    }),
    { soLuong: 0, tangHaThuKhach: 0, cuoc: 0, kg: 0, m3: 0 },
  );
}

function mapTruckGroup(truck: LoadPlanningTruckGroup, showPricing: boolean): LoadPlanningPrintGroup {
  const licensePlate = truck.license_plate || '';
  const nhaXe = truck.nha_xe || '';
  const truckLabel = [licensePlate, nhaXe].filter(Boolean).join(' · ') || `Xe #${truck.truck_id}`;
  const rows = (truck.items ?? []).map((item, index) => ({
    ...mapItemToDispatchRow(item, showPricing),
    viTriHang: String(index + 1),
  }));

  return {
    truckLabel,
    licensePlate,
    nhaXe,
    manifestCode: truck.manifest_code || '',
    rows,
    totals: buildGroupTotals(rows, showPricing),
  };
}

export function buildLoadPlanningQuery(filters: LoadPlanningBoardFilters, forcedLoadStatuses?: string[], limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.origin_hub_id.length) params.set('origin_hub_id', filters.origin_hub_id.join(','));
  if (filters.dest_hub_id.length) params.set('dest_hub_id', filters.dest_hub_id.join(','));
  if (filters.truck_id.length) params.set('truck_id', filters.truck_id.join(','));
  const loadStatuses = forcedLoadStatuses?.length ? forcedLoadStatuses : filters.load_status;
  if (loadStatuses.length) params.set('load_status', loadStatuses.join(','));
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  return params.toString();
}

export function summarizeLoadPlanningFilters(filters: LoadPlanningBoardFilters, forcedLoadStatuses?: string[]) {
  const parts: string[] = [];
  if (filters.keyword.trim()) parts.push(`Từ khóa: ${filters.keyword.trim()}`);
  if (filters.origin_hub_id.length) parts.push(`Hub đi: ${filters.origin_hub_id.length} chọn`);
  if (filters.dest_hub_id.length) parts.push(`Hub đến: ${filters.dest_hub_id.length} chọn`);
  if (filters.truck_id.length) parts.push(`Xe: ${filters.truck_id.length} chọn`);
  const statuses = forcedLoadStatuses?.length ? forcedLoadStatuses : filters.load_status;
  if (statuses.length) parts.push(`Trạng thái: ${statuses.map((status) => splitLoadStatusLabel(status)).join(', ')}`);
  if (filters.date_from || filters.date_to) parts.push(`Ngày bốc: ${filters.date_from || '...'} -> ${filters.date_to || '...'}`);
  return parts.length ? parts.join(' · ') : 'Tất cả dòng hàng theo bộ lọc hiện tại';
}

function parseContactName(value?: string | null) {
  if (!value) return '';
  return value.split('|')[0]?.split(' · ')[0]?.trim() || value.trim();
}

function formatNgayBoc(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function allocateByPackages(total: number, packages: number, allPackages: number) {
  if (!allPackages || !packages) return 0;
  return Math.round((total * packages) / allPackages);
}

export function buildDraftManifestCode(date = new Date()) {
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `BK-${y}${m}${d}-${hh}${mm}`;
}

export function mapStackOntoTruckToPrintPayload(
  waybills: WaybillInventoryItem[],
  rows: StackOntoTruckFormRow[],
  shared: StackOntoTruckSharedFields,
  licensePlate: string,
  showPricing: boolean,
  visibleColumnIds?: DispatchPrintColumnId[],
  manifestCode?: string,
): LoadPlanningPrintPayload {
  const waybillMap = new Map(waybills.map((waybill) => [String(waybill.id), waybill]));
  const ngayBoc = formatNgayBoc();
  const manifestLabel = manifestCode?.trim() || buildDraftManifestCode();

  const dispatchRows: DispatchPrintRow[] = rows.map((row, index) => {
    const waybill = waybillMap.get(row.waybill_id);
    const pkg = Number(row.package_count) || 0;
    const totalPkg = Math.max(1, Number(waybill?.order_total_packages ?? waybill?.package_count ?? pkg));
    const freightTotal = Number(waybill?.allocated_freight ?? waybill?.freight_amount ?? waybill?.cost_amount ?? 0);
    const codTotal = Number(waybill?.allocated_cod ?? waybill?.cod_amount ?? 0);

    return {
      viTriHang: row.loading_position || String(index + 1),
      ngayBoc,
      maTinh: String(waybill?.noi_den || waybill?.dest_hub?.code || '').trim(),
      tenCtv: String((waybill as { ten_cty?: string | null })?.ten_cty || waybill?.ma_kh || parseContactName(waybill?.sender_info)).trim(),
      dv: 'TC',
      matHang: resolveWaybillGoods(waybill),
      matHangNote: '',
      noiTra: String(waybill?.dest_hub?.name || waybill?.receiver_address || parseContactName(waybill?.receiver_info)).trim(),
      soLuong: String(pkg),
      donVi: 'kiện',
      nguoiNhanPhone: String(waybill?.receiver_phone || '').trim(),
      nguoiNhanDiaChi: String(waybill?.receiver_address || '').trim(),
      diaChiNhan: String(waybill?.receiver_address || '').trim(),
      tinhTrangGiaoHang: '',
      ngayHoanThanh: addDaysToDispatchDate(normalizeNgayBoc(ngayBoc), DISPATCH_COMPLETION_DAYS),
      keHoach: row.delivery_instruction || 'Kho HCM',
      tangHaThuKhach: formatDispatchMoney(allocateByPackages(codTotal, pkg, totalPkg)),
      cuoc: showPricing ? formatDispatchMoney(allocateByPackages(freightTotal, pkg, totalPkg)) : '',
      laiXeThuHo: '',
      bcThuHo: '',
      maBill: row.waybill_code,
      ghiChu: row.expected_arrival_label ? `Dự kiến tới ${row.expected_arrival_label}` : String(waybill?.note || waybill?.notes || '').trim(),
      ghiChu1: '',
      ghiChu2: '',
      kg: String(waybill?.weight ?? ''),
      m3: String(waybill?.the_tich_m3 ?? waybill?.volumetric_weight ?? ''),
      duKienToiHcm: '',
      qd: '',
    };
  });

  const group: LoadPlanningPrintGroup = {
    truckLabel: [licensePlate, shared.nha_xe].filter(Boolean).join(' · ') || licensePlate || '—',
    licensePlate: licensePlate || '—',
    nhaXe: shared.nha_xe || '',
    manifestCode: manifestLabel,
    rows: dispatchRows,
    totals: buildGroupTotals(dispatchRows, showPricing),
  };

  return {
    title: 'BẢNG KÊ PHÁT HÀNG ECO',
    printedAt: new Date().toLocaleString('vi-VN'),
    filterSummary: manifestLabel,
    showPricing,
    visibleColumnIds: visibleColumnIds ?? loadVisibleDispatchColumnIds(showPricing),
    groups: [group],
  };
}

export function mapSingleTruckPrintPayload(
  truck: LoadPlanningTruckGroup,
  showPricing: boolean,
  visibleColumnIds?: DispatchPrintColumnId[],
): LoadPlanningPrintPayload {
  const truckLabel = [truck.license_plate, truck.nha_xe].filter(Boolean).join(' · ') || `Xe #${truck.truck_id}`;
  return {
    title: 'BẢNG KÊ PHÁT HÀNG ECO',
    printedAt: new Date().toLocaleString('vi-VN'),
    filterSummary: truck.manifest_code || truckLabel,
    showPricing,
    visibleColumnIds: visibleColumnIds ?? loadVisibleDispatchColumnIds(showPricing),
    groups: [mapTruckGroup(truck, showPricing)],
  };
}

export function mapLoadPlanningBoardToPrintPayload(
  board: LoadPlanningBoardResponse,
  showPricing: boolean,
  filterSummary: string,
  visibleColumnIds?: DispatchPrintColumnId[],
): LoadPlanningPrintPayload {
  const groups = (board.trucks ?? [])
    .map((truck) => mapTruckGroup(truck, showPricing))
    .filter((group) => group.rows.length > 0);

  return {
    title: 'BẢNG KÊ PHÁT HÀNG ECO',
    printedAt: new Date().toLocaleString('vi-VN'),
    filterSummary,
    showPricing,
    visibleColumnIds: visibleColumnIds ?? loadVisibleDispatchColumnIds(showPricing),
    groups,
  };
}

export function saveLoadPlanningPrintPayload(payload: LoadPlanningPrintPayload) {
  const json = JSON.stringify(payload);
  localStorage.setItem(LOAD_PLANNING_PRINT_STORAGE_KEY, json);
  try {
    sessionStorage.setItem(LOAD_PLANNING_PRINT_STORAGE_KEY, json);
  } catch {
    /* quota */
  }
}

export function loadLoadPlanningPrintPayload(): LoadPlanningPrintPayload | null {
  const raw =
    localStorage.getItem(LOAD_PLANNING_PRINT_STORAGE_KEY) ||
    sessionStorage.getItem(LOAD_PLANNING_PRINT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoadPlanningPrintPayload;
  } catch {
    return null;
  }
}
