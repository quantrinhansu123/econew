import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Edit3, Loader2, Plus, Save, Trash2, WalletCards, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from '../../../../lib/formatMoney';
import type { CashFund, CashFundTransfer } from '../types';

interface Props {
  open: boolean;
  funds: CashFund[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

interface FundForm {
  id: string;
  code: string;
  name: string;
  opening_balance: string;
  note: string;
  is_active: boolean;
}

interface TransferForm {
  from_fund_id: string;
  to_fund_id: string;
  transfer_date: string;
  amount: string;
  note: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyForm: FundForm = { id: '', code: '', name: '', opening_balance: '', note: '', is_active: true };
const emptyTransfer = (): TransferForm => ({
  from_fund_id: '',
  to_fund_id: '',
  transfer_date: todayIso(),
  amount: '',
  note: '',
});
const fieldClass = 'h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary';

export default function CashFundManagerDialog({ open, funds, onClose, onChanged }: Props) {
  const [activeTab, setActiveTab] = useState<'funds' | 'transfer'>('funds');
  const [form, setForm] = useState<FundForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [transfers, setTransfers] = useState<CashFundTransfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransfer);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const loadTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    try {
      const rows = await apiRequest<CashFundTransfer[]>('/finance/cash-fund-transfers');
      setTransfers(Array.isArray(rows) ? rows : []);
    } catch {
      setTransfers([]);
    } finally {
      setLoadingTransfers(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setForm(emptyForm);
      setTransferForm(emptyTransfer());
      setError('');
      setNotice('');
      void loadTransfers();
    });
  }, [open, loadTransfers]);

  if (!open) return null;

  const activeFunds = funds.filter((fund) => fund.is_active !== false);

  const edit = (fund: CashFund) => {
    setActiveTab('funds');
    setForm({
      id: String(fund.id),
      code: fund.code || '',
      name: fund.name || '',
      opening_balance: formatAmountInputFromNumber(Number(fund.opening_balance ?? 0)),
      note: fund.note || '',
      is_active: fund.is_active,
    });
    setError('');
    setNotice('');
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Nhập đầy đủ mã quỹ và tên sổ quỹ.');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        opening_balance: parseAmountInput(form.opening_balance),
        note: form.note.trim() || undefined,
        is_active: form.is_active,
      };
      await apiRequest(form.id ? `/finance/cash-funds/${form.id}` : '/finance/cash-funds', {
        method: form.id ? 'PATCH' : 'POST',
        body: payload,
      });
      setNotice(form.id ? `Đã cập nhật sổ quỹ ${payload.code}.` : `Đã tạo sổ quỹ ${payload.code}.`);
      setForm(emptyForm);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được sổ quỹ.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTransfer = async () => {
    const amount = parseAmountInput(transferForm.amount);
    if (!transferForm.from_fund_id || !transferForm.to_fund_id) {
      setError('Vui lòng chọn sổ quỹ chuyển đi và sổ quỹ nhận.');
      return;
    }
    if (transferForm.from_fund_id === transferForm.to_fund_id) {
      setError('Sổ quỹ chuyển đi và sổ quỹ nhận phải khác nhau.');
      return;
    }
    if (amount <= 0) {
      setError('Số tiền chuyển quỹ phải lớn hơn 0.');
      return;
    }
    setTransferSubmitting(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/finance/cash-fund-transfers', {
        method: 'POST',
        body: {
          from_fund_id: transferForm.from_fund_id,
          to_fund_id: transferForm.to_fund_id,
          transfer_date: transferForm.transfer_date || todayIso(),
          amount,
          note: transferForm.note.trim() || undefined,
        },
      });
      setNotice(`Đã chuyển ${formatMoney(amount)} giữa các sổ quỹ (không tính vào chi phí nhật ký).`);
      setTransferForm(emptyTransfer());
      await Promise.all([onChanged(), loadTransfers()]);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không chuyển được tiền giữa các quỹ.');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const removeTransfer = async (transfer: CashFundTransfer) => {
    if (!window.confirm(`Hủy lệnh chuyển ${formatMoney(transfer.amount)} từ ${transfer.from_fund_code} sang ${transfer.to_fund_code}?`)) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await apiRequest(`/finance/cash-fund-transfers/${transfer.id}`, { method: 'DELETE' });
      setNotice('Đã xóa giao dịch chuyển quỹ và hoàn lại số dư.');
      await Promise.all([onChanged(), loadTransfers()]);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không xóa được giao dịch chuyển quỹ.');
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <WalletCards size={18} className="text-primary" />
            <h2 className="text-lg font-extrabold">Quản lý sổ quỹ &amp; Chuyển quỹ nội bộ</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-[12px] font-extrabold">
              <button
                type="button"
                onClick={() => { setActiveTab('funds'); setError(''); }}
                className={`rounded-lg px-3 py-1.5 transition-colors ${activeTab === 'funds' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Danh sách &amp; Số dư đầu kỳ
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('transfer'); setError(''); }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${activeTab === 'transfer' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <ArrowRightLeft size={13} />
                Chuyển tiền giữa các quỹ
              </button>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Đóng"><X size={18} /></button>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</div>}
          {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">{notice}</div>}

          {activeTab === 'funds' ? (
            <>
              <div className="grid gap-3 rounded-xl border border-border bg-slate-50 p-4 md:grid-cols-2">
                <Field label="Mã quỹ *">
                  <input
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    maxLength={32}
                    placeholder="VD: QUY_HAN"
                    className={fieldClass}
                  />
                </Field>
                <Field label="Tên sổ quỹ *">
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Quỹ tiền mặt Hà Nội"
                    className={fieldClass}
                  />
                </Field>
                <Field label="Ghi chú">
                  <input
                    value={form.note}
                    onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Ghi chú sổ quỹ"
                    className={fieldClass}
                  />
                </Field>
                <Field label="Số dư ban đầu (VNĐ)">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.opening_balance}
                    onChange={(event) => setForm((current) => ({ ...current, opening_balance: formatAmountInput(event.target.value) }))}
                    placeholder="Nhập số dư đầu kỳ (VD: 500.000.000)"
                    className={`${fieldClass} text-right tabular-nums text-emerald-700`}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[13px] font-bold">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  Đang hoạt động
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(emptyForm)}
                    className="h-10 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground"
                  >
                    <Plus size={14} className="mr-1 inline" />Tạo mới
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submit()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {form.id ? 'Lưu thay đổi' : 'Thêm sổ quỹ'}
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {['Mã quỹ', 'Tên sổ quỹ', 'Số dư ban đầu', 'Số giao dịch', 'Số dư thực tế', 'Trạng thái', ''].map((header, idx) => (
                        <th key={header || idx} className={`px-3 py-2.5 font-extrabold ${idx >= 2 && idx <= 4 ? 'text-right' : ''}`}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {funds.map((fund) => {
                      const actualBalance = Number(fund.balance_amount ?? 0);
                      return (
                        <tr key={String(fund.id)} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-extrabold text-primary">{fund.code}</td>
                          <td className="px-3 py-2.5 font-bold">
                            {fund.name}
                            {fund.note && <p className="text-[11px] font-normal text-muted-foreground">{fund.note}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-700">
                            {formatMoney(fund.opening_balance ?? 0, { empty: '0 đ' })}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {Number(fund.collection_count || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-extrabold tabular-nums ${actualBalance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {formatMoney(actualBalance, { empty: '0 đ' })}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-1 font-extrabold ${fund.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {fund.is_active ? 'Hoạt động' : 'Ngừng dùng'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => edit(fund)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary hover:bg-muted"
                              title="Sửa sổ quỹ / Nhập số dư ban đầu"
                            >
                              <Edit3 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!funds.length && <p className="py-8 text-center text-[13px] font-bold text-muted-foreground">Chưa có sổ quỹ.</p>}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <p className="mb-3 text-[12px] font-bold text-blue-900">
                  Chuyển tiền nội bộ từ sổ quỹ này sang sổ quỹ khác. Giao dịch này tự động trừ quỹ chuyển và cộng quỹ nhận nhưng <b>không tính vào chi phí hay doanh thu</b> trên Sổ nhật ký thu chi.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Từ sổ quỹ (Quỹ trích tiền) *">
                    <select
                      value={transferForm.from_fund_id}
                      onChange={(event) => setTransferForm((prev) => ({ ...prev, from_fund_id: event.target.value }))}
                      className={fieldClass}
                    >
                      <option value="">-- Chọn quỹ chuyển đi --</option>
                      {activeFunds.map((fund) => (
                        <option key={String(fund.id)} value={String(fund.id)}>
                          {fund.code} · {fund.name} (Dư: {formatMoney(fund.balance_amount, { empty: '0 đ' })})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sang sổ quỹ (Quỹ nhận tiền) *">
                    <select
                      value={transferForm.to_fund_id}
                      onChange={(event) => setTransferForm((prev) => ({ ...prev, to_fund_id: event.target.value }))}
                      className={fieldClass}
                    >
                      <option value="">-- Chọn quỹ nhận tiền --</option>
                      {activeFunds.map((fund) => (
                        <option key={String(fund.id)} value={String(fund.id)}>
                          {fund.code} · {fund.name} (Dư: {formatMoney(fund.balance_amount, { empty: '0 đ' })})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Số tiền chuyển (VNĐ) *">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={transferForm.amount}
                      onChange={(event) => setTransferForm((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))}
                      placeholder="VD: 50.000.000"
                      className={`${fieldClass} text-right tabular-nums text-primary`}
                    />
                  </Field>
                  <Field label="Ngày chuyển">
                    <input
                      type="date"
                      value={transferForm.transfer_date}
                      onChange={(event) => setTransferForm((prev) => ({ ...prev, transfer_date: event.target.value }))}
                      className={fieldClass}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Nội dung / Ghi chú chuyển quỹ">
                      <input
                        value={transferForm.note}
                        onChange={(event) => setTransferForm((prev) => ({ ...prev, note: event.target.value }))}
                        placeholder="VD: Chuyển tiền từ quỹ thu hộ sang tài khoản công ty..."
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={transferSubmitting}
                    onClick={() => void submitTransfer()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
                  >
                    {transferSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                    Thực hiện chuyển quỹ
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {['Ngày chuyển', 'Từ sổ quỹ', 'Sang sổ quỹ', 'Số tiền chuyển', 'Ghi chú', 'Người lập', ''].map((header, idx) => (
                        <th key={header || idx} className={`px-3 py-2.5 font-extrabold ${idx === 3 ? 'text-right' : ''}`}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingTransfers ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-muted-foreground">
                          <Loader2 size={16} className="mr-2 inline animate-spin" />Đang tải lịch sử chuyển quỹ...
                        </td>
                      </tr>
                    ) : transfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center font-bold text-muted-foreground">
                          Chưa có giao dịch chuyển quỹ nội bộ nào.
                        </td>
                      </tr>
                    ) : (
                      transfers.map((tr) => (
                        <tr key={tr.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-bold">{new Date(tr.transfer_date).toLocaleDateString('vi-VN')}</td>
                          <td className="px-3 py-2.5 font-extrabold text-red-600">
                            {tr.from_fund_code} · {tr.from_fund_name}
                          </td>
                          <td className="px-3 py-2.5 font-extrabold text-emerald-700">
                            {tr.to_fund_code} · {tr.to_fund_name}
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-primary">
                            {formatMoney(tr.amount)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{tr.note || '—'}</td>
                          <td className="px-3 py-2.5">{tr.created_by_name || '—'}</td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => void removeTransfer(tr)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                              title="Xóa giao dịch chuyển quỹ"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
