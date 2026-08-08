import { X } from 'lucide-react';
import type { LastMileWaybill, WaybillHistoryItem } from '../types';
import { formatWaybillHistoryValue, waybillHistoryActionLabel, waybillHistoryFieldLabel } from '../../../warehouse/inventory/waybillHistory';

export default function DeliveryHistoryDialog({ waybill, items, loading, onClose }: { waybill: LastMileWaybill | null; items: WaybillHistoryItem[]; loading: boolean; onClose: () => void }) {
  if (!waybill) return null;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4"><div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-extrabold">Lịch sử giao hàng</h2><p className="text-xs text-muted-foreground">{waybill.waybill_code}</p></div><button onClick={onClose}><X size={20}/></button></div>
    <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">{loading ? <p className="text-sm">Đang tải...</p> : !items.length ? <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p> : items.map((item) => <div key={String(item.id)} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><b className="text-sm">{waybillHistoryActionLabel(item.action)}</b><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('vi-VN')}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.changed_by_name || 'Hệ thống'}</p>{item.changes && <div className="mt-2 text-xs">{Object.entries(item.changes).map(([field, change]) => <p key={field}><b>{waybillHistoryFieldLabel(field)}:</b> {formatWaybillHistoryValue(field, change.old_value)} → {formatWaybillHistoryValue(field, change.new_value)}</p>)}</div>}</div>)}</div>
  </div></div>;
}
