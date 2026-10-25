import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { LastMileWaybill, WaybillHistoryItem } from '../types';
import { formatWaybillHistoryValue, waybillHistoryActionLabel, waybillHistoryFieldLabel } from '../../../warehouse/inventory/waybillHistory';
import { useDeliveryDialogFocus } from './useDeliveryDialogFocus';

export default function DeliveryHistoryDialog({ waybill, items, loading, error, onClose }: { waybill: LastMileWaybill | null; items: WaybillHistoryItem[]; loading: boolean; error?: string; onClose: () => void }) {
  const panel = useDeliveryDialogFocus(Boolean(waybill), onClose);
  if (!waybill) return null;
  return createPortal(<div className="fixed inset-0 z-[9999] flex justify-end">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delivery-history-title" className="dialog-slide-in relative flex h-dvh w-full max-w-[720px] flex-col border-l border-border bg-slate-50 shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-white p-5"><div><h2 id="delivery-history-title" className="text-lg font-extrabold">Lịch sử giao hàng và điều phối</h2><p className="mt-1 text-[12px] text-muted-foreground">{waybill.waybill_code}</p></div><button type="button" aria-label="Đóng lịch sử" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted"><X size={20} /></button></header>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {loading ? <p className="text-sm">Đang tải...</p> : error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : !items.length ? <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p> : items.map(item => <article key={String(item.id)} className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{waybillHistoryActionLabel(item.action)}</b><time className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('vi-VN')}</time></div>
          <p className="mt-1 text-xs text-muted-foreground">{item.changed_by_name || 'Hệ thống'}</p>
          {item.changes && <dl className="mt-3 space-y-2 text-[12px]">{Object.entries(item.changes).map(([field, change]) => <div key={field} className="break-words"><dt className="font-bold text-slate-700">{waybillHistoryFieldLabel(field)}</dt><dd className="mt-0.5 text-slate-600">{formatWaybillHistoryValue(field, change.old_value)} → {formatWaybillHistoryValue(field, change.new_value)}</dd></div>)}</dl>}
        </article>)}
      </div>
      <footer className="shrink-0 border-t border-border bg-white p-5"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-5 text-[13px] font-bold">Đóng</button></footer>
    </section>
  </div>, document.body);
}
