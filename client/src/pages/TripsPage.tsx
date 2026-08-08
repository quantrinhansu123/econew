import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, PackageCheck, Pencil, Printer, Receipt, RefreshCw, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import TripStatusActionDialog from './trips/dialogs/TripStatusActionDialog';
import type { ListResponse, Trip, TripAction } from './trips/types';

const tripKanbanStatuses = ['PLANNED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'] as const;
type TripKanbanStatus = (typeof tripKanbanStatuses)[number];

const tripKanbanColumns: Array<{ id: TripKanbanStatus; title: string; tone: string }> = [
  { id: 'PLANNED', title: 'Chờ khởi hành', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'IN_TRANSIT', title: 'Đang chạy', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  { id: 'ARRIVED', title: 'Xe đã đến', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { id: 'COMPLETED', title: 'Hoàn tất chuyến', tone: 'border-slate-200 bg-slate-100 text-slate-700' },
];

const normalizeList = <T,>(response: ListResponse<T> | T[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trips || []
);

async function loadAllTripsByStatus(status: TripKanbanStatus): Promise<Trip[]> {
  const limit = 100;
  const requestPage = (page: number) => apiRequest<ListResponse<Trip> | Trip[]>(
    `/trips?${new URLSearchParams({ page: String(page), limit: String(limit), status }).toString()}`,
  );
  const firstResponse = await requestPage(1);
  const firstItems = normalizeList(firstResponse);
  if (Array.isArray(firstResponse)) return firstItems;
  const total = firstResponse.meta?.total ?? firstResponse.total ?? firstItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages === 1) return firstItems;
  const remainingResponses = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => requestPage(index + 2)),
  );
  return [...firstItems, ...remainingResponses.flatMap(normalizeList)];
}

const formatDate = (value?: string | null) => (
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
);

const tripStatusLabel = (status?: string | null) => {
  if (status === 'PLANNED') return 'Chờ khởi hành';
  if (status === 'IN_TRANSIT') return 'Đang chạy';
  if (status === 'ARRIVED') return 'Xe đã đến';
  if (status === 'COMPLETED') return 'Hoàn tất chuyến';
  return status || '—';
};

const truckPlate = (trip: Trip) => trip.truck?.bks?.trim() || trip.truck?.license_plate?.trim() || (trip.truck_id ? `Xe #${trip.truck_id}` : 'Chưa có xe');
const driverName = (trip: Trip) => trip.driver_name || trip.truck?.ten_lai_xe || 'Chưa có tài xế';
const manifestCode = (trip: Trip) => trip.manifest?.manifest_code || (trip.manifest_id ? `BK #${trip.manifest_id}` : '—');
const routeLabel = (trip: Trip) => trip.route_label || `${trip.start_hub?.code || trip.start_hub_id || '—'} → ${trip.end_hub?.code || trip.end_hub_id || '—'}`;

const getPrimaryTripAction = (status?: string | null): TripAction | null => {
  if (status === 'PLANNED') return 'start';
  if (status === 'IN_TRANSIT') return 'arrive';
  if (status === 'ARRIVED') return 'complete';
  return null;
};

const primaryActionLabel = (status?: string | null) => {
  if (status === 'PLANNED') return 'Bấm khởi hành';
  if (status === 'IN_TRANSIT') return 'Xác nhận đến hub';
  if (status === 'ARRIVED') return 'Hoàn tất chuyến';
  return 'Chuyến đã hoàn tất';
};

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionTrip, setActionTrip] = useState<Trip | null>(null);
  const [action, setAction] = useState<TripAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  async function loadTrips() {
    setIsLoading(true);
    setError('');
    try {
      const responses = await Promise.all(tripKanbanStatuses.map(loadAllTripsByStatus));
      const merged = new Map<string, Trip>();
      responses.flat().forEach((trip) => {
        merged.set(String(trip.id), trip);
      });
      setTrips([...merged.values()].sort((a, b) => (
        new Date(b.departure_time || b.created_at || 0).getTime() - new Date(a.departure_time || a.created_at || 0).getTime()
      )));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được bảng kê đơn đã đi.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTrips();
  }, []);

  const tripsByStatus = useMemo(() => {
    const grouped = Object.fromEntries(tripKanbanStatuses.map((status) => [status, [] as Trip[]])) as Record<TripKanbanStatus, Trip[]>;
    trips.forEach((trip) => {
      const status = String(trip.status || '') as TripKanbanStatus;
      if (grouped[status]) grouped[status].push(trip);
    });
    return grouped;
  }, [trips]);

  const totals = useMemo(() => ({
    planned: tripsByStatus.PLANNED.length,
    departed: tripsByStatus.IN_TRANSIT.length,
    arrived: tripsByStatus.ARRIVED.length,
    completed: tripsByStatus.COMPLETED.length,
  }), [tripsByStatus]);

  function openPrimaryAction(trip: Trip) {
    const nextAction = getPrimaryTripAction(trip.status);
    if (!nextAction) return;
    setActionTrip(trip);
    setAction(nextAction);
    setActionError('');
  }

  function openCancelAction(trip: Trip) {
    if (trip.status !== 'PLANNED') return;
    setActionTrip(trip);
    setAction('cancel');
    setActionError('');
  }

  async function confirmAction() {
    if (!actionTrip || !action) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest<Trip>(`/trips/${actionTrip.id}/${action}`, { method: 'PATCH' });
      setActionTrip(null);
      setAction(null);
      await loadTrips();
    } catch (submitError) {
      setActionError(submitError instanceof ApiError ? submitError.message : 'Không cập nhật được trạng thái chuyến.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="h-full min-h-0">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Truck size={17} /></div>
          <p className="min-w-0 flex-1 text-[12px] font-bold text-muted-foreground">
            <span className="text-foreground">{trips.length.toLocaleString('vi-VN')} chuyến</span>
            <span className="mx-2">·</span>{totals.planned.toLocaleString('vi-VN')} chờ
            <span className="mx-2">·</span>{totals.departed.toLocaleString('vi-VN')} đang chạy
            <span className="mx-2">·</span>{totals.arrived.toLocaleString('vi-VN')} đã đến
            <span className="mx-2">·</span>{totals.completed.toLocaleString('vi-VN')} hoàn tất
          </p>
          <button type="button" onClick={() => void loadTrips()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Làm mới
          </button>
        </div>
        {isLoading ? (
          <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải bảng kê đơn đã đi..." />
        ) : error ? (
          <StateBlock icon={<AlertTriangle size={22} />} title={error} />
        ) : !trips.length ? (
          <StateBlock icon={<PackageCheck size={22} />} title="Chưa có chuyến xe." />
        ) : (
          <TripKanbanBoard
            tripsByStatus={tripsByStatus}
            onOpen={(id) => navigate(`/trips/${id}`)}
            onEdit={(id) => navigate(`/trips/${id}?edit=manifest`)}
            onPrint={(manifestId) => window.open(`/print/manifest/${manifestId}`, '_blank', 'noopener')}
            onExpenses={(id) => navigate(`/trips/${id}/expenses`)}
            onPrimaryAction={openPrimaryAction}
            onCancelAction={openCancelAction}
          />
        )}
      </section>
      <TripStatusActionDialog
        trip={actionTrip}
        action={action}
        isSubmitting={isSubmitting}
        error={actionError}
        onClose={() => { setActionTrip(null); setAction(null); }}
        onConfirm={confirmAction}
      />
    </div>
  );
}

function TripKanbanBoard({
  tripsByStatus,
  onOpen,
  onEdit,
  onPrint,
  onExpenses,
  onPrimaryAction,
  onCancelAction,
}: {
  tripsByStatus: Record<TripKanbanStatus, Trip[]>;
  onOpen: (id: string | number) => void;
  onEdit: (id: string | number) => void;
  onPrint: (manifestId: string | number) => void;
  onExpenses: (id: string | number) => void;
  onPrimaryAction: (trip: Trip) => void;
  onCancelAction: (trip: Trip) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2 custom-scrollbar">
      <div className="grid h-full min-h-[420px] min-w-[1060px] grid-cols-4 gap-2">
        {tripKanbanColumns.map((column) => (
          <KanbanColumn key={column.id} title={column.title} count={tripsByStatus[column.id].length} tone={column.tone}>
            <div className="flex flex-col gap-1.5">
              {tripsByStatus[column.id].length
                ? tripsByStatus[column.id].map((trip) => (
                    <TripCard
                      key={String(trip.id)}
                      trip={trip}
                      onOpen={() => onOpen(trip.id)}
                      onEdit={() => onEdit(trip.id)}
                      onPrint={trip.manifest_id ? () => onPrint(trip.manifest_id!) : undefined}
                      onExpenses={() => onExpenses(trip.id)}
                      onPrimaryAction={() => onPrimaryAction(trip)}
                      onCancelAction={() => onCancelAction(trip)}
                    />
                  ))
                : <EmptyColumn title="Chưa có chuyến" />}
            </div>
          </KanbanColumn>
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ title, count, tone, children }: { title: string; count: number; tone: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-white">
      <div className={clsx('flex items-center justify-between border-b px-2.5 py-1.5', tone)}>
        <h3 className="text-[12px] font-black">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-foreground">{count}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5 custom-scrollbar">{children}</div>
    </section>
  );
}

function TripCard({ trip, onOpen, onEdit, onPrint, onExpenses, onPrimaryAction, onCancelAction }: { trip: Trip; onOpen: () => void; onEdit: () => void; onPrint?: () => void; onExpenses: () => void; onPrimaryAction: () => void; onCancelAction: () => void }) {
  const primaryAction = getPrimaryTripAction(trip.status);
  const routeStops = trip.route_stops ?? [];
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition-colors hover:border-primary/30 hover:bg-blue-50/20">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-extrabold text-primary">Chuyến #{trip.id}</h3>
            <p className="mt-0.5 truncate text-[11px] font-bold text-emerald-700">{manifestCode(trip)}</p>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 rounded-md bg-slate-50 px-2 py-1.5 text-[10px]">
          <CompactCell label="BSX" value={truckPlate(trip)} />
          <CompactCell label="Tài xế" value={driverName(trip)} />
          <CompactCell label="Tuyến" value={routeLabel(trip)} className="col-span-2" />
          <CompactCell label="Khởi hành" value={formatDate(trip.departure_time)} />
          <CompactCell label="Dự kiến đến" value={formatDate(trip.expected_arrival_time || trip.arrival_time)} />
        </div>
        {routeStops.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold text-emerald-800">
            {routeStops.map((stop) => (
              <span key={String(stop.hub_id)} className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">
                {stop.hub_code || stop.hub_name || `HUB #${stop.hub_id}`}: {formatDate(stop.expected_arrival_at)}
              </span>
            ))}
          </div>
        )}
      </button>
      <div className="mt-1.5 flex items-center gap-1 border-t border-slate-100 pt-1.5">
        <ActionButton title="Xem chi tiết" icon={<Eye size={14} />} onClick={onOpen} />
        <ActionButton title={onPrint ? 'Xem / In bảng kê theo HUB đến' : 'Chuyến chưa có bảng kê'} icon={<Printer size={14} />} onClick={onPrint} disabled={!onPrint} />
        <ActionButton title="Chi phí" icon={<Receipt size={14} />} onClick={onExpenses} />
        <ActionButton title="Sửa bảng kê" icon={<Pencil size={14} />} onClick={onEdit} disabled={!trip.manifest_id || trip.status === 'CANCELLED'} />
        <ActionButton title={primaryActionLabel(trip.status)} icon={primaryAction ? <Truck size={14} /> : <CheckCircle2 size={14} />} onClick={primaryAction ? onPrimaryAction : undefined} disabled={!primaryAction} />
        {trip.status === 'PLANNED' && <ActionButton title="Hủy chuyến và trả đơn về tồn kho" icon={<XCircle size={14} />} onClick={onCancelAction} danger />}
      </div>
    </article>
  );
}

function CompactCell({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmptyColumn({ title }: { title: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 text-center text-[12px] font-bold text-muted-foreground">
      {title}
    </div>
  );
}

function TripStatusBadge({ status }: { status?: string | null }) {
  const className = status === 'COMPLETED'
    ? 'border-slate-200 bg-slate-100 text-slate-700'
    : status === 'ARRIVED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'PLANNED'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-blue-200 bg-blue-50 text-blue-700';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${className}`}>{tripStatusLabel(status)}</span>;
}

function ActionButton({ icon, title, onClick, disabled = false, danger = false }: { icon: ReactNode; title: string; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={clsx('inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white disabled:cursor-not-allowed disabled:opacity-35', danger ? 'border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700' : 'border-border text-muted-foreground hover:bg-muted hover:text-primary')}>{icon}</button>;
}

function StateBlock({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground"><div className="text-primary">{icon}</div><p className="text-[13px] font-bold">{title}</p></div>;
}
