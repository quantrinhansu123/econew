import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, Loader2, X } from 'lucide-react';
import type { Trip } from '../types';

export interface TripScheduleFormState {
  departure_time: string;
  arrival_time: string;
}

interface Props {
  trip: Trip | null;
  formState: TripScheduleFormState;
  isSubmitting: boolean;
  error?: string;
  onChange: (key: keyof TripScheduleFormState, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function EditTripScheduleDialog({
  trip,
  formState,
  isSubmitting,
  error = '',
  onChange,
  onClose,
  onSubmit,
}: Props) {
  if (!trip) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <section className="relative z-10 w-full rounded-t-[26px] border border-border bg-white shadow-2xl sm:max-w-[560px] sm:rounded-[26px]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[17px] font-black text-foreground">Sửa lịch chuyến #{trip.id}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">Cập nhật ngày khởi hành và ngày dự kiến đến.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted"><X size={20} /></button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
            Ngày khởi hành
            <input type="datetime-local" value={formState.departure_time} onChange={(event) => onChange('departure_time', event.target.value)} className="h-11 rounded-xl border border-border bg-white px-3 text-[14px] font-semibold text-foreground outline-none focus:border-primary" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
            Ngày dự kiến đến
            <input type="datetime-local" value={formState.arrival_time} onChange={(event) => onChange('arrival_time', event.target.value)} className="h-11 rounded-xl border border-border bg-white px-3 text-[14px] font-semibold text-foreground outline-none focus:border-primary" />
          </label>
          {error ? <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700 sm:col-span-2"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{error}</div> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground disabled:opacity-50">Hủy</button>
          <button type="button" disabled={isSubmitting || !formState.departure_time} onClick={onSubmit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <CalendarClock size={15} />}Lưu lịch chuyến
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
