import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../lib/api';
import { formatAmountInput, formatMoney, parseAmountInput } from '../../../lib/formatMoney';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { ReceiptImageLinks, ReceiptImagePicker } from '../../../components/finance/ReceiptImagePicker';
import { defaultExpenseCategoryNames, loadExpenseCategoryNames } from '../../../lib/expenseCategories';

type VoucherType = 'Thu' | 'Chi';

interface CashFund {
  id: string | number;
  code?: string | null;
  name?: string | null;
  balance_amount?: number | string | null;
  is_active?: boolean;
  hub_id?: string | number | null;
  hub?: { id?: string | number | null; code?: string | null; name?: string | null } | null;
}

interface Hub {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

interface Vendor {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

interface JournalEntry {
  id: string;
  record_id: string;
  source_type: string;
  editable: boolean;
  entry_date: string;
  voucher_type: VoucherType;
  source: string;
  cost_category: string;
  detail: string;
  note?: string | null;
  content: string;
  income_amount: number;
  expense_amount: number;
  fund_id?: string | number | null;
  fund_code?: string | null;
  fund_name?: string | null;
  vendor_id?: string | number | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  hub_id?: string | number | null;
  hub_code?: string | null;
  hub_name?: string | null;
  created_by_name?: string | null;
  attachment_urls?: string[] | null;
}

interface JournalResponse {
  items: JournalEntry[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    total_income: number;
    total_expense: number;
    balance: number;
  };
}

interface Filters {
  q: string;
  date_from: string;
  date_to: string;
  voucher_type: '' | VoucherType;
  fund_id: string;
  vendor_id: string;
  hub_id: string;
  cost_category: string;
  page: number;
  limit: number;
}

interface EntryForm {
  voucher_type: VoucherType;
  entry_date: string;
  fund_id: string;
  vendor_id: string;
  hub_id: string;
  source: string;
  cost_category: string;
  detail: string;
  content: string;
  note: string;
  amount: string;
  attachment_urls: string[];
}

const incomeCategories = ['Thu cước vận đơn', 'Thu COD/CC', 'Thu hoàn ứng', 'Thu khác'];
const expenseCategories = defaultExpenseCategoryNames;
const sourceOptions = ['Khách hàng', 'Nhà cung cấp', 'Nội bộ', 'Khác'];
const today = () => new Date().toISOString().slice(0, 10);
const defaultFilters: Filters = { q: '', date_from: '', date_to: '', voucher_type: '', fund_id: '', vendor_id: '', hub_id: '', cost_category: '', page: 1, limit: 20 };
const newForm = (): EntryForm => ({ voucher_type: 'Chi', entry_date: today(), fund_id: '', vendor_id: '', hub_id: '', source: 'Nội bộ', cost_category: expenseCategories[0], detail: '', content: '', note: '', amount: '', attachment_urls: [] });
const normalizeList = <T,>(response: T[] | { items?: T[]; data?: T[] }) => Array.isArray(response) ? response : response.items || response.data || [];
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Không xử lý được dữ liệu.';

function buildQuery(filters: Filters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  for (const key of ['q', 'date_from', 'date_to', 'voucher_type', 'fund_id', 'vendor_id', 'hub_id', 'cost_category'] as const) {
    const value = filters[key];
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  return params.toString();
}

export default function DailyCashJournalPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [funds, setFunds] = useState<CashFund[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [savedExpenseCategories, setSavedExpenseCategories] = useState<string[]>([]);
  const [meta, setMeta] = useState<JournalResponse['meta']>({ total: 0, page: 1, limit: 20, total_pages: 1, total_income: 0, total_expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<EntryForm>(newForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const loadReferences = useCallback(async () => {
    const [fundResponse, vendorResponse, hubResponse, categoryResponse] = await Promise.all([
      apiRequest<CashFund[] | { items?: CashFund[]; data?: CashFund[] }>('/finance/cash-funds'),
      apiRequest<Vendor[] | { items?: Vendor[]; data?: Vendor[] }>('/vendors?status=ACTIVE&limit=500'),
      apiRequest<Hub[] | { items?: Hub[]; data?: Hub[] }>('/hubs/active'),
      loadExpenseCategoryNames(),
    ]);
    setFunds(normalizeList(fundResponse).filter((fund) => fund.is_active !== false));
    setVendors(normalizeList(vendorResponse));
    setHubs(normalizeList(hubResponse));
    setSavedExpenseCategories(Array.isArray(categoryResponse) ? categoryResponse : []);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<JournalResponse>(`/cash-journal-entries?${buildQuery(filters)}`);
      setEntries(response.items || []);
      setMeta(response.meta || { total: 0, page: filters.page, limit: filters.limit, total_pages: 1, total_income: 0, total_expense: 0, balance: 0 });
    } catch (requestError) {
      setEntries([]);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadReferences().catch((requestError) => setError(errorMessage(requestError)));
    });
  }, [loadReferences]);
  useEffect(() => { queueMicrotask(() => void loadEntries()); }, [loadEntries]);

  const categoryOptions = useMemo(() => form.voucher_type === 'Thu'
    ? incomeCategories
    : [...new Set([...savedExpenseCategories, ...entries.filter((entry) => entry.voucher_type === 'Chi' && entry.record_id === editingId).map((entry) => entry.cost_category).filter(Boolean)])],
  [editingId, entries, form.voucher_type, savedExpenseCategories]);
  const allCategories = useMemo(() => [...new Set([...incomeCategories, ...expenseCategories, ...savedExpenseCategories, ...entries.map((entry) => entry.cost_category).filter(Boolean)])], [entries, savedExpenseCategories]);
  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const updateForm = (patch: Partial<EntryForm>) => setForm((current) => ({ ...current, ...patch }));

  const openCreate = () => {
    setEditingId('');
    setForm({ ...newForm(), cost_category: savedExpenseCategories[0] || expenseCategories[0] });
    setUploadingReceipt(false);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditingId(entry.record_id);
    setForm({
      voucher_type: entry.voucher_type,
      entry_date: entry.entry_date,
      fund_id: String(entry.fund_id || ''),
      vendor_id: String(entry.vendor_id || ''),
      hub_id: String(entry.hub_id || ''),
      source: entry.source || 'Khác',
      cost_category: entry.cost_category,
      detail: entry.detail,
      content: entry.content,
      note: entry.note || '',
      amount: formatAmountInput(String(entry.voucher_type === 'Thu' ? entry.income_amount : entry.expense_amount)),
      attachment_urls: Array.isArray(entry.attachment_urls) ? entry.attachment_urls : [],
    });
    setFormError('');
    setUploadingReceipt(false);
    setFormOpen(true);
  };

  const changeVoucherType = (voucherType: VoucherType) => {
    updateForm({
      voucher_type: voucherType,
      cost_category: voucherType === 'Thu' ? incomeCategories[0] : savedExpenseCategories[0] || expenseCategories[0],
      source: voucherType === 'Thu' ? 'Khách hàng' : 'Nội bộ',
    });
  };

  const submit = async () => {
    const amount = parseAmountInput(form.amount);
    if (!form.fund_id || !form.cost_category.trim() || (form.voucher_type === 'Chi' && !form.hub_id) || !form.detail.trim() || !form.content.trim() || amount <= 0) {
      setFormError(!form.fund_id
        ? 'Vui lòng chọn sổ quỹ.'
        : !form.cost_category.trim()
          ? 'Vui lòng chọn loại thu/chi.'
        : form.voucher_type === 'Chi' && !form.hub_id
          ? 'Vui lòng chọn bưu cục nhận khoản chi.'
          : amount <= 0
            ? 'Nhập số tiền lớn hơn 0.'
            : 'Nhập đối tượng và nội dung giao dịch.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest(editingId ? `/cash-journal-entries/${editingId}` : '/cash-journal-entries', {
        method: editingId ? 'PATCH' : 'POST',
        body: {
          entry_date: form.entry_date,
          voucher_type: form.voucher_type,
          source: form.source,
          fund_id: form.fund_id,
          vendor_id: form.vendor_id,
          hub_id: form.hub_id || undefined,
          cost_category: form.cost_category,
          detail: form.detail.trim(),
          content: form.content.trim(),
          note: form.note.trim(),
          income_amount: form.voucher_type === 'Thu' ? amount : 0,
          expense_amount: form.voucher_type === 'Chi' ? amount : 0,
          attachment_urls: form.attachment_urls,
        },
      });
      setFormOpen(false);
      await Promise.all([loadEntries(), loadReferences()]);
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (entry: JournalEntry) => {
    if (!entry.editable || !window.confirm(`Xóa giao dịch ${entry.detail}?`)) return;
    try {
      await apiRequest(`/cash-journal-entries/${entry.record_id}`, { method: 'DELETE' });
      await Promise.all([loadEntries(), loadReferences()]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const activeFilterCount = ['q', 'date_from', 'date_to', 'voucher_type', 'fund_id', 'vendor_id', 'hub_id', 'cost_category'].filter((key) => Boolean(String(filters[key as keyof Filters]).trim())).length;
  const pageCount = Math.max(1, meta.total_pages || Math.ceil(meta.total / filters.limit));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-3">
        <button type="button" onClick={() => navigate(-1)} title="Quay lại" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-extrabold text-foreground">Nhật ký thu chi</h1>
          <p className="text-[12px] text-muted-foreground">Thu chi hằng ngày theo sổ quỹ, nhà cung cấp và loại chi phí</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white"><Plus size={16} />Thêm thu chi</button>
      </div>

      <div className="grid grid-cols-1 gap-2 px-1 sm:grid-cols-3">
        <Metric label="Tổng thu" value={formatMoney(meta.total_income, { empty: '0 đ' })} tone="emerald" />
        <Metric label="Tổng chi" value={formatMoney(meta.total_expense, { empty: '0 đ' })} tone="red" />
        <Metric label="Chênh lệch" value={formatMoney(meta.balance, { empty: '0 đ' })} tone="blue" />
      </div>

      <div className="flex flex-wrap items-end gap-2 border-y border-border bg-white px-3 py-3">
        <label className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.q} onChange={(event) => updateFilters({ q: event.target.value, page: 1 })} placeholder="Tìm nội dung, đối tượng, NCC..." className="h-10 w-full rounded-lg border border-border pl-9 pr-3 text-[13px] outline-none focus:border-primary" /></label>
        <FilterSelect label="Từ ngày" value={filters.date_from} onChange={(value) => updateFilters({ date_from: value, page: 1 })} type="date" />
        <FilterSelect label="Đến ngày" value={filters.date_to} onChange={(value) => updateFilters({ date_to: value, page: 1 })} type="date" />
        <Select value={filters.voucher_type} onChange={(value) => updateFilters({ voucher_type: value as Filters['voucher_type'], page: 1 })} options={[['', 'Tất cả Thu/Chi'], ['Thu', 'Thu'], ['Chi', 'Chi']]} />
        <Select value={filters.fund_id} onChange={(value) => updateFilters({ fund_id: value, page: 1 })} options={[['', 'Tất cả sổ quỹ'], ...funds.map((fund) => [String(fund.id), [fund.code, fund.name].filter(Boolean).join(' · ')])]} />
        <Select value={filters.vendor_id} onChange={(value) => updateFilters({ vendor_id: value, page: 1 })} options={[['', 'Tất cả NCC'], ...vendors.map((vendor) => [String(vendor.id), [vendor.code, vendor.name].filter(Boolean).join(' · ')])]} />
        <Select value={filters.hub_id} onChange={(value) => updateFilters({ hub_id: value, page: 1 })} options={[['', 'Tất cả HUB'], ...hubs.map((hub) => [String(hub.id), [hub.code, hub.name].filter(Boolean).join(' · ')])]} />
        <Select value={filters.cost_category} onChange={(value) => updateFilters({ cost_category: value, page: 1 })} options={[['', 'Tất cả loại chi phí'], ...allCategories.map((category) => [category, category])]} />
        {activeFilterCount > 0 && <button type="button" onClick={() => setFilters((current) => ({ ...defaultFilters, limit: current.limit }))} className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-bold text-red-600">Xóa {activeFilterCount} lọc</button>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white custom-scrollbar">
        {loading ? <State icon={<Loader2 className="animate-spin" />} title="Đang tải nhật ký" /> : error ? <State icon={<AlertTriangle />} title={error} /> : entries.length === 0 ? <State icon={<Receipt />} title="Chưa có giao dịch phù hợp" /> : <>
          <table className="hidden min-w-[1600px] w-full border-collapse text-left md:table">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase text-slate-600"><tr>{['Ngày', 'Loại', 'Nguồn', 'HUB', 'Đối tượng', 'NCC', 'Phân loại', 'Sổ quỹ', 'Nội dung', 'Chứng từ', 'Thu', 'Chi', 'Người lập', ''].map((header) => <th key={header} className="border-b border-r border-border px-3 py-2.5 font-extrabold last:border-r-0">{header}</th>)}</tr></thead>
            <tbody>{entries.map((entry) => <JournalRow key={entry.id} entry={entry} onEdit={() => openEdit(entry)} onRemove={() => void remove(entry)} />)}</tbody>
          </table>
          <div className="grid gap-2 p-3 md:hidden">{entries.map((entry) => <JournalCard key={entry.id} entry={entry} onEdit={() => openEdit(entry)} onRemove={() => void remove(entry)} />)}</div>
        </>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-3 py-2 text-[12px] text-muted-foreground">
        <span>Tổng <b className="text-foreground">{meta.total.toLocaleString('vi-VN')}</b> giao dịch</span>
        <div className="flex items-center gap-2"><select value={filters.limit} onChange={(event) => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-8 rounded-lg border border-border px-2">{[20, 50, 100].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select><button type="button" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronLeft size={14} /></button><b>{filters.page}/{pageCount}</b><button type="button" disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronRight size={14} /></button></div>
      </div>

      {formOpen && <EntryDialog form={form} editing={Boolean(editingId)} categories={categoryOptions} funds={funds} hubs={hubs} vendors={vendors} submitting={submitting} uploadingReceipt={uploadingReceipt} error={formError} onChange={updateForm} onUploadingReceiptChange={setUploadingReceipt} onTypeChange={changeVoucherType} onClose={() => setFormOpen(false)} onSubmit={() => void submit()} />}
    </div>
  );
}

function JournalRow({ entry, onEdit, onRemove }: { entry: JournalEntry; onEdit: () => void; onRemove: () => void }) {
  return <tr className="border-b border-border text-[12px] hover:bg-muted/20"><td className="border-r border-border px-3 py-2.5 font-bold">{new Date(entry.entry_date).toLocaleDateString('vi-VN')}</td><td className="border-r border-border px-3 py-2.5"><TypeBadge value={entry.voucher_type} /></td><td className="border-r border-border px-3 py-2.5">{entry.source}</td><td className="border-r border-border px-3 py-2.5 font-bold">{[entry.hub_code, entry.hub_name].filter(Boolean).join(' · ') || '—'}</td><td className="border-r border-border px-3 py-2.5 font-bold">{entry.detail}</td><td className="border-r border-border px-3 py-2.5">{[entry.vendor_code, entry.vendor_name].filter(Boolean).join(' · ') || '—'}</td><td className="border-r border-border px-3 py-2.5">{entry.cost_category}</td><td className="border-r border-border px-3 py-2.5 font-bold">{[entry.fund_code, entry.fund_name].filter(Boolean).join(' · ') || 'Chưa chi quỹ'}</td><td className="max-w-[280px] border-r border-border px-3 py-2.5"><p className="truncate" title={entry.content}>{entry.content}</p>{entry.note && <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={entry.note}>{entry.note}</p>}</td><td className="border-r border-border px-3 py-2.5"><ReceiptImageLinks images={entry.attachment_urls} /></td><td className="border-r border-border px-3 py-2.5 text-right font-extrabold text-emerald-700">{entry.income_amount > 0 ? formatMoney(entry.income_amount) : '—'}</td><td className="border-r border-border px-3 py-2.5 text-right font-extrabold text-red-600">{entry.expense_amount > 0 ? formatMoney(entry.expense_amount) : '—'}</td><td className="border-r border-border px-3 py-2.5">{entry.created_by_name || '—'}</td><td className="px-2 py-2.5">{entry.editable && <div className="flex gap-1"><button type="button" title="Sửa" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary hover:bg-blue-50"><Pencil size={14} /></button><button type="button" title="Xóa" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button></div>}</td></tr>;
}

function JournalCard({ entry, onEdit, onRemove }: { entry: JournalEntry; onEdit: () => void; onRemove: () => void }) {
  return <article className="rounded-lg border border-border bg-white p-3"><div className="flex items-start justify-between gap-2"><div><TypeBadge value={entry.voucher_type} /><p className="mt-2 text-[14px] font-extrabold">{entry.detail}</p><p className="text-[11px] text-muted-foreground">{new Date(entry.entry_date).toLocaleDateString('vi-VN')} · {[entry.fund_code, entry.fund_name].filter(Boolean).join(' · ') || 'Chưa chi quỹ'}</p><p className="text-[11px] font-bold text-primary">{[entry.hub_code, entry.hub_name].filter(Boolean).join(' · ') || 'Chưa gắn HUB'}</p></div><p className={clsx('text-[15px] font-black', entry.voucher_type === 'Thu' ? 'text-emerald-700' : 'text-red-600')}>{formatMoney(entry.voucher_type === 'Thu' ? entry.income_amount : entry.expense_amount)}</p></div><p className="mt-2 text-[12px]">{entry.content}</p><p className="mt-1 text-[11px] font-bold text-muted-foreground">{entry.cost_category}{entry.vendor_name ? ` · ${entry.vendor_name}` : ''}</p><div className="mt-2"><ReceiptImageLinks images={entry.attachment_urls} /></div>{entry.editable && <div className="mt-3 flex justify-end gap-1 border-t border-border pt-2"><button type="button" title="Sửa" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary"><Pencil size={14} /></button><button type="button" title="Xóa" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 size={14} /></button></div>}</article>;
}

function EntryDialog({ form, editing, categories, funds, hubs, vendors, submitting, uploadingReceipt, error, onChange, onUploadingReceiptChange, onTypeChange, onClose, onSubmit }: { form: EntryForm; editing: boolean; categories: string[]; funds: CashFund[]; hubs: Hub[]; vendors: Vendor[]; submitting: boolean; uploadingReceipt: boolean; error: string; onChange: (patch: Partial<EntryForm>) => void; onUploadingReceiptChange: (uploading: boolean) => void; onTypeChange: (value: VoucherType) => void; onClose: () => void; onSubmit: () => void }) {
  const inputClass = 'h-11 w-full rounded-lg border border-border bg-white px-3 text-[13px] outline-none focus:border-primary';
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase text-primary">{editing ? 'Chỉnh sửa giao dịch' : 'Thu chi hằng ngày'}</p>
            <h2 className="text-[16px] font-extrabold">{editing ? 'Sửa phiếu thu chi' : 'Thêm phiếu thu chi'}</h2>
          </div>
          <button type="button" title="Đóng" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={17} /></button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(['Thu', 'Chi'] as VoucherType[]).map((type) => (
              <button key={type} type="button" onClick={() => onTypeChange(type)} className={clsx('h-11 rounded-lg border text-[13px] font-extrabold', form.voucher_type === type ? type === 'Thu' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-700' : 'border-border bg-white text-muted-foreground')}>{type}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày"><input type="date" value={form.entry_date} onChange={(event) => onChange({ entry_date: event.target.value })} className={inputClass} /></Field>
            <Field label="Số tiền"><input type="text" inputMode="numeric" value={form.amount} onChange={(event) => onChange({ amount: formatAmountInput(event.target.value) })} placeholder="1.000.000" className={`${inputClass} text-right font-extrabold`} /></Field>
            <Field label="Sổ quỹ *"><select value={form.fund_id} onChange={(event) => { const value = event.target.value; const fund = funds.find((item) => String(item.id) === value); const hubId = fund?.hub_id ?? fund?.hub?.id; onChange({ fund_id: value, ...(hubId ? { hub_id: String(hubId) } : {}) }); }} className={`${inputClass} font-bold`}><option value="">Chọn sổ quỹ</option>{funds.map((fund) => <option key={String(fund.id)} value={String(fund.id)}>{[fund.code, fund.name, fund.hub?.code].filter(Boolean).join(' · ')} · {formatMoney(fund.balance_amount, { empty: '0 đ' })}</option>)}</select></Field>
            <Field label="Nguồn"><select value={form.source} onChange={(event) => onChange({ source: event.target.value })} className={`${inputClass} font-bold`}>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></Field>
            <Field label={form.voucher_type === 'Chi' ? 'Chi cho bưu cục (HUB) *' : 'Bưu cục ghi nhận'}><select value={form.hub_id} onChange={(event) => onChange({ hub_id: event.target.value })} className={`${inputClass} font-bold`}><option value="">Chọn bưu cục</option>{hubs.map((hub) => <option key={String(hub.id)} value={String(hub.id)}>{[hub.code, hub.name].filter(Boolean).join(' · ')}</option>)}</select></Field>
            <Field label="Loại thu/chi"><SearchableSelect value={form.cost_category} onValueChange={(value) => onChange({ cost_category: value })} options={categories.map((category) => ({ value: category, label: category }))} placeholder="Chọn loại thu/chi" searchPlaceholder="Tìm loại thu/chi..." emptyMessage="Chưa có loại chi phí trong danh mục." disabled={submitting} className="h-11 rounded-lg bg-white px-3 font-bold" /></Field>
            <Field label="Nhà cung cấp (nếu có)"><select value={form.vendor_id} onChange={(event) => onChange({ vendor_id: event.target.value })} className={`${inputClass} font-bold`}><option value="">Không gắn NCC</option>{vendors.map((vendor) => <option key={String(vendor.id)} value={String(vendor.id)}>{[vendor.code, vendor.name].filter(Boolean).join(' · ')}</option>)}</select></Field>
            <Field label="Đối tượng / chi tiết"><input value={form.detail} onChange={(event) => onChange({ detail: event.target.value })} placeholder="Người nộp, người nhận, bộ phận..." className={inputClass} /></Field>
            <Field label="Nội dung"><input value={form.content} onChange={(event) => onChange({ content: event.target.value })} placeholder="Nội dung thu hoặc chi..." className={inputClass} /></Field>
          </div>
          <Field label="Ghi chú" className="mt-3"><textarea value={form.note} onChange={(event) => onChange({ note: event.target.value })} rows={3} className="w-full rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary" /></Field>
          <div className="mt-3"><Field label="Chứng từ / biên lai"><ReceiptImagePicker images={form.attachment_urls} onChange={(attachmentUrls) => onChange({ attachment_urls: attachmentUrls })} disabled={submitting} onUploadingChange={onUploadingReceiptChange} /></Field></div>
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold">Hủy</button>
          <button type="button" disabled={submitting || uploadingReceipt} onClick={onSubmit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">{submitting || uploadingReceipt ? <Loader2 className="animate-spin" size={15} /> : <Receipt size={15} />}{uploadingReceipt ? 'Đang tải chứng từ' : editing ? 'Lưu thay đổi' : `Lưu phiếu ${form.voucher_type.toLowerCase()}`}</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'blue' }) {
  const colors = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800';
  return <div className={clsx('rounded-lg border px-4 py-3', colors)}><p className="text-[10px] font-bold uppercase">{label}</p><p className="mt-1 text-[18px] font-extrabold">{value}</p></div>;
}

function TypeBadge({ value }: { value: VoucherType }) {
  return <span className={clsx('inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase', value === 'Thu' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>{value}</span>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 max-w-[230px] rounded-lg border border-border bg-white px-3 text-[12px] font-bold"><>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</></select>;
}

function FilterSelect({ label, value, onChange, type }: { label: string; value: string; onChange: (value: string) => void; type: 'date' }) {
  return <label><span className="mb-1 block text-[10px] font-bold text-muted-foreground">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-border px-3 text-[12px] font-bold" /></label>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">{label}</span>{children}</label>;
}

function State({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex min-h-[320px] items-center justify-center"><div className="text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">{icon}</div><p className="text-[13px] font-bold text-muted-foreground">{title}</p></div></div>;
}
