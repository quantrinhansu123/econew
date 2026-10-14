import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { emptyOrderForm } from '../warehouse/orders/orderFormData';
import { buildCreatePayload, waybillToOrderForm } from '../warehouse/orders/orderFormUtils';
import { buildBulkCreatePayload, bulkRowToOrderForm, parseOrderBulkWorkbook } from '../warehouse/orders/orderBulkExcelUtils';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { buildWaybillPrintData } from './waybillPrintUtils';

const form = () => ({
  ...emptyOrderForm(),
  originHubId: '1',
  destHubId: '2',
  soBill: 'ECOHAN110373',
  soKien: '2',
  klKg: '370',
  klQuyDoi: '370',
  m3: '3.69',
  donGia: '5000',
  ghiChu: 'Gọi trước khi giao',
});

const savedBill = (hideMeasurementsOnPrint: boolean): WaybillDetail => ({
  id: '110373',
  ...buildCreatePayload({ ...form(), hideMeasurementsOnPrint }, 370),
});

describe('hiding kg and CBM on bills', () => {
  it('shows measurements by default, including existing bills', () => {
    expect(emptyOrderForm().hideMeasurementsOnPrint).toBe(false);
    expect(waybillToOrderForm({ id: '1' }, []).hideMeasurementsOnPrint).toBe(false);
    const data = buildWaybillPrintData(savedBill(false));
    expect(data.trongLuongQuyDoi).toBe('370.00');
    expect(data.cbm).toBe('3.69');
  });

  it('saves and restores the preference without changing weights, volume or charges', () => {
    const bill = savedBill(true);
    const visibleBill = savedBill(false);
    const restored = waybillToOrderForm(bill, []);

    expect(restored.hideMeasurementsOnPrint).toBe(true);
    expect(restored.klKg).toBe('370');
    expect(restored.klQuyDoi).toBe('370');
    expect(restored.m3).toBe('3.69');
    expect(restored.ghiChu).toBe('Gọi trước khi giao');
    for (const key of ['weight', 'volumetric_weight', 'the_tich_m3', 'freight_amount', 'cc_amount', 'cod_amount'] as const) {
      expect(bill[key]).toBe(visibleBill[key]);
    }

    const data = buildWaybillPrintData(bill, true);
    expect(data.trongLuongQuyDoi).toBe('');
    expect(data.cbm).toBe('');
    expect(data.soKien).toBe('2');
    expect(data.showPricing).toBe(true);
    expect(data.tongCuoc).toBe(buildWaybillPrintData(visibleBill, true).tongCuoc);
  });

  it('restores printed measurements after unchecking and saving an existing bill', () => {
    const restored = waybillToOrderForm(savedBill(true), []);
    const updated = { id: '110373', ...buildCreatePayload({ ...restored, hideMeasurementsOnPrint: false }, 370) };

    expect(waybillToOrderForm(updated, []).hideMeasurementsOnPrint).toBe(false);
    expect(buildWaybillPrintData(updated).trongLuongQuyDoi).toBe('370.00');
    expect(buildWaybillPrintData(updated).cbm).toBe('3.69');
  });

  it('applies the Excel import checkbox to every imported bill', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['BC gửi', 'BC đến', 'Trọng lượng thực (kg)', 'Trọng lượng quy đổi (kg)', 'Số khối (m³)', 'Nội dung'],
      ['HAN', 'HCM', 370, 370, 3.69, 'Hàng 1'],
      ['HAN', 'HCM', 125, 150, 1.25, 'Hàng 2'],
    ]), 'Don_hang');
    const buffer = write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const rows = parseOrderBulkWorkbook(buffer);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const imported = bulkRowToOrderForm(row.values, [{ id: '1', code: 'HAN' }, { id: '2', code: 'HCM' }], {
        hideMeasurementsOnPrint: true,
      });
      const bill = { id: String(row.rowNumber), ...buildBulkCreatePayload(imported) };
      expect(waybillToOrderForm(bill, []).hideMeasurementsOnPrint).toBe(true);
      expect(bill.weight).toBe(Number(row.values.klKg));
      expect(bill.the_tich_m3).toBe(Number(row.values.m3));
      expect(buildWaybillPrintData(bill).trongLuongQuyDoi).toBe('');
      expect(buildWaybillPrintData(bill).cbm).toBe('');
    }
  });

  it('respects each saved preference when printing a mixture of bills', () => {
    const data = [savedBill(true), savedBill(false)].map((bill) => buildWaybillPrintData(bill));
    expect(data.map((bill) => bill.cbm)).toEqual(['', '3.69']);
    expect(data.map((bill) => bill.trongLuongQuyDoi)).toEqual(['', '370.00']);
  });

  it('supports immediate print overrides before saving the checkbox', () => {
    expect(buildWaybillPrintData(savedBill(false), false, true).cbm).toBe('');
    expect(buildWaybillPrintData(savedBill(true), false, false).cbm).toBe('3.69');
  });

  it('leaves both measurement cells blank while keeping the bill layout and package count', () => {
    const html = renderToStaticMarkup(<WaybillInvoiceTemplate data={buildWaybillPrintData(savedBill(true))} />);
    expect(html).toContain('Trọng lượng quy đổi');
    expect(html).toContain('CBM');
    expect(html).toContain('<span class="eco-stat-value">2</span>');
    expect(html.match(/<span class="eco-stat-value"><\/span>/g)).toHaveLength(2);
    expect(html).not.toContain('370.00');
    expect(html).not.toContain('3.69');
    expect(html).not.toContain('hide_kg_cbm');
  });
});
