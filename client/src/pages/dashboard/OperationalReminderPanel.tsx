import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, Check, Loader2, Pencil, Plus, Truck as TruckIcon, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../lib/api';
import { formatDateKey } from '../admin/trucks/truckCompliance';
import type { Truck, TruckComplianceResponse, TruckListResponse } from '../admin/trucks/types';
import type { OperationalReminder, OperationalReminderResponse } from './reminderTypes';

type ReminderForm = {
  title: string;
  remind_date: string;
  truck_id: string;
  note: string;
};

const emptyForm = (): ReminderForm => ({ title: '', remind_date: '', truck_id: '', note: '' });
const normalizeTrucks = (response: TruckListResponse | Truck[]) => Array.isArray(response) ? response : response.items || response.data || response.trucks || [];

export default function OperationalReminderPanel({
  compliance,
  reminders,
  canManage,
  onRefresh,
}: {
  compliance: TruckComplianceResponse | null;
  reminders: OperationalReminderResponse | null;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<OperationalReminder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const fixedAlerts = useMemo(() => compliance?.items.flatMap((truck) => truck.alerts.map((alert) => ({ truck, alert }))) || [], [compliance]);
  const customItems = reminders?.items || [];
  const dueCount = (compliance?.meta.total_alerts || 0) + (reminders?.meta.due || 0);
  const totalCount = fixedAlerts.length + customItems.length;

  const openCreate = () => {
    setEditing(null);
    setActionError('');
    setIsFormOpen(true);
  };
  const openEdit = (item: OperationalReminder) => {
    setEditing(item);
    setActionError('');
    setIsFormOpen(true);
  };
  const complete = async (item: OperationalReminder) => {
    setActionError('');
    setIsSubmitting(true);
    try {
      await apiRequest(`/reminders/${item.id}/complete`, { method: 'PATCH' });
      await onRefresh();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không đánh dấu được cảnh báo đã xử lý.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-amber-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><AlertTriangle size={20} /></div>
          <div>
            <h2 className="text-[14px] font-extrabold text-amber-950">Cảnh báo cần xử lý</h2>
            <p className="mt-0.5 text-[12px] font-medium text-amber-800">{dueCount} cảnh báo đến hạn · {reminders?.meta.upcoming || 0} lịch nhắc sắp tới</p>
          </div>
        </div>
        {canManage && <button type="button" onClick={openCreate} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 text-[12px] font-bold text-white hover:bg-amber-800"><Plus size={14} />Thêm cảnh báo</button>}
      </div>
      {actionError && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] font-bold text-red-700">{actionError}</div>}
      {totalCount === 0 ? (
        <p className="px-4 py-5 text-center text-[13px] font-medium text-amber-800">Chưa có cảnh báo hoặc lịch nhắc đang hoạt động.</p>
      ) : (
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {fixedAlerts.slice(0, 6).map(({ truck, alert }) => (
            <article key={`${truck.id}-${alert.type}`} className="rounded-xl border border-amber-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-extrabold text-slate-900">{truck.license_plate}</p><span className="text-[10px] font-bold text-slate-500">{truck.hub_code || 'Nội bộ'}</span></div>
              <div className={clsx('mt-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold', alert.status === 'EXPIRED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}><span className="inline-flex items-center gap-1"><CalendarClock size={12} />{alert.label}: {formatDateKey(alert.expiry_date)}</span><span>{alert.days_remaining < 0 ? `Quá ${Math.abs(alert.days_remaining)} ngày` : alert.days_remaining === 0 ? 'Hôm nay' : `Còn ${alert.days_remaining} ngày`}</span></div>
            </article>
          ))}
          {customItems.slice(0, 9).map((item) => (
            <article key={item.id} className={clsx('rounded-xl border bg-white px-3 py-2.5', item.is_due ? 'border-red-200' : 'border-blue-200')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-[13px] font-extrabold text-slate-900" title={item.title}>{item.title}</p><p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{item.truck?.license_plate || item.hub?.code || 'Cảnh báo chung'}</p></div>
                <span className={clsx('shrink-0 rounded-full px-2 py-1 text-[10px] font-bold', item.is_due ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}>{item.is_due ? 'Đến hạn' : 'Đã cài lịch'}</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-slate-700"><CalendarClock size={12} />Ngày nhắc: {formatDateKey(item.remind_date)}</div>
              {item.note && <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-4 text-slate-600">{item.note}</p>}
              {canManage && <div className="mt-2 flex justify-end gap-1.5 border-t border-slate-100 pt-2"><button type="button" disabled={isSubmitting} onClick={() => openEdit(item)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-muted disabled:opacity-50"><Pencil size={11} />Sửa</button><button type="button" disabled={isSubmitting} onClick={() => void complete(item)} className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={11} />Đã xử lý</button></div>}
            </article>
          ))}
        </div>
      )}
      {isFormOpen && <ReminderDialog
        key={editing?.id ?? 'new'}
        open={isFormOpen}
        editing={editing}
        onClose={() => setIsFormOpen(false)}
        onSaved={async () => { setIsFormOpen(false); await onRefresh(); }}
      />}
    </section>
  );
}

function ReminderDialog({ open, editing, onClose, onSaved }: { open: boolean; editing: OperationalReminder | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<ReminderForm>(() => editing ? {
    title: editing.title,
    remind_date: editing.remind_date,
    truck_id: String(editing.truck_id || ''),
    note: editing.note || '',
  } : emptyForm());
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [isLoadingTrucks, setIsLoadingTrucks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    void apiRequest<TruckListResponse | Truck[]>('/trucks/internal?limit=100')
      .then((response) => setTrucks(normalizeTrucks(response)))
      .catch(() => setTrucks([]))
      .finally(() => setIsLoadingTrucks(false));
  }, [editing, open]);

  if (!open) return null;
  const submit = async () => {
    if (!form.title.trim() || !form.remind_date) {
      setError('Nhập nội dung và ngày nhắc.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest(editing ? `/reminders/${editing.id}` : '/reminders', {
        method: editing ? 'PATCH' : 'POST',
        body: { title: form.title.trim(), remind_date: form.remind_date, truck_id: form.truck_id, note: form.note.trim() },
      });
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được cảnh báo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} aria-label="Đóng" />
      <section className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Cảnh báo cần xử lý</p><h2 className="text-[17px] font-extrabold text-slate-900">{editing ? 'Chỉnh sửa lịch nhắc' : 'Thêm lịch nhắc'}</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-muted"><X size={18} /></button></header>
        <div className="space-y-4 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</div>}
          <Field label="Nội dung cần nhắc *"><input autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={160} placeholder="Ví dụ: Gia hạn đăng kiểm xe" className={inputClass} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Ngày nhắc *"><input type="date" value={form.remind_date} onChange={(event) => setForm((current) => ({ ...current, remind_date: event.target.value }))} className={inputClass} /></Field><Field label="Xe nội bộ (không bắt buộc)"><div className="relative"><TruckIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select value={form.truck_id} disabled={isLoadingTrucks} onChange={(event) => setForm((current) => ({ ...current, truck_id: event.target.value }))} className={`${inputClass} pl-9`}><option value="">Cảnh báo chung</option>{trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.license_plate}{truck.hub?.code ? ` · ${truck.hub.code}` : ''}</option>)}</select>{isLoadingTrucks && <Loader2 size={14} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}</div></Field></div>
          <Field label="Ghi chú"><textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={3} maxLength={2000} placeholder="Thông tin giấy tờ hoặc việc cần xử lý..." className={`${inputClass} h-auto resize-y py-2.5`} /></Field>
        </div>
        <footer className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-3"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-border bg-white px-4 text-[13px] font-bold text-slate-600 hover:bg-muted">Hủy</button><button type="button" disabled={isSubmitting} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50">{isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}Lưu lịch nhắc</button></footer>
      </section>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-[12px] font-bold text-slate-700">{label}</span>{children}</label>;
}

const inputClass = 'h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium text-slate-900 outline-none focus:ring-2 focus:ring-primary/15';
