import type { CustomerListItem } from './types';

export type CustomerRecord = CustomerListItem & {
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_holder?: string | null;
  mechanism?: string | null;
  contract_code?: string | null;
  contact_address?: string | null;
  receiver_han?: string | null;
  address_han?: string | null;
  phone_han?: string | null;
  receiver_hcm?: string | null;
  receiver_dng?: string | null;
  address_dng?: string | null;
  phone_dng?: string | null;
  english_name?: string | null;
  id_number?: string | null;
};

export type CustomerFormState = {
  code: string;
  name: string;
  short_name: string;
  destination_province: string;
  receiver_han: string;
  address_han: string;
  phone_han: string;
  receiver_hcm: string;
  address_hcm: string;
  phone_hcm: string;
  receiver_dng: string;
  email: string;
  contact_person: string;
  manager_name: string;
  price_table: string;
  default_service: string;
  default_delivery_method: string;
  default_billing_unit: string;
  default_payment_method: string;
  default_special_goods: string[];
  discount_percent: string;
  delivery_handler: string;
  status: string;
  mobile: string;
  address: string;
  region: string;
  credit_type: string;
  contract_code: string;
  tax_id: string;
  phone_landline: string;
  address_dng: string;
  phone_dng: string;
};

export const emptyCustomerForm = (): CustomerFormState => ({
  code: '',
  name: '',
  short_name: '',
  destination_province: '',
  receiver_han: '',
  address_han: '',
  phone_han: '',
  receiver_hcm: '',
  address_hcm: '',
  phone_hcm: '',
  receiver_dng: '',
  email: '',
  contact_person: '',
  manager_name: '',
  price_table: '',
  default_service: '',
  default_delivery_method: '',
  default_billing_unit: '',
  default_payment_method: '',
  default_special_goods: [],
  discount_percent: '0',
  delivery_handler: '',
  status: 'ACTIVE',
  mobile: '',
  address: '',
  region: '',
  credit_type: '',
  contract_code: '',
  tax_id: '',
  phone_landline: '',
  address_dng: '',
  phone_dng: '',
});
