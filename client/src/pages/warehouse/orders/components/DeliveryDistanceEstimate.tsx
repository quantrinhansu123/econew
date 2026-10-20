import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Route } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../../lib/api';
import { isDistanceBlocked, mergeDistanceUsage, validDeliveryCoordinates, type DeliveryDistanceResult, type DeliveryDistanceUsage, type HereEndpointUsage } from '../deliveryDistance';

interface Props { hubId: string; address: string; hasStreetAddress: boolean; billKey: string; disabled: boolean }
const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const resetFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const REFRESH_EVENT = 'eco-distance-usage-refresh';
const AUTO_ESTIMATE_DELAY_MS = 1_000;

export default function DeliveryDistanceEstimate({ hubId, address, hasStreetAddress, billKey, disabled }: Props) {
  const [usage, setUsage] = useState<DeliveryDistanceUsage | null>(null);
  const [usageError, setUsageError] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [outcome, setOutcome] = useState<{ key: string; result?: DeliveryDistanceResult; error?: string } | null>(null);
  const [coordinateEntry, setCoordinateEntry] = useState({ scope: '', value: '' });
  const baseScope = JSON.stringify([hubId, address, billKey]);
  const coordinates = coordinateEntry.scope === baseScope ? coordinateEntry.value : '';
  const needsGeocoding = !coordinates.trim();
  const invalidCoordinates = !needsGeocoding && !validDeliveryCoordinates(coordinates);
  const scope = JSON.stringify([baseScope, coordinates]);
  const currentScope = useRef(scope);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const attemptedScope = useRef<string | null>(null);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    const refreshUsage = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await apiRequest<DeliveryDistanceUsage>('/delivery-distance/usage', { signal: abort.signal });
        if (abort.signal.aborted) return;
        setUsage(previous => mergeDistanceUsage(previous, next));
        setUsageError('');
      } catch {
        if (!abort.signal.aborted) setUsageError('Chưa đọc được hạn mức. Tạm dừng tính km; bấm làm mới để thử lại.');
      }
    };
    const refresh = () => { void refreshUsage(); };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener(REFRESH_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      mounted.current = false;
      abort.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(REFRESH_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (!usage?.configured) return;
    const resetTimes = [usage.directions, ...(needsGeocoding ? [usage.geocoding] : [])]
      .filter(item => item.blocked)
      .flatMap(item => [item.remaining === 0 ? item.resets_at : null, item.minute_remaining === 0 ? item.minute_resets_at : null, item.blocked_until])
      .filter((value): value is string => Boolean(value))
      .map(value => Date.parse(value)).filter(value => value > Date.now());
    if (!resetTimes.length) return;
    const timeout = window.setTimeout(() => window.dispatchEvent(new Event(REFRESH_EVENT)), Math.min(60_000, Math.min(...resetTimes) - Date.now() + 250));
    return () => window.clearTimeout(timeout);
  }, [usage, needsGeocoding]);

  const blocked = isDistanceBlocked(usage, needsGeocoding);
  const missingLocation = needsGeocoding && !hasStreetAddress;
  const canCalculate = !disabled && Boolean(hubId) && !missingLocation && !invalidCoordinates && !blocked && !usageError;
  const calculate = useCallback(async () => {
    if (inFlight.current || !canCalculate) return;
    inFlight.current = true;
    // A failed attempt also counts: polling usage must never retry the same input.
    attemptedScope.current = scope;
    setCalculating(true);
    setOutcome(null);
    const requestScope = scope;
    try {
      const result = await apiRequest<DeliveryDistanceResult>('/delivery-distance/estimate', {
        method: 'POST', body: { dest_hub_id: hubId, receiver_address: address, ...(!needsGeocoding ? { receiver_coordinates: coordinates.trim() } : {}) },
      });
      if (!mounted.current) return;
      setUsage(previous => mergeDistanceUsage(previous, result.usage));
      if (currentScope.current === requestScope) setOutcome({ key: requestScope, result });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.payload && typeof error.payload === 'object' && 'usage' in error.payload) {
        const next = (error.payload as { usage: DeliveryDistanceUsage }).usage;
        if (next) setUsage(previous => mergeDistanceUsage(previous, next));
      }
      if (currentScope.current === requestScope) setOutcome({ key: requestScope, error: error instanceof Error ? error.message : 'Không tính được khoảng cách.' });
    } finally {
      inFlight.current = false;
      if (mounted.current) setCalculating(false);
    }
  }, [canCalculate, scope, hubId, address, needsGeocoding, coordinates]);

  useEffect(() => {
    // Coordinates are an explicit override and are calculated only by the button.
    if (!needsGeocoding || !canCalculate || calculating) return;
    const timeout = window.setTimeout(() => {
      if (currentScope.current === scope && attemptedScope.current !== scope) void calculate();
    }, AUTO_ESTIMATE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [needsGeocoding, canCalculate, calculating, scope, calculate]);

  const visible = outcome?.key === scope ? outcome : null;
  const result = visible?.result;
  const hint = usageError || (!usage ? 'Đang kiểm tra hạn mức…' : !usage.configured ? 'Chưa bật HERE. Liên hệ quản trị viên để cấu hình.'
    : blocked ? 'Đã chạm hạn mức HERE hoặc đang chờ lượt trở lại. Tạm dừng tính km để không vượt hạn mức.'
      : !hubId ? 'Chọn HUB đến để tính quãng đường giao.'
        : invalidCoordinates ? 'Tọa độ cần có dạng vĩ độ,kinh độ và nằm trong phạm vi hợp lệ.'
          : missingLocation ? 'Nhập địa chỉ nhận cụ thể hoặc tọa độ điểm giao.' : 'Đường ô tô từ HUB đến; tham khảo tính cước, chưa xét kẹt xe/cấm tải.');

  return (
    <div className="mt-2.5 space-y-2 rounded-lg border border-violet-200 bg-white/80 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700"><Route size={14} aria-hidden="true" />Khoảng cách giao hàng</span>
        <button type="button" onClick={() => { void calculate(); }} disabled={!canCalculate || calculating} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-[11px] font-extrabold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
          {calculating && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {calculating ? 'Đang tính…' : 'Tính lại km'}
        </button>
      </div>
      <label className="block space-y-1 text-[10px] font-semibold text-slate-600">
        <span>Tọa độ điểm giao (nếu có)</span>
        <input value={coordinates} onChange={event => setCoordinateEntry({ scope: baseScope, value: event.target.value })} disabled={disabled || calculating} placeholder="vĩ độ,kinh độ · VD: 10.779971,106.700052" className="h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50" />
      </label>
      <p className="text-[10px] leading-relaxed text-slate-500">Địa chỉ tự tính sau khi ngừng nhập 1 giây. Dán GPS thì bấm “Tính lại km”.</p>
      {needsGeocoding && hasStreetAddress && <p className="break-words text-[10px] text-slate-600">Địa chỉ tính km: {address}</p>}
      <p className={clsx('text-[11px] leading-relaxed', blocked && usage?.configured || usageError || invalidCoordinates ? 'text-red-600' : 'text-slate-500')}>{hint}</p>
      {usage && (
        <div className="space-y-2">
          <QuotaMeter label="Tính đường" quota={usage.directions} />
          <QuotaMeter label="Tìm địa chỉ" quota={usage.geocoding} />
          <p className="text-[10px] text-slate-500">Hạn mức HERE: 30.000 lượt/tháng cho từng loại. Kỳ tháng theo UTC; đặt lại lúc 07:00 ngày 1 giờ Việt Nam.</p>
        </div>
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        {visible?.error && <p className="text-[11px] font-semibold text-red-600">{visible.error}</p>}
        {result && (
          <div className="space-y-1 text-[11px]">
            <p className="font-semibold text-slate-700">{result.hub_name} → điểm giao: <strong className="text-[15px] text-primary">≈ {numberFormat.format(result.distance_meters / 1000)} km</strong><span className="ml-1 text-slate-500">· khoảng {Math.ceil(result.duration_seconds / 60)} phút</span></p>
            <p className="break-words text-slate-600">Điểm được tính: {result.matched_address}</p>
            {result.approximate_address && <p className="font-semibold text-amber-700">HERE chỉ khớp gần đúng. Kiểm tra đúng điểm giao trước khi báo cước; có thể dán tọa độ để tính lại.</p>}
            <p className="sr-only">Đã dùng {numberFormat.format(usage?.directions.used ?? result.usage.directions.used)}/{numberFormat.format(result.usage.directions.limit)} lượt tính đường trong tháng.</p>
            <a href={result.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Kiểm tra điểm giao trên Google Maps<ExternalLink size={12} aria-hidden="true" /></a>
            <p className="text-[10px] text-slate-500">Dữ liệu địa chỉ và tuyến đường © <a href="https://www.here.com/" target="_blank" rel="noopener noreferrer" className="underline">HERE</a></p>
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 text-[10px] text-slate-500">
        <p>Dùng chung toàn hệ thống. Lượt lỗi vẫn tính dự phòng; hết lượt sẽ dừng.</p>
        <button type="button" aria-label="Làm mới hạn mức" title="Làm mới hạn mức, không dùng lượt bản đồ" onClick={() => window.dispatchEvent(new Event(REFRESH_EVENT))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 text-primary hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><RefreshCw size={13} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function QuotaMeter({ label, quota }: { label: string; quota: HereEndpointUsage }) {
  const percent = Math.min(100, Math.max(0, quota.used / quota.limit * 100));
  return (
    <div className="space-y-1 text-[10px] font-semibold text-slate-600">
      <div className="flex flex-wrap justify-between gap-x-2"><span>{label}</span><span>Đã dùng {numberFormat.format(quota.used)}/{numberFormat.format(quota.limit)} lượt/tháng</span></div>
      <div role="progressbar" aria-label={`Lượt ${label.toLowerCase()} HERE trong tháng`} aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={Math.min(quota.used, quota.limit)} aria-valuetext={`${quota.used} trên ${quota.limit} lượt`} className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={clsx('h-full rounded-full', quota.blocked ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${percent}%` }} />
      </div>
      <p className="font-normal text-slate-500">Giới hạn gửi: {quota.minute_used}/{quota.minute_limit} lượt/phút{quota.resets_at ? ` · Đặt lại ${resetFormat.format(new Date(quota.resets_at))}` : ''}</p>
    </div>
  );
}
