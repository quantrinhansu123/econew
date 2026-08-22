import { describe, expect, it } from 'vitest';
import { canConfirmTripArrival, getPrimaryTripActionForTrip, getTripDeleteDisabledReason } from './tripKanbanUtils';

describe('canConfirmTripArrival', () => {
  const now = new Date('2026-08-22T09:00:00.000Z').getTime();

  it('cho phép xác nhận chuyến một HUB', () => {
    expect(canConfirmTripArrival({
      id: 1,
      status: 'IN_TRANSIT',
      route_stops: [{ hub_id: 'HCM', expected_arrival_at: '2026-08-23T09:00:00.000Z' }],
    }, now)).toBe(true);
  });

  it('khóa xác nhận tại HUB trung gian của chuyến nhiều HUB', () => {
    const trip = {
      id: 2,
      status: 'IN_TRANSIT' as const,
      route_stops: [
        { hub_id: 'QUANGNAM', expected_arrival_at: '2026-08-22T08:00:00.000Z' },
        { hub_id: 'HCM', expected_arrival_at: '2026-08-22T16:00:00.000Z' },
        { hub_id: 'ECO_LX', expected_arrival_at: '2026-08-23T09:00:00.000Z' },
      ],
    };

    expect(canConfirmTripArrival(trip, now)).toBe(false);
    expect(getPrimaryTripActionForTrip(trip, now)).toBeNull();
  });

  it('cho phép xác nhận khi đã tới mốc HUB cuối', () => {
    const trip = {
      id: 3,
      status: 'IN_TRANSIT' as const,
      route_stops: [
        { hub_id: 'HCM', expected_arrival_at: '2026-08-22T08:00:00.000Z' },
        { hub_id: 'ECO_LX', expected_arrival_at: '2026-08-22T09:00:00.000Z' },
      ],
    };

    expect(canConfirmTripArrival(trip, now)).toBe(true);
    expect(getPrimaryTripActionForTrip(trip, now)).toBe('arrive');
  });
});

describe('getTripDeleteDisabledReason', () => {
  it('cho phép xóa khi chuyến đã nhả hết đơn', () => {
    expect(getTripDeleteDisabledReason({
      id: 1,
      delivery_summary: {
        total_waybills: 0,
        processed_waybills: 0,
        delivered_waybills: 0,
        pending_delivery_waybills: 0,
        completed_waybills: 0,
      },
    })).toBeNull();
  });

  it('khóa xóa khi vẫn còn đơn trong chuyến', () => {
    expect(getTripDeleteDisabledReason({
      id: 2,
      delivery_summary: {
        total_waybills: 3,
        processed_waybills: 2,
        delivered_waybills: 1,
        pending_delivery_waybills: 2,
        completed_waybills: 1,
      },
    })).toContain('3 đơn/kiện');
  });

  it('khóa xóa nếu API chưa trả về số đơn liên kết', () => {
    expect(getTripDeleteDisabledReason({ id: 3 })).toBe('Chưa xác định được số đơn đang gắn với chuyến');
  });
});
