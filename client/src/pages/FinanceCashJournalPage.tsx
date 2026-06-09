import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  Loader2,
  Receipt,
  ShieldAlert,
  Trash2,
  Truck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { DayPicker } from '../components/ui/DayPicker';
import type { AuthUserProfile } from './login/types';
import type { WaybillCashVoucher } from './warehouse/inventory/dialogs/WaybillCashVoucherDialog';
import {
  computeVoucherMeta,
  filterCashVouchers,
  formatMoney,
  isDateInRange,
} from './warehouse/customers/utils/customerFinanceUtils';
import type { CashVoucherFilters } from './warehouse/customers/panels/CustomerCashVouchersPanel';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;

type JournalTab = 'bill' | 'vendor';
type AccessMode = 'both' | 'bill' | 'vendor';

export interface FinanceCashJournalPageProps {
  defaultTab?: JournalTab;
  pageTitle?: string;
  pageSubtitle?: string;
  hideTabs?: boolean;
  tripId?: string;
  netSummaryLabel?: string;
  accessMode?: AccessMode;
  enableVendorBulkDelete?: boolean;
}

interface CashVoucherRow extends WaybillCashVoucher {
  waybill?: { ma_kh?: string | null } | null;
}

interface VendorPaymentRow {
  id: string | number;
  vendor_id?: string | number;
  amount?: string | number | null;
  payment_date?: string | null;
  description?: string | null;
  created_at?: string | null;
  vendor?: { id?: string | number; code?: string | null; name?: string | null } | null;
  creator?: { name?: string | null; full_name?: string | null; username?: string | null } | null;
  trips?: Array<{ id?: string | number }> | null;
}

interface BillFilters extends CashVoucherFilters {
  keyword: string;
  maKh: string;
}

interface VendorPaymentFilters {
  fromDate: string;
  toDate: string;
  keyword: string;
  vendorId: string;
}

const defaultBillFilters: BillFilters = {
  fromDate: '',
  toDate: '',
  voucherType: '',
  keyword: '',
  maKh: '',
};

const defaultVendorFilters: VendorPaymentFilters = {
  fromDate: '',
  toDate: '',
  keyword: '',
  vendorId: '',
};

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

const canViewBill = (roleMask: number) => (roleMask & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
const canViewVendor = (roleMask: number) => (roleMask & (DISPATCHER | ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
const canViewProfit = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;

const resolveCanView = (roleMask: number, accessMode: AccessMode) => {
  if (accessMode === 'bill') return canViewProfit(roleMask);
  if (accessMode === 'vendor') return canViewVendor(roleMask);
  return canViewBill(roleMask) || canViewVendor(roleMask);
};

const accessDeniedMessage = (accessMode: AccessMode) => {
  if (accessMode === 'bill') return 'Trang lãi/lỗ tạm tính chỉ dành cho Quản lý hoặc Giám đốc.';
  if (accessMode === 'vendor') return 'Chi phí phát sinh chuyến chỉ dành cho Điều phối, Kế toán, Quản lý hoặc Giám đốc.';
  return 'Nhật ký thu chi chỉ dành cho Kế toán, Quản lý hoặc Giám đốc.';
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';

const formatDayLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function dayKey(value?: string | null) {
  if (!value) return 'unknown';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'blue' | 'slate' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-[18px] font-extrabold">{value}</p>
    </div>
  );
}

function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[320px] flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">{icon}</div>
        <p className="text-[15px] font-extrabold text-foreground">{title}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function FinanceCashJournalPage({
  defaultTab = 'bill',
  pageTitle = 'Nhật ký thu chi',
  pageSubtitle = 'Tổng hợp phiếu thu/chi bill và phiếu chi NCC',
  hideTabs = false,
  tripId,
  netSummaryLabel = 'Chênh lệch',
  accessMode = 'both',
  enableVendorBulkDelete = false,
}: FinanceCashJournalPageProps = {}) {
  const navigate = useNavigate();
  const user = useMemo(getStoredUser, []);
  const roleMask = user?.role_mask ?? 0;
  const canView = resolveCanView(roleMask, accessMode);
  const showBillTab = accessMode === 'both' || accessMode === 'bill';
  const showVendorTab = accessMode === 'both' || accessMode === 'vendor';

  const resolveInitialTab = (): JournalTab => {
    if (accessMode === 'vendor') return 'vendor';
    if (accessMode === 'bill') return 'bill';
    if (defaultTab === 'bill' && canViewBill(roleMask)) return 'bill';
    if (defaultTab === 'vendor' && canViewVendor(roleMask)) return 'vendor';
    if (canViewBill(roleMask)) return 'bill';
    if (canViewVendor(roleMask)) return 'vendor';
    return defaultTab;
  };

  const [activeTab, setActiveTab] = useState<JournalTab>(resolveInitialTab);
  const [billVouchers, setBillVouchers] = useState<CashVoucherRow[]>([]);
  const [billFilters, setBillFilters] = useState<BillFilters>(defaultBillFilters);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState('');

  const [vendorPayments, setVendorPayments] = useState<VendorPaymentRow[]>([]);
  const [vendorTotalAmount, setVendorTotalAmount] = useState(0);
  const [vendorFilters, setVendorFilters] = useState<VendorPaymentFilters>(defaultVendorFilters);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState('');
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [isDeletingPayments, setIsDeletingPayments] = useState(false);
  const [deletePaymentError, setDeletePaymentError] = useState('');

  const canDeleteVendorPayments = enableVendorBulkDelete && canViewVendor(roleMask);

  useEffect(() => {
    if (!canView || !showBillTab || activeTab !== 'bill') return;

    let cancelled = false;
    setBillLoading(true);
    setBillError('');

    const params = new URLSearchParams({ limit: '500' });
    if (billFilters.maKh.trim()) params.set('ma_kh', billFilters.maKh.trim());
    if (billFilters.keyword.trim()) params.set('keyword', billFilters.keyword.trim());
    if (billFilters.fromDate) params.set('from_date', billFilters.fromDate);
    if (billFilters.toDate) params.set('to_date', billFilters.toDate);
    if (billFilters.voucherType) params.set('voucher_type', billFilters.voucherType);

    apiRequest<{ items?: CashVoucherRow[] }>(`/waybills/cash-vouchers?${params}`)
      .then((response) => {
        if (cancelled) return;
        setBillVouchers(response.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setBillVouchers([]);
        setBillError(err instanceof ApiError ? err.message : 'Không tải được phiếu thu/chi bill.');
      })
      .finally(() => {
        if (!cancelled) setBillLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, showBillTab, activeTab, billFilters]);

  useEffect(() => {
    if (!canView || !showVendorTab || activeTab !== 'vendor') return;

    let cancelled = false;
    setVendorLoading(true);
    setVendorError('');

    const params = new URLSearchParams({ limit: '200' });
    if (vendorFilters.vendorId.trim()) params.set('vendor_id', vendorFilters.vendorId.trim());
    if (vendorFilters.keyword.trim()) params.set('keyword', vendorFilters.keyword.trim());
    if (vendorFilters.fromDate) params.set('from_date', vendorFilters.fromDate);
    if (vendorFilters.toDate) params.set('to_date', vendorFilters.toDate);
    if (tripId?.trim()) params.set('trip_id', tripId.trim());

    apiRequest<{ items?: VendorPaymentRow[]; meta?: { total_amount?: number } }>(`/vendors/payments?${params}`)
      .then((response) => {
        if (cancelled) return;
        setVendorPayments(response.items ?? []);
        setVendorTotalAmount(response.meta?.total_amount ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setVendorPayments([]);
        setVendorTotalAmount(0);
        setVendorError(err instanceof ApiError ? err.message : 'Không tải được phiếu chi NCC.');
      })
      .finally(() => {
        if (!cancelled) setVendorLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, showVendorTab, activeTab, vendorFilters, tripId, vendorReloadKey]);

  useEffect(() => {
    setSelectedPaymentIds(new Set());
  }, [vendorFilters, tripId, vendorReloadKey]);

  const filteredBillVouchers = useMemo(
    () => filterCashVouchers(billVouchers, billFilters),
    [billVouchers, billFilters],
  );
  const billMeta = useMemo(() => computeVoucherMeta(filteredBillVouchers), [filteredBillVouchers]);

  const filteredVendorPayments = useMemo(() => {
    return vendorPayments.filter((payment) => isDateInRange(payment.payment_date, vendorFilters.fromDate, vendorFilters.toDate));
  }, [vendorPayments, vendorFilters.fromDate, vendorFilters.toDate]);

  const vendorFilteredTotal = useMemo(
    () => filteredVendorPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [filteredVendorPayments],
  );

  const billGrouped = useMemo(() => {
    const map = new Map<string, { label: string; items: CashVoucherRow[] }>();
    for (const voucher of filteredBillVouchers) {
      const key = dayKey(voucher.created_at);
      const group = map.get(key) ?? { label: formatDayLabel(voucher.created_at), items: [] };
      group.items.push(voucher);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredBillVouchers]);

  const vendorGrouped = useMemo(() => {
    const map = new Map<string, { label: string; items: VendorPaymentRow[] }>();
    for (const payment of filteredVendorPayments) {
      const key = dayKey(payment.payment_date);
      const group = map.get(key) ?? { label: formatDayLabel(payment.payment_date), items: [] };
      group.items.push(payment);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredVendorPayments]);

  const visiblePaymentIds = useMemo(
    () => filteredVendorPayments.map((payment) => String(payment.id)),
    [filteredVendorPayments],
  );

  const allVisibleSelected =
    visiblePaymentIds.length > 0 && visiblePaymentIds.every((id) => selectedPaymentIds.has(id));

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedPaymentIds(() => {
      if (allVisibleSelected) return new Set();
      return new Set(visiblePaymentIds);
    });
  };

  const deleteSelectedPayments = async () => {
    const ids = [...selectedPaymentIds];
    if (!ids.length) return;
    if (!window.confirm(`Xóa ${ids.length} phiếu chi đã chọn?`)) return;

    setIsDeletingPayments(true);
    setDeletePaymentError('');
    try {
      await apiRequest('/vendors/payments/bulk-delete', { method: 'POST', body: { ids } });
      setSelectedPaymentIds(new Set());
      setVendorReloadKey((value) => value + 1);
    } catch (err) {
      setDeletePaymentError(err instanceof ApiError ? err.message : 'Không xóa được phiếu chi đã chọn.');
    } finally {
      setIsDeletingPayments(false);
    }
  };

  if (!canView) {
    return (
      <StateBlock
        icon={<ShieldAlert size={24} />}
        title="Không có quyền truy cập"
        description={accessDeniedMessage(accessMode)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-extrabold text-foreground">{pageTitle}</h1>
            <p className="text-[13px] text-muted-foreground">{pageSubtitle}</p>
            {tripId && (
              <p className="mt-1 text-[12px] font-bold text-primary">Đang lọc theo chuyến #{tripId}</p>
            )}
          </div>
        </div>

        {!hideTabs && accessMode === 'both' && (
          <div className="mt-4 flex gap-2 overflow-x-auto custom-scrollbar">
            {canViewBill(roleMask) && (
              <TabButton active={activeTab === 'bill'} onClick={() => setActiveTab('bill')} icon={<Receipt size={14} />}>
                Thu chi Bill
              </TabButton>
            )}
            {canViewVendor(roleMask) && (
              <TabButton active={activeTab === 'vendor'} onClick={() => setActiveTab('vendor')} icon={<Truck size={14} />}>
                Chi NCC
              </TabButton>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'bill' && showBillTab ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard label="Tổng thu" value={formatMoney(billMeta.total_thu, '0 đ')} tone="emerald" />
              <SummaryCard label="Tổng chi" value={formatMoney(billMeta.total_chi, '0 đ')} tone="red" />
              <SummaryCard label={netSummaryLabel} value={formatMoney(billMeta.net, '0 đ')} tone="blue" />
            </div>

            <FilterPanel title="Bộ lọc · Phiếu thu/chi Bill">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <FilterField label="Từ ngày">
                  <DayPicker value={billFilters.fromDate} onChange={(value) => setBillFilters((prev) => ({ ...prev, fromDate: value }))} className="h-10 w-full border-input text-[13px]" />
                </FilterField>
                <FilterField label="Đến ngày">
                  <DayPicker value={billFilters.toDate} onChange={(value) => setBillFilters((prev) => ({ ...prev, toDate: value }))} className="h-10 w-full border-input text-[13px]" />
                </FilterField>
                <FilterField label="Mã KH">
                  <input value={billFilters.maKh} onChange={(e) => setBillFilters((prev) => ({ ...prev, maKh: e.target.value }))} placeholder="Mã khách hàng..." className="h-10 w-full rounded-lg border border-border px-3 text-[13px]" />
                </FilterField>
                <FilterField label="Tìm kiếm">
                  <input value={billFilters.keyword} onChange={(e) => setBillFilters((prev) => ({ ...prev, keyword: e.target.value }))} placeholder="Số bill, ghi chú..." className="h-10 w-full rounded-lg border border-border px-3 text-[13px]" />
                </FilterField>
                <FilterField label="Loại phiếu">
                  <select value={billFilters.voucherType} onChange={(e) => setBillFilters((prev) => ({ ...prev, voucherType: e.target.value as BillFilters['voucherType'] }))} className="h-10 w-full rounded-lg border border-border px-3 text-[13px] font-bold">
                    <option value="">Tất cả</option>
                    <option value="Thu">Phiếu thu</option>
                    <option value="Chi">Phiếu chi</option>
                  </select>
                </FilterField>
              </div>
              {(billFilters.fromDate || billFilters.toDate || billFilters.voucherType || billFilters.keyword || billFilters.maKh) && (
                <button type="button" onClick={() => setBillFilters(defaultBillFilters)} className="mt-3 text-[12px] font-bold text-red-500 hover:underline">
                  × Xóa bộ lọc
                </button>
              )}
            </FilterPanel>

            {billLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
            ) : billError ? (
              <StateBlock icon={<AlertTriangle size={24} />} title="Lỗi tải dữ liệu" description={billError} />
            ) : billGrouped.length === 0 ? (
              <StateBlock icon={<Receipt size={24} />} title="Chưa có phiếu" description="Chưa có phiếu thu/chi bill phù hợp bộ lọc." />
            ) : (
              <GroupedBillList grouped={billGrouped} />
            )}
          </div>
        ) : showVendorTab ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Tổng đã chi NCC"
                value={formatMoney(vendorFilters.fromDate || vendorFilters.toDate || vendorFilters.keyword || vendorFilters.vendorId ? vendorFilteredTotal : vendorTotalAmount, '0 đ')}
                tone="red"
              />
              <SummaryCard label="Số phiếu" value={String(filteredVendorPayments.length)} tone="slate" />
            </div>

            <FilterPanel title="Bộ lọc · Phiếu chi NCC">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterField label="Từ ngày">
                  <DayPicker value={vendorFilters.fromDate} onChange={(value) => setVendorFilters((prev) => ({ ...prev, fromDate: value }))} className="h-10 w-full border-input text-[13px]" />
                </FilterField>
                <FilterField label="Đến ngày">
                  <DayPicker value={vendorFilters.toDate} onChange={(value) => setVendorFilters((prev) => ({ ...prev, toDate: value }))} className="h-10 w-full border-input text-[13px]" />
                </FilterField>
                <FilterField label="Mã / tên NCC">
                  <input value={vendorFilters.keyword} onChange={(e) => setVendorFilters((prev) => ({ ...prev, keyword: e.target.value }))} placeholder="Tìm NCC..." className="h-10 w-full rounded-lg border border-border px-3 text-[13px]" />
                </FilterField>
                <FilterField label="ID NCC">
                  <input value={vendorFilters.vendorId} onChange={(e) => setVendorFilters((prev) => ({ ...prev, vendorId: e.target.value }))} placeholder="vendor_id..." className="h-10 w-full rounded-lg border border-border px-3 text-[13px]" />
                </FilterField>
              </div>
              {(vendorFilters.fromDate || vendorFilters.toDate || vendorFilters.keyword || vendorFilters.vendorId) && (
                <button type="button" onClick={() => setVendorFilters(defaultVendorFilters)} className="mt-3 text-[12px] font-bold text-red-500 hover:underline">
                  × Xóa bộ lọc
                </button>
              )}
            </FilterPanel>

            {vendorLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
            ) : vendorError ? (
              <StateBlock icon={<AlertTriangle size={24} />} title="Lỗi tải dữ liệu" description={vendorError} />
            ) : vendorGrouped.length === 0 ? (
              <StateBlock icon={<Building2 size={24} />} title="Chưa có phiếu" description="Chưa có phiếu chi NCC phù hợp bộ lọc." />
            ) : (
              <>
                {canDeleteVendorPayments && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-bold text-foreground">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Chọn tất cả ({visiblePaymentIds.length})
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedPaymentIds.size > 0 && (
                        <span className="text-[12px] font-bold text-muted-foreground">
                          Đã chọn {selectedPaymentIds.size} phiếu
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={selectedPaymentIds.size === 0 || isDeletingPayments}
                        onClick={() => void deleteSelectedPayments()}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-[13px] font-extrabold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeletingPayments ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Xóa đã chọn
                      </button>
                    </div>
                  </div>
                )}
                {deletePaymentError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">
                    {deletePaymentError}
                  </div>
                )}
                <GroupedVendorList
                  grouped={vendorGrouped}
                  selectable={canDeleteVendorPayments}
                  selectedIds={selectedPaymentIds}
                  onToggleSelect={togglePaymentSelection}
                />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-bold transition-colors',
        active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-foreground hover:bg-muted/60',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function FilterPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">{title}</p>
      {children}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function GroupedBillList({ grouped }: { grouped: Array<[string, { label: string; items: CashVoucherRow[] }]> }) {
  return (
    <div className="space-y-4">
      {grouped.map(([key, group]) => {
        const dayThu = group.items.filter((v) => String(v.voucher_type).toLowerCase() === 'thu').reduce((sum, v) => sum + Number(v.amount || 0), 0);
        const dayChi = group.items.filter((v) => String(v.voucher_type).toLowerCase() === 'chi').reduce((sum, v) => sum + Number(v.amount || 0), 0);
        return (
          <section key={key} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-3">
              <p className="text-[13px] font-extrabold capitalize text-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Thu {formatMoney(dayThu, '0 đ')}</span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">Chi {formatMoney(dayChi, '0 đ')}</span>
              </div>
            </div>
            <div className="divide-y divide-border/70">
              {group.items.map((voucher) => {
                const isThu = String(voucher.voucher_type).toLowerCase() === 'thu';
                const maKh = voucher.waybill?.ma_kh || '—';
                return (
                  <div key={String(voucher.id)} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase', isThu ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
                            Phiếu {String(voucher.voucher_type || '').toLowerCase()}
                          </span>
                          <span className="text-[15px] font-extrabold text-foreground">{formatMoney(voucher.amount)}</span>
                        </div>
                        <p className="mt-1 text-[12px] font-bold text-primary">
                          Bill: {voucher.waybill_code || '—'} · Mã KH: {maKh}
                        </p>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <p>{formatDateTime(voucher.created_at)}</p>
                        <p className="font-bold text-foreground">{voucher.created_by_name || '—'}</p>
                      </div>
                    </div>
                    {voucher.note?.trim() && (
                      <p className="mt-2 text-[12px] text-foreground"><span className="font-bold text-muted-foreground">Ghi chú: </span>{voucher.note}</p>
                    )}
                    {voucher.image_url && (
                      <a href={voucher.image_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline">
                        <Banknote size={12} /> Xem ảnh đính kèm
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
  );
}

function GroupedVendorList({
  grouped,
  selectable = false,
  selectedIds,
  onToggleSelect,
}: {
  grouped: Array<[string, { label: string; items: VendorPaymentRow[] }]>;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (paymentId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {grouped.map(([key, group]) => {
        const dayTotal = group.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        return (
          <section key={key} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-3">
              <p className="text-[13px] font-extrabold capitalize text-foreground">{group.label}</p>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">Chi {formatMoney(dayTotal, '0 đ')}</span>
            </div>
            <div className="divide-y divide-border/70">
              {group.items.map((payment) => {
                const creator = payment.creator?.full_name || payment.creator?.name || payment.creator?.username || '—';
                const tripCount = payment.trips?.length ?? 0;
                const paymentId = String(payment.id);
                const isSelected = selectedIds?.has(paymentId) ?? false;
                return (
                  <div key={paymentId} className={clsx('px-4 py-3', isSelected && 'bg-primary/5')}>
                    <div className="flex flex-wrap items-start gap-3">
                      {selectable && onToggleSelect && (
                        <label className="mt-1 inline-flex shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(paymentId)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                        </label>
                      )}
                      <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-extrabold uppercase text-red-700">Phiếu chi</span>
                          <span className="text-[15px] font-extrabold text-foreground">{formatMoney(payment.amount, '0 đ')}</span>
                        </div>
                        <p className="mt-1 text-[12px] font-bold text-primary">
                          NCC: {payment.vendor?.code || payment.vendor?.name || `#${payment.vendor_id}`}
                        </p>
                        {tripCount > 0 && (
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">Liên kết {tripCount} chuyến xe</p>
                        )}
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <p>{formatDateTime(payment.payment_date)}</p>
                        <p className="font-bold text-foreground">{creator}</p>
                      </div>
                    </div>
                    {payment.description?.trim() && (
                      <p className="mt-2 text-[12px] text-foreground"><span className="font-bold text-muted-foreground">Ghi chú: </span>{payment.description}</p>
                    )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
