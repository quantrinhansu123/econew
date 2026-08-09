import { clsx } from 'clsx';
import type { IncomingTrip } from './types';
import { IncomingTripRowActions } from './IncomingTripRowActions';
import { formatMoney } from '../../../lib/formatMoney';
import {
  formatNumber,
  formatTripDepartureDate,
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getPlateLabel,
  getRouteLabel,
  getTotalVolume,
  getTotalWeight,
  getTripProvisionalProfit,
  getTripWaitingPaymentDays,
  getVendorCode,
  getVendorName,
  getVendorPaymentStatusLabel,
  getVendorPaymentStatusTone,
  getVehicleType,
  getWaybillCount,
} from './incomingTripUtils';

const HEADERS = [
  'STT',
  'Ngày khởi hành',
  'Tuyến',
  'Mã bảng kê',
  'NCC & loại xe',
  'BKS',
  'Đơn / trọng lượng / CBM',
  'Tài xế và SĐT',
  'Lợi nhuận sơ bộ',
  'Số ngày chờ TT',
  'Trạng thái thanh toán',
  'Thao tác',
] as const;

const detailLineClass = 'mt-0.5 text-[11px] font-semibold text-muted-foreground';

export function IncomingTripTable({
  trips,
  emptyText,
  showOriginColumn: _showOriginColumn = true,
  canDelete = false,
  canPay = false,
  onView,
  onEdit,
  onDelete,
  onPayment,
}: {
  trips: IncomingTrip[];
  emptyText: string;
  showOriginColumn?: boolean;
  canDelete?: boolean;
  canPay?: boolean;
  onView?: (trip: IncomingTrip) => void;
  onEdit?: (trip: IncomingTrip) => void;
  onDelete?: (trip: IncomingTrip) => void;
  onPayment?: (trip: IncomingTrip) => void;
}) {
  void _showOriginColumn;
  const showActions = Boolean(onView && onEdit && onDelete && onPayment);
  const visibleHeaders = showActions ? HEADERS : HEADERS.filter((header) => header !== 'Thao tác');

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        {trips.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <table className="w-full min-w-[1540px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                {visibleHeaders.map((header) => (
                  <th
                    key={header}
                    className={clsx(
                      'whitespace-nowrap border-r border-border/60 px-3 py-3 align-middle last:border-r-0',
                      header === 'STT' && 'w-[56px] text-center',
                      header === 'Đơn / trọng lượng / CBM' && 'min-w-[170px] text-right',
                      header === 'Lợi nhuận sơ bộ' && 'min-w-[130px] text-right',
                      header === 'Số ngày chờ TT' && 'min-w-[112px] text-center',
                      header === 'Trạng thái thanh toán' && 'min-w-[150px] text-center',
                      header === 'Thao tác' && 'w-[76px] text-center',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[12px]">
              {trips.map((trip, index) => {
                const departure = formatTripDepartureDate(trip);
                const vendorCode = getVendorCode(trip);
                const vendorName = getVendorName(trip);
                const driverName = getDriverName(trip);
                const driverPhone = getDriverPhone(trip);
                const waitingDays = getTripWaitingPaymentDays(trip);
                const profit = getTripProvisionalProfit(trip);
                return (
                  <tr key={trip.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-foreground">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="font-extrabold tabular-nums text-primary">{departure.day}</div>
                      <div className={detailLineClass}>{departure.time || '—'}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-foreground">{getRouteLabel(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-extrabold text-foreground">{getManifestCode(trip)}</td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <div className="truncate font-extrabold text-primary" title={vendorCode || vendorName}>{vendorCode || vendorName}</div>
                      <div className={`${detailLineClass} truncate`} title={[vendorName, getVehicleType(trip)].filter((value) => value && value !== '—').join(' · ')}>
                        {[vendorName, getVehicleType(trip)].filter((value) => value && value !== '—' && value !== vendorCode).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-extrabold text-foreground">{getPlateLabel(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      <div className="font-extrabold text-foreground">{Number(getWaybillCount(trip)).toLocaleString('vi-VN')} đơn</div>
                      <div className={detailLineClass}>{formatNumber(getTotalWeight(trip))} kg · {formatNumber(getTotalVolume(trip), 2)} m³</div>
                    </td>
                    <td className="max-w-[190px] px-3 py-2.5">
                      <div className="truncate font-extrabold text-foreground" title={driverName}>{driverName}</div>
                      <div className={detailLineClass}>
                        {driverPhone !== '—' ? <a href={`tel:${driverPhone}`} className="text-primary hover:underline">{driverPhone}</a> : '—'}
                      </div>
                    </td>
                    <td className={clsx('whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums', profit < 0 ? 'text-red-600' : 'text-emerald-700')}>
                      {formatMoney(profit)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center font-extrabold tabular-nums text-foreground">
                      {waitingDays == null ? '—' : `${waitingDays} ngày`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <span className={clsx('inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-tight whitespace-nowrap', getVendorPaymentStatusTone(trip))}>
                        {getVendorPaymentStatusLabel(trip)}
                      </span>
                    </td>
                    {showActions && (
                      <td className="px-2 py-2.5">
                        <IncomingTripRowActions
                          trip={trip}
                          canDelete={canDelete}
                          canPay={canPay}
                          onView={onView!}
                          onEdit={onEdit!}
                          onDelete={onDelete!}
                          onPayment={onPayment!}
                        />
                      </td>
                    )}
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
    <div className="flex flex-1 min-h-[240px] items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/20 text-primary">
          {icon}
        </div>
        <h2 className="text-[14px] font-extrabold text-foreground">{title}</h2>
      </div>
    </div>
  );
}
