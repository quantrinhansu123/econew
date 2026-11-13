import {
  AlertTriangle,
  BadgeDollarSign,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DraggableScrollTableContainer from "../../components/ui/DraggableScrollTableContainer";
import CashFundSelect from "../../components/finance/CashFundSelect";
import { ApiError, apiRequest } from "../../lib/api";
import { SALARY_ADVANCES_CHANGED_EVENT, SALARY_ADVANCES_CHANGED_STORAGE_KEY } from "../../lib/salaryAdvanceSync";
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from "../../lib/formatMoney";
import PayrollPayslipDrawer, { type PayrollRow } from "./PayrollPayslipDrawer";

const currentMonth = new Date().toISOString().slice(0, 7);

export interface PayrollRowDraft {
  baseSalary: string;
  standardDays: string;
  probationDays: string;
  probationRate: string;
  officialDays: string;
  allowanceTotal: string;
  overtimeHours: string;
  overtimePay: string;
  reward: string;
  insurance: string;
  advance: string;
  advanceChanged?: boolean;
  note: string;
  dirty?: boolean;
}

function buildRowDraft(row: PayrollRow): PayrollRowDraft {
  const probationDays = Number(row.probation_days || 0);
  const officialDays =
    row.official_days !== undefined
      ? Number(row.official_days)
      : Math.max(0, Number(row.work_days || 0) - probationDays);
  const allowanceTotal =
    row.allowance_total !== undefined
      ? Number(row.allowance_total)
      : Number(row.meal_allowance || 0) +
        Number(row.transport_allowance || 0) +
        Number(row.other_allowance || 0);

  return {
    baseSalary: formatAmountInputFromNumber(Number(row.base_salary || 0)),
    standardDays: String(Number(row.standard_work_days || 26)),
    probationDays: String(probationDays),
    probationRate: String(Number(row.probation_rate ?? 80)),
    officialDays: String(officialDays),
    allowanceTotal: formatAmountInputFromNumber(allowanceTotal),
    overtimeHours: String(Number(row.overtime_hours || 0)),
    overtimePay: formatAmountInputFromNumber(Number(row.overtime_pay || 0)),
    reward: formatAmountInputFromNumber(Number(row.reward_amount || 0)),
    insurance: formatAmountInputFromNumber(
      Number(row.insurance_deduction || 0),
    ),
    advance: formatAmountInputFromNumber(Number(row.advance_amount || 0)),
    note: row.payroll_note || "",
    dirty: false,
  };
}

function computeLiveRow(row: PayrollRow, draft?: PayrollRowDraft) {
  if (!draft) {
    return {
      baseSalary: Number(row.base_salary || 0),
      standardDays: Math.max(1, Number(row.standard_work_days || 26)),
      probationDays: Number(row.probation_days || 0),
      probationRate: Number(row.probation_rate ?? 80),
      probationSalary: Number(row.probation_salary || 0),
      officialDays: Number(row.official_days ?? row.work_days ?? 0),
      officialSalary: Number(row.official_salary ?? row.base_by_attendance ?? 0),
      workDays: Number(row.work_days || 0),
      baseByAttendance: Number(row.base_by_attendance || 0),
      allowanceTotal: Number(row.allowance_total || 0),
      allowanceByAttendance: Number(row.allowance_by_attendance || 0),
      overtimeHours: Number(row.overtime_hours || 0),
      overtimePay: Number(row.overtime_pay || 0),
      rewardAmount: Number(row.reward_amount || 0),
      grossSalary: Number(row.gross_salary || 0),
      insuranceDeduction: Number(row.insurance_deduction || 0),
      advanceAmount: Number(row.advance_amount || 0),
      carryIn: Number(row.carry_in || 0),
      netSalary: Number(row.net_salary || 0),
    };
  }

  const baseSalary = parseAmountInput(draft.baseSalary);
  const standardDays = Math.max(1, Number(draft.standardDays || 26));
  const probationDays = Math.max(0, Number(draft.probationDays || 0));
  const probationRate = Math.max(0, Number(draft.probationRate || 80));
  const officialDays = Math.max(0, Number(draft.officialDays || 0));
  const workDays = probationDays + officialDays;

  const probationSalary = Math.round(
    (baseSalary / standardDays) * probationDays * (probationRate / 100),
  );
  const officialSalary = Math.round((baseSalary / standardDays) * officialDays);
  const tiers = Array.isArray(row.salary_tiers) ? row.salary_tiers : [];
  const baseByAttendance =
    tiers.length > 0 && !draft.dirty
      ? Number(row.base_by_attendance || 0)
      : probationSalary + officialSalary;

  const allowanceTotal = parseAmountInput(draft.allowanceTotal);
  const allowanceByAttendance = Math.round(
    (allowanceTotal / standardDays) * workDays,
  );
  const overtimeHours = Math.max(0, Number(draft.overtimeHours || 0));
  const overtimePay = parseAmountInput(draft.overtimePay);
  const rewardAmount = parseAmountInput(draft.reward);
  const grossSalary = Math.round(
    baseByAttendance + allowanceByAttendance + overtimePay + rewardAmount,
  );
  const insuranceDeduction = parseAmountInput(draft.insurance);
  const advanceAmount = Number(row.advances_from_vouchers || 0) > 0
    ? Number(row.advances_from_vouchers)
    : parseAmountInput(draft.advance);
  const carryIn = Number(row.carry_in || 0);
  const netSalary = Math.round(
    grossSalary + carryIn - insuranceDeduction - advanceAmount,
  );

  return {
    baseSalary,
    standardDays,
    probationDays,
    probationRate,
    probationSalary,
    officialDays,
    officialSalary,
    workDays,
    baseByAttendance,
    allowanceTotal,
    allowanceByAttendance,
    overtimeHours,
    overtimePay,
    rewardAmount,
    grossSalary,
    insuranceDeduction,
    advanceAmount,
    carryIn,
    netSalary,
  };
}

export default function FinancePayrollPage() {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<PayrollRow | null>(null);
  const [payingRow, setPayingRow] = useState<PayrollRow | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PayrollRowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (silent = false) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const requestId = ++loadRequestRef.current;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await apiRequest<PayrollRow[]>(
        `/staff-members/payroll/monthly?month=${month}`,
        { signal: controller.signal },
      );
      if (requestId !== loadRequestRef.current) return;
      setRows(data);
      setDrafts((current) => Object.fromEntries(data.map((row) => {
        const draft = current[String(row.id)];
        const fresh = buildRowDraft(row);
        if (!silent || !draft?.dirty) return [String(row.id), fresh];
        return [String(row.id), {
          ...draft,
          advance: Number(row.advances_from_vouchers || 0) > 0 || !draft.advanceChanged ? fresh.advance : draft.advance,
          advanceChanged: Number(row.advances_from_vouchers || 0) > 0 ? false : draft.advanceChanged,
        }];
      })));
      setSelectedRow((prev) =>
        prev
          ? data.find((item) => String(item.id) === String(prev.id)) || null
          : null,
      );
    } catch (failure) {
      if (!silent && !controller.signal.aborted && requestId === loadRequestRef.current) setError(
        failure instanceof ApiError
          ? failure.message
          : "Không tải được bảng lương.",
      );
    } finally {
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    return () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void load(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SALARY_ADVANCES_CHANGED_STORAGE_KEY) refresh();
    };
    window.addEventListener(SALARY_ADVANCES_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener(SALARY_ADVANCES_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const dirtyRows = useMemo(
    () => rows.filter((row) => drafts[String(row.id)]?.dirty),
    [rows, drafts],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (current, row) => {
          const live = computeLiveRow(row, drafts[String(row.id)]);
          return {
            grossSalary: current.grossSalary + live.grossSalary,
            insuranceAmount: current.insuranceAmount + live.insuranceDeduction,
            advanceAmount: current.advanceAmount + live.advanceAmount,
            netSalary: current.netSalary + live.netSalary,
          };
        },
        {
          grossSalary: 0,
          insuranceAmount: 0,
          advanceAmount: 0,
          netSalary: 0,
        },
      ),
    [rows, drafts],
  );

  const buildPayloadFromDraft = (row: PayrollRow, draft: PayrollRowDraft) => {
    const live = computeLiveRow(row, draft);
    return {
      base_salary_override: live.baseSalary,
      standard_days_override: live.standardDays,
      allowance_override: live.allowanceTotal,
      probation_days: live.probationDays,
      probation_rate: live.probationRate,
      official_days_override: live.officialDays,
      overtime_hours_override: live.overtimeHours,
      overtime_pay_override: live.overtimePay,
      reward_amount: live.rewardAmount,
      insurance_deduction: live.insuranceDeduction,
      advance_override: Number(row.advances_from_vouchers || 0) > 0 ? null : draft.advanceChanged ? live.advanceAmount : undefined,
      note: draft.note.trim() || null,
    };
  };

  const saveAdjustment = async (row: PayrollRow) => {
    const id = String(row.id);
    setSavingId(id);
    setError("");
    setSuccessMsg("");
    try {
      const draft = drafts[id] || buildRowDraft(row);
      await apiRequest(`/staff-members/payroll/${id}/${month}`, {
        method: "PUT",
        body: buildPayloadFromDraft(row, draft),
      });
      setSuccessMsg(`Đã lưu bảng lương của ${row.full_name} (${month}).`);
      await load();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không lưu được thông tin bảng lương.",
      );
    } finally {
      setSavingId("");
    }
  };

  const saveAllDirty = async () => {
    if (!dirtyRows.length) return;
    setSavingAll(true);
    setError("");
    setSuccessMsg("");
    try {
      for (const row of dirtyRows) {
        const id = String(row.id);
        const draft = drafts[id];
        if (!draft) continue;
        await apiRequest(`/staff-members/payroll/${id}/${month}`, {
          method: "PUT",
          body: buildPayloadFromDraft(row, draft),
        });
      }
      setSuccessMsg(`Đã lưu ${dirtyRows.length} nhân sự trong kỳ ${month}.`);
      await load();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không lưu được toàn bộ thay đổi.",
      );
    } finally {
      setSavingAll(false);
    }
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = rows.map((row, index) =>
      toExcelRow(row, drafts[String(row.id)], index + 1),
    );
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [
      6, 14, 24, 18, 12, 16, 12, 14, 12, 14, 14, 16, 16, 12, 16, 14, 18, 16, 16,
      16, 18, 28,
    ].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Bảng lương tổng hợp");
    XLSX.writeFile(book, `bang-luong-${month}.xlsx`);
  };

  const exportPayslip = async (row: PayrollRow) => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      toExcelRow(row, drafts[String(row.id)], 1),
    ]);
    sheet["!cols"] = [
      6, 14, 24, 18, 12, 16, 12, 14, 12, 14, 14, 16, 16, 12, 16, 14, 18, 16, 16,
      16, 18, 28,
    ].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Phiếu lương");
    XLSX.writeFile(
      book,
      `phieu-luong-${safeFileName(row.employee_code || row.full_name)}-${month}.xlsx`,
    );
  };

  return (
    <div className="flex h-[calc(100dvh-108px)] max-h-[calc(100dvh-108px)] min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black">Bảng lương tổng hợp</h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-primary">
              Độc lập theo từng tháng
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Công thử việc (80%) + Công chính (100%) + Tăng ca + Phụ cấp + Thưởng
            = Tổng lương nhận − BHXH − Đã ứng = Thực nhận. Bấm vào nhân sự để
            xem Bảng phân bổ cấu thành lương.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirtyRows.length > 0 && (
            <button
              type="button"
              onClick={() => void saveAllDirty()}
              disabled={savingAll}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {savingAll ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Lưu tất cả ({dirtyRows.length} dòng sửa)
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={loading || !rows.length}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Download size={16} />
            Dow Excel
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setSelectedRow(null);
              setSuccessMsg("");
              setMonth(event.target.value);
            }}
            className="h-10 rounded-lg border border-border px-3 font-bold"
          />
        </div>
      </div>

      {!loading && !error && (
        <div className="grid gap-2 sm:grid-cols-4">
          <PayrollTotal
            label="Tổng lương nhận (Gross)"
            value={totals.grossSalary}
            className="border-blue-200 bg-blue-50 text-blue-800"
          />
          <PayrollTotal
            label="Tổng khấu trừ BHXH"
            value={totals.insuranceAmount}
            className="border-rose-200 bg-rose-50 text-rose-800"
          />
          <PayrollTotal
            label="Tổng đã ứng"
            value={totals.advanceAmount}
            className="border-amber-200 bg-amber-50 text-amber-800"
          />
          <PayrollTotal
            label="Tổng thực nhận (Net)"
            value={totals.netSalary}
            className="border-emerald-200 bg-emerald-50 text-emerald-800"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          <AlertTriangle size={15} className="mr-2 inline" />
          {error}
        </p>
      )}
      {successMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          {successMsg}
        </p>
      )}

      <DraggableScrollTableContainer>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Đang tải bảng lương tổng hợp...
          </div>
        ) : !rows.length ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            Chưa có nhân sự để tính lương.
          </div>
        ) : (
          <PayrollTable
            rows={rows}
            drafts={drafts}
            savingId={savingId}
            setDrafts={setDrafts}
            onSave={saveAdjustment}
            onSelect={setSelectedRow}
            onPay={setPayingRow}
          />
        )}
      </DraggableScrollTableContainer>

      {selectedRow && (
        <PayrollPayslipDrawer
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onDownload={exportPayslip}
          onSaved={load}
        />
      )}

      {payingRow && (
        <SalaryPaymentDialog
          row={payingRow}
          month={month}
          onClose={() => setPayingRow(null)}
          onPaid={async () => {
            setPayingRow(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function PayrollTotal({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${className}`}
    >
      <BadgeDollarSign className="shrink-0" size={20} />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
          {label}
        </p>
        <p className="mt-0.5 text-base font-black tabular-nums">
          {formatMoney(value)}
        </p>
      </div>
    </div>
  );
}

function PayrollTable({
  rows,
  drafts,
  savingId,
  setDrafts,
  onSave,
  onSelect,
  onPay,
}: {
  rows: PayrollRow[];
  drafts: Record<string, PayrollRowDraft>;
  savingId: string;
  setDrafts: React.Dispatch<
    React.SetStateAction<Record<string, PayrollRowDraft>>
  >;
  onSave: (row: PayrollRow) => Promise<void>;
  onSelect: (row: PayrollRow) => void;
  onPay: (row: PayrollRow) => void;
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});

  const headers = [
    "Nhân sự",
    "Bộ phận / HUB",
    "Mức lương tháng",
    "Công chuẩn",
    "Công thử việc",
    "% TV",
    "Công chính (100%)",
    "Tổng công",
    "Lương theo công",
    "Phụ cấp tháng",
    "Tăng ca (giờ)",
    "Tiền tăng ca",
    "Thưởng",
    "Tổng lương nhận",
    "Trừ BHXH",
    "Đã ứng",
    "Dư kỳ trước",
    "Thực nhận",
    "Ghi chú",
    "Thao tác",
  ];

  const updateDraft = (
    id: string,
    row: PayrollRow,
    patch: Partial<PayrollRowDraft>,
  ) => {
    setDrafts((current) => {
      const existing = current[id] || buildRowDraft(row);
      return {
        ...current,
        [id]: {
          ...existing,
          ...patch,
          dirty: true,
        },
      };
    });
  };

  const filteredRows = rows.filter((row) =>
    headers.every((_, index) => {
      const filter = filters[index]?.trim().toLocaleLowerCase("vi-VN");
      if (!filter || index === headers.length - 1) return true;
      const draft = drafts[String(row.id)] || buildRowDraft(row);
      return payrollFilterValue(row, draft, index)
        .toLocaleLowerCase("vi-VN")
        .includes(filter);
    }),
  );

  return (
    <table className="w-full min-w-[2350px] border-collapse text-left text-xs">
      <thead className="sticky top-0 z-20 bg-slate-100 text-[11px] font-bold uppercase text-slate-700 shadow-sm">
        <tr>
          {headers.map((label, index) => (
            <th
              key={`${label}-${index}`}
              className={`border-b border-r border-slate-200 px-2 py-2 ${
                index === 0 ? "sticky left-0 z-30 bg-slate-100" : ""
              } ${index >= 2 && index <= 17 ? "text-right" : ""}`}
            >
              <span className="block py-0.5">{label}</span>
              {index < headers.length - 1 && (
                <input
                  aria-label={`Lọc ${label}`}
                  value={filters[index] || ""}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      [index]: event.target.value,
                    }))
                  }
                  placeholder="Lọc..."
                  className="mt-1 h-6 w-full min-w-16 rounded border border-slate-300 bg-white px-1.5 text-[11px] font-medium normal-case outline-none focus:border-primary"
                />
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((row) => {
          const id = String(row.id);
          const draft = drafts[id] || buildRowDraft(row);
          const live = computeLiveRow(row, draft);
          const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onSave(row);
            }
          };

          return (
            <tr
              key={id}
              className={`group border-b border-slate-200 transition-colors ${
                draft.dirty
                  ? "bg-amber-50/40 hover:bg-amber-50/70"
                  : "hover:bg-blue-50/30"
              }`}
            >
              {/* 0: Nhân sự */}
              <td
                onClick={() => onSelect(row)}
                className={`sticky left-0 z-10 cursor-pointer border-r border-slate-200 px-2.5 py-2 ${
                  draft.dirty
                    ? "bg-amber-50 group-hover:bg-amber-100/80"
                    : "bg-white group-hover:bg-blue-50"
                }`}
              >
                <div
                  className="flex items-center justify-between gap-1.5"
                  title="Bấm để mở Bảng phân bổ cấu thành lương"
                >
                  <div>
                    <p className="text-[13px] font-extrabold text-slate-900">
                      {row.full_name}
                    </p>
                    <p className="text-[11px] font-bold text-primary">
                      {row.employee_code}
                    </p>
                  </div>
                  <FileSpreadsheet
                    size={14}
                    className="shrink-0 text-slate-400 group-hover:text-primary"
                  />
                </div>
              </td>

              {/* 1: Bộ phận / HUB */}
              <td
                onClick={() => onSelect(row)}
                className="cursor-pointer border-r border-slate-200 px-2 py-2"
              >
                <p className="font-semibold text-slate-800">
                  {row.department_record?.name || row.department || "—"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {row.hub?.code || row.hub?.name || "—"}
                </p>
              </td>

              {/* 2: Mức lương tháng */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.baseSalary}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      baseSalary: formatAmountInput(e.target.value),
                    })
                  }
                  title="Mức lương chính áp dụng riêng cho tháng này (không ảnh hưởng tháng trước)"
                  className="h-8 w-28 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-bold text-slate-900 hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none"
                />
              </td>

              {/* 3: Công chuẩn */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={draft.standardDays}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, { standardDays: e.target.value })
                  }
                  className="h-8 w-14 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-semibold text-slate-700 hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none"
                />
              </td>

              {/* 4: Công thử việc */}
              <td className="border-r border-slate-200 bg-amber-50/25 p-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.probationDays}
                  onKeyDown={handleKeyDown}
                  onChange={(e) => {
                    const nextProb = e.target.value;
                    const totalAtt = Number(
                      row.attendance_work_days ?? row.work_days ?? 0,
                    );
                    const autoOfficial = Math.max(
                      0,
                      totalAtt - Number(nextProb || 0),
                    );
                    updateDraft(id, row, {
                      probationDays: nextProb,
                      officialDays: String(autoOfficial),
                    });
                  }}
                  title="Số công thử việc trong tháng (VD: 10 ngày)"
                  className="h-8 w-16 rounded border border-amber-200/80 bg-white px-1.5 text-right text-xs font-bold text-amber-900 focus:border-primary focus:outline-none"
                />
              </td>

              {/* 5: % Thử việc */}
              <td className="border-r border-slate-200 bg-amber-50/25 p-1">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="200"
                  value={draft.probationRate}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, { probationRate: e.target.value })
                  }
                  title="% hưởng lương thử việc (mặc định 80%)"
                  className="h-8 w-14 rounded border border-amber-200/80 bg-white px-1 text-right text-xs font-bold text-amber-800 focus:border-primary focus:outline-none"
                />
              </td>

              {/* 6: Công chính (100%) */}
              <td className="border-r border-slate-200 bg-emerald-50/20 p-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.officialDays}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, { officialDays: e.target.value })
                  }
                  title="Số công hưởng 100% lương chính thức"
                  className="h-8 w-16 rounded border border-emerald-200/80 bg-white px-1.5 text-right text-xs font-bold text-emerald-900 focus:border-primary focus:outline-none"
                />
              </td>

              {/* 7: Tổng công */}
              <td className="border-r border-slate-200 px-2 py-2 text-right font-black tabular-nums text-slate-800">
                {live.workDays.toLocaleString("vi-VN")}/
                {live.standardDays.toLocaleString("vi-VN")}
              </td>

              {/* 8: Lương theo công */}
              <td
                onClick={() => onSelect(row)}
                className="cursor-pointer border-r border-slate-200 px-2 py-2 text-right tabular-nums"
                title="Bấm để xem chi tiết cấu thành lương thử việc + chính thức"
              >
                <p className="font-bold text-slate-900">
                  {formatMoney(live.baseByAttendance)}
                </p>
                {live.probationDays > 0 && (
                  <p className="text-[10px] text-amber-700">
                    TV: {formatMoney(live.probationSalary)} · Chính:{" "}
                    {formatMoney(live.officialSalary)}
                  </p>
                )}
              </td>

              {/* 9: Phụ cấp tháng */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.allowanceTotal}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      allowanceTotal: formatAmountInput(e.target.value),
                    })
                  }
                  title="Định mức phụ cấp cả tháng"
                  className="h-7 w-24 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-bold text-slate-800 hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none"
                />
                <p className="px-1.5 text-right text-[10px] text-slate-500 tabular-nums">
                  Theo công: {formatMoney(live.allowanceByAttendance)}
                </p>
              </td>

              {/* 10: Tăng ca (giờ) */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.overtimeHours}
                  onKeyDown={handleKeyDown}
                  onChange={(e) => {
                    const nextHours = e.target.value;
                    const rate = Number(row.overtime_hourly_rate || 0);
                    const patch: Partial<PayrollRowDraft> = {
                      overtimeHours: nextHours,
                    };
                    if (rate > 0) {
                      patch.overtimePay = formatAmountInputFromNumber(
                        Math.round(Number(nextHours || 0) * rate),
                      );
                    }
                    updateDraft(id, row, patch);
                  }}
                  className="h-8 w-16 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-bold hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none"
                />
              </td>

              {/* 11: Tiền tăng ca */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.overtimePay}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      overtimePay: formatAmountInput(e.target.value),
                    })
                  }
                  className="h-8 w-24 rounded border border-transparent bg-transparent px-1.5 text-right text-xs font-bold hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none"
                />
              </td>

              {/* 12: Thưởng */}
              <td className="border-r border-slate-200 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.reward}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      reward: formatAmountInput(e.target.value),
                    })
                  }
                  className="h-8 w-24 rounded border border-slate-200 bg-white px-1.5 text-right text-xs font-bold focus:border-primary focus:outline-none"
                />
              </td>

              {/* 13: Tổng lương nhận */}
              <td className="border-r border-slate-200 bg-blue-50/40 px-2 py-2 text-right font-black text-primary tabular-nums">
                {formatMoney(live.grossSalary)}
              </td>

              {/* 14: Trừ BHXH */}
              <td className="border-r border-slate-200 bg-rose-50/20 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.insurance}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      insurance: formatAmountInput(e.target.value),
                    })
                  }
                  placeholder="0"
                  title="Khoản khấu trừ BHXH"
                  className="h-8 w-24 rounded border border-rose-200/80 bg-white px-1.5 text-right text-xs font-bold text-rose-700 focus:border-primary focus:outline-none"
                />
              </td>

              {/* 15: Đã ứng */}
              <td className="border-r border-slate-200 bg-amber-50/20 p-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.advance}
                  readOnly={Number(row.advances_from_vouchers || 0) > 0}
                  aria-label={`Đã ứng của ${row.full_name}`}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, {
                      advance: formatAmountInput(e.target.value),
                      advanceChanged: true,
                    })
                  }
                  title={Number(row.advances_from_vouchers || 0) > 0 ? `Tự động từ phiếu tạm ứng: ${formatMoney(row.advances_from_vouchers)}. Sửa tại mục Tạm ứng lương.` : 'Chưa có phiếu tạm ứng trong tháng; có thể nhập số ứng thủ công.'}
                  className="h-8 w-24 rounded border border-amber-200/80 bg-white px-1.5 text-right text-xs font-bold text-amber-800 focus:border-primary focus:outline-none"
                />
              </td>

              {/* 16: Dư kỳ trước */}
              <td
                className={`border-r border-slate-200 px-2 py-2 text-right font-bold tabular-nums ${
                  live.carryIn < 0 ? "text-red-600" : "text-slate-600"
                }`}
              >
                {formatMoney(live.carryIn)}
              </td>

              {/* 17: Thực nhận */}
              <td
                className={`border-r border-slate-200 bg-emerald-50/30 px-2 py-2 text-right text-sm font-black tabular-nums ${
                  live.netSalary < 0 ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {formatMoney(live.netSalary)}
              </td>

              {/* 18: Ghi chú */}
              <td className="border-r border-slate-200 p-1">
                <input
                  value={draft.note}
                  onKeyDown={handleKeyDown}
                  onChange={(e) =>
                    updateDraft(id, row, { note: e.target.value })
                  }
                  placeholder="Ghi chú..."
                  className="h-8 w-40 rounded border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:outline-none"
                />
              </td>

              {/* 19: Thao tác */}
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Mở Bảng phân bổ cấu thành lương chi tiết"
                    onClick={() => onSelect(row)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    title={
                      row.salary_payment_id
                        ? "Đã thanh toán lương"
                        : "Thanh toán lương"
                    }
                    disabled={
                      Boolean(row.salary_payment_id) || live.netSalary <= 0
                    }
                    onClick={() => onPay({ ...row, net_salary: live.netSalary })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <BadgeDollarSign size={14} />
                  </button>
                  <button
                    type="button"
                    title="Lưu dòng này (hoặc nhấn Enter)"
                    disabled={savingId === id}
                    onClick={() => void onSave(row)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                      draft.dirty
                        ? "border-primary bg-primary text-white"
                        : "border-primary/30 text-primary"
                    } disabled:opacity-50`}
                  >
                    {savingId === id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function payrollFilterValue(
  row: PayrollRow,
  draft: PayrollRowDraft,
  index: number,
) {
  const live = computeLiveRow(row, draft);
  const values = [
    `${row.employee_code} ${row.full_name}`,
    `${row.department_record?.name || row.department || ""} ${row.hub?.code || row.hub?.name || ""}`,
    draft.baseSalary,
    draft.standardDays,
    draft.probationDays,
    draft.probationRate,
    draft.officialDays,
    `${live.workDays}/${live.standardDays}`,
    formatMoney(live.baseByAttendance),
    draft.allowanceTotal,
    draft.overtimeHours,
    draft.overtimePay,
    draft.reward,
    formatMoney(live.grossSalary),
    draft.insurance,
    draft.advance,
    formatMoney(live.carryIn),
    formatMoney(live.netSalary),
    draft.note,
  ];
  return String(values[index] || "");
}

function SalaryPaymentDialog({
  row,
  month,
  onClose,
  onPaid,
}: {
  row: PayrollRow;
  month: string;
  onClose: () => void;
  onPaid: () => Promise<void>;
}) {
  const [fundId, setFundId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!fundId) {
      setError("Chọn sổ quỹ chi tiền.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/staff-members/payroll/${row.id}/${month}/payment`, {
        method: "POST",
        body: { fund_id: fundId },
      });
      await onPaid();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không thanh toán được lương.",
      );
    } finally {
      setSaving(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-white shadow-2xl">
        <div className="border-b border-border p-4">
          <p className="text-xs font-bold uppercase text-primary">
            Chi trả lương
          </p>
          <h2 className="text-lg font-black">
            Thanh toán lương · {row.full_name}
          </h2>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-sm font-bold">
            Số tiền thực nhận
            <input
              readOnly
              value={formatAmountInputFromNumber(row.net_salary)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-right font-bold tabular-nums"
            />
          </label>
          <CashFundSelect
            value={fundId}
            onChange={setFundId}
            label="Sổ quỹ chi tiền *"
          />
          <label className="block text-sm font-bold">
            Loại chi phí
            <input
              readOnly
              value="334-Phải trả người lao động"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-slate-600"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-lg border border-border px-4 font-bold"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}Thanh toán
            lương
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function toExcelRow(
  row: PayrollRow,
  draft: PayrollRowDraft | undefined,
  index: number,
) {
  const live = computeLiveRow(row, draft);
  return {
    STT: index,
    "Mã NV": row.employee_code,
    "Họ tên": row.full_name,
    "Bộ phận": row.department_record?.name || row.department || "",
    "Bưu cục": row.hub?.code || row.hub?.name || "",
    "Mức lương tháng": live.baseSalary,
    "Công chuẩn": live.standardDays,
    "Công thử việc": live.probationDays,
    "% Thử việc": live.probationRate,
    "Lương thử việc": live.probationSalary,
    "Công chính (100%)": live.officialDays,
    "Lương chính thức": live.officialSalary,
    "Tổng ngày công": live.workDays,
    "Lương theo công": live.baseByAttendance,
    "Phụ cấp định mức": live.allowanceTotal,
    "Phụ cấp theo công": live.allowanceByAttendance,
    "Tăng ca (giờ)": live.overtimeHours,
    "Tiền tăng ca": live.overtimePay,
    Thưởng: live.rewardAmount,
    "Tổng lương nhận (Gross)": live.grossSalary,
    "Trừ BHXH": live.insuranceDeduction,
    "Đã ứng": live.advanceAmount,
    "Dư kỳ trước": live.carryIn,
    "Thực nhận (Net)": live.netSalary,
    "Ghi chú": draft?.note ?? row.payroll_note ?? "",
  };
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "nhan-su"
  );
}
