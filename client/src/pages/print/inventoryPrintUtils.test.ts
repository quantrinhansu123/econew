import { describe, expect, it } from 'vitest';
import type { WaybillInventoryItem } from '../warehouse/inventory/types';
import { buildInventoryExcelRows } from '../warehouse/inventory/inventoryExcelUtils';
import {
  buildInventoryQueryForPrint,
  mapWaybillsToPrintRows,
  mapWaybillsToPrintSheets,
  reconcilePrintPayload,
  type InventoryPrintPayload,
} from './inventoryPrintUtils';

describe('inventory stock-list print columns', () => {
  it('filters print data by the selected origin HUB', () => {
    const query = new URLSearchParams(buildInventoryQueryForPrint({
      keyword: '',
      ma_kh: '',
      statuses: [],
      orderStatusGroups: [],
      noiDenKeyword: '',
      billingUnits: [],
      customerPaymentStatuses: [],
      originHubIds: ['1'],
      destHubIds: [],
      paymentTypes: [],
      priorities: [],
      receivedFrom: '',
      receivedTo: '',
      page: 1,
      limit: 10,
    }));

    expect(query.get('origin_hub_id')).toBe('1');
    expect(query.has('hub_id')).toBe(false);
  });

  it('maps only the columns selected by the inventory table', () => {
    const waybill: WaybillInventoryItem = {
      id: 1,
      waybill_code: 'ECOHAN1001',
      loaded_at: '2026-07-26',
      noi_dung: 'Hàng mẫu',
      priority: 'HIGH',
      order_code: 'ORDER-1',
    };

    const payload = mapWaybillsToPrintRows(
      [waybill],
      true,
      ['loaded_at', 'cong_sg', 'waybill_code'],
    );

    expect(payload.columns).toEqual([
      { id: 'loaded_at', label: 'Ngày bốc' },
      { id: 'cong_sg', label: 'Nội dung hàng' },
      { id: 'waybill_code', label: 'Mã bill' },
    ]);
    expect(payload.rows[0]).toEqual({
      loaded_at: '26/07/2026',
      cong_sg: 'Hàng mẫu',
      waybill_code: 'ECOHAN1001',
    });
    expect(payload.rows[0]).not.toHaveProperty('order_code');
    expect(payload.rows[0]).not.toHaveProperty('priority');
  });

  it('prints and exports the barcode column with the exact bill code', () => {
    const waybill: WaybillInventoryItem = { id: 1, waybill_code: 'ECOHAN109157' };
    const payload = mapWaybillsToPrintRows([waybill], false, ['barcode']);
    const excelRows = buildInventoryExcelRows([waybill], ['barcode'], false, '', 'split-pending');

    expect(payload.columns).toEqual([{ id: 'barcode', label: 'Mã vạch' }]);
    expect(payload.rows[0].barcode).toBe('ECOHAN109157');
    expect(excelRows[4][0]).toBe('ECOHAN109157');
  });

  it('never adds hidden columns while reconciling a stored print payload', () => {
    const payload: InventoryPrintPayload = {
      printedAt: '26/07/2026 18:00:00',
      filterSummary: '',
      showPricing: true,
      columns: [
        { id: 'loaded_at', label: 'Ngày bốc hàng' },
        { id: 'waybill_code', label: 'Mã vận đơn' },
      ],
      rows: [
        {
          loaded_at: '26/07/2026',
          waybill_code: 'ECOHAN1001',
          order_code: 'ORDER-1',
          priority: 'HIGH',
        },
      ],
      totals: {
        package_count: '1',
        weight_kg: '50',
        volumetric_weight_kg: '65',
        volume_m3: '1.20',
        freight: '',
      },
    };

    const reconciled = reconcilePrintPayload(payload);

    expect(reconciled.columns.map((column) => column.id)).toEqual([
      'loaded_at',
      'waybill_code',
    ]);
    expect(reconciled.rows).toEqual([
      {
        loaded_at: '26/07/2026',
        waybill_code: 'ECOHAN1001',
      },
    ]);
    expect(reconciled.columns.map((column) => column.id)).not.toContain('order_code');
    expect(reconciled.columns.map((column) => column.id)).not.toContain('priority');
  });

  it('uses the allocated COD consistently for a split inventory row', () => {
    const waybill: WaybillInventoryItem = {
      id: 1,
      cod_amount: 500_000,
      allocated_cod: 125_000,
    };
    const payload = mapWaybillsToPrintRows([waybill], true, ['cod_amount']);
    const excelRows = buildInventoryExcelRows(
      [waybill],
      ['cod_amount'],
      true,
      '',
      'split-pending',
    );

    expect(payload.rows[0].cod_amount).toBe('125.000');
    expect(excelRows[4][0]).toBe(125_000);
  });

  it('preserves view-specific labels supplied by the source list', () => {
    const payload = mapWaybillsToPrintRows(
      [{ id: 1, waybill_code: 'ECOHAN1001', noi_den: 'HCM' }],
      true,
      ['waybill_code', 'noi_den'],
      { waybill_code: 'Bill', noi_den: 'Nơi đến' },
    );

    expect(payload.columns).toEqual([
      { id: 'noi_den', label: 'Nơi đến' },
      { id: 'waybill_code', label: 'Bill' },
    ]);
  });

  it('moves Mã bill to the final printable column', () => {
    const payload = mapWaybillsToPrintRows(
      [{ id: 1, waybill_code: 'ECOHAN1001', noi_den: 'HCM', package_count: 2 }],
      true,
      ['waybill_code', 'noi_den', 'package_count'],
    );

    expect(payload.columns.map((column) => column.id)).toEqual([
      'noi_den',
      'package_count',
      'waybill_code',
    ]);
  });

  it('splits HCM and provincial destination HUBs into separate print sheets with HCM first', () => {
    const sheets = mapWaybillsToPrintSheets([
      { id: 1, waybill_code: 'ECOHAN1', dest_hub: { id: 2, code: 'KHANHHOA', name: 'Chành Vũ Mập' }, package_count: 7 },
      { id: 2, waybill_code: 'ECOHAN2', dest_hub: { id: 1, code: 'HCM', name: 'Bưu cục Hồ Chí Minh' }, package_count: 127 },
      { id: 3, waybill_code: 'ECOHAN3', dest_hub: { id: 3, code: 'DAN', name: 'Chành Trường Long' }, package_count: 60 },
    ], false, ['dest_hub', 'package_count', 'waybill_code'], 'HUB hiện tại: HAN');

    expect(sheets).toHaveLength(2);
    expect(sheets[0].title).toContain('HCM');
    expect(sheets[0].rows.map((row) => row.waybill_code)).toEqual(['ECOHAN2']);
    expect(sheets[0].totals.package_count).toBe('127');
    expect(sheets[1].title).toContain('bưu cục khác');
    expect(sheets[1].rows.map((row) => row.waybill_code)).toEqual(['ECOHAN3', 'ECOHAN1']);
    expect(sheets[1].totals.package_count).toBe('67');
  });

  it('keeps one total print sheet when the current warehouse is HCM', () => {
    const sheets = mapWaybillsToPrintSheets([
      { id: 1, dest_hub: { id: 2, code: 'HAN', name: 'Bưu cục Hà Nội' }, package_count: 40 },
      { id: 2, dest_hub: { id: 3, code: 'KHANHHOA', name: 'Chành Vũ Mập' }, package_count: 7 },
    ], false, ['dest_hub', 'package_count'], 'HUB hiện tại: HCM', undefined, { currentHubIsHcm: true });

    expect(sheets).toHaveLength(1);
    expect(sheets[0].title).toContain('Bưu cục HCM');
    expect(sheets[0].rows).toHaveLength(2);
    expect(sheets[0].totals.package_count).toBe('47');
  });
});
