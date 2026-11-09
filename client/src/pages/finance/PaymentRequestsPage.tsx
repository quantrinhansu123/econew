import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";
import { getStoredAuthUser } from "../../lib/authUser";
import {
  defaultExpenseCategoryNames,
  loadExpenseCategoryNames,
} from "../../lib/expenseCategories";
import {
  formatAmountInput,
  formatMoney,
  parseAmountInput,
} from "../../lib/formatMoney";
import {
  ReceiptImageLinks,
  ReceiptImagePicker,
} from "../../components/finance/ReceiptImagePicker";
import { SearchableSelect } from "../../components/ui/SearchableSelect";

export interface PaymentRequestItem {
  id: string;
  request_code: string;
  request_date: string;
  department_name?: string | null;
  requester_id?: string | null;
  requester_name: string;
  beneficiary?: string | null;
  amount: number;
  content: string;
  note?: string | null;
  cost_category?: string | null;
  fund_id?: string | null;
  fund_code?: string | null;
  fund_name?: string | null;
  hub_id?: string | null;
  hub_code?: string | null;
  hub_name?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  attachment_url?: string | null;
  status: "PENDING" | "ACCOUNTANT_APPROVED" | "APPROVED" | "REJECTED";
  accountant_approved_by_name?: string | null;
  accountant_approved_at?: string | null;
  director_approved_by_name?: string | null;
  director_approved_at?: string | null;
  rejected_by_name?: string | null;
  rejected_reason?: string | null;
  cash_journal_entry_id?: string | null;
  created_at?: string;
}

interface CashFundOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
  is_active?: boolean;
  balance_amount?: number | string | null;
}

interface HubOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

interface VendorOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(
    value.length <= 10 ? `${value.slice(0, 10)}T00:00:00` : value,
  );
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("vi-VN");
};

const fundLabel = (fund: CashFundOption) =>
  [fund.code, fund.name].filter(Boolean).join(" - ") || `Quỹ #${fund.id}`;
const hubLabel = (hub: HubOption) =>
  [hub.code, hub.name].filter(Boolean).join(" - ") || `HUB #${hub.id}`;
const vendorLabel = (vendor: VendorOption) =>
  [vendor.code, vendor.name].filter(Boolean).join(" - ") || `NCC #${vendor.id}`;

const STATUS_META: Record<
  PaymentRequestItem["status"],
  { label: string; badgeClass: string }
> = {
  PENDING: {
    label: "Chờ duyệt",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  ACCOUNTANT_APPROVED: {
    label: "KT đã duyệt · Chờ GĐ",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
  },
  APPROVED: {
    label: "Đã duyệt · Đã ghi Sổ nhật ký",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REJECTED: {
    label: "Từ chối",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

export default function PaymentRequestsPage() {
  const navigate = useNavigate();
  const currentUser = getStoredAuthUser();
  const roleMask = Number(currentUser?.role_mask || 0);
  const canApprove = (roleMask & (16 | 32 | 64)) !== 0;

  const [items, setItems] = useState<PaymentRequestItem[]>([]);
  const [funds, setFunds] = useState<CashFundOption[]>([]);
  const [hubs, setHubs] = useState<HubOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>(
    defaultExpenseCategoryNames,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const [colFilters, setColFilters] = useState({
    code: "",
    date: "",
    department: "",
    hubVendor: "",
    beneficiary: "",
    content: "",
    category: "",
    fund: "",
    amount: "",
    status: "",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [approvingItem, setApprovingItem] =
    useState<PaymentRequestItem | null>(null);
  const [rejectingItem, setRejectingItem] =
    useState<PaymentRequestItem | null>(null);

  const loadLookups = useCallback(async () => {
    const [fundRes, hubRes, vendorRes, categoryRes] = await Promise.allSettled([
      apiRequest<CashFundOption[]>("/finance/cash-funds"),
      apiRequest<HubOption[]>("/hubs"),
      apiRequest<VendorOption[]>("/vendors"),
      loadExpenseCategoryNames(),
    ]);
    if (fundRes.status === "fulfilled" && Array.isArray(fundRes.value)) {
      setFunds(fundRes.value.filter((f) => f.is_active !== false));
    }
    if (hubRes.status === "fulfilled" && Array.isArray(hubRes.value)) {
      setHubs(hubRes.value);
    }
    if (vendorRes.status === "fulfilled" && Array.isArray(vendorRes.value)) {
      setVendors(vendorRes.value);
    }
    if (
      categoryRes.status === "fulfilled" &&
      Array.isArray(categoryRes.value) &&
      categoryRes.value.length > 0
    ) {
      setExpenseCategories(categoryRes.value);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (searchQ.trim()) params.set("q", searchQ.trim());
      const query = params.toString();
      const data = await apiRequest<PaymentRequestItem[]>(
        `/finance/payment-requests${query ? `?${query}` : ""}`,
      );
      setItems(Array.isArray(data) ? data : []);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không tải được danh sách đề nghị thanh toán.",
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, searchQ]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const filteredItems = useMemo(() => {
    const match = (val: string | number | null | undefined, kw: string) =>
      !kw.trim() ||
      String(val ?? "")
        .toLowerCase()
        .includes(kw.trim().toLowerCase());

    return items.filter((item) => {
      const hubText = [item.hub_code, item.hub_name].filter(Boolean).join(" ");
      const vendorText = [item.vendor_code, item.vendor_name]
        .filter(Boolean)
        .join(" ");
      const fundText = [item.fund_code, item.fund_name]
        .filter(Boolean)
        .join(" ");
      const statusText = STATUS_META[item.status]?.label || item.status;

      return (
        match(item.request_code, colFilters.code) &&
        match(
          `${formatDate(item.request_date)} ${item.request_date}`,
          colFilters.date,
        ) &&
        match(
          `${item.department_name || ""} ${item.requester_name || ""}`,
          colFilters.department,
        ) &&
        match(`${hubText} ${vendorText}`, colFilters.hubVendor) &&
        match(item.beneficiary, colFilters.beneficiary) &&
        match(`${item.content} ${item.note || ""}`, colFilters.content) &&
        match(item.cost_category, colFilters.category) &&
        match(fundText, colFilters.fund) &&
        match(
          `${item.amount} ${formatMoney(item.amount)}`,
          colFilters.amount,
        ) &&
        match(statusText, colFilters.status)
      );
    });
  }, [items, colFilters]);

  const summary = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const amt = Number(item.amount || 0);
        acc.total += amt;
        if (
          item.status === "PENDING" ||
          item.status === "ACCOUNTANT_APPROVED"
        ) {
          acc.pending += amt;
          acc.pendingCount += 1;
        } else if (item.status === "APPROVED") {
          acc.approved += amt;
          acc.approvedCount += 1;
        } else if (item.status === "REJECTED") {
          acc.rejected += amt;
          acc.rejectedCount += 1;
        }
        return acc;
      },
      {
        total: 0,
        pending: 0,
        pendingCount: 0,
        approved: 0,
        approvedCount: 0,
        rejected: 0,
        rejectedCount: 0,
      },
    );
  }, [filteredItems]);

  const handleDelete = async (item: PaymentRequestItem) => {
    if (
      !window.confirm(
        `Xóa đề nghị thanh toán ${item.request_code} (${formatMoney(item.amount)})?`,
      )
    ) {
      return;
    }
    setError("");
    setSuccessMsg("");
    try {
      await apiRequest(`/finance/payment-requests/${item.id}`, {
        method: "DELETE",
      });
      setSuccessMsg(`Đã xóa đề nghị ${item.request_code}.`);
      await loadRequests();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không xóa được đề nghị thanh toán.",
      );
    }
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredItems.map((item, idx) => ({
      STT: idx + 1,
      "Mã đề nghị": item.request_code,
      "Ngày đề nghị": formatDate(item.request_date),
      "Bộ phận": item.department_name || "",
      "Người lập": item.requester_name,
      "Đối tượng nhận": item.beneficiary || "",
      "Bưu cục (HUB)":
        [item.hub_code, item.hub_name].filter(Boolean).join(" - ") || "",
      "Nhà cung cấp":
        [item.vendor_code, item.vendor_name].filter(Boolean).join(" - ") || "",
      "Nội dung": item.content,
      "Ghi chú": item.note || "",
      "Số tiền (VNĐ)": Number(item.amount || 0),
      "Mục hạch toán": item.cost_category || "",
      "Sổ quỹ chi":
        [item.fund_code, item.fund_name].filter(Boolean).join(" - ") || "",
      "Trạng thái": STATUS_META[item.status]?.label || item.status,
      "Kế toán duyệt": item.accountant_approved_by_name || "",
      "Giám đốc duyệt": item.director_approved_by_name || "",
      "Mã bút toán Sổ nhật ký": item.cash_journal_entry_id || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "DeNghiThanhToan");
    XLSX.writeFile(
      book,
      `de-nghi-thanh-toan-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-foreground">
              Đề nghị thanh toán & Duyệt chi hạch toán
            </h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              Tự động chuyển sang Sổ nhật ký chung khi duyệt
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            Các bộ phận lập đề nghị thanh toán → Kế toán & Giám đốc chọn{" "}
            <strong>Mục hạch toán</strong> + <strong>Sổ quỹ chi</strong> để
            duyệt → Tự động nhảy sang phần <strong>Chi</strong> của Sổ nhật ký
            thu chi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/finance/cash-journal")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-primary hover:bg-blue-100"
          >
            <ExternalLink size={14} />
            Mở Sổ nhật ký thu chi
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={!filteredItems.length}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Download size={14} />
            Dow Excel ({filteredItems.length})
          </button>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-bold text-slate-700 hover:bg-muted"
          >
            <RefreshCw size={14} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={15} />
            Lập đề nghị thanh toán
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-500">
            Tổng đề nghị ({filteredItems.length} phiếu)
          </p>
          <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">
            {formatMoney(summary.total)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-amber-700">
            Chờ duyệt ({summary.pendingCount} phiếu)
          </p>
          <p className="mt-1 text-lg font-black text-amber-800 tabular-nums">
            {formatMoney(summary.pending)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-emerald-700">
            Đã duyệt & Ghi sổ ({summary.approvedCount} phiếu)
          </p>
          <p className="mt-1 text-lg font-black text-emerald-800 tabular-nums">
            {formatMoney(summary.approved)}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-red-700">
            Từ chối ({summary.rejectedCount} phiếu)
          </p>
          <p className="mt-1 text-lg font-black text-red-700 tabular-nums">
            {formatMoney(summary.rejected)}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-2 rounded-xl border border-border bg-white p-3 shadow-sm sm:grid-cols-5">
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Tìm mã đề nghị, bộ phận, nội dung, người nhận..."
          className="h-9 rounded-lg border border-border px-3 text-xs font-medium outline-none focus:border-primary sm:col-span-2"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Từ ngày"
          className="h-9 rounded-lg border border-border px-2.5 text-xs font-medium outline-none focus:border-primary"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Đến ngày"
          className="h-9 rounded-lg border border-border px-2.5 text-xs font-medium outline-none focus:border-primary"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-border px-2.5 text-xs font-bold outline-none focus:border-primary"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="ACCOUNTANT_APPROVED">KT đã duyệt (Chờ GĐ)</option>
          <option value="APPROVED">Đã duyệt & Đã ghi Sổ nhật ký</option>
          <option value="REJECTED">Đã từ chối</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700">
          <CheckCircle2 size={15} />
          {successMsg}
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Đang tải đề nghị thanh toán...
          </div>
        ) : (
          <table className="w-full min-w-[1450px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Mã ĐN</th>
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">Bộ phận / Người lập</th>
                <th className="px-3 py-2">HUB / NCC</th>
                <th className="px-3 py-2">Đối tượng nhận</th>
                <th className="px-3 py-2">Nội dung đề nghị</th>
                <th className="px-3 py-2">Chứng từ</th>
                <th className="px-3 py-2">Mục hạch toán</th>
                <th className="px-3 py-2">Sổ quỹ chi</th>
                <th className="px-3 py-2 text-right">Số tiền</th>
                <th className="px-3 py-2">Trạng thái duyệt</th>
                <th className="px-3 py-2 text-right">Thao tác</th>
              </tr>
              {/* Thanh lọc tiêu đề cột */}
              <tr className="border-b border-border bg-slate-50/90 normal-case">
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.code}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, code: e.target.value }))
                    }
                    placeholder="Lọc mã..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.date}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, date: e.target.value }))
                    }
                    placeholder="Lọc ngày..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.department}
                    onChange={(e) =>
                      setColFilters((p) => ({
                        ...p,
                        department: e.target.value,
                      }))
                    }
                    placeholder="Lọc bộ phận..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.hubVendor}
                    onChange={(e) =>
                      setColFilters((p) => ({
                        ...p,
                        hubVendor: e.target.value,
                      }))
                    }
                    placeholder="Lọc HUB/NCC..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.beneficiary}
                    onChange={(e) =>
                      setColFilters((p) => ({
                        ...p,
                        beneficiary: e.target.value,
                      }))
                    }
                    placeholder="Lọc người nhận..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.content}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, content: e.target.value }))
                    }
                    placeholder="Lọc nội dung..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5 text-center text-[10px] text-slate-400">
                  —
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.category}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, category: e.target.value }))
                    }
                    placeholder="Lọc mục HT..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.fund}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, fund: e.target.value }))
                    }
                    placeholder="Lọc sổ quỹ..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.amount}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, amount: e.target.value }))
                    }
                    placeholder="Lọc tiền..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-right text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={colFilters.status}
                    onChange={(e) =>
                      setColFilters((p) => ({ ...p, status: e.target.value }))
                    }
                    placeholder="Lọc TT..."
                    className="h-7 w-full rounded border border-border bg-white px-2 text-[11px] font-medium outline-none focus:border-primary"
                  />
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Chưa có đề nghị thanh toán nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.PENDING;
                  const isFinal =
                    item.status === "APPROVED" || item.status === "REJECTED";
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-blue-50/30"
                    >
                      <td className="px-3 py-2.5 font-extrabold text-primary">
                        {item.request_code}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700">
                        {formatDate(item.request_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-slate-900">
                          {item.department_name || "Bộ phận chung"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Lập bởi: {item.requester_name}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-800">
                          {[item.hub_code, item.hub_name]
                            .filter(Boolean)
                            .join(" - ") || "—"}
                        </p>
                        {item.vendor_name && (
                          <p className="text-[11px] text-purple-700">
                            NCC:{" "}
                            {[item.vendor_code, item.vendor_name]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        {item.beneficiary || "—"}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <p className="font-semibold text-slate-900">
                          {item.content}
                        </p>
                        {item.note && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {item.note}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {item.attachment_url ? (
                          <ReceiptImageLinks
                            images={item.attachment_url
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">
                        {item.cost_category || (
                          <span className="italic text-slate-400">
                            Chọn khi duyệt
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-800">
                        {[item.fund_code, item.fund_name]
                          .filter(Boolean)
                          .join(" - ") || (
                          <span className="italic text-slate-400">
                            Chọn khi duyệt
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-black text-rose-700 tabular-nums">
                        {formatMoney(item.amount)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
                        >
                          {item.status === "APPROVED" ? (
                            <CheckCircle2 size={12} />
                          ) : item.status === "REJECTED" ? (
                            <XCircle size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          {meta.label}
                        </span>
                        {item.accountant_approved_by_name && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            KT: {item.accountant_approved_by_name}
                          </p>
                        )}
                        {item.director_approved_by_name && (
                          <p className="text-[10px] text-emerald-700">
                            Duyệt chi: {item.director_approved_by_name}
                          </p>
                        )}
                        {item.rejected_reason && (
                          <p className="mt-0.5 text-[10px] font-semibold text-red-600">
                            Lý do: {item.rejected_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canApprove && !isFinal && (
                            <>
                              <button
                                type="button"
                                onClick={() => setApprovingItem(item)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700"
                                title="Duyệt và chọn mục hạch toán để chuyển sang Sổ nhật ký chung"
                              >
                                <ClipboardCheck size={13} />
                                Duyệt & Hạch toán
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingItem(item)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-[11px] font-bold text-red-700 hover:bg-red-100"
                                title="Từ chối đề nghị"
                              >
                                Từ chối
                              </button>
                            </>
                          )}
                          {item.status !== "APPROVED" && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(item)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                              title="Xóa đề nghị"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {createOpen && (
        <CreatePaymentRequestModal
          hubs={hubs}
          vendors={vendors}
          expenseCategories={expenseCategories}
          onClose={() => setCreateOpen(false)}
          onCreated={async (code) => {
            setCreateOpen(false);
            setSuccessMsg(
              `Đã lập đề nghị thanh toán ${code}. Chờ Kế toán / Giám đốc duyệt.`,
            );
            await loadRequests();
          }}
        />
      )}

      {/* Approve & Transfer to Cash Journal Modal */}
      {approvingItem && (
        <ApprovePaymentRequestModal
          item={approvingItem}
          funds={funds}
          hubs={hubs}
          vendors={vendors}
          expenseCategories={expenseCategories}
          onClose={() => setApprovingItem(null)}
          onApproved={async (msg) => {
            setApprovingItem(null);
            setSuccessMsg(msg);
            await Promise.all([loadRequests(), loadLookups()]);
          }}
        />
      )}

      {/* Reject Modal */}
      {rejectingItem && (
        <RejectPaymentRequestModal
          item={rejectingItem}
          onClose={() => setRejectingItem(null)}
          onRejected={async () => {
            setRejectingItem(null);
            setSuccessMsg(`Đã từ chối đề nghị ${rejectingItem.request_code}.`);
            await loadRequests();
          }}
        />
      )}
    </div>
  );
}

function CreatePaymentRequestModal({
  hubs,
  vendors,
  expenseCategories,
  onClose,
  onCreated,
}: {
  hubs: HubOption[];
  vendors: VendorOption[];
  expenseCategories: string[];
  onClose: () => void;
  onCreated: (code: string) => Promise<void>;
}) {
  const [requestDate, setRequestDate] = useState(todayIso());
  const [departmentName, setDepartmentName] = useState("Vận hành kho");
  const [beneficiary, setBeneficiary] = useState("");
  const [hubId, setHubId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [costCategory, setCostCategory] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const amount = parseAmountInput(amountInput);
    if (amount <= 0) {
      setError("Số tiền đề nghị thanh toán phải lớn hơn 0.");
      return;
    }
    if (!content.trim()) {
      setError("Vui lòng nhập nội dung đề nghị thanh toán.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await apiRequest<PaymentRequestItem>(
        "/finance/payment-requests",
        {
          method: "POST",
          body: {
            request_date: requestDate,
            department_name: departmentName.trim() || null,
            beneficiary: beneficiary.trim() || null,
            hub_id: hubId || null,
            vendor_id: vendorId || null,
            cost_category: costCategory.trim() || null,
            amount,
            content: content.trim(),
            note: note.trim() || null,
            attachment_url: attachmentUrl || null,
          },
        },
      );
      await onCreated(created.request_code || "mới");
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không tạo được đề nghị thanh toán.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Bộ phận lập phiếu đề nghị
            </p>
            <h2 className="text-base font-black text-foreground">
              Lập Đề nghị thanh toán mới
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold text-slate-700">
              Ngày đề nghị *
              <input
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Bộ phận lập đề nghị *
              <input
                list="eco-department-suggestions"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                placeholder="VD: Vận hành kho, Điều phối xe..."
                className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold"
              />
              <datalist id="eco-department-suggestions">
                <option value="Vận hành kho" />
                <option value="Điều phối xe" />
                <option value="Giao nhận chặng cuối" />
                <option value="Hành chính nhân sự" />
                <option value="Kế toán" />
                <option value="Kinh doanh & CSKH" />
                <option value="Bưu cục HAN" />
                <option value="Bưu cục HCM" />
              </datalist>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Số tiền đề nghị (VNĐ) *
              <input
                type="text"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) =>
                  setAmountInput(formatAmountInput(e.target.value))
                }
                placeholder="0"
                className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-right text-sm font-black text-rose-700"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold text-slate-700">
              Đối tượng / Người thụ hưởng
              <input
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                placeholder="Tên cá nhân / đơn vị nhận tiền..."
                className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Bưu cục (HUB)
              <select
                value={hubId}
                onChange={(e) => setHubId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-xs font-semibold"
              >
                <option value="">— Chọn HUB (nếu có) —</option>
                {hubs.map((h) => (
                  <option key={h.id} value={String(h.id)}>
                    {hubLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Nhà cung cấp (NCC)
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-xs font-semibold"
              >
                <option value="">— Không chọn / Nội bộ —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {vendorLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Mục hạch toán đề xuất (Kế toán có thể chọn/đổi lại khi duyệt)
            </label>
            <SearchableSelect
              value={costCategory}
              onValueChange={setCostCategory}
              options={[
                { value: "", label: "— Để Kế toán chọn khi duyệt —" },
                ...expenseCategories.map((c) => ({ value: c, label: c })),
              ]}
              placeholder="Chọn loại chi phí đề xuất..."
            />
          </div>

          <label className="block text-xs font-bold text-slate-700">
            Nội dung đề nghị thanh toán *
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="VD: Đề nghị thanh toán tiền mua vật tư băng keo kho HAN..."
              className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold"
            />
          </label>

          <label className="block text-xs font-bold text-slate-700">
            Ghi chú / Thông tin số tài khoản nhận tiền
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Số TK ngân hàng, tên chủ TK hoặc ghi chú chứng từ..."
              className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-medium"
            />
          </label>

          <div>
            <p className="mb-1 text-xs font-bold text-slate-700">
              Ảnh hóa đơn / Chứng từ đính kèm
            </p>
            <ReceiptImagePicker
              images={
                attachmentUrl
                  ? attachmentUrl
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : []
              }
              onChange={(urls) => setAttachmentUrl(urls.join(","))}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-bold text-slate-700"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Gửi đề nghị thanh toán
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApprovePaymentRequestModal({
  item,
  funds,
  hubs,
  vendors,
  expenseCategories,
  onClose,
  onApproved,
}: {
  item: PaymentRequestItem;
  funds: CashFundOption[];
  hubs: HubOption[];
  vendors: VendorOption[];
  expenseCategories: string[];
  onClose: () => void;
  onApproved: (msg: string) => Promise<void>;
}) {
  const [fundId, setFundId] = useState(item.fund_id ? String(item.fund_id) : "");
  const [costCategory, setCostCategory] = useState(
    item.cost_category || expenseCategories[0] || "",
  );
  const [hubId, setHubId] = useState(item.hub_id ? String(item.hub_id) : "");
  const [vendorId, setVendorId] = useState(
    item.vendor_id ? String(item.vendor_id) : "",
  );
  const [note, setNote] = useState(item.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submitApprove = async (finalize: boolean) => {
    if (finalize && !fundId) {
      setError("Vui lòng chọn Sổ quỹ chi tiền để ghi vào Sổ nhật ký chung.");
      return;
    }
    if (finalize && !costCategory.trim()) {
      setError("Vui lòng chọn Mục hạch toán (Loại chi phí) tương ứng.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/finance/payment-requests/${item.id}/approve`, {
        method: "PATCH",
        body: {
          fund_id: fundId || null,
          cost_category: costCategory.trim() || null,
          hub_id: hubId || null,
          vendor_id: vendorId || null,
          note: note.trim() || null,
          finalize,
        },
      });
      await onApproved(
        finalize
          ? `Đã duyệt đề nghị ${item.request_code} và tự động tạo phiếu CHI trong Sổ nhật ký thu chi!`
          : `Kế toán đã xác nhận đề nghị ${item.request_code} (Chờ Giám đốc duyệt chi).`,
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không duyệt được đề nghị thanh toán.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-emerald-50/70 px-5 py-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Kế toán & Giám đốc duyệt chi
            </p>
            <h2 className="text-base font-black text-slate-900">
              Duyệt {item.request_code} → Chuyển tiếp sang Chi Sổ nhật ký chung
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">
                Bộ phận: {item.department_name || "—"} · Người lập:{" "}
                {item.requester_name}
              </span>
              <span className="text-base font-black text-rose-700 tabular-nums">
                {formatMoney(item.amount)}
              </span>
            </div>
            <p className="mt-1 font-bold text-slate-900">
              Nội dung: {item.content}
            </p>
            {item.beneficiary && (
              <p className="mt-0.5 text-slate-600">
                Người thụ hưởng: <strong>{item.beneficiary}</strong>
              </p>
            )}
          </div>

          <label className="block text-xs font-bold text-slate-800">
            1. Chọn Sổ quỹ xuất chi * (Để trừ đúng số dư thực tế của quỹ)
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-xs font-bold text-primary"
            >
              <option value="">— Chọn sổ quỹ chi tiền —</option>
              {funds.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {fundLabel(f)} (Dư thực tế:{" "}
                  {formatMoney(Number(f.balance_amount || 0))})
                </option>
              ))}
            </select>
          </label>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-800">
              2. Chọn Mục hạch toán tương ứng (Loại chi phí trên Sổ nhật ký
              chung) *
            </label>
            <SearchableSelect
              value={costCategory}
              onValueChange={setCostCategory}
              options={expenseCategories.map((c) => ({ value: c, label: c }))}
              placeholder="Chọn mục hạch toán chi phí..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">
              Bưu cục hạch toán (HUB)
              <select
                value={hubId}
                onChange={(e) => setHubId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-xs font-semibold"
              >
                <option value="">— Chọn HUB —</option>
                {hubs.map((h) => (
                  <option key={h.id} value={String(h.id)}>
                    {hubLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Nhà cung cấp (NCC)
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border px-2.5 text-xs font-semibold"
              >
                <option value="">— Không chọn / Nội bộ —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {vendorLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-bold text-slate-700">
            Ghi chú hạch toán
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú kèm theo phiếu chi..."
              className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-medium"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-border bg-white px-4 text-xs font-bold text-slate-700"
          >
            Đóng
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {item.status === "PENDING" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitApprove(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 text-xs font-bold text-primary hover:bg-blue-100 disabled:opacity-60"
              >
                Kế toán xác nhận (Chờ GĐ)
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitApprove(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              Duyệt & Ghi vào Chi Sổ nhật ký chung
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RejectPaymentRequestModal({
  item,
  onClose,
  onRejected,
}: {
  item: PaymentRequestItem;
  onClose: () => void;
  onRejected: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/finance/payment-requests/${item.id}/reject`, {
        method: "PATCH",
        body: { rejected_reason: reason.trim() || "Không duyệt" },
      });
      await onRejected();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Không từ chối được đề nghị.",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-2xl">
        <h3 className="text-base font-black text-red-700">
          Từ chối đề nghị {item.request_code}
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          {item.content} ({formatMoney(item.amount)})
        </p>
        <label className="mt-3 block text-xs font-bold text-slate-700">
          Lý do từ chối
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do từ chối..."
            className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-xs font-medium"
          />
        </label>
        {error && (
          <p className="mt-2 text-xs font-bold text-red-600">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-border px-4 text-xs font-bold"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-xs font-bold text-white"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Xác nhận từ chối
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

