import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Loader2, PackageCheck, Plus, Printer, Search, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { FilterSelect } from '../components/ui/FilterSelect';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import AddEditManifestDialog from './warehouse/manifests/dialogs/AddEditManifestDialog';
import AddWaybillsToManifestDialog from './warehouse/manifests/dialogs/AddWaybillsToManifestDialog';
import PrintManifestDialog from './warehouse/manifests/dialogs/PrintManifestDialog';
import type { AuthUserProfile } from './login/types';
import AssignManifestTripDialog from './warehouse/manifests/dialogs/AssignManifestTripDialog';
import ManifestDetailDialog from './warehouse/manifests/dialogs/ManifestDetailDialog';
import {
  filterDepartedFromOrigin,
  manifestOriginLane,
  manifestTrip as resolveManifestTrip,
  resolveUserHubView,
} from './warehouse/manifests/manifestHubUtils';
import type { AddWaybillsFormState, AssignTripFormState, BadgeConfig, FilterOption, HubSummary, LoadPlanningFilters, LoadPlanningManifest, ManifestFormState, ManifestListResponse, ManifestWaybill, TripListResponse, TripSummary } from './warehouse/manifests/types';
import {
  buildInventoryTripLinesQuery,
  filterManifestAddableInventoryRows,
  isIncompleteSplitRow,
} from './warehouse/inventory/inventoryTripLines';

const USER_PROFILE_KEY = 'eco_user_profile';
const WAREHOUSE = 1;
const PACKER = 2;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const statusConfig: Record<string, BadgeConfig> = {
  DRAFT: { label: 'Nháp', className: 'bg-slate-100 text-slate-600' },
  OPEN: { label: 'Đang gom', className: 'bg-blue-50 text-blue-700' },
  CLOSED: { label: 'Đã đóng', className: 'bg-emerald-50 text-emerald-700' },
  MANIFEST_CLOSED: { label: 'Đã đóng', className: 'bg-emerald-50 text-emerald-700' },
  ASSIGNED: { label: 'Đã gán chuyến', className: 'bg-indigo-50 text-indigo-700' },
  IN_TRANSIT: { label: 'Đang chạy', className: 'bg-amber-50 text-amber-700' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-red-50 text-red-600' },
};
const statusOptions: FilterOption[] = [
  { value: 'DRAFT', label: 'Nháp' }, { value: 'OPEN', label: 'Đang gom' }, { value: 'CLOSED', label: 'Đã đóng' }, { value: 'ASSIGNED', label: 'Đã gán chuyến' }, { value: 'IN_TRANSIT', label: 'Đang chạy' },
];
const defaultFilters: LoadPlanningFilters = { keyword: '', status: [], origin_hub_id: [], dest_hub_id: [], trip_id: [], date_from: '', date_to: '', page: 1, limit: 100 };

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};
const hasRole = (mask: number, role: number) => (mask & role) !== 0;
const canViewPage = (mask: number) =>
  hasRole(mask, WAREHOUSE) ||
  hasRole(mask, PACKER) ||
  hasRole(mask, DISPATCHER) ||
  hasRole(mask, MANAGER) ||
  hasRole(mask, DIRECTOR);
const canAssignTrip = (mask: number) => hasRole(mask, DISPATCHER) || hasRole(mask, MANAGER) || hasRole(mask, DIRECTOR);
const canViewPricing = (mask: number) => hasRole(mask, MANAGER) || hasRole(mask, DIRECTOR);
const normalizeList = (response: ManifestListResponse | LoadPlanningManifest[]) => Array.isArray(response) ? response : response.data || response.items || response.manifests || [];
const normalizeTripList = (response: TripListResponse | TripSummary[]) => Array.isArray(response) ? response : response.data || response.items || response.trips || [];
const normalizeTotal = (response: ManifestListResponse | LoadPlanningManifest[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const formatNumber = (value?: string | number | null, suffix = '') => value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;
const manifestCode = (manifest: LoadPlanningManifest) => manifest.manifest_code || manifest.code || `MF-${manifest.id}`;
const hubLabel = (hub?: HubSummary | null, id?: string | number | null) => hub?.code || hub?.name || (id ? `Hub #${id}` : '—');
const normalizeHubCode = (hub?: HubSummary | null) => {
  const code = hub?.code?.trim().toUpperCase();
  if (code === 'HAN' || code === 'HCM') return code;
  const name = hub?.name?.trim().toUpperCase() || '';
  if (/HÀ NỘI|HA NOI|HAN/.test(name)) return 'HAN';
  if (/HỒ CHÍ MINH|HO CHI MINH|TP\.?HCM|HCM/.test(name)) return 'HCM';
  return code || '';
};
const resolveManifestOriginHubId = (manifest: LoadPlanningManifest, hubList: HubSummary[]) => {
  const direct = String(manifest.origin_hub_id || manifest.origin_hub?.id || '').trim();
  if (direct) return direct;
  const lane = manifestOriginLane(manifest);
  if (!lane) return '';
  const matched = hubList.find((hub) => normalizeHubCode(hub) === lane);
  return matched ? String(matched.id) : '';
};
const resolveManifestOriginHubLabel = (manifest: LoadPlanningManifest, hubList: HubSummary[]) => {
  if (manifest.origin_hub?.code || manifest.origin_hub?.name) {
    return hubLabel(manifest.origin_hub, manifest.origin_hub_id);
  }
  const lane = manifestOriginLane(manifest);
  if (lane === 'HAN') return 'HAN';
  if (lane === 'HCM') return 'HCM';
  const hubId = resolveManifestOriginHubId(manifest, hubList);
  const hub = hubList.find((item) => String(item.id) === hubId);
  return hub ? hubLabel(hub, hubId) : hubId ? `Hub #${hubId}` : '—';
};
const manifestTrip = (manifest: LoadPlanningManifest) => resolveManifestTrip(manifest);
const resolveTruckPlate = (trip?: TripSummary | null) => trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || null;
const tripLabel = (trip?: TripSummary | null, manifestTripId?: string | number | null) => {
  if (trip?.trip_code || trip?.code) return trip.trip_code || trip.code || '—';
  const tripId = manifestTripId ?? trip?.id;
  if (tripId && !String(tripId).startsWith('split-')) return `Chuyến #${tripId}`;
  return resolveTruckPlate(trip) || 'Chưa gán chuyến';
};
const truckLabel = (manifest: LoadPlanningManifest) => resolveTruckPlate(manifestTrip(manifest)) || 'Chưa có xe';
const driverLabel = (manifest: LoadPlanningManifest) => { const trip = manifestTrip(manifest); return trip?.driver_name || trip?.driver?.name || trip?.driver?.full_name || trip?.truck?.ten_lai_xe || trip?.truck?.driver?.name || trip?.truck?.driver?.full_name || 'Chưa gán'; };
const getWaybillCount = (manifest: LoadPlanningManifest) => Number(manifest.waybill_count ?? manifest.total_waybills ?? manifest.waybills?.length ?? 0);
const getManifestWeight = (manifest: LoadPlanningManifest) => Number(manifest.total_weight ?? manifest.weight_total ?? 0);
const formatTime = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value)) : null;
const formatManifestSubline = (manifest: LoadPlanningManifest) => {
  const trip = manifestTrip(manifest);
  const parts = [
    truckLabel(manifest),
    driverLabel(manifest),
    `${getWaybillCount(manifest).toLocaleString('vi-VN')} đơn`,
    `${formatNumber(getManifestWeight(manifest))} kg`,
    trip?.departure_time ? `Khởi hành ${formatTime(trip.departure_time)}` : null,
    trip?.expected_arrival_time ? `ETA ${formatTime(trip.expected_arrival_time)}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};
const matchesManifestKeyword = (manifest: LoadPlanningManifest, keyword: string) => {
  if (!keyword) return true;
  const haystack = [
    manifestCode(manifest),
    manifest.seal_code,
    truckLabel(manifest),
    driverLabel(manifest),
    tripLabel(manifestTrip(manifest)),
    hubLabel(manifest.origin_hub, manifest.origin_hub_id),
    hubLabel(manifest.dest_hub, manifest.dest_hub_id),
  ].join(' ').toLowerCase();
  return haystack.includes(keyword);
};

export default function WarehouseManifestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useMemo(getStoredUser, []);
  const openManifestId = searchParams.get('openManifestId')?.trim() || '';
  const roleMask = user?.role_mask ?? 0;
  const allowed = canViewPage(roleMask);
  const mayAssign = canAssignTrip(roleMask);
  const canManageManifest = mayAssign;
  const [filters, setFilters] = useState<LoadPlanningFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<LoadPlanningFilters>(defaultFilters);
  const [manifests, setManifests] = useState<LoadPlanningManifest[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['status']);
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [detailManifest, setDetailManifest] = useState<LoadPlanningManifest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [assignManifest, setAssignManifest] = useState<LoadPlanningManifest | null>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isAssignClosing, setIsAssignClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignForm, setAssignForm] = useState<AssignTripFormState>({ trip_id: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formManifest, setFormManifest] = useState<LoadPlanningManifest | null>(null);
  const [formState, setFormState] = useState<ManifestFormState>({ origin_hub_id: '', dest_hub_id: '', seal_code: '', note: '' });
  const [isAddWaybillsOpen, setIsAddWaybillsOpen] = useState(false);
  const [isAddWaybillsClosing, setIsAddWaybillsClosing] = useState(false);
  const [waybillChoices, setWaybillChoices] = useState<ManifestWaybill[]>([]);
  const [waybillTotal, setWaybillTotal] = useState(0);
  const [isWaybillLoading, setIsWaybillLoading] = useState(false);
  const [addWaybillsManifest, setAddWaybillsManifest] = useState<LoadPlanningManifest | null>(null);
  const [addWaybillsForm, setAddWaybillsForm] = useState<AddWaybillsFormState>({ keyword: '', page: 1, limit: 200 });
  const [addWaybillsError, setAddWaybillsError] = useState('');
  const [printManifest, setPrintManifest] = useState<LoadPlanningManifest | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isPrintClosing, setIsPrintClosing] = useState(false);
  const [isPrintLoading, setIsPrintLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const userHubView = useMemo(() => resolveUserHubView(user, hubs), [user, hubs]);
  const keyword = filters.keyword.trim().toLowerCase();
  const expectedFromHcmManifests = useMemo(
    () => filterDepartedFromOrigin(manifests, 'HCM').filter((manifest) => matchesManifestKeyword(manifest, keyword)),
    [manifests, keyword],
  );
  const departedFromHanManifests = useMemo(
    () => filterDepartedFromOrigin(manifests, 'HAN').filter((manifest) => matchesManifestKeyword(manifest, keyword)),
    [manifests, keyword],
  );
  const transitManifestCount = expectedFromHcmManifests.length + departedFromHanManifests.length;

  const hubOptions = useMemo(() => hubs.map(hub => ({ value: String(hub.id), label: hub.code ? `${hub.code} · ${hub.name || 'Bưu cục'}` : hub.name || `Hub #${hub.id}` })), [hubs]);
  const tripOptions = useMemo(() => trips.map(trip => ({ value: String(trip.id), label: tripLabel(trip) })), [trips]);
  const activeFilterCount = filters.status.length + filters.origin_hub_id.length + filters.dest_hub_id.length + filters.trip_id.length + (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const rangeStart = total ? (filters.page - 1) * filters.limit + 1 : 0;
  const rangeEnd = Math.min(total, filters.page * filters.limit);

  useEffect(() => { if (!allowed) return; void fetchOptions(); }, [allowed]);
  useEffect(() => { if (!allowed) return; void fetchManifests(); }, [allowed, filters]);
  useEffect(() => {
    if (!allowed || isLoading || !openManifestId || isDetailOpen || isDetailLoading) return;
    const manifest = manifests.find((item) => String(item.id) === openManifestId) ?? ({ id: openManifestId } as LoadPlanningManifest);
    void openDetail(manifest);
  }, [allowed, isLoading, openManifestId, manifests, isDetailOpen, isDetailLoading]);

  async function fetchOptions() {
    try {
      const [hubResponse, tripResponse] = await Promise.all([
        apiRequest<HubSummary[]>('/hubs/active'),
        apiRequest<TripListResponse | TripSummary[]>(`/trips?${new URLSearchParams({ page: '1', limit: '100', status: 'PLANNED' }).toString()}`),
      ]);
      setHubs(Array.isArray(hubResponse) ? hubResponse : []);
      setTrips(normalizeTripList(tripResponse));
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu bộ lọc.'); }
  }

  async function fetchManifests() {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
      if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
      if (filters.status.length) params.set('status', filters.status.join(','));
      if (filters.origin_hub_id.length) params.set('origin_hub_id', filters.origin_hub_id.join(','));
      if (filters.dest_hub_id.length) params.set('dest_hub_id', filters.dest_hub_id.join(','));
      if (filters.trip_id.length) params.set('trip_id', filters.trip_id.join(','));
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const response = await apiRequest<ManifestListResponse | LoadPlanningManifest[]>(`/manifests?${params.toString()}`);
      const list = normalizeList(response);
      setManifests(list); setTotal(normalizeTotal(response, list.length));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách bảng kê.'); setManifests([]); setTotal(0); }
    finally { setIsLoading(false); }
  }

  const updateFilters = (patch: Partial<LoadPlanningFilters>) => setFilters(prev => ({ ...prev, ...patch }));
  const clearFilters = () => { const next = { ...defaultFilters, keyword: filters.keyword, limit: filters.limit }; setFilters(next); setDraftFilters(next); };
  const openFilters = () => { setDraftFilters(filters); setIsFilterOpen(true); };
  const applyFilters = () => { setFilters({ ...draftFilters, page: 1 }); setIsFilterOpen(false); };
  const closeDetail = () => { setIsDetailClosing(true); if (openManifestId) setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('openManifestId'); return next; }, { replace: true }); window.setTimeout(() => { setIsDetailOpen(false); setDetailManifest(null); setIsDetailClosing(false); }, 180); };
  const closeAssign = () => { setIsAssignClosing(true); window.setTimeout(() => { setIsAssignOpen(false); setAssignManifest(null); setIsAssignClosing(false); }, 180); };

  async function openDetail(manifest: LoadPlanningManifest) {
    setIsDetailOpen(true); setIsDetailLoading(true); setDetailManifest(manifest);
    try { setDetailManifest(await apiRequest<LoadPlanningManifest>(`/manifests/${manifest.id}`)); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể tải chi tiết bảng kê.'); }
    finally { setIsDetailLoading(false); }
  }

  async function updateDetailDispatchFields(waybill: ManifestWaybill, fields: Record<string, string>) {
    if (!detailManifest) return;
    setIsSubmitting(true); setActionError('');
    try {
      await apiRequest(`/manifests/${detailManifest.id}/dispatch-rows`, { method: 'PATCH', body: { rows: [{ waybill_id: waybill.id, fields: { ...(waybill.dispatch_fields ?? {}), ...fields } }] } });
      const freshManifest = await apiRequest<LoadPlanningManifest>(`/manifests/${detailManifest.id}`);
      setDetailManifest(freshManifest);
      await fetchManifests();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể cập nhật thông tin dòng bảng kê.'); }
    finally { setIsSubmitting(false); }
  }

  async function updateExpectedArrival(manifest: LoadPlanningManifest, value: string) {
    setIsSubmitting(true); setActionError('');
    try {
      const freshManifest = await apiRequest<LoadPlanningManifest>(`/manifests/${manifest.id}/expected-arrival`, { method: 'PATCH', body: { expected_arrival_time: value ? new Date(value).toISOString() : null } });
      setDetailManifest(prev => prev && String(prev.id) === String(freshManifest.id) ? freshManifest : prev);
      setManifests(prev => prev.map(item => String(item.id) === String(freshManifest.id) ? freshManifest : item));
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể cập nhật ngày dự kiến đến.'); }
    finally { setIsSubmitting(false); }
  }

  async function submitAssign() {
    if (!assignManifest || !assignForm.trip_id) return;
    setIsSubmitting(true); setActionError('');
    try { await apiRequest(`/manifests/${assignManifest.id}/assign-trip`, { method: 'PATCH', body: { trip_id: assignForm.trip_id } }); closeAssign(); await fetchManifests(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể gán chuyến xe cho bảng kê.'); }
    finally { setIsSubmitting(false); }
  }


  useEffect(() => {
    if (isAddWaybillsOpen && addWaybillsManifest) void fetchWaybillChoices();
  }, [isAddWaybillsOpen, addWaybillsManifest, addWaybillsForm.keyword, addWaybillsForm.page, addWaybillsForm.limit, hubs]);

  function toForm(manifest?: LoadPlanningManifest | null): ManifestFormState {
    return { origin_hub_id: manifest?.origin_hub_id ? String(manifest.origin_hub_id) : '', dest_hub_id: manifest?.dest_hub_id ? String(manifest.dest_hub_id) : '', seal_code: manifest?.seal_code || '', note: (manifest as any)?.note || '' };
  }
  function closeForm() { setIsFormClosing(true); window.setTimeout(() => { setIsFormOpen(false); setIsFormClosing(false); }, 180); }
  function openAdd() { setIsEditMode(false); setFormManifest(null); setFormState(toForm(null)); setIsFormOpen(true); }
  async function submitForm() {
    setIsSubmitting(true); setActionError('');
    const body = { origin_hub_id: formState.origin_hub_id, dest_hub_id: formState.dest_hub_id, seal_code: formState.seal_code || undefined, note: formState.note || undefined };
    try { if (isEditMode && formManifest) await apiRequest(`/manifests/${formManifest.id}`, { method: 'PATCH', body }); else await apiRequest('/manifests', { method: 'POST', body }); closeForm(); await fetchManifests(); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể lưu bảng kê.'); }
    finally { setIsSubmitting(false); }
  }
  function closeAddWaybills() { setIsAddWaybillsClosing(true); window.setTimeout(() => { setIsAddWaybillsOpen(false); setAddWaybillsManifest(null); setIsAddWaybillsClosing(false); }, 180); }
  async function fetchWaybillChoices() {
    if (!addWaybillsManifest) return;
    setIsWaybillLoading(true);
    setActionError('');
    setAddWaybillsError('');
    try {
      const query = buildInventoryTripLinesQuery(
        {
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
        },
        { onlyIncompleteSplit: true },
      );
      const response = await apiRequest<{
        items?: ManifestWaybill[];
        data?: ManifestWaybill[];
        waybills?: ManifestWaybill[];
        meta?: { total?: number; total_lines?: number; total_waybills?: number };
        total?: number;
      }>(`/waybills/inventory/trip-lines?${query}`);
      const raw = Array.isArray(response) ? response : response.items || response.data || response.waybills || [];
      const manifestId = String(addWaybillsManifest.id);
      const existingIds = new Set(
        (addWaybillsManifest.waybills ?? addWaybillsManifest.manifest_waybills?.map((link) => link.waybill).filter(Boolean) ?? [])
          .map((waybill) => String(waybill?.id)),
      );
      const list = filterManifestAddableInventoryRows(raw.filter(isIncompleteSplitRow), {
        manifestId,
        existingWaybillIds: existingIds,
      });
      setWaybillChoices(list);
      setWaybillTotal(
        Array.isArray(response)
          ? list.length
          : response.meta?.total_waybills ?? response.meta?.total_lines ?? response.meta?.total ?? list.length,
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể tải đơn tồn khả dụng.';
      setAddWaybillsError(message);
      setActionError(message);
      setWaybillChoices([]);
      setWaybillTotal(0);
    } finally {
      setIsWaybillLoading(false);
    }
  }
  async function submitAddWaybills(items: Array<{ waybill_id: string; package_count: number; loading_position?: number }>) {
    if (!addWaybillsManifest || !items.length) return;
    setIsSubmitting(true);
    setAddWaybillsError('');
    setActionError('');
    try {
      const updated = await apiRequest<LoadPlanningManifest>(`/manifests/${addWaybillsManifest.id}/waybills`, { method: 'POST', body: { items } });
      closeAddWaybills();
      await fetchManifests();
      if (detailManifest && String(detailManifest.id) === String(updated.id)) setDetailManifest(updated);
    }
    catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể thêm vận đơn vào bảng kê.';
      setAddWaybillsError(message);
      setActionError(message);
    }
    finally { setIsSubmitting(false); }
  }
  function confirmRemoveWaybill(waybill: ManifestWaybill) { if (!detailManifest) return; setConfirmDialog({ title: 'Gỡ vận đơn', message: `Gỡ vận đơn ${waybill.waybill_code || waybill.id} khỏi bảng kê?`, confirmLabel: 'Gỡ', danger: true, onConfirm: async () => { try { await apiRequest(`/manifests/${detailManifest.id}/waybills/${waybill.id}`, { method: 'DELETE' }); await openDetail(detailManifest); await fetchManifests(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể gỡ vận đơn.'); } } }); }
  function closePrint() { setIsPrintClosing(true); window.setTimeout(() => { setIsPrintOpen(false); setPrintManifest(null); setIsPrintClosing(false); }, 180); }
  async function openPrint(manifest: LoadPlanningManifest) {
    setIsPrintOpen(true);
    setIsPrintLoading(true);
    setPrintManifest(manifest);
    try {
      setPrintManifest(await apiRequest<LoadPlanningManifest>(`/manifests/${manifest.id}`));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu in.');
    } finally {
      setIsPrintLoading(false);
    }
  }

  if (!allowed) {
    return (
      <div className="h-full min-h-0 flex flex-col gap-2">
        <StateBlock icon={<AlertTriangle size={22} />} title="Không có quyền truy cập trang bảng kê." />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 flex items-center gap-2"><AlertTriangle size={16} />{actionError}</div>}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:ml-2 md:inline text-[13px] font-bold">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value, page: 1 })} placeholder="Tìm mã bảng kê, seal, chuyến xe..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button title="Mở bộ lọc" onClick={openFilters} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
            <div className="hidden flex-1 md:block" />
            <button disabled={!canManageManifest} onClick={openAdd} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-extrabold text-white hover:bg-primary/90"><Plus size={16} /><span className="hidden sm:inline">Thêm</span></button>
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple icon={PackageCheck} placeholder="Trạng thái bảng kê" options={statusOptions} value={filters.status} onValueChange={value => updateFilters({ status: value, page: 1 })} />
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục đi" options={hubOptions} value={filters.origin_hub_id} onValueChange={value => updateFilters({ origin_hub_id: value, page: 1 })} />
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục đến" options={hubOptions} value={filters.dest_hub_id} onValueChange={value => updateFilters({ dest_hub_id: value, page: 1 })} />
            <FilterSelect multiple icon={Truck} placeholder="Chuyến xe" options={tripOptions} value={filters.trip_id} onValueChange={value => updateFilters({ trip_id: value, page: 1 })} />
            <DateInput label="Từ ngày" value={filters.date_from} onChange={value => updateFilters({ date_from: value, page: 1 })} />
            <DateInput label="Đến ngày" value={filters.date_to} onChange={value => updateFilters({ date_to: value, page: 1 })} />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 w-full flex-col overflow-auto custom-scrollbar">
          {isLoading ? (
            <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải danh sách bảng kê..." />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={22} />} title={error} />
          ) : (
            <ManifestTransitBoard
              expectedFromHcm={expectedFromHcmManifests}
              departedFromHan={departedFromHanManifests}
              onDetail={openDetail}
              onPrint={openPrint}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] font-bold text-muted-foreground">{`${transitManifestCount} xe đang chạy · ${rangeStart}-${rangeEnd}/Tổng:${total}`}</p><div className="flex items-center gap-2"><SearchableSelect value={String(filters.limit)} onValueChange={value => updateFilters({ limit: Number(value), page: 1 })} options={[{ value: '20', label: '20' }, { value: '50', label: '50' }, { value: '100', label: '100' }]} className="h-9 w-[88px] rounded-lg bg-white px-3 text-[13px] text-muted-foreground" searchPlaceholder="Tìm số dòng..." /><span className="hidden text-[12px] text-muted-foreground sm:inline">/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronLeft size={16} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilters({ page: filters.page + 1 })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronRight size={16} /></button><span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-primary px-2 text-[13px] font-bold text-white">{filters.page}</span><span className="text-[13px] font-bold text-foreground">/ {totalPages}</span></div></div></div>
      </div>
      <FilterBottomSheet isOpen={isFilterOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} groupSearch={groupSearch} setGroupSearch={setGroupSearch} hubOptions={hubOptions} tripOptions={tripOptions} onClose={() => setIsFilterOpen(false)} onApply={applyFilters} />
      <ManifestDetailDialog isOpen={isDetailOpen} isClosing={isDetailClosing} isLoading={isDetailLoading} isSubmitting={isSubmitting} manifest={detailManifest} statusConfig={statusConfig} canManage={canManageManifest} showHubDeliveryStatus={userHubView === 'HCM'} onClose={closeDetail} onRemoveWaybill={confirmRemoveWaybill} onUpdateDispatchFields={updateDetailDispatchFields} onUpdateExpectedArrival={updateExpectedArrival} />
      <AddEditManifestDialog isOpen={isFormOpen} isClosing={isFormClosing} isEditMode={isEditMode} isSubmitting={isSubmitting} formState={formState} hubs={hubs} onChange={(key, value) => setFormState(prev => ({ ...prev, [key]: value }))} onClose={closeForm} onSubmit={submitForm} />
      <AddWaybillsToManifestDialog isOpen={isAddWaybillsOpen} isClosing={isAddWaybillsClosing} isLoading={isWaybillLoading} isSubmitting={isSubmitting} error={addWaybillsError} manifest={addWaybillsManifest} originHubLabel={addWaybillsManifest ? resolveManifestOriginHubLabel(addWaybillsManifest, hubs) : '—'} waybills={waybillChoices} total={waybillTotal} formState={addWaybillsForm} onChange={patch => setAddWaybillsForm(prev => ({ ...prev, ...patch }))} onClose={closeAddWaybills} onSubmit={submitAddWaybills} />
      <PrintManifestDialog isOpen={isPrintOpen} isClosing={isPrintClosing} isLoading={isPrintLoading} manifest={printManifest} showPricing={canViewPricing(roleMask)} onClose={closePrint} />
      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
      <AssignManifestTripDialog isOpen={isAssignOpen} isClosing={isAssignClosing} isSubmitting={isSubmitting} manifest={assignManifest} trips={trips} formState={assignForm} onChange={trip_id => setAssignForm({ trip_id })} onClose={closeAssign} onSubmit={submitAssign} />
    </div>
  );
}

function ManifestTransitBoard({
  expectedFromHcm,
  departedFromHan,
  onDetail,
  onPrint,
}: {
  expectedFromHcm: LoadPlanningManifest[];
  departedFromHan: LoadPlanningManifest[];
  onDetail: (manifest: LoadPlanningManifest) => void;
  onPrint: (manifest: LoadPlanningManifest) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-4">
      <ManifestTransitTable
        title="Xe dự kiến tới"
        tone="border-orange-200 bg-orange-50 text-orange-800"
        emptyText="Chưa có xe khởi hành từ TP.HCM."
        manifests={expectedFromHcm}
        onDetail={onDetail}
        onPrint={onPrint}
      />
      <ManifestTransitTable
        title="Xe đi từ Hà Nội"
        tone="border-blue-200 bg-blue-50 text-blue-800"
        emptyText="Chưa có xe khởi hành từ Hà Nội."
        manifests={departedFromHan}
        onDetail={onDetail}
        onPrint={onPrint}
      />
    </div>
  );
}

function ManifestTransitTable({
  title,
  tone,
  emptyText,
  manifests,
  onDetail,
  onPrint,
}: {
  title: string;
  tone: string;
  emptyText: string;
  manifests: LoadPlanningManifest[];
  onDetail: (manifest: LoadPlanningManifest) => void;
  onPrint: (manifest: LoadPlanningManifest) => void;
}) {
  return (
    <section className="flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white lg:min-h-0 lg:h-full">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 shrink-0">
        <h2 className="text-[13px] font-extrabold text-foreground">{title}</h2>
        <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-extrabold', tone)}>{manifests.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {manifests.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <tbody>
              {manifests.map((manifest) => (
                <tr key={manifest.id} className="border-b border-border/70 last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2 align-middle">
                    <button type="button" onClick={() => onDetail(manifest)} className="w-full text-left">
                      <p className="truncate text-[13px] font-extrabold text-foreground">
                        {manifestCode(manifest)} · {hubLabel(manifest.origin_hub, manifest.origin_hub_id)} → {hubLabel(manifest.dest_hub, manifest.dest_hub_id)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                        {formatManifestSubline(manifest)}
                      </p>
                    </button>
                  </td>
                  <td className="w-[88px] px-2 py-2 align-middle">
                    <div className="flex justify-end gap-1">
                      <IconAction label="Xem chi tiết" onClick={() => onDetail(manifest)} icon={<Eye size={14} />} />
                      <IconAction label="In bảng kê" onClick={() => onPrint(manifest)} icon={<Printer size={14} />} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function IconAction({ label, hint, icon, disabled, danger, onClick }: { label: string; hint?: string; icon: ReactNode; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return <button type="button" title={hint || label} aria-label={label} disabled={disabled} onClick={onClick} className={clsx('inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45', danger && 'text-red-500 hover:bg-red-50')}>{icon}</button>;
}
function StateBlock({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex-1 min-h-[360px] flex items-center justify-center"><div className="flex flex-col items-center gap-3 text-center text-muted-foreground"><div className="text-primary">{icon}</div><p className="text-[13px] font-bold">{title}</p></div></div>; }
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground"><CalendarDays size={15} /><span>{label}</span><input type="date" value={value} onChange={event => onChange(event.target.value)} className="bg-transparent text-foreground outline-none" /></label>; }

function FilterBottomSheet({ isOpen, draftFilters, setDraftFilters, openGroups, setOpenGroups, groupSearch, setGroupSearch, hubOptions, tripOptions, onClose, onApply }: { isOpen: boolean; draftFilters: LoadPlanningFilters; setDraftFilters: Dispatch<SetStateAction<LoadPlanningFilters>>; openGroups: string[]; setOpenGroups: Dispatch<SetStateAction<string[]>>; groupSearch: Record<string, string>; setGroupSearch: Dispatch<SetStateAction<Record<string, string>>>; hubOptions: FilterOption[]; tripOptions: FilterOption[]; onClose: () => void; onApply: () => void }) {
  if (!isOpen) return null;
  const groups = [{ id: 'status', title: 'Trạng thái bảng kê', key: 'status' as const, options: statusOptions }, { id: 'origin', title: 'Bưu cục đi', key: 'origin_hub_id' as const, options: hubOptions }, { id: 'dest', title: 'Bưu cục đến', key: 'dest_hub_id' as const, options: hubOptions }, { id: 'trip', title: 'Chuyến xe', key: 'trip_id' as const, options: tripOptions }];
  const toggleGroup = (id: string) => setOpenGroups(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  const setArray = (key: 'status' | 'origin_hub_id' | 'dest_hub_id' | 'trip_id', value: string[]) => setDraftFilters(prev => ({ ...prev, [key]: value }));
  return <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden"><div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} /><div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Bộ lọc</p><h2 className="text-lg font-extrabold text-foreground">Đóng xếp hàng</h2></div><button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground"><X size={18} /></button></div><div className="flex-1 overflow-auto p-4 custom-scrollbar">{groups.map(group => <FilterGroup key={group.id} id={group.id} title={group.title} isOpen={openGroups.includes(group.id)} search={groupSearch[group.id] || ''} options={group.options} value={draftFilters[group.key]} onToggle={() => toggleGroup(group.id)} onSearch={value => setGroupSearch(prev => ({ ...prev, [group.id]: value }))} onChange={value => setArray(group.key, value)} />)}<div className="mt-3 rounded-2xl border border-border bg-white p-4"><p className="mb-3 text-[13px] font-extrabold text-foreground">Khoảng thời gian</p><div className="grid gap-3"><input type="date" value={draftFilters.date_from} onChange={event => setDraftFilters(prev => ({ ...prev, date_from: event.target.value }))} className="h-11 rounded-xl border border-border px-3 text-[13px] font-bold outline-none" /><input type="date" value={draftFilters.date_to} onChange={event => setDraftFilters(prev => ({ ...prev, date_to: event.target.value }))} className="h-11 rounded-xl border border-border px-3 text-[13px] font-bold outline-none" /></div></div></div><div className="border-t border-border bg-white p-4"><button onClick={onApply} className="h-11 w-full rounded-xl bg-primary text-[13px] font-extrabold text-white">Áp dụng</button></div></div></div>;
}
function FilterGroup({ id, title, isOpen, search, options, value, onToggle, onSearch, onChange }: { id: string; title: string; isOpen: boolean; search: string; options: FilterOption[]; value: string[]; onToggle: () => void; onSearch: (value: string) => void; onChange: (value: string[]) => void }) { const filtered = options.filter(option => option.label.toLowerCase().includes(search.toLowerCase())); return <div className="mb-3 rounded-2xl border border-border bg-white"><button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="text-[13px] font-extrabold text-foreground">{title}</span><ChevronDown size={16} className={clsx('text-muted-foreground transition-transform', isOpen && 'rotate-180')} /></button>{isOpen && <div className="border-t border-border p-3"><div className="relative mb-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => onSearch(event.target.value)} placeholder={`Tìm ${title.toLowerCase()}`} className="h-10 w-full rounded-xl border border-border pl-9 pr-3 text-[13px] outline-none" /></div><div className="mb-2 flex items-center gap-2"><button onClick={() => onChange(options.map(option => option.value))} className="text-[12px] font-bold text-primary">Chọn tất cả</button><button onClick={() => onChange([])} className="text-[12px] font-bold text-red-500">Xóa chọn</button></div><div className="max-h-52 overflow-auto custom-scrollbar">{filtered.map(option => <label key={`${id}-${option.value}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-muted/60"><input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])} className="h-4 w-4 rounded border-border" /><span>{option.label}</span></label>)}</div></div>}</div>; }











