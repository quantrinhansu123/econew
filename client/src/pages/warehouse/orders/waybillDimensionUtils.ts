import * as XLSX from 'xlsx';

export const DIMENSION_WEIGHT_DIVISOR = 3_000;

export interface DimensionRow {
  id: string;
  quantity: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

export interface DimensionRowResult {
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumeM3: number;
  convertedWeightKg: number;
}

const toPositiveNumber = (value: string) => {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export const calculateDimensionRow = (row: DimensionRow): DimensionRowResult => {
  const quantity = Math.max(0, Math.floor(toPositiveNumber(row.quantity)));
  const lengthCm = toPositiveNumber(row.lengthCm);
  const widthCm = toPositiveNumber(row.widthCm);
  const heightCm = toPositiveNumber(row.heightCm);
  const cubicCentimeters = quantity * lengthCm * widthCm * heightCm;

  return {
    quantity,
    lengthCm,
    widthCm,
    heightCm,
    volumeM3: round(cubicCentimeters / 1_000_000, 6),
    convertedWeightKg: round(cubicCentimeters / DIMENSION_WEIGHT_DIVISOR, 2),
  };
};

export const calculateDimensionTotals = (rows: DimensionRow[]) => {
  const calculated = rows.map(calculateDimensionRow);
  return {
    packageCount: calculated.reduce((sum, row) => sum + row.quantity, 0),
    volumeM3: round(calculated.reduce((sum, row) => sum + row.volumeM3, 0), 6),
    convertedWeightKg: round(calculated.reduce((sum, row) => sum + row.convertedWeightKg, 0), 2),
  };
};

export const hasCompleteDimensions = (row: DimensionRow) => {
  const result = calculateDimensionRow(row);
  return result.quantity > 0 && result.lengthCm > 0 && result.widthCm > 0 && result.heightCm > 0;
};

export const createDimensionWorkbookFile = (rows: DimensionRow[], waybillCode: string) => {
  const validRows = rows.filter(hasCompleteDimensions);
  const title = 'BẢNG QUY ĐỔI KÍCH THƯỚC HÀNG HÓA';
  const headers = ['STT', 'Số kiện', 'Dài (cm)', 'Rộng (cm)', 'Cao (cm)', 'CBM (m³)', 'TL quy đổi (kg)'];
  const data: Array<Array<string | number>> = [
    [title],
    ['Số bill', waybillCode.trim() || 'Chưa nhập'],
    [],
    headers,
    ...validRows.map((row, index) => {
      const result = calculateDimensionRow(row);
      const excelRow = index + 5;
      return [
        index + 1,
        result.quantity,
        result.lengthCm,
        result.widthCm,
        result.heightCm,
        { f: `B${excelRow}*C${excelRow}*D${excelRow}*E${excelRow}/1000000`, v: result.volumeM3 } as unknown as number,
        { f: `B${excelRow}*C${excelRow}*D${excelRow}*E${excelRow}/${DIMENSION_WEIGHT_DIVISOR}`, v: result.convertedWeightKg } as unknown as number,
      ];
    }),
  ];
  const totalRow = validRows.length + 5;
  data.push([
    'TỔNG',
    { f: `SUM(B5:B${totalRow - 1})` } as unknown as number,
    '', '', '',
    { f: `SUM(F5:F${totalRow - 1})` } as unknown as number,
    { f: `SUM(G5:G${totalRow - 1})` } as unknown as number,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  worksheet['!cols'] = [7, 11, 12, 12, 12, 16, 20].map((wch) => ({ wch }));
  worksheet['!freeze'] = { xSplit: 0, ySplit: 4 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Quy doi kich thuoc');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  const safeCode = waybillCode.trim().replace(/[^a-z0-9_-]+/gi, '-') || 'van-don';
  return new File([buffer], `quy-doi-kich-thuoc-${safeCode}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};
