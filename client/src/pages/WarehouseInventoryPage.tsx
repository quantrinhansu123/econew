import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronDown, CreditCard, Eye, FileSpreadsheet, Filter, Flag, HandCoins, Hash, Layers, Loader2, MoreHorizontal, Package, PackageCheck, Pencil, Printer, ReceiptText, RefreshCcw, Search, ShieldAlert, Tag, SlidersHorizontal, Truck, Unlink, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { formatMoney } from '../lib/formatMoney';
import { WAYBILL_LIST_CHANGED_EVENT, WAYBILL_LIST_CHANGED_STORAGE_KEY } from '../lib/waybillListSync';
import { DayPicker } from '../components/ui/DayPicker';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { FilterSelect } from '../components/ui/FilterSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import InlineMoneyInput from '../components/ui/InlineMoneyInput';
import InlineTextInput from '../components/ui/InlineTextInput';
import type { AuthUserProfile } from './login/types';
import WaybillInventoryDetailDialog from './warehouse/inventory/dialogs/WaybillInventoryDetailDialog';
import WaybillEditDialog from './warehouse/inventory/dialogs/WaybillEditDialog';
import WaybillPriorityControl from './warehouse/inventory/WaybillPriorityControl';
import WaybillRouteControl from './warehouse/inventory/WaybillRouteControl';
import SplitOrderDialog from './warehouse/inventory/dialogs/SplitOrderDialog';
import WaybillCashVoucherDialog from './warehouse/inventory/dialogs/WaybillCashVoucherDialog';
import StackOntoTruckDialog from './warehouse/inventory/dialogs/StackOntoTruckDialog';
import { mapWaybillsToPrintSheets, saveInventoryPrintPayload, summarizeFilters } from './print/inventoryPrintUtils';
import InventoryColumnPicker from './warehouse/inventory/InventoryColumnPicker';
import AllOrdersTableHeader from './warehouse/inventory/AllOrdersTableHeader';
import AllOrdersSortControl from './warehouse/inventory/AllOrdersSortControl';
import { resolveCustomerLedgerCode } from './warehouse/inventory/allOrdersSortUtils';
import {
  applyAllOrdersColumnFilters,
  applyAllOrdersGlobalSearch,
  buildAllOrdersColumnFilterOptions,
  sortAllOrders,
  type AllOrdersColumnFilterOption,
  type AllOrdersColumnFilters,
  type AllOrdersSort,
  type AllOrdersSortDirection,
} from './warehouse/inventory/allOrdersColumnFilters';
import { downloadInventoryExcel } from './warehouse/inventory/inventoryExcelUtils';
import {
  ALL_ORDERS_COLUMN_WIDTHS,
  canCollectCashPayment,
  computeGrandTotals,
  formatInventoryDate,
  getStorageAgeRowClass,
  loadVisibleColumnIds,
  loadAllOrdersVisibleColumnIds,
  normalizeAllOrdersVisibleColumnIds,
  normalizeInventoryVisibleColumnIds,
  resolveVisibleColumnViews,
  getAllOrdersActiveStickyColumnIds,
  getAllOrdersStickyLeft,
  resolveCongSg,
  resolvePackageCountSl,
  resolveFreight,
  resolveCustomerName,
  resolveServiceType,
  resolveBillingUnit,
  resolveUnitPrice,
  resolveTransitFee,
  resolveInventoryTripStatusLabel,
  resolveDeliveryStaff,
  resolveDeliveryProcessingPresentation,
  resolvePaymentMethod,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveReceiverAddress,
  resolveReceiverDistrict,
  resolveReceiverPhone,
  resolveReceiverWard,
  resolveVolumeM3,
  resolveWeightKg,
  resolveSurcharge,
  resolveTotalAmount,
  resolveBillingQtyDetail,
  resolveOrderStatusBadge,
  resolveWarehouseIntakePresentation,
  resolveUserNote,
  saveVisibleColumnIds,
  saveAllOrdersVisibleColumnIds,
  type InventoryColumnId,
  type InventoryColumnView,
} from './warehouse/inventory/inventoryColumns';
import { buildInventoryTripLinesQuery, isIncompleteSplitRow, sortAllOrdersByCreatedAt } from './warehouse/inventory/inventoryTripLines';
import { ORDER_STATUS_GROUP_OPTIONS } from './warehouse/inventory/orderStatusUtils';
import type { BadgeConfig, FilterOption, HubSummary, InventoryFilters, InventoryListResponse, WaybillInventoryDetail, WaybillInventoryItem } from './warehouse/inventory/types';
import { parseWaybillImages } from '../lib/waybillImages';
import { buildDispatchBarcodeUrl } from './print/dispatchBarcode';
import CustomerDetailDialog from './warehouse/customers/dialogs/CustomerDetailDialog';
import type { CustomerRecord } from './warehouse/customers/customerFormTypes';
import type { CustomerListItem, CustomerListResponse } from './warehouse/customers/types';


const USER_PROFILE_KEY = 'eco_user_profile';
const WAREHOUSE = 1;
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;
const DISPATCHER = 8;
const MUTABLE_WAYBILL_STATUSES = ['RECEIVED', 'IN_WAREHOUSE'];
const defaultFilters: InventoryFilters = { keyword: '', ma_kh: '', statuses: [], orderStatusGroups: [], noiDenKeyword: '', billingUnits: [], customerPaymentStatuses: [], originHubIds: [], destHubIds: [], paymentTypes: [], priorities: [], receivedFrom: '', receivedTo: '', page: 1, limit: 10 };
const allOrdersDefaultFilters: InventoryFilters = { ...defaultFilters, limit: 25 };
const billingUnitFilterOptions: FilterOption[] = [
  { value: 'Kg', label: 'Kg' },
  { value: 'Khối', label: 'Khối' },
  { value: 'Trọn gói', label: 'Trọn gói' },
  { value: 'Chuyến', label: 'Chuyến' },
  { value: 'Lô', label: 'Lô' },
];
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
  RECEIVED: { label: 'Đơn cần lấy', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Đã nhập kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Chờ bốc', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  LOADED: { label: 'Đã bốc', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Đang giao', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  DELIVERED: { label: 'Phát thành công', className: 'bg-green-50 text-green-700 border-green-200' },
  RETURNED: { label: 'Giao không thành công', className: 'bg-red-50 text-red-700 border-red-200' },
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
const canViewInventory = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const canEditWaybill = (roleMask: number) => (roleMask & (WAREHOUSE | MANAGER | DIRECTOR)) !== 0;
const canMutateInventory = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeList = (response: InventoryListResponse | WaybillInventoryItem[]) => Array.isArray(response) ? response : response.data || response.items || response.waybills || [];
const formatDate = (value?: string | null) => (value ? formatInventoryDate(value) : '—');
const displayCode = (waybill: WaybillInventoryItem) => waybill.waybill_code || waybill.code || `#${waybill.id}`;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillInventoryItem) => String(waybill.current_state || waybill.status || '').toUpperCase();
const isMutableWaybill = (waybill: WaybillInventoryItem) => MUTABLE_WAYBILL_STATUSES.includes(normalizeStatus(waybill));
const actionMenuId = (waybill: WaybillInventoryItem, surface: 'table' | 'card') =>
  `${waybill.id}-${waybill.split_id ?? 'base'}-${surface}`;
const formatHub = (hub: HubSummary | null | undefined, fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';

const buildQuery = (filters: InventoryFilters, variant: InventoryPageVariant) =>
  buildInventoryTripLinesQuery(filters, {
    onlyIncompleteSplit: variant === 'split-pending',
    listScope: variant === 'all-orders' ? 'all_orders' : undefined,
  });

const EXCEL_EXPORT_PAGE_SIZE = 100;

async function loadAllInventoryRows(
  filters: InventoryFilters,
  variant: InventoryPageVariant,
): Promise<WaybillInventoryItem[]> {
  const requestPage = (page: number) =>
    apiRequest<InventoryListResponse | WaybillInventoryItem[]>(
      `/waybills/inventory/trip-lines?${buildQuery(
        { ...filters, page, limit: EXCEL_EXPORT_PAGE_SIZE },
        variant,
      )}`,
    );

  const firstResponse = await requestPage(1);
  const firstItems = normalizeList(firstResponse);
  if (Array.isArray(firstResponse)) {
    return variant === 'all-orders'
      ? sortAllOrdersByCreatedAt(firstItems)
      : firstItems.filter(isIncompleteSplitRow);
  }

  const totalWaybills =
    firstResponse.meta?.total_waybills
    ?? firstResponse.meta?.total
    ?? firstItems.length;
  const totalPages = Math.max(1, Math.ceil(totalWaybills / EXCEL_EXPORT_PAGE_SIZE));
  const allItems = [...firstItems];

  for (let page = 2; page <= totalPages; page += 4) {
    const pageNumbers = Array.from(
      { length: Math.min(4, totalPages - page + 1) },
      (_, index) => page + index,
    );
    const responses = await Promise.all(pageNumbers.map(requestPage));
    responses.forEach((response) => allItems.push(...normalizeList(response)));
  }

  const seen = new Set<string>();
  const uniqueItems = allItems.filter((waybill) => {
    const key = `${waybill.id}:${waybill.split_id ?? 'base'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return variant === 'all-orders'
    ? sortAllOrdersByCreatedAt(uniqueItems)
    : uniqueItems.filter(isIncompleteSplitRow);
}

export default function WarehouseInventoryPage({ variant = 'split-pending' }: { variant?: InventoryPageVariant }) {
  const isAllOrders = variant === 'all-orders';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<InventoryFilters>(() => ({
    ...(isAllOrders ? allOrdersDefaultFilters : defaultFilters),
    ma_kh: isAllOrders ? '' : searchParams.get('ma_kh')?.trim() || '',
  }));
  const [draftFilters, setDraftFilters] = useState<InventoryFilters>(isAllOrders ? allOrdersDefaultFilters : defaultFilters);
  const [waybills, setWaybills] = useState<WaybillInventoryItem[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [filterTotals, setFilterTotals] = useState({ orderCount: 0, totalFreight: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ status: true, originHub: true, destHub: true, payment: false, priority: false, received: false });
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({ status: '', originHub: '', destHub: '', payment: '', priority: '' });
  const [detailWaybill, setDetailWaybill] = useState<WaybillInventoryDetail | null>(null);
  const [editWaybill, setEditWaybill] = useState<WaybillInventoryItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [isBoardClosing, setIsBoardClosing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
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
  const [releaseConfirm, setReleaseConfirm] = useState<ConfirmDialogState>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<AllOrdersColumnFilters>({});
  const [sort, setSort] = useState<AllOrdersSort>({ columnId: 'received_at', direction: 'desc' });
  const [customerCodeOptions, setCustomerCodeOptions] = useState<AllOrdersColumnFilterOption[]>([]);
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerRecord | null>(null);
  const [isLedgerCustomerLoading, setIsLedgerCustomerLoading] = useState(false);
  const openWarehouseIntake = (item: WaybillInventoryItem) => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/warehouse/orders/${encodeURIComponent(String(item.id))}/receive?returnTo=${encodeURIComponent(returnTo)}`);
  };
  const inventoryRequestIdRef = useRef(0);
  const loadInventoryRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => undefined);
  const selectedWaybillCacheRef = useRef<Map<string, WaybillInventoryItem>>(new Map());
  const cashVoucherCloseTimerRef = useRef<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalRailRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [showHorizontalRail, setShowHorizontalRail] = useState(false);

  useEffect(() => () => {
    if (cashVoucherCloseTimerRef.current != null) window.clearTimeout(cashVoucherCloseTimerRef.current);
  }, []);

  const user = useMemo(getStoredUser, []);
  const canViewPricing = hasManagerAccess(user?.role_mask ?? 0);
  const canViewPage = isAllOrders
    ? canEditWaybill(user?.role_mask ?? 0) || ((user?.role_mask ?? 0) & ACCOUNTANT) !== 0
    : canViewInventory(user?.role_mask ?? 0);
  const canUpdate = canMutateInventory(user?.role_mask ?? 0);
  const canUpdateCustomerPayment = ((user?.role_mask ?? 0) & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  const selectionEnabled = (!isAllOrders && canUpdate) || (isAllOrders && canUpdateCustomerPayment);
  const canEdit = canEditWaybill(user?.role_mask ?? 0);
  const [visibleColumnIds, setVisibleColumnIds] = useState<InventoryColumnId[]>(() =>
    isAllOrders ? loadAllOrdersVisibleColumnIds() : loadVisibleColumnIds(canViewPricing),
  );
  const hubOptions = useMemo(() => hubs.map(hub => ({ value: String(hub.id), label: formatHub(hub) })), [hubs]);
  const activeFilterCount =
    filters.statuses.length +
    filters.orderStatusGroups.length +
    filters.customerPaymentStatuses.length +
    filters.originHubIds.length +
    filters.destHubIds.length +
    filters.paymentTypes.length +
    filters.priorities.length +
    filters.billingUnits.length +
    Number(Boolean(filters.keyword.trim())) +
    Number(Boolean(filters.receivedFrom || filters.receivedTo)) +
    Number(Boolean(filters.ma_kh.trim())) +
    Number(Boolean(filters.noiDenKeyword.trim()));
  const visibleColumns = useMemo(
    () => resolveVisibleColumnViews(visibleColumnIds, variant, canViewPricing),
    [visibleColumnIds, variant, canViewPricing],
  );
  const displayedWaybills = useMemo(() => {
    const searchResults = isAllOrders ? applyAllOrdersGlobalSearch(waybills, filters.keyword) : waybills;
    const filteredResults = applyAllOrdersColumnFilters(searchResults, columnFilters);
    return isAllOrders ? sortAllOrders(filteredResults, sort) : filteredResults;
  }, [columnFilters, filters.keyword, isAllOrders, sort, waybills]);
  useEffect(() => {
    if (!isAllOrders) return undefined;
    const scrollElement = tableScrollRef.current;
    if (!scrollElement) return undefined;
    const measure = () => {
      setTableScrollWidth(scrollElement.scrollWidth);
      setShowHorizontalRail(scrollElement.scrollWidth > scrollElement.clientWidth + 1);
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(scrollElement);
    const table = scrollElement.querySelector('table');
    if (table) observer.observe(table);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [displayedWaybills.length, isAllOrders, isLoading, visibleColumns]);

  const syncHorizontalRail = (source: 'table' | 'rail') => {
    const table = tableScrollRef.current;
    const rail = horizontalRailRef.current;
    if (!table || !rail) return;
    if (source === 'table' && Math.abs(rail.scrollLeft - table.scrollLeft) > 1) rail.scrollLeft = table.scrollLeft;
    if (source === 'rail' && Math.abs(table.scrollLeft - rail.scrollLeft) > 1) table.scrollLeft = rail.scrollLeft;
  };
  const displayedFilterTotals = useMemo(() => {
    if (!isAllOrders) return filterTotals;
    return {
      orderCount: displayedWaybills.length,
      totalFreight: canViewPricing
        ? displayedWaybills.reduce((sum, waybill) => sum + Number(waybill.freight_amount ?? waybill.cost_amount ?? 0), 0)
        : 0,
    };
  }, [canViewPricing, displayedWaybills, filterTotals, isAllOrders]);
  const columnFilterValues = useMemo<AllOrdersColumnFilters>(
    () => ({ ...columnFilters, ...(filters.ma_kh.trim() ? { ma_kh: filters.ma_kh.trim() } : {}) }),
    [columnFilters, filters.ma_kh],
  );
  const inferredLedgerCustomerCode = useMemo(() => {
    const customerCodes = [...new Set(
      displayedWaybills
        .map(resolveMaKh)
        .map((code) => code.trim())
        .filter((code) => code && code !== '—'),
    )];
    return customerCodes.length === 1 ? customerCodes[0] : '';
  }, [displayedWaybills]);
  const ledgerCustomerCode = resolveCustomerLedgerCode(filters.ma_kh, inferredLedgerCustomerCode);
  const allOrdersColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(visibleColumns.map((column) => [
      column.id,
      column.id === 'ma_kh'
        ? customerCodeOptions
        : buildAllOrdersColumnFilterOptions(waybills, column.id),
    ])) as Partial<Record<InventoryColumnId, AllOrdersColumnFilterOption[]>>;
  }, [customerCodeOptions, visibleColumns, waybills]);
  const activeColumnFilterCount = Object.values(columnFilters).filter(Boolean).length;
  const totalActiveFilterCount = activeFilterCount + activeColumnFilterCount;
  const inventoryLoadKey = useMemo(
    () => JSON.stringify(isAllOrders ? { ...filters, keyword: '' } : filters),
    [filters, isAllOrders],
  );
  const grandTotals = useMemo(
    () => computeGrandTotals(waybills, canViewPricing),
    [waybills, canViewPricing],
  );
  const selectedWaybills = useMemo(
    () => {
      const currentWaybills = new Map(waybills.map((waybill) => [String(waybill.id), waybill]));
      return selectedWaybillIds
        .map((id) => currentWaybills.get(id) || selectedWaybillCacheRef.current.get(id))
        .filter((waybill): waybill is WaybillInventoryItem => Boolean(waybill));
    },
    [waybills, selectedWaybillIds],
  );
  const allRowsSelected = displayedWaybills.length > 0 && displayedWaybills.every((waybill) => selectedWaybillIds.includes(String(waybill.id)));
  const toggleSelectAll = () => {
    const displayedIds = displayedWaybills.map((waybill) => String(waybill.id));
    setSelectedWaybillIds((current) => {
      if (allRowsSelected) {
        displayedIds.forEach((id) => selectedWaybillCacheRef.current.delete(id));
        return current.filter((id) => !displayedIds.includes(id));
      }
      displayedWaybills.forEach((waybill) => selectedWaybillCacheRef.current.set(String(waybill.id), waybill));
      return [...new Set([...current, ...displayedIds])];
    });
  };
  const toggleSelectRow = (waybillId: string | number) => {
    const id = String(waybillId);
    setSelectedWaybillIds((prev) => {
      if (prev.includes(id)) {
        selectedWaybillCacheRef.current.delete(id);
        return prev.filter((item) => item !== id);
      }
      const waybill = waybills.find((item) => String(item.id) === id);
      if (waybill) selectedWaybillCacheRef.current.set(id, waybill);
      return [...prev, id];
    });
  };
  const removeSelectedWaybill = (waybillId: string) => {
    selectedWaybillCacheRef.current.delete(waybillId);
    setSelectedWaybillIds((current) => current.filter((id) => id !== waybillId));
  };
  const clearSelectedWaybills = () => {
    selectedWaybillCacheRef.current.clear();
    setSelectedWaybillIds([]);
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
    setColumnFilters({});
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
  const updateColumnFilter = (columnId: InventoryColumnId, value: string) => {
    if (columnId === 'ma_kh') {
      updateFilters({ ma_kh: value });
      return;
    }
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[columnId] = value;
      else delete next[columnId];
      return next;
    });
  };
  const setFilterArray = (
    key: keyof Pick<InventoryFilters, 'statuses' | 'orderStatusGroups' | 'originHubIds' | 'destHubIds' | 'paymentTypes' | 'priorities' | 'billingUnits'>,
    value: string[],
  ) => updateFilters({ [key]: value } as Partial<InventoryFilters>);

  useEffect(() => { if (canViewPage) void loadHubs(); }, [canViewPage]);
  useEffect(() => {
    if (isAllOrders) return;
    const maKh = searchParams.get('ma_kh')?.trim() || '';
    queueMicrotask(() => {
      setFilters((prev) => (prev.ma_kh === maKh ? prev : { ...prev, ma_kh: maKh, page: 1 }));
    });
  }, [searchParams, isAllOrders]);
  useEffect(() => { if (canViewPage) void loadInventory(); }, [inventoryLoadKey, canViewPage]);

  async function loadHubs() {
    try {
      const response = await apiRequest<HubSummary[] | { data?: HubSummary[]; items?: HubSummary[] }>('/hubs/active');
      setHubs(Array.isArray(response) ? response : response.data || response.items || []);
    } catch {
      setHubs([]);
    }
  }

  async function loadInventory({ silent = false }: { silent?: boolean } = {}) {
    const requestId = inventoryRequestIdRef.current + 1;
    inventoryRequestIdRef.current = requestId;
    const isCurrentRequest = () => inventoryRequestIdRef.current === requestId;
    if (!silent) {
      setIsLoading(true);
      setError('');
    }
    try {
      if (isAllOrders) {
        const items = await loadAllInventoryRows({ ...filters, keyword: '' }, variant);
        if (!isCurrentRequest()) return;
        setWaybills(items);
        const nextCustomerCodes = buildAllOrdersColumnFilterOptions(items, 'ma_kh')
          .filter((option) => option.value !== '—');
        setCustomerCodeOptions((current) => {
          const merged = new Map(current.map((option) => [option.value.toLocaleUpperCase('vi-VN'), option]));
          nextCustomerCodes.forEach((option) => {
            const key = option.value.toLocaleUpperCase('vi-VN');
            const previous = merged.get(key);
            if (!previous || option.count > previous.count) merged.set(key, option);
          });
          return [...merged.values()].sort((left, right) => left.label.localeCompare(right.label, 'vi', { numeric: true, sensitivity: 'base' }));
        });
        setFilterTotals({
          orderCount: items.length,
          totalFreight: canViewPricing
            ? items.reduce((sum, waybill) => sum + Number(waybill.freight_amount ?? waybill.cost_amount ?? 0), 0)
            : 0,
        });
        setError('');
        return;
      }
      const items = await loadAllInventoryRows(filters, variant);
      if (!isCurrentRequest()) return;
      setWaybills(items);
      setFilterTotals({
        orderCount: items.length,
        totalFreight: canViewPricing
          ? items.reduce((sum, waybill) => sum + Number(waybill.freight_amount ?? waybill.cost_amount ?? 0), 0)
          : 0,
      });
      setError('');
    } catch (err) {
      if (!isCurrentRequest()) return;
      if (!silent) {
        setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách tồn kho theo chuyến.');
        setWaybills([]);
        setFilterTotals({ orderCount: 0, totalFreight: 0 });
      }
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }
  }

  loadInventoryRef.current = loadInventory;

  useEffect(() => {
    if (!canViewPage) return undefined;

    const refreshSilently = () => void loadInventoryRef.current({ silent: true });
    const handleStorage = (event: StorageEvent) => {
      if (event.key === WAYBILL_LIST_CHANGED_STORAGE_KEY) refreshSilently();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSilently();
    };

    window.addEventListener(WAYBILL_LIST_CHANGED_EVENT, refreshSilently);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const refreshInterval = window.setInterval(refreshSilently, 30_000);

    return () => {
      window.removeEventListener(WAYBILL_LIST_CHANGED_EVENT, refreshSilently);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(refreshInterval);
    };
  }, [canViewPage]);

  async function updateCustomerPaymentStatus() {
    if (!selectedWaybillIds.length || !canUpdateCustomerPayment) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await apiRequest('/waybills/inventory/customer-payment-status', {
        method: 'PATCH',
        body: {
          waybill_ids: selectedWaybillIds,
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
  const openSplit = () => setIsBoardOpen(true);
  const closeBoard = () => { setIsBoardClosing(true); window.setTimeout(() => { setIsBoardOpen(false); setIsBoardClosing(false); }, 180); };

  const openCashVoucher = (waybill: WaybillInventoryItem) => {
    if (cashVoucherCloseTimerRef.current != null) {
      window.clearTimeout(cashVoucherCloseTimerRef.current);
      cashVoucherCloseTimerRef.current = null;
    }
    setIsCashVoucherClosing(false);
    setCashVoucherWaybill(waybill);
    setIsCashVoucherOpen(true);
  };
  const updateSort = (columnId: InventoryColumnId, direction: AllOrdersSortDirection) => {
    setSort({ columnId, direction });
  };

  const confirmReleaseUnscheduledSplit = (waybill: WaybillInventoryItem) => {
    setReleaseConfirm({
      title: 'Nhả xe đã phân',
      message: `Nhả toàn bộ phân xe chưa tạo chuyến của bill ${displayCode(waybill)}? Đơn sẽ quay lại danh sách Đơn tồn để xếp xe lại.`,
      confirmLabel: 'Nhả xe',
      danger: true,
      onConfirm: async () => {
        setActionError('');
        try {
          await apiRequest(`/waybills/${waybill.id}/splits/unassigned`, { method: 'DELETE' });
          await loadInventory();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không nhả được phân xe của vận đơn.');
        }
      },
    });
  };
  const closeCashVoucher = () => {
    if (cashVoucherCloseTimerRef.current != null) window.clearTimeout(cashVoucherCloseTimerRef.current);
    setIsCashVoucherClosing(true);
    cashVoucherCloseTimerRef.current = window.setTimeout(() => {
      setIsCashVoucherOpen(false);
      setIsCashVoucherClosing(false);
      setCashVoucherWaybill(null);
      cashVoucherCloseTimerRef.current = null;
    }, 180);
  };

  const openEdit = (waybill: WaybillInventoryItem) => {
    setOpenActionMenuId(null);
    setEditWaybill(waybill);
  };

  const handleEditSaved = async () => {
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    const scrollLeft = tableScrollRef.current?.scrollLeft ?? 0;
    setEditWaybill(null);
    await loadInventory();
    window.requestAnimationFrame(() => {
      if (!tableScrollRef.current) return;
      tableScrollRef.current.scrollTop = scrollTop;
      tableScrollRef.current.scrollLeft = scrollLeft;
      syncHorizontalRail('table');
    });
  };

  const saveInlinePaymentNote = async (waybill: WaybillInventoryItem, note: string) => {
    setActionError('');
    try {
      await apiRequest('/waybills/inventory/customer-payment-status', {
        method: 'PATCH',
        body: {
          waybill_ids: [String(waybill.id)],
          status: waybill.customer_payment_status || null,
          note: note.trim() || undefined,
        },
      });
      setWaybills((current) => current.map((item) => (
        String(item.id) === String(waybill.id) ? { ...item, customer_payment_note: note.trim() || null } : item
      )));
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không lưu được ghi chú.');
      throw error;
    }
  };

  const saveInlinePricing = async (
    waybill: WaybillInventoryItem,
    field: 'unit_price' | 'surcharge' | 'transit_fee' | 'total_amount' | 'freight_amount' | 'cod_amount',
    amount: number,
  ) => {
    setActionError('');
    try {
      const updated = await apiRequest<WaybillInventoryItem>(`/waybills/${waybill.id}/pricing`, {
        method: 'PATCH',
        body: { field, amount },
      });
      setWaybills((current) => current.map((item) => (
        String(item.id) === String(waybill.id) ? { ...item, ...updated } : item
      )));
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không lưu được cước vừa nhập.');
      throw error;
    }
  };

  const openCustomerLedger = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || code === '—') return;
    setActionError('');
    setIsLedgerCustomerLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '100', keyword: code });
      const response = await apiRequest<CustomerListResponse | CustomerListItem[]>(`/customers?${params.toString()}`);
      const customers = Array.isArray(response) ? response : response.items || [];
      const customer = customers.find((item) => item.code.trim().toLocaleUpperCase('vi-VN') === code.toLocaleUpperCase('vi-VN'));
      if (!customer) {
        setActionError(`Không tìm thấy mã khách ${code} trong Danh sách khách hàng.`);
        return;
      }
      setLedgerCustomer(customer);
      try {
        const fullCustomer = await apiRequest<CustomerRecord>(`/customers/${customer.id}`);
        setLedgerCustomer({ ...customer, ...fullCustomer });
      } catch {
        setLedgerCustomer(customer);
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Không mở được bảng kê mã khách ${code}.`);
    } finally {
      setIsLedgerCustomerLoading(false);
    }
  };

  function handlePrintStockList() {
    setActionError('');
    if (!displayedWaybills.length) {
      setActionError('Không có đơn tồn kho trên danh sách để in.');
      return;
    }
    const sheets = mapWaybillsToPrintSheets(
      displayedWaybills,
      canViewPricing,
      visibleColumns.map((col) => col.id),
      summarizeFilters(filters),
      Object.fromEntries(visibleColumns.map((col) => [col.id, col.label])),
      {
        currentHubIsHcm: filters.originHubIds.length === 1
          && String(hubs.find((hub) => String(hub.id) === filters.originHubIds[0])?.code || '').toUpperCase() === 'HCM',
      },
    );
    saveInventoryPrintPayload(sheets);
    window.open('/print/inventory-stock', '_blank');
  }

  async function handleDownloadExcel() {
    setActionError('');
    if (!displayedWaybills.length) {
      setActionError(isAllOrders ? 'Không có đơn trên danh sách để tải Excel.' : 'Không có đơn tồn kho trên danh sách để tải Excel.');
      return;
    }
    setIsExporting(true);
    try {
      const loadedRows = await loadAllInventoryRows(isAllOrders ? { ...filters, keyword: '' } : filters, variant);
      const exportRows = isAllOrders
        ? sortAllOrders(
          applyAllOrdersColumnFilters(applyAllOrdersGlobalSearch(loadedRows, filters.keyword), columnFilters),
          sort,
        )
        : loadedRows;
      const exported = downloadInventoryExcel(
        exportRows,
        visibleColumns.map((col) => col.id),
        canViewPricing,
        summarizeFilters(filters),
        isAllOrders ? 'danh-sach-don' : 'danh-sach-ton-kho',
        variant,
      );
      if (!exported) setActionError('Không có dữ liệu để tải Excel.');
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Không thể tải đầy đủ dữ liệu để tạo file Excel.',
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (!canViewPage) {
    return (
      <StateCard
        icon={<ShieldAlert size={24} />}
        title="Không có quyền truy cập"
        description={isAllOrders ? 'Trang danh sách đơn yêu cầu quyền WAREHOUSE trở lên.' : 'Trang danh sách đơn tồn kho yêu cầu quyền DISPATCHER, MANAGER hoặc DIRECTOR.'}
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
        <div className="space-y-2 sm:space-y-3">
          <div className="hidden rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] text-muted-foreground sm:block">
            <span className="font-extrabold text-foreground">Danh sách đơn</span>
            {' — '}
            Hiển thị toàn bộ vận đơn theo ngày và mã bill, có thể lọc theo khoảng ngày bốc hàng.
          </div>
          <div className={clsx('grid gap-2 sm:gap-3', canViewPricing ? 'grid-cols-2' : 'grid-cols-1')}>
            <FilterSummaryCard
              label="Tổng đơn (theo bộ lọc)"
              value={isLoading ? '…' : `${displayedFilterTotals.orderCount.toLocaleString('vi-VN')} đơn`}
              tone="blue"
            />
            {canViewPricing && (
              <FilterSummaryCard
                label="Tổng cước phí (theo bộ lọc)"
                value={isLoading ? '…' : `${displayedFilterTotals.totalFreight.toLocaleString('vi-VN')} đ`}
                tone="emerald"
              />
            )}
          </div>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FilterSummaryCard
            label="Tổng kiện (toàn bộ danh sách)"
            value={isLoading ? '…' : `${grandTotals.package_count.toLocaleString('vi-VN')} kiện`}
            tone="blue"
          />
          <FilterSummaryCard
            label="Tổng cân (toàn bộ danh sách)"
            value={isLoading ? '…' : `${grandTotals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`}
            tone="emerald"
          />
          <FilterSummaryCard
            label="Tổng khối (toàn bộ danh sách)"
            value={isLoading ? '…' : `${grandTotals.volume_m3.toFixed(2)} m³`}
            tone="amber"
          />
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-900">
          <span className="font-bold">Chỉ hiển thị đơn tồn</span>
          {' — '}
          Các dòng đã phân đủ kiện lên xe sẽ không xuất hiện trong danh sách này.
        </div>
        </>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 space-y-2 border-b border-border bg-card p-2 sm:space-y-3 sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.history.back()} aria-label="Quay lại" className={clsx('h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted md:w-auto md:px-3', isAllOrders ? 'hidden md:flex' : 'flex')}><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            {!isAllOrders && (
              <>
                <div className="relative min-w-0 flex-1 md:max-w-[460px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={event => updateFilters({ keyword: event.target.value })} placeholder="Tìm bill, SĐT, tên/mã KH, mã hàng..." aria-label="Tìm toàn bộ dữ liệu vận đơn" className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" /></div>
                <button title="Mở bộ lọc" onClick={openFilterSheet} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"><Filter size={16} />{activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}</button>
                {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">× Xóa {activeFilterCount} bộ lọc</button></div>}
              </>
            )}
            {isAllOrders && (
              <>
                <div className="relative min-w-0 basis-full flex-1 md:basis-auto md:max-w-[390px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filters.keyword}
                    onChange={(event) => updateFilters({ keyword: event.target.value })}
                    placeholder="Tìm bill, SĐT, tên/mã KH, mã hàng..."
                    aria-label="Tìm toàn bộ dữ liệu vận đơn"
                    className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <FilterSelect
                  icon={Hash}
                  placeholder="Lọc mã khách"
                  searchPlaceholder="Tìm theo mã khách..."
                  options={[{ value: '', label: 'Tất cả mã KH' }, ...customerCodeOptions]}
                  value={filters.ma_kh}
                  onValueChange={(value) => updateFilters({ ma_kh: value })}
                  className="min-w-0 flex-1 md:w-[180px] md:flex-none"
                />
                <select
                  value={filters.customerPaymentStatuses[0] || ''}
                  onChange={(event) =>
                    updateFilters({
                      customerPaymentStatuses: event.target.value ? [event.target.value] : [],
                    })
                  }
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 text-[13px] font-medium md:w-[180px] md:flex-none"
                >
                  <option value="">TT thanh toán: Tất cả</option>
                  {customerPaymentStatusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!ledgerCustomerCode || isLedgerCustomerLoading}
                  onClick={() => void openCustomerLedger(ledgerCustomerCode)}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-bold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={ledgerCustomerCode
                    ? `Xem chi tiết và bảng kê công nợ ${ledgerCustomerCode}`
                    : 'Chọn mã khách để mở bảng kê KH'}
                >
                  {isLedgerCustomerLoading ? <Loader2 size={15} className="animate-spin" /> : <ReceiptText size={15} />}
                  <span>Bảng kê KH</span>
                </button>
                <input
                  value={filters.noiDenKeyword}
                  onChange={(event) => updateFilters({ noiDenKeyword: event.target.value })}
                  placeholder="Lọc nơi đến"
                  className="hidden h-10 w-[150px] rounded-lg border border-border px-3 text-[13px] font-medium xl:block"
                />
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
            {isAllOrders && <DateRangePicker value={{ from: filters.receivedFrom, to: filters.receivedTo }} onChange={({ from, to }) => updateFilters({ receivedFrom: from || '', receivedTo: to || '' })} placeholder="Từ ngày - Đến ngày" className="w-full shrink-0 md:w-[18.5rem]" />}
            {isAllOrders && <AllOrdersSortControl columns={visibleColumns} sort={sort} onChange={updateSort} />}
            {isAllOrders && totalActiveFilterCount > 0 && <button onClick={clearFilters} className="h-10 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100">× Xóa {totalActiveFilterCount} bộ lọc</button>}
            {!isAllOrders && activeColumnFilterCount > 0 && <button onClick={() => setColumnFilters({})} className="h-10 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100">× Xóa {activeColumnFilterCount} lọc cột</button>}
            <button
              type="button"
              title="Bảng kê phát hàng — xe & vị trí"
              onClick={openSplit}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-bold text-violet-800 hover:bg-violet-100"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Bảng kê xe</span>
            </button>
            <button
              onClick={() => setIsColumnPickerOpen(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground hover:bg-muted"
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Cột</span>
            </button>
            <button
              type="button"
              title="In danh sách tồn"
              disabled={isLoading || displayedWaybills.length === 0}
              onClick={handlePrintStockList}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">In danh sách tồn</span>
            </button>
            <button
              type="button"
              title="Tải xuống Excel"
              disabled={isLoading || isExporting || displayedWaybills.length === 0}
              onClick={() => void handleDownloadExcel()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 text-[13px] font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              <span className="hidden sm:inline">{isExporting ? 'Đang tạo Excel' : 'Tải Excel'}</span>
            </button>
            <button title="Làm mới" aria-label="Làm mới danh sách tồn" onClick={() => void loadInventory()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted"><RefreshCcw size={16} /></button>
          </div>

          {!isAllOrders && <div className="hidden flex-wrap items-center gap-2 md:flex">
              <FilterSelect multiple icon={Tag} placeholder="Trạng thái" searchPlaceholder="Tìm trạng thái..." options={statusOptions} value={filters.statuses} onValueChange={value => setFilterArray('statuses', value)} className="h-9 min-w-[150px]" />
              <FilterSelect multiple icon={Building2} placeholder="Bưu cục gửi" searchPlaceholder="Tìm bưu cục gửi..." options={hubOptions} value={filters.originHubIds} onValueChange={value => setFilterArray('originHubIds', value)} className="h-9 min-w-[170px]" />
              <FilterSelect multiple icon={Building2} placeholder="HUB đến" searchPlaceholder="Tìm HUB đến..." options={hubOptions} value={filters.destHubIds} onValueChange={value => setFilterArray('destHubIds', value)} className="h-9 min-w-[170px]" />
              <FilterSelect multiple icon={CreditCard} placeholder="Loại thanh toán" searchPlaceholder="Tìm thanh toán..." options={paymentOptions} value={filters.paymentTypes} onValueChange={value => setFilterArray('paymentTypes', value)} className="h-9 min-w-[170px]" />
              <FilterSelect multiple icon={Flag} placeholder="Mức ưu tiên" searchPlaceholder="Tìm ưu tiên..." options={priorityOptions} value={filters.priorities} onValueChange={value => setFilterArray('priorities', value)} className="h-9 min-w-[160px]" />
              <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 text-[13px] font-medium text-muted-foreground">
                <CalendarDays size={14} className="shrink-0" />
                <DayPicker value={filters.receivedFrom} onChange={value => updateFilters({ receivedFrom: value })} placeholder="Từ ngày" className="h-7 min-w-[8.25rem] w-[8.25rem] shrink-0 border-0 bg-transparent pl-0 pr-6 text-[12px] focus:ring-0" />
                <span className="shrink-0">—</span>
                <DayPicker value={filters.receivedTo} onChange={value => updateFilters({ receivedTo: value })} placeholder="Đến ngày" className="h-7 min-w-[8.5rem] w-[8.5rem] shrink-0 border-0 bg-transparent pl-0 pr-6 text-[12px] focus:ring-0" />
              </div>
            </div>}
          {isAllOrders && (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <FilterSelect
                multiple
                icon={Tag}
                placeholder="Trạng thái đơn"
                searchPlaceholder="Tìm trạng thái..."
                options={[...ORDER_STATUS_GROUP_OPTIONS]}
                value={filters.orderStatusGroups}
                onValueChange={(value) => setFilterArray('orderStatusGroups', value)}
                className="h-9 min-w-[170px]"
              />
              <input
                value={filters.noiDenKeyword}
                onChange={(event) => updateFilters({ noiDenKeyword: event.target.value })}
                placeholder="Lọc nơi đến"
                className="h-9 w-[150px] rounded-lg border border-border px-3 text-[13px] font-medium"
              />
              <FilterSelect
                multiple
                icon={CreditCard}
                placeholder="Hình thức TT"
                searchPlaceholder="Tìm thanh toán..."
                options={paymentOptions}
                value={filters.paymentTypes}
                onValueChange={(value) => setFilterArray('paymentTypes', value)}
                className="h-9 min-w-[150px]"
              />
              <FilterSelect
                multiple
                icon={Package}
                placeholder="ĐVT cước"
                searchPlaceholder="Tìm ĐVT cước..."
                options={billingUnitFilterOptions}
                value={filters.billingUnits}
                onValueChange={(value) => setFilterArray('billingUnits', value)}
                className="h-9 min-w-[130px]"
              />
            </div>
          )}
        </div>

        <div ref={tableScrollRef} onScroll={() => syncHorizontalRail('table')} className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {isLoading ? <StateCard compact icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải dữ liệu" description={isAllOrders ? 'Hệ thống đang lấy danh sách đơn từ API.' : 'Hệ thống đang lấy danh sách vận đơn tồn kho từ API.'} /> : displayedWaybills.length === 0 ? <StateCard compact icon={<Package size={24} />} title={isAllOrders ? 'Không có đơn phù hợp' : 'Chưa có đơn cần chia'} description={isAllOrders ? 'Thử bỏ bớt bộ lọc tìm kiếm hoặc bộ lọc tại tiêu đề cột.' : 'Tất cả đơn tồn kho đã phân hết kiện lên xe, hoặc thử đổi bộ lọc.'} /> : (
            <>
              <table
                className={clsx('hidden md:table border-collapse', isAllOrders ? 'table-fixed text-[12px]' : 'w-full min-w-[1280px] text-left')}
                style={isAllOrders ? {
                  width: visibleColumns.reduce((sum, column) => sum + (ALL_ORDERS_COLUMN_WIDTHS[column.id] || 120), 0),
                  minWidth: '100%',
                } : undefined}
              >
                {isAllOrders && (
                  <colgroup>
                    {visibleColumns.map((column) => (
                      <col key={column.id} style={{ width: ALL_ORDERS_COLUMN_WIDTHS[column.id] || 120 }} />
                    ))}
                  </colgroup>
                )}
                <thead className="text-[11px] uppercase tracking-wider text-slate-600">
                  <AllOrdersTableHeader
                    columns={visibleColumns}
                    selectionEnabled={!isAllOrders && selectionEnabled}
                    allRowsSelected={allRowsSelected}
                    onToggleSelectAll={toggleSelectAll}
                    filterOptions={allOrdersColumnFilterOptions}
                    filterValues={columnFilterValues}
                    onFilterChange={updateColumnFilter}
                    sort={isAllOrders ? sort : undefined}
                    onSortChange={isAllOrders ? updateSort : undefined}
                    grouped={isAllOrders}
                  />
                </thead>
                <tbody>
                  {displayedWaybills.map((waybill, rowIndex) => (
                    <InventoryRow
                      key={`${waybill.id}-${waybill.split_id ?? 'base'}`}
                      waybill={waybill}
                      hubs={hubs}
                      columns={visibleColumns}
                      rowIndex={rowIndex + 1}
                      isAllOrders={isAllOrders}
                      canViewPricing={canViewPricing}
                      canUpdate={canUpdate}
                      canEdit={canEdit}
                      canPay={canUpdateCustomerPayment}
                      showSelection={selectionEnabled && !isAllOrders}
                      selected={selectedWaybillIds.includes(String(waybill.id))}
                      onToggleSelect={toggleSelectRow}
                      openActionMenuId={openActionMenuId}
                      onToggleActionMenu={toggleActionMenu}
                      onCloseActionMenu={() => setOpenActionMenuId(null)}
                      onDetail={openDetail}
                      onEdit={openEdit}
                      onReceive={openWarehouseIntake}
                      onCashVoucher={openCashVoucher}
                      onReleaseUnscheduledSplit={confirmReleaseUnscheduledSplit}
                      onCustomerLedger={openCustomerLedger}
                      onPricingSave={saveInlinePricing}
                      onPaymentNoteSave={saveInlinePaymentNote}
                      onOpenTripManifest={(trip) => {
                        if (trip.manifest_id) navigate(`/warehouse/manifests?openManifestId=${trip.manifest_id}&openExpense=1`);
                        else if (trip.trip_id) navigate(`/trips/${trip.trip_id}`);
                      }}
                    />
                  ))}
                </tbody>
                {!isAllOrders && (
                <tfoot className="bg-slate-50 text-[12px] font-extrabold text-foreground">
                  <tr>
                    {selectionEnabled && <td className="border-t border-border px-2 py-2.5 border-r" />}
                    {visibleColumns.map((col) => (
                      <td key={col.id} className="border-t border-border px-4 py-2.5 border-r last:border-r-0">
                        {col.id === 'customer_name' ? 'Tổng cộng' : ''}
                        {col.id === 'package_count' ? grandTotals.package_count : ''}
                        {col.id === 'weight' ? `${grandTotals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : ''}
                        {col.id === 'volumetric_weight' ? `${grandTotals.volumetric_weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg` : ''}
                        {col.id === 'volume' ? `${grandTotals.volume_m3.toFixed(2)} CBM` : ''}
                        {col.id === 'total_amount' && canViewPricing ? formatMoney(grandTotals.total_amount) : ''}
                        {col.id === 'freight' && canViewPricing ? formatMoney(grandTotals.freight) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
                )}
              </table>
              {isAllOrders ? (
                <AllOrdersCompactTable
                  waybills={displayedWaybills}
                  canViewPricing={canViewPricing}
                  canEdit={canEdit}
                  canPay={canUpdateCustomerPayment}
                  canRelease={canUpdate}
                  onDetail={openDetail}
                  onEdit={openEdit}
                  onWarehouseIntake={openWarehouseIntake}
                  onPayment={openCashVoucher}
                  onRelease={confirmReleaseUnscheduledSplit}
                  onCustomerLedger={openCustomerLedger}
                />
              ) : (
                <div className="grid gap-3 p-3 md:hidden">{displayedWaybills.map(waybill => <InventoryCard key={`${waybill.id}-${waybill.split_id ?? 'base'}`} waybill={waybill} hubs={hubs} isAllOrders={isAllOrders} canUpdate={canUpdate} canEdit={canEdit} openActionMenuId={openActionMenuId} onToggleActionMenu={toggleActionMenu} onCloseActionMenu={() => setOpenActionMenuId(null)} onDetail={openDetail} onEdit={openEdit} onReceive={openWarehouseIntake} onCashVoucher={openCashVoucher} onReleaseUnscheduledSplit={confirmReleaseUnscheduledSplit} onCustomerLedger={openCustomerLedger} />)}</div>
              )}
            </>
          )}
        </div>

        {isAllOrders && showHorizontalRail && (
          <div
            ref={horizontalRailRef}
            onScroll={() => syncHorizontalRail('rail')}
            className="fixed bottom-2 left-[96px] right-6 z-40 hidden h-4 overflow-x-auto overflow-y-hidden rounded border border-slate-300 bg-slate-100 shadow-md custom-scrollbar md:block"
            aria-label="Cuộn ngang danh sách đơn"
          >
            <div style={{ width: tableScrollWidth, height: 1 }} />
          </div>
        )}

        <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
          <p className="w-full text-center text-[12px] font-bold text-muted-foreground">
            Hiển thị toàn bộ {displayedWaybills.length} {isAllOrders ? 'đơn' : 'đơn tồn'}
            {isAllOrders && displayedWaybills.length !== waybills.length ? ` / ${waybills.length} đơn trước lọc cột` : ''}
          </p>
        </div>
      </div>

      {!isAllOrders && <FilterBottomSheet isOpen={isFilterOpen} draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} groupSearch={groupSearch} setGroupSearch={setGroupSearch} hubOptions={hubOptions} onClose={() => setIsFilterOpen(false)} onApply={applyFilters} />}
      <WaybillInventoryDetailDialog isOpen={isDetailOpen} isClosing={isDetailClosing} isLoading={isDetailLoading} canViewPricing={canViewPricing} waybill={detailWaybill} statusConfig={statusConfig} paymentConfig={paymentConfig} priorityConfig={priorityConfig} onClose={closeDetail} />
      <WaybillEditDialog
        waybill={editWaybill}
        onClose={() => setEditWaybill(null)}
        onSaved={handleEditSaved}
      />
      <SplitOrderDialog isOpen={isBoardOpen} isClosing={isBoardClosing} waybill={null} onClose={closeBoard} />
      <ConfirmDialog dialog={releaseConfirm} onClose={() => setReleaseConfirm(null)} />
      <InventoryColumnPicker
        isOpen={isColumnPickerOpen}
        visibleIds={visibleColumnIds}
        canViewPricing={canViewPricing}
        mode={isAllOrders ? 'all-orders' : 'inventory'}
        onChange={(ids) => {
          const normalizedIds = isAllOrders
            ? normalizeAllOrdersVisibleColumnIds(ids)
            : normalizeInventoryVisibleColumnIds(ids, canViewPricing);
          setVisibleColumnIds(normalizedIds);
          if (isAllOrders) saveAllOrdersVisibleColumnIds(normalizedIds);
          else saveVisibleColumnIds(normalizedIds);
        }}
        onClose={() => setIsColumnPickerOpen(false)}
      />
      <CustomerDetailDialog
        customer={ledgerCustomer}
        loading={isLedgerCustomerLoading}
        initialTab="thanh-toan"
        onClose={() => setLedgerCustomer(null)}
      />
      <WaybillCashVoucherDialog
        key={cashVoucherWaybill ? String(cashVoucherWaybill.id) : 'cash-voucher'}
        isOpen={isCashVoucherOpen}
        isClosing={isCashVoucherClosing}
        waybill={cashVoucherWaybill}
        onClose={closeCashVoucher}
        onSaved={() => loadInventory()}
      />
      <StackOntoTruckDialog
        isOpen={isStackOpen}
        isClosing={isStackClosing}
        waybills={selectedWaybills}
        onClose={closeStackDialog}
        onAddMore={closeStackDialog}
        onRemoveWaybill={removeSelectedWaybill}
        onSaved={(result) => {
          clearSelectedWaybills();
          if ((result?.manifests?.length ?? 0) > 1) {
            navigate('/warehouse/manifests');
            return;
          }
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
  hubs,
  columns,
  rowIndex,
  isAllOrders,
  canViewPricing,
  canUpdate,
  canEdit,
  canPay = false,
  openActionMenuId,
  onToggleActionMenu,
  onCloseActionMenu,
  showSelection,
  selected,
  onToggleSelect,
  onDetail,
  onEdit,
  onReceive,
  onCashVoucher,
  onReleaseUnscheduledSplit,
  onCustomerLedger,
  onPricingSave,
  onPaymentNoteSave,
  onOpenTripManifest,
}: InventoryItemProps & {
  hubs: HubSummary[];
  columns: InventoryColumnView[];
  rowIndex?: number;
  isAllOrders?: boolean;
  canViewPricing: boolean;
  onPricingSave: (
    waybill: WaybillInventoryItem,
    field: 'unit_price' | 'surcharge' | 'transit_fee' | 'total_amount' | 'freight_amount' | 'cod_amount',
    amount: number,
  ) => Promise<void>;
  onPaymentNoteSave?: (waybill: WaybillInventoryItem, note: string) => Promise<void>;
  showSelection?: boolean;
  selected?: boolean;
  onToggleSelect?: (waybillId: string | number) => void;
  canPay?: boolean;
  onOpenTripManifest?: (trip: NonNullable<WaybillInventoryItem['trip_history']>[number]) => void;
}) {
  const cellClass = clsx(
    'border-r border-border max-w-[200px] truncate',
    isAllOrders ? 'px-2 py-2 text-[12px]' : 'px-4 py-3 text-[13px]',
  );
  const displayedPackages = Number(waybill.remaining_packages ?? waybill.trip_package_count ?? waybill.package_count ?? 0);
  const orderPackages = Number(waybill.order_total_packages ?? waybill.package_count ?? displayedPackages);
  const isPartialLine = displayedPackages > 0 && orderPackages > 0 && displayedPackages < orderPackages;
  const orderedColumnIds = columns.map((column) => column.id);
  const activeStickyColumnIds = isAllOrders ? getAllOrdersActiveStickyColumnIds(orderedColumnIds) : [];

  const renderCell = (colId: InventoryColumnId) => {
    const stickyAllOrdersCellProps = isAllOrders && activeStickyColumnIds.includes(colId)
      ? {
          style: { left: getAllOrdersStickyLeft(colId, orderedColumnIds) },
          className: clsx(
            cellClass,
            'sticky z-[5]',
            getStorageAgeRowClass(waybill).includes('red')
              ? 'bg-red-50 group-hover:bg-red-100'
              : getStorageAgeRowClass(waybill).includes('amber')
                ? 'bg-amber-50 group-hover:bg-amber-100'
                : 'bg-white group-hover:bg-sky-50',
            colId === activeStickyColumnIds.at(-1) && 'shadow-[5px_0_8px_rgba(15,23,42,0.10)]',
          ),
        }
      : { className: cellClass };
    switch (colId) {
      case 'stt':
        return <td style={isAllOrders ? { left: 0 } : undefined} className={clsx(cellClass, 'text-center font-bold text-muted-foreground', isAllOrders && 'sticky z-[5]', isAllOrders && (getStorageAgeRowClass(waybill).includes('red') ? 'bg-red-50 group-hover:bg-red-100' : getStorageAgeRowClass(waybill).includes('amber') ? 'bg-amber-50 group-hover:bg-amber-100' : 'bg-white group-hover:bg-sky-50'))}>{rowIndex ?? '—'}</td>;
      case 'cong_sg':
        return <td {...stickyAllOrdersCellProps}>{resolveCongSg(waybill)}</td>;
      case 'stack_position':
        return (
          <td className={`${cellClass} min-w-[72px] text-muted-foreground`}>
            {waybill.loading_position ? String(waybill.loading_position) : '—'}
          </td>
        );
      case 'order_code':
        return <td className={`${cellClass} font-bold text-violet-800`}>{waybill.order_code || '—'}</td>;
      case 'waybill_code':
        return (
          <td {...stickyAllOrdersCellProps} className={clsx(stickyAllOrdersCellProps.className, isAllOrders ? 'font-bold' : 'font-extrabold text-primary')}>
            {isAllOrders ? (
              <button
                type="button"
                onClick={() => onDetail(waybill)}
                className="font-extrabold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20"
                title={`Xem chi tiết ${displayCode(waybill)}`}
              >
                {displayCode(waybill)}
              </button>
            ) : (
              displayCode(waybill)
            )}
          </td>
        );
      case 'customer_name':
        return (
          <td
            style={stickyAllOrdersCellProps.style}
            className={clsx(
              'border-r border-border font-semibold',
              stickyAllOrdersCellProps.className,
              isAllOrders
                ? 'truncate whitespace-nowrap'
                : clsx(cellClass),
            )}
            title={resolveCustomerName(waybill)}
          >
            {resolveCustomerName(waybill)}
          </td>
        );
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
        if (isAllOrders && waybill.trip_history?.length) {
          return (
            <td className={clsx(cellClass, 'whitespace-normal align-top')}>
              <div className="space-y-1.5">
                {waybill.trip_history.map((trip, index) => {
                  const normalizedStatus = String(trip.status || '').toUpperCase();
                  const hasTripTarget = Boolean(trip.manifest_id || trip.trip_id);
                  return (
                    <button
                      type="button"
                      key={`${trip.split_id ?? trip.trip_id ?? index}`}
                      disabled={!hasTripTarget}
                      onClick={() => hasTripTarget && onOpenTripManifest?.(trip)}
                      className={clsx(
                        'block w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[11px] leading-4 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20',
                        hasTripTarget ? 'hover:border-primary/40 hover:bg-blue-50' : 'cursor-default',
                      )}
                      title={trip.manifest_id ? 'Mở bảng kê của chuyến' : trip.trip_id ? 'Mở chi tiết chuyến' : 'Phân xe rời — dùng nút Nhả xe tại cột Thao tác'}
                    >
                      <p className="font-bold text-slate-800">
                        {Number(trip.package_count || 0).toLocaleString('vi-VN')} kiện
                        {trip.trip_id ? ` · Chuyến #${trip.trip_id}` : ''}
                        {trip.license_plate ? ` · BKS ${trip.license_plate}` : ''}
                        {trip.departure_time ? ` · ${formatInventoryDate(trip.departure_time, { short: true })}` : ''}
                      </p>
                      <span className={clsx(
                        'mt-0.5 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold',
                        normalizedStatus === 'IN_TRANSIT' && 'border-blue-200 bg-blue-50 text-blue-700',
                        normalizedStatus === 'ARRIVED' && 'border-violet-200 bg-violet-50 text-violet-700',
                        normalizedStatus === 'COMPLETED' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        normalizedStatus === 'CANCELLED' && 'border-red-200 bg-red-50 text-red-700',
                        (!normalizedStatus || normalizedStatus === 'PLANNED') && 'border-amber-200 bg-amber-50 text-amber-700',
                      )}>
                        {resolveInventoryTripStatusLabel(trip)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </td>
          );
        }
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
      case 'barcode': {
        const code = displayCode(waybill);
        const barcodeUrl = buildDispatchBarcodeUrl(code);
        return (
          <td className={`${cellClass} min-w-[180px] text-center`}>
            {barcodeUrl ? <img src={barcodeUrl} alt={`Mã vạch ${code}`} className="mx-auto h-9 w-40 object-fill" /> : '—'}
          </td>
        );
      }
      case 'delivery_staff':
        return (
          <td className={clsx(cellClass, 'font-semibold')} title={resolveDeliveryStaff(waybill)}>
            {resolveDeliveryStaff(waybill)}
          </td>
        );
      case 'loaded_at':
        return (
          <td className={clsx(cellClass, getStorageAgeRowClass(waybill).includes('red') ? 'font-bold text-red-700' : getStorageAgeRowClass(waybill).includes('amber') ? 'font-bold text-amber-800' : 'text-muted-foreground')}>
            {formatDate(resolveLoadedAt(waybill))}
          </td>
        );
      case 'received_at':
        return (
          <td {...stickyAllOrdersCellProps} className={clsx(stickyAllOrdersCellProps.className, 'text-muted-foreground')}>
            {formatDate(isAllOrders ? waybill.sent_date : (waybill.received_at || waybill.created_at))}
          </td>
        );
      case 'receiver_phone':
        return <td className={clsx(cellClass, 'font-bold text-primary')}>{resolveReceiverPhone(waybill)}</td>;
      case 'noi_den':
        return <td className={clsx(cellClass, 'font-semibold')}>{resolveNoiDen(waybill)}</td>;
      case 'receiver_address':
        return (
          <td className={clsx(cellClass, !isAllOrders && 'whitespace-normal align-top')} title={resolveReceiverAddress(waybill)}>
            <span className={clsx('block', !isAllOrders && 'line-clamp-2 max-w-[220px]')}>{resolveReceiverAddress(waybill)}</span>
          </td>
        );
      case 'bill_images': {
        return <BillImagesCell waybill={waybill} cellClass={cellClass} />;
      }
      case 'receiver_district':
        return <td className={clsx(cellClass, 'font-semibold')}>{resolveReceiverDistrict(waybill) || '—'}</td>;
      case 'receiver_ward':
        return <td className={cellClass}>{resolveReceiverWard(waybill) || '—'}</td>;
      case 'order_status': {
        const badge = resolveOrderStatusBadge(waybill);
        return (
          <td className={cellClass}>
            <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', badge.className)}>
              {badge.label}
            </span>
          </td>
        );
      }
      case 'delivery_processing': {
        const processing = resolveDeliveryProcessingPresentation(waybill);
        const toneClass = {
          slate: 'border-slate-200 bg-slate-50 text-slate-700',
          blue: 'border-blue-200 bg-blue-50 text-blue-700',
          violet: 'border-violet-200 bg-violet-50 text-violet-700',
          amber: 'border-amber-200 bg-amber-50 text-amber-800',
          emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          red: 'border-red-200 bg-red-50 text-red-700',
        }[processing.tone];
        return (
          <td className="border-r border-border px-2 py-2 align-top text-[12px]">
            <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold', toneClass)}>
              {processing.title}
            </span>
            {processing.detail && <p className="mt-1 whitespace-normal text-[11px] font-semibold text-slate-700">{processing.detail}</p>}
            {processing.note && <p className="mt-1 whitespace-normal text-[11px] text-muted-foreground">Ghi chú: {processing.note}</p>}
          </td>
        );
      }
      case 'billing_unit':
        return <td className={cellClass}>{resolveBillingUnit(waybill)}</td>;
      case 'billing_qty_detail':
        return (
          <td className={clsx(cellClass, 'text-right font-medium', !isAllOrders && 'whitespace-normal')} title={resolveBillingQtyDetail(waybill)}>
            {resolveBillingQtyDetail(waybill)}
          </td>
        );
      case 'unit_price':
        return (
          <td className={`${cellClass} font-bold text-right tabular-nums`}>
            <InlineMoneyInput
              value={resolveUnitPrice(waybill)}
              editable={Boolean(isAllOrders && canViewPricing && canEdit)}
              label={`Đơn giá bill ${displayCode(waybill)}`}
              onSave={(amount) => onPricingSave(waybill, 'unit_price', amount)}
            />
          </td>
        );
      case 'transit_fee':
        return (
          <td className={`${cellClass} font-bold text-right tabular-nums`}>
            <InlineMoneyInput
              value={resolveTransitFee(waybill)}
              editable={Boolean(isAllOrders && canViewPricing && canEdit)}
              label={`Phí trung chuyển bill ${displayCode(waybill)}`}
              onSave={(amount) => onPricingSave(waybill, 'transit_fee', amount)}
            />
          </td>
        );
      case 'surcharge':
        return (
          <td className={clsx(cellClass, 'font-bold text-right tabular-nums', isAllOrders && 'bg-orange-50/70 text-orange-900')}>
            {canViewPricing ? (
              <InlineMoneyInput
                value={resolveSurcharge(waybill)}
                editable={Boolean(isAllOrders && canEdit)}
                label={`Dịch vụ cộng thêm bill ${displayCode(waybill)}`}
                toneClassName="text-orange-900"
                onSave={(amount) => onPricingSave(waybill, 'surcharge', amount)}
              />
            ) : '—'}
          </td>
        );
      case 'total_amount': {
        const totalAmount = resolveTotalAmount(waybill);
        return (
          <td className={clsx(cellClass, 'font-bold text-right tabular-nums', isAllOrders && 'bg-emerald-50/80 text-emerald-800')}>
            {canViewPricing ? (
              <InlineMoneyInput
                value={totalAmount}
                editable={Boolean(isAllOrders && canEdit)}
                label={`Thành tiền bill ${displayCode(waybill)}`}
                toneClassName="text-emerald-800"
                onSave={(amount) => onPricingSave(waybill, 'total_amount', amount)}
              />
            ) : '—'}
          </td>
        );
      }
      case 'thu_ho_khach':
        return (
          <td className={`${cellClass} font-bold text-right tabular-nums`}>
            <InlineMoneyInput
              value={waybill.cod_amount}
              editable={Boolean(isAllOrders && canViewPricing && canEdit)}
              label={`Thu hộ khách bill ${displayCode(waybill)}`}
              onSave={(amount) => onPricingSave(waybill, 'cod_amount', amount)}
            />
          </td>
        );
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
        return (
          <td className={clsx(cellClass, isAllOrders && 'max-w-[200px]', 'p-0 align-top')}>
            <InlineTextInput
              value={waybill.customer_payment_note || ''}
              editable={Boolean(isAllOrders && (canEdit || canPay))}
              placeholder="Thêm ghi chú..."
              onSave={(note) => (onPaymentNoteSave ? onPaymentNoteSave(waybill, note) : Promise.resolve())}
            />
          </td>
        );
      case 'user_note':
        return <td className={cellClass}>{resolveUserNote(waybill) || '—'}</td>;
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
        return (
          <td {...stickyAllOrdersCellProps} onClick={(event) => event.stopPropagation()}>
            {isAllOrders && resolveMaKh(waybill) !== '—' ? (
              <button
                type="button"
                onClick={() => void onCustomerLedger(resolveMaKh(waybill))}
                className="font-extrabold text-violet-700 hover:underline"
                title={`Xem chi tiết và bảng kê công nợ ${resolveMaKh(waybill)}`}
              >
                {resolveMaKh(waybill)}
              </button>
            ) : resolveMaKh(waybill)}
          </td>
        );
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
        return <td className={clsx(cellClass, isPartialLine ? 'bg-amber-50 font-black text-slate-950' : 'font-medium')}>{displayValue(resolveWeightKg(waybill) || null, ' kg')}</td>;
      case 'volumetric_weight':
        return <td className={clsx(cellClass, isPartialLine ? 'bg-amber-50 font-black text-slate-950' : 'font-medium')}>{displayValue(waybill.volumetric_weight || null, ' kg')}</td>;
      case 'volume':
        return <td className={clsx(cellClass, isPartialLine ? 'bg-amber-50 font-black text-slate-950' : 'font-medium')}>{resolveVolumeM3(waybill) ? `${resolveVolumeM3(waybill).toFixed(2)} CBM` : '—'}</td>;
      case 'freight':
        return (
          <td className={`${cellClass} font-bold text-right tabular-nums`}>
            {canViewPricing ? (
              <InlineMoneyInput
                value={isAllOrders ? resolveFreight(waybill) : waybill.allocated_freight ?? resolveFreight(waybill)}
                editable={Boolean(isAllOrders && canEdit)}
                label={`Cước phí bill ${displayCode(waybill)}`}
                onSave={(amount) => onPricingSave(waybill, 'freight_amount', amount)}
              />
            ) : '—'}
          </td>
        );
      case 'sender_info':
        return <td className={`${cellClass} font-medium`}>{waybill.sender_info || '—'}</td>;
      case 'receiver_info':
        return <td className={`${cellClass} font-medium`}>{waybill.receiver_info || '—'}</td>;
      case 'current_hub':
        return <td className={`${cellClass} text-muted-foreground`}>{formatHub(waybill.current_hub || hubs.find((hub) => String(hub.id) === String(waybill.current_hub_id)) || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)}</td>;
      case 'dest_hub':
        return <td className={`${cellClass} text-muted-foreground`}>{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</td>;
      case 'payment_type':
        return <td className="px-4 py-3 border-r border-border"><Badge config={paymentConfig[String(waybill.payment_type || '')]} fallback={waybill.payment_type || '—'} /></td>;
      case 'cod_amount':
        return <td className={`${cellClass} font-bold text-right tabular-nums`}>{formatMoney(waybill.allocated_cod ?? waybill.cod_amount)}</td>;
      case 'cod_collection_status': {
        const collectStatus = String(waybill.cod_collection_status || 'NOT_APPLICABLE');
        const collected = collectStatus === 'COLLECTED';
        const pending = collectStatus === 'PENDING';
        return (
          <td className={cellClass}>
            <span className={clsx(
              'inline-flex rounded-full px-2 py-1 text-[11px] font-bold',
              collected && 'bg-emerald-50 text-emerald-700',
              pending && 'bg-amber-50 text-amber-700',
              !collected && !pending && 'bg-slate-100 text-slate-500',
            )}>
              {collected ? 'Đã thu COD' : pending ? 'Chờ thu COD' : 'Không thu'}
            </span>
          </td>
        );
      }
      case 'warehouse_intake': {
        const intake = resolveWarehouseIntakePresentation(waybill);
        const toneClass = intake.tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : intake.tone === 'blue'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-slate-50 text-slate-600';
        return (
          <td className="border-r border-border px-2 py-2 align-top text-[12px]" onClick={(event) => event.stopPropagation()}>
            <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold', toneClass)}>{intake.title}</span>
            {intake.detail && <p className="mt-1 whitespace-normal text-[11px] font-semibold text-slate-700">{intake.detail}</p>}
            {intake.note && <p className="mt-1 whitespace-normal text-[11px] text-muted-foreground">Ghi chú: {intake.note}</p>}
            {intake.canConfirm && canEdit && (
              <button type="button" onClick={() => onReceive(waybill)} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:brightness-105">
                <PackageCheck size={13} /> Đã nhập kho
              </button>
            )}
            {!intake.canConfirm && canEdit && normalizeStatus(waybill) !== 'CANCELLED' && (
              <button type="button" title="Sửa thông tin nhập kho" onClick={() => onReceive(waybill)} className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                <Pencil size={13} /> Sửa
              </button>
            )}
          </td>
        );
      }
      case 'priority':
        return (
          <td className="overflow-visible px-4 py-3 border-r border-border">
            <WaybillPriorityControl waybillId={waybill.id} value={waybill.priority} disabled={!canUpdate} />
          </td>
        );
      case 'actions':
        return (
          <td
            className={clsx(
              isAllOrders
                ? 'sticky right-0 z-10 border-l border-border px-2 py-2 shadow-[-4px_0_8px_rgba(15,23,42,0.06)]'
                : 'px-4 py-3',
              isAllOrders && (getStorageAgeRowClass(waybill).includes('red')
                ? 'bg-red-50 group-hover:bg-red-100'
                : getStorageAgeRowClass(waybill).includes('amber')
                  ? 'bg-amber-50 group-hover:bg-amber-100'
                  : 'bg-white group-hover:bg-sky-50'),
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {isAllOrders ? (
              <AllOrdersActions
                waybill={waybill}
                canEdit={canEdit}
                canPay={canPay}
                canRelease={canUpdate}
                onDetail={onDetail}
                onEdit={onEdit}
                onPayment={onCashVoucher}
                onRelease={onReleaseUnscheduledSplit}
              />
            ) : (
              <Actions
                waybill={waybill}
                canEdit={canEdit}
                isMutable={isMutableWaybill(waybill)}
                isOpen={openActionMenuId === actionMenuId(waybill, 'table')}
                onToggle={() => onToggleActionMenu(actionMenuId(waybill, 'table'))}
                onClose={onCloseActionMenu}
                onDetail={onDetail}
                onEdit={onEdit}
                onReceive={onReceive}
                onCashVoucher={onCashVoucher}
              />
            )}
          </td>
        );
      default:
        return <td className={cellClass}>—</td>;
    }
  };

  return (
    <tr
      className={clsx(
        'group border-b border-border align-top transition-colors',
        getStorageAgeRowClass(waybill),
        selected && 'bg-amber-50/60',
        isAllOrders && 'hover:bg-sky-50/50',
      )}
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
      {columns.map((col) => <Fragment key={col.id}>{renderCell(col.id)}</Fragment>)}
    </tr>
  );
}

function AllOrdersActions({
  waybill,
  canEdit,
  canPay,
  canRelease,
  onDetail,
  onEdit,
  onWarehouseIntake,
  onPayment,
  onRelease,
}: {
  waybill: WaybillInventoryItem;
  canEdit: boolean;
  canPay: boolean;
  canRelease: boolean;
  onDetail: (waybill: WaybillInventoryItem) => void;
  onEdit: (waybill: WaybillInventoryItem) => void;
  onWarehouseIntake?: (waybill: WaybillInventoryItem) => void;
  onPayment: (waybill: WaybillInventoryItem) => void;
  onRelease: (waybill: WaybillInventoryItem) => void;
}) {
  const hasUnscheduledSplit = Boolean(waybill.trip_history?.some(
    (trip) => trip.split_id && !trip.trip_id && !trip.manifest_id,
  ));

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <button
        type="button"
        title="Xem đơn"
        onClick={(event) => {
          event.stopPropagation();
          onDetail(waybill);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground hover:bg-muted"
      >
        <Eye size={14} />
      </button>
      <button
        type="button"
        title={!canEdit ? 'Cần quyền WAREHOUSE trở lên' : 'Sửa đơn'}
        disabled={!canEdit}
        onClick={(event) => {
          event.stopPropagation();
          if (!canEdit) return;
          onEdit(waybill);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-primary hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Pencil size={14} />
      </button>
      {onWarehouseIntake && normalizeStatus(waybill) !== 'CANCELLED' && (
        <button
          type="button"
          title={normalizeStatus(waybill) === 'RECEIVED' ? 'Xác nhận đã nhập kho' : 'Sửa thông tin nhập kho'}
          disabled={!canEdit}
          onClick={(event) => {
            event.stopPropagation();
            if (!canEdit) return;
            onWarehouseIntake?.(waybill);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PackageCheck size={14} />
        </button>
      )}
      <button
        type="button"
        title={canPay ? 'Thanh toán bill' : 'Cần quyền Kế toán hoặc Quản lý'}
        disabled={!canPay}
        onClick={(event) => {
          event.stopPropagation();
          if (!canPay) return;
          onPayment(waybill);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <HandCoins size={14} />
      </button>
      {hasUnscheduledSplit && (
        <button
          type="button"
          title={canRelease ? 'Nhả phân xe rời để đơn quay lại Đơn tồn' : 'Cần quyền kho hoặc điều phối'}
          disabled={!canRelease}
          onClick={(event) => {
            event.stopPropagation();
            if (!canRelease) return;
            onRelease(waybill);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Unlink size={14} />
        </button>
      )}
    </div>
  );
}

function BillImagesCell({ waybill, cellClass }: { waybill: WaybillInventoryItem; cellClass: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const images = parseWaybillImages(waybill.delivery_photo_url);

  return (
    <td className={clsx(cellClass, 'min-w-[92px]')} onClick={(event) => event.stopPropagation()}>
      {images.length ? (
        <div className="flex items-center gap-1" title={`${images.length} hình ảnh bill / hàng hóa`}>
          {images.slice(0, 3).map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setPreviewUrl(url)}
              className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label={`Xem hình ảnh ${index + 1} của ${displayCode(waybill)}`}
            >
              <img
                src={url}
                alt={`Hình ảnh ${index + 1}`}
                className="h-8 w-8 rounded-md border border-slate-200 object-cover transition-transform hover:scale-105"
              />
            </button>
          ))}
          {images.length > 3 && (
            <button
              type="button"
              onClick={() => setPreviewUrl(images[3])}
              className="text-[11px] font-black text-primary hover:underline"
              aria-label={`Xem hình ảnh 4 của ${displayCode(waybill)}`}
            >
              +{images.length - 3}
            </button>
          )}
        </div>
      ) : '—'}
      <ImagePreviewModal
        imageUrl={previewUrl}
        title={`Hình ảnh bill / hàng hóa ${displayCode(waybill)}`}
        onClose={() => setPreviewUrl(null)}
      />
    </td>
  );
}

function AllOrdersCompactTable({
  waybills,
  canViewPricing,
  canEdit,
  canPay,
  canRelease,
  onDetail,
  onEdit,
  onWarehouseIntake,
  onPayment,
  onRelease,
  onCustomerLedger,
}: {
  waybills: WaybillInventoryItem[];
  canViewPricing: boolean;
  canEdit: boolean;
  canPay: boolean;
  canRelease: boolean;
  onDetail: (waybill: WaybillInventoryItem) => void;
  onEdit: (waybill: WaybillInventoryItem) => void;
  onWarehouseIntake: (waybill: WaybillInventoryItem) => void;
  onPayment: (waybill: WaybillInventoryItem) => void;
  onRelease: (waybill: WaybillInventoryItem) => void;
  onCustomerLedger: (code: string) => void;
}) {
  const headerClass = 'sticky top-0 z-10 border-b border-r border-slate-300 bg-slate-100 px-1.5 py-1.5 text-[9px] font-extrabold uppercase text-slate-600 whitespace-nowrap';
  const cellClass = 'border-b border-r border-slate-200 px-1.5 py-1.5 text-[10px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis';

  return (
    <div className="md:hidden min-w-0 overflow-x-auto bg-white">
      <table className="w-[1036px] table-fixed border-collapse text-left">
        <thead>
          <tr>
            <th className={`${headerClass} w-[34px] text-center`}>STT</th>
            <th className={`${headerClass} w-[62px]`}>Ngày</th>
            <th className={`${headerClass} w-[98px]`}>Bill</th>
            <th className={`${headerClass} w-[92px]`}>Mã KH</th>
            <th className={`${headerClass} w-[112px]`}>Nội dung</th>
            <th className={`${headerClass} w-[74px]`}>Nơi đến</th>
            <th className={`${headerClass} w-[64px] text-right`}>Số kiện</th>
            <th className={`${headerClass} w-[72px]`}>ĐVT cước</th>
            <th className={`${headerClass} w-[82px] text-right`}>Thành tiền</th>
            <th className={`${headerClass} w-[72px]`}>HTTT</th>
            <th className={`${headerClass} w-[170px]`}>Xử lý giao</th>
            <th className={`${headerClass} w-[104px] text-center`}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {waybills.map((waybill, index) => {
            const totalAmount = resolveTotalAmount(waybill);
            const processing = resolveDeliveryProcessingPresentation(waybill);
            return (
              <tr
                key={`${waybill.id}-${waybill.split_id ?? 'base'}-compact`}
                className="odd:bg-white even:bg-slate-50/70"
              >
                <td className={`${cellClass} text-center font-bold text-slate-500`}>{index + 1}</td>
                <td className={`${cellClass} text-slate-600`}>{formatDate(waybill.sent_date)}</td>
                <td className={cellClass}>
                  <button
                    type="button"
                    onClick={() => onDetail(waybill)}
                    className="font-extrabold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20"
                    title={`Xem chi tiết ${displayCode(waybill)}`}
                  >
                    {displayCode(waybill)}
                  </button>
                </td>
                <td className={`${cellClass} font-semibold`} title={resolveMaKh(waybill)} onClick={(event) => event.stopPropagation()}>
                  {resolveMaKh(waybill) !== '—' ? (
                    <button type="button" onClick={() => void onCustomerLedger(resolveMaKh(waybill))} className="font-extrabold text-violet-700 hover:underline">
                      {resolveMaKh(waybill)}
                    </button>
                  ) : '—'}
                </td>
                <td className={cellClass} title={resolveCongSg(waybill)}>{resolveCongSg(waybill)}</td>
                <td className={`${cellClass} font-semibold`} title={resolveNoiDen(waybill)}>{resolveNoiDen(waybill)}</td>
                <td className={`${cellClass} text-right font-bold`}>{resolvePackageCountSl(waybill)}</td>
                <td className={cellClass}>{resolveBillingUnit(waybill)}</td>
                <td className={`${cellClass} text-right font-bold tabular-nums text-emerald-800`}>
                  {canViewPricing ? formatMoney(totalAmount) : '—'}
                </td>
                <td className={cellClass} title={resolvePaymentMethod(waybill)}>{resolvePaymentMethod(waybill)}</td>
                <td className={`${cellClass} font-bold text-slate-700`} title={processing.title}>
                  {processing.title}
                </td>
                <td className="border-b border-slate-200 px-1 py-1" onClick={(event) => event.stopPropagation()}>
                  <AllOrdersActions
                    waybill={waybill}
                    canEdit={canEdit}
                    canPay={canPay}
                    canRelease={canRelease}
                    onDetail={onDetail}
                    onEdit={onEdit}
                    onWarehouseIntake={onWarehouseIntake}
                    onPayment={onPayment}
                    onRelease={onRelease}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InventoryCard({ waybill, hubs, isAllOrders, canUpdate, canEdit, openActionMenuId, onToggleActionMenu, onCloseActionMenu, onDetail, onEdit, onReceive, onCashVoucher, onReleaseUnscheduledSplit }: InventoryItemProps & { hubs: HubSummary[]; isAllOrders: boolean }) {
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
        <p className="mt-2 text-[13px] font-bold text-foreground">{formatHub(waybill.current_hub || hubs.find((hub) => String(hub.id) === String(waybill.current_hub_id)) || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)}</p>
        <p className="mt-1 text-[12px] font-medium text-muted-foreground">Đến: {formatHub(waybill.dest_hub, waybill.dest_hub_id)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px]">
        <MobileInfo label="Người gửi" value={waybill.sender_info || '—'} />
        <MobileInfo label="Người nhận" value={waybill.receiver_info || '—'} />
        <MobileInfo label="Quận/Huyện" value={resolveReceiverDistrict(waybill) || '—'} />
        <MobileInfo label="Phường/Xã" value={resolveReceiverWard(waybill) || '—'} />
        <MobileInfo label="Tuyến" value={
          <WaybillRouteControl
            waybillId={waybill.id}
            value={waybill.route_code || waybill.delivery_route}
            hubId={waybill.dest_hub_id ?? waybill.current_hub_id ?? waybill.origin_hub_id}
            disabled={!canUpdate}
            compact
          />
        } />
        <MobileInfo label="COD" value={formatMoney(waybill.allocated_cod ?? waybill.cod_amount)} />
        <MobileInfo label="Trạng thái thu COD" value={waybill.cod_collection_status === 'COLLECTED' ? 'Đã thu COD' : waybill.cod_collection_status === 'PENDING' ? 'Chờ thu COD' : 'Không thu'} />
        <MobileInfo label="Nhập kho" value={resolveWarehouseIntakePresentation(waybill).detail || resolveWarehouseIntakePresentation(waybill).title} />
        <MobileInfo label="Số kiện" value={
          waybill.remaining_packages != null
            ? `${waybill.remaining_packages} / ${waybill.order_total_packages ?? waybill.package_count ?? waybill.remaining_packages} (còn chia)`
            : displayValue(waybill.package_count || waybill.declared_package_count)
        } />
        <MobileInfo label="Cân nặng" value={displayValue(waybill.actual_weight || waybill.weight, ' kg')} />
        <MobileInfo
          label={isAllOrders ? 'Ngày gửi' : 'Ngày nhận'}
          value={formatDate(isAllOrders ? waybill.sent_date : (waybill.received_at || waybill.created_at))}
        />
      </div>

      <div className="mt-3 border-t border-border pt-3">
        {isAllOrders ? (
          <AllOrdersActions waybill={waybill} canEdit={canEdit} canPay={false} canRelease={canUpdate} onDetail={onDetail} onEdit={onEdit} onPayment={onCashVoucher} onRelease={onReleaseUnscheduledSplit} />
        ) : (
          <Actions
            waybill={waybill}
            canEdit={canEdit}
            isMutable={isMutableWaybill(waybill)}
            isOpen={openActionMenuId === actionMenuId(waybill, 'card')}
            onToggle={() => onToggleActionMenu(actionMenuId(waybill, 'card'))}
            onClose={onCloseActionMenu}
            onDetail={onDetail}
            onEdit={onEdit}
            onReceive={onReceive}
            onCashVoucher={onCashVoucher}
          />
        )}
      </div>
    </article>
  );
}

interface InventoryItemProps {
  waybill: WaybillInventoryItem;
  canUpdate: boolean;
  canEdit: boolean;
  openActionMenuId: string | null;
  onToggleActionMenu: (id: string) => void;
  onCloseActionMenu: () => void;
  onDetail: (waybill: WaybillInventoryItem) => void;
  onEdit: (waybill: WaybillInventoryItem) => void;
  onReceive: (waybill: WaybillInventoryItem) => void;
  onCashVoucher: (waybill: WaybillInventoryItem) => void;
  onReleaseUnscheduledSplit: (waybill: WaybillInventoryItem) => void;
  onCustomerLedger: (code: string) => void;
  onOpenTripManifest?: (trip: NonNullable<WaybillInventoryItem['trip_history']>[number]) => void;
}

function Actions({
  waybill,
  canEdit,
  isMutable,
  isOpen,
  onToggle,
  onClose,
  onDetail,
  onEdit,
  onReceive,
  onCashVoucher,
}: Pick<InventoryItemProps, 'waybill' | 'canEdit' | 'onDetail' | 'onEdit' | 'onReceive' | 'onCashVoucher'> & { isMutable: boolean; isOpen: boolean; onToggle: () => void; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const editDisabled = !canEdit || !isMutable;
  const canCorrectWarehouseIntake = canEdit && !['RECEIVED', 'CANCELLED'].includes(normalizeStatus(waybill));
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
  const lockedTitle = 'Chỉ sửa được đơn ở trạng thái «Đã tạo đơn» hoặc «Trong kho»';

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
        {normalizeStatus(waybill) === 'RECEIVED' && canEdit && (
          <MenuAction icon={<PackageCheck size={14} />} label="Đã nhập kho" onClick={() => runAction(() => onReceive(waybill))} tone="teal" />
        )}
        {canCorrectWarehouseIntake && (
          <MenuAction icon={<PackageCheck size={14} />} label="Sửa nhập kho" onClick={() => runAction(() => onReceive(waybill))} tone="teal" />
        )}
        {canCollectCashPayment(waybill.payment_type) && (
          <MenuAction icon={<HandCoins size={14} />} label="Thu chi" onClick={() => runAction(() => onCashVoucher(waybill))} tone="teal" />
        )}
        <MenuAction
          icon={<Pencil size={14} />}
          label="Sửa"
          disabled={editDisabled}
          title={editDisabled ? (canEdit ? lockedTitle : 'Cần quyền WAREHOUSE trở lên') : 'Sửa thông tin đơn'}
          onClick={() => runAction(() => onEdit(waybill))}
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
  const toggleValue = (key: keyof Pick<InventoryFilters, 'statuses' | 'originHubIds' | 'destHubIds' | 'paymentTypes' | 'priorities'>, value: string) => setDraftFilters(prev => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter(item => item !== value) : [...prev[key], value] }));
  const setAll = (key: keyof Pick<InventoryFilters, 'statuses' | 'originHubIds' | 'destHubIds' | 'paymentTypes' | 'priorities'>, values: string[]) => setDraftFilters(prev => ({ ...prev, [key]: values }));
  return <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden"><div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} /><div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl"><div className="flex items-center justify-between border-b border-border bg-card p-5"><div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-primary" /><h2 className="text-lg font-black text-foreground">Bộ lọc</h2></div><button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button></div><div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4"><FilterGroup id="status" title="Trạng thái" options={statusOptions} selected={draftFilters.statuses} search={groupSearch.status} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, status: value }))} onToggle={(value) => toggleValue('statuses', value)} onAll={() => setAll('statuses', statusOptions.map(option => option.value))} onClear={() => setAll('statuses', [])} /><FilterGroup id="originHub" title="Bưu cục gửi" options={hubOptions} selected={draftFilters.originHubIds} search={groupSearch.originHub} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, originHub: value }))} onToggle={(value) => toggleValue('originHubIds', value)} onAll={() => setAll('originHubIds', hubOptions.map(option => option.value))} onClear={() => setAll('originHubIds', [])} /><FilterGroup id="destHub" title="HUB đến" options={hubOptions} selected={draftFilters.destHubIds} search={groupSearch.destHub} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, destHub: value }))} onToggle={(value) => toggleValue('destHubIds', value)} onAll={() => setAll('destHubIds', hubOptions.map(option => option.value))} onClear={() => setAll('destHubIds', [])} /><FilterGroup id="payment" title="Loại thanh toán PP/CC/COD" options={paymentOptions} selected={draftFilters.paymentTypes} search={groupSearch.payment} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, payment: value }))} onToggle={(value) => toggleValue('paymentTypes', value)} onAll={() => setAll('paymentTypes', paymentOptions.map(option => option.value))} onClear={() => setAll('paymentTypes', [])} /><FilterGroup id="priority" title="Mức ưu tiên" options={priorityOptions} selected={draftFilters.priorities} search={groupSearch.priority} openGroups={openGroups} setOpenGroups={setOpenGroups} onSearch={(value) => setGroupSearch(prev => ({ ...prev, priority: value }))} onToggle={(value) => toggleValue('priorities', value)} onAll={() => setAll('priorities', priorityOptions.map(option => option.value))} onClear={() => setAll('priorities', [])} /><DateGroup draftFilters={draftFilters} setDraftFilters={setDraftFilters} openGroups={openGroups} setOpenGroups={setOpenGroups} /></div><div className="border-t border-border bg-card p-5"><button onClick={onApply} className="w-full rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20">Áp dụng</button></div></div></div>;
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
function FilterSummaryCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <div className={clsx('min-w-0 rounded-xl border p-2.5 shadow-sm sm:rounded-2xl sm:p-4', toneClass)}>
      <p className="truncate text-[9px] font-bold uppercase tracking-wide opacity-80 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-extrabold sm:mt-1 sm:text-[20px]">{value}</p>
    </div>
  );
}

function Alert({ message, tone = 'amber' }: { message: string; tone?: 'amber' | 'red' }) { return <div className={clsx('flex gap-2 rounded-2xl border px-4 py-3 text-[13px] font-bold', tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800')}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</div>; }
function StateCard({ icon, title, description, compact = false }: { icon: ReactNode; title: string; description: string; compact?: boolean }) { return <div className={clsx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white text-center', compact ? 'm-5 min-h-[320px] p-6' : 'min-h-[420px] p-8')}><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div><h3 className="text-base font-black text-foreground">{title}</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p></div>; }



