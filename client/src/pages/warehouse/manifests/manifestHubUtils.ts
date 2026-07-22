import type { AuthUserProfile } from '../../login/types';
import type { HubSummary, LoadPlanningManifest } from './types';

export type HubViewCode = 'HAN' | 'HCM';

export const ACTIVE_TRIP_STATUSES = ['PLANNED', 'ASSIGNED', 'ASSIGNED_TO_TRIP', 'IN_TRANSIT', 'DEPARTED'];
// Kept as an alias because older callers use this name for the whole active lane.
export const IN_TRANSIT_TRIP_STATUSES = ACTIVE_TRIP_STATUSES;
export const ARRIVED_TRIP_STATUSES = ['ARRIVED', 'COMPLETED', 'AT_DEST_HUB', 'DELIVERED', 'DONE', 'FINISHED'];

export function isArrivedTripStatus(status?: string | null): boolean {
  const normalized = String(status || '').trim().toUpperCase();
  if (ARRIVED_TRIP_STATUSES.includes(normalized)) return true;
  const raw = String(status || '').trim();
  return /đã\s*(đến|tới)|xe\s*đã\s*đến/i.test(raw);
}

export function isActiveTripStatus(status?: string | null): boolean {
  const normalized = String(status || '').trim().toUpperCase();
  return ACTIVE_TRIP_STATUSES.includes(normalized);
}

export const HUB_DELIVERY_STATUS_OPTIONS = [
  { value: 'Giao thành công', waybillStatus: 'DELIVERED', requiresPhoto: true },
  { value: 'Lưu kho - chờ xử lý', waybillStatus: 'AT_DEST_HUB', requiresPhoto: false },
  { value: 'Phát sinh giao lại', waybillStatus: 'OUT_FOR_DELIVERY', requiresPhoto: false },
] as const;

export type HubDeliveryStatusValue = (typeof HUB_DELIVERY_STATUS_OPTIONS)[number]['value'];

export function normalizeHubCode(hub?: HubSummary | null): HubViewCode | null {
  const code = hub?.code?.trim().toUpperCase();
  if (code === 'HAN' || code === 'HCM') return code;
  const name = hub?.name?.trim().toUpperCase() || '';
  if (/HÀ NỘI|HA NOI|HAN/.test(name)) return 'HAN';
  if (/HỒ CHÍ MINH|HO CHI MINH|TP\.?HCM|HCM/.test(name)) return 'HCM';
  return null;
}

export function resolveUserHubView(user: AuthUserProfile | null, hubs: HubSummary[]): HubViewCode {
  const hubId = user?.hub_id;
  if (!hubId) return 'HAN';
  const hub = hubs.find((item) => String(item.id) === String(hubId));
  return normalizeHubCode(hub) ?? 'HAN';
}

export function manifestTrip(manifest: LoadPlanningManifest) {
  return manifest.trip ?? manifest.trips?.[0] ?? null;
}

export function getTripStatus(manifest: LoadPlanningManifest): string {
  return String(manifestTrip(manifest)?.status || manifest.status || '');
}

export function isInTransitManifest(manifest: LoadPlanningManifest): boolean {
  const tripStatus = getTripStatus(manifest);
  if (isArrivedTripStatus(tripStatus)) return false;
  if (isActiveTripStatus(tripStatus)) return true;
  const manifestStatus = String(manifest.status || '').trim().toUpperCase();
  return manifestStatus === 'IN_TRANSIT' || manifestStatus === 'ASSIGNED_TO_TRIP';
}

export type ManifestBoardGroup = 'departed' | 'expected' | 'arrived' | 'other';

export function resolveManifestBoardGroup(manifest: LoadPlanningManifest, hubView: HubViewCode): ManifestBoardGroup {
  if (isInboundToHub(manifest, hubView) && isArrivedManifest(manifest)) return 'arrived';
  if (isInboundToHub(manifest, hubView) && isDepartedNotArrivedManifest(manifest)) return 'expected';
  if (isOutboundFromHub(manifest, hubView) && isDepartedNotArrivedManifest(manifest)) return 'departed';
  return 'other';
}

export function manifestBoardGroupLabel(group: ManifestBoardGroup, hubView: HubViewCode): string {
  if (group === 'departed') return departedColumnTitle(hubView);
  if (group === 'expected') return expectedArrivalColumnTitle(hubView);
  if (group === 'arrived') return arrivedColumnTitle(hubView);
  return 'Chờ xếp / nháp';
}

const manifestBoardGroupOrder: Record<ManifestBoardGroup, number> = {
  departed: 1,
  expected: 2,
  arrived: 3,
  other: 4,
};

export function compareManifestBoardRows(
  a: LoadPlanningManifest,
  b: LoadPlanningManifest,
  hubView: HubViewCode,
) {
  const groupDiff =
    manifestBoardGroupOrder[resolveManifestBoardGroup(a, hubView)] -
    manifestBoardGroupOrder[resolveManifestBoardGroup(b, hubView)];
  if (groupDiff !== 0) return groupDiff;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

export function isArrivedManifest(manifest: LoadPlanningManifest): boolean {
  return isArrivedTripStatus(getTripStatus(manifest));
}

export function isDepartedNotArrivedManifest(manifest: LoadPlanningManifest): boolean {
  if (isArrivedManifest(manifest)) return false;
  const tripStatus = getTripStatus(manifest).trim().toUpperCase();
  if (tripStatus === 'IN_TRANSIT' || tripStatus === 'DEPARTED') return true;
  return !tripStatus && String(manifest.status || '').trim().toUpperCase() === 'IN_TRANSIT';
}

function sortActiveManifests(manifests: LoadPlanningManifest[]): LoadPlanningManifest[] {
  return manifests
    .sort((left, right) => {
      const etaLeft = manifestTrip(left)?.expected_arrival_time || '';
      const etaRight = manifestTrip(right)?.expected_arrival_time || '';
      if (etaLeft && etaRight) return etaLeft.localeCompare(etaRight);
      const depLeft = manifestTrip(left)?.departure_time || '';
      const depRight = manifestTrip(right)?.departure_time || '';
      if (depLeft && depRight) return depRight.localeCompare(depLeft);
      return String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });
}

export function filterActiveOutboundFromHub(manifests: LoadPlanningManifest[], origin: HubViewCode): LoadPlanningManifest[] {
  return sortActiveManifests(
    manifests.filter((manifest) => isOutboundFromHub(manifest, origin) && isDepartedNotArrivedManifest(manifest)),
  );
}

export function filterExpectedInboundToHub(manifests: LoadPlanningManifest[], destination: HubViewCode): LoadPlanningManifest[] {
  return sortActiveManifests(
    manifests.filter((manifest) => isInboundToHub(manifest, destination) && isDepartedNotArrivedManifest(manifest)),
  );
}

export function filterDepartedFromOrigin(manifests: LoadPlanningManifest[], origin: HubViewCode): LoadPlanningManifest[] {
  return filterActiveOutboundFromHub(manifests, origin);
}

export function manifestOriginLane(manifest: LoadPlanningManifest): HubViewCode | null {
  return normalizeHubCode(manifest.origin_hub);
}

export function manifestDestLane(manifest: LoadPlanningManifest): HubViewCode | null {
  return normalizeHubCode(manifest.dest_hub);
}

export function isOutboundFromHub(manifest: LoadPlanningManifest, hub: HubViewCode): boolean {
  return manifestOriginLane(manifest) === hub;
}

export function isInboundToHub(manifest: LoadPlanningManifest, hub: HubViewCode): boolean {
  return manifestDestLane(manifest) === hub;
}

export function filterManifestsForHub(manifests: LoadPlanningManifest[], hub: HubViewCode): LoadPlanningManifest[] {
  return manifests.filter((manifest) => isOutboundFromHub(manifest, hub) || isInboundToHub(manifest, hub));
}

export function departedColumnTitle(hub: HubViewCode): string {
  return hub === 'HAN' ? 'Xe đã khởi hành từ Hà Nội' : 'Xe đã khởi hành từ TP.HCM';
}

export function expectedArrivalColumnTitle(hub: HubViewCode): string {
  return hub === 'HAN' ? 'Xe dự kiến tới Hà Nội' : 'Xe dự kiến tới HCM';
}

export function arrivedColumnTitle(hub: HubViewCode): string {
  return hub === 'HAN' ? 'Đã đến Hà Nội' : 'Đã đến HCM';
}

export function parseDeliveryPhotos(url?: string | null): string[] {
  if (!url?.trim()) return [];
  return url.split(/[|\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 4);
}

export function joinDeliveryPhotos(urls: string[]): string {
  return urls.filter(Boolean).slice(0, 4).join('|');
}

export function hubDeliveryLabelFromWaybill(waybill: { current_state?: string | null; dispatch_fields?: Record<string, string | number | null | undefined> | null }): string {
  const fromDispatch = String(waybill.dispatch_fields?.trang_thai_giao ?? '').trim();
  if (fromDispatch) return fromDispatch;
  const state = String(waybill.current_state || '');
  if (state === 'DELIVERED') return 'Giao thành công';
  if (state === 'OUT_FOR_DELIVERY') return 'Phát sinh giao lại';
  if (state === 'AT_DEST_HUB') return 'Lưu kho - chờ xử lý';
  if (state === 'IN_TRANSIT') return 'Đi khỏi Hà Nội';
  return '—';
}
