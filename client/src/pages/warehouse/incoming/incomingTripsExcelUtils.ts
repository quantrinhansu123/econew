import { utils, writeFile, type CellObject, type WorkBook, type WorkSheet } from 'xlsx';
import type { IncomingTrip } from './types';
import {
  formatNumber,
  formatTripDepartureDate,
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getPlateLabel,
  getRouteLabel,
  getTotalVolume,
  getTotalWeight,
  getTripProvisionalProfit,
  getTripWaitingPaymentDays,
  getVendorCode,
  getVendorName,
  getVendorPaymentStatusLabel,
  getVehicleType,
  getWaybillCount,
} from './incomingTripUtils';

const HEADERS = [
  'STT', 'Ngày khởi hành', 'Tuyến', 'Mã Bảng kê', 'NCC & loại xe', 'BKS',
  'Đơn / trọng lượng / CBM', 'Tài xế và SĐT', 'Lợi nhuận sơ bộ',
  'Số ngày chờ TT', 'Trạng thái Thanh toán', 'Thao tác',
] as const;

const COLUMN_WIDTHS = [7, 20, 18, 22, 28, 16, 26, 24, 19, 18, 24, 12];
const MONEY_COLUMN_INDEXES = new Set([8]);

function mapTripRow(trip: IncomingTrip, index: number): Array<string | number> {
  const departure = formatTripDepartureDate(trip);
  const vendor = [getVendorCode(trip), getVendorName(trip), getVehicleType(trip)]
    .filter((value, valueIndex, values) => value && value !== '—' && values.indexOf(value) === valueIndex)
    .join(' · ');
  const driver = [getDriverName(trip), getDriverPhone(trip)]
    .filter((value) => value && value !== '—')
    .join(' · ');
  const waitingDays = getTripWaitingPaymentDays(trip);
  return [
    index + 1,
    departure.full === 'Chưa có ngày' ? '' : departure.full,
    getRouteLabel(trip),
    getManifestCode(trip),
    vendor,
    getPlateLabel(trip),
    `${Number(getWaybillCount(trip)).toLocaleString('vi-VN')} đơn · ${formatNumber(getTotalWeight(trip))} kg · ${formatNumber(getTotalVolume(trip), 2)} m³`,
    driver,
    getTripProvisionalProfit(trip),
    waitingDays == null ? '' : waitingDays,
    getVendorPaymentStatusLabel(trip),
    '',
  ];
}

function styleWorksheet(worksheet: WorkSheet, rowCount: number) {
  worksheet['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } },
  ];
  worksheet['!autofilter'] = { ref: `A3:L${Math.max(3, rowCount + 3)}` };
  worksheet['!rows'] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 32 }];

  const range = utils.decode_range(worksheet['!ref'] || 'A1:L3');
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const ref = utils.encode_cell({ r: row, c: column });
      const cell = worksheet[ref] as CellObject | undefined;
      if (!cell) continue;
      const isTitle = row === 0;
      const isHeader = row === 2;
      const isTotal = row === rowCount + 3;
      cell.s = {
        font: {
          name: 'Arial',
          sz: isTitle ? 16 : 10,
          bold: isTitle || isHeader || isTotal,
          color: isTitle || isHeader ? { rgb: 'FFFFFF' } : { rgb: '1E293B' },
        },
        fill: isTitle
          ? { fgColor: { rgb: '2563EB' } }
          : isHeader
            ? { fgColor: { rgb: '1D4ED8' } }
            : isTotal
              ? { fgColor: { rgb: 'ECFDF5' } }
              : undefined,
        alignment: {
          vertical: 'center',
          horizontal: isTitle || isHeader ? 'center' : MONEY_COLUMN_INDEXES.has(column) ? 'right' : 'left',
          wrapText: true,
        },
        border: row >= 2 ? {
          top: { style: 'thin', color: { rgb: 'CBD5E1' } },
          bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
          left: { style: 'thin', color: { rgb: 'CBD5E1' } },
          right: { style: 'thin', color: { rgb: 'CBD5E1' } },
        } : undefined,
        numFmt: MONEY_COLUMN_INDEXES.has(column) && row >= 3 ? '#,##0 "đ"' : undefined,
      };
    }
  }
}

export function buildIncomingTripsExcelWorkbook(
  trips: IncomingTrip[],
  filterSummary: string,
  title = 'TẤT CẢ CHUYẾN XE',
): WorkBook | null {
  if (!trips.length) return null;
  const totalRow: Array<string | number> = Array(HEADERS.length).fill('');
  totalRow[0] = 'TỔNG CỘNG';
  totalRow[6] = `${trips.reduce((sum, trip) => sum + Number(getWaybillCount(trip)), 0).toLocaleString('vi-VN')} đơn · ${formatNumber(trips.reduce((sum, trip) => sum + Number(getTotalWeight(trip)), 0))} kg · ${formatNumber(trips.reduce((sum, trip) => sum + Number(getTotalVolume(trip)), 0), 2)} m³`;
  totalRow[8] = trips.reduce((sum, trip) => sum + getTripProvisionalProfit(trip), 0);

  const rows: Array<Array<string | number>> = [
    [title],
    [`Bộ lọc: ${filterSummary || 'Tất cả'} · ${trips.length} chuyến`],
    [...HEADERS],
    ...trips.map(mapTripRow),
    totalRow,
  ];
  const worksheet = utils.aoa_to_sheet(rows);
  styleWorksheet(worksheet, trips.length);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Chuyen xe');
  return workbook;
}

export function downloadIncomingTripsExcel(
  trips: IncomingTrip[],
  filterSummary: string,
  options?: { title?: string; filePrefix?: string },
) {
  const workbook = buildIncomingTripsExcelWorkbook(trips, filterSummary, options?.title);
  if (!workbook) return false;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${options?.filePrefix || 'tat-ca-chuyen-xe'}-${stamp}.xlsx`, { compression: true });
  return true;
}
