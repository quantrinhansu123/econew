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
  registration_expiry_date?: string | null;
  insurance_expiry_date?: string | null;
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
  registration_expiry_date: string;
  insurance_expiry_date: string;
}

export interface TruckComplianceAlert {
  type: 'REGISTRATION' | 'INSURANCE';
  label: string;
  expiry_date: string;
  days_remaining: number;
  status: 'EXPIRED' | 'DUE_SOON';
}

export interface TruckComplianceAlertItem {
  id: string;
  license_plate: string;
  hub_id?: string | number | null;
  hub_code?: string | null;
  hub_name?: string | null;
  registration_expiry_date?: string | null;
  insurance_expiry_date?: string | null;
  alerts: TruckComplianceAlert[];
}

export interface TruckComplianceResponse {
  as_of: string;
  warning_days: number;
  items: TruckComplianceAlertItem[];
  meta: {
    tracked_trucks: number;
    registration_tracked: number;
    insurance_tracked: number;
    warning_trucks: number;
    total_alerts: number;
    expired_alerts: number;
    due_soon_alerts: number;
  };
}

export interface FilterOption {
  value: string;
  label: string;
}
