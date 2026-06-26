import { clsx } from 'clsx';
import type { IncomingTrip } from './types';
import {
  formatTripSubline,
  getManifestCode,
  getRouteLabel,
  getTripStatusLabel,
  getTripStatusTone,
} from './incomingTripUtils';

export function IncomingTripTable({
  title,
  count,
  tone,
  emptyText,
  trips,
}: {
  title: string;
  count: number;
  tone: string;
  emptyText: string;
  trips: IncomingTrip[];
}) {
  return (
    <section className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 shrink-0">
        <h2 className="text-[13px] font-extrabold text-foreground">{title}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${tone}`}>{count}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {trips.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-extrabold">Chuyến xe</th>
                <th className="w-[96px] px-2 py-2 text-right font-extrabold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="border-b border-border/70 last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2 align-middle">
                    <p className="truncate text-[13px] font-extrabold text-foreground">
                      {getManifestCode(trip)} · {getRouteLabel(trip)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                      {formatTripSubline(trip)}
                    </p>
                  </td>
                  <td className="w-[96px] px-2 py-2 align-middle text-right">
                    <span className={clsx('inline-flex max-w-full items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-tight', getTripStatusTone(trip))}>
                      {getTripStatusLabel(trip)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function IncomingStateBlock({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-1 min-h-[320px] items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/20 text-primary">
          {icon}
        </div>
        <h2 className="text-[14px] font-extrabold text-foreground">{title}</h2>
      </div>
    </div>
  );
}
