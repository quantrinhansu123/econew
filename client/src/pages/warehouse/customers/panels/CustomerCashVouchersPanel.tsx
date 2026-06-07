import { useMemo } from 'react';
import { clsx } from 'clsx';
import { Banknote, Loader2, Plus, Printer, Receipt } from 'lucide-react';
import { DayPicker } from '../../../../components/ui/DayPicker';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import { computeVoucherMeta, filterCashVouchers } from '../utils/customerFinanceUtils';

export interface CashVoucherFilters {
  fromDate: string;
  toDate: string;
  voucherType: '' | 'Thu' | 'Chi';
}

export interface CashVoucherMeta {
  total?: number;
  total_thu?: number;
  total_chi?: number;
  net?: number;
}

interface Props {
  customerCode: string;
  vouchers: WaybillCashVoucher[];
  filters: CashVoucherFilters;
  loading: boolean;
  error: string;
  onFiltersChange: (patch: Partial<CashVoucherFilters>) => void;
  onCollect: () => void;
  onPrintStatement: () => void;
}

const formatMoney = (value?: number | string | null) =>
  value == null || value === '' ? '0 đ' : `${Number(value).toLocaleString('vi-VN')} đ`;

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';

const formatDayLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function dayKey(value?: string | null) {
  if (!value) return 'unknown';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CustomerCashVouchersPanel({
  customerCode,
  vouchers,
  filters,
  loading,
  error,
  onFiltersChange,
  onCollect,
  onPrintStatement,
}: Props) {
  const filteredVouchers = useMemo(() => filterCashVouchers(vouchers, filters), [vouchers, filters]);
  const meta = useMemo(() => computeVoucherMeta(filteredVouchers), [filteredVouchers]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: WaybillCashVoucher[] }>();
    for (const voucher of filteredVouchers) {
      const key = dayKey(voucher.created_at);
      const label = formatDayLabel(voucher.created_at);
      const group = map.get(key) ?? { label, items: [] };
      group.items.push(voucher);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredVouchers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-primary">Thanh toán khách hàng</p>
          <p className="text-[13px] font-medium text-muted-foreground">Theo dõi và lập phiếu thu/chi theo từng bill.</p>
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
            onClick={onCollect}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus size={16} />
            Thu
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Tổng thu" value={formatMoney(meta.total_thu)} tone="emerald" />
        <SummaryCard label="Tổng chi" value={formatMoney(meta.total_chi)} tone="red" />
        <SummaryCard label="Chênh lệch" value={formatMoney(meta.net)} tone="blue" />
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">
          Bộ lọc · Mã KH {customerCode}
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
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Loại phiếu</span>
            <select
              value={filters.voucherType}
              onChange={(event) => onFiltersChange({ voucherType: event.target.value as CashVoucherFilters['voucherType'] })}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
            >
              <option value="">Tất cả</option>
              <option value="Thu">Phiếu thu</option>
              <option value="Chi">Phiếu chi</option>
            </select>
          </label>
        </div>
        {(filters.fromDate || filters.toDate || filters.voucherType) && (
          <button
            type="button"
            onClick={() => onFiltersChange({ fromDate: '', toDate: '', voucherType: '' })}
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
          <p className="text-[13px] font-medium text-muted-foreground">Chưa có phiếu thu/chi cho mã KH này.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, group]) => {
            const dayThu = group.items
              .filter((v) => String(v.voucher_type).toLowerCase() === 'thu')
              .reduce((sum, v) => sum + Number(v.amount || 0), 0);
            const dayChi = group.items
              .filter((v) => String(v.voucher_type).toLowerCase() === 'chi')
              .reduce((sum, v) => sum + Number(v.amount || 0), 0);

            return (
              <section key={key} className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-3">
                  <p className="text-[13px] font-extrabold capitalize text-foreground">{group.label}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Thu {formatMoney(dayThu)}</span>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">Chi {formatMoney(dayChi)}</span>
                  </div>
                </div>
                <div className="divide-y divide-border/70">
                  {group.items.map((voucher) => {
                    const isThu = String(voucher.voucher_type).toLowerCase() === 'thu';
                    return (
                      <div key={String(voucher.id)} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={clsx(
                                  'rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase',
                                  isThu ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700',
                                )}
                              >
                                Phiếu {String(voucher.voucher_type || '').toLowerCase()}
                              </span>
                              <span className="text-[15px] font-extrabold text-foreground">{formatMoney(voucher.amount)}</span>
                            </div>
                            <p className="mt-1 text-[12px] font-bold text-primary">Bill: {voucher.waybill_code || '—'}</p>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            <p>{formatDateTime(voucher.created_at)}</p>
                            <p className="font-bold text-foreground">{voucher.created_by_name || '—'}</p>
                          </div>
                        </div>
                        {voucher.note?.trim() && (
                          <p className="mt-2 text-[12px] text-foreground">
                            <span className="font-bold text-muted-foreground">Ghi chú: </span>
                            {voucher.note}
                          </p>
                        )}
                        {voucher.image_url && (
                          <a
                            href={voucher.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
                          >
                            <Banknote size={12} />
                            Xem ảnh đính kèm
                          </a>
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
