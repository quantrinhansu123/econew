import type { ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { LoadPlanningManifest, ManifestKanbanFormState } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isSubmitting: boolean;
  manifest: LoadPlanningManifest | null;
  formState: ManifestKanbanFormState;
  onChange: <K extends keyof ManifestKanbanFormState>(key: K, value: ManifestKanbanFormState[K]) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const manifestLabel = (manifest: LoadPlanningManifest | null) => manifest?.manifest_code || manifest?.code || (manifest?.id ? `BK #${manifest.id}` : 'Bảng kê');

export default function ManifestKanbanEditDialog({
  isOpen,
  isClosing,
  isSubmitting,
  manifest,
  formState,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  if (!isOpen || !manifest) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
      <div className={`relative w-full max-w-[480px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border ${isClosing ? 'dialog-slide-out' : 'dialog-slide-in'}`}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Sửa bảng kê</p>
            <h2 className="text-lg font-extrabold text-foreground">{manifestLabel(manifest)}</h2>
          </div>
          <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <Field label="Trạng thái">
            <select
              value={formState.status}
              onChange={(event) => onChange('status', event.target.value as ManifestKanbanFormState['status'])}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none"
            >
              <option value="RUNNING">Đang chạy</option>
              <option value="ARRIVED">Đã tới</option>
            </select>
          </Field>
          <Field label="Seal">
            <input
              value={formState.seal_code}
              onChange={(event) => onChange('seal_code', event.target.value)}
              placeholder="SEAL001"
              className="h-11 w-full rounded-xl border border-border px-3 text-[13px] font-bold outline-none"
            />
          </Field>
          <Field label="Ghi chú">
            <input
              value={formState.note}
              onChange={(event) => onChange('note', event.target.value)}
              placeholder="Ghi chú bảng kê"
              className="h-11 w-full rounded-xl border border-border px-3 text-[13px] font-bold outline-none"
            />
          </Field>
          {formState.status === 'ARRIVED' && !manifestTripId(manifest) && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
              Bảng kê chưa gán chuyến xe — chỉ lưu được seal/ghi chú, không thể chuyển sang Đã tới.
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border bg-muted/10 p-4">
          <button onClick={onClose} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            Hủy
          </button>
          <button
            disabled={isSubmitting}
            onClick={onSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

function manifestTripId(manifest: LoadPlanningManifest) {
  return manifest.trip_id ?? manifest.trip?.id ?? manifest.trips?.[0]?.id ?? null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-[12px] font-extrabold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
