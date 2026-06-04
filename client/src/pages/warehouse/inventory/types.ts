export type WaybillInventoryStatus = 'RECEIVED' | 'IN_WAREHOUSE' | 'MANIFEST_CLOSED' | 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | string;
export type PaymentType = 'PP' | 'CC' | 'COD' | string;
export type PriorityLevel = 'HIGH' | 'NORMAL' | 'LOW' | 'URGENT' | string;

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
  address?: string | null;
  is_active?: boolean | string | number | null;
  status?: string | null;
}

export interface UserSummary {
  id: string | number;
  username?: string | null;
  name?: string | null;
  full_name?: string | null;
  role_mask?: number | null;
}

export interface WaybillInventoryItem {
  id: string | number;
  waybill_code?: string | null;
  code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  current_hub_id?: string | number | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  current_hub?: HubSummary | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  current_state?: WaybillInventoryStatus | null;
  status?: WaybillInventoryStatus | null;
  payment_type?: PaymentType | null;
  cod_amount?: number | string | null;
  cost_amount?: number | string | null;
  freight_amount?: number | string | null;
  volumetric_weight?: number | string | null;
  receiver_address?: string | null;
  receiver_phone?: string | null;
  package_count?: number | string | null;
  declared_package_count?: number | string | null;
  weight?: number | string | null;
  actual_weight?: number | string | null;
  priority?: PriorityLevel | null;
  received_at?: string | null;
  created_at?: string | null;
  received_by?: UserSummary | null;
  route_code?: string | null;
  delivery_route?: string | null;
  note?: string | null;
  notes?: string | null;
  ma_kh?: string | null;
  noi_den?: string | null;
  loaded_at?: string | null;
  the_tich_m3?: number | string | null;
}

export interface WaybillInventoryDetail extends WaybillInventoryItem {
  receiver_address?: string | null;
  sender_phone?: string | null;
  receiver_phone?: string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volumetric_weight?: number | string | null;
  manifest_id?: string | number | null;
  trip_id?: string | number | null;
}

export interface InventoryFilters {
  keyword: string;
  statuses: string[];
  hubIds: string[];
  paymentTypes: string[];
  priorities: string[];
  receivedFrom: string;
  receivedTo: string;
  page: number;
  limit: number;
}

export interface InventoryListResponse {
  data?: WaybillInventoryItem[];
  items?: WaybillInventoryItem[];
  waybills?: WaybillInventoryItem[];
  total?: number;
  page?: number;
  limit?: number;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface BadgeConfig {
  label: string;
  className: string;
}

export interface PriorityFormState {
  priority: string;
}

export interface RouteFormState {
  route_code: string;
}
