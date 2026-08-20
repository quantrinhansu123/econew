import { AlertTriangle, Building2, Loader2, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, apiRequest } from '../../lib/api';
import { formatAmountInput, formatMoney, parseAmountInput } from '../../lib/formatMoney';
import type { StaffDepartment, StaffPageResponse, StaffRecord } from './staffTypes';

type Reference = { id: string | number; code?: string; name?: string; username?: string; full_name?: string; is_active?: boolean };
type FormState = {
  employee_code: string; full_name: string; department_id: string; position: string; phone: string; email: string;
  identity_number: string; address: string; hire_date: string; employment_status: string; hub_id: string; user_id: string;
  base_salary: string; meal_allowance: string; transport_allowance: string; other_allowance: string;
  overtime_hourly_rate: string; standard_work_days: string; note: string;
};

const emptyForm = (): FormState => ({ employee_code: '', full_name: '', department_id: '', position: '', phone: '', email: '', identity_number: '', address: '', hire_date: '', employment_status: 'ACTIVE', hub_id: '', user_id: '', base_salary: '', meal_allowance: '', transport_allowance: '', other_allowance: '', overtime_hourly_rate: '', standard_work_days: '26', note: '' });
const rowsFrom = <T,>(response: T[] | { data?: T[]; items?: T[]; users?: T[] }) => Array.isArray(response) ? response : response.data || response.items || response.users || [];
const message = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export default function FinanceStaffPage() {
  const [rows, setRows] = useState<StaffRecord[]>([]);
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);
  const [hubs, setHubs] = useState<Reference[]>([]);
  const [users, setUsers] = useState<Reference[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [staffResponse, departmentResponse, hubResponse, userResponse] = await Promise.all([
        apiRequest<StaffPageResponse>('/staff-members?limit=500'),
        apiRequest<StaffDepartment[]>('/staff-members/departments/list?include_inactive=true'),
        apiRequest<Reference[] | { data?: Reference[]; items?: Reference[] }>('/hubs/active'),
        apiRequest<Reference[] | { data?: Reference[]; items?: Reference[]; users?: Reference[] }>('/users?limit=100&is_active=true'),
      ]);
      setRows(staffResponse.data || staffResponse.items || []);
      setDepartments(departmentResponse);
      setHubs(rowsFrom(hubResponse));
      setUsers(rowsFrom(userResponse));
    } catch (requestError) {
      setError(message(requestError, 'Không tải được danh sách nhân sự.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase('vi-VN');
    if (!search) return rows;
    return rows.filter((row) => [row.employee_code, row.full_name, row.phone, row.position, row.department_record?.name || row.department].some((value) => value?.toLocaleLowerCase('vi-VN').includes(search)));
  }, [keyword, rows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), department_id: String(departments.find((item) => item.is_active)?.id || '') });
    setError('');
    setFormOpen(true);
  };

  const openEdit = (row: StaffRecord) => {
    setEditing(row);
    setForm({
      employee_code: row.employee_code || '', full_name: row.full_name || '', department_id: String(row.department_id || row.department_record?.id || ''), position: row.position || '', phone: row.phone || '', email: row.email || '', identity_number: row.identity_number || '', address: row.address || '', hire_date: row.hire_date?.slice(0, 10) || '', employment_status: row.employment_status || 'ACTIVE', hub_id: String(row.hub_id || row.hub?.id || ''), user_id: String(row.user_id || row.user?.id || ''), base_salary: formatAmountInput(String(row.base_salary || '')), meal_allowance: formatAmountInput(String(row.meal_allowance || '')), transport_allowance: formatAmountInput(String(row.transport_allowance || '')), other_allowance: formatAmountInput(String(row.other_allowance || '')), overtime_hourly_rate: formatAmountInput(String(row.overtime_hourly_rate || '')), standard_work_days: String(row.standard_work_days || 26), note: row.note || '',
    });
    setError('');
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.employee_code.trim() || !form.full_name.trim() || !form.department_id || !form.position.trim() || !form.phone.trim()) {
      setError('Nhập mã nhân sự, họ tên, bộ phận, chức danh và số điện thoại.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(editing ? `/staff-members/${editing.id}` : '/staff-members', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          employee_code: form.employee_code.trim(), full_name: form.full_name.trim(), department_id: form.department_id,
          position: form.position.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
          identity_number: form.identity_number.trim() || null, address: form.address.trim() || null,
          hire_date: form.hire_date || null, employment_status: form.employment_status, hub_id: form.hub_id || null,
          user_id: form.user_id || null, base_salary: parseAmountInput(form.base_salary), meal_allowance: parseAmountInput(form.meal_allowance),
          transport_allowance: parseAmountInput(form.transport_allowance), other_allowance: parseAmountInput(form.other_allowance),
          overtime_hourly_rate: parseAmountInput(form.overtime_hourly_rate), standard_work_days: Math.max(1, Number(form.standard_work_days) || 26),
          note: form.note.trim() || null,
        },
      });
      setFormOpen(false);
      await load();
    } catch (requestError) {
      setError(message(requestError, 'Không lưu được hồ sơ nhân sự.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (row: StaffRecord) => {
    if (!window.confirm(`Ngừng làm việc đối với ${row.full_name}?`)) return;
    try { await apiRequest(`/staff-members/${row.id}`, { method: 'DELETE' }); await load(); }
    catch (requestError) { setError(message(requestError, 'Không cập nhật được nhân sự.')); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1"><h1 className="text-xl font-black text-foreground">Tổng danh sách nhân sự nội bộ</h1><p className="text-sm text-muted-foreground">Hồ sơ nhân sự độc lập; không bắt buộc phải có tài khoản đăng nhập.</p></div><button type="button" onClick={() => setDepartmentOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-bold"><Building2 size={16} />Bộ phận</button><button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white"><Plus size={16} />Thêm nhân sự</button></div>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 md:max-w-md"><Search size={16} className="text-muted-foreground" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm mã, tên, SĐT, bộ phận..." className="min-w-0 flex-1 text-sm outline-none" /></div>
      {error && !formOpen && !departmentOpen && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline" size={15} />{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">{loading ? <State loading text="Đang tải nhân sự..." /> : !filtered.length ? <State text="Chưa có hồ sơ nhân sự." /> : <table className="w-full min-w-[1200px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground"><tr>{['Mã NV', 'Họ tên', 'Bộ phận / chức danh', 'Liên hệ', 'Bưu cục', 'Lương cơ bản', 'Phụ cấp', 'Tài khoản', 'Trạng thái', 'Thao tác'].map((label) => <th key={label} className="border-b border-border px-3 py-3">{label}</th>)}</tr></thead><tbody>{filtered.map((row) => { const allowance = Number(row.meal_allowance || 0) + Number(row.transport_allowance || 0) + Number(row.other_allowance || 0); return <tr key={row.id} className="border-b border-border last:border-0"><td className="px-3 py-3 font-black text-primary">{row.employee_code}</td><td className="px-3 py-3"><p className="font-extrabold">{row.full_name}</p><p className="text-xs text-muted-foreground">{row.identity_number || '—'}</p></td><td className="px-3 py-3"><p className="font-bold">{row.department_record?.name || row.department || '—'}</p><p className="text-xs text-muted-foreground">{row.position}</p></td><td className="px-3 py-3"><p>{row.phone}</p><p className="text-xs text-muted-foreground">{row.email || '—'}</p></td><td className="px-3 py-3">{[row.hub?.code, row.hub?.name].filter(Boolean).join(' · ') || '—'}</td><td className="px-3 py-3 font-bold">{formatMoney(row.base_salary)}</td><td className="px-3 py-3 font-bold">{formatMoney(allowance)}</td><td className="px-3 py-3">{row.user ? row.user.full_name || row.user.username : 'Không dùng user'}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${row.employment_status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{row.employment_status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'}</span></td><td className="px-3 py-3"><div className="flex gap-1"><button type="button" title="Sửa" onClick={() => openEdit(row)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary"><Pencil size={14} /></button>{row.employment_status === 'ACTIVE' && <button type="button" title="Ngừng làm việc" onClick={() => void deactivate(row)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 size={14} /></button>}</div></td></tr>; })}</tbody></table>}</div>
      {formOpen && <StaffDialog form={form} editing={Boolean(editing)} departments={departments.filter((item) => item.is_active)} hubs={hubs} users={users} saving={saving} error={error} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} onClose={() => setFormOpen(false)} onSubmit={() => void submit()} />}
      {departmentOpen && <DepartmentDialog rows={departments} saving={saving} error={error} onChanged={load} onClose={() => setDepartmentOpen(false)} onError={setError} onSaving={setSaving} />}
    </div>
  );
}

function StaffDialog({ form, departments, hubs, users, saving, error, onChange, onClose, onSubmit, editing }: { form: FormState; departments: StaffDepartment[]; hubs: Reference[]; users: Reference[]; saving: boolean; error: string; editing: boolean; onChange: (patch: Partial<FormState>) => void; onClose: () => void; onSubmit: () => void }) {
  const input = 'mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary';
  const money = (key: keyof FormState, value: string) => onChange({ [key]: formatAmountInput(value) });
  return createPortal(<div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center"><div className="absolute inset-0 bg-slate-900/50" onClick={() => !saving && onClose()} /><div className="relative z-10 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-lg border border-border bg-white shadow-2xl sm:rounded-lg"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-bold uppercase text-primary">Hồ sơ nhân sự</p><h2 className="text-lg font-black">{editing ? 'Sửa nhân sự' : 'Thêm nhân sự'}</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X size={18} /></button></div><div className="grid flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="Mã nhân sự *"><input value={form.employee_code} onChange={(event) => onChange({ employee_code: event.target.value.toUpperCase() })} className={input} /></Field><Field label="Họ và tên *" className="lg:col-span-2"><input value={form.full_name} onChange={(event) => onChange({ full_name: event.target.value })} className={input} /></Field><Field label="Bộ phận *"><select value={form.department_id} onChange={(event) => onChange({ department_id: event.target.value })} className={input}><option value="">Chọn bộ phận</option>{departments.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></Field><Field label="Chức danh *"><input value={form.position} onChange={(event) => onChange({ position: event.target.value })} placeholder="Nhân viên, tổ trưởng..." className={input} /></Field><Field label="Số điện thoại *"><input value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} className={input} /></Field><Field label="Email"><input type="email" value={form.email} onChange={(event) => onChange({ email: event.target.value })} className={input} /></Field><Field label="CCCD"><input value={form.identity_number} onChange={(event) => onChange({ identity_number: event.target.value })} className={input} /></Field><Field label="Ngày vào làm"><input type="date" value={form.hire_date} onChange={(event) => onChange({ hire_date: event.target.value })} className={input} /></Field><Field label="Bưu cục"><select value={form.hub_id} onChange={(event) => onChange({ hub_id: event.target.value })} className={input}><option value="">Không gán</option>{hubs.map((item) => <option key={item.id} value={String(item.id)}>{[item.code, item.name].filter(Boolean).join(' · ')}</option>)}</select></Field><Field label="Tài khoản đăng nhập (nếu có)"><select value={form.user_id} onChange={(event) => onChange({ user_id: event.target.value })} className={input}><option value="">Không dùng tài khoản</option>{users.map((item) => <option key={item.id} value={String(item.id)}>{item.full_name || item.username}</option>)}</select></Field><Field label="Trạng thái"><select value={form.employment_status} onChange={(event) => onChange({ employment_status: event.target.value })} className={input}><option value="ACTIVE">Đang làm</option><option value="INACTIVE">Đã nghỉ</option></select></Field><Field label="Địa chỉ" className="sm:col-span-2 lg:col-span-3"><input value={form.address} onChange={(event) => onChange({ address: event.target.value })} className={input} /></Field><div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3"><p className="text-sm font-black text-primary">Cấu phần lương</p></div><Field label="Lương cơ bản"><input inputMode="numeric" value={form.base_salary} onChange={(event) => money('base_salary', event.target.value)} className={`${input} text-right font-bold`} /></Field><Field label="Phụ cấp ăn"><input inputMode="numeric" value={form.meal_allowance} onChange={(event) => money('meal_allowance', event.target.value)} className={`${input} text-right font-bold`} /></Field><Field label="Phụ cấp đi lại"><input inputMode="numeric" value={form.transport_allowance} onChange={(event) => money('transport_allowance', event.target.value)} className={`${input} text-right font-bold`} /></Field><Field label="Phụ cấp khác"><input inputMode="numeric" value={form.other_allowance} onChange={(event) => money('other_allowance', event.target.value)} className={`${input} text-right font-bold`} /></Field><Field label="Đơn giá 1 giờ tăng ca"><input inputMode="numeric" value={form.overtime_hourly_rate} onChange={(event) => money('overtime_hourly_rate', event.target.value)} className={`${input} text-right font-bold`} /></Field><Field label="Ngày công chuẩn"><input type="number" min={1} step="0.5" value={form.standard_work_days} onChange={(event) => onChange({ standard_work_days: event.target.value })} className={input} /></Field><Field label="Ghi chú" className="sm:col-span-2 lg:col-span-3"><textarea value={form.note} onChange={(event) => onChange({ note: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded-lg border border-border p-3 text-sm" /></Field>{error && <p className="sm:col-span-2 lg:col-span-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-border px-4 text-sm font-bold">Hủy</button><button type="button" onClick={onSubmit} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 size={15} className="animate-spin" />}Lưu hồ sơ</button></div></div></div>, document.body);
}

function DepartmentDialog({ rows, saving, error, onChanged, onClose, onError, onSaving }: { rows: StaffDepartment[]; saving: boolean; error: string; onChanged: () => Promise<void>; onClose: () => void; onError: (value: string) => void; onSaving: (value: boolean) => void }) {
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const create = async () => { if (!code.trim() || !name.trim()) { onError('Nhập mã và tên bộ phận.'); return; } onSaving(true); onError(''); try { await apiRequest('/staff-members/departments', { method: 'POST', body: { code: code.trim(), name: name.trim() } }); setCode(''); setName(''); await onChanged(); } catch (requestError) { onError(message(requestError, 'Không tạo được bộ phận.')); } finally { onSaving(false); } };
  const toggle = async (row: StaffDepartment) => { onSaving(true); try { await apiRequest(`/staff-members/departments/${row.id}`, { method: 'PATCH', body: { is_active: !row.is_active } }); await onChanged(); } catch (requestError) { onError(message(requestError, 'Không cập nhật được bộ phận.')); } finally { onSaving(false); } };
  return createPortal(<div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center"><div className="absolute inset-0 bg-slate-900/50" onClick={onClose} /><div className="relative z-10 w-full max-w-xl overflow-hidden rounded-t-lg border border-border bg-white shadow-2xl sm:rounded-lg"><div className="flex items-center justify-between border-b border-border p-4"><div><p className="text-xs font-bold uppercase text-primary">Nhân sự</p><h2 className="text-lg font-black">Danh mục bộ phận</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg"><X size={18} /></button></div><div className="grid grid-cols-[130px_1fr_auto] gap-2 border-b border-border p-4"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Mã bộ phận" className="h-10 rounded-lg border border-border px-3 text-sm" /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên bộ phận" className="h-10 rounded-lg border border-border px-3 text-sm" /><button type="button" onClick={() => void create()} disabled={saving} title="Thêm bộ phận" className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white"><Plus size={16} /></button></div><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Tên bộ phận</th><th className="px-4 py-3 text-right">Trạng thái</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-3 font-bold">{row.code}</td><td className="px-4 py-3">{row.name}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void toggle(row)} className={`rounded-full border px-2 py-1 text-xs font-bold ${row.is_active ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>{row.is_active ? 'Đang dùng' : 'Ngừng dùng'}</button></td></tr>)}</tbody></table></div>{error && <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}</div></div>, document.body);
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`text-sm font-bold ${className || ''}`}>{label}{children}</label>; }
function State({ loading, text }: { loading?: boolean; text: string }) { return <div className="flex h-60 flex-col items-center justify-center text-sm text-muted-foreground">{loading ? <Loader2 size={22} className="animate-spin" /> : <Users size={24} />}<p className="mt-2">{text}</p></div>; }
