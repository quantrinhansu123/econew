import { describe, expect, it } from 'vitest';
import type { IncomingTrip } from './types';
import {
  collectPlateOptions,
  collectVendorCodeOptions,
  filterTripsByVendorCode,
  formatTripDepartureDate,
  getPlateLabel,
  getTripProvisionalProfit,
  getTripWaitingPaymentDays,
  isExpectedArrivingTrip,
  summarizeIncomingTrips,
} from './incomingTripUtils';

describe('incoming trip summary', () => {
  it('counts only departed/in-transit trips as expected arrivals', () => {
    const trips: IncomingTrip[] = [
      { id: 1, status: 'PLANNED' },
      { id: 2, status: 'IN_TRANSIT' },
      { id: 3, status: 'DEPARTED' },
      { id: 4, status: 'ARRIVED' },
    ];

    expect(isExpectedArrivingTrip(trips[0])).toBe(false);
    expect(isExpectedArrivingTrip(trips[1])).toBe(true);
    expect(isExpectedArrivingTrip(trips[2])).toBe(true);
    expect(summarizeIncomingTrips(trips)).toMatchObject({
      total: 4,
      expectedArriving: 2,
      arrived: 1,
    });
  });

  it('only uses real license plates in the BKS filter', () => {
    const trips: IncomingTrip[] = [
      { id: 35, license_plate: '39H-1234' },
      { id: 36, license_plate: null, truck: null },
    ];

    expect(collectPlateOptions(trips)).toEqual(['39H-1234']);
    expect(getPlateLabel(trips[1])).toBe('Chưa gán BKS');
  });

  it('filters by vendor code and keeps the vendor name in the option label', () => {
    const trips: IncomingTrip[] = [
      { id: 1, vendor_code: 'NAMTHAO', vendor_name: 'Xe Nam Thảo' },
      { id: 2, vendor_code: 'ECO', vendor_name: 'ECO' },
    ];

    expect(collectVendorCodeOptions(trips)).toEqual([
      { value: 'ECO', label: 'ECO · ECO' },
      { value: 'NAMTHAO', label: 'NAMTHAO · Xe Nam Thảo' },
    ]);
    expect(filterTripsByVendorCode(trips, 'namthao')).toEqual([trips[0]]);
  });

  it('only totals payable manifests after departure and does not count a manifest twice', () => {
    const trips: IncomingTrip[] = [
      { id: 1, manifest_id: 10, status: 'PLANNED', trip_cost: 100_000, total_collect: 500_000 },
      { id: 2, manifest_id: 10, status: 'IN_TRANSIT', trip_cost: 100_000, total_collect: 500_000 },
      { id: 3, manifest_id: 11, status: 'ARRIVED', trip_cost: 200_000, total_collect: 700_000 },
      { id: 4, manifest_id: 12, status: 'PLANNED', trip_cost: 300_000, total_collect: 900_000 },
    ];

    expect(summarizeIncomingTrips(trips)).toMatchObject({
      totalCollect: 2_100_000,
      totalPayable: 300_000,
      payableManifestCount: 2,
    });
  });

  it('formats departure data and calculates the provisional manifest figures', () => {
    const trip: IncomingTrip = {
      id: 1,
      departure_time: '2026-08-05T09:30:00.000Z',
      total_revenue: 1_000_000,
      trip_cost: 400_000,
      fuel_cost: 50_000,
      other_costs: 20_000,
      expense_total: 30_000,
    };

    expect(formatTripDepartureDate(trip).day).not.toBe('—');
    expect(getTripProvisionalProfit(trip)).toBe(500_000);
    expect(getTripWaitingPaymentDays(trip, new Date('2026-08-09T12:00:00.000Z'))).toBe(4);
  });
});
