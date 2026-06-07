import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, Loader2, PieChart, Receipt, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { DayPicker } from '../components/ui/DayPicker';
import type { AuthUserProfile } from './login/types';
import type { WaybillCashVoucher } from './warehouse/inventory/dialogs/WaybillCashVoucherDialog';
import { computeVoucherMeta, filterCashVouchers, formatMoney, isDateInRange } from './warehouse/customers/utils/customerFinanceUtils';
import type { CashVoucherFilters } from './warehouse/customers/panels/CustomerCashVouchersPanel';

const USER_PROFILE_KEY = 'eco_user_profile';
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;
const MAX_LIMIT = '200';

type TrendTone = 'emerald' | 'red' | 'blue' | 'amber';
type TransactionType = 'income' | 'expense';

interface CashVoucherRow extends WaybillCashVoucher { customer_code?: string | null; ma_kh?: string | null; content?: string | null; waybill?: { ma_kh?: string | null } | null; }
interface VendorPaymentRow { id: string | number; vendor_id?: string | number; amount?: string | number | null; payment_date?: string | null; description?: string | null; created_at?: string | null; vendor?: { id?: string | number; code?: string | null; name?: string | null } | null; }
interface DashboardFilters extends CashVoucherFilters { keyword: string; maKh: string; vendorId: string; }
interface DashboardTransaction { id: string; type: TransactionType; source: 'Bill' | 'NCC'; date?: string | null; amount: number; title: string; subtitle: string; note?: string | null; }

const defaultFilters: DashboardFilters = { fromDate: '', toDate: '', voucherType: '', keyword: '', maKh: '', vendorId: '' };

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const canViewDashboard = (roleMask: number) => (roleMask & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
const toNumber = (value?: string | number | null) => Number(value) || 0;
const safePercent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');

function getMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromDate: first.toISOString().slice(0, 10), toDate: now.toISOString().slice(0, 10) };
}

function getDateKey(value?: string | null) {
  if (!value) return 'unknown';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getVoucherDate(voucher: CashVoucherRow) { return voucher.created_at; }

export default function FinanceCashflowDashboardPage() {
  const navigate = useNavigate();
  const user = useMemo(getStoredUser, []);
  const canView = canViewDashboard(user?.role_mask ?? 0);
  const monthRange = useMemo(getMonthRange, []);
  const [filters, setFilters] = useState<DashboardFilters>(() => ({ ...defaultFilters, ...monthRange }));
  const [billVouchers, setBillVouchers] = useState<CashVoucherRow[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPaymentRow[]>([]);
  const [vendorTotalAmount, setVendorTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');

    const billParams = new URLSearchParams({ limit: MAX_LIMIT });
    if (filters.maKh.trim()) billParams.set('ma_kh', filters.maKh.trim());
    if (filters.keyword.trim()) billParams.set('keyword', filters.keyword.trim());
    if (filters.fromDate) billParams.set('from_date', filters.fromDate);
    if (filters.toDate) billParams.set('to_date', filters.toDate);
    if (filters.voucherType) billParams.set('voucher_type', filters.voucherType);

    const vendorParams = new URLSearchParams({ limit: MAX_LIMIT });
    if (filters.vendorId.trim()) vendorParams.set('vendor_id', filters.vendorId.trim());
    if (filters.keyword.trim()) vendorParams.set('keyword', filters.keyword.trim());
    if (filters.fromDate) vendorParams.set('from_date', filters.fromDate);
    if (filters.toDate) vendorParams.set('to_date', filters.toDate);

    Promise.all([
      apiRequest<{ items?: CashVoucherRow[] }>(`/waybills/cash-vouchers?${billParams}`),
      apiRequest<{ items?: VendorPaymentRow[]; meta?: { total_amount?: number } }>(`/vendors/payments?${vendorParams}`),
    ])
      .then(([billResponse, vendorResponse]) => {
        if (cancelled) return;
        setBillVouchers(billResponse.items ?? []);
        setVendorPayments(vendorResponse.items ?? []);
        setVendorTotalAmount(vendorResponse.meta?.total_amount ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setBillVouchers([]);
        setVendorPayments([]);
        setVendorTotalAmount(0);
        setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu dashboard thu chi.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [canView, filters, reloadKey]);

  const filteredBillVouchers = useMemo(() => filterCashVouchers(billVouchers, filters) as CashVoucherRow[], [billVouchers, filters]);
  const filteredVendorPayments = useMemo(() => vendorPayments.filter((payment) => isDateInRange(payment.payment_date, filters.fromDate, filters.toDate)), [vendorPayments, filters.fromDate, filters.toDate]);
  const billMeta = useMemo(() => computeVoucherMeta(filteredBillVouchers), [filteredBillVouchers]);
  const vendorExpense = useMemo(() => filteredVendorPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0), [filteredVendorPayments]);
  const totalIncome = billMeta.total_thu ?? 0;
  const billExpense = billMeta.total_chi ?? 0;
  const totalExpense = billExpense + vendorExpense;
  const netCashflow = totalIncome - totalExpense;
  const totalMovement = totalIncome + totalExpense;
  const collectionRate = safePercent(totalIncome, totalMovement);
  const expenseRate = safePercent(totalExpense, totalMovement);
  const billExpenseRate = safePercent(billExpense, totalExpense);
  const vendorExpenseRate = safePercent(vendorExpense, totalExpense);

  const transactions = useMemo<DashboardTransaction[]>(() => {
    const billRows = filteredBillVouchers.map((voucher) => {
      const isIncome = String(voucher.voucher_type || '').toLowerCase() === 'thu';
      const maKh = voucher.customer_code || voucher.ma_kh || voucher.waybill?.ma_kh || '—';
      return { id: `bill-${voucher.id}`, type: isIncome ? 'income' : 'expense', source: 'Bill', date: getVoucherDate(voucher), amount: toNumber(voucher.amount), title: `${isIncome ? 'Phiếu thu' : 'Phiếu chi'} bill ${voucher.waybill_code || '—'}`, subtitle: `Mã KH: ${maKh}`, note: voucher.note || voucher.content } satisfies DashboardTransaction;
    });
    const vendorRows = filteredVendorPayments.map((payment) => ({ id: `vendor-${payment.id}`, type: 'expense' as const, source: 'NCC' as const, date: payment.payment_date || payment.created_at, amount: toNumber(payment.amount), title: `Phiếu chi NCC ${payment.vendor?.code || payment.vendor?.name || `#${payment.vendor_id || '—'}`}`, subtitle: payment.vendor?.name || 'Thanh toán nhà cung cấp', note: payment.description }));
    return [...billRows, ...vendorRows].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 12);
  }, [filteredBillVouchers, filteredVendorPayments]);

  const dailyBars = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const voucher of filteredBillVouchers) {
      const key = getDateKey(getVoucherDate(voucher));
      const bucket = map.get(key) ?? { income: 0, expense: 0 };
      if (String(voucher.voucher_type || '').toLowerCase() === 'thu') bucket.income += toNumber(voucher.amount); else bucket.expense += toNumber(voucher.amount);
      map.set(key, bucket);
    }
    for (const payment of filteredVendorPayments) {
      const key = getDateKey(payment.payment_date || payment.created_at);
      const bucket = map.get(key) ?? { income: 0, expense: 0 };
      bucket.expense += toNumber(payment.amount);
      map.set(key, bucket);
    }
    const rows = [...map.entries()].filter(([key]) => key !== 'unknown').sort(([a], [b]) => a.localeCompare(b)).slice(-10).map(([key, value]) => ({ key, label: new Date(key).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), ...value }));
    const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));
    return rows.map((row) => ({ ...row, incomeHeight: Math.max(8, Math.round((row.income / maxValue) * 120)), expenseHeight: Math.max(8, Math.round((row.expense / maxValue) * 120)) }));
  }, [filteredBillVouchers, filteredVendorPayments]);

  if (!canView) {
    return <div className="min-h-[calc(100vh-104px)] bg-gradient-to-br from-blue-50 via-white to-slate-100"><div className="mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center rounded-3xl border border-amber-200 bg-white/90 p-8 text-center shadow-xl"><div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-700"><AlertTriangle size={28} /></div><h1 className="mt-4 text-2xl font-black text-slate-900">Không có quyền xem dashboard thu chi</h1><p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600">Trang này dành cho Kế toán, Quản lý hoặc Giám đốc.</p></div></div>;
  }

  return (
    <div className="min-h-[calc(100vh-104px)] bg-gradient-to-br from-blue-50 via-white to-slate-100 text-slate-900">
      <div className="w-full space-y-5">
        <header className="overflow-hidden rounded-[28px] border border-blue-100 bg-white/90 shadow-xl shadow-blue-100/50 backdrop-blur">
          <div className="relative p-5 md:p-6">
            <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-0 right-24 h-28 w-28 rounded-full bg-orange-400/10 blur-2xl" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <button type="button" onClick={() => navigate('/finance')} className="mb-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-blue-700 transition-colors duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"><ArrowLeft size={16} /> Tài chính kế toán</button>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-blue-700"><PieChart size={14} /> Cashflow command center</div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Dashboard thu chi</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">Theo dõi dòng tiền thu bill, chi bill và chi nhà cung cấp trong cùng một màn hình.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <DateFilter label="Từ ngày" value={filters.fromDate} onChange={(value) => setFilters((prev) => ({ ...prev, fromDate: value }))} />
                <DateFilter label="Đến ngày" value={filters.toDate} onChange={(value) => setFilters((prev) => ({ ...prev, toDate: value }))} />
                <button type="button" onClick={() => setFilters((prev) => ({ ...prev, ...monthRange }))} className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-blue-100 bg-white px-4 text-sm font-extrabold text-blue-700 transition-colors duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300">Tháng này</button>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={isLoading} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white transition-colors duration-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Tải lại</button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={<ArrowUpRight size={18} />} label="Tổng thu" value={formatMoney(totalIncome, '0 đ')} hint={`${filteredBillVouchers.filter((voucher) => String(voucher.voucher_type || '').toLowerCase() === 'thu').length} phiếu thu`} tone="emerald" />
          <KpiCard icon={<ArrowDownRight size={18} />} label="Tổng chi" value={formatMoney(totalExpense, '0 đ')} hint={`Bill ${formatMoney(billExpense, '0 đ')} · NCC ${formatMoney(vendorExpense, '0 đ')}`} tone="red" />
          <KpiCard icon={<TrendingUp size={18} />} label="Chênh lệch" value={formatMoney(netCashflow, '0 đ')} hint={netCashflow >= 0 ? 'Dòng tiền dương' : 'Dòng tiền âm'} tone={netCashflow >= 0 ? 'blue' : 'amber'} />
          <KpiCard icon={<Wallet size={18} />} label="Tỷ lệ thu" value={`${collectionRate}%`} hint={`Chiếm ${expenseRate}% là dòng chi`} tone="blue" />
        </section>

        {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}</div>}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Biểu đồ ngày</p><h2 className="text-lg font-black text-slate-950">Thu / chi 10 ngày gần nhất</h2></div><Banknote className="text-blue-600" size={22} /></div>
            {isLoading ? <LoadingBlock /> : dailyBars.length ? <div className="mt-6 flex h-44 items-end gap-3 overflow-x-auto pb-2">{dailyBars.map((row) => <div key={row.key} className="flex min-w-16 flex-1 flex-col items-center gap-2"><div className="flex h-32 items-end gap-1.5"><div className="w-4 rounded-t-lg bg-emerald-500" style={{ height: row.incomeHeight }} title={`Thu ${formatMoney(row.income, '0 đ')}`} /><div className="w-4 rounded-t-lg bg-red-500" style={{ height: row.expenseHeight }} title={`Chi ${formatMoney(row.expense, '0 đ')}`} /></div><span className="text-[11px] font-bold text-slate-500">{row.label}</span></div>)}</div> : <EmptyBlock text="Chưa có dữ liệu thu chi trong khoảng lọc." />}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Thu</span><span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-700"><span className="h-2 w-2 rounded-full bg-red-500" /> Chi</span></div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Cơ cấu dòng chi</p><h2 className="text-lg font-black text-slate-950">Bill và nhà cung cấp</h2></div><Receipt className="text-orange-500" size={22} /></div>
            <div className="mt-6 space-y-5"><RatioRow label="Chi bill" value={billExpense} percent={billExpenseRate} tone="amber" /><RatioRow label="Chi nhà cung cấp" value={vendorExpense} percent={vendorExpenseRate} tone="red" /><RatioRow label="Thu bill" value={totalIncome} percent={collectionRate} tone="emerald" /></div>
            <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-800">Tổng biến động: {formatMoney(totalMovement, '0 đ')} · Tổng chi NCC theo API: {formatMoney(vendorTotalAmount, '0 đ')}</div>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div><p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Giao dịch mới nhất</p><h2 className="text-lg font-black text-slate-950">Phiếu thu/chi bill và phiếu chi NCC</h2></div>
            <div className="flex flex-wrap gap-2"><input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="Tìm bill, NCC, ghi chú..." className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition-shadow focus:ring-2 focus:ring-blue-200 sm:w-64" /><select value={filters.voucherType} onChange={(event) => setFilters((prev) => ({ ...prev, voucherType: event.target.value as DashboardFilters['voucherType'] }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition-shadow focus:ring-2 focus:ring-blue-200"><option value="">Tất cả bill</option><option value="Thu">Phiếu thu</option><option value="Chi">Phiếu chi</option></select></div>
          </div>
          {isLoading ? <LoadingBlock /> : transactions.length ? <div className="divide-y divide-slate-100">{transactions.map((transaction) => <div key={transaction.id} className="flex flex-col gap-3 p-4 transition-colors duration-200 hover:bg-slate-50 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', transaction.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{transaction.type === 'income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-slate-950">{transaction.title}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold uppercase text-slate-600">{transaction.source}</span></div><p className="mt-1 text-xs font-bold text-blue-700">{transaction.subtitle}</p>{transaction.note && <p className="mt-1 text-xs font-medium text-slate-500">{transaction.note}</p>}</div></div><div className="text-left md:text-right"><p className={clsx('text-base font-black', transaction.type === 'income' ? 'text-emerald-700' : 'text-red-700')}>{transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount, '0 đ')}</p><p className="mt-1 text-xs font-bold text-slate-500">{formatDateTime(transaction.date)}</p></div></div>)}</div> : <EmptyBlock text="Không có giao dịch phù hợp bộ lọc." />}
        </section>
      </div>
    </div>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-extrabold text-slate-600"><CalendarDays size={14} className="text-blue-600" /><span>{label}</span><DayPicker value={value} onChange={onChange} className="h-8 min-w-28 bg-transparent text-sm font-black text-slate-900 outline-none" /></label>;
}

function KpiCard({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint: string; tone: TrendTone }) {
  const toneClass = { emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', red: 'bg-red-50 text-red-700 border-red-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', amber: 'bg-amber-50 text-amber-700 border-amber-100' }[tone];
  return <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-blue-200 hover:bg-blue-50/30"><div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{label}</p><div className={clsx('flex h-10 w-10 items-center justify-center rounded-2xl border', toneClass)}>{icon}</div></div><p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs font-bold text-slate-500">{hint}</p></div>;
}

function RatioRow({ label, value, percent, tone }: { label: string; value: number; percent: number; tone: 'emerald' | 'red' | 'amber' }) {
  const color = tone === 'emerald' ? 'bg-emerald-500' : tone === 'red' ? 'bg-red-500' : 'bg-amber-500';
  return <div><div className="flex items-center justify-between gap-3 text-sm font-bold"><span className="text-slate-700">{label}</span><span className="text-slate-950">{formatMoney(value, '0 đ')} · {percent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className={clsx('h-full rounded-full transition-all duration-300', color)} style={{ width: `${Math.min(100, percent)}%` }} /></div></div>;
}

function LoadingBlock() { return <div className="flex min-h-48 items-center justify-center gap-2 p-8 text-sm font-bold text-blue-700"><Loader2 className="animate-spin" size={18} /> Đang tải dữ liệu...</div>; }
function EmptyBlock({ text }: { text: string }) { return <div className="flex min-h-48 items-center justify-center p-8 text-center text-sm font-bold text-slate-500">{text}</div>; }
