import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Download,
  Clock3,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  UserRound,
  X,
  Loader2,
} from "lucide-react";
import type { StaffAttendanceResponse, StaffRecord } from "./staffTypes";
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from "../../lib/formatMoney";
import { ApiError, apiRequest } from "../../lib/api";

export interface SalaryTierItem {
  label?: string;
  work_days: number;
  rate_percent?: number;
  base_salary?: number;
  note?: string;
}

export interface PayrollRow extends StaffRecord {
  month: string;
  work_days: number;
  attendance_work_days?: number;
  probation_days?: number;
  probation_rate?: number;
  probation_salary?: number;
  official_days?: number;
  official_salary?: number;
  overtime_hours: number;
  base_by_attendance: number;
  allowance_total?: number;
  allowance_by_attendance: number;
  overtime_pay: number;
  reward_amount: number;
  insurance_deduction?: number;
  advances_from_vouchers?: number;
  advance_amount: number;
  carry_in: number;
  gross_salary: number;
  net_salary: number;
  carry_out: number;
  salary_tiers?: SalaryTierItem[];
  payroll_note?: string | null;
  salary_paid_amount?: number;
  salary_payment_id?: string | number | null;
}

interface Props {
  row: PayrollRow;
  onClose: () => void;
  onDownload: (row: PayrollRow) => void;
  onSaved?: () => Promise<void> | void;
}

const formatMonth = (month: string) => {
  const [year, value] = month.split("-");
  return `Tháng ${Number(value)}/${year}`;
};

export default function PayrollPayslipDrawer({
  row,
  onClose,
  onDownload,
  onSaved,
}: Props) {
  const department = row.department_record?.name || row.department || "—";
  const hub = row.hub?.code || row.hub?.name || "—";

  const [baseSalaryInput, setBaseSalaryInput] = useState(() =>
    formatAmountInputFromNumber(Number(row.base_salary || 0)),
  );
  const [standardDaysInput, setStandardDaysInput] = useState(() =>
    String(Number(row.standard_work_days || 26)),
  );
  const [probationDaysInput, setProbationDaysInput] = useState(() =>
    String(Number(row.probation_days || 0)),
  );
  const [probationRateInput, setProbationRateInput] = useState(() =>
    String(Number(row.probation_rate ?? 80)),
  );
  const [officialDaysInput, setOfficialDaysInput] = useState(() =>
    String(
      row.official_days !== undefined
        ? Number(row.official_days)
        : Math.max(0, Number(row.work_days || 0) - Number(row.probation_days || 0)),
    ),
  );
  const [allowanceInput, setAllowanceInput] = useState(() =>
    formatAmountInputFromNumber(
      row.allowance_total !== undefined
        ? Number(row.allowance_total)
        : Number(row.meal_allowance || 0) +
            Number(row.transport_allowance || 0) +
            Number(row.other_allowance || 0),
    ),
  );
  const [overtimeHoursInput, setOvertimeHoursInput] = useState(() =>
    String(Number(row.overtime_hours || 0)),
  );
  const [overtimePayInput, setOvertimePayInput] = useState(() =>
    formatAmountInputFromNumber(Number(row.overtime_pay || 0)),
  );
  const [rewardInput, setRewardInput] = useState(() =>
    formatAmountInputFromNumber(Number(row.reward_amount || 0)),
  );
  const [insuranceInput, setInsuranceInput] = useState(() =>
    formatAmountInputFromNumber(Number(row.insurance_deduction || 0)),
  );
  const [advanceInput, setAdvanceInput] = useState(() =>
    formatAmountInputFromNumber(Number(row.advance_amount || 0)),
  );
  const [advanceChanged, setAdvanceChanged] = useState(false);
  const [noteInput, setNoteInput] = useState(() => row.payroll_note || "");
  const [tiers, setTiers] = useState<
    Array<{
      label: string;
      work_days: string;
      rate_percent: string;
      base_salary: string;
    }>
  >(() =>
    (row.salary_tiers || []).map((t) => ({
      label: t.label || "Đợt lương",
      work_days: String(t.work_days ?? 0),
      rate_percent: String(t.rate_percent ?? 100),
      base_salary: formatAmountInputFromNumber(
        Number(t.base_salary ?? row.base_salary ?? 0),
      ),
    })),
  );

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [detail, setDetail] = useState<"attendance" | "advances" | null>(null);
  const [detailRows, setDetailRows] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Live calculation in drawer
  const effBaseSalary = parseAmountInput(baseSalaryInput);
  const effStandardDays = Math.max(1, Number(standardDaysInput || 26));
  const effProbationDays = Math.max(0, Number(probationDaysInput || 0));
  const effProbationRate = Math.max(0, Number(probationRateInput || 80));
  const effOfficialDays = Math.max(0, Number(officialDaysInput || 0));
  const effWorkDays =
    tiers.length > 0
      ? tiers.reduce((sum, t) => sum + Math.max(0, Number(t.work_days || 0)), 0)
      : effProbationDays + effOfficialDays;

  const liveProbationSalary = Math.round(
    (effBaseSalary / effStandardDays) * effProbationDays * (effProbationRate / 100),
  );
  const liveOfficialSalary = Math.round(
    (effBaseSalary / effStandardDays) * effOfficialDays,
  );
  const liveTiersSalary = Math.round(
    tiers.reduce((sum, t) => {
      const tierBase = parseAmountInput(t.base_salary) || effBaseSalary;
      const days = Math.max(0, Number(t.work_days || 0));
      const rate = Math.max(0, Number(t.rate_percent || 100));
      return sum + (tierBase / effStandardDays) * days * (rate / 100);
    }, 0),
  );

  const liveBaseByAttendance =
    tiers.length > 0
      ? liveTiersSalary
      : liveProbationSalary + liveOfficialSalary;

  const effAllowanceTotal = parseAmountInput(allowanceInput);
  const liveAllowanceByAttendance = Math.round(
    (effAllowanceTotal / effStandardDays) * effWorkDays,
  );
  const effOvertimeHours = Math.max(0, Number(overtimeHoursInput || 0));
  const liveOvertimePay = parseAmountInput(overtimePayInput);
  const liveReward = parseAmountInput(rewardInput);
  const liveGrossSalary = Math.round(
    liveBaseByAttendance +
      liveAllowanceByAttendance +
      liveOvertimePay +
      liveReward,
  );
  const liveInsurance = parseAmountInput(insuranceInput);
  const hasAdvanceVouchers = Number(row.advances_from_vouchers || 0) > 0;
  const liveAdvance = hasAdvanceVouchers || !advanceChanged
    ? Number(row.advance_amount || 0)
    : parseAmountInput(advanceInput);
  useEffect(() => {
    if (hasAdvanceVouchers) queueMicrotask(() => setAdvanceChanged(false));
  }, [hasAdvanceVouchers]);
  const liveCarryIn = Number(row.carry_in || 0);
  const liveNetSalary = Math.round(
    liveGrossSalary + liveCarryIn - liveInsurance - liveAdvance,
  );

  const handleSaveBreakdown = async () => {
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      await apiRequest(`/staff-members/payroll/${row.id}/${row.month}`, {
        method: "PUT",
        body: {
          base_salary_override: effBaseSalary,
          standard_days_override: effStandardDays,
          allowance_override: effAllowanceTotal,
          probation_days: effProbationDays,
          probation_rate: effProbationRate,
          official_days_override: effOfficialDays,
          overtime_hours_override: effOvertimeHours,
          overtime_pay_override: liveOvertimePay,
          reward_amount: liveReward,
          insurance_deduction: liveInsurance,
          advance_override: hasAdvanceVouchers ? null : advanceChanged ? liveAdvance : undefined,
          salary_tiers: tiers.map((t) => ({
            label: t.label.trim() || "Đợt lương",
            work_days: Math.max(0, Number(t.work_days || 0)),
            rate_percent: Math.max(0, Number(t.rate_percent || 100)),
            base_salary: parseAmountInput(t.base_salary) || effBaseSalary,
          })),
          note: noteInput.trim() || null,
        },
      });
      setSaveMessage("Đã lưu bảng phân bổ lương kỳ này.");
      if (onSaved) {
        await onSaved();
      }
      setAdvanceChanged(false);
    } catch (failure) {
      setSaveError(
        failure instanceof ApiError
          ? failure.message
          : "Không lưu được bảng phân bổ lương.",
      );
    } finally {
      setSaving(false);
    }
  };

  const showDetail = async (next: "attendance" | "advances") => {
    if (detail === next) {
      setDetail(null);
      return;
    }
    setDetail(next);
    setDetailLoading(true);
    setDetailError("");
    try {
      if (next === "attendance") {
        const response = await apiRequest<StaffAttendanceResponse>(
          `/staff-members/attendance/monthly?month=${row.month}`,
        );
        setDetailRows(
          response.records.filter(
            (item) => String(item.staff_member_id) === String(row.id),
          ) as unknown as Array<Record<string, unknown>>,
        );
      } else {
        const response = await apiRequest<Array<Record<string, unknown>>>(
          `/staff-members/salary-advances/list?month=${row.month}`,
        );
        setDetailRows(
          response.filter(
            (item) => String(item.staff_member_id) === String(row.id),
          ),
        );
      }
    } catch (failure) {
      setDetailRows([]);
      setDetailError(
        failure instanceof ApiError
          ? failure.message
          : "Không tải được chi tiết.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="dialog-slide-in relative flex h-screen w-full max-w-[760px] flex-col border-l border-border bg-slate-50 shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              Chi tiết & Bảng phân bổ cấu thành lương
            </p>
            <h2 className="text-lg font-black text-foreground">
              {row.full_name} · {formatMonth(row.month)}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Đóng phiếu lương"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X size={19} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-primary">
                <UserRound size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-foreground">
                  {row.full_name}
                </h3>
                <p className="mt-0.5 text-sm font-bold text-primary">
                  {row.employee_code}
                </p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  Tổng công tính lương: {effWorkDays.toLocaleString("vi-VN")}/
                  {effStandardDays.toLocaleString("vi-VN")} ngày
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Info
                icon={<BriefcaseBusiness size={15} />}
                label="Bộ phận"
                value={department}
              />
              <Info
                icon={<Building2 size={15} />}
                label="Bưu cục"
                value={hub}
              />
              <Info
                icon={<CalendarDays size={15} />}
                label="Kỳ lương"
                value={formatMonth(row.month)}
              />
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void showDetail("attendance")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-blue-50 px-3 text-xs font-bold text-primary"
            >
              <Clock3 size={14} />
              Xem bảng chấm công ({Number(row.attendance_work_days ?? row.work_days).toLocaleString("vi-VN")} công)
            </button>
            <button
              type="button"
              onClick={() => void showDetail("advances")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-700"
            >
              <ReceiptText size={14} />
              Xem phiếu tạm ứng ({formatMoney(row.advances_from_vouchers ?? row.advance_amount)})
            </button>
          </div>

          {detail && (
            <DetailList
              kind={detail}
              rows={detailRows}
              loading={detailLoading}
              error={detailError}
            />
          )}

          {/* BẢNG PHÂN BỔ CẤU THÀNH LƯƠNG TỔNG */}
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-blue-50/70 px-4 py-2.5">
              <div>
                <p className="text-[12px] font-black uppercase tracking-wider text-primary">
                  1. Bảng phân bổ lương & Cấu thành lương tổng ({formatMonth(row.month)})
                </p>
                <p className="text-[11px] text-slate-600">
                  Mức lương điều chỉnh tại đây chỉ áp dụng cho {formatMonth(row.month)}, không làm thay đổi các tháng trước.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-bold text-slate-700">
                  Mức lương chính áp dụng kỳ này (VNĐ)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={baseSalaryInput}
                    onChange={(e) =>
                      setBaseSalaryInput(formatAmountInput(e.target.value))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-right text-sm font-black text-primary"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Ngày công chuẩn tháng
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={standardDaysInput}
                    onChange={(e) => setStandardDaysInput(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-right text-sm font-bold"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Tổng phụ cấp định mức tháng (VNĐ)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={allowanceInput}
                    onChange={(e) =>
                      setAllowanceInput(formatAmountInput(e.target.value))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-right text-sm font-bold"
                  />
                </label>
              </div>

              {/* Bảng chi tiết công thử việc & công chính thức */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Khoản cấu thành lương</th>
                      <th className="px-3 py-2 text-right">Số ngày / giờ</th>
                      <th className="px-3 py-2 text-right">Tỷ lệ hưởng (%)</th>
                      <th className="px-3 py-2 text-right">Đơn giá / Mức tính</th>
                      <th className="px-3 py-2 text-right">Thành tiền (VNĐ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {tiers.length === 0 ? (
                      <>
                        <tr className="bg-amber-50/30">
                          <td className="px-3 py-2 font-bold text-slate-800">
                            Công thử việc
                            <span className="block text-[11px] font-normal text-slate-500">
                              VD: 10 ngày đầu hưởng 80% mức lương chính
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={probationDaysInput}
                              onChange={(e) =>
                                setProbationDaysInput(e.target.value)
                              }
                              className="h-8 w-20 rounded border border-border bg-white px-2 text-right font-bold"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="200"
                                value={probationRateInput}
                                onChange={(e) =>
                                  setProbationRateInput(e.target.value)
                                }
                                className="h-8 w-16 rounded border border-border bg-white px-2 text-right font-bold"
                              />
                              <span className="text-xs font-bold">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums">
                            {formatMoney(
                              Math.round(
                                (effBaseSalary / effStandardDays) *
                                  (effProbationRate / 100),
                              ),
                            )}
                            /ngày
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-800">
                            {formatMoney(liveProbationSalary)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-bold text-slate-800">
                            Công chính thức
                            <span className="block text-[11px] font-normal text-slate-500">
                              VD: Từ ngày thứ 11 hưởng 100% mức lương chính
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={officialDaysInput}
                              onChange={(e) =>
                                setOfficialDaysInput(e.target.value)
                              }
                              className="h-8 w-20 rounded border border-border bg-white px-2 text-right font-bold"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">
                            100%
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums">
                            {formatMoney(
                              Math.round(effBaseSalary / effStandardDays),
                            )}
                            /ngày
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-800">
                            {formatMoney(liveOfficialSalary)}
                          </td>
                        </tr>
                      </>
                    ) : (
                      tiers.map((tier, idx) => {
                        const tierBase =
                          parseAmountInput(tier.base_salary) || effBaseSalary;
                        const tierDays = Math.max(0, Number(tier.work_days || 0));
                        const tierRate = Math.max(
                          0,
                          Number(tier.rate_percent || 100),
                        );
                        const tierAmount = Math.round(
                          (tierBase / effStandardDays) *
                            tierDays *
                            (tierRate / 100),
                        );
                        return (
                          <tr key={idx} className="bg-blue-50/20">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <input
                                  value={tier.label}
                                  onChange={(e) =>
                                    setTiers((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? { ...item, label: e.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                  placeholder="Đợt lương..."
                                  className="h-8 w-full rounded border border-border bg-white px-2 text-xs font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTiers((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50"
                                  title="Xóa đợt lương"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={tier.work_days}
                                onChange={(e) =>
                                  setTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, work_days: e.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-8 w-16 rounded border border-border bg-white px-2 text-right font-bold"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={tier.rate_percent}
                                onChange={(e) =>
                                  setTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            rate_percent: e.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-8 w-14 rounded border border-border bg-white px-2 text-right font-bold"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={tier.base_salary}
                                onChange={(e) =>
                                  setTiers((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            base_salary: formatAmountInput(
                                              e.target.value,
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-8 w-28 rounded border border-border bg-white px-2 text-right text-xs font-bold"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums">
                              {formatMoney(tierAmount)}
                            </td>
                          </tr>
                        );
                      })
                    )}

                    {/* Dòng tổng lương theo ngày công */}
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-3 py-2 text-slate-900">
                        Cộng lương theo ngày công
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {effWorkDays.toLocaleString("vi-VN")} công
                      </td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right font-black text-primary tabular-nums">
                        {formatMoney(liveBaseByAttendance)}
                      </td>
                    </tr>

                    {/* Phụ cấp theo ngày công */}
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-800">
                        Phụ cấp theo ngày công
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {effWorkDays.toLocaleString("vi-VN")}/
                        {effStandardDays.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-2 text-right">Theo công</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums">
                        {formatMoney(effAllowanceTotal)}/tháng
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {formatMoney(liveAllowanceByAttendance)}
                      </td>
                    </tr>

                    {/* Tăng ca */}
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-800">
                        Lương tăng ca
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={overtimeHoursInput}
                            onChange={(e) => {
                              const nextHours = e.target.value;
                              setOvertimeHoursInput(nextHours);
                              const rate = Number(row.overtime_hourly_rate || 0);
                              if (rate > 0) {
                                setOvertimePayInput(
                                  formatAmountInputFromNumber(
                                    Math.round(Number(nextHours || 0) * rate),
                                  ),
                                );
                              }
                            }}
                            className="h-8 w-16 rounded border border-border bg-white px-2 text-right font-bold"
                          />
                          <span className="text-xs">giờ</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums">
                        {formatMoney(Number(row.overtime_hourly_rate || 0))}/giờ
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={overtimePayInput}
                          onChange={(e) =>
                            setOvertimePayInput(formatAmountInput(e.target.value))
                          }
                          className="h-8 w-28 rounded border border-border bg-white px-2 text-right font-bold"
                        />
                      </td>
                    </tr>

                    {/* Thưởng */}
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-800">
                        Thưởng / Phụ cấp cộng thêm
                      </td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={rewardInput}
                          onChange={(e) =>
                            setRewardInput(formatAmountInput(e.target.value))
                          }
                          className="h-8 w-28 rounded border border-border bg-white px-2 text-right font-bold"
                        />
                      </td>
                    </tr>

                    {/* TỔNG LƯƠNG NHẬN */}
                    <tr className="bg-blue-50/70 text-base font-black text-primary">
                      <td colSpan={4} className="px-3 py-2.5">
                        TỔNG LƯƠNG NHẬN (GROSS)
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(liveGrossSalary)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTiers((prev) => [
                      ...prev,
                      {
                        label:
                          prev.length === 0
                            ? "Đợt 1 (Thử việc 80%)"
                            : `Đợt ${prev.length + 1}`,
                        work_days:
                          prev.length === 0 ? String(effProbationDays || 10) : "16",
                        rate_percent: prev.length === 0 ? "80" : "100",
                        base_salary: formatAmountInputFromNumber(effBaseSalary),
                      },
                    ])
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-blue-50/50 px-3 text-xs font-bold text-primary hover:bg-blue-50"
                >
                  <Plus size={14} />
                  Thêm dòng phân bổ nhiều mức lương trong tháng
                </button>
                {tiers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTiers([])}
                    className="text-xs font-bold text-slate-500 underline hover:text-slate-800"
                  >
                    Quay về chế độ Thử việc / Chính thức mặc định
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* KHẤU TRỪ BHXH, ĐÃ ỨNG & THỰC NHẬN */}
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-emerald-50/70 px-4 py-2 text-[12px] font-black uppercase tracking-wider text-emerald-800">
              2. Các khoản trừ (BHXH & Đã ứng) → Thực nhận
            </div>
            <div className="divide-y divide-border px-4">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Trừ BHXH / Bảo hiểm bắt buộc
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Khoản khấu trừ BHXH, BHYT, BHTN của nhân sự
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={insuranceInput}
                  onChange={(e) =>
                    setInsuranceInput(formatAmountInput(e.target.value))
                  }
                  placeholder="0"
                  className="h-9 w-36 rounded-lg border border-border px-3 text-right font-bold text-red-600"
                />
              </div>

              <div className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Lương đã tạm ứng trong kỳ
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tổng từ phiếu chi ứng:{" "}
                    {formatMoney(
                      Number(row.advances_from_vouchers ?? row.advance_amount),
                    )}{" "}
                    {hasAdvanceVouchers ? '(tự động đồng bộ; sửa tại mục Tạm ứng lương)' : '(chưa có phiếu; có thể nhập số ứng thủ công)'}
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatAmountInputFromNumber(liveAdvance)}
                  readOnly={hasAdvanceVouchers}
                  aria-label="Lương đã tạm ứng trong kỳ"
                  onChange={(e) => {
                    setAdvanceInput(formatAmountInput(e.target.value));
                    setAdvanceChanged(true);
                  }}
                  placeholder="0"
                  className="h-9 w-36 rounded-lg border border-border px-3 text-right font-bold text-amber-700"
                />
              </div>

              <MoneyLine
                label="Dư âm / nợ lương kỳ trước chuyển sang"
                value={liveCarryIn}
                danger={liveCarryIn < 0}
              />

              <div className="py-2.5">
                <label className="block text-xs font-bold uppercase text-slate-600">
                  Ghi chú bảng lương
                  <input
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="VD: 10 ngày thử việc 80%, từ ngày 11 lương chính..."
                    className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-sm font-medium text-foreground"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <div className="flex items-center gap-2 font-black text-foreground">
                    <BadgeDollarSign size={20} className="text-emerald-600" />
                    THỰC NHẬN (Tổng lương − BHXH − Đã ứng)
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatMoney(liveGrossSalary)} − {formatMoney(liveInsurance)}{" "}
                    − {formatMoney(liveAdvance)}
                    {liveCarryIn !== 0
                      ? ` + (${formatMoney(liveCarryIn)})`
                      : ""}
                  </p>
                </div>
                <span
                  className={`text-xl font-black tabular-nums ${liveNetSalary < 0 ? "text-red-600" : "text-emerald-700"}`}
                >
                  {formatMoney(liveNetSalary)}
                </span>
              </div>
            </div>
          </section>

          {saveError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {saveError}
            </p>
          )}
          {saveMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {saveMessage}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            Đóng
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDownload({
                  ...row,
                  base_salary: String(effBaseSalary),
                  standard_work_days: String(effStandardDays),
                  probation_days: effProbationDays,
                  probation_rate: effProbationRate,
                  probation_salary: liveProbationSalary,
                  official_days: effOfficialDays,
                  official_salary: liveOfficialSalary,
                  work_days: effWorkDays,
                  base_by_attendance: liveBaseByAttendance,
                  allowance_by_attendance: liveAllowanceByAttendance,
                  overtime_hours: effOvertimeHours,
                  overtime_pay: liveOvertimePay,
                  reward_amount: liveReward,
                  gross_salary: liveGrossSalary,
                  insurance_deduction: liveInsurance,
                  advance_amount: liveAdvance,
                  net_salary: liveNetSalary,
                  payroll_note: noteInput,
                })
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <Download size={16} />
              Tải phiếu Excel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveBreakdown()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Lưu phân bổ lương
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/5 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-bold text-foreground">
        {value}
      </p>
    </div>
  );
}

function DetailList({
  kind,
  rows,
  loading,
  error,
}: {
  kind: "attendance" | "advances";
  rows: Array<Record<string, unknown>>;
  loading: boolean;
  error: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-border bg-muted/5 px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-primary">
        {kind === "attendance" ? "Chi tiết ngày công" : "Chi tiết ngày ứng"}
      </div>
      <div className="max-h-52 overflow-y-auto px-4 custom-scrollbar">
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Đang tải...</p>
        ) : error ? (
          <p className="py-4 text-sm font-bold text-red-600">{error}</p>
        ) : !rows.length ? (
          <p className="py-4 text-sm text-muted-foreground">
            Không có dữ liệu.
          </p>
        ) : (
          rows.map((item) => {
            const date = String(
              kind === "attendance" ? item.work_date : item.advance_date,
            ).slice(0, 10);
            return (
              <div
                key={String(item.id)}
                className="flex items-start justify-between gap-3 border-b border-border py-2.5 text-sm last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN")}
                  </p>
                  {kind === "advances" && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {typeof item.note === "string" && item.note.trim()
                        ? item.note
                        : "Chưa có nội dung ứng lương"}
                    </p>
                  )}
                </div>
                {kind === "attendance" ? (
                  <span className="tabular-nums">
                    {Number(item.work_days || 0).toLocaleString("vi-VN")} công ·{" "}
                    {Number(item.overtime_hours || 0).toLocaleString("vi-VN")}{" "}
                    giờ
                  </span>
                ) : (
                  <span className="shrink-0 font-bold tabular-nums text-amber-700">
                    {formatMoney(item.amount as string | number)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function MoneyLine({
  label,
  value,
  hint,
  strong,
  danger,
}: {
  label: string;
  value: string | number;
  hint?: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p
          className={
            strong
              ? "font-black text-foreground"
              : "text-sm font-semibold text-foreground"
          }
        >
          {label}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span
        className={`shrink-0 tabular-nums ${strong ? "text-base font-black text-primary" : danger ? "font-bold text-red-600" : "font-bold text-foreground"}`}
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}
