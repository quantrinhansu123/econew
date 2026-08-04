import { read, SSF, utils, writeFile } from 'xlsx';
import { emptyOrderForm } from './orderFormData';
import type { NewOrderFormState } from './orderFormTypes';
import {
  applyPricingToForm,
  buildCreatePayload,
  calcVolumetricWeight,
  hubIdFromCode,
  isValidVnPhone,
  normalizeVnPhone,
  parseDecimalNumber,
} from './orderFormUtils';
import type { HubSummary } from './types';
import { applyReceiverByDestination, customerToOrderPatch } from '../customers/customerOrderPatch';
import type { CustomerRecord } from '../customers/customerFormTypes';
import {
  ORDER_BULK_COLUMNS,
  ORDER_BULK_INSTRUCTIONS,
  ORDER_BULK_TEMPLATE_NOTES,
  orderBulkHeaderLabel,
  type OrderBulkFieldKey,
} from './orderBulkImportSchema';
import { formatEcoBillCode, maxEcoBillSequence, nextEcoBillCodeFromCodes } from './waybillCodeUtils';
import { extractVietnamAddressParts } from '../../../lib/vietnamAddressParts';
import { isPublicImageUrl } from '../../../lib/waybillImages';

export type OrderBulkRow = Record<OrderBulkFieldKey, string>;

export interface ParsedOrderBulkRow {
  rowNumber: number;
  values: OrderBulkRow;
  errors: string[];
  customerMatched?: boolean;
  autoAssignedWaybillCode?: boolean;
}

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .toLowerCase()
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const cellText = (value: unknown) => {
  if (value == null) return '';
  return String(value).trim();
};

const padDatePart = (value: number) => String(value).padStart(2, '0');

function validDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function datePartsToInput(year: number, month: number, day: number) {
  if (!validDateParts(year, month, day)) return '';
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

/**
 * Đọc ngày Excel theo phần ngày trong ô, không chuyển qua UTC/ISO vì thao tác đó
 * làm ngày ở múi giờ Việt Nam bị lùi một ngày.
 */
export function normalizeOrderBulkDate(value: unknown, date1904 = false) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = SSF.parse_date_code(value, { date1904 });
    if (!parsed) return cellText(value);
    return datePartsToInput(parsed.y, parsed.m, parsed.d) || cellText(value);
  }

  const text = cellText(value);
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    return datePartsToInput(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) || text;
  }

  const vietnameseMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (vietnameseMatch) {
    const rawYear = Number(vietnameseMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return datePartsToInput(year, Number(vietnameseMatch[2]), Number(vietnameseMatch[1])) || text;
  }

  return text;
}

function isValidOrderBulkDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Boolean(match && validDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
}

const headerToKey = (() => {
  const map = new Map<string, OrderBulkFieldKey>();
  for (const column of ORDER_BULK_COLUMNS) {
    map.set(normalizeHeader(column.label), column.key);
    map.set(normalizeHeader(orderBulkHeaderLabel(column)), column.key);
  }
  // Tương thích mẫu nhập cũ trước khi tách riêng tỉnh, quận và phường.
  map.set(normalizeHeader('Huyện'), 'huyen');
  map.set(normalizeHeader('Số khối (m3)'), 'm3');
  map.set(normalizeHeader('Số khối m3'), 'm3');
  return map;
})();

function findHeaderRowIndex(matrix: unknown[][]) {
  let bestIndex = -1;
  let bestMatchCount = 0;
  const limit = Math.min(matrix.length, 20);

  for (let index = 0; index < limit; index += 1) {
    const matchedKeys = new Set(
      (matrix[index] || [])
        .map((cell) => headerToKey.get(normalizeHeader(cell)))
        .filter((key): key is OrderBulkFieldKey => Boolean(key)),
    );
    if (matchedKeys.size > bestMatchCount) {
      bestIndex = index;
      bestMatchCount = matchedKeys.size;
    }
  }

  return bestMatchCount >= 4 ? bestIndex : -1;
}

export function downloadOrderBulkTemplate() {
  const notes = ORDER_BULK_COLUMNS.map((column) => ORDER_BULK_TEMPLATE_NOTES[column.key] || '');
  const headers = ORDER_BULK_COLUMNS.map(orderBulkHeaderLabel);
  const sample = ORDER_BULK_COLUMNS.map((column) => column.sample ?? '');
  const instructions = ORDER_BULK_INSTRUCTIONS.map((line, index) => ({
    STT: index + 1,
    'Hướng dẫn': line,
  }));

  const workbook = utils.book_new();
  const orderSheet = utils.aoa_to_sheet([notes, headers, sample]);
  orderSheet['!cols'] = ORDER_BULK_COLUMNS.map((column) => ({
    wch: Math.max(12, column.label.length + 3, (ORDER_BULK_TEMPLATE_NOTES[column.key] || '').length > 24 ? 24 : 0),
  }));
  utils.book_append_sheet(workbook, orderSheet, 'Don_hang');
  utils.book_append_sheet(workbook, utils.json_to_sheet(instructions), 'Huong_dan');
  writeFile(workbook, 'mau-nhap-don-hang-loat.xlsx');
}

function emptyBulkRow(): OrderBulkRow {
  return ORDER_BULK_COLUMNS.reduce((row, column) => {
    row[column.key] = '';
    return row;
  }, {} as OrderBulkRow);
}

function isBlankRow(values: OrderBulkRow) {
  return ORDER_BULK_COLUMNS.every((column) => !values[column.key]);
}

function isUnchangedTemplateSampleRow(values: OrderBulkRow) {
  return ORDER_BULK_COLUMNS.every(
    (column) => values[column.key] === (
      column.key === 'ngayDi'
        ? normalizeOrderBulkDate(column.sample ?? '')
        : cellText(column.sample ?? '')
    ),
  );
}

export function parseOrderBulkWorkbook(file: ArrayBuffer): ParsedOrderBulkRow[] {
  const workbook = read(file, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('don')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!matrix.length) return [];

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) return [];
  const headerRow = matrix[headerRowIndex] || [];
  const columnIndexes = headerRow.map((header) => headerToKey.get(normalizeHeader(header)) || null);
  const date1904 = workbook.Workbook?.WBProps?.date1904 === true;

  const parsed: ParsedOrderBulkRow[] = [];
  let foundFirstDataRow = false;
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const raw = matrix[index] || [];
    const values = emptyBulkRow();
    columnIndexes.forEach((key, colIndex) => {
      if (!key) return;
      values[key] = key === 'ngayDi'
        ? normalizeOrderBulkDate(raw[colIndex], date1904)
        : cellText(raw[colIndex]);
    });
    if (isBlankRow(values)) continue;
    if (!foundFirstDataRow) {
      foundFirstDataRow = true;
      if (isUnchangedTemplateSampleRow(values)) continue;
    }
    parsed.push({ rowNumber: index + 1, values, errors: [] });
  }
  return parsed;
}

export function enrichOrderBulkRowsWithCustomers(
  rows: ParsedOrderBulkRow[],
  customers: CustomerRecord[],
): ParsedOrderBulkRow[] {
  const customerByCode = new Map(
    customers.map((customer) => [customer.code.trim().toUpperCase(), customer]),
  );

  return rows.map((row) => {
    const code = row.values.maKh.trim().toUpperCase();
    const customer = customerByCode.get(code);
    if (!customer) return { ...row, customerMatched: false };

    const values = { ...row.values, maKh: customer.code.trim().toUpperCase() };
    const customerPatch = customerToOrderPatch(customer);
    const receiverPatch = applyReceiverByDestination(customer, values.huyen);
    const fillIfBlank = (key: OrderBulkFieldKey, value: unknown) => {
      if (!values[key].trim() && value != null) values[key] = String(value).trim();
    };

    fillIfBlank('dienThoaiKh', customerPatch.dienThoaiKh);
    fillIfBlank('nguoiGui', customerPatch.nguoiGui);
    fillIfBlank('diaChiGui', customerPatch.diaChiGui);
    fillIfBlank('nguoiNhan', receiverPatch.nguoiNhan);
    fillIfBlank('dienThoaiNhan', receiverPatch.dienThoaiNhan);
    fillIfBlank('diaChiNhan', receiverPatch.diaChiNhan);
    fillIfBlank('quanHuyen', receiverPatch.quanHuyen);
    fillIfBlank('phuongXa', receiverPatch.phuongXa);

    return { ...row, values, customerMatched: true };
  });
}

export function resolveBulkHubId(hubs: HubSummary[], raw: string) {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return '';
  const byCode = hubIdFromCode(hubs, normalized);
  if (byCode) return byCode;
  const byName = hubs.find((hub) => hub.name?.trim().toUpperCase().includes(normalized));
  return byName ? String(byName.id) : '';
}

function hasWeightInput(values: OrderBulkRow) {
  const kg = parseDecimalNumber(values.klKg);
  const m3 = parseDecimalNumber(values.m3);
  const l = parseDecimalNumber(values.chieuDai);
  const w = parseDecimalNumber(values.chieuRong);
  const h = parseDecimalNumber(values.chieuCao);
  if (kg > 0) return true;
  if (m3 > 0) return true;
  return l > 0 && w > 0 && h > 0;
}

export function validateOrderBulkRow(
  values: OrderBulkRow,
  hubs: HubSummary[],
  customerMatched?: boolean,
): string[] {
  const errors: string[] = [];
  const originHubId = resolveBulkHubId(hubs, values.bcGui);
  const destHubId = resolveBulkHubId(hubs, values.bcDen);

  if (!values.bcGui.trim()) errors.push('Thiếu BC gửi.');
  else if (!originHubId) errors.push(`Không tìm thấy bưu cục gửi "${values.bcGui}".`);

  if (!values.bcDen.trim()) errors.push('Thiếu BC đến.');
  else if (!destHubId) errors.push(`Không tìm thấy bưu cục đến "${values.bcDen}".`);

  if (originHubId && destHubId && originHubId === destHubId) {
    errors.push('BC gửi và BC đến không được trùng.');
  }

  if (!values.maKh.trim()) errors.push('Thiếu Mã KH.');
  else if (customerMatched === false) errors.push(`Không tìm thấy Mã KH "${values.maKh}".`);

  if (!values.nguoiGui.trim()) errors.push('Thiếu người gửi.');
  if (values.dienThoaiNhan.trim() && !isValidVnPhone(values.dienThoaiNhan)) {
    errors.push('SĐT người nhận không hợp lệ.');
  }

  if (!hasWeightInput(values)) {
    errors.push('Cần Số cân (kg), hoặc Dài/Rộng/Cao (cm), hoặc Số khối (m³).');
  }

  if (!values.dichVu.trim()) errors.push('Thiếu dịch vụ.');
  if (!values.giaoHang.trim()) errors.push('Thiếu hình thức giao hàng.');
  if (!values.ngayDi.trim()) errors.push('Thiếu ngày gửi.');
  else if (!isValidOrderBulkDate(values.ngayDi)) {
    errors.push('Ngày gửi không hợp lệ; nhập theo dd/mm/yyyy.');
  }
  if (!values.phuongThuc.trim()) errors.push('Thiếu phương thức thanh toán.');

  [values.anh1, values.anh2, values.anh3, values.anh4].filter(Boolean).forEach((url, index) => {
    if (!isPublicImageUrl(url)) errors.push(`URL ảnh ${index + 1} không hợp lệ.`);
  });

  return errors;
}

export function bulkRowToOrderForm(
  values: OrderBulkRow,
  hubs: HubSummary[],
  defaults: Partial<NewOrderFormState>,
): NewOrderFormState {
  const originHubId = resolveBulkHubId(hubs, values.bcGui);
  const destHubId = resolveBulkHubId(hubs, values.bcDen);
  const destHub = hubs.find((hub) => String(hub.id) === destHubId);
  const destCode = destHub?.code?.trim().toUpperCase() || values.bcDen.trim().toUpperCase();
  const addressParts = extractVietnamAddressParts(values.diaChiNhan);

  const base: NewOrderFormState = {
    ...emptyOrderForm(),
    ...defaults,
    originHubId,
    destHubId,
    noiDen: destCode,
    maKh: values.maKh || defaults.maKh || '',
    dienThoaiKh: values.dienThoaiKh || defaults.dienThoaiKh || '',
    nguoiGui: values.nguoiGui,
    diaChiGui: values.diaChiGui || defaults.diaChiGui || '',
    nguoiNhan: values.nguoiNhan,
    dienThoaiNhan: values.dienThoaiNhan ? normalizeVnPhone(values.dienThoaiNhan) : '',
    diaChiNhan: values.diaChiNhan,
    huyen: values.huyen || destHub?.name || defaults.huyen || '',
    quanHuyen: values.quanHuyen || addressParts.district || defaults.quanHuyen || '',
    phuongXa: values.phuongXa || addressParts.ward || defaults.phuongXa || '',
    soBill: values.soBill.trim().toUpperCase(),
    soKien: values.soKien || defaults.soKien || '1',
    dichVu: values.dichVu || defaults.dichVu || 'Tiêu chuẩn 72h',
    giaoHang: values.giaoHang || defaults.giaoHang || 'Văn phòng',
    ngayDi: values.ngayDi,
    donGiaDonVi: values.donGiaDonVi || defaults.donGiaDonVi || 'Kg',
    klKg: values.klKg,
    chieuDai: values.chieuDai || '0',
    chieuRong: values.chieuRong || '0',
    chieuCao: values.chieuCao || '0',
    m3: values.m3,
    nvgn: values.nvgn || defaults.nvgn || 'ADMIN',
    noiDung: values.noiDung,
    ghiChu: values.ghiChu,
    billImages: [values.anh1, values.anh2, values.anh3, values.anh4].filter(Boolean),
    phuongThuc: values.phuongThuc || defaults.phuongThuc || 'Công nợ tháng',
    donGia: values.donGia || '0',
    cod: values.cod || '0',
    giamGia: values.giamGia || '0',
  };

  const volumetric = calcVolumetricWeight(base.chieuDai, base.chieuRong, base.chieuCao);
  return applyPricingToForm({
    ...base,
    klQuyDoi: volumetric || base.klQuyDoi,
  });
}

export function assignBulkWaybillCodes(
  rows: ParsedOrderBulkRow[],
  hubs: HubSummary[],
  existingCodes: string[],
) {
  const usedCodes = new Set(existingCodes.map((code) => code.trim().toUpperCase()));
  const sequences = new Map<string, number>();

  for (const row of rows) {
    if (row.values.soBill.trim()) {
      row.autoAssignedWaybillCode ??= false;
      usedCodes.add(row.values.soBill.trim().toUpperCase());
      continue;
    }
    const originHubId = resolveBulkHubId(hubs, row.values.bcGui);
    const hubCode = hubs.find((hub) => String(hub.id) === originHubId)?.code || row.values.bcGui;
    const normalizedHubCode = hubCode.trim().toUpperCase();
    const currentMax = sequences.get(normalizedHubCode) ?? maxEcoBillSequence([...usedCodes], normalizedHubCode);
    const next = currentMax + 1;
    sequences.set(normalizedHubCode, next);
    const generated = formatEcoBillCode(normalizedHubCode, next);
    row.values.soBill = generated;
    row.autoAssignedWaybillCode = true;
    usedCodes.add(generated);
  }
}

/**
 * Thay dãy mã tạm bằng dãy mới nhất do server trả về. Mỗi HUB chỉ cần gọi
 * /waybills/next-code một lần; các dòng kế tiếp tăng tuần tự từ mã đó.
 */
export function applyServerNextCodesToBulkRows(
  rows: ParsedOrderBulkRow[],
  hubs: HubSummary[],
  nextCodeByOriginHubId: ReadonlyMap<string, string>,
) {
  const nextSequenceByOriginHubId = new Map<string, number>();

  for (const row of rows) {
    if (!row.autoAssignedWaybillCode) continue;

    const originHubId = resolveBulkHubId(hubs, row.values.bcGui);
    const hubCode = hubs.find((hub) => String(hub.id) === originHubId)?.code || row.values.bcGui;
    const serverNextCode = nextCodeByOriginHubId.get(originHubId) || '';
    const firstSequence = maxEcoBillSequence([serverNextCode], hubCode);
    if (!originHubId || firstSequence <= 0) continue;

    const sequence = nextSequenceByOriginHubId.get(originHubId) ?? firstSequence;
    row.values.soBill = formatEcoBillCode(hubCode, sequence);
    nextSequenceByOriginHubId.set(originHubId, sequence + 1);
  }
}

export function buildBulkCreatePayload(form: NewOrderFormState) {
  const volumetricWeight = parseDecimalNumber(calcVolumetricWeight(form.chieuDai, form.chieuRong, form.chieuCao));
  return buildCreatePayload(form, volumetricWeight);
}

export function annotateBulkRows(rows: ParsedOrderBulkRow[], hubs: HubSummary[]) {
  return rows.map((row) => ({
    ...row,
    errors: validateOrderBulkRow(row.values, hubs, row.customerMatched),
  }));
}

export function nextFallbackBillCode(existingCodes: string[], hubCode: string) {
  return nextEcoBillCodeFromCodes(existingCodes, hubCode);
}
