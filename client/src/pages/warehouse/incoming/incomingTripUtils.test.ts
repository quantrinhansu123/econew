import { describe, expect, it } from 'vitest';
import type { IncomingTrip } from './types';
import { collectPlateOptions, getPlateLabel, isExpectedArrivingTrip, summarizeIncomingTrips } from './incomingTripUtils';

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
});
