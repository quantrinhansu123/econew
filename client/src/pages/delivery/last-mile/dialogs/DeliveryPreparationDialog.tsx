import { useState } from 'react';
import { X } from 'lucide-react';
import type { LastMileWaybill } from '../types';

type PreparationStatus = 'READY' | 'SCHEDULED' | 'HOLD';

export default function DeliveryPreparationDialog({ waybill, busy, error, onClose, onConfirm }: {
  waybill: LastMileWaybill;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (status: PreparationStatus, scheduledAt?: string, reason?: string, note?: string) => void;
}) {
  const [status, setStatus] = useState<PreparationStatus>(waybill.delivery_preparation_status === 'SCHEDULED' ? 'SCHEDULED' : waybill.delivery_preparation_status === 'HOLD' ? 'HOLD' : 'READY');
  const [scheduledAt, setScheduledAt] = useState(waybill.delivery_scheduled_at ? new Date(waybill.delivery_scheduled_at).toISOString().slice(0, 16) : '');
  const [reason, setReason] = useState(waybill.delivery_hold_reason || '');
  const [note, setNote] = useState(waybill.delivery_preparation_note || '');
  const isPreArrival = String(waybill.current_state || '').toUpperCase() === 'IN_TRANSIT';
  const invalid = status === 'SCHEDULED' ? !scheduledAt : status === 'HOLD' ? !reason.trim() : false;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
    <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-extrabold">{isPreArrival ? 'Gọi hẹn trước khi xe đến HUB' : 'Xử lý trước giao hàng'}</h2><p className="text-xs text-muted-foreground">{waybill.waybill_code}{waybill.trip_id ? ` · Chuyến #${waybill.trip_id}` : ''} · xác nhận với người nhận</p></div><button onClick={onClose}><X size={20}/></button></div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {[['READY', isPreArrival ? 'Đã gọi · khách sẵn sàng nhận' : 'Sẵn sàng giao'],['SCHEDULED', isPreArrival ? 'Đã gọi · khách hẹn ngày giao' : 'Lưu kho · hẹn ngày giao'],['HOLD', isPreArrival ? 'Không liên hệ được / cần gọi lại' : 'Lưu kho chờ xử lý']].map(([value,label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold"><input type="radio" checked={status === value} onChange={() => setStatus(value as PreparationStatus)}/>{label}</label>)}
        {status === 'SCHEDULED' && <label className="block text-xs font-bold">Ngày giờ giao dự kiến<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>}
        {status === 'HOLD' && <label className="block text-xs font-bold">Lý do chờ xử lý<textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border p-3 text-sm" placeholder="Nhập lý do..."/></label>}
        <label className="block text-xs font-bold">
          Ghi chú gọi hẹn <span className="font-medium text-muted-foreground">(không bắt buộc)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            className="mt-1 min-h-20 w-full rounded-lg border p-3 text-sm font-medium"
            placeholder="VD: Khách đồng ý nhận sau 18:00, gọi trước 15 phút..."
          />
          <span className="mt-1 block text-right text-[10px] font-medium text-muted-foreground">{note.length}/500</span>
        </label>
        {error && <p className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t p-4"><button onClick={onClose} className="h-10 rounded-lg border px-4 text-sm font-bold">Hủy</button><button disabled={busy || invalid} onClick={() => onConfirm(status, scheduledAt || undefined, reason.trim() || undefined, note.trim())} className="h-10 rounded-lg bg-primary px-5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu xử lý'}</button></div>
    </div>
  </div>;
}
