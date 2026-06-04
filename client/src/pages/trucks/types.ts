export type TruckStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRIP' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE' | string;

export interface DriverSummary {
  id: string | number;
  username?: string | null;
  name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  role_mask?: number | null;
}

export interface Truck {
  id: string | number;
  license_plate: string;
  payload?: number | null;
  driver_id?: string | number | null;
  driver?: DriverSummary | null;
  fuel_consumption_limit?: number | null;
  status: TruckStatus;
  ten_lai_xe?: string | null;
  nha_xe?: string | null;
  bks?: string | null;
  loai_xe?: string | null;
  khu_vuc?: string | null;
}

export interface TruckListResponse {
  data?: Truck[];
  items?: Truck[];
  trucks?: Truck[];
  total?: number;
  meta?: { total?: number; page?: number; limit?: number; totalPages?: number; total_pages?: number };
}

export interface TruckFilters {
  keyword: string;
  status: string[];
  loai_xe: string;
  page: number;
  limit: number;
}

export interface TruckFormState {
  license_plate: string;
  bks: string;
  ten_lai_xe: string;
  nha_xe: string;
  loai_xe: string;
  khu_vuc: string;
  payload: string;
  driver_id: string;
  fuel_consumption_limit: string;
  status: string;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface TruckKanbanColumn {
  id: string;
  label: string;
  trucks: Truck[];
}
