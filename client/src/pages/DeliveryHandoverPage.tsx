import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Loader2, PackageCheck, Search, Tag, Truck, UserCheck, Users, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import AssignDriverHandoverDialog from './delivery/handover/dialogs/AssignDriverHandoverDialog';
import HandoverConfirmDialog from './delivery/handover/dialogs/HandoverConfirmDialog';
import HandoverDetailDialog from './delivery/handover/dialogs/HandoverDetailDialog';
import type { AssignDriverHandoverFormState, BadgeConfig, FilterOption, HandoverFilters, HubSummary, ListResponse, TripSummary, UserSummary, WaybillHandoverDetail, WaybillHandoverItem, WaybillHandoverListResponse } from './delivery/handover/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;
const DRIVER = 4;
const defaultFilters: HandoverFilters = { keyword: '', statuses: [], driverIds: [], tripIds: [], originHubIds: [], destHubIds: [], paymentTypes: [], page: 1, limit: 10 };
const handoverStates = ['MANIFEST_CLOSED', 'IN_TRANSIT', 'AT_DEST_HUB'];

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đơn cần lấy', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Chờ bàn giao', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Đã bàn giao', className: 'bg-orange-50 text-orange-700 border-orange-200' },
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
const canHandover = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = <T,>(response: ListResponse<T> | T[], key?: 'users' | 'hubs' | 'trips') => Array.isArray(response) ? response : response.data || response.items || (key ? response[key] : undefined) || [];
const normalizeWaybills = (response: WaybillHandoverListResponse | WaybillHandoverItem[]) => Array.isArray(response) ? response : response.data || response.items || response.waybills || [];
const normalizeTotal = (response: WaybillHandoverListResponse | WaybillHandoverItem[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillHandoverItem) => String(waybill.current_state || '').toUpperCase();
const isHandoverable = (waybill: WaybillHandoverItem) => handoverStates.includes(normalizeStatus(waybill));
const formatHub = (hub: HubSummary | null | undefined, fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';
const formatDriver = (waybill: WaybillHandoverItem) => waybill.last_mile_driver?.name || waybill.driver?.name || waybill.last_mile_driver?.username || waybill.driver?.username || (waybill.last_mile_driver_id ? `Tài xế #${waybill.last_mile_driver_id}` : 'Chưa gán');
const driverLabel = (driver: UserSummary) => [driver.name || driver.username, driver.phone].filter(Boolean).join(' · ');
const routeLabel = (trip: TripSummary) => [trip.start_hub_id ? `Hub #${trip.start_hub_id}` : '', trip.end_hub_id ? `Hub #${trip.end_hub_id}` : ''].filter(Boolean).join(' → ') || `Chuyến #${trip.id}`;

const buildWaybillQuery = (filters: HandoverFilters) => {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
  if (filters.destHubIds.length) params.set('dest_hub_id', filters.destHubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  return params.toString();
};

export default function DeliveryHandoverPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<HandoverFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<HandoverFilters>(defaultFilters);
  const [waybills, setWaybills] = useState<WaybillHandoverItem[]>([]);
  const [drivers, setDrivers] = useState<UserSummary[]>([]);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [detailWaybill, setDetailWaybill] = useState<WaybillHandoverDetail | null>(null);
  const [assignWaybill, setAssignWaybill] = useState<WaybillHandoverItem | null>(null);
  const [confirmWaybill, setConfirmWaybill] = useState<WaybillHandoverItem | null>(null);
  const [formState, setFormState] = useState<AssignDriverHandoverFormState>({ driver_id: '', trip_id: '' });
  const [actionError, setActionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useMemo(getStoredUser, []);
  const hasHandoverPermission = canHandover(user?.role_mask ?? 0);

  const hubOptions = useMemo<FilterOption[]>(() => hubs.map(hub => ({ value: String(hub.id), label: [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` })), [hubs]);
  const driverOptions = useMemo<FilterOption[]>(() => drivers.map(driver => ({ value: String(driver.id), label: driverLabel(driver) })), [drivers]);
  const routeOptions = useMemo<FilterOption[]>(() => trips.map(trip => ({ value: String(trip.id), label: routeLabel(trip) })), [trips]);
  const activeFilterCount = filters.statuses.length + filters.driverIds.length + filters.tripIds.length + filters.originHubIds.length + filters.destHubIds.length + filters.paymentTypes.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const startItem = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const endItem = Math.min(total, filters.page * filters.limit);

  useEffect(() => { void fetchStaticData(); }, []);
  useEffect(() => { void fetchWaybills(); }, [filters]);

  const fetchStaticData = async () => {
    try {
      const [driverRes, hubRes, tripRes] = await Promise.all([
        apiRequest<ListResponse<UserSummary> | UserSummary[]>(`/users?role_mask=${DRIVER}`),
        apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active'),
        apiRequest<ListResponse<TripSummary> | TripSummary[]>('/trips?status=IN_TRANSIT,PLANNED&page=1&limit=100'),
      ]);
      setDrivers(normalizeList(driverRes, 'users'));
      setHubs(normalizeList(hubRes, 'hubs'));
      setTrips(normalizeList(tripRes, 'trips'));
    } catch { /* auxiliary filters stay optional */ }
  };

  const fetchWaybills = async () => {
    setIsLoading(true); setError('');
    try {
      const response = await apiRequest<WaybillHandoverListResponse | WaybillHandoverItem[]>(`/waybills?${buildWaybillQuery(filters)}`);
      const list = normalizeWaybills(response);
      const filtered = list.filter(waybill => (!filters.driverIds.length || filters.driverIds.includes(String(waybill.last_mile_driver_id || waybill.last_mile_driver?.id || waybill.driver?.id || ''))) && (!filters.tripIds.length || filters.tripIds.includes(String(waybill.trip_id || ''))));
      setWaybills(filtered);
      setTotal(normalizeTotal(response, filtered.length));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách vận đơn bàn giao.');
      setWaybills([]); setTotal(0);
    } finally { setIsLoading(false); }
  };

  const updateFilters = (patch: Partial<HandoverFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  const setFilterArray = (key: keyof Pick<HandoverFilters, 'statuses' | 'driverIds' | 'tripIds' | 'originHubIds' | 'destHubIds' | 'paymentTypes'>, value: string[]) => updateFilters({ [key]: value } as Partial<HandoverFilters>);
  const updateDraftArray = (key: keyof Pick<HandoverFilters, 'statuses' | 'driverIds' | 'tripIds' | 'originHubIds' | 'destHubIds' | 'paymentTypes'>, value: string[]) => setDraftFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => { setFilters(prev => ({ ...defaultFilters, keyword: prev.keyword, limit: prev.limit })); setDraftFilters(prev => ({ ...defaultFilters, keyword: prev.keyword, limit: prev.limit })); };
  const openFilterPanel = () => { setDraftFilters(filters); setIsFilterPanelOpen(true); };
  const applyMobileFilters = () => { setFilters({ ...draftFilters, page: 1 }); setIsFilterPanelOpen(false); };

  const openDetail = async (waybill: WaybillHandoverItem) => {
    setDetailWaybill(waybill);
    try { setDetailWaybill(await apiRequest<WaybillHandoverDetail>(`/waybills/${waybill.id}`)); } catch { /* keep row detail */ }
  };
  const openAssign = (waybill: WaybillHandoverItem) => { setAssignWaybill(waybill); setConfirmWaybill(null); setActionError(''); setFormState({ driver_id: String(waybill.last_mile_driver_id || ''), trip_id: String(waybill.trip_id || '') }); };
  const openConfirm = () => { setConfirmWaybill(assignWaybill); setAssignWaybill(null); setActionError(''); };
  const selectedDriver = drivers.find(driver => String(driver.id) === formState.driver_id) || null;
  const closeActionDialogs = () => { setAssignWaybill(null); setConfirmWaybill(null); setActionError(''); setIsSubmitting(false); };

  const submitHandover = async () => {
    if (!confirmWaybill || !formState.driver_id) return;
    setIsSubmitting(true); setActionError('');
    try {
      const routePayload: Record<string, string> = { driver_id: formState.driver_id };
      if (formState.trip_id) routePayload.trip_id = formState.trip_id;
      await apiRequest(`/waybills/${confirmWaybill.id}/route`, { method: 'PATCH', body: routePayload });
      await apiRequest(`/waybills/${confirmWaybill.id}/status`, { method: 'PATCH', body: { status: 'OUT_FOR_DELIVERY' } });
      closeActionDialogs();
      await fetchWaybills();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể bàn giao vận đơn cho tài xế.');
    } finally { setIsSubmitting(false); }
  };

  return <div className="h-full min-h-0 flex flex-col gap-2"><div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col"><div className="p-3 border-b border-border bg-card shrink-0 space-y-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => navigate(-1)} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button><div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div><button title="Mở bộ lọc" onClick={openFilterPanel} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>{activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}<div className="hidden flex-1 md:block" /><button disabled className="hidden h-10 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-bold text-white opacity-50 md:flex"><UserCheck size={16} /> Thêm</button></div><div className="hidden md:flex flex-wrap items-center gap-2"><FilterSelect multiple icon={Tag} placeholder="Trạng thái" options={statusOptions} value={filters.statuses} onValueChange={value => setFilterArray('statuses', value)} /><FilterSelect multiple icon={Users} placeholder="Tài xế" options={driverOptions} value={filters.driverIds} onValueChange={value => setFilterArray('driverIds', value)} /><FilterSelect multiple icon={Truck} placeholder="Tuyến giao" options={routeOptions} value={filters.tripIds} onValueChange={value => setFilterArray('tripIds', value)} /><FilterSelect multiple icon={Building2} placeholder="Bưu cục đi" options={hubOptions} value={filters.originHubIds} onValueChange={value => setFilterArray('originHubIds', value)} /><FilterSelect multiple icon={Building2} placeholder="Bưu cục đến" options={hubOptions} value={filters.destHubIds} onValueChange={value => setFilterArray('destHubIds', value)} /><FilterSelect multiple icon={CreditCard} placeholder="Thanh toán" options={paymentOptions} value={filters.paymentTypes} onValueChange={value => setFilterArray('paymentTypes', value)} /></div></div><div className="flex-1 min-h-0 overflow-auto custom-scrollbar">{isLoading ? <StateBlock icon={<Loader2 className="animate-spin" />} title="Đang tải vận đơn" description="Hệ thống đang lấy danh sách vận đơn có thể bàn giao." /> : error ? <StateBlock icon={<AlertTriangle />} title="Không tải được dữ liệu" description={error} /> : waybills.length === 0 ? <StateBlock icon={<PackageCheck />} title="Chưa có vận đơn" description="Không tìm thấy vận đơn phù hợp với bộ lọc hiện tại." /> : <><table className="hidden md:table min-w-[1280px] text-left border-collapse"><thead className="sticky top-0 z-10 bg-muted/40"><tr>{['Mã vận đơn','Người gửi','Người nhận','Hub đi','Hub đến','Trạng thái','Thanh toán','Cân nặng','Kích thước','TL quy đổi','Cước phí','Tài xế','Thao tác'].map(label => <th key={label} className="border-b border-r border-border px-4 py-3 text-[12px] font-black uppercase tracking-wider text-muted-foreground last:border-r-0">{label}</th>)}</tr></thead><tbody>{waybills.map(waybill => <WaybillRow key={waybill.id} waybill={waybill} hasHandoverPermission={hasHandoverPermission} onDetail={() => void openDetail(waybill)} onAssign={() => openAssign(waybill)} />)}</tbody></table><div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <WaybillCard key={waybill.id} waybill={waybill} hasHandoverPermission={hasHandoverPermission} onDetail={() => void openDetail(waybill)} onAssign={() => openAssign(waybill)} />)}</div></>}</div><div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between shrink-0"><div className="text-[12px] font-bold text-muted-foreground">{startItem}-{endItem}/Tổng: {total}</div><div className="flex items-center gap-2"><select value={filters.limit} onChange={event => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-9 rounded-lg border border-border bg-white px-2 text-[12px] font-bold"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select><button onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })} disabled={filters.page <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronLeft size={16} /></button><span className="rounded-lg bg-primary/10 px-3 py-2 text-[12px] font-black text-primary">{filters.page}/{totalPages}</span><button onClick={() => updateFilters({ page: Math.min(totalPages, filters.page + 1) })} disabled={filters.page >= totalPages} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronRight size={16} /></button></div></div></div><MobileFilterSheet isOpen={isFilterPanelOpen} filters={draftFilters} statusOptions={statusOptions} driverOptions={driverOptions} routeOptions={routeOptions} hubOptions={hubOptions} paymentOptions={paymentOptions} onChange={updateDraftArray} onClose={() => setIsFilterPanelOpen(false)} onApply={applyMobileFilters} /><HandoverDetailDialog isOpen={Boolean(detailWaybill)} waybill={detailWaybill} onClose={() => setDetailWaybill(null)} /><AssignDriverHandoverDialog isOpen={Boolean(assignWaybill)} waybill={assignWaybill} drivers={drivers} trips={trips} formState={formState} error={actionError} isSubmitting={isSubmitting} onChange={(key, value) => setFormState(prev => ({ ...prev, [key]: value }))} onSubmit={openConfirm} onClose={closeActionDialogs} /><HandoverConfirmDialog isOpen={Boolean(confirmWaybill)} waybill={confirmWaybill} driver={selectedDriver} formState={formState} error={actionError} isSubmitting={isSubmitting} onBack={() => { setAssignWaybill(confirmWaybill); setConfirmWaybill(null); }} onConfirm={() => void submitHandover()} onClose={closeActionDialogs} /></div>;
}

function WaybillRow({ waybill, hasHandoverPermission, onDetail, onAssign }: { waybill: WaybillHandoverItem; hasHandoverPermission: boolean; onDetail: () => void; onAssign: () => void }) {
  const disabled = !hasHandoverPermission || !isHandoverable(waybill);
  return <tr className="border-b border-border hover:bg-muted/20"><td className="px-4 py-3 border-r border-border text-[13px] font-black text-primary whitespace-nowrap">{waybill.waybill_code}</td><td className="px-4 py-3 border-r border-border text-[13px] max-w-[180px] truncate">{waybill.sender_info || '—'}</td><td className="px-4 py-3 border-r border-border text-[13px] max-w-[180px] truncate">{waybill.receiver_info || '—'}</td><td className="px-4 py-3 border-r border-border text-[13px] text-muted-foreground">{formatHub(waybill.origin_hub, waybill.origin_hub_id)}</td><td className="px-4 py-3 border-r border-border text-[13px] text-muted-foreground">{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</td><td className="px-4 py-3 border-r border-border"><Badge config={statusConfig[normalizeStatus(waybill)]} fallback={normalizeStatus(waybill)} /></td><td className="px-4 py-3 border-r border-border"><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /></td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.weight, ' kg')}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold whitespace-nowrap">{displayValue(waybill.length)} × {displayValue(waybill.width)} × {displayValue(waybill.height)}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.volumetric_weight, ' kg')}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.cost_amount, ' đ')}</td><td className="px-4 py-3 border-r border-border"><DriverBadge>{formatDriver(waybill)}</DriverBadge></td><td className="px-4 py-3"><div className="flex gap-1"><IconButton title="Xem chi tiết" onClick={onDetail}><Eye size={15} /></IconButton><IconButton title={disabled ? 'Không đủ điều kiện bàn giao' : 'Bàn giao'} onClick={onAssign} disabled={disabled}><UserCheck size={15} /></IconButton></div></td></tr>;
}
function WaybillCard({ waybill, hasHandoverPermission, onDetail, onAssign }: { waybill: WaybillHandoverItem; hasHandoverPermission: boolean; onDetail: () => void; onAssign: () => void }) { const disabled = !hasHandoverPermission || !isHandoverable(waybill); return <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-black text-primary">{waybill.waybill_code}</p><div className="mt-2 flex flex-wrap gap-2"><Badge config={statusConfig[normalizeStatus(waybill)]} fallback={normalizeStatus(waybill)} /><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /><DriverBadge>{formatDriver(waybill)}</DriverBadge></div></div><div className="flex gap-1"><IconButton title="Xem" onClick={onDetail}><Eye size={15} /></IconButton><IconButton title="Bàn giao" onClick={onAssign} disabled={disabled}><UserCheck size={15} /></IconButton></div></div><div className="mt-4 grid gap-2 text-[13px]"><MobileInfo label="Người gửi" value={waybill.sender_info || '—'} /><MobileInfo label="Người nhận" value={waybill.receiver_info || '—'} /><MobileInfo label="Hub đi" value={<HubBadge>{formatHub(waybill.origin_hub, waybill.origin_hub_id)}</HubBadge>} /><MobileInfo label="Hub đến" value={<HubBadge>{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</HubBadge>} /><MobileInfo label="Cân nặng" value={displayValue(waybill.weight, ' kg')} /><MobileInfo label="Kích thước" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} /><MobileInfo label="TL quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} /><MobileInfo label="Cước phí" value={displayValue(waybill.cost_amount, ' đ')} /></div></div>; }
function MobileFilterSheet({ isOpen, filters, statusOptions, driverOptions, routeOptions, hubOptions, paymentOptions, onChange, onClose, onApply }: { isOpen: boolean; filters: HandoverFilters; statusOptions: FilterOption[]; driverOptions: FilterOption[]; routeOptions: FilterOption[]; hubOptions: FilterOption[]; paymentOptions: FilterOption[]; onChange: (key: keyof Pick<HandoverFilters, 'statuses' | 'driverIds' | 'tripIds' | 'originHubIds' | 'destHubIds' | 'paymentTypes'>, value: string[]) => void; onClose: () => void; onApply: () => void }) { if (!isOpen) return null; return <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden"><button aria-label="Đóng bộ lọc" onClick={onClose} className="absolute inset-0 bg-slate-950/45" /><div className="relative max-h-[88vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-[14px] font-black text-foreground">Bộ lọc bàn giao</p><button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X size={18} /></button></div><div className="max-h-[68vh] space-y-3 overflow-auto p-4 custom-scrollbar"><FilterAccordion title="Trạng thái" options={statusOptions} value={filters.statuses} onChange={value => onChange('statuses', value)} /><FilterAccordion title="Tài xế" options={driverOptions} value={filters.driverIds} onChange={value => onChange('driverIds', value)} /><FilterAccordion title="Tuyến giao" options={routeOptions} value={filters.tripIds} onChange={value => onChange('tripIds', value)} /><FilterAccordion title="Bưu cục đi" options={hubOptions} value={filters.originHubIds} onChange={value => onChange('originHubIds', value)} /><FilterAccordion title="Bưu cục đến" options={hubOptions} value={filters.destHubIds} onChange={value => onChange('destHubIds', value)} /><FilterAccordion title="Loại thanh toán" options={paymentOptions} value={filters.paymentTypes} onChange={value => onChange('paymentTypes', value)} /></div><div className="border-t border-border p-4"><button onClick={onApply} className="h-11 w-full rounded-xl bg-primary text-[14px] font-black text-white">Áp dụng</button></div></div></div>; }
function FilterAccordion({ title, options, value, onChange }: { title: string; options: FilterOption[]; value: string[]; onChange: (value: string[]) => void }) { const [keyword, setKeyword] = useState(''); const filtered = options.filter(option => option.label.toLowerCase().includes(keyword.toLowerCase())); const allValues = options.map(option => option.value); const toggle = (optionValue: string) => onChange(value.includes(optionValue) ? value.filter(item => item !== optionValue) : [...value, optionValue]); return <details open className="rounded-2xl border border-border bg-muted/5"><summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-black text-foreground [&::-webkit-details-marker]:hidden">{title} ({value.length})</summary><div className="space-y-3 border-t border-border p-3"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm kiếm..." className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] outline-none" /></div><div className="flex items-center justify-between text-[12px] font-bold"><button onClick={() => onChange(allValues)} className="text-primary">Chọn tất cả</button><button onClick={() => onChange([])} className="text-muted-foreground">Xóa chọn</button></div><div className="grid gap-1">{filtered.map(option => <label key={option.value} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-white"><input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} className="h-4 w-4 rounded border-border" />{option.label}</label>)}</div></div></details>; }
function Badge({ config, fallback }: { config?: BadgeConfig; fallback: ReactNode }) { return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap', config?.className || 'bg-muted text-muted-foreground border-border')}>{config?.label || fallback}</span>; }
function HubBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">{children}</span>; }
function DriverBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">{children}</span>; }
function MobileInfo({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-bold text-foreground break-words">{value}</span></div>; }
function IconButton({ title, children, onClick, disabled = false }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) { return <button title={title} onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div></div>; }
