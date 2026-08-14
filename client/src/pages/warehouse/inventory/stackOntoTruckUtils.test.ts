import { describe, expect, it } from 'vitest';
import type { WaybillInventoryItem } from './types';
import {
  buildStackFormRows,
  buildStackOntoTruckPayload,
  computeExpectedArrivalDate,
  updateExpectedArrivalForHub,
  type StackOntoTruckFormRow,
  type StackOntoTruckSharedFields,
} from './stackOntoTruckUtils';

describe('stack-onto-truck expected arrival', () => {
  it('uses the loading day plus three days instead of the original order date', () => {
    const loadingDate = new Date(2026, 6, 20, 12, 0, 0);
    const waybill = {
      id: 'waybill-1',
      waybill_code: 'ECO-HAN-108960',
      created_at: '2026-07-04T08:00:00.000Z',
      received_at: '2026-07-04T09:00:00.000Z',
      package_count: 1,
      dest_hub: { id: 2, code: 'HCM', name: 'Hồ Chí Minh' },
    } as WaybillInventoryItem;

    const result = buildStackFormRows([waybill], loadingDate);

    expect(result[0].expected_arrival_label).toBe('23/07/2026');
  });

  it('computes a deterministic three-day offset', () => {
    const result = computeExpectedArrivalDate(new Date(2026, 6, 20, 12, 0, 0));

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(23);
  });

  it('uses destination-specific defaults while stacking', () => {
    const loadingDate = new Date(2026, 7, 8, 8, 0, 0);
    const rows = buildStackFormRows([
      { id: 'w1', dest_hub: { id: '2', code: 'DANANG', name: 'Đà Nẵng' } },
      { id: 'w2', dest_hub: { id: '3', code: 'KHANHHOA', name: 'Khánh Hòa' } },
      { id: 'w3', dest_hub: { id: '4', code: 'HCM', name: 'Hồ Chí Minh' } },
    ] as WaybillInventoryItem[], loadingDate);

    expect(rows.map((row) => new Date(row.expected_arrival_at!).getDate())).toEqual([9, 10, 11]);
  });

  it('uses the transit days configured on each destination hub', () => {
    const loadingDate = new Date(2026, 7, 14, 8, 0, 0);
    const rows = buildStackFormRows([
      { id: 'w1', dest_hub: { id: '2', code: 'DAN', transit_days: 1 } },
      { id: 'w2', dest_hub: { id: '3', code: 'KHANHHOA', transit_days: 2 } },
      { id: 'w3', dest_hub: { id: '4', code: 'HCM', transit_days: 3 } },
    ] as WaybillInventoryItem[], loadingDate);

    expect(rows.map((row) => new Date(row.expected_arrival_at!).getDate())).toEqual([15, 16, 17]);
  });
});

describe('stack-onto-truck request payload', () => {
  it('puts vendor data at the request root and keeps line items route-only', () => {
    const rows: StackOntoTruckFormRow[] = [{
      waybill_id: 'waybill-1',
      waybill_code: 'ECO-HAN-108960',
      destination_hub_key: 'id:2',
      destination_hub_label: 'HCM · Hồ Chí Minh',
      package_count: '242',
      max_package_count: 242,
      loading_position: '3',
      expected_arrival_label: '23/07/2026',
      delivery_instruction: 'Kho HCM · Hồ Chí Minh',
    }];
    const shared: StackOntoTruckSharedFields = {
      truck_id: 'truck-1',
      nha_xe: 'Công ty Anh Dũng',
      vendor_id: 'vendor-7',
      vendor_cost: '13.000.000',
      driver_name: ' Nguyễn Văn A ',
      driver_phone: ' 0901234567 ',
      departure_time: '2026-07-20T12:00',
    };

    const payload = buildStackOntoTruckPayload(rows, shared, 13_000_000);

    expect(payload).toMatchObject({
      vendor_id: 'vendor-7',
      vendor_cost: 13_000_000,
      driver_name: 'Nguyễn Văn A',
      driver_phone: '0901234567',
      departure_time: new Date('2026-07-20T12:00').toISOString(),
      items: [{
        waybill_id: 'waybill-1',
        truck_id: 'truck-1',
        loading_position: 3,
        package_count: 242,
        note: 'Kho HCM · Hồ Chí Minh',
      }],
    });
    expect(Object.keys(payload.items[0]).sort()).toEqual([
      'loading_position',
      'note',
      'package_count',
      'truck_id',
      'waybill_id',
    ]);
  });

  it('allows stacking by vendor before the license plate is known', () => {
    const rows: StackOntoTruckFormRow[] = [{
      waybill_id: 'waybill-1', waybill_code: 'ECOHAN1', package_count: '1', max_package_count: 1,
      destination_hub_key: 'id:2', destination_hub_label: 'HCM',
      loading_position: '', expected_arrival_label: '23/07/2026', delivery_instruction: 'Kho HCM',
    }];
    const shared: StackOntoTruckSharedFields = {
      truck_id: '', nha_xe: 'Xe lẻ', vendor_id: 'vendor-1', vendor_cost: '',
      driver_name: '', driver_phone: '', departure_time: '2026-07-20T12:00',
    };

    const payload = buildStackOntoTruckPayload(rows, shared);

    expect(payload.items[0]).not.toHaveProperty('truck_id');
    expect(payload).toMatchObject({ vendor_id: 'vendor-1', departure_time: expect.any(String) });
  });
});

describe('stack-onto-truck multi-hub arrival', () => {
  it('applies one arrival time to every order of the same destination hub only', () => {
    const rows = buildStackFormRows([
      { id: 'w1', dest_hub_id: '2', dest_hub: { id: '2', code: 'KHANHHOA' } },
      { id: 'w2', dest_hub_id: '2', dest_hub: { id: '2', code: 'KHANHHOA' } },
      { id: 'w3', dest_hub_id: '3', dest_hub: { id: '3', code: 'HCM' } },
    ] as WaybillInventoryItem[], new Date(2026, 7, 8, 8));

    const updated = updateExpectedArrivalForHub(rows, 'id:2', '2026-08-09T10:30');

    expect(updated.filter((row) => row.destination_hub_key === 'id:2').map((row) => row.expected_arrival_at))
      .toEqual(['2026-08-09T10:30', '2026-08-09T10:30']);
    expect(updated.find((row) => row.destination_hub_key === 'id:3')?.expected_arrival_at)
      .toBe(rows.find((row) => row.destination_hub_key === 'id:3')?.expected_arrival_at);
  });
});
