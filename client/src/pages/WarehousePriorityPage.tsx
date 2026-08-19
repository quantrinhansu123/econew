import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Eye, Loader2, Package, RefreshCcw, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { getStoredAuthUser } from '../lib/authUser';
import WaybillPriorityControl from './warehouse/inventory/WaybillPriorityControl';
import WaybillPriorityDetailDialog from './warehouse/priority/dialogs/WaybillPriorityDetailDialog';
import type { BadgeConfig, WaybillListResponse, WaybillPriorityDetail, WaybillPriorityItem } from './warehouse/priority/types';

const PAGE_ROLES = 1 | 8 | 32 | 64;
const UPDATE_ROLES = 8 | 32 | 64;
const BOARD_COLUMNS = ['DEPARTED', 'EXPECTED_ARRIVAL'] as const;

const statusConfig: Record<string, BadgeConfig> = {
  DEPARTED: { label: 'Xe đã khởi hành', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  EXPECTED_ARRIVAL: { label: 'Dự kiến đến', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  RECEIVED: { label: 'Đơn cần lấy', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  MANIFEST_CLOSED: { label: 'Chờ bốc', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  LOADED: { label: 'Đã bốc', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  DELIVERED: { label: 'Đã giao', className: 'bg-green-50 text-green-700 border-green-200' },
  RETURNED: { label: 'Hoàn', className: 'bg-red-50 text-red-700 border-red-200' },
};

function boardColumnStatus(status: string) {
  if (['AT_DEST_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'].includes(status)) return 'EXPECTED_ARRIVAL';
  return 'DEPARTED';
}

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

const extractList = (response: WaybillListResponse | WaybillPriorityItem[]) =>
  Array.isArray(response) ? response : response.data || response.items || response.waybills || [];

const displayCode = (waybill: WaybillPriorityItem) => waybill.waybill_code || `#${waybill.id}`;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const normalizeStatus = (waybill: WaybillPriorityItem) => String(waybill.current_state || '').toUpperCase();
const normalizePriority = (priority?: string | null) => String(priority || 'NORMAL').toUpperCase();
const hasRole = (roleMask: number, roles: number) => (roleMask & roles) !== 0;

export default function WarehousePriorityPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [waybills, setWaybills] = useState<WaybillPriorityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailWaybill, setDetailWaybill] = useState<WaybillPriorityDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const user = useMemo(() => getStoredAuthUser(), []);
  const roleMask = user?.role_mask ?? 0;
  const canView = hasRole(roleMask, PAGE_ROLES);
  const canUpdate = hasRole(roleMask, UPDATE_ROLES);

  const grouped = useMemo(() => {
    const map = new Map<string, WaybillPriorityItem[]>(BOARD_COLUMNS.map((status) => [status, []]));
    for (const waybill of waybills) {
      const status = boardColumnStatus(normalizeStatus(waybill));
      map.get(status)?.push(waybill);
    }
    return map;
  }, [waybills]);

  useEffect(() => {
    if (!canView) return;
    void loadWaybills();
  }, [canView]);

  async function loadWaybills() {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '200' });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const response = await apiRequest<WaybillListResponse | WaybillPriorityItem[]>(`/waybills?${params.toString()}`);
      setWaybills(extractList(response));
    } catch (err) {
      setWaybills([]);
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách vận đơn ưu tiên.');
    } finally {
      setIsLoading(false);
    }
  }

  async function openDetail(waybill: WaybillPriorityItem) {
    setIsDetailOpen(true);
    setIsDetailClosing(false);
    setIsDetailLoading(true);
    setDetailWaybill(null);
    try {
      const detail = await apiRequest<WaybillPriorityDetail>(`/waybills/${waybill.id}`);
      setDetailWaybill(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết vận đơn.');
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  }

  function closeDetail() {
    setIsDetailClosing(true);
    window.setTimeout(() => {
      setIsDetailOpen(false);
      setIsDetailClosing(false);
      setDetailWaybill(null);
    }, 220);
  }

  function updateLocalPriority(id: string | number, priority: string) {
    setWaybills((prev) => prev.map((waybill) => String(waybill.id) === String(id) ? { ...waybill, priority } : waybill));
  }

  if (!canView) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-[13px] font-semibold text-red-600">
        <AlertTriangle className="mr-2" size={18} />
        Bạn không có quyền xem phân loại ưu tiên.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted md:w-auto md:px-3">
          <ArrowLeft size={16} />
          <span className="ml-2 hidden text-[13px] font-bold md:inline">Quay lại</span>
        </button>
        <div className="relative min-w-0 flex-1 md:max-w-[520px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void loadWaybills()}
            placeholder="Tìm mã vận đơn, người gửi, người nhận..."
            className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <button onClick={() => void loadWaybills()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90">
          <RefreshCcw size={15} />
          Tải lại
        </button>
      </div>

      {error && <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">{error}</div>}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-sm">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-primary">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : (
          <div className="custom-scrollbar flex h-full gap-3 overflow-x-auto p-3">
            {BOARD_COLUMNS.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={grouped.get(status) || []}
                canUpdate={canUpdate}
                onPriorityUpdated={updateLocalPriority}
                onDetail={openDetail}
              />
            ))}
          </div>
        )}
      </div>

      <WaybillPriorityDetailDialog
        isOpen={isDetailOpen}
        isClosing={isDetailClosing}
        isLoading={isDetailLoading}
        waybill={detailWaybill}
        statusConfig={statusConfig}
        paymentConfig={paymentConfig}
        priorityConfig={priorityConfig}
        onClose={closeDetail}
      />
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  canUpdate,
  onPriorityUpdated,
  onDetail,
}: {
  status: string;
  items: WaybillPriorityItem[];
  canUpdate: boolean;
  onPriorityUpdated: (id: string | number, priority: string) => void;
  onDetail: (waybill: WaybillPriorityItem) => void;
}) {
  const config = statusConfig[status] || { label: 'Khác', className: 'bg-muted text-muted-foreground border-border' };
  return (
    <section className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5">
        <span className={clsx('inline-flex min-h-8 items-center rounded-lg border px-2.5 text-[12px] font-black', config.className)}>{config.label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[12px] font-black text-slate-600">{items.length}</span>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {items.length ? items.map((waybill) => (
          <WaybillCard
            key={String(waybill.id)}
            waybill={waybill}
            canUpdate={canUpdate}
            onPriorityUpdated={onPriorityUpdated}
            onDetail={onDetail}
          />
        )) : (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] font-bold text-muted-foreground">
            <Package size={20} className="mb-2" />
            Chưa có vận đơn
          </div>
        )}
      </div>
    </section>
  );
}

function WaybillCard({
  waybill,
  canUpdate,
  onPriorityUpdated,
  onDetail,
}: {
  waybill: WaybillPriorityItem;
  canUpdate: boolean;
  onPriorityUpdated: (id: string | number, priority: string) => void;
  onDetail: (waybill: WaybillPriorityItem) => void;
}) {
  const priority = normalizePriority(waybill.priority);
  const priorityBadge = priorityConfig[priority] || priorityConfig.NORMAL;
  const paymentBadge = paymentConfig[String(waybill.payment_type || '')] || { label: waybill.payment_type || '—', className: 'bg-muted text-muted-foreground border-border' };
  return (
    <article className="rounded-xl border border-border bg-white p-3 shadow-sm transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-black text-primary">{displayCode(waybill)}</p>
          <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">{waybill.receiver_info || 'Chưa có người nhận'}</p>
        </div>
        <button onClick={() => onDetail(waybill)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground" title="Xem chi tiết">
          <Eye size={15} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={clsx('inline-flex min-h-7 items-center rounded-lg border px-2 text-[11px] font-black', priorityBadge.className)}>{priorityBadge.label}</span>
        <span className={clsx('inline-flex min-h-7 items-center rounded-lg border px-2 text-[11px] font-black', paymentBadge.className)}>{paymentBadge.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <Info label="Kg" value={displayValue(waybill.weight, ' kg')} />
        <Info label="TL quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} />
      </div>
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <WaybillPriorityControl
          waybillId={waybill.id}
          value={waybill.priority}
          disabled={!canUpdate}
          compact
          onUpdated={(next) => onPriorityUpdated(waybill.id, next)}
        />
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/30 px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-bold text-foreground">{value}</p>
    </div>
  );
}
