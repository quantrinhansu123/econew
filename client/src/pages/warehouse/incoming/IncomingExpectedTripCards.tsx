import { CalendarClock, Eye, MapPinned, Phone, Printer, Truck, UserRound } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import type { IncomingTrip } from './types';
import {
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getManifestId,
  getPlateLabel,
  getRouteLabel,
  getTripScheduleTime,
  getTripStatusLabel,
  getTripStatusTone,
  getVehicleType,
  getVendorName,
} from './incomingTripUtils';

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa có lịch';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có lịch';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
};

export function IncomingExpectedTripCards({
  trips,
  emptyText,
  onViewManifest,
  onPrintManifest,
}: {
  trips: IncomingTrip[];
  emptyText: string;
  onViewManifest: (trip: IncomingTrip) => void;
  onPrintManifest: (trip: IncomingTrip) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sky-200 bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-sky-200 bg-sky-50 px-3 py-2.5">
        <span className="text-[13px] font-black text-sky-700">Đang chạy</span>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-[12px] font-black tabular-nums text-slate-800 shadow-sm">
          {trips.length}
        </span>
      </div>

      {trips.length === 0 ? (
        <div className="flex min-h-[220px] flex-1 items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="custom-scrollbar grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto p-3 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <IncomingExpectedTripCard
              key={trip.id}
              trip={trip}
              onViewManifest={onViewManifest}
              onPrintManifest={onPrintManifest}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function IncomingExpectedTripCard({
  trip,
  onViewManifest,
  onPrintManifest,
}: {
  trip: IncomingTrip;
  onViewManifest: (trip: IncomingTrip) => void;
  onPrintManifest: (trip: IncomingTrip) => void;
}) {
  const manifestId = getManifestId(trip);
  const driverPhone = getDriverPhone(trip);
  const vehicleType = getVehicleType(trip);
  const vendorName = getVendorName(trip);
  const vehicleInfo = [vehicleType, vendorName].filter((value) => value !== '—').join(' · ') || '—';

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-black text-primary">Chuyến #{trip.id}</h2>
          <p className="mt-1 truncate text-[11px] font-bold text-muted-foreground">Bảng kê: {getManifestCode(trip)}</p>
        </div>
        <span className={clsx('inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black', getTripStatusTone(trip))}>
          {getTripStatusLabel(trip)}
        </span>
      </div>

      <div className="mx-3.5 grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-slate-50 p-3">
        <TripInfo icon={<Truck size={13} />} label="BKS" value={getPlateLabel(trip)} />
        <TripInfo icon={<UserRound size={13} />} label="Tài xế" value={getDriverName(trip)} />
        <TripInfo
          icon={<Phone size={13} />}
          label="SĐT tài xế"
          value={driverPhone !== '—'
            ? <a href={`tel:${driverPhone.replace(/[^\d+]/g, '')}`} className="text-primary hover:underline">{driverPhone}</a>
            : '—'}
        />
        <TripInfo icon={<Truck size={13} />} label="Xe / Nhà xe" value={vehicleInfo} />
        <TripInfo className="col-span-2" icon={<MapPinned size={13} />} label="Tuyến" value={getRouteLabel(trip)} />
        <TripInfo icon={<CalendarClock size={13} />} label="Khởi hành" value={formatDateTime(trip.departure_time)} />
        <TripInfo icon={<CalendarClock size={13} />} label="Dự kiến đến" value={formatDateTime(getTripScheduleTime(trip))} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 px-3.5 py-3">
        <button
          type="button"
          aria-label={`Xem bảng kê chuyến ${trip.id}`}
          title={manifestId ? 'Xem bảng kê' : 'Chuyến chưa có bảng kê'}
          disabled={!manifestId}
          onClick={() => onViewManifest(trip)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye size={14} />
          Xem bảng kê
        </button>
        <button
          type="button"
          aria-label={`In bảng kê chuyến ${trip.id}`}
          title={manifestId ? 'In bảng kê' : 'Chuyến chưa có bảng kê'}
          disabled={!manifestId}
          onClick={() => onPrintManifest(trip)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Printer size={14} />
          In bảng kê
        </button>
      </div>
    </article>
  );
}

function TripInfo({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 break-words text-[11px] font-extrabold leading-snug text-slate-900">{value}</div>
    </div>
  );
}
