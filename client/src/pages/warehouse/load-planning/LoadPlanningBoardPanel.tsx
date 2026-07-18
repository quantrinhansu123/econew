import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, ChevronDown, Eye, FileSpreadsheet, Loader2, PackageCheck, Plus, Printer, Receipt, RefreshCw, Search, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../lib/api';
import { FilterSelect } from '../../../components/ui/FilterSelect';
import type { AuthUserProfile } from '../../login/types';
import LoadPlanningTruckBoard from './LoadPlanningTruckBoard';
import BulkSplitLoadStatusControl from '../splits/BulkSplitLoadStatusControl';
import type { FilterOption, HubSummary, LoadPlanningBoardFilters, LoadPlanningBoardResponse, LoadPlanningTruckGroup } from './types';
import { SPLIT_LOAD_STATUSES } from '../splits/splitLoadStatus';
import DispatchPrintColumnDropdown from '../../print/DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from '../../print/dispatchPrintColumns';
import { loadVisibleDispatchColumnIds, saveVisibleDispatchColumnIds } from '../../print/dispatchPrintColumns';
import { buildLoadPlanningQuery, mapLoadPlanningBoardToPrintPayload, mapSingleTruckPrintPayload, saveLoadPlanningPrintPayload, summarizeLoadPlanningFilters } from '../../print/loadPlanningPrintUtils';
import LoadPlanningPrintTemplate from '../../print/LoadPlanningPrintTemplate';
import '../../print/inventory-stock-list.css';
import { formatDonGia, parseMoneyAmount } from '../orders/orderFormUtils';
import { downloadLoadPlanningExcel } from './loadPlanningExcelUtils';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

const defaultFilters: LoadPlanningBoardFilters = {
  keyword: '',
  origin_hub_id: [],
  dest_hub_id: [],
  truck_id: [],
  load_status: [],
  date_from: '',
  date_to: '',
};

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const formatNumber = (value?: string | number | null, suffix = '') =>
  value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;

const vendorExpenseTypes = ['Chi phí cố định', 'Chi phí phát sinh', 'Thanh toán cước chuyến', 'Tạm ứng', 'Hoàn ứng', 'Chi khác'];
interface Props {
  bannerTitle?: string;
  bannerDescription?: string;
  showManifestButton?: boolean;
  forcedLoadStatuses?: string[];
  groupByArrivalDate?: boolean;
  excelFileBaseName?: string;
}

export default function LoadPlanningBoardPanel({
  bannerTitle = 'Phân xe · đóng xếp hàng',
  bannerDescription = 'Đơn đã phân xe tại tiếp nhận / tồn kho hiện theo từng biển số. Bấm trạng thái để cập nhật Chờ bốc → Đã tới.',
  showManifestButton = false,
  forcedLoadStatuses,
  groupByArrivalDate = false,
  excelFileBaseName = 'phan-loai-uu-tien',
}: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useMemo(getStoredUser, []);
  const canViewCost = ((user?.role_mask ?? 0) & (MANAGER | DIRECTOR)) !== 0;
  const [filters, setFilters] = useState<LoadPlanningBoardFilters>(() => ({
    ...defaultFilters,
    keyword: searchParams.get('keyword')?.trim() || '',
  }));
  const [draftFilters, setDraftFilters] = useState<LoadPlanningBoardFilters>(defaultFilters);
  const [board, setBoard] = useState<LoadPlanningBoardResponse | null>(null);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [trucks, setTrucks] = useState<Array<{ id: string; label: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['origin']);
  const [selectedArrivalTruck, setSelectedArrivalTruck] = useState<LoadPlanningTruckGroup | null>(null);
  const [printColumnIds, setPrintColumnIds] = useState<DispatchPrintColumnId[]>(() => loadVisibleDispatchColumnIds(canViewCost));

  const updatePrintColumnIds = (ids: DispatchPrintColumnId[]) => {
    saveVisibleDispatchColumnIds(ids);
    setPrintColumnIds(ids);
  };

  useEffect(() => {
    setPrintColumnIds(loadVisibleDispatchColumnIds(canViewCost));
  }, [canViewCost]);

  const hubOptions = useMemo(
    () => hubs.map((hub) => ({
      value: String(hub.id),
      label: hub.code ? `${hub.code} · ${hub.name || 'Bưu cục'}` : hub.name || `Hub #${hub.id}`,
    })),
    [hubs],
  );
  const truckOptions = useMemo(() => trucks.map((truck) => ({ value: truck.id, label: truck.label })), [trucks]);
  const loadStatusOptions = useMemo(() => SPLIT_LOAD_STATUSES.map((status) => ({ value: status.value, label: status.label })), []);
  const activeFilterCount = filters.origin_hub_id.length + filters.dest_hub_id.length + filters.truck_id.length + filters.load_status.length + (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0);
  const truckGroups = board?.trucks ?? [];
  const arrivalGroups = useMemo(() => buildArrivalGroups(truckGroups), [truckGroups]);

  useEffect(() => {
    void fetchOptions();
  }, []);

  useEffect(() => {
    const keyword = searchParams.get('keyword')?.trim() || '';
    setFilters((prev) => (prev.keyword === keyword ? prev : { ...prev, keyword }));
  }, [searchParams]);

  useEffect(() => {
    void fetchBoard();
  }, [filters]);

  async function fetchOptions() {
    try {
      const boardParams = new URLSearchParams({ limit: '100' });
      if (forcedLoadStatuses?.length) boardParams.set('load_status', forcedLoadStatuses.join(','));
      const [hubResponse, boardResponse] = await Promise.all([
        apiRequest<HubSummary[]>('/hubs/active'),
        apiRequest<LoadPlanningBoardResponse>(`/waybills/load-planning/board?${boardParams.toString()}`),
      ]);
      setHubs(Array.isArray(hubResponse) ? hubResponse : []);
      setTrucks(buildTruckOptions(boardResponse.trucks ?? []));
    } catch {
      setHubs([]);
      setTrucks([]);
    }
  }

  async function fetchBoard() {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<LoadPlanningBoardResponse>(`/waybills/load-planning/board?${buildLoadPlanningQuery(filters, forcedLoadStatuses, 100)}`);
      setBoard(response);
      setTrucks(buildTruckOptions(response.trucks ?? []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải bảng phân xe.');
      setBoard(null);
    } finally {
      setIsLoading(false);
    }
  }

  const updateFilters = (patch: Partial<LoadPlanningBoardFilters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const clearFilters = () => {
    const next = { ...defaultFilters, keyword: filters.keyword };
    setFilters(next);
    setDraftFilters(next);
  };
  const openFilters = () => { setDraftFilters(filters); setIsFilterOpen(true); };
  const applyFilters = () => { setFilters(draftFilters); setIsFilterOpen(false); };

  async function exportFilteredRows() {
    setIsExporting(true);
    setError('');
    try {
      const response = await apiRequest<LoadPlanningBoardResponse>(`/waybills/load-planning/board?${buildLoadPlanningQuery(filters, forcedLoadStatuses, 500)}`);
      const exported = downloadLoadPlanningExcel(response, canViewCost, excelFileBaseName);
      if (!exported) {
        setError('Không có dữ liệu phù hợp bộ lọc để xuất Excel.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể xuất Excel.');
    } finally {
      setIsExporting(false);
    }
  }

  async function printFilteredRows() {
    setIsPrinting(true);
    setError('');
    try {
      const response = await apiRequest<LoadPlanningBoardResponse>(`/waybills/load-planning/board?${buildLoadPlanningQuery(filters, forcedLoadStatuses, 500)}`);
      const payload = mapLoadPlanningBoardToPrintPayload(
        response,
        canViewCost,
        summarizeLoadPlanningFilters(filters, forcedLoadStatuses),
        printColumnIds,
      );
      if (!payload.groups.length) {
        setError('Không có dữ liệu phù hợp bộ lọc để in.');
        return;
      }
      saveLoadPlanningPrintPayload(payload);
      window.open('/print/load-planning-board', '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể chuẩn bị dữ liệu in.');
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="shrink-0 rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3 text-[13px] text-violet-900">
        <span className="font-bold">{bannerTitle}</span>
        {' — '}
        {bannerDescription}
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted md:w-auto md:px-3">
              <ArrowLeft size={15} /><span className="hidden md:ml-2 md:inline text-[13px] font-bold">Quay lại</span>
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.keyword}
                onChange={(event) => updateFilters({ keyword: event.target.value })}
                placeholder="Tìm mã vận đơn, người gửi/nhận..."
                className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <button type="button" title="Làm mới" onClick={() => void fetchBoard()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted">
              <RefreshCw size={16} />
            </button>
            <button type="button" title="Xuất Excel" disabled={isExporting || isLoading} onClick={() => void exportFilteredRows()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-3 md:gap-2">
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              <span className="hidden md:inline text-[13px] font-extrabold">Xuất Excel</span>
            </button>
            <DispatchPrintColumnDropdown
              value={printColumnIds}
              canViewPricing={canViewCost}
              onChange={updatePrintColumnIds}
              className="hidden md:block"
            />
            <button type="button" title="In phiếu" disabled={isPrinting || isLoading} onClick={() => void printFilteredRows()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-3 md:gap-2">
              {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              <span className="hidden md:inline text-[13px] font-extrabold">In phiếu</span>
            </button>
            <button type="button" title="Mở bộ lọc" onClick={openFilters} className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden">
              <PackageCheck size={16} />
              {activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}
            </button>
            {activeFilterCount > 0 && (
              <div className="order-last basis-full md:order-none md:basis-auto">
                <button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 hover:bg-red-100 md:h-10">
                  × Xóa {activeFilterCount} bộ lọc
                </button>
              </div>
            )}
            <div className="hidden flex-1 md:block" />
            {showManifestButton && (
              <button type="button" onClick={() => navigate('/warehouse/manifests')} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-extrabold text-white hover:bg-primary/90">
                <Plus size={16} /><span className="hidden sm:inline">Bảng kê</span>
              </button>
            )}
          </div>

          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục đi" options={hubOptions} value={filters.origin_hub_id} onValueChange={(value) => updateFilters({ origin_hub_id: value })} />
            <FilterSelect multiple icon={Building2} placeholder="Bưu cục đến" options={hubOptions} value={filters.dest_hub_id} onValueChange={(value) => updateFilters({ dest_hub_id: value })} />
            <FilterSelect multiple icon={Truck} placeholder="Biển số xe" options={truckOptions} value={filters.truck_id} onValueChange={(value) => updateFilters({ truck_id: value })} />
            {!forcedLoadStatuses?.length && <FilterSelect multiple icon={PackageCheck} placeholder="Trạng thái" options={loadStatusOptions} value={filters.load_status} onValueChange={(value) => updateFilters({ load_status: value })} />}
            <DateInput label="Từ ngày" value={filters.date_from} onChange={(value) => updateFilters({ date_from: value })} />
            <DateInput label="Tới ngày" value={filters.date_to} onChange={(value) => updateFilters({ date_to: value })} />
          </div>

          {!isLoading && board && (
            <div className="flex flex-wrap gap-2 text-[12px] font-bold text-muted-foreground">
              <span>{formatNumber(board.total_trucks)} xe</span>
              <span>·</span>
              <span>{formatNumber(board.total_items)} dòng hàng</span>
              {groupByArrivalDate && (
                <>
                  <span>·</span>
                  <span>{formatNumber(arrivalGroups.length)} ngày tới</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 md:p-4">
          {isLoading ? (
            <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải bảng phân xe..." />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={22} />} title={error} />
          ) : !truckGroups.length ? (
            <StateBlock
              icon={<Truck size={22} />}
              title="Chưa có hàng đã phân xe"
              description="Phân kiện lên xe tại trang tiếp nhận hoặc tồn kho — dữ liệu sẽ hiện ở đây theo từng biển số."
            />
          ) : groupByArrivalDate && arrivalGroups.length ? (
            <ArrivalGroupedBoard
              groups={arrivalGroups}
              canViewCost={canViewCost}
              onViewTruck={setSelectedArrivalTruck}
            />
          ) : (
            <div className="space-y-4">
              {truckGroups.map((truck) => (
                <LoadPlanningTruckBoard
                  key={String(truck.truck_id)}
                  truck={truck}
                  canViewCost={canViewCost}
                  onStatusUpdated={() => void fetchBoard()}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <FilterBottomSheet
        isOpen={isFilterOpen}
        draftFilters={draftFilters}
        setDraftFilters={setDraftFilters}
        openGroups={openGroups}
        setOpenGroups={setOpenGroups}
        hubOptions={hubOptions}
        truckOptions={truckOptions}
        loadStatusOptions={forcedLoadStatuses?.length ? [] : loadStatusOptions}
        onDateChange={(patch) => setDraftFilters((prev) => ({ ...prev, ...patch }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={applyFilters}
      />
      <ArrivalTruckDetailDialog
        truck={selectedArrivalTruck}
        canViewCost={canViewCost}
        printColumnIds={printColumnIds}
        onPrintColumnIdsChange={updatePrintColumnIds}
        onClose={() => setSelectedArrivalTruck(null)}
        onStatusUpdated={() => void fetchBoard()}
      />
    </div>
  );
}

function buildTruckOptions(trucks: LoadPlanningBoardResponse['trucks']) {
  const truckMap = new Map<string, string>();
  trucks.forEach((group) => {
    const label = [group.license_plate, group.nha_xe].filter(Boolean).join(' · ') || `Xe #${group.truck_id}`;
    truckMap.set(String(group.truck_id), label);
  });
  return [...truckMap.entries()].map(([id, label]) => ({ id, label }));
}

function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground">
      <div className="mb-3 text-primary">{icon}</div>
      <p className="text-[13px] font-bold">{title}</p>
      {description && <p className="mt-2 max-w-md text-[12px] leading-6">{description}</p>}
    </div>
  );
}

interface ArrivalDateGroup {
  key: string;
  label: string;
  sortValue: number;
  orderCount: number;
  itemCount: number;
  totalPackages: number;
  totalWeight: number;
  totalFreight: number;
  trucks: LoadPlanningTruckGroup[];
}

function buildArrivalGroups(trucks: LoadPlanningTruckGroup[]): ArrivalDateGroup[] {
  const dayMap = new Map<string, ArrivalDateGroup>();

  trucks.forEach((truck) => {
    (truck.items ?? []).forEach((item) => {
      const label = item.ngay_toi || 'Chưa có ngày tới';
      const key = item.ngay_toi || 'unknown';
      const group = dayMap.get(key) ?? {
        key,
        label,
        sortValue: parseArrivalSortValue(item.ngay_toi),
        orderCount: 0,
        itemCount: 0,
        totalPackages: 0,
        totalWeight: 0,
        totalFreight: 0,
        trucks: [],
      };

      let groupedTruck = group.trucks.find((entry) => String(entry.truck_id) === String(truck.truck_id));
      if (!groupedTruck) {
        groupedTruck = {
          ...truck,
          total_packages: 0,
          total_weight: 0,
          total_freight: 0,
          items: [],
        };
        group.trucks.push(groupedTruck);
      }

      groupedTruck.items.push(item);
      groupedTruck.total_packages += Number(item.so_luong ?? 0);
      groupedTruck.total_weight += Number(item.weight ?? 0);
      groupedTruck.total_freight = Number(groupedTruck.total_freight ?? 0) + Number(item.allocated_freight ?? 0);
      group.itemCount += 1;
      group.totalPackages += Number(item.so_luong ?? 0);
      group.totalWeight += Number(item.weight ?? 0);
      group.totalFreight += Number(item.allocated_freight ?? 0);
      dayMap.set(key, group);
    });
  });

  return [...dayMap.values()]
    .map((group) => ({
      ...group,
      orderCount: countUniqueOrders(group.trucks.flatMap((truck) => truck.items ?? [])),
      trucks: group.trucks
        .sort((a, b) => String(a.license_plate || '').localeCompare(String(b.license_plate || ''), 'vi')),
    }))
    .sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label, 'vi'));
}

function parseArrivalSortValue(label?: string | null) {
  if (!label) return Number.MAX_SAFE_INTEGER;
  const match = label.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return Number.MAX_SAFE_INTEGER - 1;
  const now = new Date();
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = match[3] ? Number(match[3]) : now.getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  let date = new Date(year, month, day).getTime();
  if (!match[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 180 * 24 * 60 * 60 * 1000) {
    date = new Date(now.getFullYear() + 1, month, day).getTime();
  }
  return date;
}

function countUniqueOrders(items: LoadPlanningTruckGroup['items']) {
  return new Set((items ?? []).map((item) => String(item.waybill_id || item.waybill_code || item.split_id))).size;
}

function ArrivalGroupedBoard({
  groups,
  canViewCost,
  onViewTruck,
}: {
  groups: ArrivalDateGroup[];
  canViewCost: boolean;
  onViewTruck: (truck: LoadPlanningTruckGroup) => void;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-emerald-50 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold text-foreground">Ngày tới {group.label}</p>
              <p className="text-[12px] font-bold text-emerald-800">
                {formatNumber(group.orderCount)} đơn · {formatNumber(group.trucks.length)} xe · {formatNumber(group.itemCount)} dòng hàng
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-white px-2.5 py-1 text-violet-700">{formatNumber(group.totalPackages)} kiện</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-emerald-700">{formatNumber(group.totalWeight, ' kg')}</span>
              {canViewCost && <span className="rounded-full bg-white px-2.5 py-1 text-amber-800">{formatNumber(group.totalFreight, ' đ')}</span>}
            </div>
          </div>

          <div className="divide-y divide-border">
            {group.trucks.map((truck) => {
              const key = `${group.key}-${truck.truck_id}`;
              const truckLabel = [truck.license_plate, truck.nha_xe ? `xe ${truck.nha_xe}` : null].filter(Boolean).join(' · ') || `Xe #${truck.truck_id}`;
              return (
                <div key={key}>
                  <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-primary">
                      <Truck size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-extrabold text-foreground">{truckLabel}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[truck.ten_lai_xe, truck.trip_id ? `Chuyến #${truck.trip_id}` : 'Chưa gán chuyến'].filter(Boolean).join(' · ')}
                        {truck.manifest_code ? ` · BK ${truck.manifest_code}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{formatNumber(countUniqueOrders(truck.items))} đơn</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatNumber(truck.total_weight, ' kg')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onViewTruck(truck)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-blue-50 text-primary hover:bg-blue-100"
                      title="Xem chi tiết"
                      aria-label={`Xem chi tiết ${truckLabel}`}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ArrivalTruckDetailDialog({
  truck,
  canViewCost,
  printColumnIds,
  onPrintColumnIdsChange,
  onClose,
  onStatusUpdated,
}: {
  truck: LoadPlanningTruckGroup | null;
  canViewCost: boolean;
  printColumnIds: DispatchPrintColumnId[];
  onPrintColumnIdsChange: (ids: DispatchPrintColumnId[]) => void;
  onClose: () => void;
  onStatusUpdated: () => void;
}) {
  const [isSpendOpen, setIsSpendOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendType, setSpendType] = useState(vendorExpenseTypes[0]);
  const [spendNote, setSpendNote] = useState('');
  const [spendError, setSpendError] = useState('');
  const [isSubmittingSpend, setIsSubmittingSpend] = useState(false);
  const vendorId = truck?.vendor_id ? String(truck.vendor_id) : '';
  const truckLabel = truck
    ? [truck.license_plate, truck.nha_xe ? `xe ${truck.nha_xe}` : null].filter(Boolean).join(' · ') || `Xe #${truck.truck_id}`
    : '';

  const splitIds = useMemo(
    () =>
      (truck?.items ?? [])
        .map((item) => item.split_id)
        .filter((id): id is string | number => id != null && id !== ''),
    [truck],
  );

  const derivedGroupStatus = useMemo(() => {
    const statuses = (truck?.items ?? []).map((item) => item.load_status || 'WAITING_LOAD');
    if (!statuses.length) return 'WAITING_LOAD';
    return statuses.every((status) => status === statuses[0]) ? statuses[0] : statuses[0];
  }, [truck]);

  const [bulkStatus, setBulkStatus] = useState(derivedGroupStatus);

  useEffect(() => {
    setBulkStatus(derivedGroupStatus);
  }, [derivedGroupStatus]);

  const printPayload = useMemo(
    () => (truck ? mapSingleTruckPrintPayload(truck, canViewCost, printColumnIds) : null),
    [truck, canViewCost, printColumnIds],
  );

  if (!truck) return null;

  const openSpendDialog = () => {
    setSpendAmount('');
    setSpendDate(new Date().toISOString().slice(0, 10));
    setSpendType(vendorExpenseTypes[0]);
    setSpendNote(`Chi theo bảng kê ${truck.manifest_code || truckLabel}`);
    setSpendError('');
    setIsSpendOpen(true);
  };

  const submitSpend = async () => {
    const amount = parseMoneyAmount(spendAmount);
    if (!vendorId) {
      setSpendError('Xe này chưa liên kết nhà cung cấp nên chưa thể lập phiếu chi.');
      return;
    }
    if (amount <= 0) {
      setSpendError('Nhập số tiền chi lớn hơn 0.');
      return;
    }
    setIsSubmittingSpend(true);
    setSpendError('');
    try {
      await apiRequest(`/vendors/${vendorId}/payments`, {
        method: 'POST',
        body: {
          payment_date: new Date(`${spendDate || new Date().toISOString().slice(0, 10)}T12:00:00`).toISOString(),
          amount,
          description: `[${spendType}] ${spendNote.trim() || `Chi theo bảng kê ${truck.manifest_code || truckLabel}`}`,
        },
      });
      setIsSpendOpen(false);
      onStatusUpdated();
    } catch (error) {
      setSpendError(error instanceof ApiError ? error.message : 'Không lưu được phiếu chi.');
    } finally {
      setIsSubmittingSpend(false);
    }
  };

  const statementDialog = isStatementOpen && printPayload ? createPortal(
    <div className="statement-print-root fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0 print:backdrop-blur-none">
      <style>{`@media print { body > *:not(.statement-print-root) { display: none !important; } .statement-print-root { display: block !important; position: static !important; inset: auto !important; background: #fff !important; padding: 0 !important; backdrop-filter: none !important; } .statement-print-shell { display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; box-shadow: none !important; } .statement-print-toolbar { display: none !important; } .statement-print-scroll { display: block !important; overflow: visible !important; padding: 0 !important; } }`}</style>
      <div className="statement-print-shell flex max-h-[92vh] w-full max-w-[min(98vw,1200px)] flex-col overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-2xl print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="statement-print-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 print:hidden">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">In phiếu kê bảng kê</p>
            <h3 className="text-[16px] font-extrabold text-foreground">{truck.manifest_code || truckLabel}</h3>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DispatchPrintColumnDropdown
              value={printColumnIds}
              canViewPricing={canViewCost}
              onChange={onPrintColumnIdsChange}
              className="w-[min(220px,42vw)]"
            />
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90"><Printer size={16} />In</button>
            <button type="button" onClick={() => setIsStatementOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button>
          </div>
        </div>
        <div className="statement-print-scroll flex-1 overflow-auto p-4 custom-scrollbar print:block print:overflow-visible print:p-0">
          <LoadPlanningPrintTemplate data={printPayload} />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
    {statementDialog}
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200 md:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Chi tiết bảng kê</p>
            <h2 className="truncate text-lg font-extrabold text-foreground">{truckLabel}</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {[truck.ten_lai_xe, truck.trip_id ? `Chuyến #${truck.trip_id}` : 'Chưa gán chuyến'].filter(Boolean).join(' · ')}
              {truck.manifest_code ? ` · BK ${truck.manifest_code}` : ''}
            </p>
          </div>
          <BulkSplitLoadStatusControl
            splitIds={splitIds}
            value={bulkStatus}
            onUpdated={(status) => {
              setBulkStatus(status);
              onStatusUpdated();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <DispatchPrintColumnDropdown
              value={printColumnIds}
              canViewPricing={canViewCost}
              onChange={onPrintColumnIdsChange}
              className="w-[min(200px,40vw)]"
            />
            <button type="button" onClick={openSpendDialog} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-extrabold text-white hover:bg-emerald-700"><Receipt size={16} />Chi</button>
            <button type="button" onClick={() => setIsStatementOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/20 bg-blue-50 px-4 text-[13px] font-extrabold text-primary hover:bg-blue-100"><Printer size={16} />In phiếu kê</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:bg-muted"><X size={18} /></button>
          </div>
        </div>
        {isSpendOpen && (
          <div className="border-b border-border bg-emerald-50/60 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-[160px_180px_1fr_160px]">
              <label className="text-[12px] font-bold text-muted-foreground">Ngày chi<input type="date" value={spendDate} onChange={(event) => setSpendDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none" /></label>
              <label className="text-[12px] font-bold text-muted-foreground">Loại chi<select value={spendType} onChange={(event) => setSpendType(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">{vendorExpenseTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className="text-[12px] font-bold text-muted-foreground">Ghi chú<input value={spendNote} onChange={(event) => setSpendNote(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none" /></label>
              <label className="text-[12px] font-bold text-muted-foreground">Số tiền<input inputMode="numeric" value={spendAmount} onChange={(event) => setSpendAmount(formatDonGia(event.target.value))} placeholder="VD: 500.000" className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-right text-[13px] font-bold text-foreground outline-none" /></label>
            </div>
            {spendError && <p className="mt-2 text-[12px] font-bold text-red-600">{spendError}</p>}
            {!vendorId && <p className="mt-2 text-[12px] font-bold text-amber-700">Xe này chưa liên kết nhà cung cấp, cần gán NCC cho xe trước khi lập phiếu chi.</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setIsSpendOpen(false)} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-extrabold text-muted-foreground hover:bg-muted">Hủy</button>
              <button type="button" disabled={isSubmittingSpend || !vendorId} onClick={() => void submitSpend()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60">{isSubmittingSpend ? <Loader2 className="animate-spin" size={16} /> : <Receipt size={16} />}Lưu phiếu chi</button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60 p-4 custom-scrollbar">
          <LoadPlanningTruckBoard
            truck={truck}
            canViewCost={canViewCost}
            onStatusUpdated={onStatusUpdated}
            showHeader={false}
            bulkStatusMode
            sortByDistrict
          />
        </div>
      </div>
    </div>
    </>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-muted-foreground">
      <CalendarDays size={14} className="text-primary" />
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 min-w-[132px] bg-transparent text-[12px] font-bold text-foreground outline-none"
      />
    </label>
  );
}

function FilterBottomSheet({
  isOpen,
  draftFilters,
  setDraftFilters,
  openGroups,
  setOpenGroups,
  hubOptions,
  truckOptions,
  loadStatusOptions,
  onDateChange,
  onClose,
  onApply,
}: {
  isOpen: boolean;
  draftFilters: LoadPlanningBoardFilters;
  setDraftFilters: Dispatch<SetStateAction<LoadPlanningBoardFilters>>;
  openGroups: string[];
  setOpenGroups: Dispatch<SetStateAction<string[]>>;
  hubOptions: FilterOption[];
  truckOptions: FilterOption[];
  loadStatusOptions: FilterOption[];
  onDateChange: (patch: Pick<LoadPlanningBoardFilters, 'date_from'> | Pick<LoadPlanningBoardFilters, 'date_to'>) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!isOpen) return null;
  const groups = [
    { id: 'origin', title: 'Bưu cục đi', key: 'origin_hub_id' as const, options: hubOptions },
    { id: 'dest', title: 'Bưu cục đến', key: 'dest_hub_id' as const, options: hubOptions },
    { id: 'truck', title: 'Biển số xe', key: 'truck_id' as const, options: truckOptions },
    ...(loadStatusOptions.length ? [{ id: 'status', title: 'Trạng thái', key: 'load_status' as const, options: loadStatusOptions }] : []),
  ];
  const toggleGroup = (id: string) => setOpenGroups((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const setArray = (key: 'origin_hub_id' | 'dest_hub_id' | 'truck_id' | 'load_status', value: string[]) => setDraftFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-extrabold text-foreground">Bộ lọc phân xe</h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          <div className="mb-3 rounded-2xl border border-border bg-white p-3">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-foreground">
              <CalendarDays size={16} className="text-primary" />
              Khoảng ngày bốc
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] font-bold text-muted-foreground">
                Từ ngày
                <input type="date" value={draftFilters.date_from} onChange={(event) => onDateChange({ date_from: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-[13px] font-bold text-foreground outline-none" />
              </label>
              <label className="text-[12px] font-bold text-muted-foreground">
                Tới ngày
                <input type="date" value={draftFilters.date_to} onChange={(event) => onDateChange({ date_to: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-[13px] font-bold text-foreground outline-none" />
              </label>
            </div>
          </div>
          {groups.map((group) => (
            <FilterGroup
              key={group.id}
              id={group.id}
              title={group.title}
              isOpen={openGroups.includes(group.id)}
              options={group.options}
              value={draftFilters[group.key]}
              onToggle={() => toggleGroup(group.id)}
              onChange={(value) => setArray(group.key, value)}
            />
          ))}
        </div>
        <div className="border-t border-border bg-white p-4">
          <button type="button" onClick={onApply} className="h-11 w-full rounded-xl bg-primary text-[13px] font-extrabold text-white">Áp dụng</button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  id,
  title,
  isOpen,
  options,
  value,
  onToggle,
  onChange,
}: {
  id: string;
  title: string;
  isOpen: boolean;
  options: FilterOption[];
  value: string[];
  onToggle: () => void;
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-border bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-[13px] font-extrabold text-foreground">{title}</span>
        <ChevronDown size={16} className={clsx('text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" onClick={() => onChange(options.map((option) => option.value))} className="text-[12px] font-bold text-primary">Chọn tất cả</button>
            <button type="button" onClick={() => onChange([])} className="text-[12px] font-bold text-red-500">Xóa chọn</button>
          </div>
          <div className="max-h-52 overflow-auto custom-scrollbar">
            {options.map((option) => (
              <label key={`${id}-${option.value}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-muted/60">
                <input
                  type="checkbox"
                  checked={value.includes(option.value)}
                  onChange={() => onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value])}
                  className="h-4 w-4 rounded border-border"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
