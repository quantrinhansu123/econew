export function getSpreadsheetColumnName(index: number): string {
  let value = Math.max(0, Math.trunc(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function resolveCustomerLedgerCode(toolbarCode: string, columnCode?: string): string {
  return [toolbarCode, columnCode]
    .map((value) => value?.trim() || '')
    .find((value) => value && value !== '—') || '';
}
