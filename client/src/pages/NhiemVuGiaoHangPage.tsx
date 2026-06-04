import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, PackageOpen, Phone, Search, Truck } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import { getStoredAuthUser } from '../lib/authUser';
import UpdateDeliveryStatusDialog from './delivery/last-mile/dialogs/UpdateDeliveryStatusDialog';
import type { LastMileWaybill, ListResponse } from './delivery/last-mile/types';

const DRIVER = 4;
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const canAct = (roleMask: number) => (roleMask & (DRIVER | DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const normalizeStatus = (waybill: LastMileWaybill) => String(waybill.current_state || '').toUpperCase();

const normalizeList = <T,>(response: ListResponse<T> | T[]) =>
  Array.isArray(response) ? response : response.items || response.data || response.waybills || [];

export default function NhiemVuGiaoHangPage() {
  const user = useMemo(() => getStoredAuthUser(), []);
  const roleMask = user?.role_mask ?? 0;
  const allowed = canAct(roleMask);
  const isManager = (roleMask & (MANAGER | DIRECTOR)) !== 0;

  const [keyword, setKeyword] = useState('');
  const [waybills, setWaybills] = useState<LastMileWaybill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusWaybill, setStatusWaybill] = useState<LastMileWaybill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100',
        status: 'AT_DEST_HUB,OUT_FOR_DELIVERY',
      });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const response = await apiRequest<ListResponse<LastMileWaybill> | LastMileWaybill[]>(
        `/waybills?${params.toString()}`,
      );
      let items = normalizeList(response);
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
  }, [isManager, keyword, user?.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const confirmUpdateStatus = async (status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED') => {
    if (!statusWaybill) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      const body: { status: string; delivery_photo_url?: string } = { status };
      if (status === 'DELIVERED') {
        body.delivery_photo_url = statusWaybill.delivery_photo_url || 'pending-upload';
      }
      await apiRequest(`/waybills/${statusWaybill.id}/status`, { method: 'PATCH', body });
      setStatusWaybill(null);
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-extrabold text-foreground">Nhiệm vụ giao hàng</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Đơn chờ giao / đang giao chặng cuối — bấm <strong className="text-foreground">Giao hàng</strong> để xác nhận.
        </p>
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
      ) : !waybills.length ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <PackageOpen className="text-muted-foreground" size={32} />
          <p className="mt-3 text-[14px] font-extrabold text-foreground">Chưa có nhiệm vụ giao hàng</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
            Không có đơn ở trạng thái Tới hub đích hoặc Chặng cuối. Kiểm tra bàn giao tài xế tại bưu cục đích.
          </p>
        </div>
      ) : (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
          {waybills.map((waybill) => {
            const status = normalizeStatus(waybill);
            const canStart = allowed && status === 'AT_DEST_HUB';
            const canDeliver = allowed && status === 'OUT_FOR_DELIVERY';

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
                          : 'border-violet-200 bg-violet-50 text-violet-800',
                      )}
                    >
                      {status === 'OUT_FOR_DELIVERY' ? 'Đang giao' : 'Tới hub đích'}
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
                    {allowed && !canStart && !canDeliver && (
                      <span className="text-[12px] font-bold text-muted-foreground">Không thao tác được</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[13px]">
                  <p className="font-bold text-foreground">{waybill.receiver_info}</p>
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
