import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/formatMoney';

type Staff = { id: string | number; username?: string; full_name?: string; name?: string; phone?: string; role_mask?: number; monthly_salary?: number | string; is_active?: boolean; hub?: { code?: string; name?: string } | null; hubs?: Array<{ code?: string; name?: string }> };
type UserResponse = Staff[] | { items?: Staff[]; data?: Staff[]; users?: Staff[] };
const roleLabels: Record<number, string> = { 1: 'Kho', 2: 'Đóng gói', 4: 'Tài xế', 8: 'Điều phối', 16: 'Kế toán', 32: 'Quản lý', 64: 'Giám đốc' };

const rowsFrom = (response: UserResponse) => Array.isArray(response) ? response : response.items || response.data || response.users || [];
const roles = (mask = 0) => Object.entries(roleLabels).filter(([bit]) => (mask & Number(bit)) !== 0).map(([, label]) => label).join(', ') || '—';

export default function FinanceStaffPage() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void apiRequest<UserResponse>('/users?limit=100&is_active=true').then(response => setRows(rowsFrom(response))).catch(err => setError(err instanceof ApiError ? err.message : 'Không tải được danh sách nhân sự.')).finally(() => setLoading(false)); }, []);
  const filtered = rows.filter(row => [row.full_name, row.name, row.username, row.phone].some(value => value?.toLowerCase().includes(keyword.toLowerCase())));
  return <div className="h-full min-h-0 flex flex-col gap-4"><div><h1 className="text-xl font-black text-foreground">Tổng danh sách nhân sự nội bộ</h1><p className="text-sm text-muted-foreground">Danh sách chỉ đọc dành cho bộ phận kế toán.</p></div><div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3"><Search size={16} className="text-muted-foreground" /><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm tên, email, số điện thoại..." className="h-10 flex-1 text-sm outline-none" /></div><div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white shadow-sm">{loading ? <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={18} />Đang tải...</div> : error ? <div className="p-6 text-sm font-bold text-red-600"><AlertTriangle className="mr-2 inline" size={16} />{error}</div> : !filtered.length ? <div className="flex h-60 flex-col items-center justify-center text-muted-foreground"><Users size={24} /><p className="mt-2 text-sm">Chưa có nhân sự phù hợp.</p></div> : <table className="w-full min-w-[820px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground"><tr>{['Nhân sự', 'Điện thoại', 'Vai trò', 'Bưu cục', 'Lương cơ bản', 'Trạng thái'].map(label => <th key={label} className="border-b border-border px-4 py-3">{label}</th>)}</tr></thead><tbody>{filtered.map(row => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3"><div className="font-bold">{row.full_name || row.name || '—'}</div><div className="text-xs text-muted-foreground">{row.username || '—'}</div></td><td className="px-4 py-3">{row.phone || '—'}</td><td className="px-4 py-3">{roles(row.role_mask)}</td><td className="px-4 py-3">{[...(row.hub ? [row.hub] : []), ...(row.hubs || [])].map(hub => hub.code || hub.name).filter(Boolean).join(', ') || '—'}</td><td className="px-4 py-3 font-bold">{formatMoney(row.monthly_salary)}</td><td className="px-4 py-3">{row.is_active === false ? 'Tạm khóa' : 'Đang hoạt động'}</td></tr>)}</tbody></table>}</div></div>;
}
