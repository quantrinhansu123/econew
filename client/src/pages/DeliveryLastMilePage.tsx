import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Loader2, Map, PackageOpen, Plus, Search, Tag, Truck, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterPanel } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import LastMileWaybillDetailDialog from './delivery/last-mile/dialogs/LastMileWaybillDetailDialog';
import UpdateDeliveryStatusDialog from './delivery/last-mile/dialogs/UpdateDeliveryStatusDialog';
import type { BadgeConfig, LastMileFilters, LastMileWaybill, LastMileWaybillDetail, FilterOption, HubSummary, ListResponse, TripSummary, UserSummary } from './delivery/last-mile/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DRIVER = 4;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;
const defaultFilters: LastMileFilters = { keyword: '', statuses: ['AT_DEST_HUB', 'OUT_FOR_DELIVERY'], driverIds: [], tripIds: [], routeIds: [], originHubIds: [], destHubIds: [], paymentTypes: [], page: 1, limit: 10 };

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
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
const canUpdateLastMile = (roleMask: number) => (roleMask & (DRIVER | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = <T,>(response: ListResponse<T> | T[], key?: 'users' | 'hubs' | 'trips' | 'waybills') => Array.isArray(response) ? response : response.data || response.items || (key ? response[key] : undefined) || [];
const normalizeTotal = (response: ListResponse<LastMileWaybill> | LastMileWaybill[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: LastMileWaybill) => String(waybill.current_state || '').toUpperCase();
const isUpdatable = (waybill: LastMileWaybill) => ['AT_DEST_HUB', 'OUT_FOR_DELIVERY'].includes(normalizeStatus(waybill));
const getDriverName = (waybill: LastMileWaybill) => waybill.last_mile_driver?.name || waybill.driver?.name || waybill.last_mile_driver?.username || waybill.driver?.username || (waybill.last_mile_driver_id ? `Tài xế #${waybill.last_mile_driver_id}` : '—');
const driverLabel = (driver: UserSummary) => [driver.name || driver.username, driver.phone].filter(Boolean).join(' · ');
const routeLabel = (trip: TripSummary) => [trip.start_hub_id ? `Hub #${trip.start_hub_id}` : '', trip.end_hub_id ? `Hub #${trip.end_hub_id}` : ''].filter(Boolean).join(' → ') || `Chuyến #${trip.id}`;

export default function DeliveryLastMilePage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<LastMileFilters>(defaultFilters);
  const [waybills, setWaybills] = useState<LastMileWaybill[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [drivers, setDrivers] = useState<UserSummary[]>([]);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [detailWaybill, setDetailWaybill] = useState<LastMileWaybillDetail | null>(null);
  const [statusWaybill, setStatusWaybill] = useState<LastMileWaybill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const user = useMemo(getStoredUser, []);
  const canUpdate = canUpdateLastMile(user?.role_mask ?? 0);

  const hubOptions = useMemo<FilterOption[]>(() => hubs.map(hub => ({ value: String(hub.id), label: [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` })), [hubs]);
  const driverOptions = useMemo<FilterOption[]>(() => drivers.map(driver => ({ value: String(driver.id), label: driverLabel(driver) })), [drivers]);
  const tripOptions = useMemo<FilterOption[]>(() => trips.map(trip => ({ value: String(trip.id), label: routeLabel(trip) })), [trips]);
  const routeOptions = tripOptions;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const activeFilterCount = filters.statuses.length + filters.driverIds.length + filters.tripIds.length + filters.routeIds.length + filters.originHubIds.length + filters.destHubIds.length + filters.paymentTypes.length;

  const formatHubById = (id?: string | number | null) => {
    const hub = hubs.find(item => String(item.id) === String(id));
    return hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : id ? `Hub #${id}` : '—';
  };

  const updateFilter = <K extends keyof LastMileFilters>(key: K, value: LastMileFilters[K]) => setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? value as number : 1 }));
  const clearFilters = () => setFilters(prev => ({ ...defaultFilters, keyword: prev.keyword, limit: prev.limit, page: 1 }));

  const buildWaybillQuery = () => {
    const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.statuses.length) params.set('status', filters.statuses.join(','));
    if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
    if (filters.destHubIds.length) params.set('dest_hub_id', filters.destHubIds.join(','));
    if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
    return params.toString();
  };

  const loadWaybills = async () => {
    setIsLoading(true); setError('');
    try {
      const response = await apiRequest<ListResponse<LastMileWaybill> | LastMileWaybill[]>(`/waybills?${buildWaybillQuery()}`);
      const items = normalizeList(response, 'waybills');
      setWaybills(items); setTotal(normalizeTotal(response, items.length));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Không tải được danh sách vận đơn chặng cuối.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadWaybills(); }, [filters]);
  useEffect(() => {
    Promise.allSettled([
      apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active'),
      apiRequest<ListResponse<UserSummary> | UserSummary[]>('/users?role_mask=4'),
      apiRequest<ListResponse<TripSummary> | TripSummary[]>('/trips?page=1&limit=100'),
    ]).then(([hubResult, driverResult, tripResult]) => {
      if (hubResult.status === 'fulfilled') setHubs(normalizeList(hubResult.value, 'hubs'));
      if (driverResult.status === 'fulfilled') setDrivers(normalizeList(driverResult.value, 'users'));
      if (tripResult.status === 'fulfilled') setTrips(normalizeList(tripResult.value, 'trips'));
    });
  }, []);

  const openDetail = async (waybill: LastMileWaybill) => {
    try { setDetailWaybill(await apiRequest<LastMileWaybillDetail>(`/waybills/${waybill.id}`)); }
    catch { setDetailWaybill(waybill); }
  };
  const confirmUpdateStatus = async (status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED') => {
    if (!statusWaybill) return;
    setIsSubmitting(true); setActionError('');
    try {
      await apiRequest(`/waybills/${statusWaybill.id}/status`, { method: 'PATCH', body: { status } });
      setStatusWaybill(null); await loadWaybills();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái vận đơn.'); }
    finally { setIsSubmitting(false); }
  };

  const filterPanelGroups = [
    { id: 'status', title: 'Trạng thái', icon: Tag, options: statusOptions, value: filters.statuses, onChange: (value: string[]) => updateFilter('statuses', value), searchPlaceholder: 'Tìm trạng thái' },
    { id: 'driver', title: 'Tài xế', icon: User, options: driverOptions, value: filters.driverIds, onChange: (value: string[]) => updateFilter('driverIds', value), searchPlaceholder: 'Tìm tài xế' },
    { id: 'route', title: 'Tuyến giao', icon: Map, options: routeOptions, value: filters.routeIds, onChange: (value: string[]) => updateFilter('routeIds', value), searchPlaceholder: 'Tìm tuyến' },
    { id: 'origin', title: 'Bưu cục đi', icon: Building2, options: hubOptions, value: filters.originHubIds, onChange: (value: string[]) => updateFilter('originHubIds', value), searchPlaceholder: 'Tìm bưu cục đi' },
    { id: 'dest', title: 'Bưu cục đến', icon: Building2, options: hubOptions, value: filters.destHubIds, onChange: (value: string[]) => updateFilter('destHubIds', value), searchPlaceholder: 'Tìm bưu cục đến' },
    { id: 'payment', title: 'Loại thanh toán', icon: CreditCard, options: paymentOptions, value: filters.paymentTypes, onChange: (value: string[]) => updateFilter('paymentTypes', value), searchPlaceholder: 'Tìm loại thanh toán' },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"><ArrowLeft size={16} />Quay lại</button>
            <div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilter('keyword', event.target.value)} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button onClick={() => setIsFilterPanelOpen(true)} className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground"><Filter size={16} /></button>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="order-last basis-full md:order-none md:basis-auto flex h-9 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-600"><X size={14} /> Xóa {activeFilterCount} bộ lọc</button>}
            <div className="flex-1" />
            <button disabled className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-black text-white opacity-50"><Plus size={16} />Thêm</button>
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple placeholder="Trạng thái" icon={Tag} options={statusOptions} value={filters.statuses} onValueChange={value => updateFilter('statuses', value)} />
            <FilterSelect multiple placeholder="Tài xế" icon={User} options={driverOptions} value={filters.driverIds} onValueChange={value => updateFilter('driverIds', value)} />
            <FilterSelect multiple placeholder="Tuyến giao" icon={Map} options={routeOptions} value={filters.routeIds} onValueChange={value => updateFilter('routeIds', value)} />
            <FilterSelect multiple placeholder="Bưu cục đi" icon={Building2} options={hubOptions} value={filters.originHubIds} onValueChange={value => updateFilter('originHubIds', value)} />
            <FilterSelect multiple placeholder="Bưu cục đến" icon={Building2} options={hubOptions} value={filters.destHubIds} onValueChange={value => updateFilter('destHubIds', value)} />
            <FilterSelect multiple placeholder="Thanh toán" icon={CreditCard} options={paymentOptions} value={filters.paymentTypes} onValueChange={value => updateFilter('paymentTypes', value)} />
          </div>
        </div>
        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải vận đơn" description="Hệ thống đang lấy danh sách vận đơn giao chặng cuối." /> : error ? <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} /> : !waybills.length ? <StateBlock icon={<PackageOpen size={24} />} title="Chưa có vận đơn" description="Không có vận đơn giao chặng cuối khớp bộ lọc hiện tại." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table className="hidden md:table min-w-[1280px] text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground"><tr>{['Mã vận đơn','Người gửi','Người nhận','Hub đi','Hub đến','Trạng thái','Thanh toán','Cân nặng','Kích thước','TL quy đổi','Cước phí','Thao tác'].map(header => <th key={header} className="border-b border-border px-3 py-3 font-black">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-border text-[13px]">{waybills.map(waybill => <tr key={waybill.id} className="hover:bg-muted/20"><Cell strong>{waybill.waybill_code}</Cell><Cell>{waybill.sender_info}</Cell><Cell>{waybill.receiver_info}</Cell><Cell><HubBadge>{formatHubById(waybill.origin_hub_id)}</HubBadge></Cell><Cell><HubBadge>{formatHubById(waybill.dest_hub_id)}</HubBadge></Cell><Cell>{renderStatus(waybill.current_state)}</Cell><Cell>{renderPayment(waybill.payment_type)}</Cell><Cell>{displayValue(waybill.weight, ' kg')}</Cell><Cell>{displayValue(waybill.length)} × {displayValue(waybill.width)} × {displayValue(waybill.height)}</Cell><Cell>{displayValue(waybill.volumetric_weight, ' kg')}</Cell><Cell>{displayValue(waybill.cost_amount)}</Cell><Cell><div className="flex items-center gap-2"><IconButton title="Xem chi tiết" onClick={() => openDetail(waybill)}><Eye size={16} /></IconButton>{canUpdate && isUpdatable(waybill) ? <button type="button" onClick={() => setStatusWaybill(waybill)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[12px] font-extrabold text-white hover:bg-emerald-700"><Truck size={14} />Giao hàng</button> : <IconButton title="Cập nhật trạng thái" disabled><Truck size={16} /></IconButton>}</div></Cell></tr>)}</tbody>
            </table>
            <div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <MobileCard key={waybill.id} waybill={waybill} canUpdate={canUpdate && isUpdatable(waybill)} formatHub={formatHubById} openDetail={openDetail} openUpdate={() => setStatusWaybill(waybill)} />)}</div>
          </div>
        )}
        <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
          <span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (waybills.length ? 1 : 0)}–{(filters.page - 1) * filters.limit + waybills.length}</b>/Tổng:{total}</span>
          <div className="flex items-center gap-2"><select value={filters.limit} onChange={event => updateFilter('limit', Number(event.target.value))} className="h-8 rounded border border-border bg-card px-2 text-[12px] focus:outline-none">{[10, 20, 50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronRight size={15} /></button><span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div>
        </div>
      </div>
      <LastMileWaybillDetailDialog waybill={detailWaybill} onClose={() => setDetailWaybill(null)} formatHub={formatHubById} renderStatus={renderStatus} renderPayment={renderPayment} />
      <UpdateDeliveryStatusDialog waybill={statusWaybill} isSubmitting={isSubmitting} error={actionError} onClose={() => setStatusWaybill(null)} onConfirm={confirmUpdateStatus} />
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
    </div>
  );
}

function renderStatus(status?: string | null) { const key = String(status || '').toUpperCase(); return <Badge config={statusConfig[key]} fallback={key || '—'} />; }
function renderPayment(payment?: string | null) { const key = String(payment || '').toUpperCase(); return <Badge config={paymentConfig[key]} fallback={key || '—'} />; }
function Badge({ config, fallback }: { config?: BadgeConfig; fallback: ReactNode }) { return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap', config?.className || 'bg-muted text-muted-foreground border-border')}>{config?.label || fallback}</span>; }
function HubBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">{children}</span>; }
function DriverBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">{children}</span>; }
function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) { return <td className={clsx('px-3 py-3 align-top text-foreground', strong && 'font-black')}>{children}</td>; }
function IconButton({ title, children, onClick, disabled = false }: { title: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) { return <button title={title} onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div></div>; }
function MobileInfo({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-bold text-foreground break-words">{value}</span></div>; }
function MobileCard({ waybill, canUpdate, formatHub, openDetail, openUpdate }: { waybill: LastMileWaybill; canUpdate: boolean; formatHub: (id?: string | number | null) => string; openDetail: (waybill: LastMileWaybill) => void; openUpdate: () => void }) { return <div className="rounded-2xl border border-border bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-black text-foreground">{waybill.waybill_code}</div><div className="mt-1 flex flex-wrap gap-1">{renderStatus(waybill.current_state)}{renderPayment(waybill.payment_type)}</div></div><div className="flex gap-2"><IconButton title="Xem" onClick={() => openDetail(waybill)}><Eye size={16} /></IconButton>{canUpdate ? <button type="button" onClick={openUpdate} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12px] font-extrabold text-white"><Truck size={14} />Giao hàng</button> : null}</div></div><div className="mt-3 grid gap-2 text-[13px]"><MobileInfo label="Người gửi" value={waybill.sender_info} /><MobileInfo label="Người nhận" value={waybill.receiver_info} /><MobileInfo label="Hub đi" value={<HubBadge>{formatHub(waybill.origin_hub_id)}</HubBadge>} /><MobileInfo label="Hub đến" value={<HubBadge>{formatHub(waybill.dest_hub_id)}</HubBadge>} /><MobileInfo label="Tài xế" value={<DriverBadge>{getDriverName(waybill)}</DriverBadge>} /><MobileInfo label="Cân nặng" value={displayValue(waybill.weight, ' kg')} /><MobileInfo label="Kích thước" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} /><MobileInfo label="TL quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} /><MobileInfo label="Cước phí" value={displayValue(waybill.cost_amount)} /></div></div>; }




