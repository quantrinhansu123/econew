export type WaybillStatus = 'RECEIVED' | 'IN_WAREHOUSE' | 'MANIFEST_CLOSED' | 'IN_TRANSIT' | 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | string;
export type PaymentType = 'PP' | 'CC' | 'COD';

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  is_active?: boolean | string | number | null;
  status?: string | null;
}

export interface UserSummary {
  id: string | number;
  username?: string | null;
  name?: string | null;
  full_name?: string | null;
  role_mask?: number | null;
  hub_id?: string | number | null;
  hub_ids?: Array<string | number> | null;
  hubs?: HubSummary[] | null;
}

export interface WaybillDetail {
  id: string | number;
  waybill_code?: string | null;
  code?: string | null;
  sender_info?: string | null;
  sender_name?: string | null;
  sender_phone?: string | null;
  sender_address?: string | null;
  receiver_info?: string | null;
  receiver_company_name?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
  receiver_district?: string | null;
  receiver_ward?: string | null;
  noi_den?: string | null;
  ma_kh?: string | null;
  weight?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volumetric_weight?: number | string | null;
  the_tich_m3?: number | string | null;
  actual_weight?: number | string | null;
  package_count?: number | string | null;
  declared_package_count?: number | string | null;
  current_state?: WaybillStatus | null;
  status?: WaybillStatus | null;
  priority?: string | null;
  payment_type?: PaymentType | string | null;
  cost_amount?: number | string | null;
  freight_amount?: number | string | null;
  cc_amount?: number | string | null;
  cod_amount?: number | string | null;
  note?: string | null;
  notes?: string | null;
  manifest_id?: string | number | null;
  trip_id?: string | number | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  current_hub_id?: string | number | null;
  receiving_hub_id?: string | number | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  current_hub?: HubSummary | null;
  receiving_hub?: HubSummary | null;
  delivery_photo_url?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  received_by?: UserSummary | null;
}

export interface ReceiveFormState {
  waybillCode: string;
  deliveryPhotoUrl: string;
}

export interface ReceiveWaybillPayload {
  delivery_photo_url: string;
}

export interface CreateWaybillFormState {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  originHubId: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  destHubId: string;
  packageCount: string;
  weight: string;
  goodsDescription: string;
  note: string;
  paymentType: PaymentType;
  costAmount: string;
  codAmount: string;
  expectedDeliveryDate: string;
}

export interface CreateWaybillPayload {
  waybill_code: string;
  sender_info: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_info: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  origin_hub_id: string;
  dest_hub_id: string;
  package_count: number;
  weight: number;
  goods_description?: string;
  note?: string;
  payment_type: PaymentType;
  cost_amount: number;
  cod_amount?: number;
  expected_delivery_date?: string;
  current_state: 'RECEIVED';
}

export interface CreatedWaybill {
  id: string | number;
  waybill_code?: string | null;
  code?: string | null;
  current_state?: string | null;
  payment_type?: PaymentType | string | null;
  origin_hub?: HubSummary | null;
  dest_hub?: HubSummary | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
}

export interface BadgeConfig {
  label: string;
  className: string;
}
