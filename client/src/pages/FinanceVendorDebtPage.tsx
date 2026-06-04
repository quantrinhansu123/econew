import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  ChevronDown,
  Loader2,
  Plus,
  Receipt,
  Truck,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';

interface VendorOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

interface DebtItem {
  id: string | number;
  code?: string | null;
  name?: string | null;
  payable_balance: number;
  total_incurred?: number;
  total_paid?: number;
  truck_count: number;
  license_plates: string[];
}

interface DebtReport {
  items: DebtItem[];
  grand_total: number;
}

interface TripRow {
  id: string | number;
  departure_time: string;
  status?: string;
  trip_cost: number;
  license_plate?: string | null;
  manifest_id?: string | number;
  manifest_code?: string | null;
}

interface DashboardData {
  vendor: VendorOption;
  period: { from: string | null; to: string | null };
  summary: {
    trip_count: number;
    license_plates: string[];
    total_incurred: number;
    total_paid: number;
  };
  balance: {
    total_incurred: number;
    total_paid: number;
    remaining_debt: number;
  };
  trips: TripRow[];
}

interface LedgerEntry {
  id: string;
  type: 'TRIP' | 'PAYMENT';
  date: string;
  amount: number;
  signed_amount: number;
  running_balance: number;
  description?: string | null;
  trip_id?: string | null;
  license_plate?: string | null;
  payment_id?: string | null;
  linked_trip_ids?: string[];
}

interface LedgerData {
  vendor_id: string;
  balance: { total_incurred: number; total_paid: number; remaining: number };
  entries: LedgerEntry[];
}

const formatMoney = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleString('vi-VN') : '—');

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

export default function FinanceVendorDebtPage() {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [report, setReport] = useState<DebtReport | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState(currentMonthValue());
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [activeTab, setActiveTab] = useState<'trips' | 'ledger'>('trips');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
    trip_ids: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const periodQuery = useMemo(() => {
    const { from, to } = monthBounds(month);
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [month]);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const [vendorRes, reportRes] = await Promise.all([
        apiRequest<{ items?: VendorOption[] }>('/vendors?status=ACTIVE&limit=100').catch(() => ({ items: [] })),
        apiRequest<DebtReport>(`/vendors/debt-report?${params}`),
      ]);
      const vendorList = Array.isArray(vendorRes) ? vendorRes : vendorRes.items || [];
      setVendors(vendorList);
      setReport(reportRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được báo cáo công nợ NCC.');
    } finally {
      setIsLoading(false);
    }
  }, [keyword]);

  const loadVendorDetail = useCallback(async (vendorId: string) => {
    if (!vendorId) {
      setDashboard(null);
      setLedger(null);
      return;
    }
    setIsDetailLoading(true);
    try {
      const [dash, led] = await Promise.all([
        apiRequest<DashboardData>(`/vendors/${vendorId}/debt-dashboard?${periodQuery}`),
        apiRequest<LedgerData>(`/vendors/${vendorId}/ledger?${periodQuery}`),
      ]);
      setDashboard(dash);
      setLedger(led);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải chi tiết NCC.');
    } finally {
      setIsDetailLoading(false);
    }
  }, [periodQuery]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadVendorDetail(selectedVendorId);
  }, [selectedVendorId, loadVendorDetail]);

  const selectedVendor = vendors.find((v) => String(v.id) === selectedVendorId);

  async function submitPayment() {
    if (!selectedVendorId || !paymentForm.amount) return;
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest(`/vendors/${selectedVendorId}/payments`, {
        method: 'POST',
        body: {
          payment_date: new Date(paymentForm.payment_date).toISOString(),
          amount: Number(paymentForm.amount),
          description: paymentForm.description.trim() || undefined,
          trip_ids: paymentForm.trip_ids.length ? paymentForm.trip_ids.map(Number) : undefined,
        },
      });
      setPaymentOpen(false);
      setPaymentForm({ payment_date: new Date().toISOString().slice(0, 10), amount: '', description: '', trip_ids: [] });
      await Promise.all([loadReport(), loadVendorDetail(selectedVendorId)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không ghi nhận được phiếu chi.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleTripInPayment(tripId: string) {
    setPaymentForm((prev) => ({
      ...prev,
      trip_ids: prev.trip_ids.includes(tripId)
        ? prev.trip_ids.filter((id) => id !== tripId)
        : [...prev.trip_ids, tripId],
    }));
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-1">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="h-10 w-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-black text-foreground">Công nợ & Thanh toán NCC</h1>
          <p className="text-[12px] font-medium text-muted-foreground">
            Lọc theo nhà xe · Bảng kê chuyến · Phiếu chi · Sổ cái dư nợ
          </p>
        </div>
        {selectedVendorId && (
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            className="h-10 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus size={16} />
            Ghi nhận thanh toán
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="text-[11px] font-bold uppercase text-muted-foreground">Nhà cung cấp</label>
          <div className="relative mt-1">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full h-10 rounded-lg border border-border pl-9 pr-8 text-[13px] font-medium appearance-none"
            >
              <option value="">— Chọn NCC để xem chi tiết —</option>
              {vendors.map((v) => (
                <option key={String(v.id)} value={String(v.id)}>
                  {v.name || v.code || `#${v.id}`}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase text-muted-foreground">Kỳ (tháng)</label>
          <div className="relative mt-1">
            <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-lg border border-border pl-9 pr-3 text-[13px] font-medium"
            />
          </div>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="text-[11px] font-bold uppercase text-muted-foreground">Tìm NCC</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="VD: Chiến"
            className="mt-1 w-full h-10 rounded-lg border border-border px-3 text-[13px]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
          <AlertTriangle className="mr-2 inline" size={16} />
          {error}
        </div>
      )}

      {dashboard && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={<Truck size={18} />} label="Số chuyến trong kỳ" value={String(dashboard.summary.trip_count)} sub={dashboard.summary.license_plates.join(', ') || '—'} />
          <SummaryCard icon={<Receipt size={18} />} label="Tổng cước phát sinh (kỳ)" value={formatMoney(dashboard.summary.total_incurred)} />
          <SummaryCard icon={<Banknote size={18} />} label="Đã thanh toán (kỳ)" value={formatMoney(dashboard.summary.total_paid)} />
          <SummaryCard
            icon={<Building2 size={18} />}
            label="Dư nợ còn lại"
            value={formatMoney(dashboard.balance.remaining_debt)}
            highlight
            sub={`Phát sinh: ${formatMoney(dashboard.balance.total_incurred)} · Đã trả: ${formatMoney(dashboard.balance.total_paid)}`}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-2 flex flex-col min-h-0 rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-slate-50">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-700">Tổng hợp NCC</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
                <Loader2 className="animate-spin mr-2" size={18} />
                Đang tải...
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">NCC</th>
                    <th className="px-3 py-2 text-right">Dư nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedVendorId(String(row.id))}
                      className={clsx(
                        'border-t border-border cursor-pointer hover:bg-muted/30',
                        String(row.id) === selectedVendorId && 'bg-blue-50',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-extrabold">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">{row.license_plates?.slice(0, 3).join(', ')}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-primary">{formatMoney(row.payable_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                {report && (
                  <tfoot className="bg-slate-50 font-extrabold sticky bottom-0">
                    <tr>
                      <td className="px-3 py-2.5 text-right">Tổng</td>
                      <td className="px-3 py-2.5 text-right text-primary">{formatMoney(report.grand_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col min-h-0 rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-slate-50">
            <button
              type="button"
              onClick={() => setActiveTab('trips')}
              className={clsx('h-9 rounded-lg px-3 text-[12px] font-bold', activeTab === 'trips' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}
            >
              Chuyến xe trong kỳ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={clsx('h-9 rounded-lg px-3 text-[12px] font-bold', activeTab === 'ledger' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}
            >
              Sổ cái (Ledger)
            </button>
            {selectedVendor && (
              <span className="ml-auto text-[12px] font-bold text-muted-foreground">{selectedVendor.name}</span>
            )}
          </div>

          {!selectedVendorId ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground p-6 text-center">
              Chọn nhà cung cấp bên trái để xem chuyến xe và sổ cái công nợ.
            </div>
          ) : isDetailLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={18} />
              Đang tải chi tiết...
            </div>
          ) : activeTab === 'trips' ? (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Ngày KH</th>
                    <th className="px-3 py-2">BKS</th>
                    <th className="px-3 py-2">Chuyến / Bảng kê</th>
                    <th className="px-3 py-2 text-right">Cước chuyến</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.trips.map((trip) => (
                    <tr key={String(trip.id)} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5">{formatDate(trip.departure_time)}</td>
                      <td className="px-3 py-2.5 font-bold">{trip.license_plate || '—'}</td>
                      <td className="px-3 py-2.5">
                        #{trip.id}
                        {trip.manifest_code ? ` · ${trip.manifest_code}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-primary">{formatMoney(trip.trip_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                {dashboard && (
                  <tfoot className="bg-amber-50 font-extrabold sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-right">
                        Tổng {dashboard.summary.trip_count} chuyến · {dashboard.summary.license_plates.length} BKS
                      </td>
                      <td className="px-3 py-2.5 text-right text-primary">{formatMoney(dashboard.summary.total_incurred)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {!dashboard?.trips.length && (
                <p className="p-6 text-center text-[13px] text-muted-foreground">Không có chuyến có cước trong kỳ này.</p>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Ngày</th>
                    <th className="px-3 py-2">Loại</th>
                    <th className="px-3 py-2">Diễn giải</th>
                    <th className="px-3 py-2 text-right">Phát sinh</th>
                    <th className="px-3 py-2 text-right">Dư nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger?.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={clsx(
                            'rounded-full border px-2 py-0.5 text-[11px] font-extrabold',
                            entry.type === 'TRIP' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {entry.type === 'TRIP' ? '+ Nợ' : '− Chi'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[240px] truncate" title={entry.description || ''}>
                        {entry.description || '—'}
                        {entry.license_plate ? ` · ${entry.license_plate}` : ''}
                        {entry.linked_trip_ids?.length ? ` · Trip: ${entry.linked_trip_ids.join(', ')}` : ''}
                      </td>
                      <td className={clsx('px-3 py-2.5 text-right font-bold', entry.signed_amount >= 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {entry.signed_amount >= 0 ? '+' : ''}
                        {formatMoney(entry.signed_amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-primary">{formatMoney(entry.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ledger?.entries.length && (
                <p className="p-6 text-center text-[13px] text-muted-foreground">Chưa có giao dịch trong kỳ.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {paymentOpen && dashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-[15px] font-extrabold">Phiếu chi — {selectedVendor?.name}</h3>
              <button type="button" onClick={() => setPaymentOpen(false)} className="rounded-lg p-2 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Ngày thanh toán</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))}
                  className="mt-1 w-full h-10 rounded-lg border border-border px-3 text-[13px]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="25000000"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1 w-full h-10 rounded-lg border border-border px-3 text-[13px] font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Ghi chú / Giải trình</label>
                <textarea
                  rows={2}
                  placeholder="Thanh toán cước xe tháng 5 cho nhà xe Chiến"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                />
              </div>
              {dashboard.trips.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Gắn chuyến xe (tùy chọn)</label>
                  <div className="mt-1 max-h-36 overflow-auto rounded-lg border border-border divide-y">
                    {dashboard.trips.map((trip) => (
                      <label key={String(trip.id)} className="flex items-center gap-2 px-3 py-2 text-[12px] cursor-pointer hover:bg-muted/30">
                        <input
                          type="checkbox"
                          checked={paymentForm.trip_ids.includes(String(trip.id))}
                          onChange={() => toggleTripInPayment(String(trip.id))}
                        />
                        <span className="font-bold">#{trip.id}</span>
                        <span className="text-muted-foreground">{trip.license_plate}</span>
                        <span className="ml-auto font-bold text-primary">{formatMoney(trip.trip_cost)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button type="button" onClick={() => setPaymentOpen(false)} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold">
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting || !paymentForm.amount}
                onClick={() => void submitPayment()}
                className="h-10 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-40 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                Lưu phiếu chi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', highlight ? 'border-primary/30 bg-blue-50' : 'border-border bg-white')}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className={clsx('mt-2 text-[20px] font-black', highlight ? 'text-primary' : 'text-foreground')}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}
