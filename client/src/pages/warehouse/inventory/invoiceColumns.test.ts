import { describe, expect, it } from 'vitest';
import { ALL_ORDERS_SELECTABLE_COLUMN_IDS, resolveVat, resolveVatInvoice, resolveVatRate } from './inventoryColumns';
import { inventoryPrintCellValue } from '../../print/inventoryPrintUtils';
import { buildInventoryExcelRows } from './inventoryExcelUtils';
import type { WaybillInventoryItem } from './types';

describe('invoice columns', () => {
  const bill = { id: '1', waybill_code: 'B1', note: 'co_vat=1 | vat_enabled=1 | vat_manual=1 | vat=44560 | thue_suat=8%', customer_payment_status: 'PARTIAL' } as WaybillInventoryItem;
  it('offers saved VAT and invoice fields in the column picker', () => {
    expect(ALL_ORDERS_SELECTABLE_COLUMN_IDS).toEqual(expect.arrayContaining(['vat', 'vat_invoice', 'vat_rate']));
    expect(resolveVat(bill)).toBe(44560);
    expect(resolveVatRate(bill)).toBe('8%');
    expect(resolveVatInvoice(bill)).toBe('Có');
    expect(resolveVat({ ...bill, note: 'vat_enabled=0 | vat=44560' })).toBe(0);
  });
  it('prints saved VAT without recalculating it, respecting pricing permission', () => {
    expect(inventoryPrintCellValue(bill, 'vat', true, 1)).toBe('44.560 đ');
    expect(inventoryPrintCellValue(bill, 'vat', false, 1)).toBe('');
    expect(inventoryPrintCellValue(bill, 'vat_rate', false, 1)).toBe('');
    expect(inventoryPrintCellValue(bill, 'customer_payment_status', true, 1)).toBe('TT một phần');
  });
  it('exports partial payment and the selected invoice columns', () => {
    const rows = buildInventoryExcelRows([bill], ['vat', 'vat_rate', 'vat_invoice', 'customer_payment_status'], true, '', 'all-orders');
    expect(JSON.stringify(rows)).toContain('44560');
    expect(JSON.stringify(rows)).toContain('TT một phần');
  });
});
