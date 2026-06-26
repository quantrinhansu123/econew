import type { IncomingHub, IncomingManifest, IncomingTrip } from './types';
import { isArrivedTripStatus } from '../manifests/manifestHubUtils';

export type OriginLane = 'HAN' | 'HCM';

export const POLLING_INTERVAL_MS = 30_000;
export const MANAGER_ROLES = 32 | 64;

export const tripStatusLabel: Record<string, string> = {
  PLANNED: 'Đã lên kế hoạch',
  IN_TRANSIT: 'Đang chạy',
  ARRIVED: 'Đã đến',
  COMPLETED: 'Hoàn tất',
};

export const tripStatusTone: Record<string, string> = {
  PLANNED: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_TRANSIT: 'border-amber-200 bg-amber-50 text-amber-800',
  ARRIVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  COMPLETED: 'border-blue-200 bg-blue-50 text-blue-800',
};

export const normalizeNumber = (value?: number | string | null) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const formatNumber = (value?: number | string | null, digits = 1) => (
  normalizeNumber(value).toLocaleString('vi-VN', { maximumFractionDigits: digits })
);

export const formatTime = (value?: string | null) => (
  value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value)) : '—'
);

export const formatUpdatedAt = (date: Date | null) => (
  date ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) : '—'
);

export const formatHub = (hub?: IncomingHub | null, fallback?: string | number | null) => (
  hub?.code || hub?.name || (fallback ? `Hub #${fallback}` : '—')
);

export const getManifest = (trip: IncomingTrip): IncomingManifest | null => trip.manifest || null;

export const getArrivalTime = (trip: IncomingTrip) => (
  trip.arrival_time || trip.expected_arrival_time || trip.estimated_arrival_time || null
);

export const getManifestCode = (trip: IncomingTrip) => (
  trip.manifest_code || getManifest(trip)?.manifest_code || trip.manifest?.manifest_code || 'Chưa có BK'
);

export const getWaybillCount = (trip: IncomingTrip) => (
  trip.waybill_count ?? trip.total_waybills ?? getManifest(trip)?.waybill_count ?? getManifest(trip)?.total_waybills ?? 0
);

export const getTotalWeight = (trip: IncomingTrip) => (
  trip.planned_total_weight ?? trip.total_weight ?? getManifest(trip)?.total_weight ?? 0
);

export const getOriginHub = (trip: IncomingTrip) => (
  formatHub(trip.origin_hub || trip.start_hub || getManifest(trip)?.origin_hub, trip.origin_hub_id || trip.start_hub_id || getManifest(trip)?.origin_hub_id)
);

export const getDestinationHub = (trip: IncomingTrip) => (
  formatHub(trip.end_hub || trip.dest_hub || getManifest(trip)?.dest_hub, trip.end_hub_id || getManifest(trip)?.dest_hub_id)
);

export const getRouteLabel = (trip: IncomingTrip) => `${getOriginHub(trip)} → ${getDestinationHub(trip)}`;

export const getPlateLabel = (trip: IncomingTrip) => trip.license_plate?.trim() || `Chuyến #${trip.id}`;

export const normalizeHubCode = (hub?: IncomingHub | null): OriginLane | null => {
  const code = hub?.code?.trim().toUpperCase();
  if (code === 'HAN' || code === 'HCM') return code;
  const name = hub?.name?.trim().toUpperCase() || '';
  if (/HÀ NỘI|HA NOI|HAN/.test(name)) return 'HAN';
  if (/HỒ CHÍ MINH|HO CHI MINH|TP\.?HCM|HCM/.test(name)) return 'HCM';
  return null;
};

export const getOriginLane = (trip: IncomingTrip): OriginLane | null => {
  const manifest = getManifest(trip);
  return normalizeHubCode(
    trip.start_hub
    || trip.origin_hub
    || manifest?.origin_hub
    || (manifest?.origin_hub_id ? { id: manifest.origin_hub_id } : null),
  );
};

export const normalizeTripStatus = (status?: string | null) => (status ?? '').trim().toUpperCase();

export const getTripStatusLabel = (trip: IncomingTrip) => {
  const status = normalizeTripStatus(trip.status);
  return tripStatusLabel[status] || trip.status || '—';
};

export const getTripStatusTone = (trip: IncomingTrip) => {
  const status = normalizeTripStatus(trip.status);
  return tripStatusTone[status] || 'border-slate-200 bg-slate-50 text-slate-700';
};

export const isArrivedTrip = (trip: IncomingTrip) => isArrivedTripStatus(trip.status);

export const formatArrivedSubline = (trip: IncomingTrip) => {
  const arrivalTime = getArrivalTime(trip);
  const parts = [
    getPlateLabel(trip),
    `${getWaybillCount(trip).toLocaleString('vi-VN')} đơn`,
    `${formatNumber(getTotalWeight(trip))} kg`,
    arrivalTime ? `Đã đến ${formatTime(arrivalTime)}` : 'Đã đến bưu cục',
  ].filter(Boolean);
  return parts.join(' · ');
};

export const formatTripSubline = (trip: IncomingTrip) => {
  const arrived = isArrivedTrip(trip);
  const arrivalTime = getArrivalTime(trip);
  const parts = [
    getPlateLabel(trip),
    `${getWaybillCount(trip).toLocaleString('vi-VN')} đơn`,
    `${formatNumber(getTotalWeight(trip))} kg`,
    arrived
      ? (arrivalTime ? `Đã đến ${formatTime(arrivalTime)}` : 'Đã đến bưu cục')
      : (trip.departure_time ? `Khởi hành ${formatTime(trip.departure_time)}` : null),
    !arrived && arrivalTime ? `ETA ${formatTime(arrivalTime)}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};

export const sortTrips = (trips: IncomingTrip[]) => [...trips].sort((left, right) => {
  const leftArrived = isArrivedTrip(left) ? 1 : 0;
  const rightArrived = isArrivedTrip(right) ? 1 : 0;
  if (leftArrived !== rightArrived) return leftArrived - rightArrived;
  const leftInTransit = normalizeTripStatus(left.status) === 'IN_TRANSIT' ? 0 : 1;
  const rightInTransit = normalizeTripStatus(right.status) === 'IN_TRANSIT' ? 0 : 1;
  if (leftInTransit !== rightInTransit) return leftInTransit - rightInTransit;
  const leftTime = new Date(getArrivalTime(left) || left.departure_time || 0).getTime();
  const rightTime = new Date(getArrivalTime(right) || right.departure_time || 0).getTime();
  return rightTime - leftTime;
});

export const sortArrivedTrips = (trips: IncomingTrip[]) => [...trips].sort((left, right) => {
  const leftTime = new Date(getArrivalTime(left) || left.departure_time || 0).getTime();
  const rightTime = new Date(getArrivalTime(right) || right.departure_time || 0).getTime();
  return rightTime - leftTime;
});

export const filterTripsByOrigin = (trips: IncomingTrip[], lane: OriginLane) => (
  sortTrips(trips.filter((trip) => getOriginLane(trip) === lane))
);

export const filterArrivedTripsByOrigin = (trips: IncomingTrip[], lane: OriginLane) => (
  sortArrivedTrips(trips.filter((trip) => getOriginLane(trip) === lane))
);
