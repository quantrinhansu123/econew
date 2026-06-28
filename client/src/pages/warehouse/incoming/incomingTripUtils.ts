import type { IncomingHub, IncomingManifest, IncomingTrip } from './types';
import { formatMoney, normalizeMoney } from '../../../lib/formatMoney';
import { isArrivedTripStatus } from '../manifests/manifestHubUtils';

export type OriginLane = 'HAN' | 'HCM';

export const POLLING_INTERVAL_MS = 30_000;
export const MANAGER_ROLES = 32 | 64;
export const FINANCE_ROLES = 16 | 32 | 64;

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

export type IncomingVendorPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export const vendorPaymentStatusLabel: Record<IncomingVendorPaymentStatus, string> = {
  UNPAID: 'Chờ TT',
  PARTIAL: 'Đề xuất TT',
  PAID: 'Đã TT',
};

export const vendorPaymentStatusTone: Record<IncomingVendorPaymentStatus, string> = {
  UNPAID: 'border-red-200 bg-red-50 text-red-700',
  PARTIAL: 'border-amber-200 bg-amber-50 text-amber-800',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export const vendorPaymentStatusOptions: Array<{ value: IncomingVendorPaymentStatus; label: string }> = [
  { value: 'UNPAID', label: vendorPaymentStatusLabel.UNPAID },
  { value: 'PARTIAL', label: vendorPaymentStatusLabel.PARTIAL },
  { value: 'PAID', label: vendorPaymentStatusLabel.PAID },
];

export const normalizeVendorPaymentStatus = (status?: string | null): IncomingVendorPaymentStatus => {
  const normalized = (status ?? '').trim().toUpperCase();
  if (normalized === 'PARTIAL' || normalized === 'PAID') return normalized;
  return 'UNPAID';
};

export const getVendorPaymentStatusLabel = (trip: IncomingTrip) => (
  vendorPaymentStatusLabel[normalizeVendorPaymentStatus(trip.vendor_payment_status)]
);

export const getVendorPaymentStatusTone = (trip: IncomingTrip) => (
  vendorPaymentStatusTone[normalizeVendorPaymentStatus(trip.vendor_payment_status)]
);

export const normalizeNumber = (value?: number | string | null) => normalizeMoney(value);

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

export const getManifestId = (trip: IncomingTrip) => (
  trip.manifest_id ?? trip.manifest?.id ?? null
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

export const getPlateLabel = (trip: IncomingTrip) => trip.license_plate?.trim() || trip.truck?.license_plate?.trim() || trip.truck?.bks?.trim() || `Chuyến #${trip.id}`;

export const getDriverName = (trip: IncomingTrip) => (
  trip.driver_name?.trim()
  || trip.truck?.ten_lai_xe?.trim()
  || trip.truck?.driver?.name?.trim()
  || '—'
);

export const getDriverPhone = (trip: IncomingTrip) => (
  trip.driver_phone?.trim()
  || trip.truck?.driver?.phone?.trim()
  || '—'
);

export const getVendorName = (trip: IncomingTrip) => (
  trip.vendor_name?.trim()
  || trip.truck?.vendor?.name?.trim()
  || trip.truck?.nha_xe?.trim()
  || '—'
);

export const getVehicleType = (trip: IncomingTrip) => (
  trip.vehicle_type?.trim()
  || trip.truck?.loai_xe?.trim()
  || '—'
);

export const getTripScheduleTime = (trip: IncomingTrip) => {
  if (isArrivedTrip(trip)) return trip.arrival_time || trip.expected_arrival_time || trip.estimated_arrival_time || null;
  return trip.expected_arrival_time || trip.estimated_arrival_time || trip.arrival_time || null;
};

export const getTripDateKey = (trip: IncomingTrip) => {
  const source = getTripScheduleTime(trip);
  if (!source) return null;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export const formatTripArrivalDate = (trip: IncomingTrip) => {
  const source = getTripScheduleTime(trip);
  if (!source) return { day: '—', time: '', full: 'Chưa có ngày' };
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return { day: '—', time: '', full: 'Chưa có ngày' };
  return {
    day: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
    full: new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  };
};

export const filterTripsByDate = (trips: IncomingTrip[], filterDate: string) => {
  if (!filterDate) return trips;
  return trips.filter((trip) => getTripDateKey(trip) === filterDate);
};

export const filterTripsByDateRange = (trips: IncomingTrip[], fromDate: string, toDate: string) => {
  if (!fromDate && !toDate) return trips;
  const from = fromDate || toDate;
  const to = toDate || fromDate;
  return trips.filter((trip) => {
    const key = getTripDateKey(trip);
    if (!key) return false;
    return key >= from && key <= to;
  });
};

export const collectVendorOptions = (trips: IncomingTrip[]) => {
  const names = new Set<string>();
  trips.forEach((trip) => {
    const name = getVendorName(trip);
    if (name && name !== '—') names.add(name);
  });
  return [...names].sort((left, right) => left.localeCompare(right, 'vi'));
};

export const getPlateFilterKey = (trip: IncomingTrip) => {
  const plate = trip.license_plate?.trim()
    || trip.truck?.license_plate?.trim()
    || trip.truck?.bks?.trim();
  return plate || `Chuyến #${trip.id}`;
};

export const collectPlateOptions = (trips: IncomingTrip[]) => {
  const plates = new Set<string>();
  trips.forEach((trip) => {
    plates.add(getPlateFilterKey(trip));
  });
  return [...plates].sort((left, right) => left.localeCompare(right, 'vi'));
};

export const filterTripsByVendors = (
  trips: IncomingTrip[],
  enabledVendors: Set<string>,
  allVendors: string[],
) => {
  if (!allVendors.length) return trips;
  if (enabledVendors.size === allVendors.length) return trips;
  if (enabledVendors.size === 0) return [];
  return trips.filter((trip) => enabledVendors.has(getVendorName(trip)));
};

export const filterTripsByPlates = (
  trips: IncomingTrip[],
  enabledPlates: Set<string>,
  allPlates: string[],
) => {
  if (!allPlates.length) return trips;
  if (enabledPlates.size === allPlates.length) return trips;
  if (enabledPlates.size === 0) return [];
  return trips.filter((trip) => enabledPlates.has(getPlateFilterKey(trip)));
};

export interface IncomingStatusOption {
  value: string;
  label: string;
}

const STATUS_FILTER_ORDER = ['IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'PLANNED'] as const;

export const collectStatusOptions = (trips: IncomingTrip[]): IncomingStatusOption[] => {
  const statuses = new Set<string>();
  trips.forEach((trip) => {
    const status = normalizeTripStatus(trip.status);
    if (status) statuses.add(status);
  });
  return [...statuses]
    .sort((left, right) => {
      const leftIndex = STATUS_FILTER_ORDER.indexOf(left as (typeof STATUS_FILTER_ORDER)[number]);
      const rightIndex = STATUS_FILTER_ORDER.indexOf(right as (typeof STATUS_FILTER_ORDER)[number]);
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      }
      return left.localeCompare(right, 'vi');
    })
    .map((value) => ({
      value,
      label: tripStatusLabel[value] || value,
    }));
};

export const filterTripsByStatuses = (
  trips: IncomingTrip[],
  enabledStatuses: Set<string>,
  allStatuses: string[],
) => {
  if (!allStatuses.length) return trips;
  if (enabledStatuses.size === allStatuses.length) return trips;
  if (enabledStatuses.size === 0) return [];
  return trips.filter((trip) => enabledStatuses.has(normalizeTripStatus(trip.status)));
};

const PAYMENT_STATUS_FILTER_ORDER: IncomingVendorPaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID'];

export interface IncomingPaymentStatusOption {
  value: IncomingVendorPaymentStatus;
  label: string;
}

export const collectPaymentStatusOptions = (trips: IncomingTrip[]): IncomingPaymentStatusOption[] => {
  const statuses = new Set<IncomingVendorPaymentStatus>();
  trips.forEach((trip) => {
    statuses.add(normalizeVendorPaymentStatus(trip.vendor_payment_status));
  });
  return PAYMENT_STATUS_FILTER_ORDER
    .filter((value) => statuses.has(value))
    .map((value) => ({
      value,
      label: vendorPaymentStatusLabel[value],
    }));
};

export const filterTripsByPaymentStatuses = (
  trips: IncomingTrip[],
  enabledPaymentStatuses: Set<string>,
  allPaymentStatuses: string[],
) => {
  if (!allPaymentStatuses.length) return trips;
  if (enabledPaymentStatuses.size === allPaymentStatuses.length) return trips;
  if (enabledPaymentStatuses.size === 0) return [];
  return trips.filter((trip) => (
    enabledPaymentStatuses.has(normalizeVendorPaymentStatus(trip.vendor_payment_status))
  ));
};

export const isExpectedArrivingTrip = (trip: IncomingTrip) => normalizeTripStatus(trip.status) === 'IN_TRANSIT';

export const getTotalCollect = (trip: IncomingTrip) => normalizeNumber(trip.total_collect);

/** Tổng COD + CC trên chuyến — số tiền phải thu */
export const getTripReceivableAmount = (trip: IncomingTrip) => getTotalCollect(trip);

export const getTripPayableAmount = (trip: IncomingTrip) => normalizeNumber(trip.trip_cost);

export const getTripPaidAmount = (trip: IncomingTrip) => normalizeNumber(trip.vendor_paid_amount);

export const getTripOtherCosts = (trip: IncomingTrip) => normalizeNumber(trip.other_costs);

export const getDriverCollectedAmount = (trip: IncomingTrip) => getTotalCollect(trip);

export const getPaymentNote = (trip: IncomingTrip) => trip.vendor_payment_note?.trim() || '';

export const formatCollectAmount = (value?: number | string | null) => formatMoney(value);

export interface IncomingTripSummary {
  total: number;
  expectedArriving: number;
  arrived: number;
  totalCollect: number;
}

export const summarizeIncomingTrips = (trips: IncomingTrip[]): IncomingTripSummary => ({
  total: trips.length,
  expectedArriving: trips.filter(isExpectedArrivingTrip).length,
  arrived: trips.filter(isArrivedTrip).length,
  totalCollect: trips.reduce((sum, trip) => sum + getTotalCollect(trip), 0),
});

export const formatFilterDateLabel = (filterDate: string) => {
  if (!filterDate) return 'Tất cả ngày';
  const date = new Date(`${filterDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return filterDate;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export const formatFilterDateRangeLabel = (fromDate: string, toDate: string) => {
  if (!fromDate && !toDate) return 'Tất cả ngày';
  if (fromDate && toDate && fromDate !== toDate) {
    return `${formatFilterDateLabel(fromDate)} – ${formatFilterDateLabel(toDate)}`;
  }
  return formatFilterDateLabel(fromDate || toDate);
};

export const hasActiveIncomingFilters = (
  fromDate: string,
  toDate: string,
  enabledVendors: Set<string>,
  allVendors: string[],
  enabledPlates: Set<string>,
  allPlates: string[],
  enabledStatuses: Set<string>,
  allStatuses: string[],
  enabledPaymentStatuses?: Set<string>,
  allPaymentStatuses?: string[],
) => (
  Boolean(fromDate || toDate)
  || (allVendors.length > 0 && enabledVendors.size !== allVendors.length)
  || (allPlates.length > 0 && enabledPlates.size !== allPlates.length)
  || (allStatuses.length > 0 && enabledStatuses.size !== allStatuses.length)
  || (allPaymentStatuses && allPaymentStatuses.length > 0 && enabledPaymentStatuses
    && enabledPaymentStatuses.size !== allPaymentStatuses.length)
);

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
