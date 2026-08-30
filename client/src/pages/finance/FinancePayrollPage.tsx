import {
  AlertTriangle,
  BadgeDollarSign,
  Download,
  Eye,
  Loader2,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import CashFundSelect from "../../components/finance/CashFundSelect";
import { ApiError, apiRequest } from "../../lib/api";
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  parseAmountInput,
} from "../../lib/formatMoney";
import PayrollPayslipDrawer, { type PayrollRow } from "./PayrollPayslipDrawer";

const currentMonth = new Date().toISOString().slice(0, 7);

export default function FinancePayrollPage() {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<PayrollRow | null>(null);
  const [payingRow, setPayingRow] = useState<PayrollRow | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { reward: string; note: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<PayrollRow[]>(
        `/staff-members/payroll/monthly?month=${month}`,
      );
      setRows(data);
      setDrafts(
        Object.fromEntries(
          data.map((row) => [
            String(row.id),
            {
              reward: formatAmountInputFromNumber(row.reward_amount),
              note: row.payroll_note || "",
            },
          ]),
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không tải được bảng lương.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load]);
  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0),
    [rows],
  );
  const saveAdjustment = async (row: PayrollRow) => {
    const id = String(row.id);
    setSavingId(id);
    setError("");
    try {
      const draft = drafts[id] || { reward: "", note: "" };
      await apiRequest(`/staff-members/payroll/${id}/${month}`, {
        method: "PUT",
        body: {
          reward_amount: parseAmountInput(draft.reward),
          note: draft.note.trim() || null,
        },
      });
      await load();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không lưu được thưởng và ghi chú.",
      );
    } finally {
      setSavingId("");
    }
  };
  const exportExcel = () => {
    const data = rows.map((row, index) => toExcelRow(row, index + 1));
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [
      6, 14, 24, 18, 14, 16, 12, 16, 18, 18, 14, 16, 14, 18, 14, 16, 30,
    ].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Bảng lương");
    XLSX.writeFile(book, `bang-luong-${month}.xlsx`);
  };
  const exportPayslip = (row: PayrollRow) => {
    const sheet = XLSX.utils.json_to_sheet([toExcelRow(row, 1)]);
    sheet["!cols"] = [
      6, 14, 24, 18, 14, 16, 12, 16, 18, 18, 14, 16, 14, 18, 14, 16, 30,
    ].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Phiếu lương");
    XLSX.writeFile(
      book,
      `phieu-luong-${safeFileName(row.employee_code || row.full_name)}-${month}.xlsx`,
    );
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Bảng lương theo ngày công</h1>
          <p className="text-sm text-muted-foreground">
            (Lương cơ bản + phụ cấp) / ngày công chuẩn × ngày thực tế + tăng ca
            + thưởng − đã ứng.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={loading || !rows.length}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 disabled:opacity-50"
          >
            <Download size={16} />
            Tải Excel
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setSelectedRow(null);
              setMonth(event.target.value);
            }}
            className="h-10 rounded-lg border border-border px-3 font-bold"
          />
        </div>
      </div>
      {!loading && !error && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <BadgeDollarSign className="text-emerald-600" size={20} />
          <span className="text-sm font-bold text-emerald-800">
            Tổng lương tạm tính: {formatMoney(total)}
          </span>
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          <AlertTriangle size={15} className="mr-2 inline" />
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Đang tính lương...
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
      </div>
      {selectedRow && (
        <PayrollPayslipDrawer
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onDownload={exportPayslip}
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
  drafts: Record<string, { reward: string; note: string }>;
  savingId: string;
  setDrafts: React.Dispatch<
    React.SetStateAction<Record<string, { reward: string; note: string }>>
  >;
  onSave: (row: PayrollRow) => Promise<void>;
  onSelect: (row: PayrollRow) => void;
  onPay: (row: PayrollRow) => void;
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const headers = [
    "Nhân sự",
    "Bộ phận",
    "Bưu cục",
    "Lương cơ bản",
    "Ngày công",
    "Lương theo công",
    "Phụ cấp theo công",
    "Tăng ca",
    "Tiền tăng ca",
    "Thưởng",
    "Dư âm trước",
    "Đã ứng",
    "Thực lĩnh",
    "Ghi chú",
    "",
  ];
  const filteredRows = rows.filter((row) =>
    headers.every((_, index) => {
      const filter = filters[index]?.trim().toLocaleLowerCase("vi-VN");
      if (!filter || index === 14) return true;
      const draft = drafts[String(row.id)] || { reward: "", note: "" };
      return payrollFilterValue(row, draft, index)
        .toLocaleLowerCase("vi-VN")
        .includes(filter);
    }),
  );
  return (
    <table className="w-full min-w-[1900px] text-left text-sm">
      <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase text-muted-foreground">
        <tr>
          {headers.map((label, index) => (
            <th
              key={`${label}-${index}`}
              className={`border-b border-border px-3 py-2 ${index === 0 ? "sticky left-0 z-30 bg-slate-50" : ""} ${index >= 3 && index <= 12 ? "text-right" : ""}`}
            >
              <span className="block py-1">{label}</span>
              {index < 14 && (
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
                  className="h-7 w-full min-w-20 rounded border border-border bg-white px-2 text-[11px] font-medium normal-case outline-none focus:border-primary"
                />
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((row) => {
          const id = String(row.id);
          const draft = drafts[id] || { reward: "", note: "" };
          return (
            <tr
              key={id}
              onClick={() => onSelect(row)}
              className="group cursor-pointer border-b border-border transition-colors hover:bg-blue-50/40"
            >
              <td className="sticky left-0 z-10 bg-white px-3 py-3 group-hover:bg-blue-50">
                <p className="font-extrabold">{row.full_name}</p>
                <p className="text-xs font-bold text-primary">
                  {row.employee_code}
                </p>
              </td>
              <td className="px-3 py-3">
                {row.department_record?.name || row.department || "—"}
              </td>
              <td className="px-3 py-3">
                {row.hub?.code || row.hub?.name || "—"}
              </td>
              <td className="px-3 py-3 text-right">
                {formatMoney(row.base_salary)}
              </td>
              <td className="px-3 py-3 text-right font-bold">
                {Number(row.work_days).toLocaleString("vi-VN")} /{" "}
                {Number(row.standard_work_days || 26).toLocaleString("vi-VN")}
              </td>
              <td className="px-3 py-3 text-right">
                {formatMoney(row.base_by_attendance)}
              </td>
              <td className="px-3 py-3 text-right">
                {formatMoney(row.allowance_by_attendance)}
              </td>
              <td className="px-3 py-3 text-right">
                {Number(row.overtime_hours).toLocaleString("vi-VN")} giờ
              </td>
              <td className="px-3 py-3 text-right">
                {formatMoney(row.overtime_pay)}
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.reward}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [id]: {
                        ...draft,
                        reward: formatAmountInput(event.target.value),
                      },
                    }))
                  }
                  className="h-9 w-28 rounded-lg border border-border px-2 text-right font-bold"
                />
              </td>
              <td
                className={`px-3 py-3 text-right font-bold ${row.carry_in < 0 ? "text-red-600" : ""}`}
              >
                {formatMoney(row.carry_in)}
              </td>
              <td className="px-3 py-3 text-right font-bold text-amber-700">
                {formatMoney(row.advance_amount)}
              </td>
              <td
                className={`px-3 py-3 text-right text-base font-black ${row.net_salary < 0 ? "text-red-600" : "text-emerald-700"}`}
              >
                {formatMoney(row.net_salary)}
              </td>
              <td className="px-3 py-2">
                <input
                  value={draft.note}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [id]: { ...draft, note: event.target.value },
                    }))
                  }
                  placeholder="Thưởng lễ, ghi chú..."
                  className="h-9 w-52 rounded-lg border border-border px-2"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Xem phiếu lương"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(row);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    title={
                      row.salary_payment_id
                        ? "Đã thanh toán lương"
                        : "Thanh toán lương"
                    }
                    disabled={
                      Boolean(row.salary_payment_id) ||
                      Number(row.net_salary) <= 0
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      onPay(row);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <BadgeDollarSign size={15} />
                  </button>
                  <button
                    type="button"
                    title="Lưu thưởng và ghi chú"
                    disabled={savingId === id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onSave(row);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 text-primary disabled:opacity-50"
                  >
                    {savingId === id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Save size={15} />
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
  draft: { reward: string; note: string },
  index: number,
) {
  const values = [
    `${row.employee_code} ${row.full_name}`,
    row.department_record?.name || row.department || "",
    row.hub?.code || row.hub?.name || "",
    formatMoney(row.base_salary),
    `${row.work_days}/${row.standard_work_days || 26}`,
    formatMoney(row.base_by_attendance),
    formatMoney(row.allowance_by_attendance),
    `${row.overtime_hours} giờ`,
    formatMoney(row.overtime_pay),
    draft.reward,
    formatMoney(row.carry_in),
    formatMoney(row.advance_amount),
    formatMoney(row.net_salary),
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
            Số tiền thực lĩnh
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

function toExcelRow(row: PayrollRow, index: number) {
  return {
    STT: index,
    "Mã NV": row.employee_code,
    "Họ tên": row.full_name,
    "Bộ phận": row.department_record?.name || row.department || "",
    "Bưu cục": row.hub?.code || row.hub?.name || "",
    "Lương cơ bản": Number(row.base_salary || 0),
    "Ngày công": row.work_days,
    "Ngày công chuẩn": Number(row.standard_work_days || 26),
    "Lương theo công": Math.round(row.base_by_attendance),
    "Phụ cấp theo công": Math.round(row.allowance_by_attendance),
    "Tăng ca (giờ)": row.overtime_hours,
    "Tiền tăng ca": Math.round(row.overtime_pay),
    Thưởng: Number(row.reward_amount || 0),
    "Dư âm tháng trước": Number(row.carry_in || 0),
    "Đã ứng": Number(row.advance_amount || 0),
    "Thực lĩnh": Math.round(row.net_salary),
    "Ghi chú": row.payroll_note || "",
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
