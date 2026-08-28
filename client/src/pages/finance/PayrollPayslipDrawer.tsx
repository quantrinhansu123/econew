import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { BadgeDollarSign, BriefcaseBusiness, Building2, CalendarDays, Download, UserRound, X } from 'lucide-react';
import type { StaffRecord } from './staffTypes';
import { formatMoney } from '../../lib/formatMoney';

export interface PayrollRow extends StaffRecord {
  month: string;
  work_days: number;
  overtime_hours: number;
  base_by_attendance: number;
  allowance_by_attendance: number;
  overtime_pay: number;
  reward_amount: number;
  advance_amount: number;
  carry_in: number;
  gross_salary: number;
  net_salary: number;
  carry_out: number;
  payroll_note?: string | null;
}

interface Props {
  row: PayrollRow;
  onClose: () => void;
  onDownload: (row: PayrollRow) => void;
}

const formatMonth = (month: string) => {
  const [year, value] = month.split('-');
  return `Tháng ${Number(value)}/${year}`;
};

export default function PayrollPayslipDrawer({ row, onClose, onDownload }: Props) {
  const department = row.department_record?.name || row.department || '—';
  const hub = row.hub?.code || row.hub?.name || '—';
  const standardDays = Number(row.standard_work_days || 26);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />
      <aside className="dialog-slide-in relative flex h-screen w-full max-w-[680px] flex-col border-l border-border bg-slate-50 shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Phiếu lương nhân sự</p>
            <h2 className="text-lg font-black text-foreground">{formatMonth(row.month)}</h2>
          </div>
          <button type="button" aria-label="Đóng phiếu lương" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X size={19} /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary"><UserRound size={22} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-black text-foreground">{row.full_name}</h3>
                <p className="mt-1 text-sm font-bold text-primary">{row.employee_code}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Info icon={<BriefcaseBusiness size={15} />} label="Bộ phận" value={department} />
              <Info icon={<Building2 size={15} />} label="Bưu cục" value={hub} />
              <Info icon={<CalendarDays size={15} />} label="Kỳ lương" value={formatMonth(row.month)} />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-muted/5 px-5 py-3 text-[12px] font-bold uppercase tracking-wider text-primary">Chi tiết thu nhập</div>
            <div className="divide-y divide-border px-5">
              <MoneyLine label={`Lương theo công (${Number(row.work_days).toLocaleString('vi-VN')}/${standardDays.toLocaleString('vi-VN')} ngày)`} value={row.base_by_attendance} hint={`Lương cơ bản ${formatMoney(row.base_salary)}`} />
              <MoneyLine label="Phụ cấp theo công" value={row.allowance_by_attendance} />
              <MoneyLine label={`Tiền tăng ca (${Number(row.overtime_hours).toLocaleString('vi-VN')} giờ)`} value={row.overtime_pay} />
              <MoneyLine label="Thưởng" value={row.reward_amount} />
              <MoneyLine label="Tổng thu nhập" value={row.gross_salary} strong />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-muted/5 px-5 py-3 text-[12px] font-bold uppercase tracking-wider text-primary">Khấu trừ và thực lĩnh</div>
            <div className="divide-y divide-border px-5">
              <MoneyLine label="Dư âm tháng trước" value={row.carry_in} danger={row.carry_in < 0} />
              <MoneyLine label="Đã tạm ứng" value={-Number(row.advance_amount || 0)} danger={Number(row.advance_amount || 0) > 0} />
              <div className="flex items-center justify-between gap-4 py-5">
                <div className="flex items-center gap-2 font-black text-foreground"><BadgeDollarSign size={20} className="text-emerald-600" />Thực lĩnh</div>
                <span className={`text-xl font-black tabular-nums ${row.net_salary < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.net_salary)}</span>
              </div>
            </div>
          </section>

          {row.payroll_note && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Ghi chú</p><p className="mt-1 whitespace-pre-wrap text-sm font-medium text-amber-900">{row.payroll_note}</p></section>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white p-5">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border px-5 text-sm font-bold text-muted-foreground hover:bg-muted">Đóng</button>
          <button type="button" onClick={() => onDownload(row)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700"><Download size={16} />Tải phiếu Excel</button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/5 p-3"><p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">{icon}{label}</p><p className="mt-1 truncate text-[13px] font-bold text-foreground">{value}</p></div>;
}

function MoneyLine({ label, value, hint, strong, danger }: { label: string; value: string | number; hint?: string; strong?: boolean; danger?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-3.5"><div><p className={strong ? 'font-black text-foreground' : 'text-sm font-semibold text-foreground'}>{label}</p>{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div><span className={`shrink-0 tabular-nums ${strong ? 'text-base font-black text-primary' : danger ? 'font-bold text-red-600' : 'font-bold text-foreground'}`}>{formatMoney(value)}</span></div>;
}
