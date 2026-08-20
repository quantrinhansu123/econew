import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Edit, Fuel, Gauge, Filter, GripVertical, LayoutGrid, Loader2, Plus, Power, Search, Tag, Trash2, Truck as TruckIcon, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useLocation } from 'react-router-dom';
import { ApiError, apiRequest } from '../../lib/api';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import type { AuthUserProfile } from '../login/types';
import AddEditTruckDialog from './trucks/dialogs/AddEditTruckDialog';
import type { DriverSummary, FilterOption, Truck, TruckFilters, TruckFormState, TruckListResponse } from './trucks/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

type TruckTableColumnId = 'license_plate' | 'payload' | 'driver' | 'fuel_consumption_limit' | 'status' | 'actions';

const statusOptions: FilterOption[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'AVAILABLE', label: 'Sẵn sàng' },
  { value: 'IN_USE', label: 'Đang chạy' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];

const truckTableHeaders: Array<{ id: TruckTableColumnId; label: string; className?: string; locked?: boolean }> = [
  { id: 'license_plate', label: 'Biển số xe', locked: true },
  { id: 'payload', label: 'Tải trọng' },
  { id: 'driver', label: 'Tài xế' },
  { id: 'fuel_consumption_limit', label: 'Định mức dầu' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'actions', label: 'Thao tác', className: 'w-[132px] min-w-[132px]', locked: true },
];

const defaultVisibleTruckColumns = truckTableHeaders.map(header => header.id);
const defaultTruckColumnOrder = truckTableHeaders.map(header => header.id);
const emptyForm: TruckFormState = { license_plate: '', payload: '', driver_id: '', fuel_consumption_limit: '', status: 'AVAILABLE', bks: '', hub_id: '' };

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const isManager = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;
const isDirector = (roleMask: number) => (roleMask & DIRECTOR) !== 0;
const normalizeList = (response: TruckListResponse | Truck[]) => Array.isArray(response) ? response : response.data || response.items || response.trucks || [];
const normalizeTotal = (response: TruckListResponse | Truck[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const normalizeId = (value?: string | number | null) => value == null ? '' : String(value);
const formatPlate = (truck: Truck) => (truck.license_plate || '—').toUpperCase();
const formatOption = (options: FilterOption[], value?: string | null) => options.find(option => option.value === value)?.label || value || '—';
const formatHub = (truck: Truck) => [truck.hub?.code, truck.hub?.name].filter(Boolean).join(' · ') || (truck.hub_id ? `Bưu cục #${truck.hub_id}` : 'Chưa gán');
const getDriverName = (truck: Truck) => truck.ownership_type === 'INTERNAL' ? formatHub(truck) : truck.driver?.name || truck.driver?.full_name || truck.driver?.username || (truck.driver_id ? `Tài xế #${truck.driver_id}` : 'Chưa gán');

export default function AdminTrucksPage() {
  const location = useLocation();
  const internalOnly = location.pathname === '/fleet/internal-vehicles' || location.pathname === '/admin/trucks' || location.pathname === '/trucks';
  const [filters, setFilters] = useState<TruckFilters>({ keyword: '', status: [], driver_id: '', page: 1, limit: 10, ownership_type: internalOnly ? 'INTERNAL' : 'VENDOR' });
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [hubs, setHubs] = useState<Array<{ id: string | number; code?: string; name?: string }>>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [detailTruck, setDetailTruck] = useState<Truck | null>(null);
  const [formState, setFormState] = useState<TruckFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<TruckTableColumnId[]>(defaultVisibleTruckColumns);
  const [columnOrder, setColumnOrder] = useState<TruckTableColumnId[]>(defaultTruckColumnOrder);
  const [selectedTruckIds, setSelectedTruckIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const user = useMemo(getStoredUser, []);
  const canManage = isManager(user?.role_mask ?? 0);
  const canDelete = isDirector(user?.role_mask ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const orderedVisibleHeaders = useMemo(() => columnOrder.map(columnId => truckTableHeaders.find(header => header.id === columnId)).filter((header): header is (typeof truckTableHeaders)[number] => Boolean(header && visibleColumnSet.has(header.id))), [columnOrder, visibleColumnSet]);
  const selectedBulkDeleteCount = selectedTruckIds.length;
  const isAllVisibleSelected = trucks.length > 0 && trucks.every(truck => selectedTruckIds.includes(normalizeId(truck.id)));
  const activeFilterCount = Number(Boolean(filters.keyword.trim())) + filters.status.length + Number(Boolean(filters.driver_id));
  const driverOptions = useMemo(() => [{ value: '', label: 'Chưa gán' }, ...drivers.map(driver => ({ value: normalizeId(driver.id), label: driver.name || driver.full_name || driver.username || `Tài xế #${driver.id}` }))], [drivers]);
  const hubOptions = useMemo(() => hubs
    .filter(hub => ['HAN', 'HCM'].includes(String(hub.code || '').toUpperCase()))
    .map(hub => ({ value: normalizeId(hub.id), label: [hub.code, hub.name].filter(Boolean).join(' · ') || `Bưu cục #${hub.id}` })), [hubs]);
  const filterPanelGroups = useMemo(() => [{ id: 'status', title: 'Trạng thái', icon: Tag, options: statusOptions, value: filters.status, searchPlaceholder: 'Tìm trạng thái...', onChange: (value: string[]) => updateFilter('status', value) }], [filters.status]);

  useEffect(() => { setFilters(prev => ({ ...prev, ownership_type: internalOnly ? 'INTERNAL' : 'VENDOR', page: 1 })); }, [internalOnly]);
  useEffect(() => { void fetchTrucks(); }, [filters]);
  useEffect(() => { if (internalOnly) void fetchHubs(); else void fetchDrivers(); }, [internalOnly]);
  useEffect(() => { setSelectedTruckIds(prev => prev.filter(id => trucks.some(truck => normalizeId(truck.id) === id))); }, [trucks]);

  const updateFilter = <K extends keyof TruckFilters>(key: K, value: TruckFilters[K]) => setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  const setFormField = <K extends keyof TruckFormState>(key: K, value: TruckFormState[K]) => setFormState(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters(prev => ({ ...prev, keyword: '', status: [], driver_id: '', page: 1 }));
  const toggleColumn = (columnId: TruckTableColumnId) => setVisibleColumns(prev => prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]);
  const reorderColumn = (sourceId: TruckTableColumnId, targetId: TruckTableColumnId) => setColumnOrder(prev => moveColumn(prev, sourceId, targetId));
  const toggleTruckSelection = (truckId: string) => setSelectedTruckIds(prev => prev.includes(truckId) ? prev.filter(id => id !== truckId) : [...prev, truckId]);
  const toggleAllVisibleTrucks = () => setSelectedTruckIds(prev => isAllVisibleSelected ? prev.filter(id => !trucks.some(truck => normalizeId(truck.id) === id)) : Array.from(new Set([...prev, ...trucks.map(truck => normalizeId(truck.id))])));
  const clearTruckSelection = () => setSelectedTruckIds([]);

  async function fetchTrucks() {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (Array.isArray(value)) { if (value.length) params.set(key, value.join(',')); } else if (value !== '') params.set(key, String(value)); });
      if (internalOnly) params.set('hub_codes', 'HAN,HCM');
      const response = await apiRequest<TruckListResponse | Truck[]>(`/trucks?${params.toString()}`);
      const items = normalizeList(response);
      setTrucks(items); setTotal(normalizeTotal(response, items.length));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách xe.'); setTrucks([]); setTotal(0); }
    finally { setIsLoading(false); }
  }

  async function fetchDrivers() {
    try {
      const response = await apiRequest<DriverSummary[] | { data?: DriverSummary[]; items?: DriverSummary[] }>('/users?role_mask=4');
      setDrivers(Array.isArray(response) ? response : response.data || response.items || []);
    } catch { setActionError('Không thể tải danh sách tài xế.'); }
  }
  async function fetchHubs() {
    try {
      const response = await apiRequest<Array<{ id: string | number; code?: string; name?: string }> | { data?: Array<{ id: string | number; code?: string; name?: string }>; items?: Array<{ id: string | number; code?: string; name?: string }> }>('/hubs/active');
      setHubs(Array.isArray(response) ? response : response.data || response.items || []);
    } catch { setActionError('Không thể tải danh sách bưu cục hoạt động.'); }
  }

  function openAdd() { setSelectedTruck(null); setIsEditMode(false); setFormState(emptyForm); setIsFormOpen(true); }
  function openEdit(truck: Truck) { setSelectedTruck(truck); setIsEditMode(true); setFormState(toFormState(truck)); setIsFormOpen(true); }
  const closeForm = () => closeWithAnimation(setIsFormClosing, setIsFormOpen);
  const openDetail = (truck: Truck) => { setDetailTruck(truck); setIsDetailClosing(false); };
  const closeDetail = () => { setIsDetailClosing(true); window.setTimeout(() => { setDetailTruck(null); setIsDetailClosing(false); }, 300); };
  const editFromDetail = (truck: Truck) => { setDetailTruck(null); setIsDetailClosing(false); openEdit(truck); };

  async function submitForm() {
    setIsSubmitting(true); setActionError('');
    try {
      if (isEditMode && selectedTruck) await apiRequest(`/trucks/${selectedTruck.id}`, { method: 'PATCH', body: toTruckPayload(formState, internalOnly) });
      else await apiRequest('/trucks', { method: 'POST', body: toTruckPayload(formState, internalOnly) });
      closeForm(); await fetchTrucks();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể lưu thông tin xe.'); }
    finally { setIsSubmitting(false); }
  }

  async function confirmStatus(truck: Truck) {
    const nextStatus = truck.status === 'INACTIVE' ? 'AVAILABLE' : 'INACTIVE';
    setConfirmDialog({ title: 'Cập nhật trạng thái', message: `Xác nhận cập nhật trạng thái xe ${formatPlate(truck)}?`, confirmLabel: 'Cập nhật', onConfirm: async () => { try { await apiRequest(`/trucks/${truck.id}/status`, { method: 'PATCH', body: { status: nextStatus } }); await fetchTrucks(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể cập nhật trạng thái xe.'); } } });
  }

  async function confirmDelete(truck: Truck) {
    setConfirmDialog({ title: 'Xóa xe', message: `Xóa xe ${formatPlate(truck)}?`, confirmLabel: 'Xóa', danger: true, onConfirm: async () => { try { await apiRequest(`/trucks/${truck.id}`, { method: 'DELETE' }); setSelectedTruckIds(prev => prev.filter(id => id !== normalizeId(truck.id))); if (detailTruck && normalizeId(detailTruck.id) === normalizeId(truck.id)) closeDetail(); await fetchTrucks(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể xóa xe.'); } } });
  }

  async function confirmBulkDelete() {
    if (!selectedTruckIds.length) return;
    setConfirmDialog({ title: 'Xóa nhiều xe', message: `Xóa ${selectedTruckIds.length} xe đã chọn?`, confirmLabel: 'Xóa', danger: true, onConfirm: async () => { setIsSubmitting(true); setActionError(''); try { await Promise.all(selectedTruckIds.map(id => apiRequest(`/trucks/${id}`, { method: 'DELETE' }))); setSelectedTruckIds([]); await fetchTrucks(); } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không thể xóa các xe đã chọn.'); } finally { setIsSubmitting(false); } } });
  }

  function renderTruckCell(columnId: TruckTableColumnId, truck: Truck) {
    switch (columnId) {
      case 'license_plate': return <td key={columnId} className="px-4 py-3 border-r border-border"><div className="font-extrabold text-[13px] text-foreground">{formatPlate(truck)}</div></td>;
      case 'payload': return <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-bold">{truck.payload ?? 0} kg</td>;
      case 'driver': return <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-medium">{internalOnly ? formatHub(truck) : getDriverName(truck)}</td>;
      case 'fuel_consumption_limit': return <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-bold">{truck.fuel_consumption_limit ?? 0} L/100km</td>;
      case 'status': return <td key={columnId} className="px-4 py-3 border-r border-border"><StatusBadge truck={truck} /></td>;
      case 'actions': return <td key={columnId} className="w-[132px] min-w-[132px] px-4 py-3"><TruckActions truck={truck} canManage={canManage} canDelete={canDelete} openDetail={setDetailTruck} openEdit={openEdit} confirmStatus={confirmStatus} confirmDelete={confirmDelete} /></td>;
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-[13px] font-medium flex items-center gap-2 shrink-0"><AlertTriangle size={16} />{actionError}</div>}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border bg-card p-3 shrink-0 space-y-3">
          {canDelete && selectedBulkDeleteCount > 0 ? <div className="flex items-center justify-between gap-3 md:hidden animate-in fade-in duration-150"><div className="flex items-center gap-2"><span className="inline-flex h-10 min-w-12 items-center justify-center rounded-lg bg-primary px-3 text-[13px] font-extrabold text-white">✓ {selectedBulkDeleteCount}</span><button onClick={clearTruckSelection} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">×</button></div><button disabled={isSubmitting} onClick={() => void confirmBulkDelete()} className="flex h-11 w-12 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm shadow-red-500/20 disabled:opacity-60"><Trash2 size={17} /></button></div> : null}
          <div className={clsx('flex flex-wrap items-center gap-2', canDelete && selectedBulkDeleteCount > 0 && 'hidden md:flex')}>
            <button onClick={() => window.history.back()} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={e => updateFilter('keyword', e.target.value)} placeholder={internalOnly ? 'Tìm BKS xe nội bộ...' : 'Tìm kiếm...'} className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button title="Mở bộ lọc" onClick={() => setIsFilterPanelOpen(true)} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
            <div className="hidden flex-1 md:block" />
            <ColumnSettings columns={truckTableHeaders} columnOrder={columnOrder} visibleColumns={visibleColumns} onToggle={toggleColumn} onReorder={reorderColumn} />
            {canManage && <button onClick={openAdd} className="h-10 w-12 shrink-0 rounded-lg bg-primary text-white text-[14px] font-bold shadow-sm shadow-primary/20 flex items-center justify-center gap-2 md:w-auto md:px-4"><Plus size={18} /><span className="hidden md:inline">Thêm</span></button>}
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple value={filters.status} options={statusOptions} onValueChange={value => updateFilter('status', value)} placeholder="Trạng thái" icon={Tag} className="w-[140px]" />
          </div>
        </div>
        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải danh sách xe" description="Đang cập nhật dữ liệu xe mới nhất." /> : error ? <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} /> : trucks.length === 0 ? <StateBlock icon={<TruckIcon size={24} />} title="Chưa có xe phù hợp" description="Thử đổi bộ lọc hoặc tạo xe mới nếu bạn có quyền quản lý." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            {canDelete && selectedBulkDeleteCount > 0 && <div className="sticky top-0 z-10 hidden flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-[13px] font-bold text-primary md:flex"><span>Đã chọn {selectedBulkDeleteCount} xe để xóa</span><div className="flex items-center gap-2"><button onClick={clearTruckSelection} className="h-8 rounded-lg border border-border bg-white px-3 text-[12px] text-muted-foreground hover:bg-muted">Bỏ chọn</button><button disabled={isSubmitting} onClick={() => void confirmBulkDelete()} className="h-8 rounded-lg bg-red-600 px-3 text-[12px] text-white hover:bg-red-700 disabled:opacity-60">Xóa đã chọn</button></div></div>}
            <table className="hidden md:table w-full min-w-[860px] text-left border-collapse"><thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr><th className="w-11 px-4 py-2.5 border-r border-border"><input type="checkbox" checked={isAllVisibleSelected} disabled={!trucks.length} onChange={toggleAllVisibleTrucks} className="h-4 w-4 rounded border-border" /></th>{orderedVisibleHeaders.map(header => <th key={header.id} className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}>{internalOnly && header.id === 'driver' ? 'Bưu cục hoạt động' : header.label}</th>)}</tr></thead><tbody>{trucks.map(truck => { const truckId = normalizeId(truck.id); return <tr key={truck.id} onClick={() => openDetail(truck)} className="cursor-pointer border-b border-border hover:bg-muted/10 transition-colors"><td className="px-4 py-3 border-r border-border"><input type="checkbox" checked={selectedTruckIds.includes(truckId)} disabled={!canDelete} onClick={event => event.stopPropagation()} onChange={() => toggleTruckSelection(truckId)} className="h-4 w-4 rounded border-border disabled:opacity-40" /></td>{orderedVisibleHeaders.map(header => renderTruckCell(header.id, truck))}</tr>; })}</tbody></table>
            <div className="grid gap-3 p-3 md:hidden">{trucks.map(truck => <TruckMobileCard key={truck.id} truck={truck} canManage={canManage} canDelete={canDelete} isSelected={selectedTruckIds.includes(normalizeId(truck.id))} canSelect={canDelete} onToggleSelect={() => toggleTruckSelection(normalizeId(truck.id))} openDetail={openDetail} openEdit={openEdit} confirmStatus={confirmStatus} confirmDelete={confirmDelete} />)}</div>
          </div>
        )}
        <div className="border-t border-border bg-card flex flex-col items-center justify-between gap-1 px-2 py-1 text-[11px] text-muted-foreground shrink-0 sm:flex-row sm:gap-3 sm:px-4 sm:py-2 sm:text-[12px]"><span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (trucks.length ? 1 : 0)}–{(filters.page - 1) * filters.limit + trucks.length}</b>/Tổng:{total}</span><div className="flex items-center gap-2"><select value={filters.limit} onChange={e => updateFilter('limit', Number(e.target.value))} className="h-7 rounded border border-border bg-card px-1.5 text-[11px] focus:outline-none sm:h-8 sm:px-2 sm:text-[12px]">{[10, 20, 50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="rounded-lg border border-border bg-card p-1.5 disabled:opacity-40 hover:bg-muted sm:p-2"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="rounded-lg border border-border bg-card p-1.5 disabled:opacity-40 hover:bg-muted sm:p-2"><ChevronRight size={15} /></button><span className="flex h-7 items-center rounded bg-primary px-2 text-[11px] font-bold text-white sm:h-8 sm:text-[12px]">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div></div>
      </div>
      <AddEditTruckDialog isOpen={isFormOpen} isClosing={isFormClosing} isEditMode={isEditMode} isSubmitting={isSubmitting} onClose={closeForm} onSubmit={submitForm} formState={formState} setFormField={setFormField} statusOptions={statusOptions} driverOptions={driverOptions} internalOnly={internalOnly} hubOptions={hubOptions} />
      {detailTruck && <TruckDetailOverlay truck={detailTruck} isClosing={isDetailClosing} internalOnly={internalOnly} canManage={canManage} canDelete={canDelete} onClose={closeDetail} onEdit={editFromDetail} onDelete={confirmDelete} />}
      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
    </div>
  );
}

function toTruckPayload(formState: TruckFormState, internalOnly = false) {
  return stripEmpty({ license_plate: formState.license_plate.toUpperCase().trim(), bks: (formState.bks || formState.license_plate).toUpperCase().trim(), payload: Number(formState.payload || 0), driver_id: internalOnly ? '' : formState.driver_id, fuel_consumption_limit: Number(formState.fuel_consumption_limit || 0), status: formState.status, ownership_type: internalOnly ? 'INTERNAL' : 'VENDOR', hub_id: internalOnly ? formState.hub_id : '' });
}
function stripEmpty<T extends Record<string, unknown>>(payload: T) { return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== '' && value !== undefined && value !== null)); }
function toFormState(truck: Truck): TruckFormState { return { license_plate: formatPlate(truck), payload: truck.payload == null ? '' : String(truck.payload), driver_id: normalizeId(truck.driver_id ?? truck.driver?.id), fuel_consumption_limit: truck.fuel_consumption_limit == null ? '' : String(truck.fuel_consumption_limit), status: truck.status || 'AVAILABLE', bks: truck.bks || formatPlate(truck), hub_id: normalizeId(truck.hub_id ?? truck.hub?.id) }; }
function closeWithAnimation(setClosing: (value: boolean) => void, setOpen: (value: boolean) => void) { setClosing(true); window.setTimeout(() => { setOpen(false); setClosing(false); }, 280); }
function formatStatus(truck: Truck) { return formatOption(statusOptions, truck.status); }
function StatusBadge({ truck }: { truck: Truck }) { return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold border', truck.status === 'INACTIVE' ? 'bg-slate-100 text-slate-600 border-slate-200' : truck.status === 'MAINTENANCE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>{formatStatus(truck)}</span>; }
function IconButton({ title, icon, onClick, danger, warning }: { title: string; icon: ReactNode; onClick: () => void; danger?: boolean; warning?: boolean }) { return <button title={title} onClick={event => { event.stopPropagation(); onClick(); }} className={clsx('p-2 rounded-lg border transition-colors', danger ? 'border-red-200 text-red-600 hover:bg-red-50' : warning ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>{icon}</button>; }
type TruckActionProps = { truck: Truck; canManage: boolean; canDelete: boolean; isSelected?: boolean; canSelect?: boolean; onToggleSelect?: () => void; openDetail: (truck: Truck) => void; openEdit: (truck: Truck) => void; confirmStatus: (truck: Truck) => void | Promise<void>; confirmDelete: (truck: Truck) => void | Promise<void> };
function TruckActions({ truck, canManage, canDelete, openEdit, confirmStatus, confirmDelete }: TruckActionProps) { return <div className="flex items-center justify-end gap-2">{canManage && <IconButton title="Chỉnh sửa" onClick={() => openEdit(truck)} icon={<Edit size={15} />} />}{canManage && <IconButton title={truck.status === 'INACTIVE' ? 'Bật xe' : 'Tắt xe'} onClick={() => void confirmStatus(truck)} icon={<Power size={15} />} warning={truck.status !== 'INACTIVE'} />}{canDelete && <IconButton title="Xóa" onClick={() => void confirmDelete(truck)} icon={<Trash2 size={15} />} danger />}</div>; }
function TruckMobileCard(props: TruckActionProps) { const { truck } = props; const selected = Boolean(props.isSelected); return <article onClick={() => props.openDetail(truck)} className={clsx('cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-[border-color,box-shadow] duration-150', selected ? 'animate-truck-card-select border-primary ring-1 ring-primary shadow-primary/10' : 'border-border')}><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-primary"><TruckIcon size={20} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-[15px] font-extrabold text-foreground">{formatPlate(truck)}</h3><p className="mt-1 text-[12px] font-medium text-muted-foreground">{getDriverName(truck)}</p></div><input type="checkbox" checked={selected} disabled={!props.canSelect} onClick={event => event.stopPropagation()} onChange={props.onToggleSelect} className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40" /></div><div className="mt-2"><StatusBadge truck={truck} /></div></div></div><div className="mt-4 rounded-xl bg-muted/20 p-3 text-[13px] font-bold text-foreground">{truck.payload ?? 0} kg · {truck.fuel_consumption_limit ?? 0} L/100km</div><div className="mt-3 border-t border-border pt-3"><TruckActions {...props} /></div></article>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center text-muted-foreground"><div className="mb-3 text-primary">{icon}</div><h3 className="text-[14px] font-bold text-foreground">{title}</h3><p className="mt-1 text-[13px] max-w-md">{description}</p></div>; }
function TruckDetailOverlay({ truck, isClosing, internalOnly, canManage, canDelete, onClose, onEdit, onDelete }: { truck: Truck; isClosing: boolean; internalOnly: boolean; canManage: boolean; canDelete: boolean; onClose: () => void; onEdit: (truck: Truck) => void; onDelete: (truck: Truck) => void | Promise<void> }) { return <div className="fixed inset-0 z-[9999] flex justify-end"><div className={clsx('fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-300 ease-out', isClosing ? 'opacity-0' : 'animate-in fade-in duration-200')} onClick={onClose} /><div className={clsx('relative flex h-screen w-full max-w-[680px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl', isClosing ? 'dialog-slide-out' : 'dialog-slide-in')} onClick={event => event.stopPropagation()}><div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Chi tiết xe</p><h2 className="text-lg font-black text-foreground">{formatPlate(truck)}</h2></div><button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={20} /></button></div><div className="flex-1 overflow-y-auto p-5 custom-scrollbar"><div className="mb-5 flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary"><TruckIcon size={22} /></div><div className="min-w-0"><h3 className="truncate text-xl font-black text-foreground">{formatPlate(truck)}</h3><p className="mt-1 text-[13px] font-medium text-muted-foreground">{getDriverName(truck)}</p><div className="mt-2"><StatusBadge truck={truck} /></div></div></div><div className="space-y-4"><TruckDetailSection title="Thông tin vận hành" icon={Gauge}><TruckInfo label="Tải trọng" value={`${truck.payload ?? 0} kg`} icon={Gauge} /><TruckInfo label="Định mức dầu" value={`${truck.fuel_consumption_limit ?? 0} L/100km`} icon={Fuel} /></TruckDetailSection>{internalOnly ? <TruckDetailSection title="Bưu cục hoạt động" icon={Tag}><TruckInfo label="Bưu cục" value={formatHub(truck)} icon={Tag} /><TruckInfo label="Tài xế" value="Chọn riêng khi tạo chuyến" icon={User} /></TruckDetailSection> : <TruckDetailSection title="Phân công" icon={User}><TruckInfo label="Tài xế" value={getDriverName(truck)} icon={User} /><TruckInfo label="Mã tài xế" value={normalizeId(truck.driver_id ?? truck.driver?.id) || 'Chưa gán'} icon={Tag} /></TruckDetailSection>}<TruckDetailSection title="Trạng thái hệ thống" icon={Tag}><TruckInfo label="Biển số" value={formatPlate(truck)} icon={TruckIcon} /><TruckInfo label="Trạng thái" value={formatStatus(truck)} icon={Power} /></TruckDetailSection></div></div><div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card p-5"><button onClick={onClose} className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Đóng</button><div className="flex items-center gap-3">{canManage && <button onClick={() => onEdit(truck)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"><Edit size={16} />Sửa</button>}{canDelete && <button onClick={() => void onDelete(truck)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100"><Trash2 size={16} />Xóa</button>}</div></div></div></div>; }
function TruckDetailSection({ title, icon: Icon, children }: { title: string; icon: typeof TruckIcon; children: ReactNode }) { return <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3"><Icon size={16} className="text-primary" /><span className="text-[12px] font-bold uppercase tracking-wider text-primary">{title}</span></div><div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">{children}</div></div>; }
function TruckInfo({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof TruckIcon }) { return <div className="rounded-xl border border-border bg-muted/5 p-3"><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Icon size={14} />{label}</div><p className="mt-1 text-[13px] font-bold leading-6 text-foreground">{value}</p></div>; }
function moveColumn(columnIds: TruckTableColumnId[], sourceId: TruckTableColumnId, targetId: TruckTableColumnId) { if (sourceId === targetId) return columnIds; const next = [...columnIds]; const sourceIndex = next.indexOf(sourceId); const targetIndex = next.indexOf(targetId); if (sourceIndex < 0 || targetIndex < 0) return columnIds; next.splice(sourceIndex, 1); next.splice(targetIndex, 0, sourceId); return next; }
function ColumnSettings({ columns, columnOrder, visibleColumns, onToggle, onReorder }: { columns: typeof truckTableHeaders; columnOrder: TruckTableColumnId[]; visibleColumns: TruckTableColumnId[]; onToggle: (columnId: TruckTableColumnId) => void; onReorder: (sourceId: TruckTableColumnId, targetId: TruckTableColumnId) => void }) { const [draggingColumnId, setDraggingColumnId] = useState<TruckTableColumnId | null>(null); const orderedColumns = columnOrder.map(columnId => columns.find(column => column.id === columnId)).filter((column): column is (typeof columns)[number] => Boolean(column)); return <details className="relative hidden md:block"><summary title="Cài đặt cột" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"><LayoutGrid size={16} /></summary><div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-border bg-white p-2 shadow-lg"><div className="px-2 pb-2 text-[12px] font-extrabold text-foreground">Cài đặt cột</div><div className="space-y-1">{orderedColumns.map(column => <div key={column.id} draggable onDragStart={event => { setDraggingColumnId(column.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.id); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const sourceId = (event.dataTransfer.getData('text/plain') || draggingColumnId) as TruckTableColumnId | null; if (sourceId) onReorder(sourceId, column.id); setDraggingColumnId(null); }} onDragEnd={() => setDraggingColumnId(null)} className={clsx('flex cursor-grab items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium active:cursor-grabbing', draggingColumnId === column.id ? 'bg-blue-50 text-primary opacity-70' : column.locked ? 'text-muted-foreground' : 'text-foreground hover:bg-muted/60')}><GripVertical size={14} className="shrink-0 text-muted-foreground" /><input type="checkbox" checked={visibleColumns.includes(column.id)} disabled={column.locked} onChange={() => onToggle(column.id)} className="h-4 w-4 rounded border-border disabled:opacity-50" /><span>{column.label}</span></div>)}</div></div></details>; }


