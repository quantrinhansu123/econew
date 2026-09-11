import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { IncomingTrip } from './types';
import { IncomingTripRowActions } from './IncomingTripRowActions';
import { formatMoney } from '../../../lib/formatMoney';
import InlineMoneyInput from '../../../components/ui/InlineMoneyInput';
import InlineTextInput from '../../../components/ui/InlineTextInput';
import {
  formatTripDepartureDate,
  getManifestCode,
  getPlateLabel,
  getRouteLabel,
  getTripExpenseTotal,
  getTripPayableAmount,
  getTripPaidAmount,
  getTripRevenueAmount,
  getTripWaitingPaymentDays,
  getVendorCode,
  getVendorName,
  getVendorPaymentStatusLabel,
  getVendorPaymentStatusTone,
  getVehicleType,
} from './incomingTripUtils';

const HEADERS = [
  'STT',
  'Ngày khởi hành',
  'Tuyến',
  'Mã bảng kê',
  'NCC & loại xe',
  'BKS',
  '# Chuyến',
  'Tổng cước các đơn',
  'Chi phí sau khởi hành',
  'Cước chuyến đường trục',
  'Số ngày chờ TT',
  'Ghi chú TT',
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
  canEditCost = false,
  canEditPaymentNote = false,
  onView,
  onEdit,
  onDelete,
  onPayment,
  onTripCostSave,
  onPaymentNoteSave,
}: {
  trips: IncomingTrip[];
  emptyText: string;
  showOriginColumn?: boolean;
  canDelete?: boolean;
  canPay?: boolean;
  canEditCost?: boolean;
  canEditPaymentNote?: boolean;
  onView?: (trip: IncomingTrip) => void;
  onEdit?: (trip: IncomingTrip) => void;
  onDelete?: (trip: IncomingTrip) => void;
  onPayment?: (trip: IncomingTrip) => void;
  onTripCostSave?: (trip: IncomingTrip, amount: number) => Promise<void>;
  onPaymentNoteSave?: (trip: IncomingTrip, note: string) => Promise<void>;
}) {
  void _showOriginColumn;
  const showActions = Boolean(onView && onEdit && onDelete && onPayment);
  const visibleHeaders = showActions ? HEADERS : HEADERS.filter((header) => header !== 'Thao tác');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalRailRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [railBounds, setRailBounds] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const scrollContainer = tableScrollRef.current;
    if (!scrollContainer) return undefined;

    let animationFrame = 0;
    const measure = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const scrollWidth = scrollContainer.scrollWidth;
        const isOverflowing = scrollWidth > scrollContainer.clientWidth + 1;
        const rect = scrollContainer.getBoundingClientRect();
        const left = Math.max(0, Math.round(rect.left));
        const right = Math.min(window.innerWidth, Math.round(rect.right));
        const width = Math.max(0, right - left);

        setTableScrollWidth((previous) => (previous === scrollWidth ? previous : scrollWidth));
        setRailBounds((previous) => {
          if (!isOverflowing || width <= 0) return previous === null ? previous : null;
          if (previous && previous.left === left && previous.width === width) return previous;
          return { left, width };
        });
      });
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(scrollContainer);
    const table = scrollContainer.querySelector('table');
    if (table) observer?.observe(table);
    window.addEventListener('resize', measure);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [showActions, trips.length, visibleHeaders.length]);

  useEffect(() => {
    const scrollContainer = tableScrollRef.current;
    const horizontalRail = horizontalRailRef.current;
    if (!scrollContainer || !horizontalRail || tableScrollWidth <= scrollContainer.clientWidth + 1) return undefined;

    const syncFromTable = () => {
      if (Math.abs(horizontalRail.scrollLeft - scrollContainer.scrollLeft) > 1) {
        horizontalRail.scrollLeft = scrollContainer.scrollLeft;
      }
    };
    const syncFromRail = () => {
      if (Math.abs(scrollContainer.scrollLeft - horizontalRail.scrollLeft) > 1) {
        scrollContainer.scrollLeft = horizontalRail.scrollLeft;
      }
    };

    scrollContainer.addEventListener('scroll', syncFromTable, { passive: true });
    horizontalRail.addEventListener('scroll', syncFromRail, { passive: true });
    syncFromTable();

    return () => {
      scrollContainer.removeEventListener('scroll', syncFromTable);
      horizontalRail.removeEventListener('scroll', syncFromRail);
    };
  }, [tableScrollWidth]);

  const showHorizontalRail = Boolean(railBounds && tableScrollWidth > railBounds.width + 1);

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto custom-scrollbar md:pb-5">
        {trips.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-4 py-8 text-center text-[12px] font-medium text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <>
            <table className="hidden w-full min-w-[1840px] border-collapse text-left md:table">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                {visibleHeaders.map((header) => (
                  <th
                    key={header}
                    className={clsx(
                      'whitespace-nowrap border-r border-border/60 px-3 py-3 align-middle last:border-r-0',
                      header === 'STT' && 'w-[56px] text-center',
                      header === '# Chuyến' && 'min-w-[90px] text-center',
                      ['Tổng cước các đơn', 'Chi phí sau khởi hành', 'Cước chuyến đường trục'].includes(header) && 'min-w-[160px] text-right',
                      header === 'Số ngày chờ TT' && 'min-w-[112px] text-center',
                      header === 'Ghi chú TT' && 'min-w-[190px]',
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
                const waitingDays = getTripWaitingPaymentDays(trip);
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
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <button type="button" onClick={() => onView?.(trip)} className="font-extrabold text-primary hover:underline">
                        #{trip.id}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-foreground">
                      {formatMoney(getTripRevenueAmount(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-amber-700">
                      {formatMoney(getTripExpenseTotal(trip))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-foreground">
                      <InlineMoneyInput
                        value={getTripPayableAmount(trip)}
                        editable={Boolean(canEditCost && onTripCostSave)}
                        label={`Cước chuyến đường trục #${trip.id}`}
                        onSave={(amount) => onTripCostSave?.(trip, amount) ?? Promise.resolve()}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center font-extrabold tabular-nums text-foreground">
                      {waitingDays == null ? '—' : `${waitingDays} ngày`}
                    </td>
                    <td className="px-2 py-2.5">
                      <InlineTextInput
                        value={trip.vendor_payment_note}
                        editable={Boolean(canEditPaymentNote && onPaymentNoteSave)}
                        label={`Ghi chú thanh toán chuyến #${trip.id}`}
                        placeholder="Nhập ghi chú TT..."
                        onSave={(note) => onPaymentNoteSave?.(trip, note) ?? Promise.resolve()}
                      />
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
            <div className="grid gap-3 p-2 md:hidden">
              {trips.map((trip, index) => (
                <IncomingTripMobileCard
                  key={trip.id}
                  trip={trip}
                  index={index}
                  canEditPaymentNote={canEditPaymentNote}
                  onPaymentNoteSave={onPaymentNoteSave}
                  onView={onView}
                  onPayment={onPayment}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {showHorizontalRail && railBounds && (
        <div
          ref={horizontalRailRef}
          className="fixed bottom-2 z-40 hidden h-4 overflow-x-auto overflow-y-hidden rounded border border-slate-300 bg-slate-100 shadow-md custom-scrollbar md:block"
          style={{ left: railBounds.left, width: railBounds.width }}
          aria-label="Cuộn ngang danh sách chuyến xe"
        >
          <div style={{ width: tableScrollWidth, height: 1 }} />
        </div>
      )}
    </section>
  );
}

function IncomingTripMobileCard({
  trip,
  index,
  canEditPaymentNote,
  onPaymentNoteSave,
  onView,
  onPayment,
}: {
  trip: IncomingTrip;
  index: number;
  canEditPaymentNote: boolean;
  onPaymentNoteSave?: (trip: IncomingTrip, note: string) => Promise<void>;
  onView?: (trip: IncomingTrip) => void;
  onPayment?: (trip: IncomingTrip) => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => onView?.(trip)} className="text-left text-[13px] font-extrabold text-primary hover:underline">
            #{trip.id} · {getManifestCode(trip)}
          </button>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">{getRouteLabel(trip)} · {getPlateLabel(trip)}</p>
        </div>
        <span className={clsx('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold', getVendorPaymentStatusTone(trip))}>
          {getVendorPaymentStatusLabel(trip)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-muted/20 px-2.5 py-2"><p className="font-bold uppercase text-muted-foreground">NCC</p><p className="mt-0.5 truncate font-extrabold">{getVendorName(trip)}</p></div>
        <div className="rounded-lg bg-muted/20 px-2.5 py-2"><p className="font-bold uppercase text-muted-foreground">Cước phải trả</p><p className="mt-0.5 font-extrabold tabular-nums">{formatMoney(getTripPayableAmount(trip))}</p></div>
        <div className="rounded-lg bg-muted/20 px-2.5 py-2"><p className="font-bold uppercase text-muted-foreground">Đã trả / còn</p><p className="mt-0.5 font-extrabold tabular-nums">{formatMoney(getTripPaidAmount(trip))} / {formatMoney(Math.max(0, getTripPayableAmount(trip) - getTripPaidAmount(trip)))}</p></div>
        <div className="rounded-lg bg-muted/20 px-2.5 py-2"><p className="font-bold uppercase text-muted-foreground">Ngày chờ TT</p><p className="mt-0.5 font-extrabold">{getTripWaitingPaymentDays(trip) == null ? '—' : `${getTripWaitingPaymentDays(trip)} ngày`}</p></div>
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú TT</p>
        <InlineTextInput
          value={trip.vendor_payment_note}
          editable={Boolean(canEditPaymentNote && onPaymentNoteSave)}
          label={`Ghi chú thanh toán chuyến #${trip.id}`}
          placeholder="Nhập ghi chú TT..."
          onSave={(note) => onPaymentNoteSave?.(trip, note) ?? Promise.resolve()}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[10px] font-semibold text-muted-foreground">STT {index + 1}</span>
        {onPayment && <button type="button" onClick={() => onPayment(trip)} className="h-8 rounded-lg bg-emerald-600 px-3 text-[11px] font-extrabold text-white">Thanh toán</button>}
      </div>
    </article>
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
