import { clsx } from 'clsx';
import type { IncomingTrip } from './types';
import { IncomingTripRowActions } from './IncomingTripRowActions';
import { formatMoney } from '../../../lib/formatMoney';
import {
  formatTripArrivalDate,
  getDriverCollectedAmount,
  getDriverName,
  getDriverPhone,
  getManifestCode,
  getOriginHub,
  getPaymentNote,
  getPlateLabel,
  getRouteLabel,
  getTripOtherCosts,
  getTripPaidAmount,
  getTripPayableAmount,
  getTripReceivableAmount,
  getTripStatusLabel,
  getTripStatusTone,
  getVendorPaymentStatusLabel,
  getVendorPaymentStatusTone,
  getVehicleType,
  getVendorName,
  getWaybillCount,
  formatNumber,
  getTotalWeight,
} from './incomingTripUtils';

const BASE_HEADERS_BEFORE_PAYABLE = [
  'Ngày đến',
  'Giờ',
  'Xuất phát',
  'Bảng kê',
  'Tuyến',
  'BKS',
  'Đơn',
  'Kg',
  'Tài xế',
  'SĐT',
  'Nhà CC',
  'Loại xe',
] as const;

const PAYABLE_SUB_HEADERS = ['Phải trả', 'Bồi P trả', 'Phí khác'] as const;

const BASE_HEADERS_AFTER_PAYABLE = [
  'Phải thu',
  'Lái xe đã thu',
  'Ghi chú',
  'Trạng thái thanh toán',
  'Trạng thái',
  'Thao tác',
] as const;

const formatMoneyCell = (value: number) => (
  value > 0 ? formatMoney(value, { empty: '—' }) : '—'
);

export function IncomingTripTable({
  trips,
  emptyText,
  showOriginColumn = true,
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
  const showActions = Boolean(onView && onEdit && onDelete && onPayment);
  const headersBefore = showOriginColumn
    ? BASE_HEADERS_BEFORE_PAYABLE
    : BASE_HEADERS_BEFORE_PAYABLE.filter((header) => header !== 'Xuất phát');
  const headersAfter = showActions
    ? BASE_HEADERS_AFTER_PAYABLE
    : BASE_HEADERS_AFTER_PAYABLE.filter((header) => header !== 'Thao tác');

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        {trips.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <table className="w-full min-w-[2120px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                {headersBefore.map((header) => (
                  <th key={header} rowSpan={2} className="whitespace-nowrap border-r border-border/60 px-3 py-2.5 align-middle">
                    {header}
                  </th>
                ))}
                <th colSpan={3} className="border-b border-r border-border/60 px-3 py-2 text-center">
                  Tổng phải trả
                </th>
                {headersAfter.map((header) => (
                  <th
                    key={header}
                    rowSpan={2}
                    className={clsx(
                      'whitespace-nowrap px-3 py-2.5 align-middle',
                      header === 'Phải thu' && 'text-right min-w-[108px]',
                      header === 'Lái xe đã thu' && 'text-right min-w-[108px]',
                      header === 'Ghi chú' && 'w-[120px] max-w-[120px] text-red-600',
                      header === 'Trạng thái thanh toán' && 'text-center min-w-[108px]',
                      header === 'Trạng thái' && 'text-center',
                      header === 'Thao tác' && 'text-center min-w-[72px]',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                {PAYABLE_SUB_HEADERS.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap border-r border-border/60 px-3 py-2 text-right last:border-r-0"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[12px]">
              {trips.map((trip) => {
                const arrival = formatTripArrivalDate(trip);
                const driverPhone = getDriverPhone(trip);
                const paymentNote = getPaymentNote(trip);
                return (
                  <tr key={trip.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-2 font-extrabold tabular-nums text-primary">{arrival.day}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-bold tabular-nums text-muted-foreground">{arrival.time || '—'}</td>
                    {showOriginColumn && (
                      <td className="whitespace-nowrap px-3 py-2 font-bold text-foreground">{getOriginHub(trip)}</td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 font-extrabold text-foreground">{getManifestCode(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">{getRouteLabel(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-extrabold text-foreground">{getPlateLabel(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{getWaybillCount(trip).toLocaleString('vi-VN')}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{formatNumber(getTotalWeight(trip))}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-semibold text-foreground" title={getDriverName(trip)}>{getDriverName(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {driverPhone !== '—' ? (
                        <a href={`tel:${driverPhone}`} className="font-extrabold text-primary hover:underline">{driverPhone}</a>
                      ) : (
                        <span className="font-bold text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-semibold text-foreground" title={getVendorName(trip)}>{getVendorName(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground">{getVehicleType(trip)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums text-foreground">
                      {formatMoneyCell(getTripPayableAmount(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums text-emerald-700">
                      {formatMoneyCell(getTripPaidAmount(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-muted-foreground">
                      {formatMoneyCell(getTripOtherCosts(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums text-sky-700">
                      {formatMoneyCell(getTripReceivableAmount(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums text-emerald-700">
                      {formatMoneyCell(getDriverCollectedAmount(trip))}
                    </td>
                    <td className="w-[120px] max-w-[120px] px-2 py-2 text-[12px] font-medium text-foreground" title={paymentNote || undefined}>
                      <span className="line-clamp-2 break-words">{paymentNote || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      <span className={clsx('inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-tight whitespace-nowrap', getVendorPaymentStatusTone(trip))}>
                        {getVendorPaymentStatusLabel(trip)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      <span className={clsx('inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold leading-tight', getTripStatusTone(trip))}>
                        {getTripStatusLabel(trip)}
                      </span>
                    </td>
                    {showActions && (
                      <td className="px-2 py-2">
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
