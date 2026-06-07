import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, Edit, Eye, Filter, GripVertical, LayoutGrid, Loader2, MapPin, Phone, Plus, Power, Search, Tag, Trash2, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../lib/api';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { FilterSelect } from '../../components/ui/FilterSelect';
import type { AuthUserProfile } from '../login/types';
import AddEditHubDialog from './hubs/dialogs/AddEditHubDialog';
import HubDetailDialog from './hubs/dialogs/HubDetailDialog';
import type { FilterOption, Hub, HubFilters, HubFormState, HubListResponse, HubManager, HubMutationPayload } from './hubs/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

type HubTableColumnId = 'code' | 'name' | 'type' | 'address' | 'manager' | 'phone' | 'status' | 'actions';

const typeOptions: FilterOption[] = [
  { value: '', label: 'Tất cả loại hub' },
  { value: 'POST_OFFICE', label: 'Bưu cục' },
  { value: 'WAREHOUSE', label: 'Kho' },
  { value: 'HUB', label: 'Hub trung chuyển' },
];

const statusOptions: FilterOption[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'true', label: 'Đang hoạt động' },
  { value: 'false', label: 'Tạm tắt' },
];

const hubTableHeaders: Array<{ id: HubTableColumnId; label: string; className?: string; locked?: boolean }> = [
  { id: 'code', label: 'Mã hub', locked: true },
  { id: 'name', label: 'Tên bưu cục/kho' },
  { id: 'type', label: 'Loại' },
  { id: 'address', label: 'Địa chỉ', className: 'min-w-[260px]' },
  { id: 'manager', label: 'Người quản lý' },
  { id: 'phone', label: 'Số điện thoại' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'actions', label: 'Thao tác', className: 'w-[132px] min-w-[132px]', locked: true },
];

const defaultVisibleHubColumns = hubTableHeaders.map(header => header.id);
const defaultHubColumnOrder = hubTableHeaders.map(header => header.id);

const emptyForm: HubFormState = {
  code: '', name: '', type: 'POST_OFFICE', address: '', province: '', district: '', ward: '', coordinates: '', manager_id: '', manager_name: '', manager_phone: '', phone: '', status: 'true',
};

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const isManager = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;
const isDirector = (roleMask: number) => (roleMask & DIRECTOR) !== 0;
const normalizeId = (value?: string | number | null) => value == null ? '' : String(value);
const normalizeStatus = (hub: Hub) => (hub.is_active === false || hub.status === 'INACTIVE' ? 'false' : 'true');
const normalizeList = (response: HubListResponse | Hub[]) => Array.isArray(response) ? response : response.data || response.items || response.hubs || [];
const normalizeTotal = (response: HubListResponse | Hub[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const normalizePage = (response: HubListResponse | Hub[], fallback: number) => Array.isArray(response) ? fallback : response.page ?? response.meta?.page ?? fallback;
const normalizeLimit = (response: HubListResponse | Hub[], fallback: number) => Array.isArray(response) ? fallback : response.limit ?? response.meta?.limit ?? fallback;
const formatType = (type?: string | null) => typeOptions.find(option => option.value === type)?.label || type || '—';
const formatStatus = (hub: Hub) => statusOptions.find(option => option.value === normalizeStatus(hub))?.label || normalizeStatus(hub);
const getManagerName = (hub: Hub) => hub.manager_name || hub.manager?.name || hub.manager?.full_name || hub.manager?.username || 'Chưa phân công';
const getManagerPhone = (hub: Hub) => hub.manager_phone || hub.manager?.phone || hub.phone || '—';
const formatAddress = (hub: Hub) => [hub.address, hub.ward, hub.district, hub.province].filter(Boolean).join(', ') || '—';
const countRisk = (hub: Hub) => (hub.active_waybills_count ?? hub.usage_summary?.active_waybills ?? hub.usage_summary?.waybills ?? 0)
  + (hub.active_trips_count ?? hub.usage_summary?.active_trips ?? hub.usage_summary?.trips ?? 0)
  + (hub.active_users_count ?? hub.usage_summary?.active_users ?? hub.usage_summary?.users ?? 0);
const closeWithAnimation = (setClosing: (value: boolean) => void, setOpen: (value: boolean) => void) => { setClosing(true); window.setTimeout(() => { setOpen(false); setClosing(false); }, 300); };

const buildHubMutationPayload = (formState: HubFormState): HubMutationPayload => {
  const payload: HubMutationPayload = {
    code: formState.code.trim().toUpperCase(),
    name: formState.name.trim(),
    type: formState.type,
    address: formState.address.trim(),
    province: formState.province.trim(),
    district: formState.district.trim(),
  };

  const ward = formState.ward.trim();
  const coordinates = formState.coordinates.trim();
  const phone = formState.phone.trim();
  const managerName = formState.manager_name.trim();
  const managerPhone = formState.manager_phone.trim();

  if (ward) payload.ward = ward;
  if (coordinates) payload.coordinates = coordinates;
  if (phone) payload.phone = phone;
  if (managerName) payload.manager_name = managerName;
  if (managerPhone) payload.manager_phone = managerPhone;

  const coordMatch = coordinates.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    payload.latitude = Number(coordMatch[1]);
    payload.longitude = Number(coordMatch[2]);
  }

  return payload;
};

export default function AdminHubsPage() {
  const [filters, setFilters] = useState<HubFilters>({ keyword: '', status: '', province: '', district: '', type: '', page: 1, limit: 10 });
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [managers, setManagers] = useState<HubManager[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [detailHub, setDetailHub] = useState<Hub | null>(null);
  const [formState, setFormState] = useState<HubFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<HubTableColumnId[]>(defaultVisibleHubColumns);
  const [columnOrder, setColumnOrder] = useState<HubTableColumnId[]>(defaultHubColumnOrder);
  const [selectedHubIds, setSelectedHubIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const user = useMemo(getStoredUser, []);
  const canManage = isManager(user?.role_mask ?? 0);
  const canDelete = isDirector(user?.role_mask ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const activeFilterCount = [filters.status, filters.type, filters.province, filters.district].filter(Boolean).length;
  const provinceOptions = useMemo(() => [{ value: '', label: 'Tất cả tỉnh/thành' }, ...Array.from(new Set(hubs.map(hub => hub.province).filter(Boolean))).map(value => ({ value: value as string, label: value as string }))], [hubs]);
  const districtOptions = useMemo(() => [{ value: '', label: 'Tất cả quận/huyện' }, ...Array.from(new Set(hubs.map(hub => hub.district).filter(Boolean))).map(value => ({ value: value as string, label: value as string }))], [hubs]);
  const managerOptions = useMemo(() => [{ value: '', label: 'Chưa phân công' }, ...managers.map(manager => ({ value: normalizeId(manager.id), label: manager.name || manager.full_name || manager.username || `Nhân sự #${manager.id}` }))], [managers]);
  const orderedVisibleHeaders = columnOrder.map(columnId => hubTableHeaders.find(header => header.id === columnId)).filter((header): header is (typeof hubTableHeaders)[number] => Boolean(header)).filter(header => visibleColumns.includes(header.id));
  const selectableHubIds = hubs.map(hub => normalizeId(hub.id)).filter(Boolean);
  const selectedBulkDeleteCount = selectedHubIds.length;
  const isAllVisibleSelected = selectableHubIds.length > 0 && selectableHubIds.every(id => selectedHubIds.includes(id));

  async function fetchHubs() {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== undefined && value !== null) params.set(key, String(value)); });
      const response = await apiRequest<HubListResponse | Hub[]>(`/hubs?${params.toString()}`);
      const items = normalizeList(response);
      setHubs(items); setTotal(normalizeTotal(response, items.length));
      setFilters(prev => ({ ...prev, page: normalizePage(response, prev.page), limit: normalizeLimit(response, prev.limit) }));
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Không thể tải danh sách bưu cục.'); setHubs([]); setTotal(0);
    } finally { setIsLoading(false); }
  }

  async function fetchManagers() {
    try {
      const response = await apiRequest<HubManager[] | { data?: HubManager[]; items?: HubManager[] }>('/users');
      setManagers(Array.isArray(response) ? response : response.data || response.items || []);
    } catch {
      setActionError('Không thể tải danh sách nhân sự.');
    }
  }

  useEffect(() => { void fetchHubs(); }, [filters.keyword, filters.status, filters.province, filters.district, filters.type, filters.page, filters.limit]);
  useEffect(() => { void fetchManagers(); }, []);

  const updateFilter = <K extends keyof HubFilters>(key: K, value: HubFilters[K]) => setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  const setFormField = <K extends keyof HubFormState>(key: K, value: HubFormState[K]) => { setFormState(prev => ({ ...prev, [key]: value })); setActionError(''); };
  const clearFilters = () => setFilters(prev => ({ ...prev, status: '', province: '', district: '', type: '', page: 1 }));
  const setSingleFilter = (key: 'status' | 'type' | 'province' | 'district', value: string[]) => updateFilter(key, (value[0] || '') as HubFilters[typeof key]);
  const toggleColumn = (columnId: HubTableColumnId) => setVisibleColumns(prev => prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]);
  const reorderColumn = (sourceId: HubTableColumnId, targetId: HubTableColumnId) => setColumnOrder(prev => moveColumn(prev, sourceId, targetId));
  const toggleHubSelection = (hubId: string) => setSelectedHubIds(prev => prev.includes(hubId) ? prev.filter(id => id !== hubId) : [...prev, hubId]);
  const toggleAllVisibleHubs = () => setSelectedHubIds(prev => isAllVisibleSelected ? prev.filter(id => !selectableHubIds.includes(id)) : Array.from(new Set([...prev, ...selectableHubIds])));
  const clearHubSelection = () => setSelectedHubIds([]);

  const hubToForm = (hub: Hub): HubFormState => ({
    code: hub.code?.toUpperCase() || '', name: hub.name || '', type: hub.type || 'POST_OFFICE', address: hub.address || '', province: hub.province || '', district: hub.district || '', ward: hub.ward || '', coordinates: hub.coordinates || '', manager_id: normalizeId(hub.manager_id ?? hub.manager?.id), manager_name: getManagerName(hub) === 'Chưa phân công' ? '' : getManagerName(hub), manager_phone: getManagerPhone(hub) === '—' ? '' : getManagerPhone(hub), phone: hub.phone || '', status: normalizeStatus(hub),
  });

  function openAdd() { setSelectedHub(null); setFormState(emptyForm); setIsEditMode(false); setIsFormOpen(true); setActionError(''); }
  function openEdit(hub: Hub) { setSelectedHub(hub); setFormState(hubToForm(hub)); setIsEditMode(true); setIsFormOpen(true); setActionError(''); }
  const closeForm = () => closeWithAnimation(setIsFormClosing, setIsFormOpen);
  const openDetail = async (hub: Hub) => { setActionError(''); try { setDetailHub(await apiRequest<Hub>(`/hubs/${hub.id}`)); } catch { setDetailHub(hub); } };
  const closeDetail = () => { setIsDetailClosing(true); window.setTimeout(() => { setDetailHub(null); setIsDetailClosing(false); }, 300); };
  const editFromDetail = () => { if (!detailHub) return; const hub = detailHub; setDetailHub(null); setIsDetailClosing(false); openEdit(hub); };

  async function submitForm() {
    if (!formState.code.trim() || !formState.name.trim()) { setActionError('Vui lòng nhập mã hub và tên bưu cục/kho.'); return; }
    if (!formState.address.trim()) { setActionError('Vui lòng nhập địa chỉ.'); return; }
    if (!formState.province.trim()) { setActionError('Vui lòng nhập tỉnh/thành.'); return; }
    if (!formState.district.trim()) { setActionError('Vui lòng nhập quận/huyện.'); return; }
    setIsSubmitting(true); setActionError('');
    const payload = buildHubMutationPayload(formState);
    try {
      if (isEditMode && selectedHub) await apiRequest<Hub>(`/hubs/${selectedHub.id}`, { method: 'PATCH', body: payload });
      else await apiRequest<Hub>('/hubs', { method: 'POST', body: payload });
      closeForm(); await fetchHubs();
    } catch (submitError) { setActionError(submitError instanceof ApiError ? submitError.message : 'Không thể lưu thông tin bưu cục.'); }
    finally { setIsSubmitting(false); }
  }

  async function confirmStatus(hub: Hub) {
    const nextStatus = normalizeStatus(hub) === 'true' ? 'false' : 'true';
    const risk = countRisk(hub);
    const warning = risk > 0 ? ` Hub còn ${risk} vận đơn/chuyến xe/nhân sự active.` : '';
    setConfirmDialog({ title: 'Cập nhật trạng thái', message: `Xác nhận ${nextStatus === 'true' ? 'bật hoạt động' : 'tắt hoạt động'} hub ${hub.code?.toUpperCase()}?${warning}`, confirmLabel: 'Cập nhật', onConfirm: async () => { try { await apiRequest<Hub>(`/hubs/${hub.id}/status`, { method: 'PATCH', body: { is_active: nextStatus === 'true' } }); await fetchHubs(); } catch (statusError) { setActionError(statusError instanceof ApiError ? statusError.message : 'Không thể cập nhật trạng thái hub.'); } } });
  }

  async function confirmDelete(hub: Hub) {
    const risk = countRisk(hub);
    const warning = risk > 0 ? ` Hub còn ${risk} vận đơn/chuyến xe/nhân sự active.` : '';
    setConfirmDialog({ title: 'Xóa bưu cục', message: `Xóa bưu cục ${hub.code?.toUpperCase()}? Thao tác này chỉ dành cho DIRECTOR.${warning}`, confirmLabel: 'Xóa', danger: true, onConfirm: async () => { try { await apiRequest<void>(`/hubs/${hub.id}`, { method: 'DELETE' }); setSelectedHubIds(prev => prev.filter(id => id !== normalizeId(hub.id))); if (detailHub && normalizeId(detailHub.id) === normalizeId(hub.id)) closeDetail(); await fetchHubs(); } catch (deleteError) { setActionError(deleteError instanceof ApiError ? deleteError.message : 'Chưa thể xóa bưu cục lúc này.'); } } });
  }

  async function confirmBulkDelete() {
    if (!selectedHubIds.length) return;
    setConfirmDialog({ title: 'Xóa nhiều bưu cục', message: `Xóa ${selectedHubIds.length} bưu cục đã chọn? Thao tác này chỉ dành cho DIRECTOR nếu backend hỗ trợ.`, confirmLabel: 'Xóa', danger: true, onConfirm: async () => { setIsSubmitting(true); setActionError(''); try { await Promise.all(selectedHubIds.map(id => apiRequest<void>(`/hubs/${id}`, { method: 'DELETE' }))); setSelectedHubIds([]); await fetchHubs(); } catch (deleteError) { setActionError(deleteError instanceof ApiError ? deleteError.message : 'Không thể xóa các bưu cục đã chọn.'); } finally { setIsSubmitting(false); } } });
  }

  function renderHubCell(columnId: HubTableColumnId, hub: Hub) {
    switch (columnId) {
      case 'code': return <td key={columnId} className="border-r border-border px-4 py-3"><div className="text-[13px] font-extrabold text-primary">{hub.code?.toUpperCase()}</div></td>;
      case 'name': return <td key={columnId} className="border-r border-border px-4 py-3"><div className="text-[13px] font-bold text-foreground">{hub.name}</div><div className="text-[11px] font-medium text-muted-foreground">{hub.province || 'Chưa có tỉnh/thành'}</div></td>;
      case 'type': return <td key={columnId} className="border-r border-border px-4 py-3"><TypeBadge type={hub.type} /></td>;
      case 'address': return <td key={columnId} className="max-w-[320px] truncate border-r border-border px-4 py-3 text-[13px] font-medium text-muted-foreground">{formatAddress(hub)}</td>;
      case 'manager': return <td key={columnId} className="border-r border-border px-4 py-3 text-[13px] font-medium text-muted-foreground">{getManagerName(hub)}</td>;
      case 'phone': return <td key={columnId} className="border-r border-border px-4 py-3 text-[13px] font-medium text-muted-foreground">{getManagerPhone(hub)}</td>;
      case 'status': return <td key={columnId} className="border-r border-border px-4 py-3"><StatusBadge hub={hub} /></td>;
      case 'actions': return <td key={columnId} className="px-4 py-3"><div className="flex items-center gap-1.5"><IconButton title="Xem chi tiết" onClick={() => void openDetail(hub)} icon={<Eye size={15} />} />{canManage && <IconButton title="Chỉnh sửa" onClick={() => openEdit(hub)} icon={<Edit size={15} />} />}{canManage && <IconButton title={normalizeStatus(hub) === 'true' ? 'Tắt hoạt động' : 'Bật hoạt động'} onClick={() => void confirmStatus(hub)} icon={<Power size={15} />} warning={normalizeStatus(hub) === 'true'} />}{canDelete && <IconButton title="Xóa" onClick={() => void confirmDelete(hub)} icon={<Trash2 size={15} />} danger />}</div></td>;
      default: return null;
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 flex items-center gap-2 shrink-0"><AlertTriangle size={16} />{actionError}</div>}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
          {canDelete && selectedBulkDeleteCount > 0 && <div className="flex items-center justify-between md:hidden"><div className="flex items-center gap-4"><span className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-[15px] font-black text-white">✓{selectedBulkDeleteCount}</span><button onClick={clearHubSelection} className="h-10 px-2 text-[18px] font-medium text-muted-foreground">×</button></div><button disabled={isSubmitting} onClick={() => void confirmBulkDelete()} className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm shadow-red-500/20 disabled:opacity-60"><Trash2 size={20} /></button></div>}
          <div className={clsx("flex-wrap items-center gap-2", canDelete && selectedBulkDeleteCount > 0 ? "hidden md:flex" : "flex")}>
            <button onClick={() => window.history.back()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted md:w-auto md:px-3 md:gap-2 md:text-[13px] md:font-bold"><ArrowLeft size={16} /><span className="hidden md:inline">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilter('keyword', event.target.value)} placeholder="Tìm mã, tên, địa chỉ..." className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button onClick={() => setIsFilterPanelOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}</button>
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <ColumnSettings columns={hubTableHeaders} columnOrder={columnOrder} visibleColumns={visibleColumns} onToggle={toggleColumn} onReorder={reorderColumn} />
              {canManage && <button onClick={openAdd} className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-white shadow-sm shadow-primary/20"><Plus size={18} /><span className="text-[13px] font-bold">Thêm</span></button>}
            </div>
            {canManage && <button onClick={openAdd} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20 md:hidden"><Plus size={18} /></button>}
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect value={filters.type} options={typeOptions} onValueChange={value => updateFilter('type', value)} placeholder="Loại hub" icon={Building2} className="w-[170px]" />
            <FilterSelect value={filters.status} options={statusOptions} onValueChange={value => updateFilter('status', value)} placeholder="Trạng thái" icon={Tag} className="w-[170px]" />
            <FilterSelect value={filters.province} options={provinceOptions} onValueChange={value => updateFilter('province', value)} placeholder="Tỉnh/thành" icon={MapPin} className="w-[180px]" />
            <FilterSelect value={filters.district} options={districtOptions} onValueChange={value => updateFilter('district', value)} placeholder="Quận/huyện" icon={MapPin} className="w-[180px]" />
            {activeFilterCount > 0 && <button onClick={clearFilters} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground hover:bg-muted"><X size={14} />Xóa {activeFilterCount} bộ lọc</button>}
          </div>
        </div>

        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải danh sách bưu cục" description="Đang cập nhật dữ liệu bưu cục mới nhất." /> : error ? <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} /> : hubs.length === 0 ? <StateBlock icon={<Building2 size={24} />} title="Chưa có bưu cục phù hợp" description="Thử đổi bộ lọc hoặc tạo bưu cục mới nếu bạn có quyền MANAGER+." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            {canDelete && selectedBulkDeleteCount > 0 && <div className="sticky top-0 z-10 hidden flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-[13px] font-bold text-primary md:flex"><span>Đã chọn {selectedBulkDeleteCount} bưu cục để xóa</span><div className="flex items-center gap-2"><button onClick={clearHubSelection} className="h-8 rounded-lg border border-border bg-white px-3 text-[12px] text-muted-foreground hover:bg-muted">Bỏ chọn</button><button disabled={isSubmitting} onClick={() => void confirmBulkDelete()} className="h-8 rounded-lg bg-red-600 px-3 text-[12px] text-white hover:bg-red-700 disabled:opacity-60">Xóa đã chọn</button></div></div>}

            <table className="hidden md:table w-full min-w-[980px] text-left border-collapse"><thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr><th className="w-11 px-4 py-2.5 border-r border-border"><input type="checkbox" checked={isAllVisibleSelected} disabled={!hubs.length || !canDelete} onChange={toggleAllVisibleHubs} className="h-4 w-4 rounded border-border disabled:opacity-40" /></th>{orderedVisibleHeaders.map(header => <th key={header.id} className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}>{header.label}</th>)}</tr></thead><tbody>{hubs.map(hub => { const hubId = normalizeId(hub.id); return <tr key={hub.id} onClick={() => void openDetail(hub)} className="cursor-pointer border-b border-border transition-colors hover:bg-muted/10"><td className="px-4 py-3 border-r border-border"><input type="checkbox" checked={selectedHubIds.includes(hubId)} disabled={!canDelete} onClick={event => event.stopPropagation()} onChange={() => toggleHubSelection(hubId)} className="h-4 w-4 rounded border-border disabled:opacity-40" /></td>{orderedVisibleHeaders.map(header => renderHubCell(header.id, hub))}</tr>; })}</tbody></table>
            <div className="grid gap-3 p-3 md:hidden">{hubs.map(hub => <HubMobileCard key={hub.id} hub={hub} canManage={canManage} canDelete={canDelete} isSelected={selectedHubIds.includes(normalizeId(hub.id))} canSelect={canDelete} onToggleSelect={() => toggleHubSelection(normalizeId(hub.id))} openDetail={openDetail} openEdit={openEdit} confirmStatus={confirmStatus} confirmDelete={confirmDelete} />)}</div>
          </div>
        )}

        <div className="border-t border-border bg-card flex flex-col items-center justify-between gap-1 px-2 py-1 text-[11px] text-muted-foreground shrink-0 sm:flex-row sm:gap-3 sm:px-4 sm:py-2 sm:text-[12px]"><span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (hubs.length ? 1 : 0)}–{(filters.page - 1) * filters.limit + hubs.length}</b>/Tổng:{total}</span><div className="flex items-center gap-2"><select value={filters.limit} onChange={event => updateFilter('limit', Number(event.target.value))} className="h-7 rounded border border-border bg-card px-1.5 text-[11px] focus:outline-none sm:h-8 sm:px-2 sm:text-[12px]">{[10, 20, 50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="rounded-lg border border-border bg-card p-1.5 disabled:opacity-40 hover:bg-muted sm:p-2"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="rounded-lg border border-border bg-card p-1.5 disabled:opacity-40 hover:bg-muted sm:p-2"><ChevronRight size={15} /></button><span className="flex h-7 items-center rounded bg-primary px-2 text-[11px] font-bold text-white sm:h-8 sm:text-[12px]">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div></div>
      </div>

      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} groups={[{ id: 'type', title: 'Loại hub', icon: Building2, options: typeOptions.filter(option => option.value), value: filters.type ? [filters.type] : [], onChange: value => setSingleFilter('type', value) }, { id: 'status', title: 'Trạng thái', icon: Tag, options: statusOptions.filter(option => option.value), value: filters.status ? [filters.status] : [], onChange: value => setSingleFilter('status', value) }, { id: 'province', title: 'Tỉnh/thành', icon: MapPin, options: provinceOptions.filter(option => option.value), value: filters.province ? [filters.province] : [], onChange: value => setSingleFilter('province', value) }, { id: 'district', title: 'Quận/huyện', icon: MapPin, options: districtOptions.filter(option => option.value), value: filters.district ? [filters.district] : [], onChange: value => setSingleFilter('district', value) }]} />
      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
      <AddEditHubDialog isOpen={isFormOpen} isClosing={isFormClosing} isEditMode={isEditMode} isSubmitting={isSubmitting} onClose={closeForm} onSubmit={submitForm} formState={formState} setFormField={setFormField} typeOptions={typeOptions} statusOptions={statusOptions} managerOptions={managerOptions} managers={managers} />
      <HubDetailDialog hub={detailHub} isClosing={isDetailClosing} canManage={canManage} onClose={closeDetail} onEdit={editFromDetail} formatStatus={formatStatus} formatType={formatType} />
    </div>
  );
}

function StatusBadge({ hub }: { hub: Hub }) { const status = normalizeStatus(hub); return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold', status === 'true' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600')}>{formatStatus(hub)}</span>; }
function TypeBadge({ type }: { type?: string | null }) { return <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{formatType(type)}</span>; }
function IconButton({ title, icon, onClick, danger, warning }: { title: string; icon: ReactNode; onClick: () => void; danger?: boolean; warning?: boolean }) { return <button title={title} onClick={event => { event.stopPropagation(); onClick(); }} className={clsx('rounded-lg border p-2 transition-colors', danger ? 'border-red-200 text-red-600 hover:bg-red-50' : warning ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>{icon}</button>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-muted-foreground"><div className="mb-3 text-primary">{icon}</div><h3 className="text-[14px] font-bold text-foreground">{title}</h3><p className="mt-1 max-w-md text-[13px]">{description}</p></div>; }

function HubMobileCard({ hub, canManage, canDelete, isSelected, canSelect, onToggleSelect, openDetail, openEdit, confirmStatus, confirmDelete }: { hub: Hub; canManage: boolean; canDelete: boolean; isSelected: boolean; canSelect: boolean; onToggleSelect: () => void; openDetail: (hub: Hub) => void | Promise<void>; openEdit: (hub: Hub) => void; confirmStatus: (hub: Hub) => void | Promise<void>; confirmDelete: (hub: Hub) => void | Promise<void> }) {
  return <article onClick={() => void openDetail(hub)} className={clsx('cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-[border-color,box-shadow] duration-150', isSelected ? 'animate-truck-card-select border-primary ring-1 ring-primary shadow-primary/10' : 'border-border')}><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-primary"><Building2 size={20} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[12px] font-black text-primary">{hub.code?.toUpperCase()}</p><h3 className="mt-1 truncate text-[15px] font-extrabold text-foreground">{hub.name}</h3><p className="mt-1 line-clamp-2 text-[12px] font-medium text-muted-foreground">{formatAddress(hub)}</p></div><input type="checkbox" checked={isSelected} disabled={!canSelect} onClick={event => event.stopPropagation()} onChange={onToggleSelect} className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40" /></div><div className="mt-2"><StatusBadge hub={hub} /></div></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-[12px]"><MobileInfo icon={<Building2 size={14} />} label="Loại" value={formatType(hub.type)} /><MobileInfo icon={<User size={14} />} label="Quản lý" value={getManagerName(hub)} /><MobileInfo icon={<Phone size={14} />} label="Điện thoại" value={getManagerPhone(hub)} /><MobileInfo icon={<MapPin size={14} />} label="Khu vực" value={hub.district || hub.province || '—'} /></div><div className="mt-3 border-t border-border pt-3 flex items-center justify-end gap-1.5">{canManage && <IconButton title="Chỉnh sửa" onClick={() => openEdit(hub)} icon={<Edit size={15} />} />}{canManage && <IconButton title={normalizeStatus(hub) === 'true' ? 'Tắt hoạt động' : 'Bật hoạt động'} onClick={() => void confirmStatus(hub)} icon={<Power size={15} />} warning={normalizeStatus(hub) === 'true'} />}{canDelete && <IconButton title="Xóa" onClick={() => void confirmDelete(hub)} icon={<Trash2 size={15} />} danger />}</div></article>;
}
function MobileInfo({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) { return <div className="rounded-xl border border-border bg-muted/5 p-2"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{icon}{label}</div><p className="mt-1 truncate font-bold text-foreground">{value}</p></div>; }
function moveColumn(columnIds: HubTableColumnId[], sourceId: HubTableColumnId, targetId: HubTableColumnId) { if (sourceId === targetId) return columnIds; const next = [...columnIds]; const sourceIndex = next.indexOf(sourceId); const targetIndex = next.indexOf(targetId); if (sourceIndex < 0 || targetIndex < 0) return columnIds; next.splice(sourceIndex, 1); next.splice(targetIndex, 0, sourceId); return next; }
function ColumnSettings({ columns, columnOrder, visibleColumns, onToggle, onReorder }: { columns: typeof hubTableHeaders; columnOrder: HubTableColumnId[]; visibleColumns: HubTableColumnId[]; onToggle: (columnId: HubTableColumnId) => void; onReorder: (sourceId: HubTableColumnId, targetId: HubTableColumnId) => void }) { const [draggingColumnId, setDraggingColumnId] = useState<HubTableColumnId | null>(null); const orderedColumns = columnOrder.map(columnId => columns.find(column => column.id === columnId)).filter((column): column is (typeof columns)[number] => Boolean(column)); return <details className="relative hidden md:block"><summary title="Cài đặt cột" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"><LayoutGrid size={16} /></summary><div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-border bg-white p-2 shadow-lg"><div className="px-2 pb-2 text-[12px] font-extrabold text-foreground">Cài đặt cột</div><div className="space-y-1">{orderedColumns.map(column => <div key={column.id} draggable onDragStart={event => { setDraggingColumnId(column.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.id); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const sourceId = (event.dataTransfer.getData('text/plain') || draggingColumnId) as HubTableColumnId | null; if (sourceId) onReorder(sourceId, column.id); setDraggingColumnId(null); }} onDragEnd={() => setDraggingColumnId(null)} className={clsx('flex cursor-grab items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium active:cursor-grabbing', draggingColumnId === column.id ? 'bg-blue-50 text-primary opacity-70' : column.locked ? 'text-muted-foreground' : 'text-foreground hover:bg-muted/60')}><GripVertical size={14} className="shrink-0 text-muted-foreground" /><input type="checkbox" checked={visibleColumns.includes(column.id)} disabled={column.locked} onChange={() => onToggle(column.id)} className="h-4 w-4 rounded border-border disabled:opacity-50" /><span>{column.label}</span></div>)}</div></div></details>; }






