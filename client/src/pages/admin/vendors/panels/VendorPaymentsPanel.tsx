import { useMemo } from 'react';
import { clsx } from 'clsx';
import { Banknote, Loader2, Plus, Printer, Receipt } from 'lucide-react';
import { DayPicker } from '../../../../components/ui/DayPicker';
import { formatMoney, isDateInRange } from '../../../warehouse/customers/utils/customerFinanceUtils';

export interface VendorPaymentFilters {
  fromDate: string;
  toDate: string;
  entryType: '' | 'TRIP' | 'PAYMENT';
}

export interface VendorLedgerEntry {
  id: string | number;
  type?: 'TRIP' | 'PAYMENT' | string | null;
  date?: string | null;
  amount?: number | string | null;
  signed_amount?: number | string | null;
  running_balance?: number | string | null;
  description?: string | null;
  trip_id?: string | number | null;
  license_plate?: string | null;
  payment_id?: string | number | null;
}

export interface VendorLedgerBalance {
  total_incurred?: number;
  total_paid?: number;
  remaining?: number;
}

interface Props {
  vendorCode: string;
  entries: VendorLedgerEntry[];
  balance: VendorLedgerBalance;
  filters: VendorPaymentFilters;
  loading: boolean;
  error: string;
  onFiltersChange: (patch: Partial<VendorPaymentFilters>) => void;
  onSpend: () => void;
  onPrintStatement: () => void;
}

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';

const formatDayLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function dayKey(value?: string | null) {
  if (!value) return 'unknown';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function VendorPaymentsPanel({
  vendorCode,
  entries,
  balance,
  filters,
  loading,
  error,
  onFiltersChange,
  onSpend,
  onPrintStatement,
}: Props) {
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filters.entryType && String(entry.type) !== filters.entryType) return false;
      return isDateInRange(entry.date, filters.fromDate, filters.toDate);
    });
  }, [entries, filters]);

  const filteredSummary = useMemo(() => {
    let totalIncurred = 0;
    let totalPaid = 0;
    for (const entry of filteredEntries) {
      const signed = Number(entry.signed_amount ?? entry.amount ?? 0) || 0;
      if (String(entry.type) === 'TRIP') totalIncurred += Math.abs(signed);
      else if (String(entry.type) === 'PAYMENT') totalPaid += Math.abs(signed);
    }
    return { totalIncurred, totalPaid, remaining: totalIncurred - totalPaid };
  }, [filteredEntries]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: VendorLedgerEntry[] }>();
    for (const entry of filteredEntries) {
      const key = dayKey(entry.date);
      const label = formatDayLabel(entry.date);
      const group = map.get(key) ?? { label, items: [] };
      group.items.push(entry);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  const hasFilters = Boolean(filters.fromDate || filters.toDate || filters.entryType);
  const summaryIncurred = hasFilters ? filteredSummary.totalIncurred : (balance.total_incurred ?? filteredSummary.totalIncurred);
  const summaryPaid = hasFilters ? filteredSummary.totalPaid : (balance.total_paid ?? filteredSummary.totalPaid);
  const summaryRemaining = hasFilters ? filteredSummary.remaining : (balance.remaining ?? filteredSummary.remaining);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-primary">Thanh toán nhà cung cấp</p>
          <p className="text-[13px] font-medium text-muted-foreground">Theo dõi công nợ, phiếu chi và bảng kê NCC.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrintStatement}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-[13px] font-extrabold text-foreground shadow-sm hover:bg-muted"
          >
            <Printer size={16} />
            In phiếu kê
          </button>
          <button
            type="button"
            onClick={onSpend}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus size={16} />
            Chi
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Tổng phát sinh" value={formatMoney(summaryIncurred, '0 đ')} tone="blue" />
        <SummaryCard label="Đã chi trả" value={formatMoney(summaryPaid, '0 đ')} tone="emerald" />
        <SummaryCard label="Công nợ còn lại" value={formatMoney(summaryRemaining, '0 đ')} tone="red" />
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">
          Bộ lọc · NCC {vendorCode}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Từ ngày</span>
            <DayPicker
              value={filters.fromDate}
              onChange={(value) => onFiltersChange({ fromDate: value })}
              className="h-10 w-full border-input text-[13px] font-medium"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Đến ngày</span>
            <DayPicker
              value={filters.toDate}
              onChange={(value) => onFiltersChange({ toDate: value })}
              className="h-10 w-full border-input text-[13px] font-medium"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Loại giao dịch</span>
            <select
              value={filters.entryType}
              onChange={(event) => onFiltersChange({ entryType: event.target.value as VendorPaymentFilters['entryType'] })}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
            >
              <option value="">Tất cả</option>
              <option value="TRIP">Phát sinh chuyến</option>
              <option value="PAYMENT">Phiếu chi</option>
            </select>
          </label>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onFiltersChange({ fromDate: '', toDate: '', entryType: '' })}
            className="mt-3 text-[12px] font-bold text-red-500 hover:underline"
          >
            × Xóa bộ lọc
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      ) : error ? (
        <p className="py-8 text-center text-[13px] font-bold text-red-600">{error}</p>
      ) : grouped.length === 0 ? (
        <div className="py-10 text-center">
          <Receipt size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-[13px] font-medium text-muted-foreground">Chưa có giao dịch công nợ cho NCC này.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, group]) => {
            const dayIncurred = group.items
              .filter((entry) => String(entry.type) === 'TRIP')
              .reduce((sum, entry) => sum + Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0)), 0);
            const dayPaid = group.items
              .filter((entry) => String(entry.type) === 'PAYMENT')
              .reduce((sum, entry) => sum + Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0)), 0);

            return (
              <section key={key} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-3">
                  <p className="text-[13px] font-extrabold capitalize text-foreground">{group.label}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Phát sinh {formatMoney(dayIncurred, '0 đ')}</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Đã chi {formatMoney(dayPaid, '0 đ')}</span>
                  </div>
                </div>
                <div className="divide-y divide-border/70">
                  {group.items.map((entry) => {
                    const isTrip = String(entry.type) === 'TRIP';
                    const amount = Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0));
                    return (
                      <div key={String(entry.id)} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={clsx(
                                  'rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase',
                                  isTrip ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800',
                                )}
                              >
                                {isTrip ? 'Phát sinh chuyến' : 'Phiếu chi'}
                              </span>
                              <span className="text-[15px] font-extrabold text-foreground">{formatMoney(amount, '0 đ')}</span>
                            </div>
                            {entry.trip_id && (
                              <p className="mt-1 text-[12px] font-bold text-primary">
                                Chuyến #{entry.trip_id}
                                {entry.license_plate ? ` · ${entry.license_plate}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            <p>{formatDateTime(entry.date)}</p>
                            <p className="font-bold text-foreground">Dư: {formatMoney(entry.running_balance, '0 đ')}</p>
                          </div>
                        </div>
                        {entry.description?.trim() && (
                          <p className="mt-2 text-[12px] text-foreground">
                            <span className="font-bold text-muted-foreground">Ghi chú: </span>
                            {entry.description}
                          </p>
                        )}
                        {!isTrip && entry.payment_id && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-muted-foreground">
                            <Banknote size={12} />
                            Phiếu chi #{entry.payment_id}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'blue' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-[18px] font-extrabold">{value}</p>
    </div>
  );
}
