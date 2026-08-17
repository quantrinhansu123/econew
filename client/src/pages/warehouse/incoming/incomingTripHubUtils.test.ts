import { describe, expect, it } from 'vitest';
import type { IncomingTrip } from './types';
import { getIncomingTripMainHubs, groupIncomingTripsByMainHub } from './incomingTripHubUtils';

describe('incoming trip main hub grouping', () => {
  it('groups direct HCM and Hà Nội destinations into two columns', () => {
    const trips: IncomingTrip[] = [
      { id: 1, status: 'IN_TRANSIT', end_hub: { id: 2, code: 'HCM', name: 'Bưu cục Hồ Chí Minh' } },
      { id: 2, status: 'IN_TRANSIT', end_hub: { id: 1, code: 'HAN', name: 'Bưu cục Hà Nội' } },
    ];

    const grouped = groupIncomingTripsByMainHub(trips);

    expect(grouped.HCM.map((trip) => trip.id)).toEqual([1]);
    expect(grouped.HAN.map((trip) => trip.id)).toEqual([2]);
  });

  it('uses route stops so a multi-hub trip appears at every matching arrival hub', () => {
    const trip: IncomingTrip = {
      id: 3,
      status: 'IN_TRANSIT',
      end_hub: { id: 9, code: 'ECO_LX' },
      route_stops: [
        { hub_id: 2, hub_code: 'HCM' },
        { hub_id: 1, hub_name: 'Bưu cục Hà Nội' },
      ],
    };

    expect(getIncomingTripMainHubs(trip)).toEqual(['HCM', 'HAN']);
  });

  it('does not place unrelated destination hubs in either main column', () => {
    const trip: IncomingTrip = { id: 4, status: 'IN_TRANSIT', end_hub: { id: 3, code: 'DAN', name: 'Đà Nẵng' } };
    expect(getIncomingTripMainHubs(trip)).toEqual([]);
  });
});
