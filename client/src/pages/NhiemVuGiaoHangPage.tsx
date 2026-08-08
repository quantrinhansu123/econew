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
  const [destHubId, setDestHubId] = useState(() => String(user?.hub_id || ''));
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
  const { routes, isLoading: routesLoading } = useDeliveryRoutes(true, destHubId || String(user?.hub_id || ''));

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
    if (destHubId) params.set('hub_id', destHubId);
    void apiRequest<DeliveryResources>(`/waybills/delivery-resources?${params.toString()}`)
      .then(setResources)
      .catch(() => setResources({ drivers: [], trucks: [], vendors: [] }));
  }, [destHubId]);

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
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4">
          {displayedWaybills.map((waybill) => {
            const status = normalizeStatus(waybill);
            const preparation = waybill.delivery_preparation_status || 'PENDING_CONFIRMATION';
            const canStart = canDispatchDelivery(roleMask) && status === 'AT_DEST_HUB' && preparation === 'READY';
            const canPrepare = canPrepareDelivery(roleMask) && status === 'AT_DEST_HUB';
            const canDeliver = canCompleteDelivery(roleMask) && status === 'OUT_FOR_DELIVERY';

            return (
              <article
                key={waybill.task_id || waybill.split_id || waybill.id}
                className="rounded-xl border border-border bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-primary">Mã vận đơn</p>
                    <p className="text-lg font-extrabold text-foreground">{waybill.waybill_code}</p>
                    <span
                      className={clsx(
                        'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black',
                        status === 'OUT_FOR_DELIVERY'
                          ? 'border-orange-200 bg-orange-50 text-orange-800'
                          : 'border-violet-200 bg-violet-50 text-violet-800',
                      )}
                    >
                      {status === 'OUT_FOR_DELIVERY' ? 'Đang giao' : 'Tới hub đích'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {canPrepare && (
                      <button type="button" onClick={() => { setActionError(''); setPreparationWaybill(waybill); }} className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-[13px] font-extrabold text-foreground hover:bg-muted">
                        {preparation === 'PENDING_CONFIRMATION' ? 'Gọi xác nhận / xử lý' : 'Sửa xử lý'}
                      </button>
                    )}
                    {canStart && (
                      <button
                        type="button"
                        onClick={() => setStatusWaybill(waybill)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 px-4 text-[13px] font-extrabold text-primary hover:bg-primary/15"
                      >
                        <Truck size={16} />
                        Điều phối giao
                      </button>
                    )}
                    <button type="button" title="Xem lịch sử" onClick={() => void openHistory(waybill)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border text-muted-foreground hover:text-primary"><History size={16}/></button>
                    {canDeliver && (
                      <button
                        type="button"
                        onClick={() => setStatusWaybill(waybill)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[13px] font-extrabold text-white shadow-sm hover:bg-emerald-700"
                      >
                        <Truck size={16} />
                        Giao hàng
                      </button>
                    )}
                    {allowed && !canPrepare && !canStart && !canDeliver && (
                      <span className="text-[12px] font-bold text-muted-foreground">Không thao tác được</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[13px]">
                  <p className="font-bold text-foreground">{waybill.receiver_info}</p>
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-[12px] sm:grid-cols-4">
                    <p><span className="block text-[10px] font-bold uppercase text-muted-foreground">Người gửi</span><b>{waybill.sender_name || waybill.sender_info || '—'}</b></p>
                    <p><span className="block text-[10px] font-bold uppercase text-muted-foreground">Số kiện</span><b>{waybill.trip_package_count ?? waybill.package_count ?? '—'} kiện</b></p>
                    <p><span className="block text-[10px] font-bold uppercase text-muted-foreground">Trọng lượng</span><b>{Number(waybill.weight || 0).toLocaleString('vi-VN')} kg</b></p>
                    <p><span className="block text-[10px] font-bold uppercase text-muted-foreground">Thanh toán</span><b>{waybill.payment_type || '—'}</b></p>
                  </div>
                  <p className="text-[12px] font-bold text-muted-foreground">
                    {[waybill.origin_hub?.code || waybill.origin_hub_id, waybill.dest_hub?.code || waybill.dest_hub_id].filter(Boolean).join(' → ')}
                    {waybill.trip_id ? ` · Chuyến #${waybill.trip_id}` : ''}
                    {waybill.trip_package_count != null && waybill.order_total_packages != null
                      ? ` · ${waybill.trip_package_count}/${waybill.order_total_packages} kiện`
                      : ''}
                  </p>
                  <p className="text-[12px] font-bold text-slate-700">Nguồn hàng: {waybill.trip_label || (waybill.trip_id ? `Chuyến #${waybill.trip_id}${waybill.license_plate ? ` · Xe ${waybill.license_plate}` : ''}` : 'Nhập trực tiếp tại HUB')}</p>
                  {status === 'AT_DEST_HUB' && <p className={clsx('text-[12px] font-extrabold', preparation === 'NEEDS_ACTION' ? 'text-red-700' : preparation === 'READY' ? 'text-emerald-700' : 'text-amber-700')}>
                    {preparation === 'READY' ? 'Sẵn sàng giao' : preparation === 'SCHEDULED' ? `Lưu kho · hẹn ${waybill.delivery_scheduled_at ? new Date(waybill.delivery_scheduled_at).toLocaleString('vi-VN') : ''}` : preparation === 'NEEDS_ACTION' ? 'Cần xử lý: còn tối đa 1 ngày tới lịch giao' : preparation === 'HOLD' ? `Lưu kho chờ xử lý · ${waybill.delivery_hold_reason || ''}` : 'Chờ gọi xác nhận'}
                  </p>}
                  {waybill.receiver_address && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin size={14} className="mt-0.5 shrink-0" />
                      {waybill.receiver_address}
                    </p>
                  )}
                  {waybill.receiver_phone && (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone size={14} />
                      {waybill.receiver_phone}
                    </p>
                  )}
                  {status === 'OUT_FOR_DELIVERY' && (
                    <p className="text-[12px] font-bold text-primary">
                      Tuyến {waybill.route_code || '—'} · {' '}
                      {waybill.delivery_assignment_type === 'PARTNER'
                        ? `Đối tác: ${waybill.last_mile_vendor?.name || waybill.last_mile_vendor?.code || '—'}`
                        : `Nội bộ: ${waybill.last_mile_driver?.name || waybill.last_mile_driver?.username || '—'}${waybill.last_mile_truck ? ` · ${waybill.last_mile_truck.bks || waybill.last_mile_truck.license_plate || ''}` : ''}`}
                    </p>
                  )}
                  {waybill.last_delivery_failure_reason && <p className="text-[12px] font-bold text-red-700">Lần giao thất bại: {waybill.last_delivery_failure_reason}</p>}
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
