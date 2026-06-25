import type { AuthUserProfile } from '../../login/types';
import type { HubSummary, LoadPlanningManifest } from './types';

export type HubViewCode = 'HAN' | 'HCM';

export const IN_TRANSIT_TRIP_STATUSES = ['IN_TRANSIT', 'ASSIGNED_TO_TRIP'];
export const ARRIVED_TRIP_STATUSES = ['ARRIVED', 'COMPLETED', 'AT_DEST_HUB'];

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
  return IN_TRANSIT_TRIP_STATUSES.includes(getTripStatus(manifest));
}

export function isArrivedManifest(manifest: LoadPlanningManifest): boolean {
  return ARRIVED_TRIP_STATUSES.includes(getTripStatus(manifest));
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
  return hub === 'HAN' ? 'Đã khởi hành ở Hà Nội' : 'Đã khởi hành ở TP.HCM';
}

export function expectedArrivalColumnTitle(hub: HubViewCode): string {
  return hub === 'HAN' ? 'Dự kiến đến Hà Nội' : 'Dự kiến đến HCM';
}

export function arrivedColumnTitle(hub: HubViewCode): string {
  return hub === 'HAN' ? 'Đã đến Hà Nội' : 'Đã đến HCM';
}

export function parseDeliveryPhotos(url?: string | null): string[] {
  if (!url?.trim()) return [];
  return url.split(/[|,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
}

export function joinDeliveryPhotos(urls: string[]): string {
  return urls.filter(Boolean).slice(0, 3).join('|');
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
