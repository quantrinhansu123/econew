import {
  utils,
  writeFile,
  type CellObject,
  type WorkBook,
  type WorkSheet,
} from 'xlsx';
import { parseAmountInput } from '../../../lib/formatMoney';
import {
  getDispatchColumnDef,
  type DispatchPrintColumnId,
} from '../../print/dispatchPrintColumns';
import {
  computeDispatchTotals,
  dispatchRowKey,
  formatReceiverAddressWithPhone,
  getDispatchCellValue,
  resolveReceiverDistrict,
  resolveReceiverWard,
  type DispatchLink,
} from './manifestDispatchDefaults';
import { getDispatchSheetColumnMeta } from './manifestDispatchSheetColumns';
import { manifestPrintCode, manifestPrintTrip, type ManifestPrintDestinationGroup } from './manifestDispatchPrintUtils';
import type { LoadPlanningManifest, ManifestDispatchFields } from './types';

type ExcelCellValue = string | number;
type RowKind = 'title' | 'meta' | 'header' | 'data' | 'total' | 'footer' | 'spacer';

interface PlannedRow {
  values: ExcelCellValue[];
  kind: RowKind;
}

const COLUMN_WIDTHS: Partial<Record<DispatchPrintColumnId, number>> = {
  viTriHang: 9,
  ngayBoc: 11,
  maTinh: 12,
  quanHuyen: 16,
  phuongXa: 16,
  tenCtv: 24,
  dv: 8,
  matHang: 28,
  noiTra: 22,
  soLuong: 13,
  diaChiNhan: 42,
  tinhTrangGiaoHang: 20,
  ngayHoanThanh: 15,
  keHoach: 20,
  tangHaThuKhach: 15,
  cuoc: 15,
  laiXeThuHo: 16,
  bcThuHo: 15,
  maBill: 18,
  maVach: 20,
  ghiChu: 24,
  ghiChu1: 22,
  ghiChu2: 22,
  kg: 11,
  m3: 11,
  duKienToiHcm: 18,
  qd: 10,
};

const BLACK_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
} as const;

const hubLabel = (
  hub?: { id?: string | number | null; code?: string | null; name?: string | null } | null,
  id?: string | number | null,
) => {
  const code = String(hub?.code || '').trim();
  const name = String(hub?.name || '').trim();
  if (code && name && code.toLocaleLowerCase('vi') !== name.toLocaleLowerCase('vi')) return `${code} · ${name}`;
  return code || name || (id ? `#${id}` : '—');
};

const formatDateTime = (value?: string | number | Date | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const toDecimal = (value: string) => {
  if (!value.trim()) return '';
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : value;
};

function resolveColumnValue(
  columnId: DispatchPrintColumnId,
  link: DispatchLink,
  rows: Record<string, ManifestDispatchFields>,
  index: number,
): ExcelCellValue {
  const key = dispatchRowKey(link);
  if (columnId === 'viTriHang') return Number(link.loading_position ?? index + 1) || String(link.loading_position ?? index + 1);
  if (columnId === 'soLuong') {
    const quantity = getDispatchCellValue(rows, link, key, 'so_luong');
    const unit = getDispatchCellValue(rows, link, key, 'loai') || 'kiện';
    return `${quantity}\n${unit}`;
  }
  if (columnId === 'diaChiNhan') {
    return getDispatchCellValue(rows, link, key, 'dia_chi') || formatReceiverAddressWithPhone(link);
  }
  if (columnId === 'quanHuyen') return resolveReceiverDistrict(link.waybill) || '—';
  if (columnId === 'phuongXa') return resolveReceiverWard(link.waybill) || '—';
  if (columnId === 'cuoc') {
    const saved = getDispatchCellValue(rows, link, key, 'bc_thu_ho');
    return parseAmountInput(saved || String(link.waybill?.cost_amount ?? ''));
  }
  if (columnId === 'maVach') {
    return getDispatchCellValue(rows, link, key, 'ma_bill') || String(link.waybill?.waybill_code || '');
  }

  const meta = getDispatchSheetColumnMeta(columnId);
  if (!meta.fieldKey) return '';
  const value = getDispatchCellValue(rows, link, key, meta.fieldKey);
  if (meta.money) return value ? parseAmountInput(value) : '';
  if (columnId === 'kg' || columnId === 'm3') return toDecimal(value);
  return value;
}

function buildMetaRows(manifest: LoadPlanningManifest, group: ManifestPrintDestinationGroup) {
  const trip = manifestPrintTrip(manifest);
  const licensePlate = trip?.manual_license_plate?.trim()
    || trip?.truck?.bks?.trim()
    || trip?.truck?.license_plate?.trim()
    || '—';
  const carrier = trip?.vendor?.name
    || trip?.vendor?.code
    || trip?.truck?.vendor?.name
    || trip?.truck?.nha_xe
    || trip?.carrier_label?.trim()
    || trip?.driver_name
    || '—';
  const driverPhone = trip?.driver_phone || trip?.driver?.phone || trip?.truck?.driver?.phone || trip?.truck?.phone || '—';
  const destinationHub = group.hub ?? manifest.dest_hub;
  const destinationHubId = group.hubId ?? manifest.dest_hub_id;

  return [
    [
      `HUB ĐI\n${hubLabel(manifest.origin_hub, manifest.origin_hub_id)}\nSĐT: ${manifest.origin_hub?.phone || manifest.origin_hub?.manager_phone || '—'}`,
      `HUB ĐẾN\n${hubLabel(destinationHub, destinationHubId)}\nSĐT: ${destinationHub?.phone || destinationHub?.manager_phone || '—'}\nDự kiến đến: ${formatDateTime(group.expectedArrivalAt)}`,
      `BIỂN SỐ XE\n${licensePlate}`,
      `NCC / TÀI XẾ\n${carrier}\nSĐT: ${driverPhone}\nKhởi hành: ${formatDateTime(trip?.departure_time)}`,
    ],
    [
      `MÃ BẢNG KÊ\n${manifestPrintCode(manifest)}`,
      `SỐ DÒNG HÀNG\n${group.links.length.toLocaleString('vi-VN')}`,
      `QUÉT MỞ BẢNG KÊ\n${manifestPrintCode(manifest)}`,
      '',
    ],
  ];
}

function applyWorkbookStyles(
  worksheet: WorkSheet,
  plannedRows: PlannedRow[],
  columns: DispatchPrintColumnId[],
) {
  worksheet['!cols'] = columns.map((columnId) => ({ wch: COLUMN_WIDTHS[columnId] ?? 14 }));
  worksheet['!rows'] = plannedRows.map((row) => ({
    hpt: row.kind === 'title' ? 28
      : row.kind === 'meta' ? 60
        : row.kind === 'header' ? 34
          : row.kind === 'data' ? 38
            : row.kind === 'footer' ? 26
              : row.kind === 'spacer' ? 10
                : 24,
  }));

  plannedRows.forEach((row, rowIndex) => {
    columns.forEach((columnId, columnIndex) => {
      const ref = utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = (worksheet[ref] ?? { t: 's', v: '' }) as CellObject;
      worksheet[ref] = cell;
      const def = getDispatchColumnDef(columnId);
      const isLocation = columnId === 'viTriHang';
      const isMoney = getDispatchSheetColumnMeta(columnId).money;
      const isNumeric = isMoney || columnId === 'kg' || columnId === 'm3';
      const isRed = isMoney || columnId === 'noiTra' || columnId === 'ghiChu' || columnId === 'tinhTrangGiaoHang';

      cell.s = {
        font: {
          name: row.kind === 'title' || row.kind === 'meta' ? 'Times New Roman' : 'Arial',
          sz: row.kind === 'title' ? 16 : row.kind === 'meta' ? 10 : 9,
          bold: row.kind !== 'data' || isRed,
          color: isRed && (row.kind === 'data' || row.kind === 'total') ? { rgb: 'C00000' } : { rgb: '111827' },
        },
        fill: row.kind === 'header'
          ? { fgColor: { rgb: isLocation ? 'FFF200' : 'C6EFCE' } }
          : row.kind === 'total'
            ? { fgColor: { rgb: isLocation ? 'FFF200' : 'F1F5F9' } }
            : row.kind === 'data' && isLocation
              ? { fgColor: { rgb: 'FFF200' } }
              : undefined,
        alignment: {
          vertical: 'center',
          horizontal: row.kind === 'title' || row.kind === 'meta' || row.kind === 'header'
            ? 'center'
            : isNumeric || def.align === 'right'
              ? 'right'
              : def.align === 'left'
                ? 'left'
                : 'center',
          wrapText: true,
        },
        border: ['meta', 'header', 'data', 'total', 'footer'].includes(row.kind) ? BLACK_BORDER : undefined,
        numFmt: row.kind === 'data' || row.kind === 'total'
          ? isMoney
            ? '#,##0'
            : columnId === 'kg' || columnId === 'm3'
              ? '#,##0.##'
              : undefined
          : undefined,
      };
    });
  });

  const sheetOptions = worksheet as WorkSheet & {
    '!pageSetup'?: Record<string, unknown>;
    '!margins'?: Record<string, number>;
    '!sheetViews'?: Array<Record<string, unknown>>;
  };
  sheetOptions['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheetOptions['!margins'] = { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 };
  sheetOptions['!sheetViews'] = [{ zoomScale: 70, zoomScaleNormal: 70 }];
}

export function buildManifestPrintExcelWorkbook(
  manifest: LoadPlanningManifest,
  groups: ManifestPrintDestinationGroup[],
  rows: Record<string, ManifestDispatchFields>,
  visibleColumnIds: DispatchPrintColumnId[],
): WorkBook | null {
  if (!groups.length || !visibleColumnIds.length) return null;

  const plannedRows: PlannedRow[] = [];
  const merges: NonNullable<WorkSheet['!merges']> = [];
  const lastColumnIndex = visibleColumnIds.length - 1;

  groups.forEach((group, groupIndex) => {
    const titleRowIndex = plannedRows.length;
    plannedRows.push({ values: ['BẢNG KÊ PHÁT HÀNG ECO'], kind: 'title' });
    merges.push({ s: { r: titleRowIndex, c: 0 }, e: { r: titleRowIndex, c: lastColumnIndex } });

    buildMetaRows(manifest, group).forEach((metaValues) => {
      const rowIndex = plannedRows.length;
      const values = Array<ExcelCellValue>(visibleColumnIds.length).fill('');
      const blockCount = Math.min(4, visibleColumnIds.length);
      for (let block = 0; block < blockCount; block += 1) {
        const start = Math.floor((block * visibleColumnIds.length) / blockCount);
        const end = Math.floor(((block + 1) * visibleColumnIds.length) / blockCount) - 1;
        values[start] = metaValues[block] || '';
        if (end > start) merges.push({ s: { r: rowIndex, c: start }, e: { r: rowIndex, c: end } });
      }
      plannedRows.push({ values, kind: 'meta' });
    });

    plannedRows.push({
      values: visibleColumnIds.map((columnId) => getDispatchColumnDef(columnId).header.replace('\n', ' ')),
      kind: 'header',
    });

    group.links.forEach((link, index) => {
      plannedRows.push({
        values: visibleColumnIds.map((columnId) => resolveColumnValue(columnId, link, rows, index)),
        kind: 'data',
      });
    });

    const totals = computeDispatchTotals(group.links, rows, dispatchRowKey);
    plannedRows.push({
      values: visibleColumnIds.map((columnId) => {
        if (columnId === 'viTriHang') return 'TỔNG';
        if (columnId === 'soLuong') return `${totals.soLuong}\n${totals.unitLabel}`;
        if (columnId === 'tangHaThuKhach') return totals.cod || '';
        if (columnId === 'kg') return totals.kg || '';
        if (columnId === 'm3') return totals.m3 || '';
        return '';
      }),
      kind: 'total',
    });

    const trip = manifestPrintTrip(manifest);
    const footerRowIndex = plannedRows.length;
    plannedRows.push({
      values: [`Xe: ${trip?.driver_name || trip?.truck?.ten_lai_xe || '—'}   ·   Ngày: ${formatDateTime(manifest.closed_at || manifest.created_at)}   ·   BKS: ${trip?.manual_license_plate || trip?.truck?.bks || trip?.truck?.license_plate || '—'}   ·   SĐT: ${trip?.driver_phone || trip?.driver?.phone || trip?.truck?.driver?.phone || '—'}   ·   Dự kiến: ${formatDateTime(group.expectedArrivalAt)}`],
      kind: 'footer',
    });
    merges.push({ s: { r: footerRowIndex, c: 0 }, e: { r: footerRowIndex, c: lastColumnIndex } });

    if (groupIndex < groups.length - 1) {
      const spacerRowIndex = plannedRows.length;
      plannedRows.push({ values: [''], kind: 'spacer' });
      merges.push({ s: { r: spacerRowIndex, c: 0 }, e: { r: spacerRowIndex, c: lastColumnIndex } });
    }
  });

  const worksheet = utils.aoa_to_sheet(plannedRows.map((row) => row.values));
  worksheet['!merges'] = merges;
  applyWorkbookStyles(worksheet, plannedRows, visibleColumnIds);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Bang ke phat hang');
  return workbook;
}

export function downloadManifestPrintExcel(
  manifest: LoadPlanningManifest,
  groups: ManifestPrintDestinationGroup[],
  rows: Record<string, ManifestDispatchFields>,
  visibleColumnIds: DispatchPrintColumnId[],
) {
  const workbook = buildManifestPrintExcelWorkbook(manifest, groups, rows, visibleColumnIds);
  if (!workbook) return false;
  const code = manifestPrintCode(manifest).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${code}-bang-ke-phat-hang-${stamp}.xlsx`, { compression: true });
  return true;
}
