import type { SearchWaybillRow } from './types';

export function compactWaybillCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '');
}

export function findExactWaybillMatch(
  rows: SearchWaybillRow[],
  scannedValue: string,
): SearchWaybillRow | null {
  const scannedCode = compactWaybillCode(scannedValue);
  if (!scannedCode) return null;
  return rows.find((row) => compactWaybillCode(row.waybill_code) === scannedCode) || null;
}

export function contactName(info?: string | null): string {
  return String(info || '').split('|')[0]?.trim() || '';
}
