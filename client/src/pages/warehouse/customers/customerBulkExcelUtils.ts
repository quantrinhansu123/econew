import { read, utils, writeFile } from 'xlsx';
import { normalizeVnPhone } from '../orders/orderFormUtils';
import {
  CUSTOMER_BULK_COLUMNS,
  CUSTOMER_BULK_INSTRUCTIONS,
  CUSTOMER_BULK_TEMPLATE_NOTES,
  customerBulkHeaderLabel,
  type CustomerBulkFieldKey,
} from './customerBulkImportSchema';

export type CustomerBulkRow = Record<CustomerBulkFieldKey, string>;

export interface ParsedCustomerBulkRow {
  rowNumber: number;
  values: CustomerBulkRow;
  errors: string[];
  existingCustomerId?: string;
}

const phoneFields = new Set<CustomerBulkFieldKey>(['mobile', 'phone_landline', 'phone_hcm']);

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .toLowerCase()
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const headerToKey = (() => {
  const map = new Map<string, CustomerBulkFieldKey>();
  for (const column of CUSTOMER_BULK_COLUMNS) {
    map.set(normalizeHeader(column.label), column.key);
    map.set(normalizeHeader(customerBulkHeaderLabel(column)), column.key);
  }
  map.set(normalizeHeader('SĐT khách hàng'), 'mobile');
  map.set(normalizeHeader('SĐT KH'), 'mobile');
  map.set(normalizeHeader('SĐT nhận HCM'), 'phone_hcm');
  map.set(normalizeHeader('Tên khách hàng'), 'name');
  return map;
})();

function cellText(value: unknown) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function emptyBulkRow(): CustomerBulkRow {
  return CUSTOMER_BULK_COLUMNS.reduce((row, column) => {
    row[column.key] = '';
    return row;
  }, {} as CustomerBulkRow);
}

function findHeaderRowIndex(matrix: unknown[][]) {
  let bestIndex = -1;
  let bestMatchCount = 0;
  for (let index = 0; index < Math.min(matrix.length, 20); index += 1) {
    const matchedKeys = new Set(
      (matrix[index] || [])
        .map((cell) => headerToKey.get(normalizeHeader(cell)))
        .filter((key): key is CustomerBulkFieldKey => Boolean(key)),
    );
    if (matchedKeys.size > bestMatchCount) {
      bestIndex = index;
      bestMatchCount = matchedKeys.size;
    }
  }
  return bestMatchCount >= 2 ? bestIndex : -1;
}

function isBlankRow(values: CustomerBulkRow) {
  return CUSTOMER_BULK_COLUMNS.every((column) => !values[column.key]);
}

function isUnchangedSampleRow(values: CustomerBulkRow) {
  return CUSTOMER_BULK_COLUMNS.every(
    (column) => values[column.key] === cellText(column.sample ?? ''),
  );
}

function normalizeRow(values: CustomerBulkRow): CustomerBulkRow {
  const normalized = { ...values };
  normalized.code = normalized.code.toUpperCase();
  phoneFields.forEach((field) => {
    if (normalized[field]) normalized[field] = normalizeVnPhone(normalized[field]);
  });
  normalized.status = normalized.status.toUpperCase();
  return normalized;
}

export function validateCustomerBulkRows(rows: ParsedCustomerBulkRow[]): ParsedCustomerBulkRow[] {
  const codeCounts = new Map<string, number>();
  rows.forEach((row) => {
    const code = row.values.code.trim().toUpperCase();
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  });

  return rows.map((row) => {
    const errors: string[] = [];
    const { values } = row;
    if (!values.code) errors.push('Thiếu Mã KH.');
    if (!values.name) errors.push('Thiếu Tên KH.');
    if (values.code && (codeCounts.get(values.code) || 0) > 1) errors.push('Mã KH bị trùng trong file.');
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push('Email không hợp lệ.');
    if (values.status && !['ACTIVE', 'SUSPENDED'].includes(values.status)) {
      errors.push('Trạng thái phải là ACTIVE hoặc SUSPENDED.');
    }
    if (values.discount_percent) {
      const discount = Number(values.discount_percent.replace(',', '.'));
      if (!Number.isFinite(discount) || discount < 0) errors.push('Chiết khấu % không hợp lệ.');
    }
    return { ...row, errors };
  });
}

export function parseCustomerBulkWorkbook(file: ArrayBuffer): ParsedCustomerBulkRow[] {
  const workbook = read(file, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('khach')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
  if (!matrix.length) return [];
  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) return [];
  const columnIndexes = (matrix[headerRowIndex] || []).map(
    (header) => headerToKey.get(normalizeHeader(header)) || null,
  );

  const parsed: ParsedCustomerBulkRow[] = [];
  let foundFirstDataRow = false;
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const values = emptyBulkRow();
    const raw = matrix[index] || [];
    columnIndexes.forEach((key, columnIndex) => {
      if (key) values[key] = cellText(raw[columnIndex]);
    });
    if (isBlankRow(values)) continue;
    if (!foundFirstDataRow) {
      foundFirstDataRow = true;
      if (isUnchangedSampleRow(values)) continue;
    }
    parsed.push({ rowNumber: index + 1, values: normalizeRow(values), errors: [] });
  }
  return validateCustomerBulkRows(parsed);
}

export function buildCustomerBulkPayload(values: CustomerBulkRow, updating: boolean) {
  const payload: Record<string, unknown> = {};
  const setText = (key: CustomerBulkFieldKey, target = key) => {
    const value = values[key].trim();
    if (value) payload[target] = value;
  };

  setText('name');
  setText('short_name');
  setText('mobile');
  setText('phone_landline');
  setText('address');
  setText('destination_province');
  setText('receiver_hcm');
  setText('phone_hcm');
  setText('address_hcm');
  setText('email');
  setText('contact_person');
  setText('manager_name');
  setText('price_table');
  setText('delivery_handler');
  setText('region');
  setText('credit_type');
  setText('contract_code');
  setText('tax_id');

  if (values.discount_percent.trim()) {
    payload.discount_percent = Number(values.discount_percent.replace(',', '.'));
  } else if (!updating) {
    payload.discount_percent = 0;
  }

  if (values.status.trim()) {
    payload.status = values.status;
    payload.is_suspended = values.status === 'SUSPENDED';
  } else if (!updating) {
    payload.status = 'ACTIVE';
    payload.is_suspended = false;
  }

  if (!updating) payload.code = values.code;
  return payload;
}

export function downloadCustomerBulkTemplate() {
  const notes = CUSTOMER_BULK_COLUMNS.map((column) => CUSTOMER_BULK_TEMPLATE_NOTES[column.key] || '');
  const headers = CUSTOMER_BULK_COLUMNS.map(customerBulkHeaderLabel);
  const sample = CUSTOMER_BULK_COLUMNS.map((column) => column.sample ?? '');
  const workbook = utils.book_new();
  const customerSheet = utils.aoa_to_sheet([notes, headers, sample]);
  customerSheet['!cols'] = CUSTOMER_BULK_COLUMNS.map((column) => ({
    wch: Math.max(12, Math.min(32, column.label.length + 5)),
  }));
  utils.book_append_sheet(workbook, customerSheet, 'Khach_hang');
  utils.book_append_sheet(
    workbook,
    utils.json_to_sheet(CUSTOMER_BULK_INSTRUCTIONS.map((instruction, index) => ({
      STT: index + 1,
      'Hướng dẫn': instruction,
    }))),
    'Huong_dan',
  );
  writeFile(workbook, 'mau-nhap-khach-hang-loat.xlsx');
}
