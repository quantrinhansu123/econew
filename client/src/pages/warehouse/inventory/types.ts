export type WaybillInventoryStatus = 'RECEIVED' | 'IN_WAREHOUSE' | 'MANIFEST_CLOSED' | 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | string;
export type PaymentType = 'PP' | 'CC' | 'COD' | string;
export type PriorityLevel = 'HIGH' | 'NORMAL' | 'LOW' | 'URGENT' | string;
export type CustomerPaymentStatus = 'SENT_STATEMENT' | 'PAID' | '' | null;

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
  order_id?: string | number | null;
  order_code?: string | null;
  order?: {
    note?: string | null;
    goods_description?: string | null;
    noi_dung?: string | null;
    sender_name?: string | null;
    sender_phone?: string | null;
    sender_address?: string | null;
    receiver_name?: string | null;
    receiver_phone?: string | null;
    receiver_address?: string | null;
    receiver_district?: string | null;
    receiver_ward?: string | null;
    package_count?: number | string | null;
    weight?: number | string | null;
    freight_amount?: number | string | null;
    cod_amount?: number | string | null;
  } | null;
  waybill_code?: string | null;
  code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  sender_name?: string | null;
  sender_address?: string | null;
  receiver_name?: string | null;
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
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  sender_phone?: string | null;
  receiver_address?: string | null;
  receiver_district?: string | null;
  receiver_ward?: string | null;
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
  noi_dung?: string | null;
  mat_hang?: string | null;
  noi_den?: string | null;
  customer_destination_province?: string | null;
  loaded_at?: string | null;
  the_tich_m3?: number | string | null;
  split_id?: string | number | null;
  trip_id?: string | number | null;
  truck_id?: string | number | null;
  trip_package_count?: number | string | null;
  order_total_packages?: number | string | null;
  remaining_packages?: number | string | null;
  manifest_id?: string | number | null;
  trip_label?: string | null;
  license_plate?: string | null;
  trip_nha_xe?: string | null;
  trip_status?: string | null;
  loading_position?: number | string | null;
  split_note?: string | null;
  allocated_freight?: number | null;
  allocated_cod?: number | null;
  customer_payment_status?: CustomerPaymentStatus;
  customer_payment_note?: string | null;
  delivery_photo_url?: string | null;
}

export interface WaybillInventoryDetail extends WaybillInventoryItem {
  manifest_id?: string | number | null;
  trip_id?: string | number | null;
}

export interface InventoryFilters {
  keyword: string;
  ma_kh: string;
  statuses: string[];
  orderStatusGroups: string[];
  noiDenKeyword: string;
  billingUnits: string[];
  customerPaymentStatuses: string[];
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
    total_waybills?: number;
    total_lines?: number;
    total_freight?: number;
    page?: number;
    limit?: number;
    only_incomplete_split?: boolean;
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

export interface AllocationBoardItem {
  waybill_id: string | number;
  waybill_code?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  loading_position?: number | null;
  vi_tri_hang?: number | null;
  ngay_boc?: string | null;
  ma_tinh?: string | null;
  ten_cty?: string | null;
  dv?: string | null;
  mat_hang?: string | null;
  mat_hang_note?: string | null;
  noi_tra?: string | null;
  so_luong?: number | null;
  loai?: string | null;
  dia_chi?: string | null;
  quan_huyen?: string | null;
  phuong_xa?: string | null;
  xe_phat?: string | null;
  noi_den?: string | null;
  weight?: number | null;
  the_tich_m3?: number | null;
  is_highlighted?: boolean;
}

export interface AllocationBoardTrip {
  trip_id: string | number;
  manifest_id?: string | number | null;
  status?: string | null;
  license_plate?: string | null;
  nha_xe?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  expected_arrival_time?: string | null;
  departure_time?: string | null;
  manifest_code?: string | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  start_hub?: HubSummary | null;
  end_hub?: HubSummary | null;
  items: AllocationBoardItem[];
  contains_highlight?: boolean;
}

export interface AllocationBoardResponse {
  trips: AllocationBoardTrip[];
  total?: number;
  waybill_placement?: {
    trip_id: string | number;
    license_plate?: string | null;
    loading_position?: number | null;
    manifest_code?: string | null;
    status?: string | null;
  } | null;
}

export interface WaybillSplitLine {
  id?: string | number;
  waybill_id?: string | number;
  trip_id?: string | number | null;
  truck_id?: string | number | null;
  package_count: number;
  loading_position?: number | null;
  carrier_label?: string | null;
  note?: string | null;
  load_status?: string | null;
  license_plate?: string | null;
  nha_xe?: string | null;
  trip_status?: string | null;
  allocated_freight?: number;
  allocated_cod?: number;
}

export interface WaybillSplitResponse {
  waybill_id: string | number;
  waybill_code?: string | null;
  total_packages: number;
  allocated_packages: number;
  remaining_packages: number;
  total_freight: number;
  total_cod: number;
  splits: WaybillSplitLine[];
}

export interface TruckPickOption {
  id: string;
  label: string;
  license_plate?: string | null;
  bks?: string | null;
  nha_xe?: string | null;
  ten_lai_xe?: string | null;
}
