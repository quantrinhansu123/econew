import React from 'react';
import { CheckCircle2, PackageCheck, X } from 'lucide-react';

import { parseWaybillImages } from '../../../../lib/waybillImages';
import type { ReceiveFormState, WaybillDetail } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isSubmitting: boolean;
  waybill: WaybillDetail | null;
  formState: ReceiveFormState;
  onClose: () => void;
  onConfirm: () => void;
}

const displayCode = (waybill: WaybillDetail | null) => waybill?.waybill_code || waybill?.code || `#${waybill?.id ?? ''}`;

export default function WaybillReceiveConfirmDialog({ isOpen, isClosing, isSubmitting, waybill, formState, onClose, onConfirm }: Props) {
  if (!isOpen && !isClosing) return null;
  const photoCount = parseWaybillImages(formState.deliveryPhotoUrl).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className={`w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${isClosing ? 'animate-out fade-out slide-out-to-bottom-4 duration-200' : 'animate-in fade-in slide-in-from-bottom-4 duration-300'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <PackageCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Xác nhận tiếp nhận đơn</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Kiểm tra thông tin trước khi chuyển vận đơn vào kho.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-2xl border border-border bg-muted/10 p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Mã vận đơn</p>
            <p className="mt-1 text-xl font-black text-foreground">{displayCode(waybill)}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Ảnh tiếp nhận" value={photoCount > 0 ? `${photoCount} ảnh đã upload` : '—'} />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted">Hủy</button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
            <CheckCircle2 size={16} /> {isSubmitting ? 'Đang tiếp nhận...' : 'Xác nhận nhận hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[13px] font-bold text-foreground">{value}</p>
    </div>
  );
}
