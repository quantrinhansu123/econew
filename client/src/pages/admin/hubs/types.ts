export type HubStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | string;
export type HubType = 'POST_OFFICE' | 'WAREHOUSE' | 'HUB' | string;

export interface HubManager {
  id: string | number;
  name?: string;
  full_name?: string;
  username?: string;
  phone?: string | null;
}

export interface HubRiskSummary {
  active_waybills?: number;
  active_trips?: number;
  active_users?: number;
  waybills?: number;
  trips?: number;
  users?: number;
}

export interface Hub {
  id: string | number;
  code: string;
  name: string;
  type?: HubType | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  coordinates?: string | null;
  manager_id?: string | number | null;
  manager_name?: string | null;
  manager_phone?: string | null;
  manager?: HubManager | null;
  phone?: string | null;
  status?: HubStatus | null;
  is_active?: boolean;
  active_waybills_count?: number;
  active_trips_count?: number;
  active_users_count?: number;
  usage_summary?: HubRiskSummary | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HubListResponse {
  data?: Hub[];
  items?: Hub[];
  hubs?: Hub[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface HubFilters {
  keyword: string;
  status: string;
  province: string;
  district: string;
  type: string;
  page: number;
  limit: number;
}

export interface HubFormState {
  code: string;
  name: string;
  type: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  coordinates: string;
  manager_id: string;
  manager_name: string;
  manager_phone: string;
  phone: string;
  status: string;
}

export type HubMutationPayload = {
  code: string;
  name: string;
  type: string;
  address: string;
  province: string;
  district: string;
  ward?: string;
  coordinates?: string;
  manager_name?: string;
  manager_phone?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
};

export interface FilterOption {
  value: string;
  label: string;
}
