export type PaymentType = 'PP' | 'CC' | 'COD';
export type WaybillState = 'RECEIVED' | 'IN_WAREHOUSE' | 'MANIFEST_CLOSED' | 'IN_TRANSIT' | 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';
export type DeliveryReturnAction = 'STORE_AT_HUB' | 'WAIT_REDELIVERY' | 'REDIRECT_ADDRESS';

export interface DeliveryStatusPayload {
  status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';
  delivery_photo_url?: string;
  return_reason?: string;
  return_action?: DeliveryReturnAction;
  redelivery_address?: string;
  delivery_vehicle?: string;
}

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
  waybill_code: string;
  sender_info: string;
  receiver_info: string;
  receiver_address?: string | null;
  receiver_phone?: string | null;
  weight: number | string | null;
  length: number | string | null;
  width: number | string | null;
  height: number | string | null;
  volumetric_weight: number | string | null;
  payment_type: PaymentType | string;
  cost_amount?: number | string | null;
  current_state: WaybillState | string;
  origin_hub_id: string | number | null;
  dest_hub_id: string | number | null;
  last_mile_driver_id?: string | number | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  last_mile_driver?: UserSummary | null;
  driver?: UserSummary | null;
  delivery_photo_url?: string | null;
  delivery_attempt_count?: number;
  last_delivery_attempt_at?: string | null;
  return_reason?: string | null;
  return_action?: DeliveryReturnAction | string | null;
  redelivery_address?: string | null;
  xe_phat?: string | null;
  trip_id?: string | number | null;
  trip?: TripSummary | null;
}

export type LastMileWaybillDetail = LastMileWaybill;

export interface ListResponse<T> {
  data?: T[];
  items?: T[];
  waybills?: T[];
  users?: T[];
  hubs?: T[];
  trips?: T[];
  total?: number;
  meta?: { total?: number };
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
