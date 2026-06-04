import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit,
  Loader2,
  MapPin,
  Plus,
  Power,
  Route,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../lib/api';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import { FilterSelect } from '../../components/ui/FilterSelect';
import type { AuthUserProfile } from '../login/types';
import AddEditRouteDialog from './routes/dialogs/AddEditRouteDialog';
import type {
  DeliveryRouteRecord,
  FilterOption,
  HubSummary,
  RouteFilters,
  RouteFormState,
  RouteListResponse,
} from './routes/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const statusOptions: FilterOption[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];

const emptyForm: RouteFormState = {
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
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

const canManage = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const canDelete = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;
const formatHub = (route: DeliveryRouteRecord) =>
  route.hub ? [route.hub.code?.toUpperCase(), route.hub.name].filter(Boolean).join(' · ') : '—';

export default function AdminRoutesPage() {
  const [filters, setFilters] = useState<RouteFilters>({
    keyword: '',
    status: '',
    hub_id: '',
    page: 1,
    limit: 20,
  });
  const [routes, setRoutes] = useState<DeliveryRouteRecord[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState<DeliveryRouteRecord | null>(null);
  const [formState, setFormState] = useState<RouteFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const user = useMemo(getStoredUser, []);
  const manage = canManage(user?.role_mask ?? 0);
  const deletable = canDelete(user?.role_mask ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const hubOptions = useMemo<FilterOption[]>(
    () => [
      { value: '', label: 'Không gán hub' },
      ...hubs.map((h) => ({
        value: String(h.id),
        label: [h.code?.toUpperCase(), h.name].filter(Boolean).join(' · ') || `Hub #${h.id}`,
      })),
    ],
    [hubs],
  );

  const hubFilterOptions = useMemo<FilterOption[]>(
    () => [{ value: '', label: 'Tất cả hub' }, ...hubOptions.filter((o) => o.value)],
    [hubOptions],
  );

  const loadRoutes = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
      if (filters.status) params.set('status', filters.status);
      if (filters.hub_id) params.set('hub_id', filters.hub_id);

      const res = await apiRequest<RouteListResponse>(`/routes?${params}`);
      setRoutes(res.items ?? []);
      setTotal(res.meta?.total ?? res.items?.length ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh mục tuyến.');
      setRoutes([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  useEffect(() => {
    void apiRequest<HubSummary[] | { items?: HubSummary[] }>('/hubs/active')
      .then((res) => setHubs(Array.isArray(res) ? res : res.items ?? []))
      .catch(() => setHubs([]));
  }, []);

  const updateFilter = <K extends keyof RouteFilters>(key: K, value: RouteFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 }));

  const closeForm = () => {
    setIsFormClosing(true);
    window.setTimeout(() => {
      setIsFormOpen(false);
      setIsFormClosing(false);
    }, 280);
  };

  const openAdd = () => {
    setSelected(null);
    setIsEditMode(false);
    setFormState(emptyForm);
    setActionError('');
    setIsFormOpen(true);
  };

  const openEdit = (route: DeliveryRouteRecord) => {
    setSelected(route);
    setIsEditMode(true);
    setFormState({
      code: route.code,
      name: route.name,
      hub_id: route.hub_id ? String(route.hub_id) : '',
      province: route.province ?? '',
      district: route.district ?? '',
      description: route.description ?? '',
      sort_order: String(route.sort_order ?? 0),
      status: route.status || 'ACTIVE',
    });
    setActionError('');
    setIsFormOpen(true);
  };

  const toPayload = () => ({
    code: formState.code.trim(),
    name: formState.name.trim(),
    hub_id: formState.hub_id || undefined,
    province: formState.province.trim() || undefined,
    district: formState.district.trim() || undefined,
    description: formState.description.trim() || undefined,
    sort_order: Number(formState.sort_order) || 0,
    status: formState.status || 'ACTIVE',
  });

  async function submitForm() {
    setIsSubmitting(true);
    setActionError('');
    try {
      if (isEditMode && selected) {
        await apiRequest(`/routes/${selected.id}`, { method: 'PATCH', body: toPayload() });
      } else {
        await apiRequest('/routes', { method: 'POST', body: toPayload() });
      }
      closeForm();
      await loadRoutes();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không lưu được tuyến.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmToggleStatus(route: DeliveryRouteRecord) {
    const next = route.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setConfirmDialog({
      title: 'Cập nhật trạng thái',
      message: `Đổi trạng thái tuyến ${route.code} sang ${next === 'ACTIVE' ? 'Hoạt động' : 'Tạm tắt'}?`,
      confirmLabel: 'Xác nhận',
      onConfirm: async () => {
        try {
          await apiRequest(`/routes/${route.id}/status`, {
            method: 'PATCH',
            body: { status: next },
          });
          await loadRoutes();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái.');
        }
      },
    });
  }

  function confirmDelete(route: DeliveryRouteRecord) {
    setConfirmDialog({
      title: 'Xóa tuyến',
      message: `Xóa tuyến ${route.code}? Chỉ xóa được khi chưa có vận đơn gán mã này.`,
      confirmLabel: 'Xóa',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/routes/${route.id}`, { method: 'DELETE' });
          await loadRoutes();
        } catch (err) {
          setActionError(err instanceof ApiError ? err.message : 'Không xóa được tuyến.');
        }
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {actionError && (
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
          <AlertTriangle size={16} />
          {actionError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="shrink-0 space-y-3 border-b border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted md:w-auto md:px-3"
            >
              <ArrowLeft size={15} />
              <span className="ml-0 hidden text-[13px] font-medium md:inline">Quay lại</span>
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.keyword}
                onChange={(e) => updateFilter('keyword', e.target.value)}
                placeholder="Tìm mã, tên, tỉnh, quận…"
                className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="hidden flex-1 md:block" />
            {manage && (
              <button
                type="button"
                onClick={openAdd}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white shadow-sm shadow-primary/20"
              >
                <Plus size={16} />
                Thêm tuyến
              </button>
            )}
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FilterSelect
              value={filters.status}
              options={statusOptions}
              onValueChange={(v) => updateFilter('status', v)}
              placeholder="Trạng thái"
              icon={Tag}
              className="min-w-[160px]"
            />
            <FilterSelect
              value={filters.hub_id}
              options={hubFilterOptions}
              onValueChange={(v) => updateFilter('hub_id', v)}
              placeholder="Hub"
              icon={MapPin}
              className="min-w-[200px]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          {isLoading ? (
            <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải danh mục tuyến" />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={24} />} title="Lỗi tải dữ liệu" description={error} />
          ) : routes.length === 0 ? (
            <StateBlock
              icon={<Route size={24} />}
              title="Chưa có tuyến"
              description="Thêm tuyến mới hoặc chạy SQL delivery_routes.sql trên Supabase."
            />
          ) : (
            <table className="hidden w-full min-w-[900px] border-collapse text-left md:table">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Mã tuyến</th>
                  <th className="px-4 py-2.5 font-bold">Tên tuyến</th>
                  <th className="px-4 py-2.5 font-bold">Hub</th>
                  <th className="px-4 py-2.5 font-bold">Khu vực</th>
                  <th className="px-4 py-2.5 font-bold text-right">TT</th>
                  <th className="px-4 py-2.5 font-bold">Trạng thái</th>
                  {manage && <th className="px-4 py-2.5 font-bold">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={String(route.id)} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-3 text-[13px] font-extrabold text-primary">{route.code}</td>
                    <td className="px-4 py-3 text-[13px] font-bold">{route.name}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{formatHub(route)}</td>
                    <td className="px-4 py-3 text-[13px]">
                      {[route.province, route.district].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-bold">{route.sort_order}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={route.status} />
                    </td>
                    {manage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <IconBtn title="Sửa" onClick={() => openEdit(route)}>
                            <Edit size={15} />
                          </IconBtn>
                          <IconBtn title="Bật/tắt" onClick={() => confirmToggleStatus(route)}>
                            <Power size={15} />
                          </IconBtn>
                          {deletable && (
                            <IconBtn title="Xóa" danger onClick={() => confirmDelete(route)}>
                              <Trash2 size={15} />
                            </IconBtn>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="grid gap-3 p-3 md:hidden">
            {routes.map((route) => (
              <article key={String(route.id)} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-extrabold text-primary">{route.code}</p>
                    <p className="mt-1 text-[13px] font-bold">{route.name}</p>
                  </div>
                  <StatusBadge status={route.status} />
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">{formatHub(route)}</p>
                {manage && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => openEdit(route)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmToggleStatus(route)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold"
                    >
                      Bật/tắt
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-3">
          <p className="text-[12px] text-muted-foreground">Tổng: {total} tuyến</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => updateFilter('page', filters.page - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-bold">
              {filters.page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() => updateFilter('page', filters.page + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <AddEditRouteDialog
        isOpen={isFormOpen}
        isClosing={isFormClosing}
        isEditMode={isEditMode}
        isSubmitting={isSubmitting}
        formState={formState}
        hubOptions={hubOptions}
        statusOptions={statusOptions}
        onClose={closeForm}
        onSubmit={() => void submitForm()}
        onChange={(patch) => setFormState((prev) => ({ ...prev, ...patch }))}
      />

      <ConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span
      className={clsx(
        'inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase',
        active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600',
      )}
    >
      {active ? 'Hoạt động' : 'Tạm tắt'}
    </span>
  );
}

function IconBtn({
  children,
  title,
  danger,
  onClick,
}: {
  children: ReactNode;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted',
        danger && 'text-red-600 hover:bg-red-50',
      )}
    >
      {children}
    </button>
  );
}

function StateBlock({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="text-primary">{icon}</div>
      <p className="text-[15px] font-extrabold text-foreground">{title}</p>
      {description && <p className="max-w-md text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
