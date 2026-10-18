import type { NewOrderFormState } from './orderFormTypes';

export interface HereEndpointUsage {
  used: number;
  limit: number;
  free_limit: number;
  remaining: number;
  resets_at: string | null;
  minute_used: number;
  minute_limit: number;
  minute_remaining: number;
  minute_resets_at: string | null;
  blocked_until: string | null;
  blocked: boolean;
}

export interface DeliveryDistanceUsage {
  provider: 'HERE';
  configured: boolean;
  observed_at: string;
  month: string;
  directions: HereEndpointUsage;
  geocoding: HereEndpointUsage;
}

export interface DeliveryDistanceResult {
  provider: 'HERE';
  distance_meters: number;
  duration_seconds: number;
  approximate_address: boolean;
  matched_address: string;
  location_source: 'ADDRESS' | 'COORDINATES';
  destination: { latitude: number; longitude: number };
  hub_name: string;
  maps_url: string;
  usage: DeliveryDistanceUsage;
}

export function buildDeliveryAddress(form: Pick<NewOrderFormState, 'diaChiNhan' | 'phuongXa' | 'quanHuyen' | 'huyen'>) {
  const parts: string[] = [];
  for (const value of [form.diaChiNhan, form.phuongXa, form.quanHuyen, form.huyen, 'Việt Nam']) {
    const part = value.trim();
    if (part && !parts.join(', ').toLocaleLowerCase('vi').includes(part.toLocaleLowerCase('vi'))) parts.push(part);
  }
  return parts.join(', ');
}

export function validDeliveryCoordinates(value: string) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return Boolean(match && Math.abs(Number(match[1])) <= 90 && Math.abs(Number(match[2])) <= 180);
}

export function isDistanceBlocked(usage: DeliveryDistanceUsage | null, needsGeocoding: boolean) {
  if (!usage?.configured || usage.provider !== 'HERE') return true;
  const blocked = (quota: HereEndpointUsage) => !Number.isSafeInteger(quota?.used) || quota.used < 0
    || !Number.isSafeInteger(quota.limit) || quota.limit < 1 || quota.limit > 30_000
    || quota.used >= quota.limit || quota.remaining <= 0 || quota.blocked;
  return blocked(usage.directions) || (needsGeocoding && blocked(usage.geocoding));
}

/** The server reports both counters with its snapshot time, including resets. */
export function mergeDistanceUsage(previous: DeliveryDistanceUsage | null, next: DeliveryDistanceUsage): DeliveryDistanceUsage {
  if (!previous || next.observed_at >= previous.observed_at) return next;
  return previous;
}
