import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Eye, FileSpreadsheet, Filter, Flag, HandCoins, Layers, Loader2, MoreHorizontal, Package, Pencil, Printer, RefreshCcw, Search, ShieldAlert, Tag, SlidersHorizontal, Trash2, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import { DayPicker } from '../components/ui/DayPicker';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { FilterSelect } from '../components/ui/FilterSelect';
import type { AuthUserProfile } from './login/types';
import WaybillPackageSplitDialog from './warehouse/inventory/dialogs/WaybillPackageSplitDialog';
import WaybillInventoryDetailDialog from './warehouse/inventory/dialogs/WaybillInventoryDetailDialog';
import WaybillPriorityControl from './warehouse/inventory/WaybillPriorityControl';
import WaybillRouteControl from './warehouse/inventory/WaybillRouteControl';
import SplitOrderDialog from './warehouse/inventory/dialogs/SplitOrderDialog';
import WaybillCashVoucherDialog from './warehouse/inventory/dialogs/WaybillCashVoucherDialog';
import StackOntoTruckDialog from './warehouse/inventory/dialogs/StackOntoTruckDialog';
import { mapWaybillsToPrintRows, saveInventoryPrintPayload, summarizeFilters } from './print/inventoryPrintUtils';
import InventoryColumnPicker from './warehouse/inventory/InventoryColumnPicker';
import AllOrdersTableHeader from './warehouse/inventory/AllOrdersTableHeader';
import { downloadInventoryExcel } from './warehouse/inventory/inventoryExcelUtils';
import {
  canCollectCashPayment,
  computeGrandTotals,
  getStorageAgeRowClass,
  loadVisibleColumnIds,
  loadAllOrdersVisibleColumnIds,
  resolveVisibleColumnViews,
  resolveCongSg,
  resolvePackageCountSl,
  resolveFreight,
  resolveCustomerName,
  resolveServiceType,
  resolveBillingUnit,
  resolveUnitPrice,
  resolveTransitFee,
  resolvePaymentMethod,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveReceiverAddress,
  resolveReceiverPhone,
  resolveVolumeM3,
  resolveWeightKg,
  saveVisibleColumnIds,
  type InventoryColumnId,
  type InventoryColumnView,
} from './warehouse/inventory/inventoryColumns';
import { buildInventoryTripLinesQuery, isIncompleteSplitRow } from './warehouse/inventory/inventoryTripLines';
import type { BadgeConfig, FilterOption, HubSummary, InventoryFilters, InventoryListResponse, WaybillInventoryDetail, WaybillInventoryItem } from './warehouse/inventory/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const WAREHOUSE = 1;
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;
const DISPATCHER = 8;
const MUTABLE_WAYBILL_STATUSES = ['RECEIVED', 'IN_WAREHOUSE'];
const defaultFilters: InventoryFilters = { keyword: '', ma_kh: '', statuses: [], customerPaymentStatuses: [], hubIds: [], paymentTypes: [], priorities: [], receivedFrom: '', receivedTo: '', page: 1, limit: 10 };
const allOrdersDefaultFilters: InventoryFilters = { ...defaultFilters, limit: 50 };
const customerPaymentStatusOptions: FilterOption[] = [
  { value: 'PAID', label: 'Đã TT' },
  { value: 'SENT_STATEMENT', label: 'Đã gửi bảng kê' },
];
const customerPaymentStatusText: Record<string, string> = {
  PAID: 'Đã TT',
  SENT_STATEMENT: 'Đã gửi bảng kê',
};

export type InventoryPageVariant = 'split-pending' | 'all-orders';

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Chờ bốc', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  LOADED: { label: 'Đã bốc', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Đã giao', className: 'bg-green-50 text-green-700 border-green-200' },
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
const canEditWaybill = (roleMask: number) => (roleMask & (WAREHOUSE | MANAGER | DIRECTOR)) !== 0;
const canMutateInventory = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = (response: InventoryListResponse | WaybillInventoryItem[]) => Array.isArray(response) ? response : response.data || response.items || response.waybills || [];
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
const displayCode = (waybill: WaybillInventoryItem) => waybill.waybill_code || waybill.code || `#${waybill.id}`;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillInventoryItem) => String(waybill.current_state || waybill.status || '').toUpperCase();
const isMutableWaybill = (waybill: WaybillInventoryItem) => MUTABLE_WAYBILL_STATUSES.includes(normalizeStatus(waybill));
const actionMenuId = (waybill: WaybillInventoryItem) => `${waybill.id}-${waybill.split_id ?? 'base'}`;
const formatHub = (hub: HubSummary | null | undefined, fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';

const buildQuery = (filters: InventoryFilters, variant: InventoryPageVariant) =>
  buildInventoryTripLinesQuery(filters, { onlyIncompleteSplit: variant === 'split-pending' });

const sortAllOrders = (items: WaybillInventoryItem[]) =>
  [...items].sort((a, b) => {
    const dateA = new Date(a.received_at || a.created_at || 0).getTime();
    const dateB = new Date(b.received_at || b.created_at || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    const orderCmp = String(a.order_code || '').localeCompare(String(b.order_code || ''), 'vi');
    if (orderCmp !== 0) return orderCmp;
    return displayCode(a).localeCompare(displayCode(b), 'vi');
  });

export default function WarehouseInventoryPage({ variant = 'split-pending' }: { variant?: InventoryPageVariant }) {
  const isAllOrders = variant === 'all-orders';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<InventoryFilters>(() => ({
    ...(isAllOrders ? allOrdersDefaultFilters : defaultFilters),
    ma_kh: isAllOrders ? '' : searchParams.get('ma_kh')?.trim() || '',
  }));
  const [draftFilters, setDraftFilters] = useState<InventoryFilters>(isAllOrders ? allOrdersDefaultFilters : defaultFilters);
  const [waybills, setWaybills] = useState<WaybillInventoryItem[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [filterTotals, setFilterTotals] = useState({ orderCount: 0, totalFreight: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ status: true, hub: true, payment: false, priority: false, received: false });
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({ status: '', hub: '', payment: '', priority: '' });
  const [detailWaybill, setDetailWaybill] = useState<WaybillInventoryDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [isSplitClosing, setIsSplitClosing] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [isBoardClosing, setIsBoardClosing] = useState(false);
  const [splitWaybill, setSplitWaybill] = useState<WaybillInventoryItem | null>(null);
  const [actionError, setActionError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cashVoucherWaybill, setCashVoucherWaybill] = useState<WaybillInventoryItem | null>(null);
  const [isCashVoucherOpen, setIsCashVoucherOpen] = useState(false);
  const [isCashVoucherClosing, setIsCashVoucherClosing] = useState(false);
  const [selectedWaybillIds, setSelectedWaybillIds] = useState<string[]>([]);
  const [isPaymentStatusDialogOpen, setIsPaymentStatusDialogOpen] = useState(false);
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState<'PAID' | 'SENT_STATEMENT' | ''>('');
  const [customerPaymentNote, setCustomerPaymentNote] = useState('');
  const [isStackOpen, setIsStackOpen] = useState(false);
  const [isStackClosing, setIsStackClosing] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const user = useMemo(getStoredUser, []);
  const canViewPricing = hasManagerAccess(user?.role_mask ?? 0);
  const canViewPage = isAllOrders ? canEditWaybill(user?.role_mask ?? 0) : canViewPricing;
  const canUpdate = canMutateInventory(user?.role_mask ?? 0);
  const canUpdateCustomerPayment = ((user?.role_mask ?? 0) & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  const selectionEnabled = (!isAllOrders && canUpdate) || (isAllOrders && canUpdateCustomerPayment);
  const canEdit = canEditWaybill(user?.role_mask ?? 0);
  const canDelete = hasManagerAccess(user?.role_mask ?? 0);
  const [visibleColumnIds, setVisibleColumnIds] = useState<InventoryColumnId[]>(() =>
    isAllOrders ? loadAllOrdersVisibleColumnIds() : loadVisibleColumnIds(canViewPricing),
  );
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const hubOptions = useMemo(() => hubs.map(hub => ({ value: String(hub.id), label: formatHub(hub) })), [hubs]);
  const activeFilterCount =
    filters.statuses.length +
    filters.customerPaymentStatuses.length +
    filters.hubIds.length +
    filters.paymentTypes.length +
    filters.priorities.length +
    Number(Boolean(filters.receivedFrom || filters.receivedTo)) +
    Number(Boolean(filters.ma_kh.trim()));
  const visibleColumns = useMemo(
    () => resolveVisibleColumnViews(visibleColumnIds, variant, canViewPricing),
    [visibleColumnIds, variant, canViewPricing],
  );
  const grandTotals = useMemo(
    () => computeGrandTotals(waybills, canViewPricing),
    [waybills, canViewPricing],
  );
  const selectedWaybills = useMemo(
    () => waybills.filter((waybill) => selectedWaybillIds.includes(String(waybill.id))),
    [waybills, selectedWaybillIds],
  );
  const allRowsSelected = waybills.length > 0 && waybills.every((waybill) => selectedWaybillIds.includes(String(waybill.id)));
  const toggleSelectAll = () => {
    setSelectedWaybillIds(allRowsSelected ? [] : waybills.map((waybill) => String(waybill.id)));
  };
  const toggleSelectRow = (waybillId: string | number) => {
    const id = String(waybillId);
    setSelectedWaybillIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };
  const toggleActionMenu = (id: string) => {
    setOpenActionMenuId((prev) => (prev === id ? null : id));
  };
  const openStackDialog = () => {
    if (!selectedWaybills.length) return;
    setIsStackClosing(false);
    setIsStackOpen(true);
  };
  const closeStackDialog = () => {
    setIsStackClosing(true);
    window.setTimeout(() => {
      setIsStackOpen(false);
      setIsStackClosing(false);
    }, 180);
  };
  const clearFilters = () => {
    setFilters(isAllOrders ? allOrdersDefaultFilters : defaultFilters);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ma_kh');
      return next;
    });
  };
  const clearMaKhFilter = () => {
    updateFilters({ ma_kh: '' });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ma_kh');
      return next;
    });
  };
  const setFilterArray = (key: keyof Pick<InventoryFilters, 'statuses' | 'hubIds' | 'paymentTypes' | 'priorities'>, value: string[]) => updateFilters({ [key]: value } as Partial<InventoryFilters>);

  useEffect(() => { if (canViewPage) void loadHubs(); }, [canViewPage]);
  useEffect(() => {
    if (isAllOrders) return;
    const maKh = searchParams.get('ma_kh')?.trim() || '';
    setFilters((prev) => (prev.ma_kh === maKh ? prev : { ...prev, ma_kh: maKh, page: 1 }));
  }, [searchParams, isAllOrders]);
  useEffect(() => { if (canViewPage) void loadInventory(); }, [filters, canViewPage]);
  useEffect(() => {
    const visibleIds = new Set(waybills.map((waybill) => String(waybill.id)));
    setSelectedWaybillIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [waybills]);

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
      const response = await apiRequest<InventoryListResponse | WaybillInventoryItem[]>(`/waybills/inventory/trip-lines?${buildQuery(filters, variant)}`);
      const rawItems = normalizeList(response);
      const items = isAllOrders ? sortAllOrders(rawItems) : rawItems.filter(isIncompleteSplitRow);
      setWaybills(items);
      const orderCount = Array.isArray(response)
        ? items.length
        : response.meta?.total_waybills ?? response.meta?.total ?? items.length;
      setTotal(orderCount);
      setFilterTotals({
        orderCount,
        totalFreight: Array.isArray(response) ? 0 : Number(response.meta?.total_freight ?? 0),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách tồn kho theo chuyến.');
      setWaybills([]);
      setTotal(0);
      setFilterTotals({ orderCount: 0, totalFreight: 0 });
    } finally {
      setIsLoading(false);
    }
  }

  async function updateCustomerPaymentStatus() {
    if (!selectedWaybillIds.length || !canUpdateCustomerPayment) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await apiRequest('/waybills/inventory/customer-payment-status', {
        method: 'PATCH',
        body: {
          waybill_ids: selectedWaybillIds.map(Number),
          status: customerPaymentStatus || null,
          note: customerPaymentNote.trim() || undefined,
        },
      });
      setIsPaymentStatusDialogOpen(false);
      setCustomerPaymentStatus('');
      setCustomerPaymentNote('');
      await loadInventory();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được tình trạng thanh toán.');
    } finally {
      setIsDeleting(false);
    }
  }

  const updateFilters = (patch: Partial<InventoryFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  const openFilterSheet = () => { setDraftFilters(filters); setIsFilterOpen(true); };
  const applyFilters = () => { setFilters({ ...draftFilters, page: 1 }); setIsFilterOpen(false); };

  const openDetail = async (waybill: WaybillInventoryItem) => {
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
  const openSplit = (waybill: WaybillInventoryItem | null = null) => {
    if (waybill) {
      setSplitWaybill(waybill);
      setIsSplitOpen(true);
      return;
    }
    setSplitWaybill(null);
    setIsBoardOpen(true);
  };
  const closeSplit = () => { setIsSplitClosing(true); window.setTimeout(() => { setIsSplitOpen(false); setIsSplitClosing(false); setSplitWaybill(null); }, 180); };
  const closeBoard = () => { setIsBoardClosing(true); window.setTimeout(() => { setIsBoardOpen(false); setIsBoardClosing(false); }, 180); };

  const openCashVoucher = (waybill: WaybillInventoryItem) => {
    setCashVoucherWaybill(waybill);
    setIsCashVoucherOpen(true);
  };
  const closeCashVoucher = () => {
    setIsCashVoucherClosing(true);
    window.setTimeout(() => {
      setIsCashVoucherOpen(false);
      setIsCashVoucherClosing(false);
      setCashVoucherWaybill(null);
    }, 180);
  };

  const openEdit = (waybill: WaybillInventoryItem) => {
    navigate('/orders/new', { state: { waybillId: String(waybill.id) } });
  };

  const confirmDeleteWaybill = (waybill: WaybillInventoryItem) => {
    setConfirmDialog({
      title: 'Xóa vận đơn',
      message: `Xóa vận đơn ${displayCode(waybill)} khỏi hệ thống? Chỉ xóa được khi đơn ở trạng thái «Đã tạo đơn» hoặc «Trong kho».`,
      confirmLabel: 'Xóa',
      danger: true,
      onConfirm: async () => {
        setIsDeleting(true);
        setActionError('');
        try {
          await apiRequest(`/waybills/${waybill.id}`, { method: 'DELETE' });
          await loadInventory();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không thể xóa vận đơn.');
        } finally {
          setIsDeleting(false);
        }
      },
    });
  };

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

  function handleDownloadExcel() {
    setActionError('');
    if (!waybills.length) {
      setActionError(isAllOrders ? 'Không có đơn trên danh sách để tải Excel.' : 'Không có đơn tồn kho trên danh sách để tải Excel.');
      return;
    }
    setIsExporting(true);
    try {
      const exported = downloadInventoryExcel(
        waybills,
        canViewPricing,
        statusConfig,
        priorityConfig,
        isAllOrders ? 'danh-sach-don' : 'danh-sach-ton-kho',
      );
      if (!exported) setActionError('Không có dữ liệu để tải Excel.');
    } finally {
      setIsExporting(false);
    }
  }

  if (!canViewPage) {
    return (
      <StateCard
        icon={<ShieldAlert size={24} />}
        title="Không có quyền truy cập"
        description={isAllOrders ? 'Trang danh sách đơn yêu cầu quyền WAREHOUSE trở lên.' : 'Trang danh sách đơn tồn kho chỉ hiển thị cho MANAGER hoặc DIRECTOR.'}
      />
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <Alert message={actionError} tone="red" />}
      {error && <Alert message={error} tone="red" />}
      {!isAllOrders && filters.ma_kh.trim() && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-[13px]">
          <span className="font-medium text-muted-foreground">Lọc theo Mã KH:</span>
          <span className="font-extrabold text-primary">{filters.ma_kh.trim().toUpperCase()}</span>
          <button
            type="button"
            onClick={clearMaKhFilter}
            className="ml-auto rounded-lg border border-border bg-white px-3 py-1 text-[12px] font-bold text-muted-foreground hover:bg-muted"
          >
            × Bỏ lọc KH
          </button>
        </div>
      )}

      {isAllOrders ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] text-muted-foreground">
            <span className="font-extrabold text-foreground">Danh sách đơn</span>
            {' — '}
            Hiển thị toàn bộ vận đơn theo ngày và mã bill, có thể lọc theo khoảng ngày bốc hàng.
          </div>
          <div className={clsx('grid grid-cols-1 gap-3', canViewPricing ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
            <FilterSummaryCard
              label="Tổng đơn (theo bộ lọc)"
              value={isLoading ? '…' : `${filterTotals.orderCount.toLocaleString('vi-VN')} đơn`}
              tone="blue"
            />
            {canViewPricing && (
              <FilterSummaryCard
                label="Tổng cước phí (theo bộ lọc)"
                value={isLoading ? '…' : `${filterTotals.totalFreight.toLocaleString('vi-VN')} đ`}
                tone="emerald"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-900">
          <span className="font-bold">Chỉ hiển thị đơn tồn</span>
          {' — '}
          Các dòng đã phân đủ kiện lên xe sẽ không xuất hiện trong danh sách này.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.history.back()} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            {!isAllOrders && (
              <>
                <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm kiếm..." className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
                <button title="Mở bộ lọc" onClick={openFilterSheet} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
                {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
              </>
            )}
            {isAllOrders && (
              <>
                <div className="relative min-w-[180px] flex-1 md:max-w-[280px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filters.keyword}
                    onChange={(event) => updateFilters({ keyword: event.target.value })}
                    placeholder="Tìm bill, khách, sđt..."
                    className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <input
                  value={filters.ma_kh}
                  onChange={(event) => updateFilters({ ma_kh: event.target.value })}
                  placeholder="Lọc mã khách"
                  className="h-10 w-[160px] rounded-lg border border-border px-3 text-[13px] font-medium"
                />
                <select
                  value={filters.customerPaymentStatuses[0] || ''}
                  onChange={(event) =>
                    updateFilters({
                      customerPaymentStatuses: event.target.value ? [event.target.value] : [],
                    })
                  }
                  className="h-10 w-[180px] rounded-lg border border-border px-3 text-[13px] font-medium"
                >
                  <option value="">TT thanh toán: Tất cả</option>
                  {customerPaymentStatusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="hidden flex-1 md:block" />
            {!isAllOrders && canUpdate && (
              <button
                type="button"
                title="Xếp hàng lên xe"
                disabled={selectedWaybills.length === 0}
                onClick={openStackDialog}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[13px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                <Truck size={16} />
                <span className="hidden sm:inline">Xếp hàng lên xe</span>
                {selectedWaybills.length > 0 && (
                  <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{selectedWaybills.length}</span>
                )}
              </button>
            )}
            {isAllOrders && <DateRangePicker value={{ from: filters.receivedFrom, to: filters.receivedTo }} onChange={({ from, to }) => updateFilters({ receivedFrom: from || '', receivedTo: to || '' })} placeholder="Từ ngày - Đến ngày" className="w-[18.5rem] shrink-0" />}
            {isAllOrders && activeFilterCount > 0 && <button onClick={clearFilters} className="h-10 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100">× Xóa {activeFilterCount} bộ lọc</button>}
            <button
              type="button"
              title="Bảng kê phát hàng — xe & vị trí"
              onClick={() => openSplit(null)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-bold text-violet-800 hover:bg-violet-100"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Bảng kê xe</span>
            </button>
            <button
              onClick={() => setIsColumnPickerOpen(true)}
              className={clsx(
                'inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground hover:bg-muted',
                isAllOrders && 'hidden',
              )}
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
            <button
              type="button"
              title="Tải xuống Excel"
              disabled={isLoading || isExporting || waybills.length === 0}
              onClick={handleDownloadExcel}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 text-[13px] font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              <span className="hidden sm:inline">Tải Excel</span>
            </button>
            <button title="Làm mới" onClick={() => void loadInventory()} className="hidden h-10 w-10 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted md:flex items-center justify-center"><RefreshCcw size={16} /></button>
          </div>

          {!isAllOrders && <div className="hidden flex-wrap items-center gap-2 md:flex">
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
            </div>}
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {isLoading ? <StateCard compact icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải dữ liệu" description={isAllOrders ? 'Hệ thống đang lấy danh sách đơn từ API.' : 'Hệ thống đang lấy danh sách vận đơn tồn kho từ API.'} /> : waybills.length === 0 ? <StateCard compact icon={<Package size={24} />} title={isAllOrders ? 'Chưa có đơn' : 'Chưa có đơn cần chia'} description={isAllOrders ? 'Chưa có vận đơn nào trong hệ thống.' : 'Tất cả đơn tồn kho đã phân hết kiện lên xe, hoặc thử đổi bộ lọc.'} /> : (
            <>
              <table className="hidden md:table w-full min-w-[1280px] text-left border-collapse">
                <thead className="text-[11px] uppercase tracking-wider text-slate-600">
                  {isAllOrders ? (
                    <AllOrdersTableHeader
                      columns={visibleColumns}
                      selectionEnabled={false}
                    />
                  ) : (
                    <tr className="bg-slate-100">
                      {selectionEnabled && (
                        <th className="w-10 px-2 py-2.5 font-bold border-r border-border text-center">
                          <input
                            type="checkbox"
                            checked={allRowsSelected}
                            onChange={toggleSelectAll}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                            aria-label="Chọn tất cả"
                          />
                        </th>
                      )}
                      {visibleColumns.map((col) => (
                        <th key={col.id} className="px-4 py-2.5 font-bold border-r border-border last:border-r-0 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {waybills.map((waybill, rowIndex) => (
                    <InventoryRow
                      key={`${waybill.id}-${waybill.split_id ?? 'base'}`}
                      waybill={waybill}
                      columns={visibleColumns}
                      rowIndex={(filters.page - 1) * filters.limit + rowIndex + 1}
                      isAllOrders={isAllOrders}
                      canViewPricing={canViewPricing}
                      canUpdate={canUpdate}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      showSelection={selectionEnabled && !isAllOrders}
                      selected={selectedWaybillIds.includes(String(waybill.id))}
                      onToggleSelect={toggleSelectRow}
                      openActionMenuId={openActionMenuId}
                      onToggleActionMenu={toggleActionMenu}
                      onCloseActionMenu={() => setOpenActionMenuId(null)}
                      onDetail={openDetail}
                      onEdit={openEdit}
                      onDelete={confirmDeleteWaybill}
                      onSplit={openSplit}
                      onCashVoucher={openCashVoucher}
                    />
                  ))}
                </tbody>
                {!isAllOrders && (
                <tfoot className="bg-slate-50 text-[12px] font-extrabold text-foreground">
                  <tr>
                    {selectionEnabled && <td className="border-t border-border px-2 py-2.5 border-r" />}
                    {visibleColumns.map((col) => (
                      <td key={col.id} className="border-t border-border px-4 py-2.5 border-r last:border-r-0">
                        {col.id === 'order_code' ? 'Tổng cộng' : ''}
                        {col.id === 'package_count' ? grandTotals.package_count : ''}
                        {col.id === 'weight' ? `${grandTotals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : ''}
                        {col.id === 'volume' ? `${grandTotals.volume_m3.toFixed(2)} m³` : ''}
                        {col.id === 'freight' && canViewPricing ? `${grandTotals.freight.toLocaleString('vi-VN')} đ` : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
                )}
              </table>
              <div className="grid gap-3 p-3 md:hidden">{waybills.map(waybill => <InventoryCard key={`${waybill.id}-${waybill.split_id ?? 'base'}`} waybill={waybill} canUpdate={canUpdate} canEdit={canEdit} canDelete={canDelete} openActionMenuId={openActionMenuId} onToggleActionMenu={toggleActionMenu} onCloseActionMenu={() => setOpenActionMenuId(null)} onDetail={openDetail} onEdit={openEdit} onDelete={confirmDeleteWaybill} onSplit={openSplit} onCashVoucher={openCashVoucher} />)}</div>
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

      {!isAllOrders && <FilterBottomSheet isOpen={isFilterOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} groupSearch={groupSearch} setGroupSearch={setGroupSearch} hubOptions={hubOptions} onClose={() => setIsFilterOpen(false)} onApply={applyFilters} />}
      <WaybillInventoryDetailDialog isOpen={isDetailOpen} isClosing={isDetailClosing} isLoading={isDetailLoading} waybill={detailWaybill} statusConfig={statusConfig} paymentConfig={paymentConfig} priorityConfig={priorityConfig} onClose={closeDetail} />
      {splitWaybill && (
        <WaybillPackageSplitDialog
          isOpen={isSplitOpen}
          isClosing={isSplitClosing}
          waybill={splitWaybill}
          onClose={closeSplit}
          onSaved={() => void loadInventory()}
        />
      )}
      <SplitOrderDialog isOpen={isBoardOpen} isClosing={isBoardClosing} waybill={null} onClose={closeBoard} />
      {!isAllOrders && (
      <InventoryColumnPicker
        isOpen={isColumnPickerOpen}
        visibleIds={visibleColumnIds}
        canViewPricing={canViewPricing}
        onChange={(ids) => {
          setVisibleColumnIds(ids);
          saveVisibleColumnIds(ids);
        }}
        onClose={() => setIsColumnPickerOpen(false)}
      />
      )}
      <ConfirmDialog dialog={confirmDialog} isSubmitting={isDeleting} onClose={() => setConfirmDialog(null)} />
      <WaybillCashVoucherDialog
        isOpen={isCashVoucherOpen}
        isClosing={isCashVoucherClosing}
        waybill={cashVoucherWaybill}
        onClose={closeCashVoucher}
      />
      <StackOntoTruckDialog
        isOpen={isStackOpen}
        isClosing={isStackClosing}
        waybills={selectedWaybills}
        onClose={closeStackDialog}
        onSaved={(result) => {
          setSelectedWaybillIds([]);
          if (result?.manifest_id) {
            navigate(`/warehouse/manifests?openManifestId=${encodeURIComponent(String(result.manifest_id))}`);
            return;
          }
          void loadInventory();
        }}
      />
      {isPaymentStatusDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-[15px] font-extrabold">Cập nhật tình trạng TT ({selectedWaybillIds.length} đơn)</h3>
              <button type="button" onClick={() => setIsPaymentStatusDialogOpen(false)} className="rounded-lg p-2 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground">
                Trạng thái
                <select
                  value={customerPaymentStatus}
                  onChange={(e) => setCustomerPaymentStatus(e.target.value as 'PAID' | 'SENT_STATEMENT' | '')}
                  className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-[13px] font-bold"
                >
                  <option value="">Bỏ trống</option>
                  <option value="SENT_STATEMENT">Đã gửi bảng kê</option>
                  <option value="PAID">Đã TT</option>
                </select>
              </label>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground">
                Ghi chú
                <textarea
                  value={customerPaymentNote}
                  onChange={(e) => setCustomerPaymentNote(e.target.value)}
                  className="mt-1 min-h-[88px] w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                  placeholder="Ghi chú thanh toán theo mã khách/đơn..."
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button type="button" onClick={() => setIsPaymentStatusDialogOpen(false)} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold">
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void updateCustomerPaymentStatus()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : null}
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryRow({
  waybill,
  columns,
  rowIndex,
  isAllOrders,
  canViewPricing,
  canUpdate,
  canEdit,
  canDelete,
  openActionMenuId,
  onToggleActionMenu,
  onCloseActionMenu,
  showSelection,
  selected,
  onToggleSelect,
  onDetail,
  onEdit,
  onDelete,
  onSplit,
  onCashVoucher,
}: InventoryItemProps & {
  columns: InventoryColumnView[];
  rowIndex?: number;
  isAllOrders?: boolean;
  canViewPricing: boolean;
  showSelection?: boolean;
  selected?: boolean;
  onToggleSelect?: (waybillId: string | number) => void;
}) {
  const cellClass = 'px-4 py-3 border-r border-border text-[13px] max-w-[200px] truncate';

  const renderCell = (colId: InventoryColumnId) => {
    switch (colId) {
      case 'stt':
        return <td className={`${cellClass} text-center font-bold text-muted-foreground`}>{rowIndex ?? '—'}</td>;
      case 'cong_sg':
        return <td className={cellClass}>{resolveCongSg(waybill)}</td>;
      case 'stack_position':
        return <td className={`${cellClass} min-w-[72px] text-muted-foreground`}>&nbsp;</td>;
      case 'order_code':
        return <td className={`${cellClass} font-bold text-violet-800`}>{waybill.order_code || '—'}</td>;
      case 'waybill_code':
        return (
          <td className={`${cellClass} ${isAllOrders ? 'font-bold' : 'font-extrabold text-primary'}`}>
            {displayCode(waybill)}
          </td>
        );
      case 'customer_name':
        return <td className={`${cellClass} font-semibold`}>{resolveCustomerName(waybill)}</td>;
      case 'bill_info':
        return (
          <td className={cellClass}>
            <p className="font-bold">{displayCode(waybill)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{waybill.noi_dung || waybill.mat_hang || '—'}</p>
          </td>
        );
      case 'service_type':
        return <td className={cellClass}>{resolveServiceType(waybill)}</td>;
      case 'trip_label':
        return (
          <td className={cellClass}>
            <span className={clsx(
              'font-bold',
              !waybill.trip_label || waybill.trip_label.includes('Chưa phân') || waybill.trip_label.startsWith('Còn')
                ? 'text-amber-700'
                : 'text-foreground',
            )}>
              {waybill.trip_label || '—'}
            </span>
            {waybill.loading_position ? (
              <span className="ml-1 text-[11px] text-muted-foreground">· VT {waybill.loading_position}</span>
            ) : null}
          </td>
        );
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
      case 'billing_unit':
        return <td className={cellClass}>{resolveBillingUnit(waybill)}</td>;
      case 'unit_price':
        return <td className={`${cellClass} font-bold text-right`}>{displayValue(resolveUnitPrice(waybill), ' đ')}</td>;
      case 'transit_fee':
        return <td className={`${cellClass} font-bold text-right`}>{displayValue(resolveTransitFee(waybill), ' đ')}</td>;
      case 'total_amount': {
        const totalAmount = resolveFreight(waybill) + resolveTransitFee(waybill);
        return (
          <td className={clsx(cellClass, 'font-bold text-right', isAllOrders && 'bg-emerald-50/80 text-emerald-800')}>
            {canViewPricing ? displayValue(totalAmount, ' đ') : '—'}
          </td>
        );
      }
      case 'thu_ho_khach':
        return <td className={`${cellClass} font-bold text-right`}>{displayValue(waybill.allocated_cod ?? waybill.cod_amount, ' đ')}</td>;
      case 'payment_method':
        return <td className={cellClass}>{resolvePaymentMethod(waybill)}</td>;
      case 'customer_payment_status': {
        const status = String(waybill.customer_payment_status || '');
        const label = customerPaymentStatusText[status] || '—';
        const tone = status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'SENT_STATEMENT' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
        return (
          <td className={clsx(cellClass, isAllOrders && 'bg-yellow-50/80')}>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
          </td>
        );
      }
      case 'customer_payment_note':
        return <td className={clsx(cellClass, isAllOrders && 'max-w-[120px]')}>{waybill.customer_payment_note || '—'}</td>;
      case 'route':
        return (
          <td className="overflow-visible px-4 py-3 border-r border-border">
            <WaybillRouteControl
              waybillId={waybill.id}
              value={waybill.route_code || waybill.delivery_route}
              hubId={waybill.dest_hub_id ?? waybill.current_hub_id ?? waybill.origin_hub_id}
              disabled={!canUpdate}
            />
          </td>
        );
      case 'ma_kh':
        return <td className={cellClass}>{resolveMaKh(waybill)}</td>;
      case 'receiver_address':
        return <td className={cellClass}>{resolveReceiverAddress(waybill)}</td>;
      case 'package_count':
        return (
          <td className={`${cellClass} font-medium text-right`}>
            {isAllOrders
              ? resolvePackageCountSl(waybill)
              : waybill.remaining_packages != null
                ? `${waybill.remaining_packages} / ${waybill.order_total_packages ?? waybill.package_count ?? waybill.remaining_packages}`
                : waybill.trip_package_count != null
                  ? `${waybill.trip_package_count} / ${waybill.order_total_packages ?? waybill.package_count ?? waybill.trip_package_count}`
                  : displayValue(waybill.package_count || waybill.declared_package_count)}
          </td>
        );
      case 'weight':
        return <td className={`${cellClass} font-medium`}>{displayValue(resolveWeightKg(waybill) || null, ' kg')}</td>;
      case 'volume':
        return <td className={`${cellClass} font-medium`}>{resolveVolumeM3(waybill) ? `${resolveVolumeM3(waybill).toFixed(2)} m³` : '—'}</td>;
      case 'freight':
        return (
          <td className={`${cellClass} font-bold`}>
            {canViewPricing ? displayValue(waybill.allocated_freight ?? resolveFreight(waybill), ' đ') : '—'}
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
        return <td className={`${cellClass} font-bold`}>{displayValue(waybill.allocated_cod ?? waybill.cod_amount, ' đ')}</td>;
      case 'priority':
        return (
          <td className="overflow-visible px-4 py-3 border-r border-border">
            <WaybillPriorityControl waybillId={waybill.id} value={waybill.priority} disabled={!canUpdate} />
          </td>
        );
      case 'actions':
        return (
          <td className="px-4 py-3">
            <Actions
              waybill={waybill}
              canEdit={canEdit}
              canDelete={canDelete}
              isMutable={isMutableWaybill(waybill)}
              isOpen={openActionMenuId === actionMenuId(waybill)}
              onToggle={() => onToggleActionMenu(actionMenuId(waybill))}
              onClose={onCloseActionMenu}
              onDetail={onDetail}
              onEdit={onEdit}
              onDelete={onDelete}
              onSplit={onSplit}
              onCashVoucher={onCashVoucher}
            />
          </td>
        );
      default:
        return <td className={cellClass}>—</td>;
    }
  };

  return (
    <tr
      className={clsx(
        'border-b border-border align-top transition-colors',
        getStorageAgeRowClass(waybill),
        selected && 'bg-amber-50/60',
        isAllOrders && 'cursor-pointer hover:bg-sky-50/50',
      )}
      onClick={isAllOrders ? () => onDetail(waybill) : undefined}
    >
      {showSelection && (
        <td className="w-10 border-r border-border px-2 py-3 text-center">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(waybill.id)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            aria-label={`Chọn ${displayCode(waybill)}`}
          />
        </td>
      )}
      {columns.map((col) => renderCell(col.id))}
    </tr>
  );
}

function InventoryCard({ waybill, canUpdate, canEdit, canDelete, openActionMenuId, onToggleActionMenu, onCloseActionMenu, onDetail, onEdit, onDelete, onSplit, onCashVoucher }: InventoryItemProps) {
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} />
            <WaybillPriorityControl waybillId={waybill.id} value={waybill.priority} disabled={!canUpdate} compact />
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
        <MobileInfo label="Tuyến" value={
          <WaybillRouteControl
            waybillId={waybill.id}
            value={waybill.route_code || waybill.delivery_route}
            hubId={waybill.dest_hub_id ?? waybill.current_hub_id ?? waybill.origin_hub_id}
            disabled={!canUpdate}
            compact
          />
        } />
        <MobileInfo label="COD" value={displayValue(waybill.cod_amount, ' đ')} />
        <MobileInfo label="Số kiện" value={
          waybill.remaining_packages != null
            ? `${waybill.remaining_packages} / ${waybill.order_total_packages ?? waybill.package_count ?? waybill.remaining_packages} (còn chia)`
            : displayValue(waybill.package_count || waybill.declared_package_count)
        } />
        <MobileInfo label="Cân nặng" value={displayValue(waybill.actual_weight || waybill.weight, ' kg')} />
        <MobileInfo label="Ngày nhận" value={formatDate(waybill.received_at || waybill.created_at)} />
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <Actions
          waybill={waybill}
          canEdit={canEdit}
          canDelete={canDelete}
          isMutable={isMutableWaybill(waybill)}
          isOpen={openActionMenuId === actionMenuId(waybill)}
          onToggle={() => onToggleActionMenu(actionMenuId(waybill))}
          onClose={onCloseActionMenu}
          onDetail={onDetail}
          onEdit={onEdit}
          onDelete={onDelete}
          onSplit={onSplit}
          onCashVoucher={onCashVoucher}
        />
      </div>
    </article>
  );
}

interface InventoryItemProps {
  waybill: WaybillInventoryItem;
  canUpdate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  openActionMenuId: string | null;
  onToggleActionMenu: (id: string) => void;
  onCloseActionMenu: () => void;
  onDetail: (waybill: WaybillInventoryItem) => void;
  onEdit: (waybill: WaybillInventoryItem) => void;
  onDelete: (waybill: WaybillInventoryItem) => void;
  onSplit: (waybill: WaybillInventoryItem) => void;
  onCashVoucher: (waybill: WaybillInventoryItem) => void;
}

function Actions({
  waybill,
  canEdit,
  canDelete,
  isMutable,
  isOpen,
  onToggle,
  onClose,
  onDetail,
  onEdit,
  onDelete,
  onSplit,
  onCashVoucher,
}: Pick<InventoryItemProps, 'waybill' | 'canEdit' | 'canDelete' | 'onDetail' | 'onEdit' | 'onDelete' | 'onSplit' | 'onCashVoucher'> & { isMutable: boolean; isOpen: boolean; onToggle: () => void; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const editDisabled = !canEdit || !isMutable;
  const deleteDisabled = !canDelete || !isMutable;
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const runAction = (action: () => void) => {
    onClose();
    action();
  };
  const lockedTitle = 'Chỉ sửa/xóa được đơn ở trạng thái «Đã tạo đơn» hoặc «Trong kho»';

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        aria-label="Mở thao tác"
        className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-white text-foreground shadow-sm hover:bg-muted [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={17} />
      </button>
      {isOpen && <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-xl shadow-slate-900/10">
        <MenuAction icon={<Eye size={14} />} label="Xem" onClick={() => runAction(() => onDetail(waybill))} />
        {canCollectCashPayment(waybill.payment_type) && (
          <MenuAction icon={<HandCoins size={14} />} label="Thu chi" onClick={() => runAction(() => onCashVoucher(waybill))} tone="teal" />
        )}
        <MenuAction icon={<Layers size={14} />} label="Chia đơn" onClick={() => runAction(() => onSplit(waybill))} tone="violet" />
        <MenuAction
          icon={<Pencil size={14} />}
          label="Sửa"
          disabled={editDisabled}
          title={editDisabled ? (canEdit ? lockedTitle : 'Cần quyền WAREHOUSE trở lên') : 'Sửa thông tin đơn'}
          onClick={() => runAction(() => onEdit(waybill))}
        />
        <MenuAction
          icon={<Trash2 size={14} />}
          label="Xóa"
          disabled={deleteDisabled}
          title={deleteDisabled ? (canDelete ? lockedTitle : 'Chỉ MANAGER/DIRECTOR được xóa') : 'Xóa vận đơn'}
          onClick={() => runAction(() => onDelete(waybill))}
          tone="danger"
        />
      </div>}
    </div>
  );
}

function MenuAction({
  icon,
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'teal' | 'violet' | 'danger';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        !tone && 'text-foreground hover:bg-muted',
        tone === 'teal' && 'text-teal-800 hover:bg-teal-50',
        tone === 'violet' && 'text-violet-800 hover:bg-violet-50',
        tone === 'danger' && 'text-red-600 hover:bg-red-50',
      )}
    >
      {icon}
      {label}
    </button>
  );
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
function FilterSummaryCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'emerald' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold">{value}</p>
    </div>
  );
}

function Alert({ message, tone = 'amber' }: { message: string; tone?: 'amber' | 'red' }) { return <div className={clsx('flex gap-2 rounded-2xl border px-4 py-3 text-[13px] font-bold', tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800')}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</div>; }
function StateCard({ icon, title, description, compact = false }: { icon: ReactNode; title: string; description: string; compact?: boolean }) { return <div className={clsx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white text-center', compact ? 'm-5 min-h-[320px] p-6' : 'min-h-[420px] p-8')}><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div>; }





