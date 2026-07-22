export const WAYBILL_PRINT_FORMATS = ['a4', 'a4-landscape', 'a5'] as const;

export type WaybillPrintFormat = (typeof WAYBILL_PRINT_FORMATS)[number];

export interface WaybillPrintFormatConfig {
  label: string;
  pageLabel: string;
  hint: string;
  pageSize: 'A4 portrait' | 'A4 landscape' | 'A5 landscape';
}

export const DEFAULT_WAYBILL_PRINT_FORMAT: WaybillPrintFormat = 'a4';

export const WAYBILL_PRINT_FORMAT_CONFIG: Record<WaybillPrintFormat, WaybillPrintFormatConfig> = {
  a4: {
    label: 'A4 dọc · nửa trang',
    pageLabel: 'A4 dọc',
    hint: 'Mặc định cũ: để giấy A4 dọc trong khay, phiếu nằm ở nửa trên trang.',
    pageSize: 'A4 portrait',
  },
  'a4-landscape': {
    label: 'A4 ngang · đầy trang',
    pageLabel: 'A4 ngang',
    hint: 'Giữ giấy A4 trong khay thường; máy in tự xoay ngang và phóng phiếu vừa vùng an toàn.',
    pageSize: 'A4 landscape',
  },
  a5: {
    label: 'A5 ngang · khay A5',
    pageLabel: 'A5 ngang',
    hint: 'Dùng giấy A5 ngang (210×148mm) và chọn đúng khay A5 trên máy in.',
    pageSize: 'A5 landscape',
  },
};

/**
 * URL cũ không có `format` (hoặc dùng `format=a4`) vẫn in A4 dọc như trước.
 * Giá trị lạ cũng quay về mặc định an toàn thay vì thay đổi kích thước giấy.
 */
export function resolveWaybillPrintFormat(value: string | null): WaybillPrintFormat {
  return WAYBILL_PRINT_FORMATS.includes(value as WaybillPrintFormat)
    ? value as WaybillPrintFormat
    : DEFAULT_WAYBILL_PRINT_FORMAT;
}

export function buildWaybillPageSizeRule(format: WaybillPrintFormat) {
  const { pageSize } = WAYBILL_PRINT_FORMAT_CONFIG[format];
  return `@media print { @page { size: ${pageSize}; margin: 0; } }`;
}

/**
 * Bỏ tham số ở format mặc định để URL mới vẫn tương thích và gọn như URL cũ.
 */
export function withWaybillPrintFormat(
  searchParams: URLSearchParams,
  format: WaybillPrintFormat,
) {
  const next = new URLSearchParams(searchParams);
  if (format === DEFAULT_WAYBILL_PRINT_FORMAT) next.delete('format');
  else next.set('format', format);
  return next;
}
