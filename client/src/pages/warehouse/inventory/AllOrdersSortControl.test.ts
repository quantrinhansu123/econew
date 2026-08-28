import { describe, expect, it } from 'vitest';
import { getSpreadsheetColumnName, resolveCustomerLedgerCode } from './allOrdersSortUtils';

describe('AllOrdersSortControl helpers', () => {
  it('uses spreadsheet column names for the visible table order', () => {
    expect(getSpreadsheetColumnName(0)).toBe('A');
    expect(getSpreadsheetColumnName(25)).toBe('Z');
    expect(getSpreadsheetColumnName(26)).toBe('AA');
    expect(getSpreadsheetColumnName(27)).toBe('AB');
  });

  it('opens the customer ledger from either toolbar or the single customer left after filtering', () => {
    expect(resolveCustomerLedgerCode(' ADO ', 'KHACHLE')).toBe('ADO');
    expect(resolveCustomerLedgerCode('', ' ADO ')).toBe('ADO');
    expect(resolveCustomerLedgerCode('', '—')).toBe('');
  });
});
