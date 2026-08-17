import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import {
  buildCustomerBulkPayload,
  parseCustomerBulkWorkbook,
  validateCustomerBulkRows,
  type CustomerBulkRow,
  type ParsedCustomerBulkRow,
} from './customerBulkExcelUtils';
import {
  CUSTOMER_BULK_COLUMNS,
  CUSTOMER_BULK_TEMPLATE_NOTES,
  customerBulkHeaderLabel,
} from './customerBulkImportSchema';

const workbookBuffer = (rows: unknown[][]) => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), 'Khach_hang');
  return write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

const rowFrom = (values: Partial<CustomerBulkRow>): CustomerBulkRow =>
  CUSTOMER_BULK_COLUMNS.reduce((row, column) => {
    row[column.key] = values[column.key] ?? '';
    return row;
  }, {} as CustomerBulkRow);

describe('customer bulk Excel import', () => {
  it('finds headers below the note row, skips the sample and normalizes phone values', () => {
    const notes = CUSTOMER_BULK_COLUMNS.map((column) => CUSTOMER_BULK_TEMPLATE_NOTES[column.key] || '');
    const headers = CUSTOMER_BULK_COLUMNS.map(customerBulkHeaderLabel);
    const sample = CUSTOMER_BULK_COLUMNS.map((column) => column.sample ?? '');
    const real = CUSTOMER_BULK_COLUMNS.map((column) => {
      const values: Partial<CustomerBulkRow> = {
        code: 'kh-moi',
        name: 'Khách mới',
        mobile: '912 345 678',
        phone_hcm: '+84 888 727 897',
        status: 'active',
        opening_debt: '1.500.000',
      };
      return values[column.key] ?? '';
    });

    const parsed = parseCustomerBulkWorkbook(workbookBuffer([notes, headers, sample, real]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      rowNumber: 4,
      errors: [],
      values: {
        code: 'KH-MOI',
        name: 'Khách mới',
        mobile: '0912345678',
        phone_hcm: '0888727897',
        status: 'ACTIVE',
        opening_debt: '1.500.000',
      },
    });
  });

  it('rejects duplicate customer codes and invalid optional values', () => {
    const rows: ParsedCustomerBulkRow[] = [
      { rowNumber: 3, values: rowFrom({ code: 'ABC', name: 'Khách A' }), errors: [] },
      {
        rowNumber: 4,
        values: rowFrom({ code: 'ABC', name: 'Khách B', email: 'sai-email', status: 'LOCKED', discount_percent: '-1', opening_debt: '-1000' }),
        errors: [],
      },
    ];

    const validated = validateCustomerBulkRows(rows);

    expect(validated[0].errors).toContain('Mã KH bị trùng trong file.');
    expect(validated[1].errors).toEqual(expect.arrayContaining([
      'Mã KH bị trùng trong file.',
      'Email không hợp lệ.',
      'Trạng thái phải là ACTIVE hoặc SUSPENDED.',
      'Chiết khấu % không hợp lệ.',
      'Công nợ tồn cũ không hợp lệ.',
    ]));
  });

  it('keeps blank fields out of update payloads and applies create defaults', () => {
    const values = rowFrom({ code: 'ABC', name: 'Khách A', discount_percent: '4,5', opening_debt: '2.500.000' });

    expect(buildCustomerBulkPayload(values, true)).toEqual({
      name: 'Khách A',
      discount_percent: 4.5,
      opening_debt: 2_500_000,
    });
    expect(buildCustomerBulkPayload(rowFrom({ code: 'ABC', name: 'Khách A' }), false)).toEqual({
      name: 'Khách A',
      discount_percent: 0,
      opening_debt: 0,
      status: 'ACTIVE',
      is_suspended: false,
      code: 'ABC',
    });
  });
});
