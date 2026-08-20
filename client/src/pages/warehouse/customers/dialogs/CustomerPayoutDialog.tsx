import { useEffect, useMemo, useState } from 'react';
import { HandCoins, Loader2, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../../../lib/api';
import CashFundSelect from '../../../../components/finance/CashFundSelect';
import { formatAmountInput, formatAmountInputFromNumber, formatMoney, parseAmountInput } from '../../../../lib/formatMoney';
import type { WaybillInventoryItem } from '../../inventory/types';

export interface CustomerCreditBill {
  item: WaybillInventoryItem;
  credit: number;
}

interface Props {
  open: boolean;
  customerName: string;
  customerCode: string;
  accountCredit: number;
  bills: CustomerCreditBill[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function CustomerPayoutDialog({
  open,
  customerName,
  customerCode,
  accountCredit,
  bills,
  onClose,
  onSaved,
}: Props) {
  const [waybillId, setWaybillId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [fundId, setFundId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => bills.find(({ item }) => String(item.id) === waybillId) ?? null,
    [bills, waybillId],
  );
  const maxPayout = Math.min(accountCredit, selected?.credit ?? 0);

  useEffect(() => {
    if (!open) return;
    const first = bills[0] ?? null;
    const firstMaximum = Math.min(accountCredit, first?.credit ?? 0);
    queueMicrotask(() => {
      setWaybillId(first ? String(first.item.id) : '');
      setAmountInput(firstMaximum > 0 ? formatAmountInputFromNumber(firstMaximum) : '');
      setNote('');
      setFundId('');
      setError('');
    });
  }, [accountCredit, bills, open]);

  if (!open) return null;

  const selectBill = (id: string) => {
    const bill = bills.find(({ item }) => String(item.id) === id);
    setWaybillId(id);
    setAmountInput(formatAmountInputFromNumber(Math.min(accountCredit, bill?.credit ?? 0)));
    setError('');
  };

  const submit = async () => {
    if (!selected) {
      setError('Chọn bill có số tiền dư cần chi trả.');
      return;
    }
    const amount = parseAmountInput(amountInput);
    if (amount <= 0 || amount > maxPayout) {
      setError(`Số tiền chi phải từ 1 đ đến ${formatMoney(maxPayout)}.`);
      return;
    }
    if (!fundId) {
      setError('Vui lòng chọn sổ quỹ chi tiền.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const billCode = selected.item.waybill_code || selected.item.code || String(selected.item.id);
      await apiRequest(`/waybills/${selected.item.id}/cash-vouchers`, {
        method: 'POST',
        body: {
          waybill_code: billCode,
          voucher_type: 'Chi',
          source_type: 'CUSTOMER_PAYOUT',
          amount,
          fund_id: fundId,
          note: note.trim() || `Chi trả tiền dư cho khách ${customerCode}`,
        },
      });
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lập được phiếu chi trả khách.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700">Phiếu chi tiền khách dư</p>
            <h3 className="mt-1 text-lg font-extrabold text-foreground">{customerName}</h3>
            <p className="text-[12px] font-bold text-primary">{customerCode}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">ECO cần trả khách</p>
            <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{formatMoney(accountCredit)}</p>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Đối trừ theo bill</span>
            <select value={waybillId} onChange={(event) => selectBill(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold">
              <option value="">Chọn bill</option>
              {bills.map(({ item, credit }) => {
                const code = item.waybill_code || item.code || `#${item.id}`;
                return <option key={String(item.id)} value={String(item.id)}>{code} · dư {formatMoney(credit)}</option>;
              })}
            </select>
          </label>

          <CashFundSelect value={fundId} onChange={(value) => { setFundId(value); setError(''); }} label="Sổ quỹ chi tiền" />

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Số tiền chi</span>
            <input
              type="text"
              inputMode="numeric"
              value={amountInput}
              onChange={(event) => {
                setAmountInput(formatAmountInput(event.target.value));
                setError('');
              }}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] font-extrabold tabular-nums outline-none focus:border-amber-400"
            />
            {selected && <p className="mt-1 text-[11px] font-bold text-muted-foreground">Tối đa theo bill và công nợ: {formatMoney(maxPayout)}</p>}
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Nội dung chuyển khoản / chi tiền..." className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium outline-none focus:border-amber-400" />
          </label>

          {!bills.length && <p className="rounded-xl border border-border bg-slate-50 px-3 py-3 text-[12px] font-bold text-muted-foreground">Không có bill đang dư tiền để lập phiếu chi.</p>}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground">Hủy</button>
          <button type="button" disabled={submitting || !selected || maxPayout <= 0} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-[13px] font-extrabold text-white hover:bg-amber-700 disabled:opacity-50">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <HandCoins size={15} />}
            Lập phiếu chi
          </button>
        </div>
      </div>
    </div>
  );
}
