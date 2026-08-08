import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { Trip, TripAction } from '../types';

const actionLabels: Record<TripAction, string> = {
  start: 'bắt đầu chuyến',
  arrive: 'xác nhận xe đến hub đích',
  complete: 'hoàn tất chuyến',
  cancel: 'hủy chuyến',
};

const actionDescriptions: Record<TripAction, string> = {
  start: 'Chuyến xe sẽ chuyển sang trạng thái đang vận chuyển và ghi nhận thời điểm khởi hành.',
  arrive: 'Chuyến xe sẽ được ghi nhận đã đến hub đích và cập nhật thời điểm đến.',
  complete: 'Chuyến xe sẽ được đóng hoàn tất; xe có thể quay lại trạng thái sẵn sàng nếu không còn chuyến đang chạy.',
  cancel: 'Chuyến chờ khởi hành sẽ bị hủy; các kiện đang giữ trên chuyến được trả lại danh sách tồn kho.',
};

interface Props {
  trip: Trip | null;
  action: TripAction | null;
  isSubmitting: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function TripStatusActionDialog({ trip, action, isSubmitting, error, onClose, onConfirm }: Props) {
  if (!trip || !action) return null;
  const isCancel = action === 'cancel';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isCancel ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-primary'}`}>
            {isCancel ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <h2 className="text-[16px] font-extrabold text-foreground">Xác nhận {actionLabels[action]}</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{actionDescriptions[action]}</p>
          </div>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800"><AlertTriangle size={15} />{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={isSubmitting} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-60">Đóng</button>
          <button onClick={onConfirm} disabled={isSubmitting} className={`h-10 rounded-xl px-4 text-[13px] font-bold text-white disabled:opacity-60 ${isCancel ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'}`}>{isSubmitting ? <Loader2 className="animate-spin" size={16} /> : 'Xác nhận'}</button>
        </div>
      </div>
    </div>
  );
}
