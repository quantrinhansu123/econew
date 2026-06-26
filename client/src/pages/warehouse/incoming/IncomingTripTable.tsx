import { clsx } from 'clsx';
import type { IncomingTrip } from './types';
import {
  formatTripArrivalDate,
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getPlateLabel,
  getRouteLabel,
  getTripStatusLabel,
  getTripStatusTone,
  getVehicleType,
  getVendorName,
  getWaybillCount,
  formatNumber,
  getTotalWeight,
  isArrivedTrip,
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
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-white">
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
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-border text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                <th className="w-[88px] px-2 py-2">Ngày đến</th>
                <th className="px-2 py-2">Chuyến xe</th>
                <th className="w-[88px] px-2 py-2 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => {
                const arrival = formatTripArrivalDate(trip);
                const arrived = isArrivedTrip(trip);
                return (
                  <tr key={trip.id} className="border-b border-border/70 last:border-b-0 align-top hover:bg-muted/20">
                    <td className="px-2 py-2.5 align-top">
                      <p className="text-[18px] font-black leading-none text-primary tabular-nums">{arrival.day}</p>
                      <p className="mt-1 text-[12px] font-extrabold text-foreground tabular-nums">{arrival.time || '—'}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                        {arrived ? 'Đã đến' : 'Dự kiến'}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <p className="text-[13px] font-extrabold text-foreground">
                        {getManifestCode(trip)} · {getRouteLabel(trip)}
                      </p>
                      <p className="mt-1 text-[11px] font-bold text-slate-700">
                        BKS: <span className="font-extrabold text-foreground">{getPlateLabel(trip)}</span>
                        {' · '}
                        {getWaybillCount(trip).toLocaleString('vi-VN')} đơn · {formatNumber(getTotalWeight(trip))} kg
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
                        Tài xế: <span className="font-bold text-foreground">{getDriverName(trip)}</span>
                        {' · '}
                        SĐT:{' '}
                        {getDriverPhone(trip) !== '—' ? (
                          <a href={`tel:${getDriverPhone(trip)}`} className="font-extrabold text-primary hover:underline">{getDriverPhone(trip)}</a>
                        ) : (
                          <span className="font-extrabold text-foreground">—</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                        Nhà CC: <span className="font-bold text-foreground">{getVendorName(trip)}</span>
                        {' · '}
                        Loại xe: <span className="font-bold text-foreground">{getVehicleType(trip)}</span>
                      </p>
                    </td>
                    <td className="w-[88px] px-2 py-2.5 align-top text-right">
                      <span className={clsx('inline-flex max-w-full items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-tight', getTripStatusTone(trip))}>
                        {getTripStatusLabel(trip)}
                      </span>
                    </td>
                  </tr>
                );
              })}
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
