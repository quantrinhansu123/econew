import type { Trip, TripAction } from './types';

export const getPrimaryTripAction = (status?: string | null): TripAction | null => {
  if (status === 'PLANNED') return 'start';
  if (status === 'IN_TRANSIT') return 'arrive';
  if (status === 'ARRIVED') return 'complete';
  return null;
};

export const canConfirmTripArrival = (trip: Trip, now = Date.now()): boolean => {
  const routeStops = trip.route_stops ?? [];
  const destinationHubIds = new Set(routeStops.map((stop) => String(stop.hub_id || '').trim()).filter(Boolean));
  if (destinationHubIds.size <= 1) return true;

  const finalExpectedArrival = routeStops.reduce<number | null>((latest, stop) => {
    const timestamp = stop.expected_arrival_at ? new Date(stop.expected_arrival_at).getTime() : Number.NaN;
    if (Number.isNaN(timestamp)) return latest;
    return latest == null || timestamp > latest ? timestamp : latest;
  }, null);

  return finalExpectedArrival != null && now >= finalExpectedArrival;
};

export const getPrimaryTripActionForTrip = (trip: Trip, now = Date.now()): TripAction | null => {
  const action = getPrimaryTripAction(trip.status);
  if (action === 'arrive' && !canConfirmTripArrival(trip, now)) return null;
  return action;
};

export const getTripDeleteDisabledReason = (trip: Trip): string | null => {
  const attachedWaybills = trip.delivery_summary?.total_waybills;
  if (attachedWaybills == null) return 'Chưa xác định được số đơn đang gắn với chuyến';
  if (attachedWaybills > 0) {
    return `Phải nhả hết ${attachedWaybills.toLocaleString('vi-VN')} đơn/kiện về trước khi xóa`;
  }
  return null;
};
