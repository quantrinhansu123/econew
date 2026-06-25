import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Eye, Loader2, PackageCheck, Printer, Receipt, RefreshCw, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import type { ListResponse, Trip } from './trips/types';

const tripKanbanStatuses = ['PLANNED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'] as const;
type TripKanbanStatus = (typeof tripKanbanStatuses)[number];

const tripKanbanColumns: Array<{ id: TripKanbanStatus; title: string; tone: string }> = [
  { id: 'PLANNED', title: 'Chờ khởi hành', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'IN_TRANSIT', title: 'Xe đã khởi hành', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  { id: 'ARRIVED', title: 'Xe đã đến', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { id: 'COMPLETED', title: 'Hoàn tất chuyến', tone: 'border-slate-200 bg-slate-100 text-slate-700' },
];

const normalizeList = <T,>(response: ListResponse<T> | T[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trips || []
);

const formatDate = (value?: string | null) => (
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
);

const tripStatusLabel = (status?: string | null) => {
  if (status === 'PLANNED') return 'Chờ khởi hành';
  if (status === 'IN_TRANSIT') return 'Xe đã khởi hành';
  if (status === 'ARRIVED') return 'Xe đã đến';
  if (status === 'COMPLETED') return 'Hoàn tất chuyến';
  return status || '—';
};

const truckPlate = (trip: Trip) => trip.truck?.bks?.trim() || trip.truck?.license_plate?.trim() || (trip.truck_id ? `Xe #${trip.truck_id}` : 'Chưa có xe');
const driverName = (trip: Trip) => trip.driver_name || trip.truck?.ten_lai_xe || 'Chưa có tài xế';
const manifestCode = (trip: Trip) => trip.manifest?.manifest_code || (trip.manifest_id ? `BK #${trip.manifest_id}` : '—');
const routeLabel = (trip: Trip) => `${trip.start_hub?.code || trip.start_hub_id || '—'} → ${trip.end_hub?.code || trip.end_hub_id || '—'}`;

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadTrips() {
    setIsLoading(true);
    setError('');
    try {
      const responses = await Promise.all(tripKanbanStatuses.map((status) => (
        apiRequest<ListResponse<Trip> | Trip[]>(`/trips?${new URLSearchParams({ page: '1', limit: '100', status }).toString()}`)
      )));
      const merged = new Map<string, Trip>();
      responses.flatMap(normalizeList).forEach((trip) => {
        merged.set(String(trip.id), trip);
      });
      setTrips([...merged.values()].sort((a, b) => (
        new Date(b.departure_time || b.created_at || 0).getTime() - new Date(a.departure_time || b.created_at || 0).getTime()
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

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Truck size={22} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-foreground">Bảng kê đơn đã đi</h1>
            <p className="text-[13px] text-muted-foreground">Kanban theo trạng thái chuyến: chờ khởi hành, đang chạy, đã đến và hoàn tất.</p>
          </div>
          <button type="button" onClick={() => void loadTrips()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Làm mới
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-bold text-muted-foreground">
          <span>{trips.length.toLocaleString('vi-VN')} chuyến</span><span>·</span>
          <span>{totals.planned.toLocaleString('vi-VN')} chờ khởi hành</span><span>·</span>
          <span>{totals.departed.toLocaleString('vi-VN')} đang chạy</span><span>·</span>
          <span>{totals.arrived.toLocaleString('vi-VN')} đã đến</span><span>·</span>
          <span>{totals.completed.toLocaleString('vi-VN')} hoàn tất</span>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {isLoading ? (
          <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải bảng kê đơn đã đi..." />
        ) : error ? (
          <StateBlock icon={<AlertTriangle size={22} />} title={error} />
        ) : !trips.length ? (
          <StateBlock icon={<PackageCheck size={22} />} title="Chưa có chuyến xe." />
        ) : (
          <TripKanbanBoard tripsByStatus={tripsByStatus} onOpen={(id) => navigate(`/trips/${id}`)} onExpenses={(id) => navigate(`/trips/${id}/expenses`)} />
        )}
      </section>
    </div>
  );
}

function TripKanbanBoard({
  tripsByStatus,
  onOpen,
  onExpenses,
}: {
  tripsByStatus: Record<TripKanbanStatus, Trip[]>;
  onOpen: (id: string | number) => void;
  onExpenses: (id: string | number) => void;
}) {
  return (
    <div className="h-full overflow-auto p-3 custom-scrollbar">
      <div className="grid min-h-full gap-3 xl:grid-cols-4 lg:grid-cols-2">
        {tripKanbanColumns.map((column) => (
          <KanbanColumn key={column.id} title={column.title} count={tripsByStatus[column.id].length} tone={column.tone}>
            <div className="flex flex-col gap-2">
              {tripsByStatus[column.id].length
                ? tripsByStatus[column.id].map((trip) => (
                    <TripCard key={String(trip.id)} trip={trip} onOpen={() => onOpen(trip.id)} onExpenses={() => onExpenses(trip.id)} />
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
    <section className="flex min-h-[420px] flex-col rounded-xl border border-border bg-white">
      <div className={clsx('flex items-center justify-between rounded-t-xl border-b px-3 py-2', tone)}>
        <h3 className="text-[12px] font-black">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-foreground">{count}</span>
      </div>
      <div className="flex-1 overflow-auto p-2 custom-scrollbar">{children}</div>
    </section>
  );
}

function TripCard({ trip, onOpen, onExpenses }: { trip: Trip; onOpen: () => void; onExpenses: () => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-blue-50/20">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-extrabold text-primary">Chuyến #{trip.id}</h3>
            <p className="mt-0.5 truncate text-[11px] font-bold text-emerald-700">{manifestCode(trip)}</p>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[10px]">
          <CompactCell label="BSX" value={truckPlate(trip)} />
          <CompactCell label="Tài xế" value={driverName(trip)} />
          <CompactCell label="Tuyến" value={routeLabel(trip)} className="col-span-2" />
          <CompactCell label="Khởi hành" value={formatDate(trip.departure_time)} />
          <CompactCell label="Dự kiến đến" value={formatDate(trip.expected_arrival_time || trip.arrival_time)} />
        </div>
      </button>
      <div className="mt-2 flex items-center gap-1">
        <ActionButton title="Xem chi tiết" icon={<Eye size={14} />} onClick={onOpen} />
        <ActionButton title="In bảng kê" icon={<Printer size={14} />} onClick={onOpen} />
        <ActionButton title="Chi phí" icon={<Receipt size={14} />} onClick={onExpenses} />
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

function ActionButton({ icon, title, onClick }: { icon: ReactNode; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:bg-muted hover:text-primary">{icon}</button>;
}

function StateBlock({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground"><div className="text-primary">{icon}</div><p className="text-[13px] font-bold">{title}</p></div>;
}
