import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Loader2, Map, PackageCheck, Search, Tag, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterPanel } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import ConfirmHubDropoffDialog from './delivery/hub-dropoff/dialogs/ConfirmHubDropoffDialog';
import HubDropoffWaybillDetailDialog from './delivery/hub-dropoff/dialogs/HubDropoffWaybillDetailDialog';
import type { BadgeConfig, FilterOption, HubDropoffFilters, HubDropoffWaybill, HubDropoffWaybillDetail, HubSummary, ListResponse, TripSummary } from './delivery/hub-dropoff/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const WAREHOUSE = 1;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;
const defaultFilters: HubDropoffFilters = { keyword: '', statuses: ['IN_TRANSIT'], originHubIds: [], destHubIds: [], paymentTypes: [], tripIds: [], page: 1, limit: 10 };

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đơn cần lấy', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Đã đóng bảng kê', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Chặng cuối', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  DELIVERED: { label: 'Đã giao', className: 'bg-green-50 text-green-700 border-green-200' },
  RETURNED: { label: 'Hoàn hàng', className: 'bg-red-50 text-red-700 border-red-200' },
};
const paymentConfig: Record<string, BadgeConfig> = {
  PP: { label: 'PP', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  CC: { label: 'CC', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COD: { label: 'COD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};
const statusOptions = Object.entries(statusConfig).map(([value, config]) => ({ value, label: config.label }));
const paymentOptions = Object.entries(paymentConfig).map(([value, config]) => ({ value, label: config.label }));

const getStoredUser = (): AuthUserProfile | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};
const canConfirmHubDropoff = (roleMask: number) => (roleMask & (WAREHOUSE | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = <T,>(response: ListResponse<T> | T[], key?: 'hubs' | 'trips' | 'waybills') => Array.isArray(response) ? response : response.data || response.items || (key ? response[key] : undefined) || [];
const normalizeTotal = (response: ListResponse<HubDropoffWaybill> | HubDropoffWaybill[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: HubDropoffWaybill) => String(waybill.current_state || '').toUpperCase();
const isConfirmable = (waybill: HubDropoffWaybill) => normalizeStatus(waybill) === 'IN_TRANSIT';
const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  const value = query.toString();
  return value ? `?${value}` : '';
};

export default function DeliveryHubDropoffPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<HubDropoffFilters>(defaultFilters);
  const [waybills, setWaybills] = useState<HubDropoffWaybill[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [detailWaybill, setDetailWaybill] = useState<HubDropoffWaybillDetail | null>(null);
  const [confirmWaybill, setConfirmWaybill] = useState<HubDropoffWaybill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const user = useMemo(getStoredUser, []);
  const canConfirm = canConfirmHubDropoff(user?.role_mask ?? 0);
  const hubOptions = useMemo<FilterOption[]>(() => hubs.map(hub => ({ value: String(hub.id), label: [hub.code, hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` })), [hubs]);
  const tripOptions = useMemo<FilterOption[]>(() => trips.map(trip => ({ value: String(trip.id), label: `Chuyến #${trip.id} · ${trip.start_hub_id ?? '—'} → ${trip.end_hub_id ?? '—'}` })), [trips]);
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const activeFilterCount = filters.statuses.length + filters.originHubIds.length + filters.destHubIds.length + filters.paymentTypes.length + filters.tripIds.length;

  const formatHubById = (id?: string | number | null) => hubOptions.find(option => option.value === String(id))?.label || (id ? `Hub #${id}` : '—');
  const updateFilter = <K extends keyof HubDropoffFilters>(key: K, value: HubDropoffFilters[K]) => setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? value as number : 1 }));
  const clearFilters = () => setFilters(current => ({ ...defaultFilters, keyword: current.keyword, page: 1, limit: current.limit }));

  const fetchWaybills = async () => {
    setIsLoading(true); setError('');
    try {
      const query = buildQuery({
        keyword: filters.keyword.trim() || undefined,
        status: filters.statuses.join(',') || undefined,
        origin_hub_id: filters.originHubIds.join(',') || undefined,
        dest_hub_id: filters.destHubIds.join(',') || undefined,
        payment_type: filters.paymentTypes.join(',') || undefined,
        page: filters.page,
        limit: filters.limit,
      });
      const response = await apiRequest<ListResponse<HubDropoffWaybill> | HubDropoffWaybill[]>(`/waybills${query}`);
      const items = normalizeList(response, 'waybills');
      setWaybills(items);
      setTotal(normalizeTotal(response, items.length));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách vận đơn.');
      setWaybills([]); setTotal(0);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchWaybills(); }, [filters.keyword, filters.statuses, filters.originHubIds, filters.destHubIds, filters.paymentTypes, filters.page, filters.limit]);
  useEffect(() => {
    apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active').then(response => setHubs(normalizeList(response, 'hubs'))).catch(() => setHubs([]));
    apiRequest<ListResponse<TripSummary> | TripSummary[]>(`/trips${buildQuery({ status: 'IN_TRANSIT,ARRIVED', page: 1, limit: 100 })}`).then(response => setTrips(normalizeList(response, 'trips'))).catch(() => setTrips([]));
  }, []);

  const openDetail = async (waybill: HubDropoffWaybill) => {
    setDetailWaybill(waybill);
    try { setDetailWaybill(await apiRequest<HubDropoffWaybillDetail>(`/waybills/${waybill.id}`)); } catch { setDetailWaybill(waybill); }
  };
  const confirmDropoff = async () => {
    if (!confirmWaybill) return;
    setIsSubmitting(true); setActionError('');
    try {
      const updated = await apiRequest<HubDropoffWaybill>(`/waybills/${confirmWaybill.id}/status`, { method: 'PATCH', body: { status: 'AT_DEST_HUB' } });
      setWaybills(current => current.map(item => item.id === confirmWaybill.id ? { ...item, ...updated, current_state: updated.current_state || 'AT_DEST_HUB' } : item));
      setConfirmWaybill(null);
      fetchWaybills();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không xác nhận được hàng đến hub đích.'); }
    finally { setIsSubmitting(false); }
  };

  const filterPanelGroups = [
    { id: 'statuses', title: 'Trạng thái', icon: Tag, options: statusOptions, value: filters.statuses, searchPlaceholder: 'Tìm trạng thái', onChange: (value: string[]) => updateFilter('statuses', value) },
    { id: 'originHubIds', title: 'Bưu cục đi', icon: Building2, options: hubOptions, value: filters.originHubIds, searchPlaceholder: 'Tìm bưu cục đi', onChange: (value: string[]) => updateFilter('originHubIds', value) },
    { id: 'destHubIds', title: 'Bưu cục đến', icon: Map, options: hubOptions, value: filters.destHubIds, searchPlaceholder: 'Tìm bưu cục đến', onChange: (value: string[]) => updateFilter('destHubIds', value) },
    { id: 'paymentTypes', title: 'Loại thanh toán', icon: CreditCard, options: paymentOptions, value: filters.paymentTypes, searchPlaceholder: 'Tìm loại thanh toán', onChange: (value: string[]) => updateFilter('paymentTypes', value) },
    { id: 'tripIds', title: 'Chuyến xe', icon: Truck, options: tripOptions, value: filters.tripIds, searchPlaceholder: 'Tìm chuyến xe', onChange: (value: string[]) => updateFilter('tripIds', value) },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary flex items-center justify-center"><ArrowLeft size={18} /></button>
            <div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilter('keyword', event.target.value)} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
            <button onClick={() => setIsFilterPanelOpen(true)} className="md:hidden h-10 w-10 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary flex items-center justify-center"><Filter size={18} /></button>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="order-last basis-full md:order-none md:basis-auto h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-600 hover:bg-red-100"><X size={14} className="inline mr-1" />Xóa {activeFilterCount} bộ lọc</button>}
            <div className="flex-1 hidden md:block" />
            <button disabled className="h-10 rounded-xl bg-primary/60 px-4 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60">+ Thêm</button>
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple placeholder="Trạng thái" icon={Tag} options={statusOptions} value={filters.statuses} onValueChange={value => updateFilter('statuses', value)} />
            <FilterSelect multiple placeholder="Bưu cục đi" icon={Building2} options={hubOptions} value={filters.originHubIds} onValueChange={value => updateFilter('originHubIds', value)} />
            <FilterSelect multiple placeholder="Bưu cục đến" icon={Map} options={hubOptions} value={filters.destHubIds} onValueChange={value => updateFilter('destHubIds', value)} />
            <FilterSelect multiple placeholder="Thanh toán" icon={CreditCard} options={paymentOptions} value={filters.paymentTypes} onValueChange={value => updateFilter('paymentTypes', value)} />
            <FilterSelect multiple placeholder="Chuyến xe" icon={Truck} options={tripOptions} value={filters.tripIds} onValueChange={value => updateFilter('tripIds', value)} />
          </div>
        </div>

        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải vận đơn" description="Hệ thống đang lấy dữ liệu vận đơn tại hub đích." /> : error ? <StateBlock icon={<PackageCheck size={22} />} title="Không tải được dữ liệu" description={error} /> : !waybills.length ? <StateBlock icon={<PackageCheck size={22} />} title="Không có vận đơn" description="Không tìm thấy vận đơn phù hợp với bộ lọc hiện tại." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table className="hidden md:table min-w-[1280px] text-left border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{['Mã vận đơn','Người gửi','Người nhận','Hub đi','Hub đến','Trạng thái','Loại thanh toán','Cân nặng','Kích thước','TL quy đổi','Cước phí','Thao tác'].map(header => <th key={header} className="px-3 py-3 font-black">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{waybills.map(waybill => { const allowed = canConfirm && isConfirmable(waybill); return <tr key={waybill.id} className="hover:bg-muted/30"><Cell strong>{waybill.waybill_code}</Cell><Cell>{displayValue(waybill.sender_info)}</Cell><Cell>{displayValue(waybill.receiver_info)}</Cell><Cell><HubBadge>{formatHubById(waybill.origin_hub_id)}</HubBadge></Cell><Cell><HubBadge>{formatHubById(waybill.dest_hub_id)}</HubBadge></Cell><Cell>{renderStatus(waybill.current_state)}</Cell><Cell>{renderPayment(waybill.payment_type)}</Cell><Cell>{displayValue(waybill.weight, ' kg')}</Cell><Cell>{displayValue(waybill.length)} × {displayValue(waybill.width)} × {displayValue(waybill.height)}</Cell><Cell>{displayValue(waybill.volumetric_weight, ' kg')}</Cell><Cell>{displayValue(waybill.cost_amount)}</Cell><Cell><div className="flex gap-2"><IconButton title="Xem chi tiết" onClick={() => openDetail(waybill)}><Eye size={16} /></IconButton><IconButton title="Xác nhận đến hub đích" disabled={!allowed} onClick={() => { setActionError(''); setConfirmWaybill(waybill); }}><PackageCheck size={16} /></IconButton></div></Cell></tr>; })}</tbody>
            </table>
            <div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <MobileCard key={waybill.id} waybill={waybill} canUpdate={canConfirm && isConfirmable(waybill)} formatHub={formatHubById} openDetail={openDetail} openConfirm={() => { setActionError(''); setConfirmWaybill(waybill); }} />)}</div>
          </div>
        )}

        <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
          <span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (waybills.length ? 1 : 0)}–{(filters.page - 1) * filters.limit + waybills.length}</b>/Tổng:{total}</span>
          <div className="flex items-center gap-2"><select value={filters.limit} onChange={event => updateFilter('limit', Number(event.target.value))} className="h-8 rounded border border-border bg-card px-2 text-[12px] focus:outline-none">{[10, 20, 50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronRight size={15} /></button><span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div>
        </div>
      </div>
      <HubDropoffWaybillDetailDialog waybill={detailWaybill} onClose={() => setDetailWaybill(null)} formatHub={formatHubById} renderStatus={renderStatus} renderPayment={renderPayment} />
      <ConfirmHubDropoffDialog waybill={confirmWaybill} isSubmitting={isSubmitting} error={actionError} onClose={() => setConfirmWaybill(null)} onConfirm={confirmDropoff} />
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
    </div>
  );
}

function renderStatus(status?: string | null) { const key = String(status || '').toUpperCase(); return <Badge config={statusConfig[key]} fallback={key || '—'} />; }
function renderPayment(payment?: string | null) { const key = String(payment || '').toUpperCase(); return <Badge config={paymentConfig[key]} fallback={key || '—'} />; }
function Badge({ config, fallback }: { config?: BadgeConfig; fallback: ReactNode }) { return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap', config?.className || 'bg-muted text-muted-foreground border-border')}>{config?.label || fallback}</span>; }
function HubBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">{children}</span>; }
function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) { return <td className={clsx('px-3 py-3 align-top text-foreground', strong && 'font-black')}>{children}</td>; }
function IconButton({ title, children, onClick, disabled = false }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) { return <button title={title} onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div></div>; }
function MobileInfo({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-bold text-foreground break-words">{value}</span></div>; }
function MobileCard({ waybill, canUpdate, formatHub, openDetail, openConfirm }: { waybill: HubDropoffWaybill; canUpdate: boolean; formatHub: (id?: string | number | null) => string; openDetail: (waybill: HubDropoffWaybill) => void; openConfirm: () => void }) { return <div className="rounded-2xl border border-border bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-black text-foreground">{waybill.waybill_code}</div><div className="mt-1 flex flex-wrap gap-1">{renderStatus(waybill.current_state)}{renderPayment(waybill.payment_type)}</div></div><div className="flex gap-2"><IconButton title="Xem" onClick={() => openDetail(waybill)}><Eye size={16} /></IconButton><IconButton title="Xác nhận" disabled={!canUpdate} onClick={openConfirm}><PackageCheck size={16} /></IconButton></div></div><div className="mt-3 grid gap-2 text-[13px]"><MobileInfo label="Người gửi" value={displayValue(waybill.sender_info)} /><MobileInfo label="Người nhận" value={displayValue(waybill.receiver_info)} /><MobileInfo label="Hub đi" value={<HubBadge>{formatHub(waybill.origin_hub_id)}</HubBadge>} /><MobileInfo label="Hub đến" value={<HubBadge>{formatHub(waybill.dest_hub_id)}</HubBadge>} /><MobileInfo label="Cân nặng" value={displayValue(waybill.weight, ' kg')} /><MobileInfo label="Kích thước" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} /><MobileInfo label="TL quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} /><MobileInfo label="Cước phí" value={displayValue(waybill.cost_amount)} /></div></div>; }


