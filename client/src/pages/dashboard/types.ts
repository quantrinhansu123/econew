export type AuthUserProfile = {
  id?: number | string;
  username?: string;
  name?: string;
  role_mask?: number | null;
  hub_id?: number | string | null;
};

export type DashboardFilters = {
  date_from: string;
  date_to: string;
  hub_id: string;
  status: string;
  payment_type: string;
};

export type HubOption = {
  id: number | string;
  code?: string | null;
  name?: string | null;
};

export type DashboardKpi = {
  total_waybills?: number | string | null;
  total_trips?: number | string | null;
  total_manifests?: number | string | null;
  delivered_waybills?: number | string | null;
  returned_waybills?: number | string | null;
  overdue_waybills?: number | string | null;
  in_transit_waybills?: number | string | null;
  pending_cod_amount?: number | string | null;
  total_revenue?: number | string | null;
  total_cost?: number | string | null;
  estimated_profit?: number | string | null;
  trends?: Record<string, number | string | null | undefined>;
};

export type StatusMetric = {
  status?: string | null;
  state?: string | null;
  count?: number | string | null;
  total?: number | string | null;
};

export type HubPerformance = {
  hub_id?: number | string | null;
  hub_code?: string | null;
  hub_name?: string | null;
  total_waybills?: number | string | null;
  delivered_waybills?: number | string | null;
  returned_waybills?: number | string | null;
  overdue_waybills?: number | string | null;
  total_trips?: number | string | null;
  total_inbound?: number | string | null;
  total_outbound?: number | string | null;
  cod_pending?: number | string | null;
};

export type FinanceSummary = {
  pending_cod_amount?: number | string | null;
  cc_cash_held?: number | string | null;
  cod_cash_held?: number | string | null;
  total_remitted?: number | string | null;
  total_revenue?: number | string | null;
  total_cost?: number | string | null;
  estimated_profit?: number | string | null;
};

export type OverdueWaybill = {
  id?: number | string;
  waybill_code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  weight?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volumetric_weight?: number | string | null;
  payment_type?: 'PP' | 'CC' | 'COD' | string | null;
  cost_amount?: number | string | null;
  origin_hub_id?: number | string | null;
  dest_hub_id?: number | string | null;
  current_state?: string | null;
};

export type ListResponse<T> = T[] | {
  data?: T[];
  items?: T[];
  results?: T[];
  total?: number;
};
