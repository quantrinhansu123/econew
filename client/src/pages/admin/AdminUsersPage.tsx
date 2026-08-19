import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Edit, Eye, Filter, Home, KeyRound, Loader2, Plus, Power, Search, Trash2, UserCog, X } from 'lucide-react';
import { clsx } from 'clsx';
import { apiRequest, ApiError } from '../../lib/api';
import { normalizeUserList } from '../../lib/userNormalize';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import type { AuthUserProfile } from '../login/types';
import { HubBadgeList, RoleBadgeList, StatusBadge } from './users/UserDisplay';
import type { HubListResponse, HubSummary, UserAccount, UserFieldErrors, UserFilters, UserFormState } from './users/types';
import { ROLE_BITS } from './users/types';
import AddEditUserDialog from './users/dialogs/AddEditUserDialog';
import AssignUserHubDialog from './users/dialogs/AssignUserHubDialog';
import AssignUserRoleDialog from './users/dialogs/AssignUserRoleDialog';
import UserDetailDialog from './users/dialogs/UserDetailDialog';
import UserStatusConfirmDialog from './users/dialogs/UserStatusConfirmDialog';

const USER_PROFILE_KEY = 'eco_user_profile';
const emptyForm: UserFormState = { username: '', name: '', phone: '', role_mask: '1', password: '', hub_ids: [] };
const getUserHubIds = (user: UserAccount) => {
  const ids = user.hub_ids?.length
    ? user.hub_ids
    : [...(user.hub ? [user.hub] : []), ...(user.hubs ?? [])].map((hub) => hub.id);
  return [...new Set(ids.map(String).filter(Boolean))];
};
const validRoleMask = ROLE_BITS.reduce((sum, role) => sum + role.value, 0);

const getStoredUser = (): AuthUserProfile | null => { const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY); if (!raw) return null; try { return JSON.parse(raw) as AuthUserProfile; } catch { return null; } };
const hasManagerRole = (roleMask = 0) => (roleMask & (32 | 64)) !== 0;
const isDirector = (roleMask = 0) => (roleMask & 64) !== 0;
const getHubList = (payload: HubListResponse | HubSummary[]) => Array.isArray(payload) ? payload : payload.data || payload.items || payload.hubs || [];
const combineRoleMask = (values: string[]) => values.reduce((sum, value) => sum | Number(value), 0);

export default function AdminUsersPage() {
  const currentUser = useMemo(getStoredUser, []);
  const canManage = hasManagerRole(currentUser?.role_mask);
  const canDelete = isDirector(currentUser?.role_mask);
  const [filters, setFilters] = useState<UserFilters>({ keyword: '', role_mask: [], status: [], hub_id: [], page: 1, limit: 10 });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailUser, setDetailUser] = useState<UserAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  const [roleUser, setRoleUser] = useState<UserAccount | null>(null);
  const [roleValue, setRoleValue] = useState(1);
  const [hubUser, setHubUser] = useState<UserAccount | null>(null);
  const [hubValue, setHubValue] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [statusDialog, setStatusDialog] = useState<ConfirmDialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = filters.role_mask.length + filters.status.length + filters.hub_id.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const loadUsers = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
      if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
      if (filters.role_mask.length) params.set('role_mask', String(combineRoleMask(filters.role_mask)));
      const payload = await apiRequest<unknown>(`/users?${params.toString()}`);
      const { users: rows, total: apiTotal } = normalizeUserList(payload);
      let filtered = rows;
      if (filters.status.length) filtered = filtered.filter(user => user.status !== undefined && filters.status.includes(String(user.status)));
      if (filters.hub_id.length) filtered = filtered.filter(user => [...(user.hubs || []), ...(user.hub ? [user.hub] : [])].some(hub => filters.hub_id.includes(String(hub.id))));
      setUsers(filtered); setTotal(filters.status.length || filters.hub_id.length ? filtered.length : apiTotal);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Không tải được danh sách nhân sự.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadUsers(); }, [filters.page, filters.limit, filters.keyword, filters.role_mask.join(','), filters.status.join(','), filters.hub_id.join(',')]);
  useEffect(() => { let mounted = true; const loadHubs = async () => { try { const activePayload = await apiRequest<HubListResponse | HubSummary[]>('/hubs/active'); if (mounted) setHubs(getHubList(activePayload)); } catch { try { const allPayload = await apiRequest<HubListResponse | HubSummary[]>('/hubs?limit=100'); if (mounted) setHubs(getHubList(allPayload)); } catch { if (mounted) setHubs([]); } } }; void loadHubs(); return () => { mounted = false; }; }, []);

  const updateFilter = <K extends keyof UserFilters>(key: K, value: UserFilters[K]) => setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  const clearFilters = () => setFilters(prev => ({ ...prev, role_mask: [], status: [], hub_id: [], page: 1 }));
  const setFormField = <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const validate = () => { const errors: UserFieldErrors = {}; const mask = Number(form.role_mask); const email = form.username.trim(); if (!email) errors.username = 'Email bắt buộc.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.username = 'Email không hợp lệ.'; if (!form.name.trim()) errors.name = 'Họ tên bắt buộc.'; if (form.phone && !/^[0-9+\-\s().]{8,20}$/.test(form.phone)) errors.phone = 'Số điện thoại không hợp lệ.'; if (!isEdit && (!form.password || form.password.length < 8)) errors.password = 'Mật khẩu tối thiểu 8 ký tự.'; else if (isEdit && form.password && form.password.length < 8) errors.password = 'Mật khẩu tối thiểu 8 ký tự.'; if (!Number.isInteger(mask) || mask < 1 || (mask | validRoleMask) !== validRoleMask) errors.role_mask = 'Role mask không hợp lệ.'; if (!canDelete && editingUser && ((editingUser.role_mask & 64) !== (mask & 64))) errors.role_mask = 'MANAGER không được cấp/gỡ DIRECTOR.'; setFieldErrors(errors); return !Object.keys(errors).length; };
  const openCreate = () => { setIsEdit(false); setEditingUser(null); setForm(emptyForm); setFieldErrors({}); setFormOpen(true); };
  const openEdit = (user: UserAccount) => { setIsEdit(true); setEditingUser(user); setForm({ username: user.username || '', name: user.name || '', phone: user.phone || '', role_mask: String(user.role_mask || 1), password: '', hub_ids: getUserHubIds(user) }); setFieldErrors({}); setFormOpen(true); };
  const submitForm = async () => { if (!validate()) return; setSubmitting(true); try { if (isEdit && editingUser) { await apiRequest(`/users/${editingUser.id}`, { method: 'PATCH', body: { email: form.username.trim(), full_name: form.name.trim(), phone: form.phone.trim() || undefined, ...(form.password.trim() ? { password: form.password } : {}) } }); if (Number(form.role_mask) !== editingUser.role_mask) await apiRequest(`/users/${editingUser.id}/role`, { method: 'PATCH', body: { role_mask: Number(form.role_mask) } }); if ([...form.hub_ids].sort().join(',') !== [...getUserHubIds(editingUser)].sort().join(',')) await apiRequest(`/users/${editingUser.id}/hub`, { method: 'PATCH', body: { hub_ids: form.hub_ids } }); } else await apiRequest('/users', { method: 'POST', body: { email: form.username.trim(), full_name: form.name.trim(), phone: form.phone.trim() || undefined, password: form.password, role_mask: Number(form.role_mask), hub_ids: form.hub_ids } }); setFormOpen(false); await loadUsers(); } finally { setSubmitting(false); } };
  const submitRole = async () => { if (!roleUser) return; setSubmitting(true); try { await apiRequest(`/users/${roleUser.id}/role`, { method: 'PATCH', body: { role_mask: roleValue } }); setRoleUser(null); await loadUsers(); } finally { setSubmitting(false); } };
  const submitHub = async () => { if (!hubUser) return; setSubmitting(true); try { await apiRequest(`/users/${hubUser.id}/hub`, { method: 'PATCH', body: { hub_ids: hubValue } }); setHubUser(null); await loadUsers(); } finally { setSubmitting(false); } };
  const openRole = (user: UserAccount) => { setRoleUser(user); setRoleValue(user.role_mask); };
  const openHub = (user: UserAccount) => { setHubUser(user); setHubValue(getUserHubIds(user)); };
  const isSelf = (user: UserAccount) => String(currentUser?.id) === String(user.id);
  const confirmStatus = (user: UserAccount) => setStatusDialog({ title: 'Xác nhận đổi trạng thái', message: `Bạn muốn bật/tắt tài khoản ${user.username}?`, confirmLabel: 'Xác nhận', onConfirm: async () => { await apiRequest(`/users/${user.id}/status`, { method: 'PATCH' }); await loadUsers(); } });
  const confirmDelete = (user: UserAccount) => setConfirmDialog({ title: 'Xóa nhân sự', message: `Chỉ DIRECTOR được xóa nhân sự. Xác nhận xóa ${user.username}?`, confirmLabel: 'Xóa', danger: true, onConfirm: async () => { await apiRequest(`/users/${user.id}`, { method: 'DELETE' }); await loadUsers(); } });

  const roleOptions = ROLE_BITS.map(role => ({ value: String(role.value), label: role.label }));
  const statusOptions = useMemo(() => Array.from(new Set(users.map(user => user.status).filter(value => value !== undefined && value !== null).map(String))).map(value => ({ value, label: value })), [users]);
  const hubOptions = hubs.map(hub => ({ value: String(hub.id), label: `${hub.code || hub.name || hub.id}` }));
  const groups = [{ id: 'role', title: 'Quyền role_mask', options: roleOptions, value: filters.role_mask, onChange: (v: string[]) => updateFilter('role_mask', v), searchPlaceholder: 'Tìm quyền' }, ...(statusOptions.length ? [{ id: 'status', title: 'Trạng thái tài khoản', options: statusOptions, value: filters.status, onChange: (v: string[]) => updateFilter('status', v), searchPlaceholder: 'Tìm trạng thái' }] : []), ...(hubOptions.length ? [{ id: 'hub', title: 'Bưu cục', options: hubOptions, value: filters.hub_id, onChange: (v: string[]) => updateFilter('hub_id', v), searchPlaceholder: 'Tìm bưu cục' }] : [])];

  if (!canManage) return <div className="h-full min-h-0 flex flex-col gap-2"><div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col"><StateBlock icon={<AlertTriangle size={24} />} title="Không có quyền truy cập" description="Trang quản trị nhân sự chỉ dành cho MANAGER hoặc DIRECTOR." /></div></div>;

  return <div className="h-full min-h-0 flex flex-col gap-2"><div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col"><div className="p-3 border-b border-border shrink-0 space-y-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => history.back()} className="h-10 rounded-xl border border-border px-3 text-[13px] font-bold hover:bg-muted"><ArrowLeft size={16} /></button><div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={filters.keyword} onChange={e => updateFilter('keyword', e.target.value)} placeholder="Tìm username, tên, số điện thoại..." className="h-10 w-full rounded-xl border border-border pl-9 pr-3 text-[13px] font-medium outline-none focus:border-primary" /></div><button onClick={() => setFilterOpen(true)} className="md:hidden h-10 w-10 rounded-xl border border-border flex items-center justify-center"><Filter size={16} /></button>{activeFilterCount > 0 && <button onClick={clearFilters} className="order-last basis-full md:order-none md:basis-auto h-10 rounded-xl border border-red-200 px-3 text-[13px] font-bold text-red-500 hover:bg-red-50"><X size={14} className="inline" /> Xóa {activeFilterCount} bộ lọc</button>}<div className="flex-1 hidden md:block" />{canManage && <button onClick={openCreate} className="h-10 rounded-xl bg-primary px-3 text-[13px] font-extrabold text-white hover:bg-primary/90"><Plus size={16} className="inline" /> Thêm</button>}</div><div className="hidden md:flex flex-wrap items-center gap-2"><FilterSelect multiple placeholder="Quyền" icon={KeyRound} value={filters.role_mask} options={roleOptions} onValueChange={(v: string[]) => updateFilter('role_mask', v)} />{statusOptions.length > 0 && <FilterSelect multiple placeholder="Trạng thái" icon={Power} value={filters.status} options={statusOptions} onValueChange={(v: string[]) => updateFilter('status', v)} />}{hubOptions.length > 0 && <FilterSelect multiple placeholder="Bưu cục" icon={Home} value={filters.hub_id} options={hubOptions} onValueChange={(v: string[]) => updateFilter('hub_id', v)} />}</div></div><div className="flex-1 min-h-0 overflow-auto custom-scrollbar">{loading ? <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải danh sách nhân sự" description="Hệ thống đang gọi API /users." /> : error ? <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được dữ liệu" description={error} /> : !users.length ? <StateBlock icon={<UserCog size={24} />} title="Chưa có nhân sự phù hợp" description="Thử đổi từ khóa hoặc bộ lọc hiện tại." /> : <><table className="hidden md:table w-full min-w-[1280px] text-left border-collapse"><thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wider text-muted-foreground"><tr>{['ID','Username','Họ tên','Điện thoại','Quyền','Trạng thái','Bưu cục','Thao tác'].map(h => <th key={h} className="border-b border-border px-4 py-3 font-extrabold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border text-[13px]">{users.map(user => <tr key={user.id} className="hover:bg-muted/20"><td className="px-4 py-3 font-bold">{user.id}</td><td className="px-4 py-3 font-bold text-foreground">{user.username}</td><td className="px-4 py-3">{user.name}</td><td className="px-4 py-3">{user.phone || '—'}</td><td className="px-4 py-3"><RoleBadgeList roleMask={user.role_mask} /></td><td className="px-4 py-3">{user.status !== undefined && user.status !== null ? <StatusBadge status={user.status} /> : '—'}</td><td className="px-4 py-3"><HubBadgeList user={user} /></td><td className="px-4 py-3"><Actions user={user} canManage={canManage} canDelete={canDelete && !isSelf(user)} self={isSelf(user)} onDetail={setDetailUser} onEdit={openEdit} onRole={openRole} onHub={openHub} onStatus={confirmStatus} onDelete={confirmDelete} /></td></tr>)}</tbody></table><div className="grid gap-3 p-3 md:hidden">{users.map(user => <MobileCard key={user.id} user={user} canManage={canManage} canDelete={canDelete && !isSelf(user)} self={isSelf(user)} onDetail={setDetailUser} onEdit={openEdit} onRole={openRole} onHub={openHub} onStatus={confirmStatus} onDelete={confirmDelete} />)}</div></>}</div><div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0"><span><b className="text-foreground font-medium">{(filters.page - 1) * filters.limit + (users.length ? 1 : 0)}-{(filters.page - 1) * filters.limit + users.length}</b>/Tổng:{total}</span><div className="flex items-center gap-2"><select value={filters.limit} onChange={e => updateFilter('limit', Number(e.target.value))} className="h-8 rounded border border-border bg-card px-2 text-[12px] focus:outline-none">{[10,20,50].map(limit => <option key={limit} value={limit}>{limit}</option>)}</select><span>/ trang</span><button disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronLeft size={15} /></button><button disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)} className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"><ChevronRight size={15} /></button><span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">{filters.page}</span><span>/</span><span className="text-foreground">{totalPages}</span></div></div></div><UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} /><AddEditUserDialog open={formOpen} isEdit={isEdit} form={form} errors={fieldErrors} submitting={submitting} canSetDirector={canDelete} hubs={hubs} setField={setFormField} onClose={() => setFormOpen(false)} onSubmit={submitForm} /><AssignUserRoleDialog open={!!roleUser} value={roleValue} canSetDirector={canDelete} submitting={submitting} onChange={setRoleValue} onClose={() => setRoleUser(null)} onSubmit={submitRole} /><AssignUserHubDialog open={!!hubUser} hubs={hubs} value={hubValue} submitting={submitting} onChange={setHubValue} onClose={() => setHubUser(null)} onSubmit={submitHub} /><UserStatusConfirmDialog dialog={statusDialog} onClose={() => setStatusDialog(null)} /><ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} /><FilterPanel open={filterOpen} activeCount={activeFilterCount} groups={groups} onClose={() => setFilterOpen(false)} onApply={() => setFilterOpen(false)} onClear={clearFilters} /></div>;
}

function Actions({ user, canManage, canDelete, self, onDetail, onEdit, onRole, onHub, onStatus, onDelete }: { user: UserAccount; canManage: boolean; canDelete: boolean; self: boolean; onDetail: (u: UserAccount) => void; onEdit: (u: UserAccount) => void; onRole: (u: UserAccount) => void; onHub: (u: UserAccount) => void; onStatus: (u: UserAccount) => void; onDelete: (u: UserAccount) => void }) { return <div className="flex flex-wrap gap-1.5"><IconButton icon={<Eye size={14} />} label="Xem" onClick={() => onDetail(user)} />{canManage && <IconButton icon={<Edit size={14} />} label="Sửa" onClick={() => onEdit(user)} />}{canManage && <IconButton icon={<KeyRound size={14} />} label="Quyền" onClick={() => onRole(user)} />}{canManage && <IconButton icon={<Home size={14} />} label="Bưu cục" onClick={() => onHub(user)} />}{canManage && !self && <IconButton icon={<Power size={14} />} label="Bật/tắt" onClick={() => onStatus(user)} />}{canDelete && <IconButton danger icon={<Trash2 size={14} />} label="Xóa" onClick={() => onDelete(user)} />}</div>; }
function IconButton({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) { return <button onClick={onClick} className={clsx('inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-bold hover:bg-muted', danger ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-border text-primary')}>{icon}{label}</button>; }
function MobileCard(props: Parameters<typeof Actions>[0]) { const { user } = props; return <div className="rounded-2xl border border-border bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold text-muted-foreground">#{user.id}</div><div className="text-[15px] font-extrabold text-foreground">{user.name}</div><div className="text-[13px] font-medium text-muted-foreground">{user.username} · {user.phone || '—'}</div></div>{user.status !== undefined && user.status !== null && <StatusBadge status={user.status} />}</div><div className="mt-3 grid gap-2"><RoleBadgeList roleMask={user.role_mask} /><HubBadgeList user={user} /></div><div className="mt-3 border-t border-border pt-3"><Actions {...props} /></div></div>; }
function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center text-muted-foreground"><div className="mb-3 text-primary">{icon}</div><h3 className="text-[14px] font-bold text-foreground">{title}</h3><p className="mt-1 text-[13px] max-w-md">{description}</p></div>; }


