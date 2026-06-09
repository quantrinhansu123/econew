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
    tinhTrangGiaoHang: splitLoadStatusLabel(item.load_status),
    ngayHoanThanh: addDaysToDispatchDate(fmt(item.ngay_boc), DISPATCH_COMPLETION_DAYS),
    keHoach: '',
    tangHaThuKhach: formatDispatchMoney(cod),
    cuoc: showPricing ? formatDispatchMoney(freight) : '',
    laiXeThuHo: '',
    bcThuHo: '',
    maBill: fmt(item.waybill_code),
    ghiChu: fmt(extra(item, 'split_note') || item.mat_hang_note),
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
    }),
    { soLuong: 0, tangHaThuKhach: 0, cuoc: 0 },
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
