import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Eye, Filter, Fuel, Loader2, Package, Pencil, Plus, Printer, Search, Tag, Trash2, Truck as TruckIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import { FilterPanel } from '../components/ui/FilterPanel';
import { FilterSelect } from '../components/ui/FilterSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import type { AuthUserProfile } from './login/types';
import TripStatusActionDialog from './trips/dialogs/TripStatusActionDialog';
import UpdateTripCostsDialog from './trips/dialogs/UpdateTripCostsDialog';
import TripManifestDetailDialog from './trips/dialogs/TripManifestDetailDialog';
import TripTruckDetailDialog from './trips/dialogs/TripTruckDetailDialog';
import EditTripScheduleDialog, { type TripScheduleFormState } from './trips/dialogs/EditTripScheduleDialog';
import { toLocalDateTimeInput } from './trips/tripScheduleUtils';
import AddWaybillsToManifestDialog from './warehouse/manifests/dialogs/AddWaybillsToManifestDialog';
import { buildInventoryTripLinesQuery, filterManifestAddableInventoryRows, isIncompleteSplitRow } from './warehouse/inventory/inventoryTripLines';
import type { WaybillInventoryItem } from './warehouse/inventory/types';
import type { AddWaybillsFormState, LoadPlanningManifest } from './warehouse/manifests/types';
import type { FilterOption, HubSummary, ListResponse, ManifestDetail, Trip, TripAction, TripCostFormState, TruckSummary, WaybillFilters, WaybillSummary } from './trips/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DRIVER = 4;
const DISPATCHER = 8;
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;

type WaybillColumnId = 'loading_position' | 'waybill_code' | 'package_count' | 'sender_info' | 'receiver_info' | 'origin_hub_id' | 'dest_hub_id' | 'current_state' | 'payment_type' | 'weight' | 'dimensions' | 'volumetric_weight' | 'actions';

const waybillHeaders: Array<{ id: WaybillColumnId; label: string; className?: string }> = [
  { id: 'loading_position', label: 'Vị trí', className: 'w-[82px] text-center' },
  { id: 'waybill_code', label: 'Mã vận đơn' },
  { id: 'package_count', label: 'Số kiện', className: 'w-[84px] text-center' },
  { id: 'sender_info', label: 'Người gửi' },
  { id: 'receiver_info', label: 'Người nhận' },
  { id: 'origin_hub_id', label: 'Hub đi' },
  { id: 'dest_hub_id', label: 'Hub đến' },
  { id: 'current_state', label: 'Trạng thái' },
  { id: 'payment_type', label: 'Thanh toán' },
  { id: 'weight', label: 'Cân nặng' },
  { id: 'dimensions', label: 'Kích thước' },
  { id: 'volumetric_weight', label: 'TL quy đổi' },
  { id: 'actions', label: 'Thao tác', className: 'w-[96px] min-w-[96px]' },
];

const getAvailableTripActions = (status?: string | null): TripAction[] => {
  switch (String(status || '')) {
    case 'PLANNED':
      return ['start', 'cancel'];
    case 'IN_TRANSIT':
      return ['arrive', 'cancel'];
    case 'ARRIVED':
      return ['complete', 'cancel'];
    default:
      return [];
  }
};

const tripStatusOptions: FilterOption[] = [
  { value: 'PLANNED', label: 'Đang lập kế hoạch' },
  { value: 'IN_TRANSIT', label: 'Xe đã khởi hành' },
  { value: 'ARRIVED', label: 'Xe đã đến' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

const paymentOptions: FilterOption[] = [{ value: 'PP', label: 'PP' }, { value: 'CC', label: 'CC' }, { value: 'COD', label: 'COD' }];
const statusConfig: Record<string, string> = { PLANNED: 'bg-amber-50 text-amber-700 border-amber-200', IN_TRANSIT: 'bg-blue-50 text-blue-700 border-blue-200', ARRIVED: 'bg-purple-50 text-purple-700 border-purple-200', COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200', CANCELLED: 'bg-red-50 text-red-700 border-red-200' };
const waybillStatusConfig: Record<string, string> = { RECEIVED: 'bg-slate-50 text-slate-700 border-slate-200', IN_WAREHOUSE: 'bg-blue-50 text-blue-700 border-blue-200', MANIFEST_CLOSED: 'bg-indigo-50 text-indigo-700 border-indigo-200', IN_TRANSIT: 'bg-amber-50 text-amber-700 border-amber-200', AT_DEST_HUB: 'bg-purple-50 text-purple-700 border-purple-200', OUT_FOR_DELIVERY: 'bg-cyan-50 text-cyan-700 border-cyan-200', DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200', RETURNED: 'bg-red-50 text-red-700 border-red-200' };

const getStoredUser = (): AuthUserProfile | null => { const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY); if (!raw) return null; try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; } };
const hasAnyRole = (roleMask: number, roles: number[]) => roles.some(role => (roleMask & role) !== 0);
const normalizeId = (value?: string | number | null) => value == null ? '' : String(value);
const normalizeList = <T,>(response: ListResponse<T> | T[], key: 'hubs') => Array.isArray(response) ? response : response[key] || response.data || response.items || [];
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const formatNumber = (value?: number | string | null, suffix = '') => value == null || value === '' ? '—' : `${new Intl.NumberFormat('vi-VN').format(Number(value))}${suffix}`;
const tripStatusLabel = (status?: string | null) => tripStatusOptions.find(option => option.value === status)?.label || status || '—';

const compareLoadingPosition = (a: WaybillSummary, b: WaybillSummary) => {
  const posA = Number(a.loading_position);
  const posB = Number(b.loading_position);
  const aValid = Number.isFinite(posA) && posA > 0;
  const bValid = Number.isFinite(posB) && posB > 0;
  if (!aValid && !bValid) return String(a.waybill_code || '').localeCompare(String(b.waybill_code || ''), 'vi');
  if (!aValid) return 1;
  if (!bValid) return -1;
  if (posA !== posB) return posA - posB;
  return String(a.waybill_code || '').localeCompare(String(b.waybill_code || ''), 'vi');
};

export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useMemo(getStoredUser, []);
  const roleMask = user?.role_mask ?? 0;
  const canOperateTrip = hasAnyRole(roleMask, [DISPATCHER, DRIVER, MANAGER, DIRECTOR]);
  const canEditTrip = hasAnyRole(roleMask, [DISPATCHER, MANAGER, DIRECTOR]);
  const canUpdateCosts = hasAnyRole(roleMask, [ACCOUNTANT, MANAGER, DIRECTOR]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [manifest, setManifest] = useState<ManifestDetail | null>(null);
  const [truck, setTruck] = useState<TruckSummary | null>(null);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionTrip, setActionTrip] = useState<Trip | null>(null);
  const [action, setAction] = useState<TripAction | null>(null);
  const [actionError, setActionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costForm, setCostForm] = useState<TripCostFormState>({ fuel_actual: '', fuel_cost: '', other_costs: '' });
  const [detailManifest, setDetailManifest] = useState<ManifestDetail | null>(null);
  const [detailTruck, setDetailTruck] = useState<TruckSummary | null>(null);
  const [scheduleTrip, setScheduleTrip] = useState<Trip | null>(null);
  const [scheduleForm, setScheduleForm] = useState<TripScheduleFormState>({ departure_time: '', arrival_time: '' });
  const [isAddWaybillsOpen, setIsAddWaybillsOpen] = useState(false);
  const [isWaybillLoading, setIsWaybillLoading] = useState(false);
  const [waybillChoices, setWaybillChoices] = useState<WaybillInventoryItem[]>([]);
  const [waybillTotal, setWaybillTotal] = useState(0);
  const [addWaybillsForm, setAddWaybillsForm] = useState<AddWaybillsFormState>({ keyword: '', page: 1, limit: 200 });
  const [addWaybillsError, setAddWaybillsError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [filters, setFilters] = useState<WaybillFilters>({ keyword: '', current_state: [], origin_hub_id: [], dest_hub_id: [], payment_type: [], page: 1, limit: 10 });

  const loadTrip = async () => {
    if (!id) return;
    setIsLoading(true); setError('');
    try {
      const [tripPayload, hubsPayload] = await Promise.all([apiRequest<Trip>(`/trips/${id}`), apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active').catch(() => [])]);
      setTrip(tripPayload);
      setHubs(normalizeList(hubsPayload, 'hubs'));
      setCostForm({ fuel_actual: tripPayload.fuel_actual == null ? '' : String(tripPayload.fuel_actual), fuel_cost: tripPayload.fuel_cost == null ? '' : String(tripPayload.fuel_cost), other_costs: tripPayload.other_costs == null ? '' : String(tripPayload.other_costs) });
      const [manifestPayload, truckPayload] = await Promise.all([
        tripPayload.manifest_id ? apiRequest<ManifestDetail>(`/manifests/${tripPayload.manifest_id}`).catch(() => null) : Promise.resolve(null),
        tripPayload.truck_id ? apiRequest<TruckSummary>(`/trucks/${tripPayload.truck_id}`).catch(() => null) : Promise.resolve(null),
      ]);
      setManifest(manifestPayload);
      setTruck(truckPayload);
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Không tải được chi tiết chuyến xe.');
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void loadTrip(); }, [id]);

  useEffect(() => {
    if (isAddWaybillsOpen && manifest) void fetchWaybillChoices();
  }, [isAddWaybillsOpen, manifest?.id, addWaybillsForm.keyword, addWaybillsForm.page, addWaybillsForm.limit]);

  const waybills = useMemo(() => {
    const raw = manifest?.waybills || manifest?.manifest_waybills?.map(item => (item.waybill ? {
      ...item.waybill,
      loading_position: item.loading_position,
      package_count: item.dispatch_fields?.so_luong ?? item.waybill.package_count,
    } : null)).filter(Boolean) as WaybillSummary[] | undefined || [];
    const keyword = filters.keyword.trim().toLowerCase();
    return raw.filter(waybill => {
      const textMatch = !keyword || [waybill.waybill_code, waybill.sender_info, waybill.receiver_info].some(value => String(value || '').toLowerCase().includes(keyword));
      return textMatch && (!filters.current_state.length || filters.current_state.includes(String(waybill.current_state || ''))) && (!filters.origin_hub_id.length || filters.origin_hub_id.includes(normalizeId(waybill.origin_hub_id))) && (!filters.dest_hub_id.length || filters.dest_hub_id.includes(normalizeId(waybill.dest_hub_id))) && (!filters.payment_type.length || filters.payment_type.includes(String(waybill.payment_type || '')));
    }).sort(compareLoadingPosition);
  }, [manifest, filters]);

  const total = waybills.length;
  const activeFilterCount = filters.current_state.length + filters.origin_hub_id.length + filters.dest_hub_id.length + filters.payment_type.length;
  const isFinal = ['COMPLETED', 'CANCELLED'].includes(String(trip?.status || ''));
  const hubOptions = hubs.map(hub => ({ value: normalizeId(hub.id), label: hub.code ? `${hub.code} · ${hub.name || ''}` : hub.name || `Hub #${hub.id}` }));
  const waybillStatusOptions = Array.from(new Set(waybills.map(waybill => String(waybill.current_state || '')).filter(Boolean))).map(value => ({ value, label: value }));
  const filterPanelGroups = [
    { id: 'current_state', title: 'Trạng thái vận đơn', options: waybillStatusOptions, value: filters.current_state, onChange: (value: string[]) => updateFilter('current_state', value) },
    { id: 'origin_hub_id', title: 'Bưu cục đi', options: hubOptions, value: filters.origin_hub_id, onChange: (value: string[]) => updateFilter('origin_hub_id', value) },
    { id: 'dest_hub_id', title: 'Bưu cục đến', options: hubOptions, value: filters.dest_hub_id, onChange: (value: string[]) => updateFilter('dest_hub_id', value) },
    { id: 'payment_type', title: 'Loại thanh toán', options: paymentOptions, value: filters.payment_type, onChange: (value: string[]) => updateFilter('payment_type', value) },
  ];

  function updateFilter<K extends keyof WaybillFilters>(key: K, value: WaybillFilters[K]) { setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 })); }
  function clearFilters() { setFilters(prev => ({ ...prev, current_state: [], origin_hub_id: [], dest_hub_id: [], payment_type: [], page: 1 })); }
  function openAction(nextAction: TripAction) { if (!trip || isFinal || !canOperateTrip) return; setActionTrip(trip); setAction(nextAction); setActionError(''); }
  async function confirmAction() { if (!actionTrip || !action) return; setIsSubmitting(true); setActionError(''); try { await apiRequest<Trip>(`/trips/${actionTrip.id}/${action}`, { method: 'PATCH' }); setActionTrip(null); setAction(null); await loadTrip(); } catch (submitError) { setActionError(submitError instanceof ApiError ? submitError.message : 'Không cập nhật được trạng thái chuyến.'); } finally { setIsSubmitting(false); } }
  async function submitCosts() { if (!trip || isFinal || !canUpdateCosts) return; setIsSubmitting(true); setActionError(''); try { await apiRequest<Trip>(`/trips/${trip.id}/costs`, { method: 'PATCH', body: { fuel_actual: Number(costForm.fuel_actual || 0), fuel_cost: Number(costForm.fuel_cost || 0), other_costs: Number(costForm.other_costs || 0) } }); setCostDialogOpen(false); await loadTrip(); } catch (submitError) { setActionError(submitError instanceof ApiError ? submitError.message : 'Không cập nhật được chi phí chuyến.'); } finally { setIsSubmitting(false); } }
  function openScheduleEditor() {
    if (!trip || !canEditTrip) return;
    setActionError('');
    setScheduleForm({
      departure_time: toLocalDateTimeInput(trip.departure_time),
      arrival_time: toLocalDateTimeInput(trip.expected_arrival_time || trip.arrival_time),
    });
    setScheduleTrip(trip);
  }
  async function submitSchedule() {
    if (!scheduleTrip || !scheduleForm.departure_time) return;
    setIsSubmitting(true); setActionError('');
    try {
      await apiRequest<Trip>(`/trips/${scheduleTrip.id}`, {
        method: 'PATCH',
        body: {
          departure_time: new Date(scheduleForm.departure_time).toISOString(),
          arrival_time: scheduleForm.arrival_time ? new Date(scheduleForm.arrival_time).toISOString() : null,
        },
      });
      setScheduleTrip(null);
      await loadTrip();
    } catch (submitError) {
      setActionError(submitError instanceof ApiError ? submitError.message : 'Không cập nhật được lịch chuyến.');
    } finally { setIsSubmitting(false); }
  }
  function openAddWaybills() {
    if (!manifest || !canEditTrip || String(trip?.status || '') === 'CANCELLED') return;
    setAddWaybillsForm({ keyword: '', page: 1, limit: 200 });
    setAddWaybillsError('');
    setWaybillChoices([]);
    setWaybillTotal(0);
    setIsAddWaybillsOpen(true);
  }
  async function fetchWaybillChoices() {
    if (!manifest) return;
    const manifestDestHubId = manifest.dest_hub_id ?? manifest.dest_hub?.id;
    setIsWaybillLoading(true); setAddWaybillsError('');
    try {
      const query = buildInventoryTripLinesQuery({
        page: addWaybillsForm.page,
        limit: addWaybillsForm.limit,
        keyword: addWaybillsForm.keyword,
        ma_kh: '',
        statuses: [],
        orderStatusGroups: [],
        noiDenKeyword: '',
        billingUnits: [],
        customerPaymentStatuses: [],
        hubIds: [],
        paymentTypes: [],
        priorities: [],
        receivedFrom: '',
        receivedTo: '',
      }, { onlyIncompleteSplit: true, destHubId: manifestDestHubId });
      const response = await apiRequest<{
        items?: WaybillInventoryItem[];
        data?: WaybillInventoryItem[];
        waybills?: WaybillInventoryItem[];
        total?: number;
        meta?: { total?: number; total_lines?: number; total_waybills?: number };
      } | WaybillInventoryItem[]>(`/waybills/inventory/trip-lines?${query}`);
      const raw = Array.isArray(response) ? response : response.items || response.data || response.waybills || [];
      const existingIds = new Set(waybills.map((waybill) => String(waybill.id ?? '')).filter(Boolean));
      const list = filterManifestAddableInventoryRows(raw.filter(isIncompleteSplitRow), {
        manifestId: String(manifest.id),
        manifestDestHubId,
        existingWaybillIds: existingIds,
      });
      setWaybillChoices(list);
      setWaybillTotal(Array.isArray(response) ? list.length : response.meta?.total_waybills ?? response.meta?.total_lines ?? response.meta?.total ?? response.total ?? list.length);
    } catch (fetchError) {
      setAddWaybillsError(fetchError instanceof ApiError ? fetchError.message : 'Không tải được danh sách đơn tồn.');
      setWaybillChoices([]); setWaybillTotal(0);
    } finally { setIsWaybillLoading(false); }
  }
  async function submitAddWaybills(items: Array<{ waybill_id: string; package_count: number; loading_position?: number }>) {
    if (!manifest || !items.length) return;
    setIsSubmitting(true); setAddWaybillsError('');
    try {
      await apiRequest(`/manifests/${manifest.id}/waybills`, { method: 'POST', body: { items } });
      setIsAddWaybillsOpen(false);
      await loadTrip();
    } catch (submitError) {
      setAddWaybillsError(submitError instanceof ApiError ? submitError.message : 'Không thêm được đơn vào chuyến.');
    } finally { setIsSubmitting(false); }
  }
  function confirmRemoveWaybill(waybill: WaybillSummary) {
    if (!manifest || !waybill.id || !canEditTrip || String(trip?.status || '') === 'CANCELLED') return;
    setConfirmDialog({
      title: 'Bỏ đơn khỏi chuyến',
      message: `Bỏ vận đơn ${waybill.waybill_code || waybill.id} khỏi chuyến này? Phần kiện của chuyến sẽ được trả lại danh sách tồn.`,
      confirmLabel: 'Bỏ khỏi chuyến',
      danger: true,
      onConfirm: async () => {
        setIsSubmitting(true); setActionError('');
        try {
          await apiRequest(`/manifests/${manifest.id}/waybills/${waybill.id}`, { method: 'DELETE' });
          await loadTrip();
        } catch (submitError) {
          setActionError(submitError instanceof ApiError ? submitError.message : 'Không bỏ được đơn khỏi chuyến.');
        } finally { setIsSubmitting(false); }
      },
    });
  }
  function printManifest() {
    if (!trip?.manifest_id) return;
    window.open(`/print/manifest/${trip.manifest_id}`, '_blank', 'noopener');
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilter('keyword', event.target.value)} placeholder="Tìm vận đơn trong bảng kê..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button title="Mở bộ lọc" onClick={() => setIsFilterPanelOpen(true)} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
            <div className="hidden flex-1 md:block" />
            {canUpdateCosts && <button disabled={isFinal || !trip} onClick={() => { setActionError(''); setCostDialogOpen(true); }} className="h-10 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-40"><span className="hidden md:inline">+ Cập nhật chi phí</span><Fuel className="md:hidden" size={16} /></button>}
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple icon={Tag} placeholder="Trạng thái vận đơn" options={waybillStatusOptions} value={filters.current_state} onValueChange={value => updateFilter('current_state', value)} />
            <FilterSelect multiple icon={Package} placeholder="Bưu cục đi" options={hubOptions} value={filters.origin_hub_id} onValueChange={value => updateFilter('origin_hub_id', value)} />
            <FilterSelect multiple icon={Package} placeholder="Bưu cục đến" options={hubOptions} value={filters.dest_hub_id} onValueChange={value => updateFilter('dest_hub_id', value)} />
            <FilterSelect multiple icon={Tag} placeholder="Loại thanh toán" options={paymentOptions} value={filters.payment_type} onValueChange={value => updateFilter('payment_type', value)} />
          </div>
          {actionError && !scheduleTrip && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700"><AlertTriangle size={14} />{actionError}</div>}
          {trip && <TripInfo trip={trip} manifest={manifest} truck={truck} hubs={hubs} canOperateTrip={canOperateTrip} canEditTrip={canEditTrip} isFinal={isFinal} openAction={openAction} openManifest={() => manifest && setDetailManifest(manifest)} openTruck={() => truck && setDetailTruck(truck)} openScheduleEditor={openScheduleEditor} openAddWaybills={openAddWaybills} printManifest={printManifest} />}
        </div>

        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={28} />} title="Đang tải chi tiết chuyến xe" description="Hệ thống đang lấy dữ liệu thật từ API." /> : error ? <StateBlock icon={<AlertTriangle size={28} />} title="Không tải được dữ liệu" description={error} /> : !trip ? <StateBlock icon={<TruckIcon size={28} />} title="Không tìm thấy chuyến xe" description="Kiểm tra lại mã chuyến hoặc quyền truy cập." /> : !waybills.length ? <StateBlock icon={<Package size={28} />} title="Chưa có vận đơn phù hợp" description="Bảng kê chưa có vận đơn hoặc bộ lọc không có kết quả." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table className="hidden md:table w-full min-w-[1380px] text-left border-collapse"><thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr>{waybillHeaders.map(header => <th key={header.id} className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}>{header.label}</th>)}</tr></thead><tbody>{waybills.map((waybill, index) => <tr key={waybill.id || waybill.waybill_code || index} className="border-b border-border hover:bg-muted/10 transition-colors">{waybillHeaders.map(header => renderWaybillCell(header.id, waybill, hubs, canEditTrip && String(trip.status || '') !== 'CANCELLED' ? confirmRemoveWaybill : undefined))}</tr>)}</tbody></table>
            <div className="grid gap-3 p-3 md:hidden">{waybills.map((waybill, index) => <WaybillMobileCard key={waybill.id || waybill.waybill_code || index} waybill={waybill} hubs={hubs} onRemove={canEditTrip && String(trip.status || '') !== 'CANCELLED' ? confirmRemoveWaybill : undefined} />)}</div>
          </div>
        )}

        <div className="shrink-0 border-t border-border bg-card px-4 py-2 text-center text-[12px] font-bold text-muted-foreground">Hiển thị toàn bộ <span className="text-foreground">{total}</span> đơn trong chuyến</div>
      </div>
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
      <TripStatusActionDialog trip={actionTrip} action={action} isSubmitting={isSubmitting} error={actionError} onClose={() => { setActionTrip(null); setAction(null); }} onConfirm={confirmAction} />
      <UpdateTripCostsDialog trip={costDialogOpen ? trip : null} formState={costForm} isSubmitting={isSubmitting} error={actionError} onClose={() => setCostDialogOpen(false)} onChange={(key, value) => setCostForm(prev => ({ ...prev, [key]: value }))} onSubmit={submitCosts} />
      <TripManifestDetailDialog manifest={detailManifest} onClose={() => setDetailManifest(null)} />
      <TripTruckDetailDialog truck={detailTruck} onClose={() => setDetailTruck(null)} />
      <EditTripScheduleDialog trip={scheduleTrip} formState={scheduleForm} isSubmitting={isSubmitting} error={actionError} onChange={(key, value) => setScheduleForm(prev => ({ ...prev, [key]: value }))} onClose={() => setScheduleTrip(null)} onSubmit={submitSchedule} />
      <AddWaybillsToManifestDialog isOpen={isAddWaybillsOpen} isClosing={false} isLoading={isWaybillLoading} isSubmitting={isSubmitting} error={addWaybillsError} originHubLabel={manifest?.origin_hub?.code || manifest?.origin_hub?.name || '—'} manifest={manifest as LoadPlanningManifest | null} waybills={waybillChoices} total={waybillTotal} formState={addWaybillsForm} onChange={patch => setAddWaybillsForm(prev => ({ ...prev, ...patch }))} onClose={() => setIsAddWaybillsOpen(false)} onSubmit={submitAddWaybills} />
      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function TripInfo({ trip, manifest, truck, hubs, canOperateTrip, canEditTrip, isFinal, openAction, openManifest, openTruck, openScheduleEditor, openAddWaybills, printManifest }: { trip: Trip; manifest: ManifestDetail | null; truck: TruckSummary | null; hubs: HubSummary[]; canOperateTrip: boolean; canEditTrip: boolean; isFinal: boolean; openAction: (action: TripAction) => void; openManifest: () => void; openTruck: () => void; openScheduleEditor: () => void; openAddWaybills: () => void; printManifest: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-muted/5 p-3 text-[12px] md:grid-cols-4">
      <Info label="Biển kiểm soát" value={<button type="button" onClick={openTruck} className="font-bold text-primary hover:underline"><TruckBadge trip={trip} truck={truck} /></button>} />
      <Info label="Lái xe / SĐT" value={[trip.driver_name || truck?.ten_lai_xe, trip.driver_phone].filter(Boolean).join(' · ') || '—'} />
      <Info label="Bảng kê" value={<button type="button" onClick={openManifest} className="font-bold text-primary hover:underline"><ManifestBadge trip={trip} manifest={manifest} /></button>} />
      <Info label="Giờ dự kiến đến" value={formatDate(trip.expected_arrival_time || trip.arrival_time)} />
      <Info label="Kho đi" value={<HubBadge hubs={hubs} id={trip.start_hub_id} hub={trip.start_hub} />} />
      <Info label="Kho đến" value={<HubBadge hubs={hubs} id={trip.end_hub_id} hub={trip.end_hub} />} />
      <Info label="Khởi hành" value={formatDate(trip.departure_time)} />
      <Info label="Chốt cân/khối" value={`${formatNumber(trip.actual_total_weight, ' kg')} / ${formatNumber(trip.actual_total_volume, ' m³')}`} />
      <Info label="Trạng thái" value={<TripStatusBadge status={trip.status} />} />
      <div className="flex flex-wrap items-center gap-1 md:col-span-4">
        {canEditTrip && <button type="button" onClick={openScheduleEditor} className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-primary"><Pencil size={13} className="mr-1 inline" />Sửa ngày chuyến</button>}
        {canEditTrip && trip.manifest_id && String(trip.status || '') !== 'CANCELLED' && <button type="button" onClick={openAddWaybills} className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700"><Plus size={13} className="mr-1 inline" />Thêm đơn tồn</button>}
        {getAvailableTripActions(trip.status).map(action => (
          <button key={action} type="button" disabled={!canOperateTrip} onClick={() => openAction(action)} className={clsx('h-8 rounded-lg border px-2 text-[11px] font-bold disabled:opacity-40', action === 'cancel' ? 'border-red-200 bg-red-50 text-red-600' : 'border-primary/20 bg-blue-50 text-primary')}>
            {action === 'start' ? 'Khởi hành' : action === 'arrive' ? 'Đến hub' : action === 'complete' ? 'Hoàn tất' : 'Hủy'}
          </button>
        ))}
        {trip.manifest_id && <button type="button" onClick={() => void printManifest()} className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-bold text-slate-800"><Printer size={13} className="mr-1 inline" />In bảng kê</button>}
        {!isFinal && (trip.status === 'IN_TRANSIT' || trip.status === 'ARRIVED') && (
          <>
            <button type="button" onClick={() => navigate(`/trips/${trip.id}/loading-sequence`)} className="h-8 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-800">Vị trí xếp hàng</button>
            <button type="button" onClick={() => navigate(`/trips/${trip.id}/expenses`)} className="h-8 rounded-lg border border-orange-200 bg-orange-50 px-2 text-[11px] font-bold text-orange-800">Chi phí phát sinh</button>
          </>
        )}
      </div>
    </div>
  );
}

function renderWaybillCell(column: WaybillColumnId, waybill: WaybillSummary, hubs: HubSummary[], onRemove?: (waybill: WaybillSummary) => void) { const content: Record<WaybillColumnId, ReactNode> = { loading_position: <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-yellow-200 px-2 text-[12px] font-extrabold text-slate-900">{waybill.loading_position || '—'}</span>, waybill_code: <span className="font-extrabold text-primary">{waybill.waybill_code || '—'}</span>, package_count: <span className="font-bold">{formatNumber(waybill.package_count)}</span>, sender_info: waybill.sender_info || '—', receiver_info: waybill.receiver_info || '—', origin_hub_id: <HubBadge hubs={hubs} id={waybill.origin_hub_id} />, dest_hub_id: <HubBadge hubs={hubs} id={waybill.dest_hub_id} />, current_state: <WaybillStatusBadge status={waybill.current_state} />, payment_type: <PaymentBadge value={waybill.payment_type} />, weight: formatNumber(waybill.weight, ' kg'), dimensions: `${formatNumber(waybill.length)} × ${formatNumber(waybill.width)} × ${formatNumber(waybill.height)}`, volumetric_weight: formatNumber(waybill.volumetric_weight, ' kg'), actions: <div className="flex gap-1"><IconButton icon={<Eye size={15} />} title="Xem" />{onRemove && <IconButton icon={<Trash2 size={15} />} title="Bỏ khỏi chuyến" onClick={() => onRemove(waybill)} danger />}</div> }; return <td key={column} className={clsx('px-4 py-3 border-r border-border last:border-r-0 text-[13px] align-top', column === 'package_count' && 'text-center')}>{content[column]}</td>; }
function WaybillMobileCard({ waybill, hubs, onRemove }: { waybill: WaybillSummary; hubs: HubSummary[]; onRemove?: (waybill: WaybillSummary) => void }) { return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vận đơn</p><h3 className="text-base font-extrabold text-primary">{waybill.waybill_code || '—'}</h3></div><WaybillStatusBadge status={waybill.current_state} /></div><div className="mt-4 grid gap-2 text-[13px]"><Line label="Vị trí xếp" value={<span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-yellow-200 px-2 text-[12px] font-extrabold text-slate-900">{waybill.loading_position || '—'}</span>} /><Line label="Số kiện trên chuyến" value={formatNumber(waybill.package_count)} /><Line label="Người gửi" value={waybill.sender_info || '—'} /><Line label="Người nhận" value={waybill.receiver_info || '—'} /><Line label="Hub đi" value={<HubBadge hubs={hubs} id={waybill.origin_hub_id} />} /><Line label="Hub đến" value={<HubBadge hubs={hubs} id={waybill.dest_hub_id} />} /><Line label="Thanh toán" value={<PaymentBadge value={waybill.payment_type} />} /><Line label="Cân nặng" value={formatNumber(waybill.weight, ' kg')} /><Line label="Kích thước" value={`${formatNumber(waybill.length)} × ${formatNumber(waybill.width)} × ${formatNumber(waybill.height)}`} /><Line label="TL quy đổi" value={formatNumber(waybill.volumetric_weight, ' kg')} /></div><div className="mt-4 flex gap-2"><IconButton icon={<Eye size={15} />} title="Xem" />{onRemove && <IconButton icon={<Trash2 size={15} />} title="Bỏ khỏi chuyến" onClick={() => onRemove(waybill)} danger />}</div></article>; }
function Info({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 truncate font-bold text-foreground">{value}</div></div>; }
function Line({ label, value }: { label: string; value: ReactNode }) { return <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/5 px-3 py-2"><span className="text-muted-foreground">{label}</span><span className="text-right font-bold text-foreground">{value}</span></div>; }
function IconButton({ icon, title, onClick, danger = false }: { icon: ReactNode; title: string; onClick?: () => void; danger?: boolean }) { return <button type="button" title={title} onClick={onClick} className={clsx('rounded-lg border bg-white p-2 hover:bg-muted', danger ? 'border-red-200 text-red-500 hover:text-red-700' : 'border-border text-muted-foreground hover:text-primary')}>{icon}</button>; }
function TripStatusBadge({ status }: { status?: string | null }) { return <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold', statusConfig[String(status || '')] || 'border-border bg-muted text-muted-foreground')}>{tripStatusLabel(status)}</span>; }
function WaybillStatusBadge({ status }: { status?: string | null }) { return <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold', waybillStatusConfig[String(status || '')] || 'border-border bg-muted text-muted-foreground')}>{status || '—'}</span>; }
function PaymentBadge({ value }: { value?: string | null }) { return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">{value || '—'}</span>; }
function HubBadge({ hubs, id, hub }: { hubs: HubSummary[]; id?: string | number | null; hub?: HubSummary | null }) { const found = hub || hubs.find(item => normalizeId(item.id) === normalizeId(id)); return <span className="inline-flex rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[12px] font-bold text-blue-700">{found?.code || found?.name || `Hub #${normalizeId(id) || '—'}`}</span>; }
function TruckBadge({ trip, truck }: { trip: Trip; truck?: TruckSummary | null }) { return <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-bold text-slate-700"><TruckIcon size={13} />{truck?.license_plate || trip.truck?.license_plate || `Truck #${normalizeId(trip.truck_id) || '—'}`}</span>; }
function ManifestBadge({ trip, manifest }: { trip: Trip; manifest?: ManifestDetail | null }) { return <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[12px] font-bold text-emerald-700"><Package size={13} />{manifest?.manifest_code || trip.manifest?.manifest_code || `Manifest #${normalizeId(trip.manifest_id) || '—'}`}</span>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center text-muted-foreground"><div className="mb-3 text-primary">{icon}</div><h3 className="text-[14px] font-bold text-foreground">{title}</h3><p className="mt-1 text-[13px] max-w-md">{description}</p></div>; }

