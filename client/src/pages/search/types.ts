export type SearchResultType = 'ALL' | 'WAYBILL' | 'TRIP';

export interface FilterOption {
  value: string;
  label: string;
}

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

export interface SearchFilters {
  keyword: string;
  type: SearchResultType;
  statuses: string[];
  originHubIds: string[];
  destHubIds: string[];
  paymentTypes: string[];
  date_from: string;
  date_to: string;
  page: number;
  limit: number;
}

export interface SearchResultItem {
  id: string | number;
  type: 'WAYBILL' | 'TRIP';
  code?: string | null;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  status?: string | null;
  hub?: string | null;
  hub_summary?: string | null;
  route?: string | null;
  time?: string | null;
  matched_field?: string | null;
  matchedField?: string | null;
  matched_fields?: string[] | null;
  waybill_code?: string | null;
  manifest_id?: string | number | null;
  truck_id?: string | number | null;
  current_state?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  departure_time?: string | null;
  created_at?: string | null;
}

export interface ListResponse<T> {
  data?: T[];
  items?: T[];
  results?: T[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface WaybillDetail {
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

export interface TripDetail {
  id: string | number;
  truck_id?: string | number | null;
  manifest_id?: string | number | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  fuel_actual?: number | string | null;
  fuel_cost?: number | string | null;
  other_costs?: number | string | null;
}

export interface SearchWaybillRow {
  id: string | number;
  waybill_code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  payment_type?: string | null;
  status?: string | null;
  current_state?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  current_hub_id?: string | number | null;
  created_at?: string | null;
  weight?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volumetric_weight?: number | string | null;
  cost_amount?: number | string | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
}

export interface SearchTripRow {
  id: string | number;
  truck_id?: string | number | null;
  manifest_id?: string | number | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  status?: string | null;
  created_at?: string | null;
  fuel_actual?: number | string | null;
  fuel_cost?: number | string | null;
  other_costs?: number | string | null;
  bill_count?: number | string | null;
  waybill_count?: number | string | null;
  truck?: { id?: string | number; license_plate?: string | null; driver_id?: string | number | null } | null;
  manifest?: { id?: string | number; manifest_code?: string | null } | null;
  start_hub?: HubSummary | null;
  end_hub?: HubSummary | null;
}
