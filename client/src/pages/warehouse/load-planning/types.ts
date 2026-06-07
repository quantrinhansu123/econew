export interface FilterOption { value: string; label: string; }
export interface BadgeConfig { label: string; className: string; }

export interface HubSummary { id: string | number; code?: string | null; name?: string | null; }
export interface UserSummary { id: string | number; username?: string | null; name?: string | null; full_name?: string | null; }

export interface TripSummary {
  id: string | number;
  trip_code?: string | null;
  code?: string | null;
  status?: string | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  start_hub?: HubSummary | null;
  end_hub?: HubSummary | null;
  truck?: { license_plate?: string | null } | null;
}

export interface ManifestWaybill {
  id: string | number;
  waybill_code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  weight?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volumetric_weight?: number | string | null;
  payment_type?: string | null;
  cost_amount?: number | string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
}

export interface LoadPlanningManifest {
  id: string | number;
  manifest_code?: string | null;
  code?: string | null;
  seal_code?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  status?: string | null;
  waybill_count?: number | string | null;
  total_waybills?: number | string | null;
  total_weight?: number | string | null;
  weight_total?: number | string | null;
  trip_id?: string | number | null;
  trip?: TripSummary | null;
  closed_at?: string | null;
  created_at?: string | null;
  closed_by?: UserSummary | null;
  created_by?: UserSummary | null;
  waybills?: ManifestWaybill[];
}

export interface LoadPlanningFilters {
  keyword: string;
  status: string[];
  origin_hub_id: string[];
  dest_hub_id: string[];
  trip_id: string[];
  date_from: string;
  date_to: string;
  page: number;
  limit: number;
}

export interface ManifestListResponse {
  data?: LoadPlanningManifest[];
  items?: LoadPlanningManifest[];
  manifests?: LoadPlanningManifest[];
  total?: number;
  meta?: { total?: number; page?: number; limit?: number };
}

export interface TripListResponse {
  data?: TripSummary[];
  items?: TripSummary[];
  trips?: TripSummary[];
  total?: number;
  meta?: { total?: number };
}

export interface AssignTripFormState { trip_id: string; }

export interface LoadPlanningBoardItem {
  split_id?: string | number;
  waybill_id: string | number;
  waybill_code?: string | null;
  loading_position?: number | null;
  vi_tri_hang?: number | null;
  ngay_boc?: string | null;
  ngay_toi?: string | null;
  ma_tinh?: string | null;
  ten_cty?: string | null;
  dv?: string | null;
  mat_hang?: string | null;
  mat_hang_note?: string | null;
  noi_tra?: string | null;
  so_luong?: number | null;
  loai?: string | null;
  dia_chi?: string | null;
  xe_phat?: string | null;
  noi_den?: string | null;
  weight?: number | null;
  the_tich_m3?: number | null;
  allocated_freight?: number;
  load_status?: string | null;
}

export interface LoadPlanningTruckGroup {
  truck_id: string | number;
  license_plate?: string | null;
  nha_xe?: string | null;
  ten_lai_xe?: string | null;
  trip_id?: string | number | null;
  trip_status?: string | null;
  manifest_code?: string | null;
  total_packages: number;
  total_weight: number;
  total_freight?: number;
  items: LoadPlanningBoardItem[];
}

export interface LoadPlanningBoardResponse {
  trucks: LoadPlanningTruckGroup[];
  total_trucks: number;
  total_items: number;
}

export interface LoadPlanningBoardFilters {
  keyword: string;
  origin_hub_id: string[];
  dest_hub_id: string[];
  truck_id: string[];
  load_status: string[];
  date_from: string;
  date_to: string;
}
