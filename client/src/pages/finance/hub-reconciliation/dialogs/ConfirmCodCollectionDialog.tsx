import { CheckCircle2, Loader2, WalletCards, X } from 'lucide-react';
import { formatMoney } from '../../../../lib/formatMoney';
import type { CashFund, CodReconciliationWaybill } from '../types';

interface Props {
  waybill: CodReconciliationWaybill | null;
  funds: CashFund[];
  fundId: string;
  note: string;
  submitting: boolean;
  error: string;
  onFundChange: (fundId: string) => void;
  onNoteChange: (note: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onManageFunds: () => void;
}

export default function ConfirmCodCollectionDialog({
  waybill,
  funds,
  fundId,
  note,
  submitting,
  error,
  onFundChange,
  onNoteChange,
  onClose,
  onSubmit,
  onManageFunds,
}: Props) {
  if (!waybill) return null;
  const activeFunds = funds.filter((fund) => fund.is_active);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Xác nhận tiền phải thu khi phát</p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">{waybill.waybill_code || `#${waybill.id}`}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-slate-50 p-3 text-[12px]">
            <Metric label="Cước thu đầu nhận" value={formatMoney(waybill.cc_amount)} />
            <Metric label="COD" value={formatMoney(waybill.cod_amount)} />
            <Metric label="Tổng xác nhận" value={formatMoney(waybill.collect_amount)} accent />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px]">
            <span className="font-bold text-muted-foreground">Hình thức TT</span>
            <span className="text-right font-extrabold text-foreground">{waybill.payment_method || waybill.payment_type || '—'}</span>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tiền về sổ quỹ</span>
            <select
              value={fundId}
              onChange={(event) => onFundChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary"
            >
              <option value="">Chọn sổ quỹ nhận tiền</option>
              {activeFunds.map((fund) => (
                <option key={String(fund.id)} value={String(fund.id)}>{fund.code} · {fund.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú</span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              maxLength={1024}
              rows={3}
              disabled={submitting}
              placeholder="Nhập nội dung cần ghi chú cho lần xác nhận..."
              className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-medium outline-none focus:border-primary disabled:opacity-60"
            />
          </label>

          {!activeFunds.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] font-bold text-amber-800">
              Chưa có sổ quỹ đang hoạt động. Tạo sổ quỹ trước khi xác nhận.
            </div>
          )}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-slate-50 px-5 py-4">
          <button type="button" onClick={onManageFunds} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-primary hover:bg-muted">
            <WalletCards size={15} /> Quản lý sổ quỹ
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted">Hủy</button>
            <button type="button" disabled={submitting || !fundId} onClick={onSubmit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Xác nhận
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><p className="font-bold text-muted-foreground">{label}</p><p className={`mt-1 font-extrabold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p></div>;
}
