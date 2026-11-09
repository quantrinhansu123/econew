import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../lib/api';
import { formatAmountInput, formatMoney, parseAmountInput } from '../../../lib/formatMoney';
import DraggableScrollTableContainer from '../../../components/ui/DraggableScrollTableContainer';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { ReceiptImageLinks, ReceiptImagePicker } from '../../../components/finance/ReceiptImagePicker';
import { defaultExpenseCategoryNames, loadExpenseCategoryNames } from '../../../lib/expenseCategories';
import { normalizeUserList } from '../../../lib/userNormalize';
import type { UserAccount } from '../../admin/users/types';
import CashFundManagerDialog from '../hub-reconciliation/dialogs/CashFundManagerDialog';
import type { CashFund as ManagedCashFund } from '../hub-reconciliation/types';

type VoucherType = 'Thu' | 'Chi';

interface CashFund {
  id: string | number;
  code?: string | null;
  name?: string | null;
  opening_balance?: number | string | null;
  balance_amount?: number | string | null;
  collection_count?: number | string | null;
  is_active?: boolean;
  note?: string | null;
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

interface VoucherSyncPreview {
  voucher_id: string;
  waybill_code: string;
  current_amount: number;
  new_amount: number;
  fund_name: string | null;
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

interface ColumnFilters {
  date: string;
  type: string;
  source: string;
  hub: string;
  detail: string;
  vendor: string;
  category: string;
  fund: string;
  content: string;
  income: string;
  expense: string;
  creator: string;
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

interface ImportRowPreview {
  entry_date: string;
  voucher_type: VoucherType;
  source: string;
  hub: string;
  detail: string;
  vendor: string;
  cost_category: string;
  fund: string;
  content: string;
  note: string;
  income_amount: number;
  expense_amount: number;
}

const incomeCategories = ['Thu cước vận đơn', 'Thu COD/CC', 'Thu hoàn ứng', 'Thu khác'];
const expenseCategories = defaultExpenseCategoryNames;
const sourceOptions = ['Khách hàng', 'Nhà cung cấp', 'Nội bộ', 'Khác'];
const today = () => new Date().toISOString().slice(0, 10);
const defaultFilters: Filters = { q: '', date_from: '', date_to: '', voucher_type: '', fund_id: '', vendor_id: '', hub_id: '', cost_category: '', page: 1, limit: 50 };
const emptyColFilters: ColumnFilters = {
  date: '',
  type: '',
  source: '',
  hub: '',
  detail: '',
  vendor: '',
  category: '',
  fund: '',
  content: '',
  income: '',
  expense: '',
  creator: '',
};
const newForm = (): EntryForm => ({
  voucher_type: 'Chi',
  entry_date: today(),
  fund_id: '',
  vendor_id: '',
  hub_id: '',
  source: 'Nội bộ',
  cost_category: expenseCategories[0],
  detail: '',
  content: '',
  note: '',
  amount: '',
  attachment_urls: [],
});
const normalizeList = <T,>(response: T[] | { items?: T[]; data?: T[] }) => (Array.isArray(response) ? response : response.items || response.data || []);
const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Không xử lý được dữ liệu.');
const accountantDetail = (accountant: UserAccount) => [accountant.name, accountant.username].filter(Boolean).join(' · ') || String(accountant.id);

function buildQuery(filters: Filters, overrideLimit?: number) {
  const params = new URLSearchParams({
    page: overrideLimit ? '1' : String(filters.page),
    limit: String(overrideLimit ?? filters.limit),
  });
  for (const key of ['q', 'date_from', 'date_to', 'voucher_type', 'fund_id', 'vendor_id', 'hub_id', 'cost_category'] as const) {
    const value = filters[key];
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  return params.toString();
}

function normalizeExcelDate(raw: unknown): string {
  if (!raw) return today();
  if (typeof raw === 'number' && raw > 20000) {
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const text = String(raw).trim();
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return today();
}

function parseExcelMoney(raw: unknown): number {
  if (typeof raw === 'number') return Math.round(Math.abs(raw));
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

export default function DailyCashJournalPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [colFilters, setColFilters] = useState<ColumnFilters>(emptyColFilters);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [allFunds, setAllFunds] = useState<CashFund[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [accountants, setAccountants] = useState<UserAccount[]>([]);
  const [savedExpenseCategories, setSavedExpenseCategories] = useState<string[]>([]);
  const [meta, setMeta] = useState<JournalResponse['meta']>({ total: 0, page: 1, limit: 50, total_pages: 1, total_income: 0, total_expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [fundManagerOpen, setFundManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<EntryForm>(newForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [syncingId, setSyncingId] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  const [exportingExcel, setExportingExcel] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRowPreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const funds = useMemo(() => allFunds.filter((f) => f.is_active !== false), [allFunds]);

  const loadReferences = useCallback(async () => {
    const [fundResponse, vendorResponse, hubResponse, accountantResponse, categoryResponse] = await Promise.all([
      apiRequest<CashFund[] | { items?: CashFund[]; data?: CashFund[] }>('/finance/cash-funds?include_inactive=true'),
      apiRequest<Vendor[] | { items?: Vendor[]; data?: Vendor[] }>('/vendors?status=ACTIVE&limit=500'),
      apiRequest<Hub[] | { items?: Hub[]; data?: Hub[] }>('/hubs/active'),
      apiRequest<unknown>('/users?role_mask=16&is_active=true&limit=100'),
      loadExpenseCategoryNames(),
    ]);
    setAllFunds(normalizeList(fundResponse));
    setVendors(normalizeList(vendorResponse));
    setHubs(normalizeList(hubResponse));
    setAccountants(normalizeUserList(accountantResponse).users);
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

  const categoryOptions = useMemo(() => (
    form.voucher_type === 'Thu'
      ? incomeCategories
      : [...new Set([...savedExpenseCategories, ...entries.filter((entry) => entry.voucher_type === 'Chi' && entry.record_id === editingId).map((entry) => entry.cost_category).filter(Boolean)])]
  ), [editingId, entries, form.voucher_type, savedExpenseCategories]);

  const allCategories = useMemo(() => (
    [...new Set([...incomeCategories, ...expenseCategories, ...savedExpenseCategories, ...entries.map((entry) => entry.cost_category).filter(Boolean)])]
  ), [entries, savedExpenseCategories]);

  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const updateColFilters = (patch: Partial<ColumnFilters>) => setColFilters((current) => ({ ...current, ...patch }));
  const updateForm = (patch: Partial<EntryForm>) => setForm((current) => ({ ...current, ...patch }));

  const hasColFilter = useMemo(
    () => Object.values(colFilters).some((val) => val.trim().length > 0),
    [colFilters],
  );

  const filteredEntries = useMemo(() => {
    if (!hasColFilter) return entries;
    const matchText = (value: unknown, needle: string) => {
      if (!needle.trim()) return true;
      return String(value ?? '').toLocaleLowerCase('vi-VN').includes(needle.trim().toLocaleLowerCase('vi-VN'));
    };
    return entries.filter((entry) => {
      const dateLabel = new Date(entry.entry_date).toLocaleDateString('vi-VN');
      const hubLabel = [entry.hub_code, entry.hub_name].filter(Boolean).join(' · ');
      const vendorLabel = [entry.vendor_code, entry.vendor_name].filter(Boolean).join(' · ');
      const fundLabel = [entry.fund_code, entry.fund_name].filter(Boolean).join(' · ');
      const contentLabel = [entry.content, entry.note].filter(Boolean).join(' ');
      return (
        matchText(`${dateLabel} ${entry.entry_date}`, colFilters.date)
        && matchText(entry.voucher_type, colFilters.type)
        && matchText(entry.source, colFilters.source)
        && matchText(hubLabel, colFilters.hub)
        && matchText(entry.detail, colFilters.detail)
        && matchText(vendorLabel, colFilters.vendor)
        && matchText(entry.cost_category, colFilters.category)
        && matchText(fundLabel, colFilters.fund)
        && matchText(contentLabel, colFilters.content)
        && matchText(`${entry.income_amount} ${formatMoney(entry.income_amount)}`, colFilters.income)
        && matchText(`${entry.expense_amount} ${formatMoney(entry.expense_amount)}`, colFilters.expense)
        && matchText(entry.created_by_name, colFilters.creator)
      );
    });
  }, [entries, colFilters, hasColFilter]);

  const displayedSummary = useMemo(() => {
    if (!hasColFilter) {
      return {
        income: meta.total_income,
        expense: meta.total_expense,
        balance: meta.balance,
      };
    }
    const income = filteredEntries.reduce((sum, e) => sum + Number(e.income_amount || 0), 0);
    const expense = filteredEntries.reduce((sum, e) => sum + Number(e.expense_amount || 0), 0);
    return { income, expense, balance: income - expense };
  }, [filteredEntries, hasColFilter, meta]);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    setSyncError('');
    try {
      const XLSX = await import('xlsx');
      let exportItems = filteredEntries;
      if (!hasColFilter && meta.total > entries.length) {
        const fullRes = await apiRequest<JournalResponse>(`/cash-journal-entries?${buildQuery(filters, Math.min(5000, meta.total || 2000))}`);
        exportItems = fullRes.items || entries;
      }
      const rows = exportItems.map((entry, idx) => ({
        STT: idx + 1,
        'Ngày': new Date(entry.entry_date).toLocaleDateString('vi-VN'),
        'Loại': entry.voucher_type,
        'Nguồn': entry.source,
        'HUB': [entry.hub_code, entry.hub_name].filter(Boolean).join(' · ') || '',
        'Đối tượng': entry.detail || '',
        'NCC': [entry.vendor_code, entry.vendor_name].filter(Boolean).join(' · ') || '',
        'Phân loại': entry.cost_category || '',
        'Sổ quỹ': [entry.fund_code, entry.fund_name].filter(Boolean).join(' · ') || '',
        'Nội dung': entry.content || '',
        'Ghi chú': entry.note || '',
        'Thu': Number(entry.income_amount || 0),
        'Chi': Number(entry.expense_amount || 0),
        'Người lập': entry.created_by_name || '',
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = [6, 13, 8, 14, 20, 24, 20, 26, 22, 34, 24, 15, 15, 18].map((wch) => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Nhật ký thu chi');
      XLSX.writeFile(book, `nhat-ky-thu-chi-${today()}.xlsx`);
    } catch (exportErr) {
      setSyncError(errorMessage(exportErr));
    } finally {
      setExportingExcel(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sample = [
      {
        'Ngày': new Date().toLocaleDateString('vi-VN'),
        'Loại': 'Chi',
        'Nguồn': 'Nội bộ',
        'HUB': hubs[0]?.code || 'HCM',
        'Đối tượng': 'Nguyễn Văn A',
        'NCC': '',
        'Phân loại': savedExpenseCategories[0] || expenseCategories[0] || '642- chi phí quản lý doanh nghiệp',
        'Sổ quỹ': funds[0]?.code || 'C THẮM',
        'Nội dung': 'Chi tiền dầu / văn phòng phẩm',
        'Ghi chú': '',
        'Thu': 0,
        'Chi': 500000,
      },
      {
        'Ngày': new Date().toLocaleDateString('vi-VN'),
        'Loại': 'Thu',
        'Nguồn': 'Khách hàng',
        'HUB': hubs[0]?.code || 'HAN',
        'Đối tượng': 'Khách lẻ',
        'NCC': '',
        'Phân loại': 'Thu cước vận đơn',
        'Sổ quỹ': funds[0]?.code || 'C THẮM',
        'Nội dung': 'Thu tiền cước vận đơn',
        'Ghi chú': '',
        'Thu': 1200000,
        'Chi': 0,
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(sample);
    sheet['!cols'] = [13, 8, 14, 14, 22, 16, 28, 18, 30, 20, 14, 14].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Mau_Dong_Bo');
    XLSX.writeFile(book, 'mau-dong-bo-nhat-ky-thu-chi.xlsx');
  };

  const handleSelectExcelFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError('');
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

      const parsed: ImportRowPreview[] = [];
      for (const r of rawRows) {
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const foundKey = Object.keys(r).find((rk) => rk.trim().toLocaleLowerCase('vi-VN') === k.toLocaleLowerCase('vi-VN'));
            if (foundKey && String(r[foundKey] ?? '').trim() !== '') return r[foundKey];
          }
          return '';
        };
        const income = parseExcelMoney(getVal('Thu', 'Tiền thu', 'Số tiền thu', 'income_amount'));
        const expense = parseExcelMoney(getVal('Chi', 'Tiền chi', 'Số tiền chi', 'expense_amount'));
        const directAmount = parseExcelMoney(getVal('Số tiền', 'amount'));
        const rawType = String(getVal('Loại', 'Thu/Chi', 'voucher_type') || '').trim().toLocaleLowerCase('vi-VN');
        const voucherType: VoucherType = rawType.includes('thu') || (income > 0 && expense === 0) ? 'Thu' : 'Chi';
        const finalIncome = voucherType === 'Thu' ? (income || directAmount) : 0;
        const finalExpense = voucherType === 'Chi' ? (expense || directAmount) : 0;
        if (finalIncome <= 0 && finalExpense <= 0) continue;

        parsed.push({
          entry_date: normalizeExcelDate(getVal('Ngày', 'Ngày ghi sổ', 'entry_date')),
          voucher_type: voucherType,
          source: String(getVal('Nguồn', 'source') || (voucherType === 'Thu' ? 'Khách hàng' : 'Nội bộ')).trim(),
          hub: String(getVal('HUB', 'Bưu cục', 'hub_code') || '').trim(),
          detail: String(getVal('Đối tượng', 'Chi tiết', 'detail') || 'Đồng bộ Excel').trim(),
          vendor: String(getVal('NCC', 'Nhà cung cấp', 'vendor') || '').trim(),
          cost_category: String(getVal('Phân loại', 'Loại chi phí', 'Loại thu/chi', 'cost_category') || (voucherType === 'Thu' ? 'Thu khác' : '642- chi phí quản lý doanh nghiệp')).trim(),
          fund: String(getVal('Sổ quỹ', 'Mã quỹ', 'fund') || funds[0]?.code || '').trim(),
          content: String(getVal('Nội dung', 'Diễn giải', 'content') || 'Đồng bộ từ Excel').trim(),
          note: String(getVal('Ghi chú', 'note') || '').trim(),
          income_amount: finalIncome,
          expense_amount: finalExpense,
        });
      }

      if (!parsed.length) {
        setImportError('Không tìm thấy dòng dữ liệu Thu/Chi hợp lệ trong file Excel.');
      }
      setImportRows(parsed);
      setImportModalOpen(true);
    } catch (readErr) {
      setSyncError(errorMessage(readErr));
    }
  };

  const confirmImportExcel = async () => {
    if (!importRows.length) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await apiRequest<{ imported: number }>('/cash-journal-entries/import', {
        method: 'POST',
        body: { items: importRows },
      });
      setImportModalOpen(false);
      setImportRows([]);
      setSyncMessage(`Đã đồng bộ thành công ${res.imported} giao dịch từ file Excel vào Nhật ký thu chi.`);
      await Promise.all([loadEntries(), loadReferences()]);
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

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

  const syncFromWaybill = async (entry: JournalEntry) => {
    setSyncingId(entry.id);
    setSyncMessage('');
    setSyncError('');
    try {
      const preview = await apiRequest<VoucherSyncPreview>(`/waybills/cash-vouchers/${entry.record_id}/sync-preview`);
      if (preview.new_amount === preview.current_amount) {
        setSyncMessage(`Phiếu thu ${preview.waybill_code} đã khớp với vận đơn.`);
        return;
      }
      const confirmed = window.confirm(
        `Cập nhật phiếu thu ${preview.waybill_code} trong quỹ ${preview.fund_name || entry.fund_code || ''}?\n`
        + `Hiện tại: ${formatMoney(preview.current_amount)}\n`
        + `Theo vận đơn: ${formatMoney(preview.new_amount)}\n`
        + `Chênh lệch: ${formatMoney(preview.new_amount - preview.current_amount)}`,
      );
      if (!confirmed) return;
      await apiRequest(`/waybills/cash-vouchers/${entry.record_id}/sync-with-waybill`, {
        method: 'POST',
        body: { expected_amount: preview.new_amount, expected_current_amount: preview.current_amount },
      });
      await Promise.all([loadEntries(), loadReferences()]);
      setSyncMessage(`Đã cập nhật phiếu thu ${preview.waybill_code} và số dư quỹ.`);
    } catch (requestError) {
      setSyncError(errorMessage(requestError));
    } finally {
      setSyncingId('');
    }
  };

  const activeFilterCount = ['q', 'date_from', 'date_to', 'voucher_type', 'fund_id', 'vendor_id', 'hub_id', 'cost_category'].filter((key) => Boolean(String(filters[key as keyof Filters]).trim())).length;
  const pageCount = Math.max(1, meta.total_pages || Math.ceil(meta.total / filters.limit));
  const colFilterInputClass = 'mt-1 h-7 w-full min-w-[72px] rounded border border-slate-300 bg-white px-2 text-[11px] font-medium normal-case text-slate-800 outline-none focus:border-primary';

  return (
    <div className="flex h-[calc(100dvh-108px)] max-h-[calc(100dvh-108px)] min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-3">
        <button type="button" onClick={() => navigate(-1)} title="Quay lại" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-extrabold text-foreground">Nhật ký thu chi</h1>
          <p className="text-[12px] text-muted-foreground">Thu chi hằng ngày theo sổ quỹ, nhà cung cấp và loại chi phí</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => void handleSelectExcelFile(event)}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => setFundManagerOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-blue-50 px-3 text-[13px] font-extrabold text-primary hover:bg-blue-100"
        >
          <WalletCards size={16} />
          Sổ quỹ &amp; Chuyển quỹ
        </button>

        <button
          type="button"
          onClick={() => {
            setImportRows([]);
            setImportError('');
            setImportModalOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[13px] font-extrabold text-amber-800 hover:bg-amber-100"
        >
          <Upload size={16} />
          Đồng bộ Excel
        </button>

        <button
          type="button"
          disabled={exportingExcel || loading}
          onClick={() => void handleExportExcel()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[13px] font-extrabold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Dow Excel
        </button>

        <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white"><Plus size={16} />Thêm thu chi</button>
      </div>

      <div className="grid grid-cols-1 gap-2 px-1 sm:grid-cols-3">
        <Metric label="Tổng thu" value={formatMoney(displayedSummary.income, { empty: '0 đ' })} tone="emerald" />
        <Metric label="Tổng chi" value={formatMoney(displayedSummary.expense, { empty: '0 đ' })} tone="red" />
        <Metric label="Chênh lệch" value={formatMoney(displayedSummary.balance, { empty: '0 đ' })} tone="blue" />
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
        {(activeFilterCount > 0 || hasColFilter) && (
          <button
            type="button"
            onClick={() => {
              setFilters((current) => ({ ...defaultFilters, limit: current.limit }));
              setColFilters(emptyColFilters);
            }}
            className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-bold text-red-600"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {syncMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-800">{syncMessage}</p>}
      {syncError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{syncError}</p>}

      <DraggableScrollTableContainer>
        {loading ? <State icon={<Loader2 className="animate-spin" />} title="Đang tải nhật ký" /> : error ? <State icon={<AlertTriangle />} title={error} /> : entries.length === 0 ? <State icon={<Receipt />} title="Chưa có giao dịch phù hợp" /> : <>
          <table className="hidden min-w-[1650px] w-full border-collapse text-left md:table">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Ngày</div>
                  <input value={colFilters.date} onChange={(e) => updateColFilters({ date: e.target.value })} placeholder="Lọc ngày..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Loại</div>
                  <select value={colFilters.type} onChange={(e) => updateColFilters({ type: e.target.value })} className={colFilterInputClass}>
                    <option value="">Tất cả</option>
                    <option value="Thu">Thu</option>
                    <option value="Chi">Chi</option>
                  </select>
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Nguồn</div>
                  <input value={colFilters.source} onChange={(e) => updateColFilters({ source: e.target.value })} placeholder="Lọc nguồn..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>HUB</div>
                  <input value={colFilters.hub} onChange={(e) => updateColFilters({ hub: e.target.value })} placeholder="Lọc HUB..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Đối tượng</div>
                  <input value={colFilters.detail} onChange={(e) => updateColFilters({ detail: e.target.value })} placeholder="Lọc đối tượng..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>NCC</div>
                  <input value={colFilters.vendor} onChange={(e) => updateColFilters({ vendor: e.target.value })} placeholder="Lọc NCC..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Phân loại</div>
                  <input value={colFilters.category} onChange={(e) => updateColFilters({ category: e.target.value })} placeholder="Lọc phân loại..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Sổ quỹ</div>
                  <input value={colFilters.fund} onChange={(e) => updateColFilters({ fund: e.target.value })} placeholder="Lọc sổ quỹ..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Nội dung</div>
                  <input value={colFilters.content} onChange={(e) => updateColFilters({ content: e.target.value })} placeholder="Lọc nội dung..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Chứng từ</div>
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 text-right font-extrabold">
                  <div>Thu</div>
                  <input value={colFilters.income} onChange={(e) => updateColFilters({ income: e.target.value })} placeholder="Lọc thu..." className={`${colFilterInputClass} text-right`} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 text-right font-extrabold">
                  <div>Chi</div>
                  <input value={colFilters.expense} onChange={(e) => updateColFilters({ expense: e.target.value })} placeholder="Lọc chi..." className={`${colFilterInputClass} text-right`} />
                </th>
                <th className="border-b border-r border-border px-2.5 py-2 font-extrabold">
                  <div>Người lập</div>
                  <input value={colFilters.creator} onChange={(e) => updateColFilters({ creator: e.target.value })} placeholder="Lọc người lập..." className={colFilterInputClass} />
                </th>
                <th className="border-b border-border px-2.5 py-2 font-extrabold"></th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-10 text-center text-[13px] font-bold text-muted-foreground">
                    Không có dòng nào khớp bộ lọc tiêu đề cột.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <JournalRow key={entry.id} entry={entry} syncing={syncingId === entry.id} onSync={() => void syncFromWaybill(entry)} onEdit={() => openEdit(entry)} onRemove={() => void remove(entry)} />
                ))
              )}
            </tbody>
          </table>
          <div className="grid gap-2 p-3 md:hidden">{filteredEntries.map((entry) => <JournalCard key={entry.id} entry={entry} syncing={syncingId === entry.id} onSync={() => void syncFromWaybill(entry)} onEdit={() => openEdit(entry)} onRemove={() => void remove(entry)} />)}</div>
        </>}
      </DraggableScrollTableContainer>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-3 py-2 text-[12px] text-muted-foreground">
        <span>
          Hiển thị <b className="text-foreground">{filteredEntries.length.toLocaleString('vi-VN')}</b> / Tổng <b className="text-foreground">{meta.total.toLocaleString('vi-VN')}</b> giao dịch
        </span>
        <div className="flex items-center gap-2">
          <select value={filters.limit} onChange={(event) => updateFilters({ limit: Number(event.target.value), page: 1 })} className="h-8 rounded-lg border border-border px-2">
            {[20, 50, 100, 200, 500].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
          </select>
          <button type="button" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronLeft size={14} /></button>
          <b>{filters.page}/{pageCount}</b>
          <button type="button" disabled={filters.page >= pageCount} onClick={() => updateFilters({ page: filters.page + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
      </div>

      {formOpen && <EntryDialog form={form} editing={Boolean(editingId)} categories={categoryOptions} funds={funds} hubs={hubs} vendors={vendors} accountants={accountants} submitting={submitting} uploadingReceipt={uploadingReceipt} error={formError} onChange={updateForm} onUploadingReceiptChange={setUploadingReceipt} onTypeChange={changeVoucherType} onClose={() => setFormOpen(false)} onSubmit={() => void submit()} />}

      <CashFundManagerDialog
        open={fundManagerOpen}
        funds={allFunds as ManagedCashFund[]}
        onClose={() => setFundManagerOpen(false)}
        onChanged={async () => {
          await Promise.all([loadReferences(), loadEntries()]);
        }}
      />

      {importModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-amber-600" />
                <h2 className="text-lg font-extrabold">Đồng bộ dữ liệu Nhật ký thu chi từ Excel</h2>
              </div>
              <button type="button" onClick={() => setImportModalOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[12px]">
                <span className="font-bold text-amber-900">
                  Chọn file Excel (.xlsx) có các cột: Ngày, Loại (Thu/Chi), Nguồn, HUB, Đối tượng, NCC, Phân loại, Sổ quỹ, Nội dung, Thu, Chi.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadTemplate()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 font-extrabold text-amber-800 hover:bg-amber-100"
                  >
                    <Download size={14} />
                    Tải file Excel mẫu
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 font-extrabold text-white"
                  >
                    <Upload size={14} />
                    Chọn file Excel từ máy
                  </button>
                </div>
              </div>

              {importError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{importError}</div>}

              {importRows.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[780px] border-collapse text-left text-[12px]">
                    <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
                      <tr>
                        {['#', 'Ngày', 'Loại', 'Sổ quỹ', 'HUB', 'Đối tượng', 'Phân loại', 'Nội dung', 'Thu', 'Chi'].map((h, i) => (
                          <th key={h} className={`border-b border-border px-2.5 py-2 font-extrabold ${i >= 8 ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-2.5 py-2 font-bold text-muted-foreground">{idx + 1}</td>
                          <td className="px-2.5 py-2 font-bold">{row.entry_date}</td>
                          <td className="px-2.5 py-2"><TypeBadge value={row.voucher_type} /></td>
                          <td className="px-2.5 py-2 font-bold text-primary">{row.fund}</td>
                          <td className="px-2.5 py-2">{row.hub || '—'}</td>
                          <td className="px-2.5 py-2 font-bold">{row.detail}</td>
                          <td className="px-2.5 py-2">{row.cost_category}</td>
                          <td className="px-2.5 py-2">{row.content}</td>
                          <td className="px-2.5 py-2 text-right font-extrabold text-emerald-700">{row.income_amount > 0 ? formatMoney(row.income_amount) : '—'}</td>
                          <td className="px-2.5 py-2 text-right font-extrabold text-red-600">{row.expense_amount > 0 ? formatMoney(row.expense_amount) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-[13px] font-bold text-muted-foreground">
                  Chưa chọn file Excel. Bấm &ldquo;Chọn file Excel từ máy&rdquo; để xem trước dữ liệu trước khi đồng bộ.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-[12px] font-bold text-muted-foreground">
                Số dòng hợp lệ sẵn sàng đồng bộ: <b className="text-foreground">{importRows.length}</b>
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setImportModalOpen(false)} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold">Đóng</button>
                <button
                  type="button"
                  disabled={!importRows.length || importing}
                  onClick={() => void confirmImportExcel()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
                >
                  {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Đồng bộ {importRows.length} giao dịch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const canSyncVoucher = (entry: JournalEntry) => entry.source === 'Vận đơn' && entry.source_type === 'MANUAL' && !entry.editable && entry.voucher_type === 'Thu';

function SyncButton({ onClick, syncing }: { onClick: () => void; syncing: boolean }) {
  return <button type="button" disabled={syncing} onClick={onClick} title="Cập nhật số tiền phiếu thu theo vận đơn" className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-primary hover:bg-blue-100 disabled:opacity-50">{syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Cập nhật theo đơn</button>;
}

function JournalRow({ entry, onEdit, onRemove, onSync, syncing }: { entry: JournalEntry; onEdit: () => void; onRemove: () => void; onSync: () => void; syncing: boolean }) {
  return <tr className="border-b border-border text-[12px] hover:bg-muted/20"><td className="border-r border-border px-3 py-2.5 font-bold">{new Date(entry.entry_date).toLocaleDateString('vi-VN')}</td><td className="border-r border-border px-3 py-2.5"><TypeBadge value={entry.voucher_type} /></td><td className="border-r border-border px-3 py-2.5">{canSyncVoucher(entry) ? <button type="button" disabled={syncing} onClick={onSync} title="Cập nhật phiếu thu theo vận đơn" className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:opacity-50">Vận đơn<RefreshCw size={12} className={syncing ? "animate-spin" : ""} /></button> : entry.source}</td><td className="border-r border-border px-3 py-2.5 font-bold">{[entry.hub_code, entry.hub_name].filter(Boolean).join(' · ') || '—'}</td><td className="border-r border-border px-3 py-2.5 font-bold">{entry.detail}</td><td className="border-r border-border px-3 py-2.5">{[entry.vendor_code, entry.vendor_name].filter(Boolean).join(' · ') || '—'}</td><td className="border-r border-border px-3 py-2.5">{entry.cost_category}</td><td className="border-r border-border px-3 py-2.5 font-bold">{[entry.fund_code, entry.fund_name].filter(Boolean).join(' · ') || 'Chưa chi quỹ'}</td><td className="max-w-[280px] border-r border-border px-3 py-2.5"><p className="truncate" title={entry.content}>{entry.content}</p>{entry.note && <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={entry.note}>{entry.note}</p>}</td><td className="border-r border-border px-3 py-2.5"><ReceiptImageLinks images={entry.attachment_urls} /></td><td className="border-r border-border px-3 py-2.5 text-right font-extrabold text-emerald-700">{entry.income_amount > 0 ? formatMoney(entry.income_amount) : '—'}</td><td className="border-r border-border px-3 py-2.5 text-right font-extrabold text-red-600">{entry.expense_amount > 0 ? formatMoney(entry.expense_amount) : '—'}</td><td className="border-r border-border px-3 py-2.5">{entry.created_by_name || '—'}</td><td className="px-2 py-2.5">{canSyncVoucher(entry) && <SyncButton onClick={onSync} syncing={syncing} />}{entry.editable && <div className="flex gap-1"><button type="button" title="Sửa" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary hover:bg-blue-50"><Pencil size={14} /></button><button type="button" title="Xóa" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button></div>}</td></tr>;
}

function JournalCard({ entry, onEdit, onRemove, onSync, syncing }: { entry: JournalEntry; onEdit: () => void; onRemove: () => void; onSync: () => void; syncing: boolean }) {
  return <article className="rounded-lg border border-border bg-white p-3"><div className="flex items-start justify-between gap-2"><div><TypeBadge value={entry.voucher_type} /><p className="mt-2 text-[14px] font-extrabold">{entry.detail}</p><p className="text-[11px] text-muted-foreground">{new Date(entry.entry_date).toLocaleDateString('vi-VN')} · {[entry.fund_code, entry.fund_name].filter(Boolean).join(' · ') || 'Chưa chi quỹ'}</p><p className="text-[11px] font-bold text-primary">{[entry.hub_code, entry.hub_name].filter(Boolean).join(' · ') || 'Chưa gắn HUB'}</p></div><p className={clsx('text-[15px] font-black', entry.voucher_type === 'Thu' ? 'text-emerald-700' : 'text-red-600')}>{formatMoney(entry.voucher_type === 'Thu' ? entry.income_amount : entry.expense_amount)}</p></div><p className="mt-2 text-[12px]">{entry.content}</p><p className="mt-1 text-[11px] font-bold text-muted-foreground">{entry.cost_category}{entry.vendor_name ? ` · ${entry.vendor_name}` : ''}</p><div className="mt-2"><ReceiptImageLinks images={entry.attachment_urls} /></div>{canSyncVoucher(entry) && <div className="mt-3 flex justify-end border-t border-border pt-2"><SyncButton onClick={onSync} syncing={syncing} /></div>}{entry.editable && <div className="mt-3 flex justify-end gap-1 border-t border-border pt-2"><button type="button" title="Sửa" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary"><Pencil size={14} /></button><button type="button" title="Xóa" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 size={14} /></button></div>}</article>;
}

function EntryDialog({ form, editing, categories, funds, hubs, vendors, accountants, submitting, uploadingReceipt, error, onChange, onUploadingReceiptChange, onTypeChange, onClose, onSubmit }: { form: EntryForm; editing: boolean; categories: string[]; funds: CashFund[]; hubs: Hub[]; vendors: Vendor[]; accountants: UserAccount[]; submitting: boolean; uploadingReceipt: boolean; error: string; onChange: (patch: Partial<EntryForm>) => void; onUploadingReceiptChange: (uploading: boolean) => void; onTypeChange: (value: VoucherType) => void; onClose: () => void; onSubmit: () => void }) {
  const inputClass = 'h-11 w-full rounded-lg border border-border bg-white px-3 text-[13px] outline-none focus:border-primary';
  const accountantOptions = accountants.map((accountant) => ({ value: accountantDetail(accountant), label: accountantDetail(accountant) }));
  if (form.detail && !accountantOptions.some((option) => option.value === form.detail)) {
    accountantOptions.unshift({ value: form.detail, label: `${form.detail} · dữ liệu cũ` });
  }
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
            <Field label="Đối tượng / chi tiết *"><SearchableSelect value={form.detail} onValueChange={(value) => onChange({ detail: value })} options={accountantOptions} placeholder="Chọn tài khoản kế toán" searchPlaceholder="Tìm tên hoặc tài khoản kế toán..." emptyMessage="Chưa có tài khoản đang hoạt động được cấp quyền Kế toán." disabled={submitting} className="h-11 rounded-lg bg-white px-3 font-bold" /></Field>
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
