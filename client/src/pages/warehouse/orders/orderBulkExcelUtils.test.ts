import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import type { CustomerRecord } from '../customers/customerFormTypes';
import {
  annotateBulkRows,
  enrichOrderBulkRowsWithCustomers,
  parseOrderBulkWorkbook,
} from './orderBulkExcelUtils';
import { ORDER_BULK_COLUMNS, orderBulkHeaderLabel } from './orderBulkImportSchema';

const workbookBuffer = (rows: unknown[][]) => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'Don_hang');
  return write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

const customer = {
  id: '1',
  code: 'ALPHATIC',
  name: 'Công ty ABC',
  short_name: 'ABC',
  mobile: '0901234567',
  phone_landline: null,
  address: 'Thanh Trì, Hà Nội',
  receiver_hcm: 'Nguyễn Văn A',
  phone_hcm: '0888727897',
  address_hcm: '215 Nguyễn Trãi, Quận 1, TP.HCM',
} as CustomerRecord;

describe('order bulk Excel template', () => {
  it('detects the header below the instruction row', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const notes = ORDER_BULK_COLUMNS.map((column) => column.key === 'bcGui' ? 'bắt buộc' : '');
    const valuesByKey: Partial<Record<(typeof ORDER_BULK_COLUMNS)[number]['key'], string>> = {
      bcGui: 'HAN',
      bcDen: 'HCM',
      maKh: 'ALPHATIC',
      huyen: 'HỒ CHÍ MINH',
      klKg: '50',
      dichVu: 'Tiêu chuẩn 72h',
      giaoHang: 'Văn phòng',
      phuongThuc: 'Công nợ tháng',
    };
    const data = ORDER_BULK_COLUMNS.map((column) => valuesByKey[column.key] ?? '');

    const parsed = parseOrderBulkWorkbook(workbookBuffer([notes, headers, data]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].rowNumber).toBe(3);
    expect(parsed[0].values).toMatchObject({
      bcGui: 'HAN',
      bcDen: 'HCM',
      maKh: 'ALPHATIC',
      huyen: 'HỒ CHÍ MINH',
      klKg: '50',
    });
  });

  it('fills customer and HCM receiver data before validating', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const valuesByKey: Partial<Record<(typeof ORDER_BULK_COLUMNS)[number]['key'], string>> = {
      bcGui: 'HAN',
      bcDen: 'HCM',
      maKh: 'ALPHATIC',
      huyen: 'HỒ CHÍ MINH',
      klKg: '50',
      dichVu: 'Tiêu chuẩn 72h',
      giaoHang: 'Văn phòng',
      phuongThuc: 'Công nợ tháng',
    };
    const data = ORDER_BULK_COLUMNS.map((column) => valuesByKey[column.key] ?? '');
    const parsed = parseOrderBulkWorkbook(workbookBuffer([headers, data]));
    const enriched = enrichOrderBulkRowsWithCustomers(parsed, [customer]);
    const annotated = annotateBulkRows(enriched, [
      { id: '1', code: 'HAN', name: 'Bưu cục Hà Nội' },
      { id: '2', code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
    ]);

    expect(annotated[0].values).toMatchObject({
      dienThoaiKh: '0901234567',
      nguoiGui: 'Công ty ABC',
      diaChiGui: 'Thanh Trì, Hà Nội',
      nguoiNhan: 'Nguyễn Văn A',
      dienThoaiNhan: '0888727897',
      diaChiNhan: '215 Nguyễn Trãi, Quận 1, TP.HCM',
    });
    expect(annotated[0].errors).toEqual([]);
  });
});
