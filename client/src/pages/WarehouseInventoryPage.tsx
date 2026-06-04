import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, Flag, Loader2, Package, Printer, RefreshCcw, Route, Search, ShieldAlert, Tag, SlidersHorizontal, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import { DayPicker } from '../components/ui/DayPicker';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import AssignPriorityDialog from './warehouse/inventory/dialogs/AssignPriorityDialog';
import AssignRouteDialog from './warehouse/inventory/dialogs/AssignRouteDialog';
import WaybillInventoryDetailDialog from './warehouse/inventory/dialogs/WaybillInventoryDetailDialog';
import { mapWaybillsToPrintRows, saveInventoryPrintPayload, summarizeFilters } from './print/inventoryPrintUtils';
import InventoryColumnPicker from './warehouse/inventory/InventoryColumnPicker';
import {
  INVENTORY_COLUMNS,
  computeGrandTotals,
  getStorageAgeRowClass,
  loadVisibleColumnIds,
  resolveFreight,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveRoute,
  resolveReceiverAddress,
  resolveReceiverPhone,
  resolveVolumeM3,
  resolveWeightKg,
  saveVisibleColumnIds,
  type InventoryColumnId,
} from './warehouse/inventory/inventoryColumns';
import type { BadgeConfig, FilterOption, HubSummary, InventoryFilters, InventoryListResponse, PriorityFormState, RouteFormState, WaybillInventoryDetail, WaybillInventoryItem } from './warehouse/inventory/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;
const DISPATCHER = 8;
const defaultFilters: InventoryFilters = { keyword: '', statuses: [], hubIds: [], paymentTypes: [], priorities: [], receivedFrom: '', receivedTo: '', page: 1, limit: 10 };

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Chờ xuất chuyến', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Chờ giao', className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const paymentConfig: Record<string, BadgeConfig> = {
  PP: { label: 'PP', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  CC: { label: 'CC', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COD: { label: 'COD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const priorityConfig: Record<string, BadgeConfig> = {
  HIGH: { label: 'Cao', className: 'bg-red-50 text-red-700 border-red-200' },
  NORMAL: { label: 'Tiêu chuẩn', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  LOW: { label: 'Thấp', className: 'bg-muted text-muted-foreground border-border' },
};

const statusOptions: FilterOption[] = Object.entries(statusConfig).map(([value, config]) => ({ value, label: config.label }));
const paymentOptions: FilterOption[] = Object.entries(paymentConfig).map(([value, config]) => ({ value, label: config.label }));
const priorityOptions: FilterOption[] = Object.entries(priorityConfig).map(([value, config]) => ({ value, label: config.label }));

const getStoredUser = (): AuthUserProfile | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const hasManagerAccess = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;
const canMutateInventory = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = (response: InventoryListResponse | WaybillInventoryItem[]) => Array.isArray(response) ? response : response.data || response.items || response.waybills || [];
const normalizeTotal = (response: InventoryListResponse | WaybillInventoryItem[], fallback: number) => Array.isArray(response) ? fallback : response.total ?? response.meta?.total ?? fallback;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
const displayCode = (waybill: WaybillInventoryItem) => waybill.waybill_code || waybill.code || `#${waybill.id}`;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillInventoryItem) => String(waybill.current_state || waybill.status || '').toUpperCase();
const normalizePriority = (waybill: WaybillInventoryItem) => String(waybill.priority || 'NORMAL').toUpperCase();
const formatHub = (hub: HubSummary | null | undefined, fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';

const buildQuery = (filters: InventoryFilters) => {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.hubIds.length) params.set('hub_id', filters.hubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  if (filters.receivedFrom) params.set('received_from', filters.receivedFrom);
  if (filters.receivedTo) params.set('received_to', filters.receivedTo);
  return params.toString();
};

export default function WarehouseInventoryPage() {
  const [filters, setFilters] = useState<InventoryFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<InventoryFilters>(defaultFilters);
  const [waybills, setWaybills] = useState<WaybillInventoryItem[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ status: true, hub: true, payment: false, priority: false, received: false });
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({ status: '', hub: '', payment: '', priority: '' });
  const [selectedWaybill, setSelectedWaybill] = useState<WaybillInventoryItem | null>(null);
  const [detailWaybill, setDetailWaybill] = useState<WaybillInventoryDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isPriorityClosing, setIsPriorityClosing] = useState(false);
  const [priorityForm, setPriorityForm] = useState<PriorityFormState>({ priority: 'NORMAL' });
  const [isRouteOpen, setIsRouteOpen] = useState(false);
  const [isRouteClosing, setIsRouteClosing] = useState(false);
  const [routeForm, setRouteForm] = useState<RouteFormState>({ route_code: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

  const user = useMemo(getStoredUser, []);
  const canViewPage = hasManagerAccess(user?.role_mask ?? 0);
  const canUpdate = canMutateInventory(user?.role_mask ?? 0);
  const [visibleColumnIds, setVisibleColumnIds] = useState<InventoryColumnId[]>(() =>
    loadVisibleColumnIds(canViewPage),
  );
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const hubOptions = useMemo(() => hubs.map(hub => ({ value: String(hub.id), label: formatHub(hub) })), [hubs]);
  const activeFilterCount = filters.statuses.length + filters.hubIds.length + filters.paymentTypes.length + filters.priorities.length + Number(Boolean(filters.receivedFrom || filters.receivedTo));
  const visibleColumns = useMemo(
    () => INVENTORY_COLUMNS.filter((col) => visibleColumnIds.includes(col.id)),
    [visibleColumnIds],
  );
  const grandTotals = useMemo(
    () => computeGrandTotals(waybills, canViewPage),
    [waybills, canViewPage],
  );
  const clearFilters = () => setFilters(defaultFilters);
  const setFilterArray = (key: keyof Pick<InventoryFilters, 'statuses' | 'hubIds' | 'paymentTypes' | 'priorities'>, value: string[]) => updateFilters({ [key]: value } as Partial<InventoryFilters>);

  useEffect(() => { if (canViewPage) void loadHubs(); }, [canViewPage]);
  useEffect(() => { if (canViewPage) void loadInventory(); }, [filters, canViewPage]);

  async function loadHubs() {
    try {
      const response = await apiRequest<HubSummary[] | { data?: HubSummary[]; items?: HubSummary[] }>('/hubs/active');
      setHubs(Array.isArray(response) ? response : response.data || response.items || []);
    } catch {
      setHubs([]);
    }
  }

  async function loadInventory() {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<InventoryListResponse | WaybillInventoryItem[]>(`/waybills/inventory?${buildQuery(filters)}`);
      const items = normalizeList(response);
      setWaybills(items);
      setTotal(normalizeTotal(response, items.length));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách vận đơn tồn kho.');
      setWaybills([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }

  const updateFilters = (patch: Partial<InventoryFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  const openFilterSheet = () => { setDraftFilters(filters); setIsFilterOpen(true); };
  const applyFilters = () => { setFilters({ ...draftFilters, page: 1 }); setIsFilterOpen(false); };

  const openDetail = async (waybill: WaybillInventoryItem) => {
    setSelectedWaybill(waybill);
    setDetailWaybill(null);
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    try {
      setDetailWaybill(await apiRequest<WaybillInventoryDetail>(`/waybills/${waybill.id}`));
    } catch {
      setDetailWaybill(waybill as WaybillInventoryDetail);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const closeDetail = () => { setIsDetailClosing(true); window.setTimeout(() => { setIsDetailOpen(false); setIsDetailClosing(false); setDetailWaybill(null); }, 180); };
  const openPriority = (waybill: WaybillInventoryItem) => { setSelectedWaybill(waybill); setPriorityForm({ priority: normalizePriority(waybill) }); setActionError(''); setIsPriorityOpen(true); };
  const closePriority = () => { setIsPriorityClosing(true); window.setTimeout(() => { setIsPriorityOpen(false); setIsPriorityClosing(false); }, 180); };
  const openRoute = (waybill: WaybillInventoryItem) => { setSelectedWaybill(waybill); setRouteForm({ route_code: waybill.route_code || waybill.delivery_route || '' }); setActionError(''); setIsRouteOpen(true); };
  const closeRoute = () => { setIsRouteClosing(true); window.setTimeout(() => { setIsRouteOpen(false); setIsRouteClosing(false); }, 180); };

  async function submitPriority() {
    if (!selectedWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/waybills/${selectedWaybill.id}/priority`, { method: 'PATCH', body: { priority: priorityForm.priority } });
      closePriority();
      await loadInventory();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể cập nhật ưu tiên.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrintStockList() {
    setActionError('');
    if (!waybills.length) {
      setActionError('Không có đơn tồn kho trên danh sách để in.');
      return;
    }
    const payload = mapWaybillsToPrintRows(
      waybills,
      canViewPage,
      visibleColumns.map((col) => col.id),
    );
    const pageNote =
      total > waybills.length
        ? ` · Trang ${filters.page}: in ${waybills.length}/${total} đơn đang hiển thị`
        : ` · ${waybills.length} đơn`;
    payload.filterSummary = summarizeFilters(filters) + pageNote;
    saveInventoryPrintPayload(payload);
    window.open('/print/inventory-stock', '_blank');
  }

  async function submitRoute() {
    if (!selectedWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/waybills/${selectedWaybill.id}/route`, { method: 'PATCH', body: { route_code: routeForm.route_code.trim() } });
      closeRoute();
      await loadInventory();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể gán tuyến.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canViewPage) {
    return <StateCard icon={<ShieldAlert size={24} />} title="Không có quyền truy cập" description="Trang danh sách đơn tồn kho chỉ hiển thị cho MANAGER hoặc DIRECTOR." />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <Alert message={actionError} tone="red" />}
      {error && <Alert message={error} tone="red" />}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.history.back()} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm kiếm..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
            <button title="Mở bộ lọc" onClick={openFilterSheet} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
            {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
            <div className="hidden flex-1 md:block" />
            <button
              type="button"
              title="Tùy chỉnh cột"
              onClick={() => setIsColumnPickerOpen(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground hover:bg-muted"
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Cột</span>
            </button>
            <button
              type="button"
              title="In danh sách tồn"
              disabled={isLoading || waybills.length === 0}
              onClick={handlePrintStockList}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">In danh sách tồn</span>
            </button>
            <button title="Làm mới" onClick={() => void loadInventory()} className="hidden h-10 w-10 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted md:flex items-center justify-center"><RefreshCcw size={16} /></button>
          </div>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FilterSelect multiple icon={Tag} placeholder="Trạng thái" searchPlaceholder="Tìm trạng thái..." options={statusOptions} value={filters.statuses} onValueChange={value => setFilterArray('statuses', value)} className="h-9 min-w-[150px]" />
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục" searchPlaceholder="Tìm bưu cục..." options={hubOptions} value={filters.hubIds} onValueChange={value => setFilterArray('hubIds', value)} className="h-9 min-w-[170px]" />
            <FilterSelect multiple icon={CreditCard} placeholder="Loại thanh toán" searchPlaceholder="Tìm thanh toán..." options={paymentOptions} value={filters.paymentTypes} onValueChange={value => setFilterArray('paymentTypes', value)} className="h-9 min-w-[170px]" />
            <FilterSelect multiple icon={Flag} placeholder="Mức ưu tiên" searchPlaceholder="Tìm ưu tiên..." options={priorityOptions} value={filters.priorities} onValueChange={value => setFilterArray('priorities', value)} className="h-9 min-w-[160px]" />
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 text-[13px] font-medium text-muted-foreground">
              <CalendarDays size={14} className="shrink-0" />
              <DayPicker value={filters.receivedFrom} onChange={value => updateFilters({ receivedFrom: value })} placeholder="Từ ngày" className="h-7 min-w-[8.25rem] w-[8.25rem] shrink-0 border-0 bg-transparent pl-0 pr-6 text-[12px] focus:ring-0" />
              <span className="shrink-0">—</span>
              <DayPicker value={filters.receivedTo} onChange={value => updateFilters({ receivedTo: value })} placeholder="Đến ngày" className="h-7 min-w-[8.5rem] w-[8.5rem] shrink-0 border-0 bg-transparent pl-0 pr-6 text-[12px] focus:ring-0" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {isLoading ? <StateCard compact icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải dữ liệu" description="Hệ thống đang lấy danh sách vận đơn tồn kho từ API." /> : waybills.length === 0 ? <StateCard compact icon={<Package size={24} />} title="Chưa có vận đơn phù hợp" description="Thử thay đổi từ khóa hoặc bộ lọc để xem thêm dữ liệu tồn kho." /> : (
            <>
              <table className="hidden md:table w-full min-w-[1280px] text-left border-collapse">
                <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th key={col.id} className="px-4 py-2.5 font-bold border-r border-border last:border-r-0 whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waybills.map((waybill) => (
                    <InventoryRow
                      key={waybill.id}
                      waybill={waybill}
                      columns={visibleColumns}
                      canViewPricing={canViewPage}
                      canUpdate={canUpdate}
                      onDetail={openDetail}
                      onPriority={openPriority}
                      onRoute={openRoute}
                    />
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-[12px] font-extrabold text-foreground">
                  <tr>
                    {visibleColumns.map((col, idx) => (
                      <td key={col.id} className="border-t border-border px-4 py-2.5 border-r last:border-r-0">
                        {idx === 0 ? 'Tổng cộng' : ''}
                        {col.id === 'package_count' ? grandTotals.package_count : ''}
                        {col.id === 'weight' ? `${grandTotals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : ''}
                        {col.id === 'volume' ? `${grandTotals.volume_m3.toFixed(2)} m³` : ''}
                        {col.id === 'freight' && canViewPage ? `${grandTotals.freight.toLocaleString('vi-VN')} đ` : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
              <div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <InventoryCard key={waybill.id} waybill={waybill} canUpdate={canUpdate} onDetail={openDetail} onPriority={openPriority} onRoute={openRoute} />)}</div>
            </>
          )}
        </div>

        <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
          <p className="text-[12px] font-medium text-muted-foreground">{waybills.length ? `1-${waybills.length}/Tổng:${total}` : `0/Tổng:${total}`}</p>
          <div className="flex items-center gap-2">
            <select value={filters.limit} onChange={event => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] text-muted-foreground outline-none"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
            <span className="hidden text-[12px] text-muted-foreground sm:inline">/ trang</span>
            <button disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronLeft size={16} /></button>
            <button disabled={filters.page >= totalPages} onClick={() => updateFilters({ page: filters.page + 1 })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronRight size={16} /></button>
            <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-primary px-2 text-[13px] font-bold text-white">{filters.page}</span>
            <span className="text-[13px] font-bold text-foreground">/ {totalPages}</span>
          </div>
        </div>
      </div>

      <FilterBottomSheet isOpen={isFilterOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} groupSearch={groupSearch} setGroupSearch={setGroupSearch} hubOptions={hubOptions} onClose={() => setIsFilterOpen(false)} onApply={applyFilters} />
      <WaybillInventoryDetailDialog isOpen={isDetailOpen} isClosing={isDetailClosing} isLoading={isDetailLoading} waybill={detailWaybill} statusConfig={statusConfig} paymentConfig={paymentConfig} priorityConfig={priorityConfig} onClose={closeDetail} />
      <AssignPriorityDialog isOpen={isPriorityOpen} isClosing={isPriorityClosing} isSubmitting={isSubmitting} waybill={selectedWaybill} formState={priorityForm} priorityConfig={priorityConfig} onChange={(priority) => setPriorityForm({ priority })} onClose={closePriority} onSubmit={submitPriority} />
      <AssignRouteDialog isOpen={isRouteOpen} isClosing={isRouteClosing} isSubmitting={isSubmitting} waybill={selectedWaybill} formState={routeForm} onChange={(route_code) => setRouteForm({ route_code })} onClose={closeRoute} onSubmit={submitRoute} />
      <InventoryColumnPicker
        isOpen={isColumnPickerOpen}
        visibleIds={visibleColumnIds}
        canViewPricing={canViewPage}
        onChange={(ids) => {
          setVisibleColumnIds(ids);
          saveVisibleColumnIds(ids);
        }}
        onClose={() => setIsColumnPickerOpen(false)}
      />
    </div>
  );
}

function InventoryRow({
  waybill,
  columns,
  canViewPricing,
  canUpdate,
  onDetail,
  onPriority,
  onRoute,
}: InventoryItemProps & { columns: typeof INVENTORY_COLUMNS; canViewPricing: boolean }) {
  const cellClass = 'px-4 py-3 border-r border-border text-[13px] max-w-[200px] truncate';

  const renderCell = (colId: InventoryColumnId) => {
    switch (colId) {
      case 'waybill_code':
        return <td className={`${cellClass} font-extrabold text-primary`}>{displayCode(waybill)}</td>;
      case 'loaded_at':
        return (
          <td className={clsx(cellClass, getStorageAgeRowClass(waybill).includes('red') ? 'font-bold text-red-700' : getStorageAgeRowClass(waybill).includes('amber') ? 'font-bold text-amber-800' : 'text-muted-foreground')}>
            {formatDate(resolveLoadedAt(waybill))}
          </td>
        );
      case 'received_at':
        return <td className={`${cellClass} text-muted-foreground`}>{formatDate(waybill.received_at || waybill.created_at)}</td>;
      case 'receiver_phone':
        return <td className={clsx(cellClass, 'font-bold text-primary')}>{resolveReceiverPhone(waybill)}</td>;
      case 'noi_den':
        return <td className={cellClass}>{resolveNoiDen(waybill)}</td>;
      case 'route':
        return <td className={clsx(cellClass, 'font-bold text-foreground')}>{resolveRoute(waybill)}</td>;
      case 'ma_kh':
        return <td className={cellClass}>{resolveMaKh(waybill)}</td>;
      case 'receiver_address':
        return <td className={cellClass}>{resolveReceiverAddress(waybill)}</td>;
      case 'package_count':
        return <td className={`${cellClass} font-medium`}>{displayValue(waybill.package_count || waybill.declared_package_count)}</td>;
      case 'weight':
        return <td className={`${cellClass} font-medium`}>{displayValue(resolveWeightKg(waybill) || null, ' kg')}</td>;
      case 'volume':
        return <td className={`${cellClass} font-medium`}>{resolveVolumeM3(waybill) ? `${resolveVolumeM3(waybill).toFixed(2)} m³` : '—'}</td>;
      case 'freight':
        return (
          <td className={`${cellClass} font-bold`}>
            {canViewPricing ? displayValue(resolveFreight(waybill) || null, ' đ') : '—'}
          </td>
        );
      case 'sender_info':
        return <td className={`${cellClass} font-medium`}>{waybill.sender_info || '—'}</td>;
      case 'receiver_info':
        return <td className={`${cellClass} font-medium`}>{waybill.receiver_info || '—'}</td>;
      case 'current_hub':
        return <td className={`${cellClass} text-muted-foreground`}>{formatHub(waybill.current_hub || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)}</td>;
      case 'dest_hub':
        return <td className={`${cellClass} text-muted-foreground`}>{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</td>;
      case 'payment_type':
        return <td className="px-4 py-3 border-r border-border"><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /></td>;
      case 'cod_amount':
        return <td className={`${cellClass} font-bold`}>{displayValue(waybill.cod_amount, ' đ')}</td>;
      case 'priority':
        return <td className="px-4 py-3 border-r border-border"><Badge config={priorityConfig[normalizePriority(waybill)]} fallback={normalizePriority(waybill)} /></td>;
      case 'actions':
        return <td className="px-4 py-3"><Actions waybill={waybill} canUpdate={canUpdate} onDetail={onDetail} onPriority={onPriority} onRoute={onRoute} /></td>;
      default:
        return <td className={cellClass}>—</td>;
    }
  };

  return (
    <tr className={clsx('border-b border-border align-top transition-colors', getStorageAgeRowClass(waybill))}>
      {columns.map((col) => renderCell(col.id))}
    </tr>
  );
}

function InventoryCard({ waybill, canUpdate, onDetail, onPriority, onRoute }: InventoryItemProps) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-primary">
          <Package size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-extrabold text-primary">{displayCode(waybill)}</h3>
              <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">{waybill.receiver_info || 'Chưa có người nhận'}</p>
            </div>
            <Badge config={statusConfig[normalizeStatus(waybill)]} fallback={normalizeStatus(waybill)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} />
            <Badge config={priorityConfig[normalizePriority(waybill)]} fallback={normalizePriority(waybill)} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-muted/20 p-3">
        <p className="text-[12px] font-medium text-muted-foreground">Luồng kho</p>
        <p className="mt-2 text-[13px] font-bold text-foreground">{formatHub(waybill.current_hub || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)}</p>
        <p className="mt-1 text-[12px] font-medium text-muted-foreground">Đến: {formatHub(waybill.dest_hub, waybill.dest_hub_id)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px]">
        <MobileInfo label="Người gửi" value={waybill.sender_info || '—'} />
        <MobileInfo label="Người nhận" value={waybill.receiver_info || '—'} />
        <MobileInfo label="Tuyến" value={resolveRoute(waybill)} />
        <MobileInfo label="COD" value={displayValue(waybill.cod_amount, ' đ')} />
        <MobileInfo label="Số kiện" value={displayValue(waybill.package_count || waybill.declared_package_count)} />
        <MobileInfo label="Cân nặng" value={displayValue(waybill.actual_weight || waybill.weight, ' kg')} />
        <MobileInfo label="Ngày nhận" value={formatDate(waybill.received_at || waybill.created_at)} />
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <Actions waybill={waybill} canUpdate={canUpdate} onDetail={onDetail} onPriority={onPriority} onRoute={onRoute} />
      </div>
    </article>
  );
}

interface InventoryItemProps { waybill: WaybillInventoryItem; canUpdate: boolean; onDetail: (waybill: WaybillInventoryItem) => void; onPriority: (waybill: WaybillInventoryItem) => void; onRoute: (waybill: WaybillInventoryItem) => void; }

function Actions({ waybill, canUpdate, onDetail, onPriority, onRoute }: InventoryItemProps) {
  return <div className="flex flex-wrap gap-2"><button onClick={() => onDetail(waybill)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground hover:bg-muted"><Eye size={14} />Xem</button><button disabled={!canUpdate} onClick={() => onPriority(waybill)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"><Flag size={14} />Ưu tiên</button><button disabled={!canUpdate} onClick={() => onRoute(waybill)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"><Route size={14} />Tuyến</button></div>;
}

function FilterBottomSheet({ isOpen, draftFilters, setDraftFilters, openGroups, setOpenGroups, groupSearch, setGroupSearch, hubOptions, onClose, onApply }: { isOpen: boolean; draftFilters: InventoryFilters; setDraftFilters: React.Dispatch<React.SetStateAction<InventoryFilters>>; openGroups: Record<string, boolean>; setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; groupSearch: Record<string, string>; setGroupSearch: React.Dispatch<React.SetStateAction<Record<string, string>>>; hubOptions: FilterOption[]; onClose: () => void; onApply: () => void; }) {
  if (!isOpen) return null;
  const toggleValue = (key: keyof Pick<InventoryFilters, 'statuses' | 'hubIds' | 'paymentTypes' | 'priorities'>, value: string) => setDraftFilters(prev => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter(item => item !== value) : [...prev[key], value] }));
  const setAll = (key: keyof Pick<InventoryFilters, 'statuses' | 'hubIds' | 'paymentTypes' | 'priorities'>, values: string[]) => setDraftFilters(prev => ({ ...prev, [key]: values }));
  return <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden"><div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} /><div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl"><div className="flex items-center justify-between border-b border-border bg-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-primary" /><h2 className="text-lg font-black text-foreground">Bộ lọc</h2></div><button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button></div><div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4"><FilterGroup id="status" title="Trạng thái" options={statusOptions} selected={draftFilters.statuses} search={groupSearch.status} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, status: value }))} onToggle={(value) => toggleValue('statuses', value)} onAll={() => setAll('statuses', statusOptions.map(option => option.value))} onClear={() => setAll('statuses', [])} /><FilterGroup id="hub" title="Bưu cục" options={hubOptions} selected={draftFilters.hubIds} search={groupSearch.hub} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, hub: value }))} onToggle={(value) => toggleValue('hubIds', value)} onAll={() => setAll('hubIds', hubOptions.map(option => option.value))} onClear={() => setAll('hubIds', [])} /><FilterGroup id="payment" title="Loại thanh toán PP/CC/COD" options={paymentOptions} selected={draftFilters.paymentTypes} search={groupSearch.payment} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, payment: value }))} onToggle={(value) => toggleValue('paymentTypes', value)} onAll={() => setAll('paymentTypes', paymentOptions.map(option => option.value))} onClear={() => setAll('paymentTypes', [])} /><FilterGroup id="priority" title="Mức ưu tiên" options={priorityOptions} selected={draftFilters.priorities} search={groupSearch.priority} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, priority: value }))} onToggle={(value) => toggleValue('priorities', value)} onAll={() => setAll('priorities', priorityOptions.map(option => option.value))} onClear={() => setAll('priorities', [])} /><DateGroup draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} /></div><div className="border-t border-border bg-card p-5"><button onClick={onApply} className="w-full rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20">Áp dụng</button></div></div></div>;
}

function FilterGroup({ id, title, options, selected, search, openGroups, setOpenGroups, onSearch, onToggle, onAll, onClear }: { id: string; title: string; options: FilterOption[]; selected: string[]; search: string; openGroups: Record<string, boolean>; setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onSearch: (value: string) => void; onToggle: (value: string) => void; onAll: () => void; onClear: () => void; }) {
  const filteredOptions = options.filter(option => option.label.toLowerCase().includes(search.toLowerCase()) || option.value.toLowerCase().includes(search.toLowerCase()));
  const isOpen = openGroups[id];
  return <div className="overflow-hidden rounded-2xl border border-border bg-white"><button onClick={() => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="text-[13px] font-black text-foreground">{title}</span><ChevronDown size={16} className={clsx('transition-transform', isOpen && 'rotate-180')} /></button>{isOpen && <div className="border-t border-border p-4"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Tìm trong nhóm lọc..." className="h-10 w-full rounded-xl border border-input bg-white pl-9 pr-3 text-[12px] font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></div><div className="mt-3 flex gap-2"><button onClick={onAll} className="rounded-lg bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary">Chọn tất cả</button><button onClick={onClear} className="rounded-lg bg-muted px-3 py-2 text-[12px] font-bold text-muted-foreground">Xóa chọn</button></div><div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">{filteredOptions.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-[13px] font-bold text-foreground hover:bg-muted/40"><input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} className="h-4 w-4 accent-primary" />{option.label}</label>)}</div></div>}</div>;
}

function DateGroup({ draftFilters, setDraftFilters, openGroups, setOpenGroups }: { draftFilters: InventoryFilters; setDraftFilters: React.Dispatch<React.SetStateAction<InventoryFilters>>; openGroups: Record<string, boolean>; setOpenGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const isOpen = openGroups.received;
  return <div className="overflow-hidden rounded-2xl border border-border bg-white"><button onClick={() => setOpenGroups(prev => ({ ...prev, received: !prev.received }))} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="text-[13px] font-black text-foreground">Khoảng thời gian nhận hàng</span><ChevronDown size={16} className={clsx('transition-transform', isOpen && 'rotate-180')} /></button>{isOpen && <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2"><Field label="Từ ngày"><DayPicker value={draftFilters.receivedFrom} onChange={value => setDraftFilters(prev => ({ ...prev, receivedFrom: value }))} className="h-11 border-input text-[13px] font-bold" /></Field><Field label="Đến ngày"><DayPicker value={draftFilters.receivedTo} onChange={value => setDraftFilters(prev => ({ ...prev, receivedTo: value }))} className="h-11 border-input text-[13px] font-bold" /></Field><button onClick={() => setDraftFilters(prev => ({ ...prev, receivedFrom: '', receivedTo: '' }))} className="rounded-lg bg-muted px-3 py-2 text-[12px] font-bold text-muted-foreground sm:col-span-2">Xóa chọn</button></div>}</div>;
}

function Badge({ config, fallback }: { config?: BadgeConfig; fallback: ReactNode }) { return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap', config?.className || 'bg-muted text-muted-foreground border-border')}>{config?.label || fallback}</span>; }
function MobileInfo({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-bold text-foreground break-words">{value}</span></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-2 block text-[12px] font-bold text-foreground">{label}</span>{children}</label>; }
function Alert({ message, tone = 'amber' }: { message: string; tone?: 'amber' | 'red' }) { return <div className={clsx('flex gap-2 rounded-2xl border px-4 py-3 text-[13px] font-bold', tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800')}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</div>; }
function StateCard({ icon, title, description, compact = false }: { icon: ReactNode; title: string; description: string; compact?: boolean }) { return <div className={clsx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white text-center', compact ? 'm-5 min-h-[320px] p-6' : 'min-h-[420px] p-8')}><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div>; }





