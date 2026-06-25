import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CheckSquare,
  Loader2,
  Phone,
  Receipt,
  Square,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';

type VendorTripPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface VendorOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

interface TripPayableRow {
  id: string | number;
  departure_time: string;
  status?: string | null;
  vendor?: VendorOption | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  license_plate?: string | null;
  manifest_id?: string | number | null;
  manifest_code?: string | null;
  start_hub?: { code?: string | null; name?: string | null } | null;
  end_hub?: { code?: string | null; name?: string | null } | null;
  total_payable: number;
  total_paid: number;
  total_remaining: number;
  total_receivable: number;
  fuel_cost: number;
  other_costs: number;
  estimated_profit: number;
  payment_status: VendorTripPaymentStatus;
}

interface LedgerResponse {
  items: TripPayableRow[];
  summary: {
    trip_count: number;
    total_payable: number;
    total_paid: number;
    total_receivable: number;
    estimated_profit: number;
  };
  meta?: { total?: number; page?: number; limit?: number; total_pages?: number };
}

const STATUS_LABELS: Record<VendorTripPaymentStatus, string> = {
  UNPAID: 'Chưa TT',
  PARTIAL: 'TT một phần',
  PAID: 'Đã TT',
};

const STATUS_CLASS: Record<VendorTripPaymentStatus, string> = {
  UNPAID: 'border-red-200 bg-red-50 text-red-700',
  PARTIAL: 'border-amber-200 bg-amber-50 text-amber-800',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const formatMoney = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FinanceVendorTripLedgerPage() {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [rows, setRows] = useState<TripPayableRow[]>([]);
  const [summary, setSummary] = useState<LedgerResponse['summary'] | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [month, setMonth] = useState(currentMonthValue());
  const [paymentStatus, setPaymentStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<VendorTripPaymentStatus>('PAID');
  const [bulkPaidAmount, setBulkPaidAmount] = useState('');
  const [detailRow, setDetailRow] = useState<TripPayableRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const periodQuery = useMemo(() => {
    const { from, to } = monthBounds(month);
    const params = new URLSearchParams({ from, to, limit: '200' });
    if (vendorId) params.set('vendor_id', vendorId);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    if (keyword.trim()) params.set('keyword', keyword.trim());
    return params.toString();
  }, [month, vendorId, paymentStatus, keyword]);

  const loadVendors = useCallback(async () => {
    try {
      const response = await apiRequest<{ items?: VendorOption[] } | VendorOption[]>('/vendors?status=ACTIVE&limit=100');
      setVendors(Array.isArray(response) ? response : response.items || []);
    } catch {
      setVendors([]);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<LedgerResponse>(`/vendors/trip-payables?${periodQuery}`);
      setRows(response.items || []);
      setSummary(response.summary || null);
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được sổ phải trả NCC.');
      setRows([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [periodQuery]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : rows.map((row) => String(row.id)));
  const toggleOne = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  async function submitBulkStatus() {
    if (!selectedIds.length) return;
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest('/vendors/trip-payables/payment-status', {
        method: 'PATCH',
        body: {
          trip_ids: selectedIds.map(Number),
          payment_status: bulkStatus,
          paid_amount: bulkPaidAmount.trim() ? Number(bulkPaidAmount) : undefined,
        },
      });
      setStatusDialogOpen(false);
      setBulkPaidAmount('');
      await loadLedger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-1">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => window.history.back()} className="h-10 w-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-black text-foreground">Sổ phải trả NCC & Lãi/lỗ chuyến xe</h1>
          <p className="text-[12px] font-medium text-muted-foreground">
            Chuyến đã khởi hành từ HN/HCM · Theo dõi chi NCC, phải thu và lãi/lỗ từng xe
          </p>
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => setStatusDialogOpen(true)}
            className="h-10 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90"
          >
            Cập nhật TT ({selectedIds.length})
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <FilterField label="NCC" className="min-w-[200px] flex-1">
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full h-10 rounded-lg border border-border px-3 text-[13px] font-medium">
            <option value="">Tất cả NCC</option>
            {vendors.map((vendor) => (
              <option key={String(vendor.id)} value={String(vendor.id)}>
                {vendor.name || vendor.code || `#${vendor.id}`}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Tháng">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border border-border px-3 text-[13px] font-medium" />
        </FilterField>
        <FilterField label="Trạng thái TT">
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="h-10 rounded-lg border border-border px-3 text-[13px] font-medium">
            <option value="">Tất cả</option>
            <option value="UNPAID">Chưa TT</option>
            <option value="PARTIAL">TT một phần</option>
            <option value="PAID">Đã TT</option>
          </select>
        </FilterField>
        <FilterField label="Tìm kiếm" className="min-w-[180px] flex-1">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="NCC, BKS, tài xế, SĐT..." className="w-full h-10 rounded-lg border border-border px-3 text-[13px]" />
        </FilterField>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
          <AlertTriangle className="mr-2 inline" size={16} />
          {error}
        </div>
      )}

      {summary && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={<Truck size={18} />} label="Số chuyến" value={String(summary.trip_count)} />
          <SummaryCard icon={<Receipt size={18} />} label="Tổng phải trả NCC" value={formatMoney(summary.total_payable)} />
          <SummaryCard icon={<Banknote size={18} />} label="Đã chi" value={formatMoney(summary.total_paid)} />
          <SummaryCard icon={<Building2 size={18} />} label="Tổng phải thu" value={formatMoney(summary.total_receivable)} />
          <SummaryCard
            icon={summary.estimated_profit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            label="Lãi/lỗ tạm tính"
            value={formatMoney(summary.estimated_profit)}
            highlight={summary.estimated_profit >= 0}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-2xl border border-border bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          {isLoading ? (
            <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={18} />
              Đang tải sổ phải trả...
            </div>
          ) : (
            <table className="w-full min-w-[1180px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <button type="button" onClick={toggleAll} className="text-slate-600">
                      {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">Ngày KH</th>
                  <th className="px-3 py-2 text-left">NCC</th>
                  <th className="px-3 py-2 text-left">Tài xế</th>
                  <th className="px-3 py-2 text-left">SĐT</th>
                  <th className="px-3 py-2 text-left">Tuyến / BKS</th>
                  <th className="px-3 py-2 text-right">Phải trả</th>
                  <th className="px-3 py-2 text-right">Đã chi</th>
                  <th className="px-3 py-2 text-right">Phải thu</th>
                  <th className="px-3 py-2 text-right">Lãi/lỗ</th>
                  <th className="px-3 py-2 text-center">TT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = String(row.id);
                  const selected = selectedIds.includes(id);
                  return (
                    <tr key={id} className={clsx('border-t border-border hover:bg-muted/20', selected && 'bg-blue-50/60')}>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => toggleOne(id)} className="text-slate-600">
                          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(row.departure_time)}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setDetailRow(row)} className="text-left font-extrabold text-primary hover:underline">
                          {row.vendor?.name || row.vendor?.code || '—'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-semibold">{row.driver_name || '—'}</td>
                      <td className="px-3 py-2.5">{row.driver_phone || '—'}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-bold">{row.license_plate || '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.start_hub?.code || '—'} → {row.end_hub?.code || '—'}
                          {row.manifest_code ? ` · ${row.manifest_code}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-red-600">{formatMoney(row.total_payable)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{formatMoney(row.total_paid)}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{formatMoney(row.total_receivable)}</td>
                      <td className={clsx('px-3 py-2.5 text-right font-extrabold', row.estimated_profit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                        {formatMoney(row.estimated_profit)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={clsx('inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold', STATUS_CLASS[row.payment_status])}>
                          {STATUS_LABELS[row.payment_status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!isLoading && !rows.length && (
            <p className="p-8 text-center text-[13px] text-muted-foreground">Không có chuyến xe phù hợp trong tháng đã chọn.</p>
          )}
        </div>
      </div>

      {statusDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-[15px] font-extrabold">Cập nhật trạng thái TT ({selectedIds.length} chuyến)</h3>
              <button type="button" onClick={() => setStatusDialogOpen(false)} className="rounded-lg p-2 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Trạng thái thanh toán</label>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as VendorTripPaymentStatus)} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] font-bold">
                  <option value="UNPAID">Chưa TT</option>
                  <option value="PARTIAL">TT một phần</option>
                  <option value="PAID">Đã TT</option>
                </select>
              </div>
              {bulkStatus === 'PARTIAL' && (
                <div>
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Số tiền đã chi (VNĐ)</label>
                  <input type="number" min={0} value={bulkPaidAmount} onChange={(e) => setBulkPaidAmount(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] font-bold" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button type="button" onClick={() => setStatusDialogOpen(false)} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold">
                Hủy
              </button>
              <button type="button" disabled={isSubmitting} onClick={() => void submitBulkStatus()} className="h-10 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-40 flex items-center gap-2">
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-border bg-white shadow-xl md:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-[11px] font-bold uppercase text-primary">Chi tiết chuyến · lãi/lỗ</p>
                <h3 className="text-[16px] font-extrabold">#{detailRow.id} · {detailRow.license_plate}</h3>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="rounded-lg p-2 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Detail label="Ngày khởi hành" value={formatDate(detailRow.departure_time)} icon={<CalendarDays size={14} />} />
              <Detail label="NCC" value={detailRow.vendor?.name || '—'} icon={<Building2 size={14} />} />
              <Detail label="Tài xế" value={detailRow.driver_name || '—'} icon={<User size={14} />} />
              <Detail label="SĐT" value={detailRow.driver_phone || '—'} icon={<Phone size={14} />} />
              <Detail label="Phải trả NCC" value={formatMoney(detailRow.total_payable)} />
              <Detail label="Đã chi" value={formatMoney(detailRow.total_paid)} />
              <Detail label="Còn phải trả" value={formatMoney(detailRow.total_remaining)} />
              <Detail label="Phải thu (cước)" value={formatMoney(detailRow.total_receivable)} />
              <Detail label="Chi nhiên liệu" value={formatMoney(detailRow.fuel_cost)} />
              <Detail label="Chi khác" value={formatMoney(detailRow.other_costs)} />
              <Detail label="Lãi/lỗ tạm tính" value={formatMoney(detailRow.estimated_profit)} highlight={detailRow.estimated_profit >= 0} />
              <Detail label="Trạng thái TT" value={STATUS_LABELS[detailRow.payment_status]} />
            </div>
            <div className="border-t border-border p-4">
              <button type="button" onClick={() => setDetailRow(null)} className="h-10 w-full rounded-lg bg-primary text-[13px] font-bold text-white">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', highlight ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-white')}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className={clsx('mt-2 text-[18px] font-black', highlight ? 'text-emerald-700' : 'text-foreground')}>{value}</p>
    </div>
  );
}

function Detail({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-slate-50 p-3">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={clsx('mt-1 text-[14px] font-extrabold', highlight ? 'text-emerald-700' : 'text-foreground')}>{value}</p>
    </div>
  );
}
