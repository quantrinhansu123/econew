import { describe, expect, it } from 'vitest';
import type { WaybillInventoryItem } from '../warehouse/inventory/types';
import { buildInventoryExcelRows } from '../warehouse/inventory/inventoryExcelUtils';
import {
  mapWaybillsToPrintRows,
  reconcilePrintPayload,
  type InventoryPrintPayload,
} from './inventoryPrintUtils';

describe('inventory stock-list print columns', () => {
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
});
