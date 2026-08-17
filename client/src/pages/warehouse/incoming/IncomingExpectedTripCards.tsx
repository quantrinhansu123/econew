import { TripKanbanCard } from '../../trips/TripKanbanCard';
import type { IncomingTrip } from './types';
import { groupIncomingTripsByMainHub } from './incomingTripHubUtils';

interface IncomingExpectedTripCardsProps {
  trips: IncomingTrip[];
  emptyText: string;
  onOpen: (trip: IncomingTrip) => void;
  onEdit: (trip: IncomingTrip) => void;
  onPrint: (trip: IncomingTrip) => void;
  onExpenses: (trip: IncomingTrip) => void;
  onPrimaryAction: (trip: IncomingTrip) => void;
}

export function IncomingExpectedTripCards({
  trips,
  emptyText,
  onOpen,
  onEdit,
  onPrint,
  onExpenses,
  onPrimaryAction,
}: IncomingExpectedTripCardsProps) {
  const grouped = groupIncomingTripsByMainHub(trips);

  return (
    <div className="grid min-h-[420px] flex-1 grid-cols-1 gap-2 lg:min-h-0 lg:grid-cols-2">
      <IncomingHubColumn
        title="Xe đang đến HCM"
        trips={grouped.HCM}
        emptyText="Hiện chưa có xe đang chạy đến HUB HCM."
        onOpen={onOpen}
        onEdit={onEdit}
        onPrint={onPrint}
        onExpenses={onExpenses}
        onPrimaryAction={onPrimaryAction}
      />
      <IncomingHubColumn
        title="Xe đang đến Hà Nội"
        trips={grouped.HAN}
        emptyText="Hiện chưa có xe đang chạy đến HUB Hà Nội."
        onOpen={onOpen}
        onEdit={onEdit}
        onPrint={onPrint}
        onExpenses={onExpenses}
        onPrimaryAction={onPrimaryAction}
      />
      {!grouped.HCM.length && !grouped.HAN.length && trips.length > 0 ? (
        <p className="sr-only">{emptyText}</p>
      ) : null}
    </div>
  );
}

function IncomingHubColumn({
  title,
  trips,
  emptyText,
  onOpen,
  onEdit,
  onPrint,
  onExpenses,
  onPrimaryAction,
}: Omit<IncomingExpectedTripCardsProps, 'emptyText'> & { title: string; emptyText: string }) {
  return (
    <section className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-sky-200 bg-white lg:min-h-0">
      <div className="flex shrink-0 items-center justify-between border-b border-sky-200 bg-sky-50 px-3 py-2.5">
        <span className="text-[13px] font-black text-sky-700">{title}</span>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-[12px] font-black tabular-nums text-slate-800 shadow-sm">
          {trips.length.toLocaleString('vi-VN')}
        </span>
      </div>

      {trips.length === 0 ? (
        <div className="flex min-h-[220px] flex-1 items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="custom-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
          {trips.map((trip) => (
            <TripKanbanCard
              key={String(trip.id)}
              trip={trip}
              onOpen={() => onOpen(trip)}
              onEdit={() => onEdit(trip)}
              onPrint={trip.manifest_id ? () => onPrint(trip) : undefined}
              onExpenses={() => onExpenses(trip)}
              onPrimaryAction={() => onPrimaryAction(trip)}
              onCancelAction={() => undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
