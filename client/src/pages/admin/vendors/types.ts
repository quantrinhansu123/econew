export interface Vendor {
  id: string | number;
  code?: string | null;
  name?: string | null;
  service_type?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  province?: string | null;
  contract_type?: string | null;
  status?: string | null;
  payable_balance?: string | number | null;
  opening_debt?: string | number | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_holder?: string | null;
  qr_image_url?: string | null;
  routes?: Record<string, unknown> | unknown[] | null;
  pricing?: Record<string, unknown> | unknown[] | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export type VendorRecord = Vendor;

export interface VendorListResponse {
  data?: Vendor[];
  items?: Vendor[];
  vendors?: Vendor[];
  total?: number;
  page?: number;
  limit?: number;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    total_pages?: number;
  };
}

export interface VendorFilters {
  keyword: string;
  status: string[];
  service_type: string[];
  province: string[];
  contract_type: string[];
  page: number;
  limit: number;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface VendorFormState {
  code: string;
  name: string;
  service_type: string;
  contact_name: string;
  phone: string;
  email: string;
  opening_debt: string;
  bank_name: string;
  bank_account: string;
  bank_account_holder: string;
  qr_image_url: string;
  province: string;
  contract_type: string;
  status: string;
}
