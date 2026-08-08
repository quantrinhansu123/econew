export type PaymentType = 'PP' | 'CC' | 'COD';
export type WaybillState = 'RECEIVED' | 'IN_WAREHOUSE' | 'MANIFEST_CLOSED' | 'IN_TRANSIT' | 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';

export interface FilterOption { value: string; label: string; count?: number }
export interface BadgeConfig { label: string; className: string }

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
  address?: string | null;
  coordinates?: string | null;
}

export interface UserSummary {
  id: string | number;
  username: string;
  name?: string | null;
  phone?: string | null;
  role_mask: number;
}

export interface TripSummary {
  id: string | number;
  status?: string | null;
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

export interface LastMileWaybill {
  id: string | number;
  task_id?: string | null;
  split_id?: string | number | null;
  waybill_code: string;
  sender_info: string;
  sender_name?: string | null;
  sender_phone?: string | null;
  sender_address?: string | null;
  receiver_info: string;
  receiver_name?: string | null;
  receiver_company_name?: string | null;
  receiver_address?: string | null;
  receiver_phone?: string | null;
  weight: number | string | null;
  actual_weight?: number | string | null;
  length: number | string | null;
  width: number | string | null;
  height: number | string | null;
  volumetric_weight: number | string | null;
  the_tich_m3?: number | string | null;
  package_count?: number | string | null;
  cod_amount?: number | string | null;
  freight_amount?: number | string | null;
  note?: string | null;
  payment_type: PaymentType | string;
  cost_amount?: number | string | null;
  current_state: WaybillState | string;
  origin_hub_id: string | number | null;
  dest_hub_id: string | number | null;
  last_mile_driver_id?: string | number | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  last_mile_driver?: UserSummary | null;
  delivery_assignment_type?: 'INTERNAL' | 'PARTNER' | null;
  last_mile_truck_id?: string | number | null;
  last_mile_vendor_id?: string | number | null;
  last_mile_driver_name?: string | null;
  last_mile_license_plate?: string | null;
  last_mile_cost_amount?: number | string | null;
  last_mile_truck?: { id: string | number; license_plate?: string | null; bks?: string | null; loai_xe?: string | null } | null;
  last_mile_vendor?: { id: string | number; code?: string | null; name?: string | null; phone?: string | null } | null;
  driver?: UserSummary | null;
  delivery_photo_url?: string | null;
  trip_id?: string | number | null;
  trip?: TripSummary | null;
  trip_package_count?: number | null;
  order_total_packages?: number | null;
  trip_label?: string | null;
  license_plate?: string | null;
  trip_nha_xe?: string | null;
  delivery_preparation_status?: 'PENDING_CONFIRMATION' | 'READY' | 'SCHEDULED' | 'NEEDS_ACTION' | 'HOLD' | null;
  delivery_scheduled_at?: string | null;
  delivery_hold_reason?: string | null;
  delivery_confirmed_at?: string | null;
  route_code?: string | null;
  last_delivery_failure_reason?: string | null;
  sent_date?: string | null;
  created_at?: string | null;
}

export interface WaybillHistoryItem {
  id: string | number;
  action: string;
  changes?: Record<string, { old_value?: unknown; new_value?: unknown }>;
  changed_by_name?: string | null;
  created_at: string;
}

export interface DeliveryDriverOption { id: string | number; name?: string | null; username?: string | null; phone?: string | null; hub_id?: string | number | null }
export interface DeliveryTruckOption { id: string | number; license_plate?: string | null; bks?: string | null; loai_xe?: string | null; driver_id?: string | number | null; driver_name?: string | null }
export interface DeliveryVendorOption { id: string | number; code?: string | null; name?: string | null; phone?: string | null; service_type?: string | null }
export interface DeliveryResources { drivers: DeliveryDriverOption[]; trucks: DeliveryTruckOption[]; vendors: DeliveryVendorOption[] }

export type LastMileWaybillDetail = LastMileWaybill;

export interface ListResponse<T> {
  data?: T[];
  items?: T[];
  waybills?: T[];
  users?: T[];
  hubs?: T[];
  trips?: T[];
  total?: number;
  meta?: { total?: number; page?: number; limit?: number; total_pages?: number };
}

export interface LastMileFilters {
  keyword: string;
  statuses: string[];
  driverIds: string[];
  tripIds: string[];
  routeIds: string[];
  originHubIds: string[];
  destHubIds: string[];
  paymentTypes: string[];
  page: number;
  limit: number;
}
