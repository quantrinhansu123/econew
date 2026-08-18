import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Filter, Loader2, Search, WalletCards } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { FilterPanel, type FilterPanelGroup } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import { ApiError, apiRequest } from '../lib/api';
import { formatMoney } from '../lib/formatMoney';
import CashFundManagerDialog from './finance/hub-reconciliation/dialogs/CashFundManagerDialog';
import ConfirmCodCollectionDialog from './finance/hub-reconciliation/dialogs/ConfirmCodCollectionDialog';
import type { CashFund, CodReconciliationWaybill, FilterOption, HubSummary, ListResponse } from './finance/hub-reconciliation/types';

interface Filters {
  keyword: string;
  hub_id: string;
  collection_status: '' | 'PENDING' | 'COLLECTED';
  date_from: string;
  date_to: string;
  page: number;
  limit: number;
}

const defaultFilters: Filters = {
  keyword: '',
  hub_id: '',
  collection_status: 'PENDING',
  date_from: '',
  date_to: '',
  page: 1,
  limit: 20,
};

const statusOptions: FilterOption[] = [
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'COLLECTED', label: 'Đã thu COD' },
];

const orderStatusLabels: Record<string, string> = {
  RECEIVED: 'Đã nhận đơn',
  IN_WAREHOUSE: 'Nhập kho',
  MANIFEST_CLOSED: 'Đã đóng bảng kê',
  LOADED: 'Đã lên xe',
  IN_TRANSIT: 'Đang vận chuyển',
  AT_DEST_HUB: 'Đã đến bưu cục',
  OUT_FOR_DELIVERY: 'Đang giao hàng',
  DELIVERED: 'Phát thành công',
  RETURNED: 'Hoàn hàng',
  CANCELLED: 'Đã hủy',
};

const normalizeList = <T,>(response: ListResponse<T> | T[]) => Array.isArray(response) ? response : response.items || response.data || response.results || [];
const normalizeTotal = <T,>(response: ListResponse<T> | T[], fallback: number) => Array.isArray(response) ? fallback : Number(response.meta?.total ?? response.total ?? fallback);
const getErrorMessage = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Không tải được dữ liệu.';
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
const displayDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

function buildQuery(filters: Filters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.hub_id) params.set('hub_id', filters.hub_id);
  if (filters.collection_status) params.set('collection_status', filters.collection_status);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  return params.toString();
}

export default function FinanceHubReconciliationPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [waybills, setWaybills] = useState<CodReconciliationWaybill[]>([]);
  const [funds, setFunds] = useState<CashFund[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [fundManagerOpen, setFundManagerOpen] = useState(false);
  const [confirmWaybill, setConfirmWaybill] = useState<CodReconciliationWaybill | null>(null);
  const [confirmFundId, setConfirmFundId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const pageCount = Math.max(1, Math.ceil(total / filters.limit));
  const hubOptions = useMemo(() => hubs.map((hub) => ({
    value: String(hub.id),
    label: [hub.code, hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}`,
  })), [hubs]);
  const activeFilterCount = Number(Boolean(filters.keyword.trim()))
    + Number(Boolean(filters.hub_id))
    + Number(Boolean(filters.collection_status))
    + Number(Boolean(filters.date_from || filters.date_to));

  const loadFunds = useCallback(async () => {
    const response = await apiRequest<ListResponse<CashFund> | CashFund[]>('/finance/cash-funds?include_inactive=true');
    setFunds(normalizeList(response));
  }, []);

  const loadReferences = useCallback(async () => {
    const [hubResponse] = await Promise.all([
      apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active').catch(() => [] as HubSummary[]),
      loadFunds(),
    ]);
    setHubs(normalizeList(hubResponse));
  }, [loadFunds]);

  const loadWaybills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<ListResponse<CodReconciliationWaybill> | CodReconciliationWaybill[]>(
        `/finance/hub-cod-waybills?${buildQuery(filters)}`,
      );
      const rows = normalizeList(response);
      setWaybills(rows);
      setTotal(normalizeTotal(response, rows.length));
    } catch (requestError) {
      setWaybills([]);
      setTotal(0);
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { queueMicrotask(() => void loadReferences()); }, [loadReferences]);
  useEffect(() => { queueMicrotask(() => void loadWaybills()); }, [loadWaybills]);

  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const clearFilters = () => setFilters((current) => ({ ...defaultFilters, collection_status: '', limit: current.limit }));
  const openConfirm = (waybill: CodReconciliationWaybill) => {
    setConfirmWaybill(waybill);
    setConfirmFundId('');
    setConfirmError('');
  };
  const confirmCollection = async () => {
    if (!confirmWaybill || !confirmFundId) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await apiRequest(`/waybills/${confirmWaybill.id}/cod-reconciliation`, {
        method: 'PATCH',
        body: { confirmed: true, fund_id: confirmFundId },
      });
      setConfirmWaybill(null);
      await Promise.all([loadWaybills(), loadFunds()]);
    } catch (requestError) {
      setConfirmError(getErrorMessage(requestError));
    } finally {
      setConfirming(false);
    }
  };

  const filterGroups: FilterPanelGroup[] = [
    { id: 'status', title: 'Trạng thái thu COD', icon: CheckCircle2, options: statusOptions, value: filters.collection_status ? [filters.collection_status] : [], searchPlaceholder: 'Tìm trạng thái...', onChange: (value) => updateFilters({ collection_status: (value[0] || '') as Filters['collection_status'], page: 1 }) },
    { id: 'hub', title: 'Bưu cục', icon: Building2, options: hubOptions, value: filters.hub_id ? [filters.hub_id] : [], searchPlaceholder: 'Tìm bưu cục...', onChange: (value) => updateFilters({ hub_id: value[0] || '', page: 1 }) },
  ];

  const pendingOnPage = waybills.filter((waybill) => !waybill.cod_reconciled_at).length;
  const collectedOnPage = waybills.filter((waybill) => Boolean(waybill.cod_reconciled_at)).length;
  const collectedAmountOnPage = waybills.reduce((sum, waybill) => sum + Number(waybill.cod_collected_amount || 0), 0);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline text-[13px] font-bold">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={(event) => updateFilters({ keyword: event.target.value, page: 1 })} placeholder="Tìm bill, mã KH, chuyến, bảng kê..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:border-primary" /></div>
            <button type="button" onClick={() => setFilterOpen(true)} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden" title="Bộ lọc"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
            <div className="hidden flex-1 md:block" />
            <button type="button" onClick={() => setFundManagerOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-blue-50 px-3 text-[13px] font-extrabold text-primary hover:bg-blue-100"><WalletCards size={16} /><span className="hidden sm:inline">Sổ quỹ</span></button>
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect placeholder="Trạng thái thu COD" icon={CheckCircle2} value={filters.collection_status} options={[{ value: '', label: 'Tất cả trạng thái' }, ...statusOptions]} onValueChange={(value: string) => updateFilters({ collection_status: value as Filters['collection_status'], page: 1 })} />
            <FilterSelect placeholder="Bưu cục" icon={Building2} value={filters.hub_id} options={[{ value: '', label: 'Tất cả bưu cục' }, ...hubOptions]} onValueChange={(value: string) => updateFilters({ hub_id: value, page: 1 })} />
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground"><CalendarDays size={15} /><input type="date" value={filters.date_from} onChange={(event) => updateFilters({ date_from: event.target.value, page: 1 })} className="bg-transparent outline-none" /><span>→</span><input type="date" value={filters.date_to} onChange={(event) => updateFilters({ date_to: event.target.value, page: 1 })} className="bg-transparent outline-none" /></div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border/70 pt-2 text-[12px] font-bold text-muted-foreground"><span>Chờ xác nhận: <b className="text-amber-700">{pendingOnPage}</b></span><span>Đã thu: <b className="text-emerald-700">{collectedOnPage}</b></span><span>Tiền đã xác nhận trên trang: <b className="text-foreground">{formatMoney(collectedAmountOnPage)}</b></span></div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {loading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải đơn phải thu" description="Hệ thống đang lấy các bill có tiền phải thu khi phát." />
            : error ? <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} />
              : !waybills.length ? <StateBlock icon={<WalletCards size={24} />} title="Không có đơn phù hợp" description="Không còn bill chờ xác nhận hoặc không có bill theo bộ lọc hiện tại." />
                : <>
                  <table className="hidden md:table w-full min-w-[1600px] text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600"><tr>{['Đơn hàng', 'Mã KH', 'Chuyến', 'Mã BK', 'Ngày gửi', 'Ngày giao', 'Cước', 'Cước thu ĐN', 'COD', 'Phải xác nhận', 'Tình trạng đơn', 'Thu COD', 'Sổ quỹ', 'Thao tác'].map((header) => <th key={header} className="border-b border-r border-border px-3 py-2.5 font-extrabold last:border-r-0">{header}</th>)}</tr></thead>
                    <tbody>{waybills.map((waybill) => <CodTableRow key={String(waybill.id)} waybill={waybill} onConfirm={() => openConfirm(waybill)} />)}</tbody>
                  </table>
                  <div className="grid gap-3 p-3 md:hidden">{waybills.map((waybill) => <CodMobileCard key={String(waybill.id)} waybill={waybill} onConfirm={() => openConfirm(waybill)} />)}</div>
                </>}
        </div>

        <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
          <span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (waybills.length ? 1 : 0)}-{(filters.page - 1) * filters.limit + waybills.length}</b>/Tổng:{total}</span>
          <div className="flex items-center gap-2"><select value={filters.limit} onChange={(event) => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-8 rounded border border-border bg-card px-2 text-[12px]">{[10, 20, 50, 100].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button type="button" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronLeft size={15} /></button><button type="button" disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronRight size={15} /></button><span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">{filters.page}</span><span>/ {pageCount}</span></div>
        </div>
      </div>

      <FilterPanel open={filterOpen} activeCount={activeFilterCount} groups={filterGroups} onClose={() => setFilterOpen(false)} onApply={() => setFilterOpen(false)} onClear={clearFilters} />
      <ConfirmCodCollectionDialog waybill={confirmWaybill} funds={funds} fundId={confirmFundId} submitting={confirming} error={confirmError} onFundChange={setConfirmFundId} onClose={() => setConfirmWaybill(null)} onSubmit={() => void confirmCollection()} onManageFunds={() => setFundManagerOpen(true)} />
      <CashFundManagerDialog open={fundManagerOpen} funds={funds} hubs={hubs} onClose={() => setFundManagerOpen(false)} onChanged={loadFunds} />
    </div>
  );
}

function CodTableRow({ waybill, onConfirm }: { waybill: CodReconciliationWaybill; onConfirm: () => void }) {
  const collected = Boolean(waybill.cod_reconciled_at);
  return <tr className="border-b border-border hover:bg-muted/20 text-[12px]"><td className="border-r border-border px-3 py-2.5 font-extrabold text-primary">{waybill.waybill_code || `#${waybill.id}`}</td><td className="border-r border-border px-3 py-2.5 font-bold">{waybill.ma_kh || '—'}</td><td className="border-r border-border px-3 py-2.5">{waybill.trip_id ? `Chuyến #${waybill.trip_id}` : '—'}</td><td className="border-r border-border px-3 py-2.5 font-bold">{waybill.manifest_code || '—'}</td><td className="border-r border-border px-3 py-2.5">{displayDate(waybill.sent_date)}</td><td className="border-r border-border px-3 py-2.5">{displayDate(waybill.delivered_at)}</td><MoneyCell value={waybill.freight_amount} /><MoneyCell value={waybill.cc_amount} /><MoneyCell value={waybill.cod_amount} tone="amber" /><MoneyCell value={waybill.collect_amount} tone="strong" /><td className="border-r border-border px-3 py-2.5"><OrderStatus value={waybill.current_state} /></td><td className="border-r border-border px-3 py-2.5">{collected ? <div><StatusBadge collected /><p className="mt-1 text-[10px] text-muted-foreground">{displayDateTime(waybill.cod_reconciled_at)}</p></div> : <StatusBadge />}</td><td className="border-r border-border px-3 py-2.5 font-bold">{collected ? [waybill.fund_code, waybill.fund_name].filter(Boolean).join(' · ') || '—' : '—'}</td><td className="px-3 py-2.5">{collected ? <span className="text-[11px] font-bold text-emerald-700">Đã xác nhận</span> : <button type="button" onClick={onConfirm} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 font-extrabold text-white"><CheckCircle2 size={13} />Xác nhận</button>}</td></tr>;
}

function CodMobileCard({ waybill, onConfirm }: { waybill: CodReconciliationWaybill; onConfirm: () => void }) {
  const collected = Boolean(waybill.cod_reconciled_at);
  return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-extrabold text-primary">{waybill.waybill_code || `#${waybill.id}`}</p><p className="mt-1 text-[11px] font-bold text-muted-foreground">{waybill.ma_kh || 'Không có mã KH'} · {waybill.trip_id ? `Chuyến #${waybill.trip_id}` : 'Chưa phân chuyến'}</p></div><StatusBadge collected={collected} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-[12px]"><Info label="Mã BK" value={waybill.manifest_code || '—'} /><Info label="Tình trạng đơn" value={orderStatusLabels[String(waybill.current_state || '')] || waybill.current_state || '—'} /><Info label="Ngày gửi" value={displayDate(waybill.sent_date)} /><Info label="Ngày giao" value={displayDate(waybill.delivered_at)} /><Info label="Cước" value={formatMoney(waybill.freight_amount)} /><Info label="COD" value={formatMoney(waybill.cod_amount)} /><Info label="Cước thu ĐN" value={formatMoney(waybill.cc_amount)} /><Info label="Phải xác nhận" value={formatMoney(waybill.collect_amount)} /></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3"><span className="text-[11px] font-bold text-muted-foreground">{collected ? `${waybill.fund_code || 'Quỹ'} · ${displayDateTime(waybill.cod_reconciled_at)}` : 'Chưa xác nhận tiền về quỹ'}</span>{!collected && <button type="button" onClick={onConfirm} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-extrabold text-white"><CheckCircle2 size={14} />Xác nhận</button>}</div></article>;
}

function MoneyCell({ value, tone }: { value?: string | number | null; tone?: 'amber' | 'strong' }) {
  return <td className={clsx('border-r border-border px-3 py-2.5 text-right font-bold tabular-nums', tone === 'amber' && 'text-amber-700', tone === 'strong' && 'bg-emerald-50/70 font-extrabold text-emerald-800')}>{formatMoney(value)}</td>;
}

function OrderStatus({ value }: { value?: string | null }) {
  return <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-extrabold text-sky-700">{orderStatusLabels[String(value || '')] || value || '—'}</span>;
}

function StatusBadge({ collected = false }: { collected?: boolean }) {
  return <span className={clsx('inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold', collected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{collected ? 'Đã thu COD' : 'Chờ xác nhận'}</span>;
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-muted/20 px-3 py-2"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>;
}

function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex min-h-[360px] flex-1 items-center justify-center p-6"><div className="max-w-md text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-primary">{icon}</div><p className="text-[15px] font-extrabold text-foreground">{title}</p><p className="mt-1 text-[13px] text-muted-foreground">{description}</p></div></div>;
}
