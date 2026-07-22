import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Loader2, MapPin, PackageOpen, Phone, RotateCcw, Search, Truck } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import { getStoredAuthUser } from '../lib/authUser';
import UpdateDeliveryStatusDialog from './delivery/last-mile/dialogs/UpdateDeliveryStatusDialog';
import type { DeliveryStatusPayload, HubSummary, LastMileWaybill, ListResponse } from './delivery/last-mile/types';

const DRIVER = 4;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const canAct = (roleMask: number) => (roleMask & (DRIVER | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeStatus = (waybill: LastMileWaybill) => String(waybill.current_state || '').toUpperCase();
type TaskStatusFilter = 'AT_DEST_HUB' | 'OUT_FOR_DELIVERY' | 'RETURNED';

const normalizeList = <T,>(response: ListResponse<T> | T[]) =>
  Array.isArray(response) ? response : response.items || response.data || response.waybills || [];

export default function NhiemVuGiaoHangPage() {
  const user = useMemo(() => getStoredAuthUser(), []);
  const roleMask = user?.role_mask ?? 0;
  const allowed = canAct(roleMask);
  const isManager = (roleMask & (MANAGER | DIRECTOR)) !== 0;
  const isDriverOnly = (roleMask & DRIVER) !== 0 && (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) === 0;

  const [keyword, setKeyword] = useState('');
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [selectedHubId, setSelectedHubId] = useState(user?.hub_id ? String(user.hub_id) : '');
  const [activeStatus, setActiveStatus] = useState<TaskStatusFilter | null>(null);
  const [waybills, setWaybills] = useState<LastMileWaybill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusWaybill, setStatusWaybill] = useState<LastMileWaybill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadTasks = useCallback(async () => {
    if (!selectedHubId && hubs.length) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100',
        status: 'AT_DEST_HUB,OUT_FOR_DELIVERY,RETURNED',
      });
      if (selectedHubId) params.set('dest_hub_id', selectedHubId);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const response = await apiRequest<ListResponse<LastMileWaybill> | LastMileWaybill[]>(
        `/waybills?${params.toString()}`,
      );
      let items = normalizeList(response);
      if (isDriverOnly && user?.id) {
        const uid = String(user.id);
        items = items.filter(
          (w) =>
            !w.last_mile_driver_id ||
            String(w.last_mile_driver_id) === uid ||
            normalizeStatus(w) !== 'OUT_FOR_DELIVERY',
        );
      }
      setWaybills(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được nhiệm vụ giao hàng.');
      setWaybills([]);
    } finally {
      setLoading(false);
    }
  }, [hubs.length, isDriverOnly, keyword, selectedHubId, user?.id]);

  useEffect(() => {
    apiRequest<ListResponse<HubSummary> | HubSummary[]>('/hubs/active?limit=100')
      .then((response) => {
        const items = normalizeList(response);
        setHubs(items);
        setSelectedHubId((current) => {
          if (current) return current;
          const hcm = items.find((hub) => String(hub.code || '').trim().toUpperCase() === 'HCM');
          return hcm ? String(hcm.id) : items[0] ? String(items[0].id) : '';
        });
      })
      .catch(() => setHubs([]));
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const confirmUpdateStatus = async (payload: DeliveryStatusPayload) => {
    if (!statusWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/waybills/${statusWaybill.id}/status`, { method: 'PATCH', body: payload });
      setStatusWaybill(null);
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedHub = hubs.find((hub) => String(hub.id) === selectedHubId);
  const taskCounts = waybills.reduce((counts, waybill) => {
    const status = normalizeStatus(waybill);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const visibleWaybills = activeStatus
    ? waybills.filter((waybill) => normalizeStatus(waybill) === activeStatus)
    : waybills;

  const toggleStatus = (status: TaskStatusFilter) => {
    setActiveStatus((current) => current === status ? null : status);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-extrabold text-foreground">Nhiệm vụ giao hàng</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Đơn đã tới HUB đích — nhận đi giao, xác nhận thành công hoặc hoàn hàng và phát lại.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={selectedHubId}
              onChange={(event) => setSelectedHubId(event.target.value)}
              disabled={!isManager && Boolean(user?.hub_id)}
              className="h-10 w-full appearance-none rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-bold outline-none focus:border-primary disabled:bg-slate-50"
            >
              {!selectedHubId && <option value="">Chọn HUB đến</option>}
              {hubs.map((hub) => <option key={String(hub.id)} value={String(hub.id)}>{hub.code || hub.name} — {hub.name || hub.code}</option>)}
            </select>
          </div>
          <TaskCount label="Chờ phân giao" value={taskCounts.AT_DEST_HUB || 0} active={activeStatus === 'AT_DEST_HUB'} className="border-violet-200 bg-violet-50 text-violet-700" onClick={() => toggleStatus('AT_DEST_HUB')} />
          <TaskCount label="Đang giao" value={taskCounts.OUT_FOR_DELIVERY || 0} active={activeStatus === 'OUT_FOR_DELIVERY'} className="border-orange-200 bg-orange-50 text-orange-700" onClick={() => toggleStatus('OUT_FOR_DELIVERY')} />
          <TaskCount label="Chờ phát lại" value={taskCounts.RETURNED || 0} active={activeStatus === 'RETURNED'} className="border-red-200 bg-red-50 text-red-700" onClick={() => toggleStatus('RETURNED')} />
        </div>
        <div className="relative mt-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadTasks()}
            placeholder="Tìm mã bill, người nhận..."
            className="h-10 w-full rounded-lg border border-border pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/15"
          />
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
      ) : !visibleWaybills.length ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <PackageOpen className="text-muted-foreground" size={32} />
          <p className="mt-3 text-[14px] font-extrabold text-foreground">Chưa có nhiệm vụ giao hàng</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
            {activeStatus
              ? `Không có đơn thuộc trạng thái đã chọn tại ${selectedHub?.name || selectedHub?.code || 'HUB này'}.`
              : `Không có đơn chờ phân giao, đang giao hoặc chờ phát lại tại ${selectedHub?.name || selectedHub?.code || 'HUB đã chọn'}.`}
          </p>
        </div>
      ) : (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
          {visibleWaybills.map((waybill) => {
            const status = normalizeStatus(waybill);
            const canStart = allowed && status === 'AT_DEST_HUB';
            const canDeliver = allowed && status === 'OUT_FOR_DELIVERY';
            const canRedeliver = allowed && status === 'RETURNED';

            return (
              <article
                key={waybill.id}
                className="rounded-2xl border border-border bg-white p-4 shadow-sm"
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
                          : status === 'RETURNED'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-violet-200 bg-violet-50 text-violet-800',
                      )}
                    >
                      {status === 'OUT_FOR_DELIVERY' ? 'Đang giao' : status === 'RETURNED' ? 'Chờ phát lại' : 'Tới hub đích'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {canStart && (
                      <button
                        type="button"
                        onClick={() => setStatusWaybill(waybill)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 px-4 text-[13px] font-extrabold text-primary hover:bg-primary/15"
                      >
                        <Truck size={16} />
                        Nhận đi giao
                      </button>
                    )}
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
                    {canRedeliver && (
                      <button
                        type="button"
                        onClick={() => setStatusWaybill(waybill)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-[13px] font-extrabold text-white shadow-sm hover:bg-red-700"
                      >
                        <RotateCcw size={16} />
                        Phát lại
                      </button>
                    )}
                    {allowed && !canStart && !canDeliver && !canRedeliver && (
                      <span className="text-[12px] font-bold text-muted-foreground">Không thao tác được</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[13px]">
                  <p className="font-bold text-foreground">{waybill.receiver_info}</p>
                  {(waybill.redelivery_address || waybill.receiver_address) && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin size={14} className="mt-0.5 shrink-0" />
                      {waybill.redelivery_address || waybill.receiver_address}
                    </p>
                  )}
                  {waybill.receiver_phone && (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone size={14} />
                      {waybill.receiver_phone}
                    </p>
                  )}
                  {status === 'RETURNED' && (
                    <div className="mt-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                      <p><strong>Lý do:</strong> {waybill.return_reason || 'Chưa ghi nhận'}</p>
                      <p className="mt-0.5"><strong>Số lần đã phát:</strong> {waybill.delivery_attempt_count || 1}</p>
                    </div>
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
        onClose={() => {
          setStatusWaybill(null);
          setActionError('');
        }}
        onConfirm={confirmUpdateStatus}
      />
    </div>
  );
}

function TaskCount({ label, value, active, className, onClick }: { label: string; value: number; active: boolean; className: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-black transition hover:-translate-y-0.5 hover:shadow-sm',
        active && 'ring-2 ring-primary ring-offset-1 shadow-sm',
        className,
      )}
    >
      {label}<b>{value}</b>
    </button>
  );
}
