import { describe, expect, it } from 'vitest';
import type { IncomingTrip } from './types';
import { buildIncomingTripsExcelWorkbook } from './incomingTripsExcelUtils';

describe('incoming trips Excel export', () => {
  it('exports the visible trip fields and totals', () => {
    const trips: IncomingTrip[] = [{
      id: '9',
      status: 'IN_TRANSIT',
      expected_arrival_time: '2026-07-23T11:11:00.000Z',
      manifest_code: 'BK-001',
      start_hub: { id: '1', code: 'HAN' },
      end_hub: { id: '2', code: 'HCM' },
      license_plate: '39H-1234',
      waybill_count: 3,
      planned_total_weight: 7999,
      driver_name: 'Công',
      driver_phone: '0965310233',
      vendor_name: 'Công lẻ',
      vehicle_type: 'Đường trục',
      trip_cost: 120000,
      vendor_paid_amount: 50000,
      other_costs: 10000,
      total_collect: 180000,
    }];

    const workbook = buildIncomingTripsExcelWorkbook(trips, 'Tất cả ngày');
    const sheet = workbook?.Sheets['Tong chuyen xe'];

    expect(sheet?.A3?.v).toBe('Ngày đến');
    expect(sheet?.D4?.v).toBe('BK-001');
    expect(sheet?.F4?.v).toBe('39H-1234');
    expect(sheet?.G4?.v).toBe(3);
    expect(sheet?.M4?.v).toBe(120000);
    expect(sheet?.A5?.v).toBe('TỔNG CỘNG');
    expect(sheet?.P5?.v).toBe(180000);
  });

  it('returns null when there is no trip to export', () => {
    expect(buildIncomingTripsExcelWorkbook([], 'Tất cả')).toBeNull();
  });
});
