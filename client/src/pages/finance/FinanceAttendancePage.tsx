import { AlertTriangle, CalendarDays, Loader2, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, apiRequest } from "../../lib/api";
import type {
  StaffAttendanceRecord,
  StaffAttendanceResponse,
  StaffRecord,
} from "./staffTypes";

const currentMonth = new Date().toISOString().slice(0, 7);
type DayValue = { work_days: number; overtime_hours: number; note: string };
const keyFor = (staffId: string | number, date: string) => `${staffId}:${date}`;
const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Không xử lý được bảng chấm công.";

export default function FinanceAttendancePage() {
  const [month, setMonth] = useState(currentMonth);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [editing, setEditing] = useState<StaffRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<StaffAttendanceResponse>(
        `/staff-members/attendance/monthly?month=${month}`,
      );
      setStaff(response.staff || []);
      setRecords(response.records || []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load]);

  const totals = useMemo(() => {
    const map = new Map<string, { workDays: number; overtime: number }>();
    records.forEach((record) => {
      const value = map.get(String(record.staff_member_id)) || {
        workDays: 0,
        overtime: 0,
      };
      value.workDays += Number(record.work_days || 0);
      value.overtime += Number(record.overtime_hours || 0);
      map.set(String(record.staff_member_id), value);
    });
    return map;
  }, [records]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Bảng chấm công</h1>
          <p className="text-sm text-muted-foreground">
            Chấm ngày công và giờ tăng ca cho toàn bộ nhân sự, kể cả người không
            có tài khoản.
          </p>
        </div>
        <label className="text-sm font-bold">
          Tháng{" "}
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="ml-2 h-10 rounded-lg border border-border px-3"
          />
        </label>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          <AlertTriangle size={15} className="mr-2 inline" />
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white shadow-sm">
        {loading ? (
          <State loading text="Đang tải bảng chấm công..." />
        ) : !staff.length ? (
          <State text="Chưa có nhân sự. Hãy nhập tại Tổng danh sách nhân sự nội bộ." />
        ) : (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="border-b border-border px-4 py-3">Nhân sự</th>
                <th className="border-b border-border px-4 py-3">Bộ phận</th>
                <th className="border-b border-border px-4 py-3 text-right">
                  Ngày công
                </th>
                <th className="border-b border-border px-4 py-3 text-right">
                  Giờ tăng ca
                </th>
                <th className="border-b border-border px-4 py-3">
                  Ngày công chuẩn
                </th>
                <th className="border-b border-border px-4 py-3 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => {
                const total = totals.get(String(row.id)) || {
                  workDays: 0,
                  overtime: 0,
                };
                return (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-4 py-3">
                      <p className="font-extrabold">{row.full_name}</p>
                      <p className="text-xs font-bold text-primary">
                        {row.employee_code}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {row.department_record?.name || row.department || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-base font-black">
                      {total.workDays.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {total.overtime.toLocaleString("vi-VN")} giờ
                    </td>
                    <td className="px-4 py-3">
                      {Number(row.standard_work_days || 26).toLocaleString(
                        "vi-VN",
                      )}{" "}
                      ngày
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-blue-50 px-3 text-xs font-bold text-primary"
                      >
                        <Pencil size={14} />
                        Chấm công
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <AttendanceDialog
          staff={editing}
          month={month}
          records={records.filter(
            (record) => String(record.staff_member_id) === String(editing.id),
          )}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AttendanceDialog({
  staff,
  month,
  records,
  onClose,
  onSaved,
}: {
  staff: StaffRecord;
  month: string;
  records: StaffAttendanceRecord[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, DayValue>>(() =>
    Object.fromEntries(
      records.map((record) => [
        record.work_date.slice(0, 10),
        {
          work_days: Number(record.work_days || 0),
          overtime_hours: Number(record.overtime_hours || 0),
          note: record.note || "",
        },
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from(
    { length: lastDay },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  ).filter(
    (date) =>
      (!staff.hire_date || date >= staff.hire_date.slice(0, 10)) &&
      (!staff.termination_date || date <= staff.termination_date.slice(0, 10)),
  );
  const initial = useMemo(
    () =>
      Object.fromEntries(
        records.map((record) => [
          record.work_date.slice(0, 10),
          {
            work_days: Number(record.work_days || 0),
            overtime_hours: Number(record.overtime_hours || 0),
            note: record.note || "",
          },
        ]),
      ),
    [records],
  );
  const update = (date: string, patch: Partial<DayValue>) =>
    setValues((current) => ({
      ...current,
      [date]: {
        ...(current[date] || { work_days: 0, overtime_hours: 0, note: "" }),
        ...patch,
      },
    }));
  const submit = async () => {
    const changed = days.filter(
      (date) =>
        JSON.stringify(
          values[date] || { work_days: 0, overtime_hours: 0, note: "" },
        ) !==
        JSON.stringify(
          initial[date] || { work_days: 0, overtime_hours: 0, note: "" },
        ),
    );
    if (!changed.length) {
      await onSaved();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        changed.map((date) => {
          const value = values[date] || {
            work_days: 0,
            overtime_hours: 0,
            note: "",
          };
          return apiRequest(`/staff-members/attendance/${staff.id}/${date}`, {
            method: "PUT",
            body: value,
          });
        }),
      );
      await onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };
  const totalDays = Object.values(values).reduce(
    (sum, item) => sum + item.work_days,
    0,
  );
  const totalOvertime = Object.values(values).reduce(
    (sum, item) => sum + item.overtime_hours,
    0,
  );
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-lg border border-border bg-white shadow-2xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-primary">
              Bảng công {month}
            </p>
            <h2 className="text-lg font-black">
              {staff.employee_code} · {staff.full_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              Tổng: {totalDays.toLocaleString("vi-VN")} ngày ·{" "}
              {totalOvertime.toLocaleString("vi-VN")} giờ tăng ca
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Thứ</th>
                <th className="px-4 py-3">Ngày công</th>
                <th className="px-4 py-3">Giờ tăng ca</th>
                <th className="px-4 py-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {days.map((date) => {
                const value = values[date] || {
                  work_days: 0,
                  overtime_hours: 0,
                  note: "",
                };
                const day = new Date(`${date}T00:00:00`).toLocaleDateString(
                  "vi-VN",
                  { weekday: "long" },
                );
                return (
                  <tr
                    key={keyFor(staff.id, date)}
                    className="border-t border-border"
                  >
                    <td className="px-4 py-2 font-bold">
                      {new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">
                      {day}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={value.work_days}
                        onChange={(event) =>
                          update(date, {
                            work_days: Number(event.target.value),
                          })
                        }
                        className="h-9 w-28 rounded-lg border border-border px-2"
                      >
                        <option value={0}>0</option>
                        <option value={0.5}>0,5 công</option>
                        <option value={1}>1 công</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={value.overtime_hours || ""}
                        onChange={(event) =>
                          update(date, {
                            overtime_hours: Number(event.target.value) || 0,
                          })
                        }
                        className="h-9 w-28 rounded-lg border border-border px-3"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={value.note}
                        onChange={(event) =>
                          update(date, { note: event.target.value })
                        }
                        placeholder="Nghỉ phép, công tác..."
                        className="h-9 w-full min-w-56 rounded-lg border border-border px-3"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-lg border border-border px-4 text-sm font-bold"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}Lưu bảng
            công
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function State({ loading, text }: { loading?: boolean; text: string }) {
  return (
    <div className="flex h-60 flex-col items-center justify-center text-sm text-muted-foreground">
      {loading ? (
        <Loader2 size={22} className="animate-spin" />
      ) : (
        <CalendarDays size={24} />
      )}
      <p className="mt-2">{text}</p>
    </div>
  );
}
