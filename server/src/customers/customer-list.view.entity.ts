import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({ name: 'v_customer_list' })
export class CustomerListViewEntity {
  @ViewColumn()
  id: string;

  @ViewColumn()
  customer_type: string;

  @ViewColumn()
  is_suspended: boolean;

  @ViewColumn()
  status: string;

  @ViewColumn()
  code: string;

  @ViewColumn()
  name: string;

  @ViewColumn()
  short_name: string | null;

  @ViewColumn()
  english_name: string | null;

  @ViewColumn()
  address: string | null;

  @ViewColumn()
  tax_id: string | null;

  @ViewColumn()
  phone_landline: string | null;

  @ViewColumn()
  id_number: string | null;

  @ViewColumn()
  mobile: string | null;

  @ViewColumn()
  email: string | null;

  @ViewColumn()
  bank_name: string | null;

  @ViewColumn()
  bank_account: string | null;

  @ViewColumn()
  bank_account_holder: string | null;

  @ViewColumn()
  manager_name: string | null;

  @ViewColumn()
  delivery_handler: string | null;

  @ViewColumn()
  contact_person: string | null;

  @ViewColumn()
  region: string | null;

  @ViewColumn()
  destination_province: string | null;

  @ViewColumn()
  mechanism: string | null;

  @ViewColumn()
  credit_type: string | null;

  @ViewColumn()
  contract_code: string | null;

  @ViewColumn()
  price_table: string | null;

  @ViewColumn()
  discount_percent: string;

  @ViewColumn()
  contact_address: string | null;

  @ViewColumn()
  receiver_han: string | null;

  @ViewColumn()
  address_han: string | null;

  @ViewColumn()
  phone_han: string | null;

  @ViewColumn()
  receiver_hcm: string | null;

  @ViewColumn()
  address_hcm: string | null;

  @ViewColumn()
  phone_hcm: string | null;

  @ViewColumn()
  receiver_dng: string | null;

  @ViewColumn()
  address_dng: string | null;

  @ViewColumn()
  phone_dng: string | null;

  @ViewColumn()
  created_at: Date;

  @ViewColumn()
  updated_at: Date;

  @ViewColumn()
  waybill_count: number;
}
