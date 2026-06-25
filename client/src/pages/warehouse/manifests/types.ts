export interface FilterOption { value: string; label: string; }
export interface BadgeConfig { label: string; className: string; }
export interface HubSummary { id: string | number; code?: string | null; name?: string | null; }
export interface UserSummary { id: string | number; username?: string | null; name?: string | null; full_name?: string | null; phone?: string | null; }
export interface TripSummary { id?: string | number; trip_code?: string | null; code?: string | null; status?: string | null; start_hub_id?: string | number | null; end_hub_id?: string | number | null; start_hub?: HubSummary | null; end_hub?: HubSummary | null; departure_time?: string | null; arrival_time?: string | null; expected_arrival_time?: string | null; driver_name?: string | null; driver_phone?: string | null; carrier_label?: string | null; driver?: UserSummary | null; truck?: { license_plate?: string | null; bks?: string | null; phone?: string | null; ten_lai_xe?: string | null; driver?: UserSummary | null } | null; }
export type ManifestDispatchFields = Record<string, string | number | null | undefined>;
export interface ManifestWaybill { id: string | number; waybill_code?: string | null; created_at?: string | null; sender_info?: string | null; receiver_info?: string | null; receiver_phone?: string | null; receiver_address?: string | null; noi_dung?: string | null; note?: string | null; cod_amount?: number | string | null; weight?: number | string | null; length?: number | string | null; width?: number | string | null; height?: number | string | null; volumetric_weight?: number | string | null; payment_type?: string | null; current_state?: string | null; status?: string | null; cost_amount?: number | string | null; origin_hub_id?: string | number | null; dest_hub_id?: string | number | null; origin_hub?: HubSummary | null; dest_hub?: HubSummary | null; package_count?: number | string | null; remaining_packages?: number | string | null; order_total_packages?: number | string | null; trip_label?: string | null; noi_den?: string | null; the_tich_m3?: number | string | null; loading_position?: number | string | null; dispatch_fields?: ManifestDispatchFields | null; manifest_id?: string | number | null; delivery_photo_url?: string | null; }
export interface LoadPlanningManifest { id: string | number; manifest_code?: string | null; code?: string | null; seal_code?: string | null; origin_hub_id?: string | number | null; dest_hub_id?: string | number | null; origin_hub?: HubSummary | null; dest_hub?: HubSummary | null; status?: string | null; waybill_count?: number | string | null; total_waybills?: number | string | null; total_weight?: number | string | null; weight_total?: number | string | null; trip_id?: string | number | null; trip?: TripSummary | null; trips?: TripSummary[]; closed_at?: string | null; created_at?: string | null; closed_by?: UserSummary | null; created_by?: UserSummary | null; waybills?: ManifestWaybill[]; manifest_waybills?: Array<{ waybill_id?: string | number | null; loading_position?: number | string | null; dispatch_fields?: ManifestDispatchFields | null; waybill?: ManifestWaybill | null }>; note?: string | null; }
export interface LoadPlanningFilters { keyword: string; status: string[]; origin_hub_id: string[]; dest_hub_id: string[]; trip_id: string[]; date_from: string; date_to: string; page: number; limit: number; }
export interface ManifestListResponse { data?: LoadPlanningManifest[]; items?: LoadPlanningManifest[]; manifests?: LoadPlanningManifest[]; total?: number; meta?: { total?: number; page?: number; limit?: number }; }
export interface TripListResponse { data?: TripSummary[]; items?: TripSummary[]; trips?: TripSummary[]; total?: number; meta?: { total?: number }; }
export interface AssignTripFormState { trip_id: string; }
export interface ManifestFormState { origin_hub_id: string; dest_hub_id: string; seal_code: string; note: string; }
export interface CloseManifestFormState { seal_code: string; note: string; }
export interface AddWaybillsFormState { keyword: string; page: number; limit: number; }

const DEPARTED_TRIP_STATUSES = ['IN_TRANSIT', 'ARRIVED', 'COMPLETED'] as const;

export function manifestTripStatus(manifest?: Pick<LoadPlanningManifest, 'trip' | 'trips'> | null) {
  return String(manifest?.trip?.status || manifest?.trips?.[0]?.status || '').trim();
}

export function canAddWaybillsToManifest(manifest?: Pick<LoadPlanningManifest, 'status' | 'trip' | 'trips'> | null) {
  if (!manifest) return false;

  const tripStatus = manifestTripStatus(manifest);
  if (DEPARTED_TRIP_STATUSES.includes(tripStatus as (typeof DEPARTED_TRIP_STATUSES)[number])) return false;

  const status = String(manifest.status || '');
  if (status === 'DRAFT' || status === 'CLOSED') return true;
  if (status === 'ASSIGNED_TO_TRIP' || status === 'IN_TRANSIT') {
    return tripStatus === '' || tripStatus === 'PLANNED';
  }
  return false;
}

export function addWaybillsDisabledReason(
  manifest: Pick<LoadPlanningManifest, 'status' | 'trip' | 'trips'> | null | undefined,
  canAddByRole: boolean,
): string | null {
  if (!canAddByRole) return 'Chỉ PACKER hoặc điều phối mới được thêm đơn';
  if (!manifest) return null;
  const tripStatus = manifestTripStatus(manifest);
  if (DEPARTED_TRIP_STATUSES.includes(tripStatus as (typeof DEPARTED_TRIP_STATUSES)[number])) {
    return 'Xe đã khởi hành — không thể thêm đơn vào bảng kê';
  }
  if (!canAddWaybillsToManifest(manifest)) return 'Bảng kê không ở trạng thái cho phép thêm đơn';
  return null;
}

export function canRemoveWaybillsFromManifest(manifest?: Pick<LoadPlanningManifest, 'status'> | null) {
  return manifest?.status === 'DRAFT' || manifest?.status === 'CLOSED';
}
export type PrintableManifest = LoadPlanningManifest;
