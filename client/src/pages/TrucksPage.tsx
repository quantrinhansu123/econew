import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Filter,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Tag,
  Truck as TruckIcon,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useLocation } from 'react-router-dom';
import { FilterSelect } from '../components/ui/FilterSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import type { AuthUserProfile } from './login/types';
import AddEditTruckDialog from './trucks/dialogs/AddEditTruckDialog';
import TruckDetailDialog from './trucks/dialogs/TruckDetailDialog';
import TrucksKanbanBoard from './trucks/TrucksKanbanBoard';
import {
  buildKhuVucSuggestions,
  getLoaiXeCategoryOptions,
  groupTrucksByKhuVuc,
  KANBAN_FETCH_LIMIT,
  khuVucKeyFromTruck,
  khuVucValueFromColumnId,
} from './trucks/data';
import type { DriverSummary, FilterOption, Truck, TruckFilters, TruckFormState, TruckListResponse } from './trucks/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const emptyForm: TruckFormState = {
  license_plate: '',
  bks: '',
  ten_lai_xe: '',
  nha_xe: '',
  loai_xe: '',
  khu_vuc: '',
  payload: '',
  driver_id: '',
  fuel_consumption_limit: '',
  status: 'AVAILABLE',
};

const statusOptions: FilterOption[] = [
  { value: 'AVAILABLE', label: 'Sẵn sàng' },
  { value: 'ASSIGNED', label: 'Đã gán chuyến' },
  { value: 'IN_TRIP', label: 'Đang trong chuyến' },
  { value: 'IN_USE', label: 'Đang sử dụng' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

const hasAnyRole = (mask: number, roles: number[]) => roles.some((role) => (mask & role) !== 0);
const normalizeList = (response: TruckListResponse | Truck[]) =>
  Array.isArray(response) ? response : response.data || response.items || response.trucks || [];
const normalizeTotal = (response: TruckListResponse | Truck[], fallback: number) =>
  Array.isArray(response) ? fallback : response.meta?.total ?? response.total ?? fallback;
const normalizeId = (value?: string | number | null) => (value == null ? '' : String(value));
const displayBks = (truck: Truck) => truck.bks || truck.license_plate || '—';

export default function TrucksPage() {
  const location = useLocation();
  const defaultLoaiXe = location.pathname === '/trips/trunk-vehicles' ? 'Đường trục' : '';
  const [filters, setFilters] = useState<TruckFilters>({
    keyword: '',
    status: [],
    loai_xe: defaultLoaiXe,
    page: 1,
    limit: KANBAN_FETCH_LIMIT,
  });
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [detailTruck, setDetailTruck] = useState<Truck | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [formState, setFormState] = useState<TruckFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const user = useMemo(getStoredUser, []);
  const roleMask = user?.role_mask ?? 0;
  const canView = hasAnyRole(roleMask, [DISPATCHER, MANAGER, DIRECTOR]);
  const canManage = hasAnyRole(roleMask, [MANAGER, DIRECTOR]);
  const canDelete = hasAnyRole(roleMask, [DIRECTOR]);

  const driverOptions = useMemo<FilterOption[]>(
    () => [
      { value: '', label: 'Chưa gán' },
      ...drivers.map((driver) => ({
        value: normalizeId(driver.id),
        label: driver.full_name || driver.name || driver.username || `Tài xế #${driver.id}`,
      })),
    ],
    [drivers],
  );

  const loaiXeFilterOptions = useMemo(() => getLoaiXeCategoryOptions(), []);
  const khuVucOptions = useMemo(() => buildKhuVucSuggestions(trucks), [trucks]);
  const kanbanColumns = useMemo(() => groupTrucksByKhuVuc(trucks), [trucks]);
  const columnsWithTrucks = useMemo(() => kanbanColumns.filter((c) => c.trucks.length > 0).length, [kanbanColumns]);

  const activeFilterCount = filters.status.length + (filters.loai_xe ? 1 : 0);

  useEffect(() => {
    if (canView) void loadDrivers();
  }, [canView]);

  useEffect(() => {
    if (canView) void loadTrucks();
  }, [canView, filters]);

  // Không tự động ép loai_xe theo route; người dùng tự chọn từ dropdown.

  async function loadDrivers() {
    try {
      const response = await apiRequest<DriverSummary[] | { items?: DriverSummary[]; data?: DriverSummary[] }>(
        '/users?role_mask=4&limit=100',
      );
      setDrivers(Array.isArray(response) ? response : response.items || response.data || []);
    } catch {
      setDrivers([]);
    }
  }

  async function loadTrucks() {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: String(KANBAN_FETCH_LIMIT),
      });
      if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
      if (filters.status.length) params.set('status', filters.status.join(','));
      if (filters.loai_xe) params.set('loai_xe', filters.loai_xe);
      const response = await apiRequest<TruckListResponse | Truck[]>(`/trucks?${params.toString()}`);
      const items = normalizeList(response);
      setTrucks(items);
      setTotal(normalizeTotal(response, items.length));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách xe từ bảng trucks.');
      setTrucks([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }

  function updateFilters(next: Partial<TruckFilters>) {
    setFilters((prev) => ({ ...prev, ...next, page: 1 }));
  }

  function setFormField<K extends keyof TruckFormState>(key: K, value: TruckFormState[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate(khuVuc = '') {
    setSelectedTruck(null);
    setFormState({ ...emptyForm, loai_xe: defaultLoaiXe, khu_vuc: khuVuc });
    setIsEditMode(false);
    setIsFormOpen(true);
  }

  function openCreateForColumn(columnId: string) {
    openCreate(khuVucValueFromColumnId(columnId));
  }

  function openEdit(truck: Truck) {
    setSelectedTruck(truck);
    setFormState({
      license_plate: truck.license_plate || '',
      bks: truck.bks || truck.license_plate || '',
      ten_lai_xe: truck.ten_lai_xe || '',
      nha_xe: truck.nha_xe || '',
      loai_xe: truck.loai_xe || '',
      khu_vuc: truck.khu_vuc || '',
      payload: String(truck.payload ?? ''),
      driver_id: normalizeId(truck.driver_id),
      fuel_consumption_limit: String(truck.fuel_consumption_limit ?? ''),
      status: truck.status || 'AVAILABLE',
    });
    setIsEditMode(true);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormClosing(true);
    setTimeout(() => {
      setIsFormOpen(false);
      setIsFormClosing(false);
    }, 260);
  }

  function closeDetail() {
    setIsDetailClosing(true);
    setTimeout(() => {
      setDetailTruck(null);
      setIsDetailClosing(false);
    }, 260);
  }

  async function submitTruck() {
    setIsSubmitting(true);
    setActionError('');
    const plate = formState.license_plate.trim().toUpperCase() || formState.bks.trim().toUpperCase();
    const body = {
      license_plate: plate,
      bks: formState.bks.trim().toUpperCase() || plate,
      ten_lai_xe: formState.ten_lai_xe.trim() || undefined,
      nha_xe: formState.nha_xe.trim() || undefined,
      loai_xe: formState.loai_xe.trim() || undefined,
      khu_vuc: formState.khu_vuc.trim() || undefined,
      payload: Number(formState.payload),
      driver_id: formState.driver_id || undefined,
      fuel_consumption_limit: Number(formState.fuel_consumption_limit || 0),
      status: formState.status,
    };
    try {
      if (isEditMode && selectedTruck) {
        await apiRequest(`/trucks/${selectedTruck.id}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/trucks', { method: 'POST', body });
      }
      closeForm();
      await loadTrucks();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể lưu thông tin xe.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function moveTruckKhuVuc(truck: Truck, columnId: string) {
    const nextKhuVuc = khuVucValueFromColumnId(columnId);
    const currentKey = khuVucKeyFromTruck(truck);
    if (currentKey === columnId) return;

    setActionError('');
    try {
      await apiRequest(`/trucks/${truck.id}`, {
        method: 'PATCH',
        body: { khu_vuc: nextKhuVuc || null },
      });
      await loadTrucks();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể chuyển khu vực cho xe.');
    }
  }

  function confirmStatus(truck: Truck, status: string) {
    setConfirmDialog({
      title: 'Cập nhật trạng thái xe',
      message: `Xác nhận chuyển ${displayBks(truck)} sang ${formatStatus(status)}?`,
      confirmLabel: 'Cập nhật',
      onConfirm: async () => {
        try {
          await apiRequest(`/trucks/${truck.id}/status`, { method: 'PATCH', body: { status } });
          await loadTrucks();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không thể cập nhật trạng thái.');
        }
      },
    });
  }

  function confirmDelete(truck: Truck) {
    setConfirmDialog({
      title: 'Xóa xe',
      message: `Xóa xe ${displayBks(truck)}?`,
      confirmLabel: 'Xóa',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/trucks/${truck.id}`, { method: 'DELETE' });
          await loadTrucks();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không thể xóa xe.');
        }
      },
    });
  }

  function formatStatus(status?: string | null) {
    return statusOptions.find((option) => option.value === status)?.label || status || '—';
  }

  function getDriverName(truck: Truck) {
    if (truck.ten_lai_xe?.trim()) return truck.ten_lai_xe;
    const driver = truck.driver;
    return (
      driver?.full_name ||
      driver?.name ||
      driver?.username ||
      driverOptions.find((o) => o.value === normalizeId(truck.driver_id))?.label ||
      '—'
    );
  }

  if (!canView) {
    return (
      <StateBlock
        icon={<ShieldAlert size={24} />}
        title="Không có quyền truy cập"
        description="Trang này chỉ hiển thị cho DISPATCHER, MANAGER hoặc DIRECTOR."
      />
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && <Alert message={actionError} />}
      {error && <Alert message={error} />}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.keyword}
                onChange={(e) => updateFilters({ keyword: e.target.value })}
                placeholder="Tìm BKS, tên lái xe, nhà xe, khu vực..."
                className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <button
              type="button"
              title="Lọc"
              onClick={() => setIsFilterOpen(true)}
              className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary md:hidden flex items-center justify-center"
            >
              <Filter size={16} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => updateFilters({ status: [] })}
                className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500"
              >
                × Xóa bộ lọc
              </button>
            )}
            <div className="hidden flex-1 md:block" />
            {canManage && (
              <button
                type="button"
                onClick={() => openCreate()}
                className="h-10 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary/90 flex items-center gap-2"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Thêm xe</span>
              </button>
            )}
          </div>
          <div className="hidden md:flex md:items-center md:justify-between md:gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                multiple
                icon={Tag}
                placeholder="Trạng thái"
                options={statusOptions}
                value={filters.status}
                onValueChange={(value) => updateFilters({ status: value })}
              />
              <FilterSelect
                icon={TruckIcon}
                placeholder="Loại xe"
                options={loaiXeFilterOptions}
                value={filters.loai_xe}
                onValueChange={(value) => updateFilters({ loai_xe: value })}
              />
            </div>
            <p className="shrink-0 text-[12px] font-bold text-muted-foreground">
              Kanban theo khu vực · kéo thả để chuyển cột
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <StateBlock
              icon={<Loader2 className="animate-spin" size={24} />}
              title="Đang tải bảng Kanban"
              description="Đang gọi GET /api/v1/trucks và nhóm theo khu vực."
            />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} />
          ) : trucks.length === 0 ? (
            <StateBlock
              icon={<TruckIcon size={24} />}
              title="Chưa có xe"
              description="Thử đổi từ khóa hoặc thêm xe mới."
            />
          ) : (
            <TrucksKanbanBoard
              columns={kanbanColumns}
              canManage={canManage}
              canDelete={canDelete}
              formatStatus={formatStatus}
              getDriverName={getDriverName}
              onOpenDetail={setDetailTruck}
              onEdit={openEdit}
              onStatus={confirmStatus}
              onDelete={confirmDelete}
              onAddToColumn={canManage ? openCreateForColumn : undefined}
              onMoveKhuVuc={canManage ? moveTruckKhuVuc : undefined}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-3 py-2">
          <div className="text-[12px] font-bold text-muted-foreground">
            Hiển thị {trucks.length}
            {total > trucks.length ? ` / ${total}` : ''} xe · {columnsWithTrucks} khu vực có xe · {kanbanColumns.length}{' '}
            cột
            {total > KANBAN_FETCH_LIMIT && (
              <span className="text-amber-600"> · Tối đa {KANBAN_FETCH_LIMIT} xe/lần tải</span>
            )}
          </div>
        </div>
      </div>

      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setIsFilterOpen(false)} />
          <div className="relative w-full rounded-t-2xl bg-white p-4 space-y-3">
            <div className="font-extrabold">Bộ lọc</div>
            <FilterSelect
              multiple
              icon={Tag}
              placeholder="Trạng thái"
              options={statusOptions}
              value={filters.status}
              onValueChange={(value) => updateFilters({ status: value })}
            />
            <FilterSelect
              icon={TruckIcon}
              placeholder="Loại xe"
              options={loaiXeFilterOptions}
              value={filters.loai_xe}
              onValueChange={(value) => updateFilters({ loai_xe: value })}
            />
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="h-11 w-full rounded-xl bg-primary text-white font-bold"
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}

      <AddEditTruckDialog
        isOpen={isFormOpen}
        isClosing={isFormClosing}
        isEditMode={isEditMode}
        isSubmitting={isSubmitting}
        onClose={closeForm}
        onSubmit={submitTruck}
        formState={formState}
        setFormField={setFormField}
        statusOptions={[{ value: '', label: 'Chọn trạng thái' }, ...statusOptions]}
        khuVucOptions={khuVucOptions}
      />
      <TruckDetailDialog
        isOpen={Boolean(detailTruck)}
        isClosing={isDetailClosing}
        truck={detailTruck}
        onClose={closeDetail}
        formatStatus={formatStatus}
        getDriverName={getDriverName}
      />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function Alert({ message }: { message: string }) {
  return (
    <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-600">
      {message}
    </div>
  );
}

function StateBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>
      <div className="text-[15px] font-extrabold text-foreground">{title}</div>
      <div className="max-w-md text-[13px] font-medium text-muted-foreground">{description}</div>
    </div>
  );
}
