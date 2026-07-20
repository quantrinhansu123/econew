import { describe, expect, it } from 'vitest';
import type { WaybillInventoryItem } from './types';
import {
  buildStackFormRows,
  buildStackOntoTruckPayload,
  computeExpectedArrivalDate,
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
});

describe('stack-onto-truck request payload', () => {
  it('puts vendor data at the request root and keeps line items route-only', () => {
    const rows: StackOntoTruckFormRow[] = [{
      waybill_id: 'waybill-1',
      waybill_code: 'ECO-HAN-108960',
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
    };

    const payload = buildStackOntoTruckPayload(rows, shared, 13_000_000);

    expect(payload).toMatchObject({
      vendor_id: 'vendor-7',
      vendor_cost: 13_000_000,
      driver_name: 'Nguyễn Văn A',
      driver_phone: '0901234567',
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
});
