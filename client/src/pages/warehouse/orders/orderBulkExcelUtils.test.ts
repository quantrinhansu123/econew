import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import type { CustomerRecord } from '../customers/customerFormTypes';
import {
  annotateBulkRows,
  applyServerNextCodesToBulkRows,
  assignBulkWaybillCodes,
  enrichOrderBulkRowsWithCustomers,
  parseOrderBulkWorkbook,
} from './orderBulkExcelUtils';
import {
  ORDER_BULK_COLUMNS,
  ORDER_BULK_TEMPLATE_NOTES,
  orderBulkHeaderLabel,
} from './orderBulkImportSchema';

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
  it('marks receiver phone as required for non-HCM orders', () => {
    const receiverPhoneColumn = ORDER_BULK_COLUMNS.find(
      (column) => column.key === 'dienThoaiNhan',
    );

    expect(receiverPhoneColumn).toBeDefined();
    expect(orderBulkHeaderLabel(receiverPhoneColumn!)).toBe('ĐT người nhận*');
    expect(ORDER_BULK_TEMPLATE_NOTES.dienThoaiNhan).toContain(
      'tỉnh khác bắt buộc nhập',
    );
  });

  it('skips only the unchanged built-in sample row', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const sample = ORDER_BULK_COLUMNS.map((column) => column.sample ?? '');
    const editedSample = ORDER_BULK_COLUMNS.map((column) => (
      column.key === 'noiDung' ? 'Đơn thật' : column.sample ?? ''
    ));

    const parsed = parseOrderBulkWorkbook(workbookBuffer([
      headers,
      sample,
      editedSample,
    ]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0].rowNumber).toBe(3);
    expect(parsed[0].values.maKh).toBe('ALPHATIC');
    expect(parsed[0].values.noiDung).toBe('Đơn thật');
  });

  it('skips the sample after blank rows but keeps an identical later real row', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const sample = ORDER_BULK_COLUMNS.map((column) => column.sample ?? '');
    const parsedAfterBlank = parseOrderBulkWorkbook(workbookBuffer([
      headers,
      [],
      sample,
    ]));
    const parsedAfterRealRow = parseOrderBulkWorkbook(workbookBuffer([
      headers,
      sample.map((value, index) => index === 2 ? 'CUSTOMER2' : value),
      sample,
    ]));

    expect(parsedAfterBlank).toHaveLength(0);
    expect(parsedAfterRealRow).toHaveLength(2);
    expect(parsedAfterRealRow[1].values.maKh).toBe('ALPHATIC');
  });

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

  it('requires receiver phone for a non-HCM order', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const valuesByKey: Partial<Record<(typeof ORDER_BULK_COLUMNS)[number]['key'], string>> = {
      bcGui: 'HAN',
      bcDen: 'DAN',
      maKh: 'CUSTOMER2',
      nguoiGui: 'Người gửi',
      nguoiNhan: 'Người nhận',
      diaChiNhan: 'Đà Nẵng',
      huyen: 'ĐÀ NẴNG',
      klKg: '1',
      dichVu: 'Tiêu chuẩn 72h',
      giaoHang: 'Văn phòng',
      phuongThuc: 'Công nợ tháng',
    };
    const makeData = (phone: string) => ORDER_BULK_COLUMNS.map((column) => (
      column.key === 'dienThoaiNhan' ? phone : valuesByKey[column.key] ?? ''
    ));
    const hubs = [
      { id: '1', code: 'HAN', name: 'Bưu cục Hà Nội' },
      { id: '2', code: 'DAN', name: 'Bưu cục Đà Nẵng' },
    ];

    const missingPhone = annotateBulkRows(
      parseOrderBulkWorkbook(workbookBuffer([headers, makeData('')])),
      hubs,
    );
    const validPhone = annotateBulkRows(
      parseOrderBulkWorkbook(workbookBuffer([headers, makeData('0912 345 678')])),
      hubs,
    );

    expect(missingPhone[0].errors).toContain('Thiếu SĐT người nhận.');
    expect(validPhone[0].errors).not.toContain('Thiếu SĐT người nhận.');
    expect(validPhone[0].errors).not.toContain('SĐT người nhận không hợp lệ.');
  });

  it('replaces locally predicted bill codes with the latest server sequence', () => {
    const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
    const makeData = (receiver: string) => {
      const values: Partial<Record<(typeof ORDER_BULK_COLUMNS)[number]['key'], string>> = {
        bcGui: 'HAN',
        bcDen: 'HCM',
        maKh: 'ALPHATIC',
        nguoiGui: 'A Đào',
        nguoiNhan: receiver,
        dienThoaiNhan: '0888727897',
        diaChiNhan: 'TP.HCM',
        huyen: 'HỒ CHÍ MINH',
        klKg: '50',
        dichVu: 'Tiêu chuẩn 72h',
        giaoHang: 'Văn phòng',
        phuongThuc: 'Công nợ tháng',
      };
      return ORDER_BULK_COLUMNS.map((column) => values[column.key] ?? '');
    };
    const rows = parseOrderBulkWorkbook(workbookBuffer([
      headers,
      makeData('Hoa'),
      makeData('Thanh'),
    ]));
    const hubs = [
      { id: '1', code: 'HAN', name: 'Bưu cục Hà Nội' },
      { id: '2', code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
    ];

    assignBulkWaybillCodes(rows, hubs, ['ECOHAN10']);
    expect(rows.map((row) => row.values.soBill)).toEqual(['ECOHAN11', 'ECOHAN12']);
    expect(rows.every((row) => row.autoAssignedWaybillCode)).toBe(true);

    applyServerNextCodesToBulkRows(rows, hubs, new Map([['1', 'ECOHAN108971']]));
    expect(rows.map((row) => row.values.soBill)).toEqual(['ECOHAN108971', 'ECOHAN108972']);
  });
});
