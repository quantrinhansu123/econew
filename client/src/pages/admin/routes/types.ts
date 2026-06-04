export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

export interface DeliveryRouteRecord {
  id: string | number;
  code: string;
  name: string;
  hub_id?: string | null;
  hub?: HubSummary | null;
  province?: string | null;
  district?: string | null;
  description?: string | null;
  status: string;
  sort_order: number;
}

export interface RouteListResponse {
  items?: DeliveryRouteRecord[];
  meta?: { total?: number; page?: number; limit?: number; total_pages?: number };
}

export interface RouteFilters {
  keyword: string;
  status: string;
  hub_id: string;
  page: number;
  limit: number;
}

export interface RouteFormState {
  code: string;
  name: string;
  hub_id: string;
  province: string;
  district: string;
  description: string;
  sort_order: string;
  status: string;
}

export interface FilterOption {
  value: string;
  label: string;
}
