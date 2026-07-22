/** Bản ghi từ view `v_customer_list` / API GET /customers */
export interface CustomerListItem {
  id: string;
  customer_type: string;
  is_suspended: boolean;
  code: string;
  name: string;
  short_name: string | null;
  english_name: string | null;
  address: string | null;
  tax_id: string | null;
  phone_landline: string | null;
  id_number: string | null;
  mobile: string | null;
  email: string | null;
  region: string | null;
  destination_province: string | null;
  receiver_han?: string | null;
  address_han?: string | null;
  phone_han?: string | null;
  receiver_hcm?: string | null;
  receiver_dng?: string | null;
  address_hcm: string | null;
  phone_hcm: string | null;
  address_dng?: string | null;
  phone_dng?: string | null;
  credit_type: string | null;
  price_table: string | null;
  discount_percent: number | string;
  delivery_handler: string | null;
  contact_person: string | null;
  manager_name?: string | null;
  status: string;
  waybill_count: number;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}
