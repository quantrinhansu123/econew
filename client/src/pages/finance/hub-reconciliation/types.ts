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
  created_at?: string | null;
  delivered_at?: string | null;
  cod_reconciled_at?: string | null;
  cod_reconciled_by?: string | number | null;
}
