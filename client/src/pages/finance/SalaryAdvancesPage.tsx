import {
  AlertTriangle,
  Banknote,
  Clock3,
  History,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CashFundSelect from '../../components/finance/CashFundSelect';
import { RowActionsMenu, RowActionsMenuItem } from '../../components/ui/RowActionsMenu';
import { ApiError, apiRequest } from '../../lib/api';
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from '../../lib/formatMoney';
import type { StaffPageResponse, StaffRecord } from './staffTypes';

interface Advance {
  id: string | number;
  staff_member_id: string | number;
  advance_date: string;
  amount: string | number;
  fund_id: string | number;
  hub_id?: string | number | null;
  note?: string | null;
  staff_member?: StaffRecord;
  fund?: { code?: string; name?: string };
  hub?: { code?: string; name?: string };
  creator?: { full_name?: string; username?: string };
}

interface AdvanceSummary {
  staff_member_id: string;
  month: string;
  total_amount: number;
  advance_count: number;
}

interface AdvanceHistoryEntry {
  id: string | number;
  action: string;
  changes: Record<string, { old_value: unknown; new_value: unknown }>;
  changed_by_name?: string | null;
  changed_by?: { full_name?: string; username?: string } | null;
  created_at: string;
}

interface AdvanceForm {
  staff_member_id: string;
  advance_date: string;
  amount: string;
  fund_id: string;
  note: string;
}

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
const emptyForm = (): AdvanceForm => ({ staff_member_id: '', advance_date: today, amount: '', fund_id: '', note: '' });
const errorMessage = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export default function SalaryAdvancesPage() {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<Advance[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Advance | null>(null);
  const [form, setForm] = useState<AdvanceForm>(emptyForm);
  const [summary, setSummary] = useState<AdvanceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [historyAdvance, setHistoryAdvance] = useState<Advance | null>(null);
  const [historyRows, setHistoryRows] = useState<AdvanceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const loadAdvances = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      setRows(await apiRequest<Advance[]>(`/staff-members/salary-advances/list?month=${month}`));
    } catch (error) {
      setPageError(errorMessage(error, 'Không tải được danh sách tạm ứng.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    setStaffError('');
    try {
      const response = await apiRequest<StaffPageResponse | StaffRecord[]>('/staff-members?limit=500&employment_status=ACTIVE');
      setStaff(Array.isArray(response) ? response : response.data || response.items || []);
    } catch (error) {
      setStaff([]);
      setStaffError(errorMessage(error, 'Không tải được danh sách nhân sự.'));
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void loadAdvances(); }); }, [loadAdvances]);
  useEffect(() => { queueMicrotask(() => { void loadStaff(); }); }, [loadStaff]);

  useEffect(() => {
    if (!formOpen || !form.staff_member_id || !form.advance_date) return;
    let cancelled = false;
    const selectedMonth = form.advance_date.slice(0, 7);
    queueMicrotask(() => {
      if (cancelled) return;
      setSummaryLoading(true);
      apiRequest<AdvanceSummary>(`/staff-members/salary-advances/summary?staff_member_id=${encodeURIComponent(form.staff_member_id)}&month=${selectedMonth}`)
        .then((value) => { if (!cancelled) setSummary(value); })
        .catch(() => {
          if (cancelled) return;
          const matching = selectedMonth === month ? rows.filter((row) =>
            String(row.staff_member_id || row.staff_member?.id || '') === form.staff_member_id
            && row.advance_date.slice(0, 7) === selectedMonth) : [];
          setSummary({
            staff_member_id: form.staff_member_id,
            month: selectedMonth,
            total_amount: matching.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            advance_count: matching.length,
          });
        })
        .finally(() => { if (!cancelled) setSummaryLoading(false); });
    });
    return () => { cancelled = true; };
  }, [form.advance_date, form.staff_member_id, formOpen, month, rows]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setSummary(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (row: Advance) => {
    setEditing(row);
    setSummary(null);
    setForm({
      staff_member_id: String(row.staff_member_id || row.staff_member?.id || ''),
      advance_date: row.advance_date,
      amount: formatAmountInputFromNumber(row.amount),
      fund_id: String(row.fund_id || ''),
      note: row.note || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const submit = async () => {
    const amount = parseAmountInput(form.amount);
    if (!form.staff_member_id || !form.fund_id || !form.advance_date || amount <= 0) {
      setFormError('Chọn nhân sự, ngày ứng, sổ quỹ và nhập số tiền lớn hơn 0.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await apiRequest(editing ? `/staff-members/salary-advances/${editing.id}` : '/staff-members/salary-advances', {
        method: editing ? 'PATCH' : 'POST',
        body: { ...form, amount, note: form.note.trim() || null },
      });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await loadAdvances();
    } catch (error) {
      setFormError(errorMessage(error, editing ? 'Không sửa được khoản tạm ứng.' : 'Không lưu được khoản tạm ứng.'));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (row: Advance) => {
    setHistoryAdvance(row);
    setHistoryRows([]);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      setHistoryRows(await apiRequest<AdvanceHistoryEntry[]>(`/staff-members/salary-advances/${row.id}/history`));
    } catch (error) {
      setHistoryError(errorMessage(error, 'Không tải được lịch sử chỉnh sửa.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Theo dõi tiền tạm ứng lương</h1>
          <p className="text-sm text-muted-foreground">Mỗi khoản tạm ứng tự động ghi vào Nhật ký thu chi và trừ trên bảng lương.</p>
        </div>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-lg border border-border px-3 text-sm font-bold" />
          <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white"><Plus size={16} />Nhập tạm ứng</button>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <Banknote size={20} className="text-amber-600" />
        <span className="text-sm font-bold text-amber-800">Tổng đã ứng trong tháng: {formatMoney(total)}</span>
      </div>

      {pageError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle size={15} className="mr-2 inline" />{pageError}</p>}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Đang tải...</div>
        ) : !rows.length ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Chưa có khoản tạm ứng trong tháng.</div>
        ) : (
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground">
              <tr>{['Ngày', 'Mã NV', 'Nhân sự', 'Bộ phận', 'Bưu cục', 'Sổ quỹ', 'Số tiền', 'Ghi chú', 'Người nhập', 'Thao tác'].map((label) => <th key={label} className="border-b border-border px-3 py-3 last:text-center">{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-3 py-3">{formatDate(row.advance_date)}</td>
                  <td className="px-3 py-3 font-bold text-primary">{row.staff_member?.employee_code}</td>
                  <td className="px-3 py-3 font-extrabold">{row.staff_member?.full_name}</td>
                  <td className="px-3 py-3">{row.staff_member?.department_record?.name || row.staff_member?.department || '—'}</td>
                  <td className="px-3 py-3">{row.hub?.code || '—'}</td>
                  <td className="px-3 py-3">{[row.fund?.code, row.fund?.name].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-3 text-right font-black tabular-nums text-amber-700">{formatMoney(row.amount)}</td>
                  <td className="max-w-xs px-3 py-3">{row.note || '—'}</td>
                  <td className="px-3 py-3">{row.creator?.full_name || row.creator?.username || '—'}</td>
                  <td className="min-w-[72px] px-3 py-3 text-center">
                    <RowActionsMenu label={`Thao tác tạm ứng của ${row.staff_member?.full_name || 'nhân sự'}`}>
                      <RowActionsMenuItem icon={<Pencil size={14} />} label="Sửa tạm ứng" tone="amber" onClick={() => openEdit(row)} />
                      <RowActionsMenuItem icon={<History size={14} />} label="Lịch sử chỉnh sửa" tone="primary" onClick={() => void openHistory(row)} />
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <AdvanceDialog
          editing={Boolean(editing)}
          form={form}
          staff={staff}
          staffLoading={staffLoading}
          staffError={staffError}
          saving={saving}
          error={formError}
          summary={summary}
          summaryLoading={summaryLoading}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onReloadStaff={() => void loadStaff()}
          onClose={() => { if (!saving) setFormOpen(false); }}
          onSubmit={() => void submit()}
        />
      )}
      {historyAdvance && <HistoryDrawer advance={historyAdvance} rows={historyRows} loading={historyLoading} error={historyError} onClose={() => setHistoryAdvance(null)} />}
    </div>
  );
}

function AdvanceDialog({ editing, form, staff, staffLoading, staffError, saving, error, summary, summaryLoading, onChange, onReloadStaff, onClose, onSubmit }: {
  editing: boolean;
  form: AdvanceForm;
  staff: StaffRecord[];
  staffLoading: boolean;
  staffError: string;
  saving: boolean;
  error: string;
  summary: AdvanceSummary | null;
  summaryLoading: boolean;
  onChange: (patch: Partial<AdvanceForm>) => void;
  onReloadStaff: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div><p className="text-xs font-bold uppercase text-primary">Chi trả trước lương</p><h2 className="text-lg font-black">{editing ? 'Sửa tiền tạm ứng' : 'Nhập tiền tạm ứng'}</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-5">
          <label className="block text-sm font-bold">
            Nhân sự *
            <select value={form.staff_member_id} disabled={staffLoading} onChange={(event) => onChange({ staff_member_id: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 disabled:bg-slate-50 disabled:text-slate-500">
              <option value="">{staffLoading ? 'Đang tải danh sách nhân sự...' : staff.length ? 'Chọn nhân sự' : 'Chưa có nhân sự đang làm việc'}</option>
              {staff.map((item) => <option key={item.id} value={String(item.id)}>{item.employee_code} · {item.full_name} · {item.hub?.code || 'Chưa gán bưu cục'}</option>)}
            </select>
            {staffError && <span className="mt-1 flex items-center justify-between gap-2 text-xs font-bold text-red-600"><span>{staffError}</span><button type="button" onClick={onReloadStaff} className="shrink-0 underline">Tải lại</button></span>}
          </label>

          {form.staff_member_id && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800">
              {summaryLoading ? <Loader2 size={17} className="animate-spin" /> : <Banknote size={17} />}
              {summaryLoading ? 'Đang tính tổng tạm ứng...' : summary ? `Đã tạm ứng tháng ${formatMonth(summary.month)}: ${formatMoney(summary.total_amount)} (${summary.advance_count} lần)` : 'Chưa lấy được tổng tạm ứng.'}
            </div>
          )}

          <label className="block text-sm font-bold">Ngày ứng *<input type="date" value={form.advance_date} onChange={(event) => onChange({ advance_date: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3" /></label>
          <label className="block text-sm font-bold">Số tiền *<input type="text" inputMode="numeric" value={form.amount} onChange={(event) => onChange({ amount: formatAmountInput(event.target.value) })} placeholder="VD: 1.500.000" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-right font-bold tabular-nums" /></label>
          <CashFundSelect value={form.fund_id} onChange={(fundId) => onChange({ fund_id: fundId })} label="Sổ quỹ chi tiền *" />
          <label className="block text-sm font-bold">Loại chi phí<input readOnly value="334-Phải trả người lao động" className="mt-1 h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-slate-600" /></label>
          <label className="block text-sm font-bold">Ghi chú<textarea value={form.note} onChange={(event) => onChange({ note: event.target.value })} rows={3} maxLength={1000} className="mt-1 w-full resize-none rounded-lg border border-border p-3" /></label>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-border px-4 font-bold">Hủy</button>
          <button type="button" onClick={onSubmit} disabled={saving || staffLoading || !staff.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ReceiptText size={15} />}{editing ? 'Lưu thay đổi' : 'Lưu phiếu chi'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function HistoryDrawer({ advance, rows, loading, error, onClose }: { advance: Advance; rows: AdvanceHistoryEntry[]; loading: boolean; error: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-screen w-full max-w-[620px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl dialog-slide-in">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-5">
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Lịch sử chỉnh sửa</p><h2 className="text-lg font-black">{advance.staff_member?.full_name || 'Khoản tạm ứng'}</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X size={19} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5 custom-scrollbar">
          {loading ? <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Đang tải lịch sử...</div> : error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : !rows.length ? <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p> : rows.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Clock3 size={16} className="text-primary" /><b className="text-sm">{entry.action === 'CREATED' ? 'Tạo khoản tạm ứng' : 'Chỉnh sửa khoản tạm ứng'}</b></div><span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('vi-VN')}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">Người thao tác: {entry.changed_by_name || entry.changed_by?.full_name || entry.changed_by?.username || 'Hệ thống'}</p>
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {Object.entries(entry.changes || {}).map(([field, change]) => <div key={field} className="grid grid-cols-[110px_1fr] gap-2 text-xs"><b>{historyFieldLabel(field)}</b><span>{formatHistoryValue(field, change.old_value)} <span className="px-1 text-muted-foreground">→</span> {formatHistoryValue(field, change.new_value)}</span></div>)}
              </div>
            </article>
          ))}
        </div>
        <div className="flex shrink-0 justify-start border-t border-border bg-white p-4"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-bold">Đóng</button></div>
      </div>
    </div>,
    document.body,
  );
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function formatMonth(value: string) {
  const [year, month] = value.split('-');
  return `${month}/${year}`;
}

function historyFieldLabel(field: string) {
  return ({ staff_member: 'Nhân sự', advance_date: 'Ngày ứng', amount: 'Số tiền', fund: 'Sổ quỹ', hub: 'Bưu cục', note: 'Ghi chú' } as Record<string, string>)[field] || field;
}

function formatHistoryValue(field: string, value: unknown) {
  if (value == null || value === '') return '—';
  if (field === 'amount') return formatMoney(Number(value));
  if (field === 'advance_date') return formatDate(String(value));
  return String(value);
}
