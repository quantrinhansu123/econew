import { AlertTriangle, BadgeDollarSign, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/formatMoney';
import type { StaffRecord } from './staffTypes';

interface PayrollRow extends StaffRecord {
  month: string;
  work_days: number;
  overtime_hours: number;
  base_by_attendance: number;
  allowance_total: number;
  overtime_pay: number;
  gross_salary: number;
}

const currentMonth = new Date().toISOString().slice(0, 7);

export default function FinancePayrollPage() {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRows(await apiRequest<PayrollRow[]>(`/staff-members/payroll/monthly?month=${month}`)); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Không tải được bảng lương.'); } finally { setLoading(false); } }, [month]);
  useEffect(() => { void load(); }, [load]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.gross_salary || 0), 0), [rows]);
  return <div className="flex h-full min-h-0 flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black">Bảng lương theo ngày công</h1><p className="text-sm text-muted-foreground">Lương cơ bản theo ngày công + phụ cấp + tiền tăng ca.</p></div><label className="text-sm font-bold">Tháng <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 h-10 rounded-lg border border-border px-3" /></label></div>{!loading && !error && <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"><BadgeDollarSign className="text-emerald-600" size={20} /><span className="text-sm font-bold text-emerald-800">Tổng lương tạm tính: {formatMoney(total)}</span></div>}{error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle size={15} className="mr-2 inline" />{error}</p>}<div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">{loading ? <div className="flex h-60 items-center justify-center text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Đang tính lương...</div> : !rows.length ? <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Chưa có nhân sự để tính lương.</div> : <table className="w-full min-w-[1250px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground"><tr>{['Nhân sự', 'Bộ phận', 'Lương cơ bản', 'Ngày công', 'Lương theo công', 'Phụ cấp', 'Tăng ca', 'Tiền tăng ca', 'Tổng lương'].map((label, index) => <th key={label} className={`border-b border-border px-3 py-3 ${index > 1 ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border"><td className="px-3 py-3"><p className="font-extrabold">{row.full_name}</p><p className="text-xs font-bold text-primary">{row.employee_code}</p></td><td className="px-3 py-3">{row.department_record?.name || row.department || '—'}</td><td className="px-3 py-3 text-right">{formatMoney(row.base_salary)}</td><td className="px-3 py-3 text-right font-bold">{Number(row.work_days).toLocaleString('vi-VN')} / {Number(row.standard_work_days || 26).toLocaleString('vi-VN')}</td><td className="px-3 py-3 text-right">{formatMoney(row.base_by_attendance)}</td><td className="px-3 py-3 text-right">{formatMoney(row.allowance_total)}</td><td className="px-3 py-3 text-right">{Number(row.overtime_hours).toLocaleString('vi-VN')} giờ</td><td className="px-3 py-3 text-right">{formatMoney(row.overtime_pay)}</td><td className="px-3 py-3 text-right text-base font-black text-emerald-700">{formatMoney(row.gross_salary)}</td></tr>)}</tbody></table>}</div></div>;
}
