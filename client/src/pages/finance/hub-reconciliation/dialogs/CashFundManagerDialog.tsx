import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Edit3, Loader2, Plus, Save, WalletCards, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../../../lib/api';
import { formatMoney } from '../../../../lib/formatMoney';
import type { CashFund, HubSummary } from '../types';

interface Props {
  open: boolean;
  funds: CashFund[];
  hubs: HubSummary[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

interface FundForm {
  id: string;
  code: string;
  name: string;
  hub_id: string;
  note: string;
  is_active: boolean;
}

const emptyForm: FundForm = { id: '', code: '', name: '', hub_id: '', note: '', is_active: true };
const fieldClass = 'h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary';

export default function CashFundManagerDialog({ open, funds, hubs, onClose, onChanged }: Props) {
  const [form, setForm] = useState<FundForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setForm(emptyForm);
      setError('');
    });
  }, [open]);

  if (!open) return null;
  const edit = (fund: CashFund) => {
    setForm({
      id: String(fund.id),
      code: fund.code || '',
      name: fund.name || '',
      hub_id: fund.hub_id == null ? '' : String(fund.hub_id),
      note: fund.note || '',
      is_active: fund.is_active,
    });
    setError('');
  };
  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Nhập đầy đủ mã quỹ và tên sổ quỹ.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        hub_id: form.hub_id || undefined,
        note: form.note.trim() || undefined,
        is_active: form.is_active,
      };
      await apiRequest(form.id ? `/finance/cash-funds/${form.id}` : '/finance/cash-funds', {
        method: form.id ? 'PATCH' : 'POST',
        body: payload,
      });
      setForm(emptyForm);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được sổ quỹ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2"><WalletCards size={18} className="text-primary" /><h2 className="text-lg font-extrabold">Quản lý sổ quỹ</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Đóng"><X size={18} /></button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 rounded-xl border border-border bg-slate-50 p-4 md:grid-cols-2">
            <Field label="Mã quỹ"><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={32} placeholder="VD: QUY_HAN" className={fieldClass} /></Field>
            <Field label="Tên sổ quỹ"><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Quỹ tiền mặt Hà Nội" className={fieldClass} /></Field>
            <Field label="Bưu cục"><select value={form.hub_id} onChange={(event) => setForm((current) => ({ ...current, hub_id: event.target.value }))} className={fieldClass}><option value="">Dùng chung toàn hệ thống</option>{hubs.map((hub) => <option key={String(hub.id)} value={String(hub.id)}>{hub.code || hub.name || `Hub #${hub.id}`}</option>)}</select></Field>
            <Field label="Ghi chú"><input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Ghi chú sổ quỹ" className={fieldClass} /></Field>
            <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 rounded border-border" />Đang hoạt động</label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(emptyForm)} className="h-10 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground"><Plus size={14} className="mr-1 inline" />Tạo mới</button><button type="button" disabled={submitting} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">{submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{form.id ? 'Lưu thay đổi' : 'Thêm sổ quỹ'}</button></div>
            {error && <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</div>}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{['Mã quỹ', 'Tên sổ quỹ', 'Bưu cục', 'Số phiếu thu', 'Số dư COD', 'Trạng thái', ''].map((header) => <th key={header} className="px-3 py-2.5 font-extrabold">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{funds.map((fund) => <tr key={String(fund.id)} className="hover:bg-slate-50"><td className="px-3 py-2.5 font-extrabold text-primary">{fund.code}</td><td className="px-3 py-2.5 font-bold">{fund.name}</td><td className="px-3 py-2.5">{fund.hub?.code || 'Dùng chung'}</td><td className="px-3 py-2.5 text-right tabular-nums">{Number(fund.collection_count || 0).toLocaleString('vi-VN')}</td><td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{formatMoney(fund.balance_amount)}</td><td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 font-extrabold ${fund.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{fund.is_active ? 'Hoạt động' : 'Ngừng dùng'}</span></td><td className="px-3 py-2.5 text-right"><button type="button" onClick={() => edit(fund)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary hover:bg-muted" title="Sửa sổ quỹ"><Edit3 size={14} /></button></td></tr>)}</tbody>
            </table>
            {!funds.length && <p className="py-8 text-center text-[13px] font-bold text-muted-foreground">Chưa có sổ quỹ.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
