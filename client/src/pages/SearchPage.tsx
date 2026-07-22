import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Loader2, MapPin, PackageSearch, Search, Tag, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterPanel, type FilterPanelGroup } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import SearchTripDetailDialog from './search/dialogs/SearchTripDetailDialog';
import SearchWaybillDetailDialog from './search/dialogs/SearchWaybillDetailDialog';
import type { FilterOption, HubSummary, ListResponse, SearchFilters, SearchResultItem, SearchResultType, TripDetail, WaybillDetail } from './search/types';

const SEARCH_DEBOUNCE_MS = 350;
const defaultFilters: SearchFilters = { keyword: '', type: 'ALL', statuses: [], originHubIds: [], destHubIds: [], paymentTypes: [], date_from: '', date_to: '', page: 1, limit: 10 };

const typeOptions: FilterOption[] = [
  { value: 'WAYBILL', label: 'Vận đơn' },
  { value: 'TRIP', label: 'Chuyến xe' },
];

const statusOptions: FilterOption[] = [
  { value: 'RECEIVED', label: 'Đã tiếp nhận' },
  { value: 'IN_WAREHOUSE', label: 'Trong kho' },
  { value: 'MANIFEST_CLOSED', label: 'Đã đóng bảng kê' },
  { value: 'IN_TRANSIT', label: 'Đang vận chuyển' },
  { value: 'AT_DEST_HUB', label: 'Đến bưu cục đích' },
  { value: 'OUT_FOR_DELIVERY', label: 'Đang phát' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'RETURNED', label: 'Hoàn' },
  { value: 'PLANNED', label: 'Đã lên kế hoạch' },
  { value: 'DEPARTED', label: 'Đã khởi hành' },
  { value: 'ARRIVED', label: 'Đã đến' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

const paymentOptions: FilterOption[] = [
  { value: 'PP', label: 'PP' },
  { value: 'CC', label: 'CC' },
  { value: 'COD', label: 'COD' },
];

const dateRangeOptions: FilterOption[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày gần nhất' },
  { value: '30d', label: '30 ngày gần nhất' },
];

const suggestionChips = ['Mã bill', 'Mã khách', 'Nội dung hàng', 'Người nhận', 'SĐT người nhận'];

const normalizeList = <T,>(response: ListResponse<T> | T[]) => Array.isArray(response) ? response : response.data || response.items || response.results || [];
const normalizeTotal = <T,>(response: ListResponse<T> | T[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const getErrorMessage = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Không thể tải dữ liệu.';

const buildQuery = (filters: SearchFilters) => {
  const params = new URLSearchParams();
  params.set('keyword', filters.keyword.trim());
  params.set('type', filters.type);
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
  if (filters.destHubIds.length) params.set('dest_hub_id', filters.destHubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  return params.toString();
};

const getResultCode = (item: SearchResultItem) => item.code || item.waybill_code || (item.type === 'TRIP' ? `TRIP-${item.id}` : `WB-${item.id}`);
const getResultStatus = (item: SearchResultItem) => item.status || item.current_state || '—';
const getResultTime = (item: SearchResultItem) => item.time || item.departure_time || item.created_at || null;
const getMatchedField = (item: SearchResultItem) => item.matched_field || item.matchedField || item.matched_fields?.join(', ') || '—';

const getDateRangeValue = (filters: SearchFilters) => {
  if (!filters.date_from && !filters.date_to) return [];
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const fromDate = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  };
  if (filters.date_from === toDate && filters.date_to === toDate) return ['today'];
  if (filters.date_from === fromDate(7) && filters.date_to === toDate) return ['7d'];
  if (filters.date_from === fromDate(30) && filters.date_to === toDate) return ['30d'];
  return ['custom'];
};

const resolveDateRange = (value: string) => {
  const today = new Date();
  const date_to = today.toISOString().slice(0, 10);
  if (value === 'today') return { date_from: date_to, date_to };
  const date = new Date(today);
  date.setDate(date.getDate() - (value === '30d' ? 30 : 7));
  return { date_from: date.toISOString().slice(0, 10), date_to };
};

const getRouteText = (item: SearchResultItem, hubMap: Map<string, HubSummary>) => {
  const start = item.origin_hub_id ?? item.start_hub_id;
  const end = item.dest_hub_id ?? item.end_hub_id;
  const startHub = start != null ? hubMap.get(String(start)) : null;
  const endHub = end != null ? hubMap.get(String(end)) : null;
  if (item.route) return item.route;
  if (start || end) return `${startHub?.code || start || '—'} → ${endHub?.code || end || '—'}`;
  return item.hub || item.hub_summary || '—';
};

function Badge({ children, tone = 'slate' }: { children: string; tone?: 'blue' | 'green' | 'amber' | 'slate' | 'purple' }) {
  return <span className={clsx('inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-extrabold', tone === 'blue' && 'bg-blue-50 text-blue-700', tone === 'green' && 'bg-emerald-50 text-emerald-700', tone === 'amber' && 'bg-amber-50 text-amber-700', tone === 'purple' && 'bg-purple-50 text-purple-700', tone === 'slate' && 'bg-slate-100 text-slate-700')}>{children}</span>;
}

function StateBlock({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return <div className="flex flex-1 min-h-[360px] items-center justify-center p-6"><div className="max-w-md text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">{icon}</div><p className="text-[15px] font-extrabold text-foreground">{title}</p><p className="mt-1 text-[13px] text-muted-foreground">{description}</p>{children}</div></div>;
}

function ResultCard({ item, hubMap, onOpen }: { item: SearchResultItem; hubMap: Map<string, HubSummary>; onOpen: (item: SearchResultItem) => void }) {
  const isWaybill = item.type === 'WAYBILL';
  const route = getRouteText(item, hubMap);
  const title = item.title || getResultCode(item);
  const description = item.description || item.subtitle || (isWaybill ? 'Vận đơn trong hệ thống ECO' : 'Chuyến xe vận tải');

  return (
    <article className="group rounded-2xl border border-border bg-white p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isWaybill ? 'blue' : 'purple'}>{item.type}</Badge>
            <Badge tone="green">{getResultStatus(item)}</Badge>
            <Badge tone="slate">{route}</Badge>
          </div>
          <div className="mt-3 flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
            <h3 className="truncate text-[16px] font-black text-foreground">{getResultCode(item)}</h3>
            <p className="truncate text-[13px] font-bold text-foreground/80">{title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{description}</p>
          <div className="mt-3 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-3">
            <Meta label="Thời gian" value={formatDateTime(getResultTime(item))} />
            <Meta label="Field khớp" value={getMatchedField(item)} />
            <Meta label={isWaybill ? 'Hub liên quan' : 'Tuyến xe'} value={route} />
          </div>
          {isWaybill && (
            <div className="mt-2 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
              <Meta label="Mã khách" value={item.customer_code || '—'} />
              <Meta label="Người nhận" value={item.receiver_name || '—'} />
              <Meta label="SĐT người nhận" value={item.receiver_phone || '—'} />
              <Meta label="Nội dung hàng" value={item.goods_content || '—'} />
            </div>
          )}
        </div>
        <button type="button" onClick={() => onOpen(item)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[13px] font-bold text-primary transition-colors hover:bg-primary/5">
          <Eye size={16} />
          Mở nhanh
        </button>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-bold text-foreground">{value}</p></div>;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [debouncedKeyword, setDebouncedKeyword] = useState(defaultFilters.keyword);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [waybillDetail, setWaybillDetail] = useState<WaybillDetail | null>(null);
  const [tripDetail, setTripDetail] = useState<TripDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const hubOptions = useMemo(() => hubs.map(hub => ({ value: String(hub.id), label: `${hub.code || hub.id} — ${hub.name || 'Bưu cục'}` })), [hubs]);
  const hubMap = useMemo(() => new Map(hubs.map(hub => [String(hub.id), hub])), [hubs]);
  const activeFilterCount = (filters.type !== 'ALL' ? 1 : 0) + filters.statuses.length + filters.originHubIds.length + filters.destHubIds.length + filters.paymentTypes.length + (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0);
  const hasValidKeyword = debouncedKeyword.trim().length >= 2;
  const hasSearchIntent = hasValidKeyword || activeFilterCount > 0;
  const hasShortKeyword = filters.keyword.trim().length === 1;


  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(filters.keyword), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.keyword]);
  const updateFilters = (patch: Partial<SearchFilters>) => setFilters(current => ({ ...current, ...patch, page: patch.page ?? 1 }));
  const clearFilters = () => setFilters(current => ({ ...defaultFilters, keyword: current.keyword, limit: current.limit }));

  useEffect(() => {
    let active = true;
    apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active')
      .then(response => { if (active) setHubs(normalizeList(response)); })
      .catch(() => { if (active) setHubs([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!hasSearchIntent) {
      queueMicrotask(() => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError('');
        setIsLoading(false);
      });
      return () => { active = false; };
    }

    queueMicrotask(() => {
      if (!active) return;
      setIsLoading(true);
      setError('');
    });
    apiRequest<ListResponse<SearchResultItem> | SearchResultItem[]>(`/search?${buildQuery({ ...filters, keyword: debouncedKeyword })}`)
      .then(response => {
        if (!active) return;
        const nextItems = normalizeList(response);
        setItems(nextItems);
        setTotal(normalizeTotal(response, nextItems.length));
      })
      .catch(error => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(getErrorMessage(error));
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [debouncedKeyword, filters, hasSearchIntent]);

  const openDetail = async (item: SearchResultItem) => {
    setDetailError('');
    setIsDetailLoading(true);
    if (item.type === 'WAYBILL') setWaybillDetail({ id: item.id });
    else setTripDetail({ id: item.id });
    try {
      if (item.type === 'WAYBILL') setWaybillDetail(await apiRequest<WaybillDetail>(`/waybills/${item.id}`));
      else setTripDetail(await apiRequest<TripDetail>(`/trips/${item.id}`));
    } catch (error) {
      setDetailError(getErrorMessage(error));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const filterPanelGroups: FilterPanelGroup[] = [
    { id: 'type', title: 'Loại kết quả', icon: Tag, options: typeOptions, value: filters.type === 'ALL' ? [] : [filters.type], onChange: value => updateFilters({ type: (value[0] as SearchResultType) || 'ALL' }) },
    { id: 'status', title: 'Trạng thái', icon: PackageSearch, options: statusOptions, value: filters.statuses, onChange: value => updateFilters({ statuses: value }) },
    { id: 'origin', title: 'Bưu cục đi', icon: MapPin, options: hubOptions, value: filters.originHubIds, onChange: value => updateFilters({ originHubIds: value }) },
    { id: 'dest', title: 'Bưu cục đến', icon: MapPin, options: hubOptions, value: filters.destHubIds, onChange: value => updateFilters({ destHubIds: value }) },
    { id: 'payment', title: 'Loại thanh toán', icon: CreditCard, options: paymentOptions, value: filters.paymentTypes, onChange: value => updateFilters({ paymentTypes: value }) },
    { id: 'date', title: 'Khoảng thời gian', icon: CalendarDays, options: dateRangeOptions, value: getDateRangeValue(filters), onChange: value => updateFilters(value[0] ? resolveDateRange(value[value.length - 1]) : { date_from: '', date_to: '' }) },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {error && <div className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600"><AlertTriangle size={16} />{error}</div>}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-bold text-foreground hover:bg-muted"><ArrowLeft size={16} />Quay lại</button>
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm mã bill, mã KH, nội dung hàng, người nhận, SĐT..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/10" />
            </div>
            <button type="button" onClick={() => setIsFilterPanelOpen(true)} className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"><Filter size={17} /></button>
            {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="order-last basis-full md:order-none md:basis-auto inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-red-100 bg-red-50 px-3 text-[13px] font-bold text-red-500 hover:bg-red-100"><X size={15} />Xóa {activeFilterCount} bộ lọc</button>}
            <div className="hidden md:block flex-1" />
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect icon={Tag} placeholder="Loại kết quả" options={[{ value: 'ALL', label: 'Tất cả' }, ...typeOptions]} value={filters.type} onValueChange={value => updateFilters({ type: value as SearchResultType })} />
            <FilterSelect multiple icon={PackageSearch} placeholder="Trạng thái" options={statusOptions} value={filters.statuses} onValueChange={value => updateFilters({ statuses: value })} />
            <FilterSelect multiple icon={MapPin} placeholder="Bưu cục đi" options={hubOptions} value={filters.originHubIds} onValueChange={value => updateFilters({ originHubIds: value })} />
            <FilterSelect multiple icon={MapPin} placeholder="Bưu cục đến" options={hubOptions} value={filters.destHubIds} onValueChange={value => updateFilters({ destHubIds: value })} />
            <FilterSelect multiple icon={CreditCard} placeholder="Thanh toán" options={paymentOptions} value={filters.paymentTypes} onValueChange={value => updateFilters({ paymentTypes: value })} />
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5"><CalendarDays size={15} className="text-muted-foreground" /><input type="date" value={filters.date_from} onChange={event => updateFilters({ date_from: event.target.value })} className="text-[12px] outline-none" /><span className="text-muted-foreground">→</span><input type="date" value={filters.date_to} onChange={event => updateFilters({ date_to: event.target.value })} className="text-[12px] outline-none" /></div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar bg-slate-50/40">
          {isLoading ? <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tìm kiếm" description="Hệ thống đang tải kết quả theo từ khóa và bộ lọc hiện tại." /> : !items.length ? (
            <StateBlock icon={<Search size={22} />} title={hasShortKeyword ? 'Nhập thêm ký tự' : hasSearchIntent ? 'Không tìm thấy kết quả' : 'Tra cứu toàn hệ thống'} description={hasShortKeyword ? 'Từ khóa cần tối thiểu 2 ký tự để bắt đầu tìm kiếm.' : hasSearchIntent ? 'Thử đổi từ khóa hoặc xóa bớt bộ lọc.' : 'Nhập mã bill, mã khách, nội dung hàng, người nhận hoặc SĐT người nhận để tra cứu.'}>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestionChips.map(chip => <span key={chip} className="rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-bold text-muted-foreground shadow-sm">{chip}</span>)}
              </div>
            </StateBlock>
          ) : (
            <div className="grid gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-primary">Kết quả tìm kiếm</p>
                  <p className="text-[13px] text-muted-foreground">Hiển thị kết quả phù hợp nhất, click để mở nhanh chi tiết.</p>
                </div>
                <Badge tone="slate">{`${total} kết quả`}</Badge>
              </div>
              {items.map(item => <ResultCard key={`${item.type}-${item.id}`} item={item} hubMap={hubMap} onOpen={openDetail} />)}
            </div>
          )}
        </div>

        {hasSearchIntent && <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
          <span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (items.length ? 1 : 0)}-{(filters.page - 1) * filters.limit + items.length}</b>/Tổng:{total}</span>
          <div className="flex items-center gap-2"><select value={filters.limit} onChange={event => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-8 rounded border border-border bg-card px-2 text-[12px] focus:outline-none">{[10, 20, 50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilters({ page: filters.page + 1 })} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronRight size={15} /></button><span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div>
        </div>}
      </div>
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
      <SearchWaybillDetailDialog item={waybillDetail} isLoading={isDetailLoading} error={detailError} onClose={() => { setWaybillDetail(null); setDetailError(''); }} />
      <SearchTripDetailDialog item={tripDetail} isLoading={isDetailLoading} error={detailError} onClose={() => { setTripDetail(null); setDetailError(''); }} />
    </div>
  );
}


