export type TruckStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE' | string;

export interface DriverSummary {
  id: string | number;
  name?: string | null;
  full_name?: string | null;
  username?: string | null;
  phone?: string | null;
}

export interface Truck {
  id: string | number;
  license_plate: string;
  payload: number;
  driver_id?: string | number | null;
  driver?: DriverSummary | null;
  fuel_consumption_limit: number;
  status: TruckStatus;
  ownership_type?: 'INTERNAL' | 'VENDOR' | string | null;
  vendor_id?: string | number | null;
  vendor?: { id?: string | number; code?: string | null; name?: string | null } | null;
  nha_xe?: string | null;
  ten_lai_xe?: string | null;
  loai_xe?: string | null;
  bks?: string | null;
  hub_id?: string | number | null;
  hub?: { id?: string | number; code?: string | null; name?: string | null } | null;
  document_image_urls?: string[] | null;
}

export interface TruckListResponse {
  data?: Truck[];
  items?: Truck[];
  trucks?: Truck[];
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

export interface TruckFilters {
  keyword: string;
  status: string[];
  driver_id: string;
  page: number;
  limit: number;
  ownership_type?: string;
  hub_id?: string;
  vendor_id?: string;
}

export interface TruckFormState {
  license_plate: string;
  payload: string;
  driver_id: string;
  fuel_consumption_limit: string;
  status: string;
  bks: string;
  hub_id: string;
  vendor_id: string;
  document_image_urls: string[];
}

export interface FilterOption {
  value: string;
  label: string;
}
