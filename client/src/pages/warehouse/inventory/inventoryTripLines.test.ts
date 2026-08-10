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
  destHubIds: [],
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

  it('requests the unrestricted inventory scope for adding bills to a trip', () => {
    const params = new URLSearchParams(buildInventoryTripLinesQuery(filters, {
      onlyIncompleteSplit: true,
      listScope: 'all_inventory',
    }));

    expect(params.get('list_scope')).toBe('all_inventory');
    expect(params.get('only_incomplete_split')).toBe('1');
    expect(params.has('hub_id')).toBe(false);
  });

  it('filters the all-orders list by sent date instead of import date', () => {
    const params = new URLSearchParams(buildInventoryTripLinesQuery(
      { ...filters, receivedFrom: '2026-07-31', receivedTo: '2026-07-31' },
      { listScope: 'all_orders' },
    ));

    expect(params.get('sent_from')).toBe('2026-07-31');
    expect(params.get('sent_to')).toBe('2026-07-31');
    expect(params.has('received_from')).toBe(false);
    expect(params.has('received_to')).toBe(false);
  });

  it('serializes destination HUB filters independently from the current HUB', () => {
    const params = new URLSearchParams(buildInventoryTripLinesQuery({
      ...filters,
      hubIds: ['1'],
      destHubIds: ['2', '3'],
    }));

    expect(params.get('hub_id')).toBe('1');
    expect(params.get('dest_hub_id')).toBe('2,3');
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
