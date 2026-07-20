import { describe, expect, it } from 'vitest';
import type { IncomingTrip } from './types';
import { isExpectedArrivingTrip, summarizeIncomingTrips } from './incomingTripUtils';

describe('incoming trip summary', () => {
  it('counts planned and in-transit trips as expected arrivals', () => {
    const trips: IncomingTrip[] = [
      { id: 1, status: 'PLANNED' },
      { id: 2, status: 'IN_TRANSIT' },
      { id: 3, status: 'ARRIVED' },
    ];

    expect(isExpectedArrivingTrip(trips[0])).toBe(true);
    expect(summarizeIncomingTrips(trips)).toMatchObject({
      total: 3,
      expectedArriving: 2,
      arrived: 1,
    });
  });
});
