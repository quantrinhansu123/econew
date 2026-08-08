import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Building2, CreditCard, History, Loader2, MapPin, PackageOpen, Phone, Printer, RefreshCw, Search, Truck } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import { getStoredAuthUser } from '../lib/authUser';
import UpdateDeliveryStatusDialog from './delivery/last-mile/dialogs/UpdateDeliveryStatusDialog';
import DeliveryPreparationDialog from './delivery/last-mile/dialogs/DeliveryPreparationDialog';
import DeliveryHistoryDialog from './delivery/last-mile/dialogs/DeliveryHistoryDialog';
import DeliveryDispatchManifestDialog from './delivery/last-mile/dialogs/DeliveryDispatchManifestDialog';
import type { DeliveryResources, HubSummary, LastMileWaybill, ListResponse, WaybillHistoryItem } from './delivery/last-mile/types';
import { useDeliveryRoutes } from '../hooks/useDeliveryRoutes';

const WAREHOUSE = 1;
const DRIVER = 4;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const canAct = (roleMask: number) => (roleMask & (WAREHOUSE | DRIVER | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const canPrepareDelivery = (roleMask: number) => (roleMask & (WAREHOUSE | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const canDispatchDelivery = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const canCompleteDelivery = (roleMask: number) => (roleMask & (DRIVER | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeStatus = (waybill: LastMileWaybill) => String(waybill.current_state || '').toUpperCase();

const normalizeList = <T,>(response: ListResponse<T> | T[]) =>
  Array.isArray(response) ? response : response.items || response.data || response.waybills || [];

export default function NhiemVuGiaoHangPage() {
  const user = useMemo(() => getStoredAuthUser(), []);
  const roleMask = user?.role_mask ?? 0;
  const allowed = canAct(roleMask);
  const isManager = (roleMask & (MANAGER | DIRECTOR)) !== 0;

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('AT_DEST_HUB,OUT_FOR_DELIVERY');
  const [destHubId, setDestHubId] = useState(() => isManager ? '' : String(user?.hub_id || ''));
  const [originHubId, setOriginHubId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [preparationFilter, setPreparationFilter] = useState('');
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [waybills, setWaybills] = useState<LastMileWaybill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusWaybill, setStatusWaybill] = useState<LastMileWaybill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [resources, setResources] = useState<DeliveryResources>({ drivers: [], trucks: [], vendors: [] });
  const [preparationWaybill, setPreparationWaybill] = useState<LastMileWaybill | null>(null);
  const [historyWaybill, setHistoryWaybill] = useState<LastMileWaybill | null>(null);
  const [historyItems, setHistoryItems] = useState<WaybillHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const selectedTaskHubId = String(statusWaybill?.dest_hub_id || destHubId || (!isManager ? user?.hub_id : '') || '');
  const { routes, isLoading: routesLoading } = useDeliveryRoutes(true, selectedTaskHubId);

  const displayedWaybills = useMemo(() => preparationFilter
    ? waybills.filter((waybill) => String(waybill.delivery_preparation_status || 'PENDING_CONFIRMATION') === preparationFilter)
    : waybills, [preparationFilter, waybills]);
  const dispatchManifestCount = useMemo(() => new Set(waybills
    .filter((waybill) => normalizeStatus(waybill) === 'OUT_FOR_DELIVERY' && waybill.delivery_assignment_type)
    .map((waybill) => `${waybill.route_code || ''}|${waybill.delivery_assignment_type}|${waybill.last_mile_truck_id || waybill.last_mile_vendor_id || waybill.last_mile_driver_id || ''}`)).size, [waybills]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '100', status: statusFilter });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (destHubId) params.set('dest_hub_id', destHubId);
      if (originHubId) params.set('origin_hub_id', originHubId);
      if (paymentType) params.set('payment_type', paymentType);
      const firstResponse = await apiRequest<ListResponse<LastMileWaybill> | LastMileWaybill[]>(
        `/waybills/delivery-tasks?${params.toString()}`,
      );
      let items = normalizeList(firstResponse);
      if (!Array.isArray(firstResponse)) {
        const total = firstResponse.meta?.total ?? firstResponse.total ?? items.length;
        const totalPages = firstResponse.meta?.total_pages ?? Math.max(1, Math.ceil(total / 100));
        if (totalPages > 1) {
          const remaining = await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
            const nextParams = new URLSearchParams(params);
            nextParams.set('page', String(index + 2));
            return apiRequest<ListResponse<LastMileWaybill> | LastMileWaybill[]>(`/waybills/delivery-tasks?${nextParams.toString()}`);
          }));
          items = [...items, ...remaining.flatMap(normalizeList)];
        }
      }
      if (!isManager && user?.id) {
        const uid = String(user.id);
        items = items.filter(
          (w) =>
            !w.last_mile_driver_id ||
            String(w.last_mile_driver_id) === uid ||
            normalizeStatus(w) === 'AT_DEST_HUB',
        );
      }
      setWaybills(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được nhiệm vụ giao hàng.');
      setWaybills([]);
    } finally {
      setLoading(false);
    }
  }, [destHubId, isManager, keyword, originHubId, paymentType, statusFilter, user?.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active')
      .then((response) => setHubs(normalizeList(response)))
      .catch(() => setHubs([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTaskHubId) params.set('hub_id', selectedTaskHubId);
    void apiRequest<DeliveryResources>(`/waybills/delivery-resources?${params.toString()}`)
      .then(setResources)
      .catch(() => setResources({ drivers: [], trucks: [], vendors: [] }));
  }, [selectedTaskHubId]);

  const confirmUpdateStatus = async (
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED',
    deliveryPhotoUrl?: string,
    assignment?: { assignment_type: 'INTERNAL' | 'PARTNER'; driver_id?: string; truck_id?: string; vendor_id?: string; route_code?: string },
    failureReason?: string,
  ) => {
    if (!statusWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      const body: { status: string; delivery_photo_url?: string; trip_id?: string; split_id?: string; failure_reason?: string } = { status };
      if (deliveryPhotoUrl) body.delivery_photo_url = deliveryPhotoUrl;
      if (statusWaybill.trip_id) body.trip_id = String(statusWaybill.trip_id);
      if (statusWaybill.split_id) body.split_id = String(statusWaybill.split_id);
      Object.assign(body, assignment || {});
      if (failureReason) body.failure_reason = failureReason;
      await apiRequest(`/waybills/${statusWaybill.id}/status`, { method: 'PATCH', body });
      setStatusWaybill(null);
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmPreparation = async (status: 'READY' | 'SCHEDULED' | 'HOLD', scheduledAt?: string, reason?: string) => {
    if (!preparationWaybill) return;
    setIsSubmitting(true); setActionError('');
    try {
      await apiRequest(`/waybills/${preparationWaybill.id}/delivery-preparation`, { method: 'PATCH', body: { status, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined, reason } });
      setPreparationWaybill(null); await loadTasks();
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Không lưu được xử lý.'); }
    finally { setIsSubmitting(false); }
  };

  const openHistory = async (waybill: LastMileWaybill) => {
    setHistoryWaybill(waybill); setHistoryItems([]); setHistoryLoading(true);
    try { setHistoryItems(await apiRequest<WaybillHistoryItem[]>(`/waybills/${waybill.id}/history`)); }
    catch { setHistoryItems([]); }
    finally { setHistoryLoading(false); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-extrabold text-foreground">Hàng tại HUB · Nhiệm vụ giao hàng</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Toàn bộ hàng đã nhập HUB đến — xác nhận người nhận, lưu kho, phân tuyến và điều phối giao chặng cuối.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadTasks()}
              placeholder="Tìm mã bill, mã KH, SĐT, tên, địa chỉ, nội dung hàng..."
              className="h-10 w-full rounded-lg border border-border pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <FilterSelect icon={<Truck size={15} />} value={statusFilter} onChange={setStatusFilter} label="Trạng thái">
            <option value="AT_DEST_HUB,OUT_FOR_DELIVERY">Tất cả đơn cần giao</option>
            <option value="AT_DEST_HUB">Chờ phân giao</option>
            <option value="OUT_FOR_DELIVERY">Đang giao</option>
          </FilterSelect>
          <FilterSelect icon={<Building2 size={15} />} value={destHubId} onChange={setDestHubId} label="HUB đến">
            <option value="">Tất cả HUB đến</option>
            {hubs.map((hub) => <option key={String(hub.id)} value={String(hub.id)}>{[hub.code, hub.name].filter(Boolean).join(' · ')}</option>)}
          </FilterSelect>
          <FilterSelect icon={<Building2 size={15} />} value={originHubId} onChange={setOriginHubId} label="HUB đi">
            <option value="">Tất cả HUB đi</option>
            {hubs.map((hub) => <option key={String(hub.id)} value={String(hub.id)}>{[hub.code, hub.name].filter(Boolean).join(' · ')}</option>)}
          </FilterSelect>
          <FilterSelect icon={<CreditCard size={15} />} value={paymentType} onChange={setPaymentType} label="Thanh toán">
            <option value="">Tất cả thanh toán</option>
            <option value="PP">PP</option><option value="CC">CC</option><option value="COD">COD</option>
          </FilterSelect>
          <FilterSelect icon={<PackageOpen size={15} />} value={preparationFilter} onChange={setPreparationFilter} label="Xử lý giao">
            <option value="">Tất cả xử lý</option><option value="PENDING_CONFIRMATION">Chờ gọi xác nhận</option><option value="READY">Sẵn sàng giao</option><option value="SCHEDULED">Lưu kho hẹn ngày</option><option value="NEEDS_ACTION">Cần xử lý</option><option value="HOLD">Lưu kho chờ xử lý</option>
          </FilterSelect>
          <button type="button" disabled={!dispatchManifestCount} onClick={() => setPrintOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-extrabold text-white disabled:opacity-50"><Printer size={15}/>In bảng kê phát ({dispatchManifestCount})</button>
          <button type="button" title="Làm mới" onClick={() => void loadTasks()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:text-primary"><RefreshCw size={16} /></button>
        </div>
        {!allowed && (
          <p className="mt-2 text-[12px] font-bold text-amber-700">
            Tài khoản cần quyền Tài xế / Điều phối / Quản lý để thao tác giao hàng.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground">
          <Loader2 className="animate-spin text-primary" size={20} />
          Đang tải nhiệm vụ...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-bold text-red-700">
          <AlertTriangle className="mr-1 inline" size={16} />
          {error}
        </div>
      ) : !displayedWaybills.length ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <PackageOpen className="text-muted-foreground" size={32} />
          <p className="mt-3 text-[14px] font-extrabold text-foreground">Chưa có nhiệm vụ giao hàng</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
            Không có đơn ở trạng thái Tới hub đích hoặc Chặng cuối. Kiểm tra bàn giao tài xế tại bưu cục đích.
          </p>
        </div>
      ) : (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-white shadow-sm">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(145px,0.85fr)_minmax(250px,1.6fr)_minmax(210px,1.2fr)_minmax(135px,0.75fr)_minmax(180px,1fr)_minmax(190px,auto)] gap-3 border-b border-border bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground xl:grid">
            <span>Vận đơn</span>
            <span>Người nhận</span>
            <span>Chuyến / xe</span>
            <span>Hàng hóa</span>
            <span>Trạng thái</span>
            <span className="text-right">Thao tác</span>
          </div>
          {displayedWaybills.map((waybill) => {
            const status = normalizeStatus(waybill);
            const preparation = waybill.delivery_preparation_status || 'PENDING_CONFIRMATION';
            const canStart = canDispatchDelivery(roleMask) && status === 'AT_DEST_HUB' && preparation === 'READY';
            const canPrepare = canPrepareDelivery(roleMask) && status === 'AT_DEST_HUB';
            const canDeliver = canCompleteDelivery(roleMask) && status === 'OUT_FOR_DELIVERY';
            const preparationText = preparation === 'READY'
              ? 'Sẵn sàng giao'
              : preparation === 'SCHEDULED'
                ? `Hẹn ${waybill.delivery_scheduled_at ? new Date(waybill.delivery_scheduled_at).toLocaleString('vi-VN') : ''}`
                : preparation === 'NEEDS_ACTION'
                  ? 'Cần xử lý trong ngày'
                  : preparation === 'HOLD'
                    ? `Lưu kho · ${waybill.delivery_hold_reason || 'chờ xử lý'}`
                    : 'Chờ gọi xác nhận';

            return (
              <article
                key={waybill.task_id || waybill.split_id || waybill.id}
                className="grid gap-2 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-slate-50/70 xl:grid-cols-[minmax(145px,0.85fr)_minmax(250px,1.6fr)_minmax(210px,1.2fr)_minmax(135px,0.75fr)_minmax(180px,1fr)_minmax(190px,auto)] xl:items-center xl:gap-3"
              >
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-primary" title={waybill.waybill_code}>{waybill.waybill_code}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span
                      className={clsx(
                        'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-black',
                        status === 'OUT_FOR_DELIVERY'
                          ? 'border-orange-200 bg-orange-50 text-orange-800'
                          : 'border-violet-200 bg-violet-50 text-violet-800',
                      )}
                    >
                      {status === 'OUT_FOR_DELIVERY' ? 'Đang giao' : 'Tới hub đích'}
                    </span>
                    {waybill.trip_package_count != null && waybill.order_total_packages != null && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {waybill.trip_package_count}/{waybill.order_total_packages} kiện
                      </span>
                    )}
                    </div>
                </div>
                <div className="min-w-0 text-[12px]">
                  <p className="truncate font-bold text-foreground" title={waybill.receiver_info}>{waybill.receiver_info || '—'}</p>
                  {waybill.receiver_address && (
                    <p className="mt-1 flex min-w-0 items-center gap-1 text-muted-foreground" title={waybill.receiver_address}>
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{waybill.receiver_address}</span>
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {waybill.receiver_phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{waybill.receiver_phone}</span>}
                    <span className="truncate">Gửi: {waybill.sender_name || waybill.sender_info || '—'}</span>
                  </p>
                </div>
                <div className="min-w-0 text-[11px]">
                  <p className="truncate font-extrabold text-slate-700" title={waybill.trip_label || undefined}>
                    {[waybill.origin_hub?.code || waybill.origin_hub_id, waybill.dest_hub?.code || waybill.dest_hub_id].filter(Boolean).join(' → ')}
                    {waybill.trip_id ? ` · Chuyến #${waybill.trip_id}` : ''}
                  </p>
                  <p className="mt-1 truncate font-bold text-muted-foreground" title={waybill.trip_label || undefined}>
                    {waybill.trip_label || (waybill.trip_id ? `${waybill.license_plate ? `Xe ${waybill.license_plate}` : 'Chưa có xe'}` : 'Nhập trực tiếp tại HUB')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] xl:block">
                  <p><b>{waybill.trip_package_count ?? waybill.package_count ?? '—'}</b> kiện</p>
                  <p><b>{Number(waybill.weight || 0).toLocaleString('vi-VN')}</b> kg</p>
                  <p className="font-bold text-muted-foreground">{waybill.payment_type || '—'}</p>
                </div>
                <div className="min-w-0 text-[11px]">
                  {status === 'AT_DEST_HUB' && <p className={clsx('truncate font-extrabold', preparation === 'NEEDS_ACTION' ? 'text-red-700' : preparation === 'READY' ? 'text-emerald-700' : 'text-amber-700')} title={preparationText}>
                    {preparationText}
                  </p>}
                  {status === 'OUT_FOR_DELIVERY' && (
                    <p className="truncate font-bold text-primary">
                      Tuyến {waybill.route_code || '—'} · {' '}
                      {waybill.delivery_assignment_type === 'PARTNER'
                        ? `Đối tác: ${waybill.last_mile_vendor?.name || waybill.last_mile_vendor?.code || '—'}`
                        : `Nội bộ: ${waybill.last_mile_driver?.name || waybill.last_mile_driver?.username || '—'}${waybill.last_mile_truck ? ` · ${waybill.last_mile_truck.bks || waybill.last_mile_truck.license_plate || ''}` : ''}`}
                    </p>
                  )}
                  {waybill.last_delivery_failure_reason && <p className="mt-1 truncate font-bold text-red-700" title={waybill.last_delivery_failure_reason}>Thất bại: {waybill.last_delivery_failure_reason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                  {canPrepare && (
                    <button type="button" onClick={() => { setActionError(''); setPreparationWaybill(waybill); }} className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[11px] font-extrabold text-foreground hover:bg-muted">
                      {preparation === 'PENDING_CONFIRMATION' ? 'Xác nhận / xử lý' : 'Sửa xử lý'}
                    </button>
                  )}
                  {canStart && (
                    <button
                      type="button"
                      onClick={() => setStatusWaybill(waybill)}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-primary bg-primary/10 px-2.5 text-[11px] font-extrabold text-primary hover:bg-primary/15"
                    >
                      <Truck size={13} />
                      Điều phối
                    </button>
                  )}
                  <button type="button" title="Xem lịch sử" onClick={() => void openHistory(waybill)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:text-primary"><History size={14}/></button>
                  {canDeliver && (
                    <button
                      type="button"
                      onClick={() => setStatusWaybill(waybill)}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-extrabold text-white shadow-sm hover:bg-emerald-700"
                    >
                      <Truck size={13} />
                      Giao hàng
                    </button>
                  )}
                  {allowed && !canPrepare && !canStart && !canDeliver && (
                    <span className="text-[11px] font-bold text-muted-foreground">Chỉ xem</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <UpdateDeliveryStatusDialog
        waybill={statusWaybill}
        isSubmitting={isSubmitting}
        error={actionError}
        resources={resources}
        routes={routes}
        routesLoading={routesLoading}
        currentUserId={user?.id}
        onClose={() => {
          setStatusWaybill(null);
          setActionError('');
        }}
        onConfirm={confirmUpdateStatus}
      />
      <DeliveryPreparationDialog waybill={preparationWaybill} busy={isSubmitting} error={actionError} onClose={() => { setPreparationWaybill(null); setActionError(''); }} onConfirm={confirmPreparation}/>
      <DeliveryHistoryDialog waybill={historyWaybill} items={historyItems} loading={historyLoading} onClose={() => setHistoryWaybill(null)}/>
      <DeliveryDispatchManifestDialog open={printOpen} waybills={waybills} showPricing={isManager} onClose={() => setPrintOpen(false)}/>
    </div>
  );
}

function FilterSelect({ icon, value, onChange, label, children }: { icon: ReactNode; value: string; onChange: (value: string) => void; label: string; children: ReactNode }) {
  return (
    <label className="relative inline-flex h-10 min-w-[150px] items-center gap-2 rounded-lg border border-border bg-white pl-3 text-muted-foreground">
      {icon}
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-7 text-[12px] font-bold text-foreground outline-none">
        {children}
      </select>
    </label>
  );
}
