import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Clock3, Loader2, MapPin, Package, RefreshCw, ShieldCheck, Truck as TruckIcon, Weight } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { AuthUserProfile } from './login/types';
import type { IncomingHub, IncomingManifest, IncomingTrip, IncomingTripListResponse } from './warehouse/incoming/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const POLLING_INTERVAL_MS = 30_000;

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; }
};

const normalizeList = (response: IncomingTripListResponse | IncomingTrip[]) => Array.isArray(response) ? response : response.data || response.items || response.trips || [];
const normalizeNumber = (value?: number | string | null) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const formatNumber = (value?: number | string | null, digits = 1) => normalizeNumber(value).toLocaleString('vi-VN', { maximumFractionDigits: digits });
const formatTime = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value)) : '—';
const formatUpdatedAt = (date: Date | null) => date ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) : '—';
const formatHub = (hub?: IncomingHub | null, fallback?: string | number | null) => hub?.code || hub?.name || (fallback ? `Hub #${fallback}` : '—');
const getManifest = (trip: IncomingTrip): IncomingManifest | null => trip.manifest || null;
const getArrivalTime = (trip: IncomingTrip) => trip.expected_arrival_time || trip.arrival_time || trip.estimated_arrival_time || null;
const getManifestCode = (trip: IncomingTrip) => trip.manifest_code || getManifest(trip)?.manifest_code || trip.manifest?.manifest_code || 'Chưa có manifest';
const getSealCode = (trip: IncomingTrip) => trip.seal_code || getManifest(trip)?.seal_code || 'Chưa niêm phong';
const getWaybillCount = (trip: IncomingTrip) => trip.waybill_count ?? trip.total_waybills ?? getManifest(trip)?.waybill_count ?? getManifest(trip)?.total_waybills ?? 0;
const getTotalWeight = (trip: IncomingTrip) => trip.planned_total_weight ?? trip.total_weight ?? getManifest(trip)?.total_weight ?? 0;
const getTotalM3 = (trip: IncomingTrip) => trip.planned_total_volume ?? trip.total_m3 ?? trip.total_volumetric_weight ?? getManifest(trip)?.total_m3 ?? getManifest(trip)?.total_volumetric_weight ?? 0;
const getOriginHub = (trip: IncomingTrip) => formatHub(trip.origin_hub || trip.start_hub || getManifest(trip)?.origin_hub, trip.origin_hub_id || trip.start_hub_id || getManifest(trip)?.origin_hub_id);
const getDestinationHub = (trip: IncomingTrip) => formatHub(trip.end_hub || trip.dest_hub || getManifest(trip)?.dest_hub, trip.end_hub_id || getManifest(trip)?.dest_hub_id);

const formatRemainingTime = (value?: string | null) => {
  if (!value) return 'Chưa có ETA';
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return 'ETA không hợp lệ';
  if (diffMs <= 0) return 'Đã đến thời gian dự kiến';
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `Còn ${minutes} phút`;
  return `Còn ${hours} giờ ${minutes} phút`;
};

export default function WarehouseIncomingPage() {
  const user = useMemo(getStoredUser, []);
  const hubId = user?.hub_id;
  const [trips, setTrips] = useState<IncomingTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchIncomingTrips = useCallback(async (showLoading = false) => {
    if (!hubId) {
      setTrips([]);
      setError('Tài khoản chưa được gán bưu cục để xem hàng sắp đến.');
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ end_hub_id: String(hubId), limit: '50' });
      const response = await apiRequest<IncomingTripListResponse | IncomingTrip[]>(`/trips/expected-arrivals?${query.toString()}`);
      const list = normalizeList(response);
      setTrips(list);
      setUpdatedAt(new Date());
    } catch (err) {
      setTrips([]);
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách chuyến xe sắp đến.');
    } finally {
      setIsLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    void fetchIncomingTrips(true);
    const intervalId = window.setInterval(() => void fetchIncomingTrips(false), POLLING_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchIncomingTrips]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 flex items-center gap-2 shrink-0"><AlertTriangle size={16} />{error}</div>}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border bg-card p-3 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.history.back()} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"><ArrowLeft size={15} /><span className="hidden md:inline">Quay lại</span></button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600"><TruckIcon size={18} /></div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-extrabold text-foreground md:text-[18px]">Thông báo hàng đến dự kiến</h1>
                <p className="hidden text-[12px] font-medium text-muted-foreground md:block">Theo dõi chuyến đã xếp hàng/khởi hành đang về bưu cục hiện tại.</p>
              </div>
            </div>
            <div className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 text-[12px] font-bold text-muted-foreground">
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary' : 'text-primary'} />
              <span>Cập nhật lúc {formatUpdatedAt(updatedAt)}</span>
            </div>
          </div>
        </div>

        {isLoading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải chuyến xe sắp đến" description="Đang kiểm tra các chuyến xe theo bưu cục hiện tại." /> : trips.length === 0 ? <StateBlock icon={<TruckIcon size={24} />} title="Không có chuyến xe nào đang trên đường đến" description="Danh sách sẽ tự cập nhật mỗi 30 giây khi có chuyến IN_TRANSIT mới." /> : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 md:p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {trips.map(trip => <IncomingTripCard key={trip.id} trip={trip} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IncomingTripCard({ trip }: { trip: IncomingTrip }) {
  const arrivalTime = getArrivalTime(trip);
  return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-extrabold text-foreground">{getManifestCode(trip)}</p>
        <p className="mt-1 text-[12px] font-bold text-muted-foreground">Chuyến #{trip.id}</p>
      </div>
      <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-primary">IN_TRANSIT</span>
    </div>

    <div className="mt-4 space-y-3 text-[13px]">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/5 p-3 font-bold text-foreground">
        <MapPin size={15} className="shrink-0 text-primary" />
        <span className="min-w-0 truncate">{getOriginHub(trip)}</span>
        <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{getDestinationHub(trip)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <InfoTile icon={Clock3} label="Khởi hành" value={formatTime(trip.departure_time)} />
        <InfoTile icon={Clock3} label="Dự kiến đến" value={formatTime(arrivalTime)} />
        <InfoTile icon={Package} label="Số vận đơn" value={`${getWaybillCount(trip).toLocaleString('vi-VN')} đơn`} />
        <InfoTile icon={Weight} label="Tổng kg" value={`${formatNumber(getTotalWeight(trip))} kg`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <InfoTile icon={Package} label="Tổng m3" value={`${formatNumber(getTotalM3(trip), 2)} m³`} />
        <InfoTile icon={ShieldCheck} label="Seal code" value={getSealCode(trip)} />
      </div>
    </div>

    <div className="mt-4 border-t border-border pt-3 text-[12px] font-extrabold text-orange-600">{formatRemainingTime(arrivalTime)}</div>
  </article>;
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof TruckIcon; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/5 p-3">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Icon size={13} />{label}</div>
    <p className="mt-1 truncate text-[13px] font-extrabold text-foreground">{value}</p>
  </div>;
}

function StateBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex flex-1 min-h-[360px] items-center justify-center p-6"><div className="max-w-sm text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/20 text-primary">{icon}</div><h2 className="text-[15px] font-extrabold text-foreground">{title}</h2><p className="mt-1 text-[13px] font-medium leading-6 text-muted-foreground">{description}</p></div></div>;
}
