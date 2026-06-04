import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Loader2, PackageCheck, Plus, Route, Search, Tag, Truck } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterPanel } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import AssignRouteDialog from './delivery/routing/dialogs/AssignRouteDialog';
import WaybillRoutingDetailDialog from './delivery/routing/dialogs/WaybillRoutingDetailDialog';
import AddEditRouteDialog from './admin/routes/dialogs/AddEditRouteDialog';
import type { FilterOption as RouteFilterOption, RouteFormState } from './admin/routes/types';
import type { AssignRouteFormState, BadgeConfig, FilterOption, HubSummary, RoutingFilters, WaybillRoutingDetail, WaybillRoutingItem, WaybillRoutingListResponse } from './delivery/routing/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;
const defaultFilters: RoutingFilters = { keyword: '', statuses: [], originHubIds: [], destHubIds: [], paymentTypes: [], page: 1, limit: 10 };
const routeableStates = ['IN_WAREHOUSE', 'AT_DEST_HUB'];

const statusConfig: Record<string, BadgeConfig> = {
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  MANIFEST_CLOSED: { label: 'Chờ xuất chuyến', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  OUT_FOR_DELIVERY: { label: 'Chờ giao', className: 'bg-orange-50 text-orange-700 border-orange-200' },
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
const routeStatusFormOptions: RouteFilterOption[] = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];
const emptyRouteForm: RouteFormState = {
  code: '',
  name: '',
  hub_id: '',
  province: '',
  district: '',
  description: '',
  sort_order: '0',
  status: 'ACTIVE',
};

const getStoredUser = (): AuthUserProfile | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};
const canAssignRoute = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = (response: WaybillRoutingListResponse | WaybillRoutingItem[]) => Array.isArray(response) ? response : response.data || response.items || response.waybills || [];
const normalizeTotal = (response: WaybillRoutingListResponse | WaybillRoutingItem[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillRoutingItem) => String(waybill.current_state || '').toUpperCase();
const isRouteable = (waybill: WaybillRoutingItem) => routeableStates.includes(normalizeStatus(waybill));
const formatHub = (hub: HubSummary | null | undefined, fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';

const buildQuery = (filters: RoutingFilters) => {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
  if (filters.destHubIds.length) params.set('dest_hub_id', filters.destHubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  return params.toString();
};

export default function DeliveryRoutingPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<RoutingFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<RoutingFilters>(defaultFilters);
  const [waybills, setWaybills] = useState<WaybillRoutingItem[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [detailWaybill, setDetailWaybill] = useState<WaybillRoutingDetail | null>(null);
  const [assignWaybill, setAssignWaybill] = useState<WaybillRoutingItem | null>(null);
  const [formState, setFormState] = useState<AssignRouteFormState>({ route_code: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isRouteFormOpen, setIsRouteFormOpen] = useState(false);
  const [isRouteFormClosing, setIsRouteFormClosing] = useState(false);
  const [routeFormState, setRouteFormState] = useState<RouteFormState>(emptyRouteForm);
  const [routeFormSuccess, setRouteFormSuccess] = useState('');

  const user = useMemo(getStoredUser, []);
  const hasRoutePermission = canAssignRoute(user?.role_mask ?? 0);
  const hubOptions = useMemo<FilterOption[]>(() => hubs.map(hub => ({ value: String(hub.id), label: [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` })), [hubs]);
  const routeHubOptions = useMemo<RouteFilterOption[]>(
    () => [{ value: '', label: 'Không gán hub' }, ...hubOptions],
    [hubOptions],
  );
  const activeFilterCount = filters.statuses.length + filters.originHubIds.length + filters.destHubIds.length + filters.paymentTypes.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.limit));
  const startIndex = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const endIndex = Math.min(total, filters.page * filters.limit);

  useEffect(() => {
    let mounted = true;
    apiRequest<HubSummary[]>('/hubs/active').then(response => { if (mounted) setHubs(Array.isArray(response) ? response : []); }).catch(() => { if (mounted) setHubs([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError('');
    apiRequest<WaybillRoutingListResponse | WaybillRoutingItem[]>(`/waybills?${buildQuery(filters)}`)
      .then(response => {
        if (!mounted) return;
        const list = normalizeList(response);
        setWaybills(list);
        setTotal(normalizeTotal(response, list.length));
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách vận đơn.');
        setWaybills([]);
        setTotal(0);
      })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [filters]);

  const updateFilters = (patch: Partial<RoutingFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  const setFilterArray = (key: keyof Pick<RoutingFilters, 'statuses' | 'originHubIds' | 'destHubIds' | 'paymentTypes'>, value: string[]) => updateFilters({ [key]: value } as Partial<RoutingFilters>);
  const clearFilters = () => { const next = { ...defaultFilters, keyword: filters.keyword, limit: filters.limit }; setFilters(next); setDraftFilters(next); };
  const openFilterPanel = () => { setDraftFilters(filters); setIsFilterPanelOpen(true); };
  const applyMobileFilters = () => { setFilters({ ...draftFilters, page: 1 }); setIsFilterPanelOpen(false); };

  const openDetail = async (waybill: WaybillRoutingItem) => {
    setActionError('');
    try { setDetailWaybill(await apiRequest<WaybillRoutingDetail>(`/waybills/${waybill.id}`)); }
    catch { setDetailWaybill(waybill); }
  };
  const openAssign = (waybill: WaybillRoutingItem) => { setAssignWaybill(waybill); setFormState({ route_code: waybill.route_code || waybill.delivery_route || '' }); setActionError(''); };
  const submitAssignRoute = async () => {
    if (!assignWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/waybills/${assignWaybill.id}/route`, { method: 'PATCH', body: { route_code: formState.route_code.trim() } });
      setAssignWaybill(null);
      setFilters(prev => ({ ...prev }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể gán tuyến giao cho vận đơn.');
    } finally { setIsSubmitting(false); }
  };

  const openAddRoute = () => {
    setRouteFormState(emptyRouteForm);
    setRouteFormSuccess('');
    setActionError('');
    setIsRouteFormOpen(true);
  };

  const closeRouteForm = () => {
    setIsRouteFormClosing(true);
    window.setTimeout(() => {
      setIsRouteFormOpen(false);
      setIsRouteFormClosing(false);
    }, 280);
  };

  const submitNewRoute = async () => {
    setIsSubmitting(true);
    setActionError('');
    setRouteFormSuccess('');
    try {
      const created = await apiRequest<{ code: string }>('/routes', {
        method: 'POST',
        body: {
          code: routeFormState.code.trim(),
          name: routeFormState.name.trim(),
          hub_id: routeFormState.hub_id || undefined,
          province: routeFormState.province.trim() || undefined,
          district: routeFormState.district.trim() || undefined,
          description: routeFormState.description.trim() || undefined,
          sort_order: Number(routeFormState.sort_order) || 0,
          status: routeFormState.status || 'ACTIVE',
        },
      });
      setRouteFormSuccess(`Đã thêm tuyến ${created.code}. Có thể chọn mã này khi gán vận đơn.`);
      window.setTimeout(() => closeRouteForm(), 800);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể thêm tuyến mới.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filterGroups = (state: RoutingFilters, setter: (patch: Partial<RoutingFilters>) => void) => [
    { id: 'status', title: 'Trạng thái', icon: Tag, options: statusOptions, value: state.statuses, onChange: (value: string[]) => setter({ statuses: value }) },
    { id: 'origin', title: 'Bưu cục đi', icon: Building2, options: hubOptions, value: state.originHubIds, onChange: (value: string[]) => setter({ originHubIds: value }) },
    { id: 'dest', title: 'Bưu cục đến', icon: Truck, options: hubOptions, value: state.destHubIds, onChange: (value: string[]) => setter({ destHubIds: value }) },
    { id: 'payment', title: 'Loại thanh toán', icon: CreditCard, options: paymentOptions, value: state.paymentTypes, onChange: (value: string[]) => setter({ paymentTypes: value }) },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {routeFormSuccess && (
        <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-800">
          {routeFormSuccess}
        </div>
      )}
      {actionError && (
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
          <AlertTriangle size={16} />
          {actionError}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted md:w-auto md:px-3 md:gap-2"><ArrowLeft size={16} /><span className="hidden text-[13px] font-bold md:inline">Quay lại</span></button>
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10" />
            </div>
            <button title="Mở bộ lọc" onClick={openFilterPanel} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="order-last basis-full h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 hover:bg-red-100 md:order-none md:basis-auto md:h-10">× Xóa {activeFilterCount} bộ lọc</button>}
            <div className="hidden flex-1 md:block" />
            {hasRoutePermission && (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/admin/routes')}
                  className="hidden h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted sm:inline-flex"
                >
                  Danh mục tuyến
                </button>
                <button
                  type="button"
                  onClick={openAddRoute}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-extrabold text-white shadow-sm shadow-primary/20 hover:bg-primary/90"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Thêm tuyến</span>
                </button>
              </>
            )}
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple icon={Tag} placeholder="Trạng thái" options={statusOptions} value={filters.statuses} onValueChange={value => setFilterArray('statuses', value)} />
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục đi" options={hubOptions} value={filters.originHubIds} onValueChange={value => setFilterArray('originHubIds', value)} />
            <FilterSelect multiple icon={Truck} placeholder="Bưu cục đến" options={hubOptions} value={filters.destHubIds} onValueChange={value => setFilterArray('destHubIds', value)} />
            <FilterSelect multiple icon={CreditCard} placeholder="Loại thanh toán" options={paymentOptions} value={filters.paymentTypes} onValueChange={value => setFilterArray('paymentTypes', value)} />
          </div>
        </div>

        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={26} />} title="Đang tải vận đơn" description="Hệ thống đang lấy dữ liệu tách tuyến." /> : error ? <StateBlock icon={<AlertTriangle size={26} />} title="Không thể tải dữ liệu" description={error} /> : !waybills.length ? <StateBlock icon={<PackageCheck size={26} />} title="Không có vận đơn phù hợp" description="Thử đổi từ khóa hoặc bộ lọc để xem dữ liệu khác." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table className="hidden md:table min-w-[1280px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/40 text-[11px] font-black uppercase tracking-wider text-muted-foreground"><tr>{['Mã vận đơn','Người gửi','Người nhận','Hub đi','Hub đến','Trạng thái','Loại TT','Cân nặng','Kích thước','TL quy đổi','Cước phí','Thao tác'].map(label => <th key={label} className="border-b border-r border-border px-4 py-3 last:border-r-0">{label}</th>)}</tr></thead>
              <tbody>{waybills.map(waybill => <WaybillRow key={waybill.id} waybill={waybill} hasRoutePermission={hasRoutePermission} onDetail={() => openDetail(waybill)} onAssign={() => openAssign(waybill)} />)}</tbody>
            </table>
            <div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <WaybillCard key={waybill.id} waybill={waybill} hasRoutePermission={hasRoutePermission} onDetail={() => openDetail(waybill)} onAssign={() => openAssign(waybill)} />)}</div>
          </div>
        )}

        <div className="shrink-0 border-t border-border bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-muted-foreground">{startIndex}-{endIndex}/Tổng:{total}</span>
          <div className="flex items-center gap-2">
            <select value={filters.limit} onChange={event => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-9 rounded-lg border border-border bg-white px-2 text-[12px] font-bold"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
            <button onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })} disabled={filters.page <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="rounded-lg bg-primary/10 px-3 py-2 text-[12px] font-black text-primary">{filters.page}/{pageCount}</span>
            <button onClick={() => updateFilters({ page: Math.min(pageCount, filters.page + 1) })} disabled={filters.page >= pageCount} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
      <FilterPanel open={isFilterPanelOpen} title="Lọc vận đơn" activeCount={draftFilters.statuses.length + draftFilters.originHubIds.length + draftFilters.destHubIds.length + draftFilters.paymentTypes.length} groups={filterGroups(draftFilters, patch => setDraftFilters(prev => ({ ...prev, ...patch })))} onClose={() => setIsFilterPanelOpen(false)} onApply={applyMobileFilters} onClear={() => setDraftFilters({ ...defaultFilters, keyword: filters.keyword, limit: filters.limit })} />
      <WaybillRoutingDetailDialog isOpen={Boolean(detailWaybill)} waybill={detailWaybill} onClose={() => setDetailWaybill(null)} />
      <AssignRouteDialog isOpen={Boolean(assignWaybill)} waybill={assignWaybill} formState={formState} error="" isSubmitting={isSubmitting} onChange={value => setFormState({ route_code: value })} onSubmit={submitAssignRoute} onClose={() => setAssignWaybill(null)} />
      <AddEditRouteDialog
        isOpen={isRouteFormOpen}
        isClosing={isRouteFormClosing}
        isEditMode={false}
        isSubmitting={isSubmitting}
        formState={routeFormState}
        hubOptions={routeHubOptions}
        statusOptions={routeStatusFormOptions}
        onClose={closeRouteForm}
        onSubmit={() => void submitNewRoute()}
        onChange={(patch) => setRouteFormState(prev => ({ ...prev, ...patch }))}
      />
    </div>
  );
}

function WaybillRow({ waybill, hasRoutePermission, onDetail, onAssign }: { waybill: WaybillRoutingItem; hasRoutePermission: boolean; onDetail: () => void; onAssign: () => void }) {
  const disabled = !hasRoutePermission || !isRouteable(waybill);
  return <tr className="border-b border-border hover:bg-muted/20"><td className="px-4 py-3 border-r border-border text-[13px] font-extrabold text-primary">{waybill.waybill_code}</td><td className="px-4 py-3 border-r border-border text-[13px] font-medium max-w-[180px] truncate">{waybill.sender_info || '—'}</td><td className="px-4 py-3 border-r border-border text-[13px] font-medium max-w-[180px] truncate">{waybill.receiver_info || '—'}</td><td className="px-4 py-3 border-r border-border text-[13px] text-muted-foreground">{formatHub(waybill.origin_hub, waybill.origin_hub_id)}</td><td className="px-4 py-3 border-r border-border text-[13px] text-muted-foreground">{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</td><td className="px-4 py-3 border-r border-border"><Badge config={statusConfig[normalizeStatus(waybill)]} fallback={normalizeStatus(waybill)} /></td><td className="px-4 py-3 border-r border-border"><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /></td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.weight, ' kg')}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold whitespace-nowrap">{displayValue(waybill.length)} × {displayValue(waybill.width)} × {displayValue(waybill.height)}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.volumetric_weight, ' kg')}</td><td className="px-4 py-3 border-r border-border text-[13px] font-bold">{displayValue(waybill.cost_amount, ' đ')}</td><td className="px-4 py-3"><div className="flex gap-1"><IconButton title="Xem chi tiết" onClick={onDetail}><Eye size={15} /></IconButton><IconButton title={disabled ? 'Không đủ điều kiện gán tuyến' : 'Gán tuyến'} onClick={onAssign} disabled={disabled}><Route size={15} /></IconButton></div></td></tr>;
}

function WaybillCard({ waybill, hasRoutePermission, onDetail, onAssign }: { waybill: WaybillRoutingItem; hasRoutePermission: boolean; onDetail: () => void; onAssign: () => void }) {
  const disabled = !hasRoutePermission || !isRouteable(waybill);
  return <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-black text-primary">{waybill.waybill_code}</p><div className="mt-2 flex flex-wrap gap-2"><Badge config={statusConfig[normalizeStatus(waybill)]} fallback={normalizeStatus(waybill)} /><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /></div></div><div className="flex gap-1"><IconButton title="Xem" onClick={onDetail}><Eye size={15} /></IconButton><IconButton title="Gán tuyến" onClick={onAssign} disabled={disabled}><Route size={15} /></IconButton></div></div><div className="mt-4 grid gap-2 text-[13px]"><MobileInfo label="Người gửi" value={waybill.sender_info || '—'} /><MobileInfo label="Người nhận" value={waybill.receiver_info || '—'} /><MobileInfo label="Hub đi" value={<HubBadge>{formatHub(waybill.origin_hub, waybill.origin_hub_id)}</HubBadge>} /><MobileInfo label="Hub đến" value={<HubBadge>{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</HubBadge>} /><MobileInfo label="Cân nặng" value={displayValue(waybill.weight, ' kg')} /><MobileInfo label="Kích thước" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} /><MobileInfo label="TL quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} /><MobileInfo label="Cước phí" value={displayValue(waybill.cost_amount, ' đ')} /></div></div>;
}

function Badge({ config, fallback }: { config?: BadgeConfig; fallback: ReactNode }) { return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap', config?.className || 'bg-muted text-muted-foreground border-border')}>{config?.label || fallback}</span>; }
function HubBadge({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">{children}</span>; }
function MobileInfo({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-bold text-foreground break-words">{value}</span></div>; }
function IconButton({ title, children, onClick, disabled = false }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) { return <button title={title} onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div></div>; }
