export type RemittanceStatus = 'PENDING' | 'REMITTED' | 'OVERDUE';

export interface FilterOption {
  value: string;
  label: string;
}

export interface HubSummary {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

export interface ListResponse<T> {
  data?: T[];
  items?: T[];
  results?: T[];
  total?: number;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    total_pages?: number;
    totalPages?: number;
  };
}

export interface HubReconciliation {
  id: string | number;
  hub_id: string | number;
  reconciliation_date: string;
  cod_cash_held: number | string;
  cc_cash_held: number | string;
  total_remitted: number | string;
  remittance_status: RemittanceStatus;
  hub?: HubSummary | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HubReconciliationFilters {
  keyword: string;
  hub_id: string;
  remittance_status: RemittanceStatus | '';
  date_from: string;
  date_to: string;
  page: number;
  limit: number;
}

export interface ReconciliationFormState {
  hub_id: string;
  reconciliation_date: string;
  cod_cash_held: string;
  cc_cash_held: string;
  total_remitted: string;
  remittance_status: RemittanceStatus;
}

export interface CodReconciliationWaybill {
  id: string | number;
  waybill_code?: string | null;
  sender_info?: string | null;
  receiver_info?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  current_state?: string | null;
  payment_type?: string | null;
  cod_amount?: string | number | null;
  cc_amount?: string | number | null;
  freight_amount?: string | number | null;
  collect_amount?: string | number | null;
  cod_collected_amount?: string | number | null;
  ma_kh?: string | null;
  sent_date?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  trip_id?: string | number | null;
  trip_status?: string | null;
  manifest_id?: string | number | null;
  manifest_code?: string | null;
  origin_hub_code?: string | null;
  dest_hub_code?: string | null;
  fund_id?: string | number | null;
  fund_code?: string | null;
  fund_name?: string | null;
  cod_collection_status?: 'PENDING' | 'COLLECTED' | string | null;
  cod_reconciled_at?: string | null;
  cod_reconciled_by?: string | number | null;
}

export interface CashFund {
  id: string | number;
  code: string;
  name: string;
  hub_id?: string | number | null;
  is_active: boolean;
  note?: string | null;
  balance_amount?: number | string | null;
  collection_count?: number | string | null;
  hub?: HubSummary | null;
}
