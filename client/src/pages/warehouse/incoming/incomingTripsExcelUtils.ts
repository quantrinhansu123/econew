import { utils, writeFile, type CellObject, type WorkBook, type WorkSheet } from 'xlsx';
import type { IncomingTrip } from './types';
import {
  formatTripArrivalDate,
  getDriverCollectedAmount,
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getOriginHub,
  getPaymentNote,
  getPlateLabel,
  getRouteLabel,
  getTotalWeight,
  getTripOtherCosts,
  getTripPaidAmount,
  getTripPayableAmount,
  getTripReceivableAmount,
  getTripStatusLabel,
  getVehicleType,
  getVendorName,
  getVendorPaymentStatusLabel,
  getWaybillCount,
} from './incomingTripUtils';

const HEADERS = [
  'Ngày đến',
  'Giờ',
  'Xuất phát',
  'Bảng kê',
  'Tuyến',
  'BKS',
  'Số đơn',
  'Kg',
  'Tài xế',
  'SĐT',
  'Nhà cung cấp',
  'Loại xe',
  'Phải trả',
  'Đã trả',
  'Phí khác',
  'Phải thu',
  'Lái xe đã thu',
  'Ghi chú',
  'Trạng thái thanh toán',
  'Trạng thái chuyến',
] as const;

const COLUMN_WIDTHS = [13, 8, 12, 20, 18, 15, 10, 12, 20, 15, 20, 15, 15, 15, 15, 15, 17, 28, 22, 18];
const MONEY_COLUMN_INDEXES = new Set([12, 13, 14, 15, 16]);

function mapTripRow(trip: IncomingTrip): Array<string | number> {
  const arrival = formatTripArrivalDate(trip);
  return [
    arrival.day,
    arrival.time || '',
    getOriginHub(trip),
    getManifestCode(trip),
    getRouteLabel(trip),
    getPlateLabel(trip),
    Number(getWaybillCount(trip)),
    Number(getTotalWeight(trip)),
    getDriverName(trip),
    getDriverPhone(trip),
    getVendorName(trip),
    getVehicleType(trip),
    getTripPayableAmount(trip),
    getTripPaidAmount(trip),
    getTripOtherCosts(trip),
    getTripReceivableAmount(trip),
    getDriverCollectedAmount(trip),
    getPaymentNote(trip),
    getVendorPaymentStatusLabel(trip),
    getTripStatusLabel(trip),
  ];
}

function styleWorksheet(worksheet: WorkSheet, rowCount: number) {
  worksheet['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } },
  ];
  worksheet['!autofilter'] = { ref: `A3:T${Math.max(3, rowCount + 3)}` };
  worksheet['!rows'] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 32 }];

  const range = utils.decode_range(worksheet['!ref'] || 'A1:T3');
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

export function buildIncomingTripsExcelWorkbook(trips: IncomingTrip[], filterSummary: string): WorkBook | null {
  if (!trips.length) return null;
  const totalRow: Array<string | number> = Array(HEADERS.length).fill('');
  totalRow[0] = 'TỔNG CỘNG';
  totalRow[6] = trips.reduce((sum, trip) => sum + Number(getWaybillCount(trip)), 0);
  totalRow[7] = trips.reduce((sum, trip) => sum + Number(getTotalWeight(trip)), 0);
  totalRow[12] = trips.reduce((sum, trip) => sum + getTripPayableAmount(trip), 0);
  totalRow[13] = trips.reduce((sum, trip) => sum + getTripPaidAmount(trip), 0);
  totalRow[14] = trips.reduce((sum, trip) => sum + getTripOtherCosts(trip), 0);
  totalRow[15] = trips.reduce((sum, trip) => sum + getTripReceivableAmount(trip), 0);
  totalRow[16] = trips.reduce((sum, trip) => sum + getDriverCollectedAmount(trip), 0);

  const rows: Array<Array<string | number>> = [
    ['TẤT CẢ CHUYẾN XE'],
    [`Bộ lọc: ${filterSummary || 'Tất cả'} · ${trips.length} chuyến`],
    [...HEADERS],
    ...trips.map(mapTripRow),
    totalRow,
  ];
  const worksheet = utils.aoa_to_sheet(rows);
  styleWorksheet(worksheet, trips.length);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Tong chuyen xe');
  return workbook;
}

export function downloadIncomingTripsExcel(trips: IncomingTrip[], filterSummary: string) {
  const workbook = buildIncomingTripsExcelWorkbook(trips, filterSummary);
  if (!workbook) return false;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `tat-ca-chuyen-xe-${stamp}.xlsx`, { compression: true });
  return true;
}
