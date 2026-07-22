import { Banknote, Check, Edit3, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from '../../../../lib/formatMoney';
import { manifestTrip } from '../manifestHubUtils';
import type { LoadPlanningManifest } from '../types';

interface ManifestExpense {
  id: string | number;
  trip_id: string | number;
  category?: string | null;
  amount?: string | number | null;
  description?: string | null;
  created_at?: string | null;
}

interface ExpenseFormState {
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

const CATEGORY_LABELS = Object.fromEntries(
  EXPENSE_CATEGORIES.map((category) => [category.value, category.label]),
) as Record<string, string>;
CATEGORY_LABELS.HCM_WAREHOUSE = 'Chi kho HCM';

const CLOSED_MANIFEST_STATUSES = new Set([
  'CLOSED',
  'MANIFEST_CLOSED',
  'ASSIGNED',
  'ASSIGNED_TO_TRIP',
  'IN_TRANSIT',
  'ARRIVED',
  'COMPLETED',
]);

const emptyForm = (): ExpenseFormState => ({ category: 'OTHER', amount: '', description: '' });

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export default function ManifestExpensesSection({
  manifest,
  canManage,
  canDelete,
}: {
  manifest: LoadPlanningManifest;
  canManage: boolean;
  canDelete: boolean;
}) {
  const trip = manifestTrip(manifest);
  const rawTripId = trip?.id ?? manifest.trip_id;
  const tripId = rawTripId != null && /^\d+$/.test(String(rawTripId)) ? String(rawTripId) : '';
  const manifestStatus = String(manifest.status || '').trim().toUpperCase();
  const isClosed = CLOSED_MANIFEST_STATUSES.has(manifestStatus);
  const [expenses, setExpenses] = useState<ManifestExpense[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(tripId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(emptyForm);

  useEffect(() => {
    if (!tripId) return undefined;
    let cancelled = false;
    void apiRequest<ManifestExpense[]>(`/trips/${tripId}/expenses`)
      .then((response) => {
        if (!cancelled) setExpenses(Array.isArray(response) ? response : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : 'Không tải được chi phí bảng kê.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [tripId]);

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
    [expenses],
  );
  const tripCost = Number(trip?.trip_cost ?? 0) || 0;
  const fuelCost = Number(trip?.fuel_cost ?? 0) || 0;
  const rawOtherCosts = Number(trip?.other_costs ?? 0) || 0;
  const legacyOtherCosts = tripCost > 0 && rawOtherCosts === tripCost ? 0 : rawOtherCosts;
  const incidentalCost = fuelCost + legacyOtherCosts + expenseTotal;
  const provisionalCost = tripCost + incidentalCost;

  const loadExpenses = async () => {
    if (!tripId) return;
    const response = await apiRequest<ManifestExpense[]>(`/trips/${tripId}/expenses`);
    setExpenses(Array.isArray(response) ? response : []);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setError('');
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setIsFormOpen(true);
  };

  const openEdit = (expense: ManifestExpense) => {
    setEditingId(String(expense.id));
    setForm({
      category: expense.category || 'OTHER',
      amount: formatAmountInputFromNumber(expense.amount),
      description: expense.description || '',
    });
    setError('');
    setIsFormOpen(true);
  };

  const submitExpense = async () => {
    const amount = parseAmountInput(form.amount);
    if (!tripId) {
      setError('Bảng kê chưa có chuyến xe để lưu chi phí.');
      return;
    }
    if (amount <= 0) {
      setError('Số tiền chi phí phải lớn hơn 0.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const body = {
        category: form.category,
        amount,
        description: form.description.trim() || undefined,
      };
      if (editingId) {
        await apiRequest(`/expenses/${editingId}`, { method: 'PATCH', body });
      } else {
        await apiRequest('/expenses', { method: 'POST', body: { ...body, trip_id: Number(tripId) } });
      }
      await loadExpenses();
      closeForm();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được chi phí bảng kê.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeExpense = async (expense: ManifestExpense) => {
    if (!window.confirm(`Xóa khoản chi ${formatMoney(expense.amount)}?`)) return;
    setIsSaving(true);
    setError('');
    try {
      await apiRequest(`/expenses/${expense.id}`, { method: 'DELETE' });
      await loadExpenses();
      if (editingId === String(expense.id)) closeForm();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không xóa được chi phí bảng kê.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Banknote size={18} />
          </span>
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.14em] text-emerald-800">Chi phí bảng kê</p>
            <p className="text-[12px] font-semibold text-slate-600">
              {tripId ? `Gắn với chuyến #${tripId} · dùng cho lãi/lỗ sơ bộ` : 'Chi phí sẽ được gắn với chuyến xe'}
            </p>
          </div>
        </div>
        {canManage && isClosed && tripId && (
          <button
            type="button"
            onClick={openCreate}
            disabled={isSaving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[12px] font-black text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Plus size={16} />Thêm khoản chi
          </button>
        )}
      </div>

      <div className="grid gap-2 border-b border-slate-100 bg-white p-4 sm:grid-cols-3">
        <CostMetric label="Cước chuyến / NCC" value={formatMoney(tripCost)} />
        <CostMetric label="Chi phí phát sinh" value={formatMoney(incidentalCost)} />
        <CostMetric label="Tổng chi phí sơ bộ" value={formatMoney(provisionalCost)} highlight />
      </div>

      {!isClosed && (
        <p className="px-5 py-4 text-[12px] font-bold text-amber-700">Đóng bảng kê trước khi nhập chi phí.</p>
      )}
      {isClosed && !tripId && (
        <p className="px-5 py-4 text-[12px] font-bold text-amber-700">
          Bảng kê đã đóng nhưng chưa gán chuyến. Hãy gán chuyến trước để chi phí được đưa vào báo cáo lãi/lỗ.
        </p>
      )}

      {isFormOpen && (
        <div className="border-b border-emerald-100 bg-emerald-50/40 p-4">
          <div className="grid gap-3 md:grid-cols-[200px_180px_1fr_auto] md:items-end">
            <label className="text-[12px] font-bold text-slate-600">
              Loại chi phí
              <select
                value={form.category}
                onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
                disabled={isSaving}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-emerald-500"
              >
                {EXPENSE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-bold text-slate-600">
              Số tiền
              <input
                inputMode="numeric"
                value={form.amount}
                onChange={(event) => setForm((previous) => ({ ...previous, amount: formatAmountInput(event.target.value) }))}
                disabled={isSaving}
                placeholder="VD: 500.000"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-right text-[13px] font-black text-slate-900 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-[12px] font-bold text-slate-600">
              Nội dung / ghi chú
              <input
                value={form.description}
                onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                disabled={isSaving}
                maxLength={500}
                placeholder="VD: Phí cầu đường chuyến HAN → HCM"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-emerald-500"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submitExpense()}
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[12px] font-black text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{editingId ? 'Cập nhật' : 'Lưu'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={isSaving}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-[12px] font-bold text-red-700">{error}</p>}

      {tripId && (
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-[12px] font-bold text-slate-500"><Loader2 size={16} className="animate-spin" />Đang tải chi phí...</div>
          ) : expenses.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center px-4 text-center text-[12px] font-semibold text-slate-500">Chưa nhập khoản chi phí nào cho bảng kê này.</div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Loại chi</th><th className="px-4 py-3">Nội dung</th><th className="px-4 py-3">Ngày nhập</th><th className="px-4 py-3 text-right">Số tiền</th><th className="w-24 px-4 py-3 text-center">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-black text-slate-800">{CATEGORY_LABELS[String(expense.category || '')] || expense.category || 'Khác'}</td>
                    <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-600">{expense.description || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-500">{formatDateTime(expense.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-black text-emerald-700">{formatMoney(expense.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {canManage && (
                          <button type="button" title="Sửa chi phí" onClick={() => openEdit(expense)} disabled={isSaving} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-primary hover:bg-blue-100 disabled:opacity-50"><Edit3 size={14} /></button>
                        )}
                        {canDelete && (
                          <button type="button" title="Xóa chi phí" onClick={() => void removeExpense(expense)} disabled={isSaving} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function CostMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${highlight ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50/60'}`}>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-[16px] font-black ${highlight ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
