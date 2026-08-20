import { AlertTriangle, Loader2, Pencil, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../../lib/api';

export interface ExpenseCategoryRecord {
  id: string | number;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
}

type FormState = { name: string; description: string; is_active: boolean; sort_order: string };
const emptyForm = (): FormState => ({ name: '', description: '', is_active: true, sort_order: '0' });

export default function ExpenseCategoriesPage() {
  const [rows, setRows] = useState<ExpenseCategoryRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ExpenseCategoryRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await apiRequest<ExpenseCategoryRecord[]>('/expense-categories?include_inactive=true'));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không tải được danh mục loại chi phí.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase('vi-VN');
    if (!search) return rows;
    return rows.filter((row) => [row.name, row.description].some((value) => value?.toLocaleLowerCase('vi-VN').includes(search)));
  }, [keyword, rows]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setFormOpen(true);
  };

  const openEdit = (row: ExpenseCategoryRecord) => {
    setEditing(row);
    setForm({ name: row.name, description: row.description || '', is_active: row.is_active, sort_order: String(row.sort_order || 0) });
    setError('');
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Nhập tên loại chi phí.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(editing ? `/expense-categories/${editing.id}` : '/expense-categories', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          is_active: form.is_active,
          sort_order: Math.max(0, Number(form.sort_order) || 0),
        },
      });
      setFormOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được loại chi phí.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (row: ExpenseCategoryRecord) => {
    if (!window.confirm(`Ngừng sử dụng loại chi phí "${row.name}"? Dữ liệu cũ vẫn được giữ nguyên.`)) return;
    setSaving(true);
    try {
      await apiRequest(`/expense-categories/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không cập nhật được loại chi phí.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-foreground">Danh mục loại chi phí</h1>
          <p className="text-sm text-muted-foreground">Danh sách dùng chung cho chi phí chuyến, thanh toán NCC và các sổ thu chi.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white"><Plus size={16} />Thêm loại chi phí</button>
      </div>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 md:max-w-md"><Search size={16} className="text-muted-foreground" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm loại chi phí..." className="min-w-0 flex-1 text-sm outline-none" /></div>
      {error && !formOpen && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle size={15} className="mr-2 inline" />{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">
        {loading ? <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Đang tải...</div> : !filtered.length ? <div className="flex h-60 flex-col items-center justify-center text-sm text-muted-foreground"><Tag size={24} /><p className="mt-2">Chưa có loại chi phí.</p></div> : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="border-b border-border px-4 py-3">Loại chi phí</th><th className="border-b border-border px-4 py-3">Mô tả / quy tắc phân bổ</th><th className="border-b border-border px-4 py-3">Thứ tự</th><th className="border-b border-border px-4 py-3">Trạng thái</th><th className="border-b border-border px-4 py-3 text-right">Thao tác</th></tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-extrabold">{row.name}</td><td className="px-4 py-3 text-muted-foreground">{row.description || '—'}</td><td className="px-4 py-3">{row.sort_order || 0}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${row.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{row.is_active ? 'Đang dùng' : 'Ngừng dùng'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" title="Sửa" onClick={() => openEdit(row)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary"><Pencil size={14} /></button>{row.is_active && <button type="button" title="Ngừng sử dụng" onClick={() => void deactivate(row)} disabled={saving} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 size={14} /></button>}</div></td></tr>)}</tbody>
          </table>
        )}
      </div>
      {formOpen && createPortal(<div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center"><div className="absolute inset-0 bg-slate-900/50" onClick={() => !saving && setFormOpen(false)} /><div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-lg border border-border bg-white shadow-2xl sm:rounded-lg"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-bold uppercase text-primary">Danh mục chi phí</p><h2 className="text-lg font-black">{editing ? 'Sửa loại chi phí' : 'Thêm loại chi phí'}</h2></div><button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X size={18} /></button></div><div className="grid gap-4 p-5"><label className="text-sm font-bold">Tên loại chi phí *<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={100} className="mt-1 h-11 w-full rounded-lg border border-border px-3 outline-none focus:border-primary" /></label><label className="text-sm font-bold">Mô tả / quy tắc phân bổ<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={500} rows={3} className="mt-1 w-full resize-none rounded-lg border border-border p-3 outline-none focus:border-primary" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold">Thứ tự<input type="number" min={0} value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-border px-3" /></label><label className="flex items-center gap-2 self-end rounded-lg border border-border px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />Đang sử dụng</label></div>{error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="h-10 rounded-lg border border-border px-4 text-sm font-bold">Hủy</button><button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 size={15} className="animate-spin" />}Lưu</button></div></div></div>, document.body)}
    </div>
  );
}
