import { CheckCircle2, FileText, Printer, RotateCcw, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { BadgeConfig, CreatedWaybill } from '../types';

interface CreateWaybillSuccessDialogProps {
  isOpen: boolean;
  isClosing: boolean;
  waybill: CreatedWaybill | null;
  statusConfig: Record<string, BadgeConfig>;
  paymentConfig: Record<string, BadgeConfig>;
  onClose: () => void;
  onCreateAnother: () => void;
  onPrint: () => void;
}

const displayCode = (waybill: CreatedWaybill | null) => waybill?.waybill_code || waybill?.code || (waybill?.id ? `#${waybill.id}` : '—');

function Badge({ config, fallback }: { config?: BadgeConfig; fallback: string }) {
  const resolved = config || { label: fallback || '—', className: 'bg-muted text-muted-foreground border-border' };
  return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider', resolved.className)}>{resolved.label}</span>;
}

export default function CreateWaybillSuccessDialog({ isOpen, isClosing, waybill, statusConfig, paymentConfig, onClose, onCreateAnother, onPrint }: CreateWaybillSuccessDialogProps) {
  if (!isOpen) return null;

  const status = String(waybill?.current_state || 'RECEIVED').toUpperCase();
  const paymentType = String(waybill?.payment_type || '').toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-background shadow-2xl', isClosing ? 'animate-out fade-out zoom-out-95 duration-200' : 'animate-in fade-in zoom-in-95 duration-200')}>
        <div className="flex items-start justify-between border-b border-border bg-emerald-50/80 p-5">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={22} /></div>
            <div>
              <h2 className="text-lg font-black text-foreground">Tạo vận đơn thành công</h2>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">Vận đơn mặc định ở trạng thái RECEIVED.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-white/80 hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Mã vận đơn</p>
                <p className="mt-1 text-2xl font-black text-primary">{displayCode(waybill)}</p>
              </div>
              <FileText className="text-primary" size={28} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge config={statusConfig[status]} fallback={status} />
              {paymentType && <Badge config={paymentConfig[paymentType]} fallback={paymentType} />}
            </div>
          </div>

          <button onClick={onPrint} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[13px] font-bold text-foreground hover:bg-muted"><Printer size={16} />In phiếu</button>
          <button onClick={onCreateAnother} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"><RotateCcw size={16} />Tạo đơn khác</button>
        </div>
      </div>
    </div>
  );
}

