import { X } from 'lucide-react';
import type { HubSummary, UserFieldErrors, UserFormState } from '../types';
import { ROLE_BITS } from '../types';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';

type Props = {
  open: boolean;
  isEdit: boolean;
  form: UserFormState;
  errors: UserFieldErrors;
  submitting: boolean;
  canSetDirector: boolean;
  hubs?: HubSummary[];
  setField: <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function AddEditUserDialog({ open, isEdit, form, errors, submitting, canSetDirector, hubs, setField, onClose, onSubmit }: Props) {
  if (!open) return null;
  const roleMask = Number(form.role_mask) || 0;
  const selectedRoles = ROLE_BITS.filter(role => (roleMask & role.value) !== 0);
  const roleOptions = ROLE_BITS.filter(role => (roleMask & role.value) === 0 && (role.value !== 64 || canSetDirector)).map(role => ({ value: String(role.value), label: role.label }));
  const selectedHubIds = new Set(form.hub_ids);
  const selectedHubs = (hubs ?? []).filter((hub) => selectedHubIds.has(String(hub.id)));
  const hubOptions = (hubs ?? [])
    .filter((hub) => !selectedHubIds.has(String(hub.id)))
    .map(hub => ({ value: String(hub.id), label: [hub.code, hub.name].filter(Boolean).join(' - ') || String(hub.id) }));
  const addRole = (value: string) => { const bit = Number(value); if (bit) setField('role_mask', String(roleMask + bit)); };
  const removeRole = (bit: number) => { if (bit === 64 && !canSetDirector) return; setField('role_mask', String(roleMask - bit)); };
  const addHub = (value: string) => { if (value && !selectedHubIds.has(value)) setField('hub_ids', [...form.hub_ids, value]); };
  const removeHub = (value: string) => setField('hub_ids', form.hub_ids.filter((hubId) => hubId !== value));
  return <div className="fixed inset-0 z-[9999] flex justify-end"><button type="button" aria-label="Đóng" className="fixed inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose} /><div className="relative flex h-screen w-full max-w-[680px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl dialog-slide-in"><div className="flex items-center justify-between border-b border-border bg-white px-6 py-4"><h2 className="text-[16px] font-extrabold text-foreground">{isEdit ? 'Sửa nhân sự' : 'Thêm nhân sự'}</h2><button onClick={onClose} className="rounded-full p-2 hover:bg-muted"><X size={18} /></button></div><div className="flex-1 overflow-y-auto p-6 custom-scrollbar"><div className="grid gap-4"><Field label="Email đăng nhập" value={form.username} error={errors.username} onChange={v => setField('username', v)} /><Field label="Họ tên" value={form.name} error={errors.name} onChange={v => setField('name', v)} /><Field label="Điện thoại" value={form.phone} error={errors.phone} onChange={v => setField('phone', v)} /><Field
          label={isEdit ? 'Mật khẩu mới (tùy chọn)' : 'Mật khẩu'}
          type="password"
          value={form.password}
          error={errors.password}
          placeholder={isEdit ? 'Để trống nếu không đổi mật khẩu' : 'Tối thiểu 8 ký tự'}
          onChange={(v) => setField('password', v)}
        />{hubs && <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="grid gap-2 text-[13px] font-bold text-foreground"><span>Bưu cục được phân quyền</span><SearchableSelect value="" onValueChange={addHub} options={hubOptions} placeholder={hubs.length ? 'Thêm bưu cục' : 'Không tải được bưu cục'} searchPlaceholder="Tìm bưu cục..." emptyMessage="Đã chọn tất cả bưu cục khả dụng." className="h-11 bg-white font-bold text-foreground" disabled={!hubs.length || !hubOptions.length} />{errors.hub_ids && <span className="text-[12px] font-medium text-red-500">{errors.hub_ids}</span>}<div className="flex flex-wrap gap-1.5">{selectedHubs.length ? selectedHubs.map((hub, index) => <button key={hub.id} type="button" onClick={() => removeHub(String(hub.id))} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-extrabold text-blue-700 hover:bg-red-50 hover:text-red-500" title={index === 0 ? 'Bưu cục mặc định' : 'Gỡ bưu cục'}>{[hub.code, hub.name].filter(Boolean).join(' - ') || String(hub.id)}{index === 0 ? ' · mặc định' : ''}<X size={12} /></button>) : <span className="text-[12px] font-medium text-muted-foreground">Chưa chọn bưu cục.</span>}</div>{!hubs.length && <span className="text-[12px] font-medium text-muted-foreground">API /hubs/active hoặc /hubs chưa trả về danh sách bưu cục.</span>}</div></div>}<div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><div className="text-[13px] font-extrabold text-foreground">Chọn quyền</div><div className="text-[12px] font-medium text-muted-foreground">Role mask tự tính theo tổng bit RBAC.</div></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-extrabold text-primary">{roleMask}</span></div><SearchableSelect value="" options={roleOptions} onValueChange={addRole} placeholder="Chọn quyền" searchPlaceholder="Tìm quyền..." emptyMessage="Đã chọn tất cả quyền khả dụng." className="h-11 bg-white font-bold text-foreground" />{errors.role_mask && <div className="mt-2 text-[12px] font-medium text-red-500">{errors.role_mask}</div>}<div className="mt-3 flex flex-wrap gap-1.5">{selectedRoles.length ? selectedRoles.map(role => <button key={role.value} type="button" onClick={() => removeRole(role.value)} disabled={role.value === 64 && !canSetDirector} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700 hover:bg-red-50 hover:text-red-500 disabled:hover:bg-slate-100 disabled:hover:text-slate-700">{role.label}<X size={12} /></button>) : <span className="text-[12px] font-medium text-muted-foreground">Chưa chọn quyền.</span>}</div></div></div></div><div className="flex justify-end gap-3 border-t border-border bg-white px-6 py-4"><button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold hover:bg-muted">Hủy</button><button disabled={submitting} onClick={onSubmit} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">Lưu</button></div></div></div>;
}
function Field({
  label,
  value,
  error,
  type = 'text',
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[13px] font-bold text-foreground">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-border bg-white px-3 text-[13px] font-medium outline-none focus:border-primary placeholder:font-normal placeholder:text-muted-foreground"
      />
      {error && <span className="text-[12px] font-medium text-red-500">{error}</span>}
    </label>
  );
}
