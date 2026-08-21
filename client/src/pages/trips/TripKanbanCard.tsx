import type { ReactNode } from 'react';
import { CheckCircle2, Eye, Pencil, Printer, Receipt, Trash2, Truck, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { formatMoney } from '../../lib/formatMoney';
import type { Trip } from './types';
import { getPrimaryTripAction, getTripDeleteDisabledReason } from './tripKanbanUtils';

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

const truckPlate = (trip: Trip) => trip.manual_license_plate?.trim()
  || trip.truck?.bks?.trim()
  || trip.truck?.license_plate?.trim()
  || (trip.truck_id ? `Xe #${trip.truck_id}` : 'Chưa có BKS');

const vendorName = (trip: Trip) => trip.vendor?.name?.trim()
  || trip.vendor?.code?.trim()
  || trip.truck?.vendor?.name?.trim()
  || trip.truck?.nha_xe?.trim()
  || 'Chưa có NCC';

const driverName = (trip: Trip) => trip.driver_name || trip.truck?.ten_lai_xe || 'Chưa có tài xế';
const manifestCode = (trip: Trip) => trip.manifest?.manifest_code || (trip.manifest_id ? `BK #${trip.manifest_id}` : '—');
const routeLabel = (trip: Trip) => trip.route_label || `${trip.start_hub?.code || trip.start_hub_id || '—'} → ${trip.end_hub?.code || trip.end_hub_id || '—'}`;

const primaryActionLabel = (status?: string | null) => {
  if (status === 'PLANNED') return 'Bấm khởi hành';
  if (status === 'IN_TRANSIT') return 'Xác nhận đến hub';
  if (status === 'ARRIVED') return 'Hoàn tất chuyến';
  return 'Chuyến đã hoàn tất';
};

interface TripKanbanCardProps {
  trip: Trip;
  onOpen: () => void;
  onEdit: () => void;
  onPrint?: () => void;
  onExpenses: () => void;
  onPrimaryAction: () => void;
  onCancelAction: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}

export function TripKanbanCard({
  trip,
  onOpen,
  onEdit,
  onPrint,
  onExpenses,
  onPrimaryAction,
  onCancelAction,
  canDelete = false,
  onDelete,
}: TripKanbanCardProps) {
  const primaryAction = getPrimaryTripAction(trip.status);
  const deleteDisabledReason = getTripDeleteDisabledReason(trip);
  const routeStops = trip.route_stops ?? [];
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-blue-50/20">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-extrabold text-primary">Chuyến #{trip.id}</h3>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
              <p className="truncate text-[11px] font-bold text-emerald-700">{manifestCode(trip)}</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[13px] font-black tracking-wide text-blue-950">
                <span className="text-[9px] uppercase text-blue-600">BKS</span>
                {truckPlate(trip)}
              </span>
            </div>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-md bg-slate-50 px-1.5 py-1 text-[10px]">
          <CompactCell label="Tài xế" value={driverName(trip)} />
          <ProminentCell label="NCC" value={vendorName(trip)} />
          <CompactCell label="Cước xe" value={formatMoney(trip.trip_cost)} />
          <CompactCell label="Tuyến" value={routeLabel(trip)} />
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
        {trip.delivery_summary && trip.delivery_summary.total_waybills > 0 && (
          trip.status === 'COMPLETED' ? (
            <div className="mt-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-800">
              Hoàn thành: {trip.delivery_summary.completed_waybills.toLocaleString('vi-VN')} đơn
            </div>
          ) : (
            <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[10px] font-black">
              <DeliveryCount className="border-blue-200 bg-blue-50 text-blue-800" label="Đã xử lý" value={trip.delivery_summary.processed_waybills} />
              <DeliveryCount className="border-emerald-200 bg-emerald-50 text-emerald-800" label="Giao thành công" value={trip.delivery_summary.delivered_waybills} />
              <DeliveryCount className="border-amber-200 bg-amber-50 text-amber-800" label="Chưa giao" value={trip.delivery_summary.pending_delivery_waybills} />
            </div>
          )
        )}
      </button>
      <div className="mt-1 flex items-center gap-1 border-t border-slate-100 pt-1">
        <ActionButton title="Xem chi tiết" icon={<Eye size={14} />} onClick={onOpen} />
        <ActionButton title={onPrint ? 'Xem / In bảng kê theo HUB đến' : 'Chuyến chưa có bảng kê'} icon={<Printer size={14} />} onClick={onPrint} disabled={!onPrint} />
        <ActionButton title="Chi phí" icon={<Receipt size={14} />} onClick={onExpenses} />
        <ActionButton title="Sửa bảng kê" icon={<Pencil size={14} />} onClick={onEdit} disabled={!trip.manifest_id || trip.status === 'CANCELLED'} />
        <ActionButton title={primaryActionLabel(trip.status)} icon={primaryAction ? <Truck size={14} /> : <CheckCircle2 size={14} />} onClick={primaryAction ? onPrimaryAction : undefined} disabled={!primaryAction} />
        {trip.status === 'PLANNED' && <ActionButton title="Hủy chuyến và trả đơn về tồn kho" icon={<XCircle size={14} />} onClick={onCancelAction} danger />}
        {canDelete && onDelete && <ActionButton title={deleteDisabledReason || 'Xóa chuyến'} icon={<Trash2 size={14} />} onClick={deleteDisabledReason ? undefined : onDelete} disabled={Boolean(deleteDisabledReason)} danger />}
      </div>
    </article>
  );
}

function DeliveryCount({ className, label, value }: { className: string; label: string; value: number }) {
  return <div className={clsx('min-w-0 rounded-md border px-1 py-1', className)}><p className="truncate">{label}</p><p className="text-[13px] leading-tight">{value.toLocaleString('vi-VN')}</p></div>;
}

function ProminentCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5">
      <p className="text-[10px] font-black uppercase tracking-wide text-violet-600">{label}</p>
      <p className="truncate text-[13px] font-black tracking-wide text-violet-950">{value}</p>
    </div>
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
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={clsx('inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white disabled:cursor-not-allowed disabled:opacity-35', danger ? 'border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700' : 'border-border text-muted-foreground hover:bg-muted hover:text-primary')}>{icon}</button>;
}
