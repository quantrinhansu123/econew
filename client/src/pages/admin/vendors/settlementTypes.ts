export interface VendorSettlement {
  id: string;
  from_date: string;
  to_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
  trips: Array<{ id: string; amount: number; paid_amount: number; departure_time: string; license_plate: string | null }>;
  payments: Array<{ id: string; amount: number; payment_date: string; description: string | null }>;
}

export interface UnallocatedVendorPayment {
  id: string;
  amount: number;
  available_amount: number;
  payment_date: string;
  description: string | null;
}

export interface SettlementRange { fromDate: string; toDate: string }

export const settlementToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

export const settlementLabel = (period: Pick<VendorSettlement, 'from_date' | 'to_date'>) => {
  const date = (value: string) => value.split('-').reverse().join('/');
  return `${date(period.from_date)} – ${date(period.to_date)}`;
};
