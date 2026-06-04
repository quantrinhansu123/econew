import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, Loader2, Package, Phone, Truck as TruckIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import type { ExpectedArrivalTrip } from './trips/types';

interface ExpectedArrivalsResponse {
  data?: ExpectedArrivalTrip[];
  total?: number;
}

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

const formatNumber = (value?: number | null, suffix = '') =>
  value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)}${suffix}`;

export default function ExpectedArrivalsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<ExpectedArrivalTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiRequest<ExpectedArrivalsResponse | ExpectedArrivalTrip[]>('/trips/expected-arrivals?limit=100');
      const list = Array.isArray(res) ? res : res.data || [];
      setTrips(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách xe dự kiến đến.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totalWaybills = useMemo(() => trips.reduce((s, t) => s + Number(t.waybill_count ?? 0), 0), [trips]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted flex items-center justify-center md:w-auto md:px-3 gap-2"
          >
            <ArrowLeft size={15} />
            <span className="hidden md:inline text-[13px] font-medium">Quay lại</span>
          </button>
          <div>
            <h1 className="text-[15px] font-extrabold text-foreground">Dự kiến xe đến</h1>
            <p className="text-[12px] text-muted-foreground">Xe đang chạy — sắp xếp theo giờ dự kiến đến kho nhận</p>
          </div>
          <div className="flex-1" />
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700">
            {trips.length} xe · {totalWaybills} đơn
          </span>
        </div>

        {isLoading ? (
          <StateBlock icon={<Loader2 className="animate-spin" size={28} />} title="Đang tải..." />
        ) : error ? (
          <StateBlock icon={<AlertTriangle size={28} />} title="Lỗi" description={error} />
        ) : !trips.length ? (
          <StateBlock icon={<TruckIcon size={28} />} title="Chưa có xe trên đường" description="Không có chuyến IN_TRANSIT phù hợp hub của bạn." />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {trips.map((trip) => (
              <article
                key={String(trip.id)}
                className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/trips/${trip.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/trips/${trip.id}`)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Chuyến #{trip.id}</p>
                    <h3 className="text-lg font-extrabold text-primary flex items-center gap-2">
                      <TruckIcon size={18} />
                      {trip.license_plate || trip.truck?.license_plate || trip.truck?.bks || '—'}
                    </h3>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">Đang chạy</span>
                </div>
                <div className="mt-3 grid gap-2 text-[13px]">
                  <Row icon={<Clock size={14} />} label="Dự kiến đến" value={formatDate(trip.expected_arrival_time || trip.arrival_time)} highlight />
                  <Row icon={<Phone size={14} />} label="Lái xe" value={[trip.driver_name, trip.driver_phone].filter(Boolean).join(' · ') || '—'} />
                  <Row icon={<Package size={14} />} label="Hàng trên xe" value={`${trip.waybill_count ?? 0} đơn · ${formatNumber(trip.planned_total_weight, ' kg')} · ${formatNumber(trip.planned_total_volume, ' m³')}`} />
                  <Row label="Từ" value={trip.start_hub?.code || trip.start_hub?.name || `Hub #${trip.start_hub_id}`} />
                  <Row label="Đến" value={trip.end_hub?.code || trip.end_hub?.name || `Hub #${trip.end_hub_id}`} />
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 h-9 rounded-lg border border-primary/20 bg-blue-50 text-[12px] font-bold text-primary hover:bg-blue-100"
                    onClick={(e) => { e.stopPropagation(); navigate(`/trips/${trip.id}/loading-sequence`); }}
                  >
                    Vị trí xếp hàng
                  </button>
                  <button
                    type="button"
                    className="flex-1 h-9 rounded-lg border border-border bg-muted/20 text-[12px] font-bold text-foreground hover:bg-muted/40"
                    onClick={(e) => { e.stopPropagation(); navigate(`/trips/${trip.id}/expenses`); }}
                  >
                    Chi phí
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value, highlight }: { icon?: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/5 px-2 py-1.5">
      <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        {icon}
        {label}
      </span>
      <span className={clsx('text-right font-bold truncate', highlight ? 'text-primary' : 'text-foreground')}>{value}</span>
    </div>
  );
}

function StateBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center text-center p-6">
      <div className="mb-3 text-primary">{icon}</div>
      <h3 className="text-[14px] font-bold">{title}</h3>
      {description && <p className="mt-1 text-[13px] text-muted-foreground max-w-md">{description}</p>}
    </div>
  );
}
