import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Edit3, Loader2, Plus, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../../lib/api';
import { formatAmountInput, formatAmountInputFromNumber, formatMoney, parseAmountInput } from '../../../lib/formatMoney';
import type { ListResponse, Trip, TripExpense, VendorSummary } from '../types';

interface Props {
  trip: Trip | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ExpenseFormState {
  vendor_id: string;
  category: string;
  amount: string;
  description: string;
}

const EXPENSE_CATEGORIES = [
  { value: 'FUEL', label: 'Nhiên liệu' },
  { value: 'TOLL', label: 'Cầu đường' },
  { value: 'LOADING_UNLOADING', label: 'Bốc xếp' },
  { value: 'EN_ROUTE_DROP', label: 'Thả hàng dọc đường' },
  { value: 'WAREHOUSE', label: 'Kho / bưu cục' },
  { value: 'PARKING', label: 'Bến bãi / gửi xe' },
  { value: 'REPAIR', label: 'Sửa chữa' },
  { value: 'DRIVER_ALLOWANCE', label: 'Phụ cấp tài xế' },
  { value: 'OTHER', label: 'Chi phí khác' },
] as const;

const categoryLabels = Object.fromEntries(EXPENSE_CATEGORIES.map((item) => [item.value, item.label]));
const emptyForm = (): ExpenseFormState => ({ vendor_id: '', category: 'OTHER', amount: '', description: '' });
const normalizeList = <T,>(response: ListResponse<T> | T[]) => Array.isArray(response) ? response : response.items || response.data || [];

export default function UpdateTripCostsDialog({ trip, onClose, onSaved }: Props) {
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [form, setForm] = useState<ExpenseFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!trip) return;
    setLoading(true);
    setError('');
    try {
      const [expenseResponse, vendorResponse] = await Promise.all([
        apiRequest<TripExpense[]>(`/trips/${trip.id}/expenses`),
        apiRequest<ListResponse<VendorSummary> | VendorSummary[]>('/vendors/active?limit=100'),
      ]);
      setExpenses(Array.isArray(expenseResponse) ? expenseResponse : []);
      setVendors(normalizeList(vendorResponse));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không tải được chi phí chuyến.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!trip) return;
    setForm(emptyForm());
    setEditingId(null);
    void loadData();
  }, [trip?.id]);

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0), [expenses]);

  if (!trip) return null;

  const startEdit = (expense: TripExpense) => {
    setEditingId(String(expense.id));
    setForm({
      vendor_id: String(expense.vendor_id || expense.vendor?.id || ''),
      category: String(expense.category || 'OTHER'),
      amount: formatAmountInputFromNumber(expense.amount),
      description: String(expense.description || ''),
    });
    setError('');
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
  };

  const submit = async () => {
    const amount = parseAmountInput(form.amount);
    if (!form.vendor_id) {
      setError('Chọn nhà cung cấp cho khoản chi.');
      return;
    }
    if (amount <= 0) {
      setError('Số tiền phải lớn hơn 0.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        vendor_id: Number(form.vendor_id),
        category: form.category,
        amount,
        description: form.description.trim() || undefined,
      };
      if (editingId) await apiRequest(`/expenses/${editingId}`, { method: 'PATCH', body });
      else await apiRequest('/expenses', { method: 'POST', body: { ...body, trip_id: Number(trip.id) } });
      await loadData();
      resetForm();
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được khoản chi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Chi phí chuyến</p>
            <h2 className="text-[16px] font-extrabold text-foreground">Chuyến #{trip.id}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">Mỗi khoản chi được gắn với NCC và loại chi phí để theo dõi công nợ.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="grid gap-3 rounded-2xl border border-border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_180px_1.4fr_auto] xl:items-end">
            <label className="text-[12px] font-bold text-muted-foreground">
              Nhà cung cấp
              <select value={form.vendor_id} onChange={(event) => setForm((current) => ({ ...current, vendor_id: event.target.value }))} disabled={saving} className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                <option value="">Chọn NCC</option>
                {vendors.map((vendor) => <option key={String(vendor.id)} value={String(vendor.id)}>{vendor.code ? `${vendor.code} · ` : ''}{vendor.name || `NCC #${vendor.id}`}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-bold text-muted-foreground">
              Loại chi phí
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} disabled={saving} className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                {EXPENSE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-bold text-muted-foreground">
              Số tiền
              <input inputMode="numeric" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: formatAmountInput(event.target.value) }))} disabled={saving} placeholder="0" className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-right text-[13px] font-extrabold text-foreground outline-none" />
            </label>
            <label className="text-[12px] font-bold text-muted-foreground">
              Nội dung
              <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} disabled={saving} maxLength={500} placeholder="Nội dung khoản chi..." className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-medium text-foreground outline-none" />
            </label>
            <div className="flex gap-2 md:col-span-2 xl:col-span-1">
              <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-extrabold text-white disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={15} /> : editingId ? <Check size={15} /> : <Plus size={15} />}
                {editingId ? 'Cập nhật' : 'Thêm'}
              </button>
              {editingId && <button type="button" onClick={resetForm} disabled={saving} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground"><X size={15} /></button>}
            </div>
          </div>

          {error && <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800"><AlertTriangle size={15} />{error}</div>}

          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
              <p className="text-[13px] font-extrabold text-foreground">Các khoản chi ({expenses.length})</p>
              <p className="text-[13px] font-extrabold text-primary">Tổng: {formatMoney(total, { empty: '0 đ' })}</p>
            </div>
            {loading ? (
              <div className="flex min-h-28 items-center justify-center"><Loader2 className="animate-spin text-primary" size={22} /></div>
            ) : expenses.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] font-medium text-muted-foreground">Chưa có khoản chi nào.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">NCC</th><th className="px-4 py-3">Loại chi</th><th className="px-4 py-3">Nội dung</th><th className="px-4 py-3 text-right">Số tiền</th><th className="w-16 px-4 py-3"></th></tr></thead>
                  <tbody className="divide-y divide-border/70">
                    {expenses.map((expense) => <tr key={String(expense.id)}>
                      <td className="px-4 py-3 font-bold text-primary">{expense.vendor?.code || expense.vendor?.name || '—'}</td>
                      <td className="px-4 py-3 font-bold text-foreground">{categoryLabels[String(expense.category || '')] || expense.category || 'Khác'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{expense.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-foreground">{formatMoney(expense.amount, { empty: '0 đ' })}</td>
                      <td className="px-4 py-3 text-right"><button type="button" title="Sửa khoản chi" onClick={() => startEdit(expense)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary"><Edit3 size={14} /></button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-60">Đóng</button>
        </div>
      </div>
    </div>
  );
}
