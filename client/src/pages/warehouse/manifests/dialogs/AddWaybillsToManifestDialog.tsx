import { Loader2, Plus, Search, X } from "lucide-react";
import type { AddWaybillsFormState, ManifestWaybill } from "../types";
interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  waybills: ManifestWaybill[];
  total: number;
  formState: AddWaybillsFormState;
  onChange: (patch: Partial<AddWaybillsFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}
const display = (v?: string | number | null, f = "—") =>
  v == null || v === "" ? f : String(v);
const num = (v?: string | number | null, s = "") =>
  v == null || v === "" ? "—" : `${Number(v).toLocaleString("vi-VN")}${s}`;
export default function AddWaybillsToManifestDialog({
  isOpen,
  isClosing,
  isLoading,
  isSubmitting,
  waybills,
  total,
  formState,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  if (!isOpen) return null;
  const toggle = (id: string) =>
    onChange({
      selectedIds: formState.selectedIds.includes(id)
        ? formState.selectedIds.filter((x) => x !== id)
        : [...formState.selectedIds, id],
    });
  return (
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-[920px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border ${isClosing ? "dialog-slide-out" : "dialog-slide-in"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Thêm vận đơn
            </p>
            <h2 className="text-lg font-extrabold text-foreground">
              Chọn vận đơn IN_WAREHOUSE
            </h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={formState.keyword}
              onChange={(e) => onChange({ keyword: e.target.value, page: 1 })}
              placeholder="Tìm mã vận đơn, người gửi, người nhận..."
              className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground">
              <Loader2 className="animate-spin" size={18} />
              Đang tải vận đơn...
            </div>
          ) : (
            <>
              <table className="hidden md:table w-full min-w-[980px] text-left border-collapse">
                <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                  <tr>
                    {[
                      "Chọn",
                      "Mã vận đơn",
                      "Người gửi",
                      "Người nhận",
                      "TL",
                      "Kích thước",
                      "TL quy đổi",
                      "Thanh toán",
                      "Hub đi",
                      "Hub đến",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border-r border-border px-4 py-3 font-bold last:border-r-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waybills.map((w) => (
                    <tr key={w.id} className="border-b border-border">
                      <td className="border-r border-border px-4 py-3">
                        <input
                          type="checkbox"
                          checked={formState.selectedIds.includes(String(w.id))}
                          onChange={() => toggle(String(w.id))}
                        />
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px] font-bold text-primary">
                        {display(w.waybill_code)}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {display(w.sender_info)}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {display(w.receiver_info)}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px] font-bold">
                        {num(w.weight, " kg")}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {[w.length, w.width, w.height]
                          .map((v) => display(v, "0"))
                          .join(" × ")}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {num(w.volumetric_weight, " kg")}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {display(w.payment_type)}
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[13px]">
                        {display(w.origin_hub_id)}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {display(w.dest_hub_id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid gap-3 p-3 md:hidden">
                {waybills.map((w) => (
                  <article
                    key={w.id}
                    className="rounded-2xl border border-border bg-white p-4 shadow-sm"
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formState.selectedIds.includes(String(w.id))}
                        onChange={() => toggle(String(w.id))}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-primary">
                          {display(w.waybill_code)}
                        </div>
                        <div className="mt-2 grid gap-1 text-[13px] text-muted-foreground">
                          <span>
                            {display(w.sender_info)} →{" "}
                            {display(w.receiver_info)}
                          </span>
                          <span>
                            {num(w.weight, " kg")} · {display(w.payment_type)} ·
                            Hub {display(w.origin_hub_id)} →{" "}
                            {display(w.dest_hub_id)}
                          </span>
                        </div>
                      </div>
                    </label>
                  </article>
                ))}
              </div>
              {!waybills.length && (
                <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
                  <div className="max-w-md">
                    <p className="text-[13px] font-extrabold text-muted-foreground">
                      Không có vận đơn IN_WAREHOUSE phù hợp.
                    </p>
                    <p className="mt-2 text-[12px] font-medium leading-5 text-muted-foreground">
                      Vận đơn mới tạo đang ở trạng thái RECEIVED/Đã tạo đơn. Hãy
                      vào trang Tiếp nhận đơn tại kho để scan + upload ảnh, sau
                      đó vận đơn mới được thêm vào bảng kê.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 p-4">
          <p className="text-[12px] font-bold text-muted-foreground">
            Đã chọn {formState.selectedIds.length} · Tổng:{total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-10 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground"
            >
              Hủy
            </button>
            <button
              disabled={!formState.selectedIds.length || isSubmitting}
              onClick={onSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              Thêm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
