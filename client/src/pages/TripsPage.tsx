import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Building2, Loader2, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { FilterSelect } from '../components/ui/FilterSelect';
import { ApiError, apiRequest } from '../lib/api';
import { TripKanbanCard } from './trips/TripKanbanCard';
import { getPrimaryTripAction } from './trips/tripKanbanUtils';
import TripStatusActionDialog from './trips/dialogs/TripStatusActionDialog';
import type { HubSummary, ListResponse, Trip, TripAction } from './trips/types';

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

async function loadAllTripsByStatus(status: TripKanbanStatus, startHubId: string): Promise<Trip[]> {
  const limit = 100;
  const requestPage = (page: number) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
    if (startHubId) params.set('start_hub_id', startHubId);
    return apiRequest<ListResponse<Trip> | Trip[]>(`/trips?${params.toString()}`);
  };
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

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [startHubId, setStartHubId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionTrip, setActionTrip] = useState<Trip | null>(null);
  const [action, setAction] = useState<TripAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const responses = await Promise.all(tripKanbanStatuses.map((status) => loadAllTripsByStatus(status, startHubId)));
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
  }, [startHubId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTrips(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTrips]);

  useEffect(() => {
    let active = true;
    apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active')
      .then((response) => {
        if (active) setHubs(normalizeList(response));
      })
      .catch(() => {
        if (active) setHubs([]);
      });
    return () => { active = false; };
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

  const hubOptions = useMemo(() => [
    { value: '', label: 'Tất cả bưu cục đi' },
    ...hubs.map((hub) => ({
      value: String(hub.id),
      label: `${hub.code || hub.id} — ${hub.name || 'Bưu cục'}`,
    })),
  ], [hubs]);

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
          <FilterSelect
            icon={Building2}
            placeholder="Bưu cục đi"
            options={hubOptions}
            value={startHubId}
            onValueChange={setStartHubId}
            className="w-full sm:w-[220px]"
          />
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
                    <TripKanbanCard
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

function EmptyColumn({ title }: { title: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 text-center text-[12px] font-bold text-muted-foreground">
      {title}
    </div>
  );
}

function StateBlock({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground"><div className="text-primary">{icon}</div><p className="text-[13px] font-bold">{title}</p></div>;
}
