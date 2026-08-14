import type { Trip } from './types';

export const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export interface DestinationHubReference {
  hub_code?: string | null;
  hub_name?: string | null;
  transit_days?: number | null;
}

export interface TripScheduleRouteStop extends DestinationHubReference {
  hub_id: string;
  expected_arrival_at: string;
}

const normalizeHub = (value?: string | null) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'D')
  .replace(/[^A-Za-z0-9]/g, '')
  .toUpperCase();

/** Số ngày mặc định theo HUB đến; HUB chưa có cấu hình giữ mặc định cũ là 3 ngày. */
export function expectedArrivalOffsetDays(hub: DestinationHubReference): number {
  const configuredDays = Number(hub.transit_days);
  if (Number.isInteger(configuredDays) && configuredDays > 0) return configuredDays;
  const hubKey = `${normalizeHub(hub.hub_code)}${normalizeHub(hub.hub_name)}`;
  if (['DANANG', 'QUANGNAM', 'QUANGBINH', 'NGHEAN'].some((key) => hubKey.includes(key))) return 1;
  if (['KHANHHOA', 'BINHDINH', 'NINHTHUAN', 'BINHTHUAN'].some((key) => hubKey.includes(key))) return 2;
  if (hubKey.includes('HCM') || hubKey.includes('HOCHIMINH')) return 3;
  return 3;
}

export function expectedArrivalForHub(
  departure: string | Date | null | undefined,
  hub: DestinationHubReference,
): Date {
  const source = departure ? new Date(departure) : new Date();
  const validSource = Number.isNaN(source.getTime()) ? new Date() : source;
  const result = new Date(validSource.getTime());
  result.setDate(result.getDate() + expectedArrivalOffsetDays(hub));
  return result;
}

export function buildTripScheduleRouteStops(
  trip: Trip,
  departureTime: string,
): TripScheduleRouteStop[] {
  const sourceStops = trip.route_stops?.length
    ? trip.route_stops
    : trip.end_hub_id
      ? [{
          hub_id: trip.end_hub_id,
          hub_code: trip.end_hub?.code,
          hub_name: trip.end_hub?.name,
          expected_arrival_at: trip.expected_arrival_time || trip.arrival_time,
          transit_days: trip.end_hub?.transit_days,
        }]
      : [];
  const validExistingTimes = sourceStops
    .map((stop) => stop.expected_arrival_at ? new Date(stop.expected_arrival_at).getTime() : Number.NaN)
    .filter(Number.isFinite);
  // Dữ liệu cũ lưu một giờ chung cho mọi HUB. Khi gặp dạng này, áp lại mặc định theo từng HUB.
  const hasLegacySharedTime = sourceStops.length > 1
    && validExistingTimes.length === sourceStops.length
    && new Set(validExistingTimes).size === 1;

  return sourceStops.map((stop) => {
    const existing = !hasLegacySharedTime ? toLocalDateTimeInput(stop.expected_arrival_at) : '';
    return {
      hub_id: String(stop.hub_id),
      hub_code: stop.hub_code,
      hub_name: stop.hub_name,
      transit_days: stop.transit_days,
      expected_arrival_at: existing || toLocalDateTimeInput(
        expectedArrivalForHub(departureTime, { hub_code: stop.hub_code, hub_name: stop.hub_name, transit_days: stop.transit_days }).toISOString(),
      ),
    };
  });
}
