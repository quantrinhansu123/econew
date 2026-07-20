import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { AlertTriangle, Building2, ExternalLink, Loader2, Printer, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../../lib/api';
import type { AllocationBoardItem, AllocationBoardResponse, AllocationBoardTrip, HubSummary, WaybillInventoryItem } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  waybill: WaybillInventoryItem | null;
  onClose: () => void;
}

const displayCode = (waybill: WaybillInventoryItem | null) =>
  waybill?.waybill_code || waybill?.code || (waybill ? `#${waybill.id}` : '');

const tripStatusLabel: Record<string, string> = {
  PLANNED: 'Chờ xuất',
  IN_TRANSIT: 'Đang chạy',
  ARRIVED: 'Đã đến',
};

const hubLabel = (hub?: HubSummary | null, fallbackId?: string | number | null) => {
  const code = String(hub?.code || '').trim();
  const name = String(hub?.name || '').trim();
  if (code && name && code.toLocaleLowerCase('vi') !== name.toLocaleLowerCase('vi')) {
    return `${code} · ${name}`;
  }
  return code || name || (fallbackId ? `#${fallbackId}` : 'Chưa xác định');
};

const hubCode = (hub?: HubSummary | null, fallbackId?: string | number | null) =>
  String(hub?.code || hub?.name || (fallbackId ? `#${fallbackId}` : '')).trim();

function groupTripsByDestination(trips: AllocationBoardTrip[]) {
  const groups = new Map<string, { key: string; hub: HubSummary | null; fallbackId: string | number | null; trips: AllocationBoardTrip[] }>();
  for (const trip of trips) {
    const fallbackId = trip.end_hub_id ?? null;
    const canonicalId = trip.end_hub?.id ?? fallbackId;
    const code = String(trip.end_hub?.code || '').trim().toLocaleLowerCase('vi');
    const name = String(trip.end_hub?.name || '').trim().toLocaleLowerCase('vi');
    const key = canonicalId != null && canonicalId !== ''
      ? `id:${canonicalId}`
      : code
        ? `code:${code}`
        : name
          ? `name:${name}`
          : 'unknown';
    const existing = groups.get(key);
    if (existing) existing.trips.push(trip);
    else groups.set(key, { key, hub: trip.end_hub ?? null, fallbackId, trips: [trip] });
  }
  return [...groups.values()].sort((left, right) =>
    hubLabel(left.hub, left.fallbackId).localeCompare(hubLabel(right.hub, right.fallbackId), 'vi'),
  );
}

export default function SplitOrderDialog({ isOpen, isClosing, waybill, onClose }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<AllocationBoardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setIsLoading(true);
    setError('');
    setData(null);

    const params = new URLSearchParams({ limit: '50' });
    const endHubId = waybill?.dest_hub_id ?? waybill?.current_hub_id ?? waybill?.origin_hub_id;
    if (endHubId) params.set('end_hub_id', String(endHubId));
    if (waybill?.id) params.set('waybill_id', String(waybill.id));

    apiRequest<AllocationBoardResponse>(`/trips/allocation-board?${params}`)
      .then((response) => {
        if (mounted) setData(response);
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof ApiError ? err.message : 'Không tải được bảng chia đơn.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, waybill?.id, waybill?.dest_hub_id, waybill?.current_hub_id, waybill?.origin_hub_id]);

  const destinationGroups = useMemo(() => groupTripsByDestination(data?.trips ?? []), [data?.trips]);

  if (!isOpen && !isClosing) return null;

  const placement = data?.waybill_placement;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className={clsx('absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity', isClosing ? 'opacity-0' : 'opacity-100')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative z-10 flex max-h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl transition-all duration-200 sm:rounded-[28px]',
          isClosing ? 'translate-y-6 opacity-0 sm:scale-95' : 'translate-y-0 opacity-100 sm:scale-100',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-black uppercase tracking-wide text-foreground">Bảng kê phát hàng ECO</h2>
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">
              {waybill ? `Chia đơn · ${displayCode(waybill)}` : 'Tách riêng từng bảng kê theo HUB đến'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar p-4 sm:p-5 space-y-5">
          {isLoading ? (
            <div className="flex min-h-[280px] items-center justify-center text-primary">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : (
            <>
              {waybill && (
                <div
                  className={clsx(
                    'rounded-xl border px-4 py-3 text-[13px]',
                    placement
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900',
                  )}
                >
                  {placement ? (
                    <p className="font-bold">
                      Vị trí hàng <span className="text-primary">#{placement.loading_position}</span>
                      {' · '}Xe <span className="text-primary">{placement.license_plate || `#${placement.trip_id}`}</span>
                      {placement.manifest_code ? ` · BK ${placement.manifest_code}` : ''}
                    </p>
                  ) : (
                    <p className="font-bold">Đơn chưa ghép chuyến — xem bảng kê các xe bên dưới.</p>
                  )}
                </div>
              )}

              {!destinationGroups.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center text-[13px] font-medium text-muted-foreground">
                  Chưa có chuyến xe có bảng kê phù hợp hub đích.
                </div>
              ) : (
                destinationGroups.map((group) => (
                  <DestinationHubSection
                    key={group.key}
                    hub={group.hub}
                    fallbackId={group.fallbackId}
                    trips={group.trips}
                    onOpenSequence={(tripId) => navigate(`/trips/${tripId}/loading-sequence`)}
                    onPrintManifest={(manifestId) => window.open(`/print/manifest/${encodeURIComponent(String(manifestId))}`, '_blank', 'noopener')}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DestinationHubSection({
  hub,
  fallbackId,
  trips,
  onOpenSequence,
  onPrintManifest,
}: {
  hub: HubSummary | null;
  fallbackId: string | number | null;
  trips: AllocationBoardTrip[];
  onOpenSequence: (tripId: string | number) => void;
  onPrintManifest: (manifestId: string | number) => void;
}) {
  const rowCount = trips.reduce((total, trip) => total + trip.items.length, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-blue-50/30 shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-primary/15 bg-blue-50 px-4 py-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
          <Building2 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">HUB đến</p>
          <h3 className="truncate text-[15px] font-black text-slate-950">{hubLabel(hub, fallbackId)}</h3>
        </div>
        <div className="rounded-lg border border-primary/15 bg-white px-3 py-1.5 text-right">
          <p className="text-[12px] font-black text-slate-900">{trips.length} bảng kê</p>
          <p className="text-[10px] font-bold text-muted-foreground">{rowCount} dòng hàng</p>
        </div>
      </header>
      <div className="space-y-3 p-3">
        {trips.map((trip) => (
          <DispatchTripTable
            key={String(trip.trip_id)}
            trip={trip}
            onOpenSequence={onOpenSequence}
            onPrintManifest={onPrintManifest}
          />
        ))}
      </div>
    </section>
  );
}

function DispatchTripTable({
  trip,
  onOpenSequence,
  onPrintManifest,
}: {
  trip: AllocationBoardTrip;
  onOpenSequence: (tripId: string | number) => void;
  onPrintManifest: (manifestId: string | number) => void;
}) {
  const canEditSequence = trip.status === 'IN_TRANSIT' || trip.status === 'ARRIVED' || trip.status === 'COMPLETED';
  const truckLabel = [trip.license_plate, trip.nha_xe ? `xe ${trip.nha_xe}` : null].filter(Boolean).join(' · ');

  return (
    <section className={clsx('overflow-hidden rounded-xl border shadow-sm', trip.contains_highlight ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-slate-100 px-4 py-2.5">
        <Truck size={16} className="text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold text-foreground">{truckLabel || `Chuyến #${trip.trip_id}`}</p>
          <p className="text-[11px] text-muted-foreground">
            {[trip.driver_name, trip.driver_phone].filter(Boolean).join(' · ') || '—'}
            {' · '}
            {tripStatusLabel[String(trip.status || '')] || trip.status}
            {trip.manifest_code ? ` · ${trip.manifest_code}` : ''}
          </p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-600">
            HUB đi: {hubLabel(trip.start_hub, trip.start_hub_id)}
            {' → '}
            HUB đến: {hubLabel(trip.end_hub, trip.end_hub_id)}
          </p>
        </div>
        {trip.manifest_id != null && trip.manifest_id !== '' && (
          <button
            type="button"
            onClick={() => onPrintManifest(trip.manifest_id!)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
          >
            <Printer size={13} />
            In bảng kê
          </button>
        )}
        {canEditSequence && (
          <button
            type="button"
            onClick={() => onOpenSequence(trip.trip_id)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/20 bg-white px-2.5 text-[11px] font-bold text-primary hover:bg-blue-50"
          >
            <ExternalLink size={13} />
            Sửa vị trí
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-white text-[11px] font-bold uppercase tracking-wide text-slate-700">
              <th className="border-r border-border bg-yellow-300 px-2 py-2 text-center w-16">Vị trí hàng</th>
              <th className="border-r border-border px-2 py-2 w-16 text-center">Ngày bốc</th>
              <th className="border-r border-border px-2 py-2 w-14 text-center">Mã Tỉnh</th>
              <th className="border-r border-border px-2 py-2 min-w-[100px]">Tên CTY</th>
              <th className="border-r border-border px-2 py-2 w-10 text-center">DV</th>
              <th className="border-r border-border px-2 py-2 min-w-[180px]">Mặt Hàng</th>
              <th className="border-r border-border px-2 py-2 min-w-[140px]">Nơi Trả</th>
              <th className="border-r border-border px-2 py-2 w-14 text-center">Số Lượng</th>
              <th className="border-r border-border px-2 py-2 w-14 text-center">Loại</th>
              <th className="px-2 py-2 min-w-[120px]">Địa chỉ</th>
            </tr>
          </thead>
          <tbody>
            {trip.items.map((item) => (
              <DispatchRow
                key={String(item.waybill_id)}
                item={item}
                destinationCode={hubCode(trip.end_hub, trip.end_hub_id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DispatchRow({ item, destinationCode }: { item: AllocationBoardItem; destinationCode: string }) {
  const noteInRed = item.mat_hang_note && item.mat_hang !== item.mat_hang_note;

  return (
    <tr className={clsx('border-b border-border align-top', item.is_highlighted ? 'bg-primary/10' : 'hover:bg-muted/5')}>
      <td className="border-r border-border bg-yellow-200 px-2 py-2 text-center font-extrabold text-[14px] text-foreground">
        {item.vi_tri_hang ?? item.loading_position ?? '—'}
      </td>
      <td className="border-r border-border px-2 py-2 text-center font-medium">{item.ngay_boc || '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center font-bold">
        {destinationCode || hubCode(item.dest_hub, item.dest_hub_id) || item.ma_tinh || item.noi_den || '—'}
      </td>
      <td className="border-r border-border px-2 py-2 font-bold">{item.ten_cty || '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center font-bold">{item.dv || 'TC'}</td>
      <td className="border-r border-border px-2 py-2">
        <div className="font-medium leading-snug">{item.mat_hang || item.waybill_code || '—'}</div>
        {noteInRed && (
          <div className="mt-0.5 text-[11px] font-bold leading-snug text-red-600">{item.mat_hang_note}</div>
        )}
        {item.xe_phat && !noteInRed && (
          <div className="mt-0.5 text-[11px] font-bold text-red-600">xe {item.xe_phat}</div>
        )}
      </td>
      <td className="border-r border-border px-2 py-2 text-[11px] font-medium leading-snug">{item.noi_tra || '—'}</td>
      <td className={clsx('border-r border-border px-2 py-2 text-center font-extrabold', item.is_highlighted ? 'text-red-600' : '')}>
        {item.so_luong ?? '—'}
      </td>
      <td className="border-r border-border px-2 py-2 text-center">{item.loai || 'kiện'}</td>
      <td className="px-2 py-2 text-[11px] leading-snug">{item.dia_chi || '—'}</td>
    </tr>
  );
}
