import { describe, expect, it } from 'vitest';
import { buildInventoryTripLinesQuery, sortAllOrdersByCreatedAt } from './inventoryTripLines';
import type { InventoryFilters, WaybillInventoryItem } from './types';

const filters: InventoryFilters = {
  keyword: '',
  ma_kh: '',
  statuses: [],
  orderStatusGroups: [],
  noiDenKeyword: '',
  billingUnits: [],
  customerPaymentStatuses: [],
  hubIds: [],
  paymentTypes: [],
  priorities: [],
  receivedFrom: '',
  receivedTo: '',
  page: 1,
  limit: 25,
};

const item = (id: string, createdAt: string, receivedAt?: string): WaybillInventoryItem => ({
  id,
  created_at: createdAt,
  received_at: receivedAt,
});

describe('all-orders inventory query', () => {
  it('requests the unrestricted all-orders scope', () => {
    const params = new URLSearchParams(buildInventoryTripLinesQuery(filters, { listScope: 'all_orders' }));

    expect(params.get('list_scope')).toBe('all_orders');
    expect(params.has('hub_id')).toBe(false);
  });

  it('sorts by creation time and uses descending id as a stable tie breaker', () => {
    const rows = sortAllOrdersByCreatedAt([
      item('9', '2026-08-06T10:00:00.000Z'),
      item('11', '2026-08-06T11:00:00.000Z'),
      item('10', '2026-08-06T11:00:00.000Z'),
      item('12', '2026-08-06T09:00:00.000Z', '2026-08-07T12:00:00.000Z'),
    ]);

    expect(rows.map((row) => row.id)).toEqual(['11', '10', '9', '12']);
  });
});
