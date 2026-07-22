import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import type { CustomerFormState } from '../customerFormTypes';

interface Props {
  isOpen: boolean;
  isEdit: boolean;
  isSubmitting: boolean;
  error: string;
  form: CustomerFormState;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) => void;
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10';

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

export default function CustomerFormDialog({
  isOpen,
  isEdit,
  isSubmitting,
  error,
  form,
  onClose,
  onSubmit,
  onChange,
}: Props) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[720px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-4">
          <h2 className="text-[16px] font-extrabold text-foreground">{isEdit ? 'Sửa khách hàng' : 'Thêm khách hàng mới'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              <AlertTriangle size={15} />
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">Thông tin chính</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Mã KH" required>
                <input
                  value={form.code}
                  disabled={isEdit}
                  onChange={(e) => onChange('code', e.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="VD: AQUAN48"
                />
              </Field>
              <Field label="Tên KH" required>
                <input value={form.name} onChange={(e) => onChange('name', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Tên tắt">
                <input value={form.short_name} onChange={(e) => onChange('short_name', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Trạng thái">
                <select value={form.status} onChange={(e) => onChange('status', e.target.value)} className={inputClass}>
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="SUSPENDED">Tạm dừng</option>
                </select>
              </Field>
              <Field label="Tỉnh đến">
                <input
                  value={form.destination_province}
                  onChange={(e) => onChange('destination_province', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Chiết khấu %">
                <input
                  type="number"
                  min={0}
                  value={form.discount_percent}
                  onChange={(e) => onChange('discount_percent', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Địa chỉ gửi" className="sm:col-span-2">
                <input
                  value={form.address}
                  onChange={(e) => onChange('address', e.target.value)}
                  className={inputClass}
                  placeholder="Địa chỉ lấy/gửi hàng của khách hàng"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">Liên hệ khách hàng</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Điện thoại KH (di động)">
                <input value={form.mobile} onChange={(e) => onChange('mobile', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Điện thoại KH (bàn)">
                <input value={form.phone_landline} onChange={(e) => onChange('phone_landline', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={(e) => onChange('email', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Liên hệ">
                <input value={form.contact_person} onChange={(e) => onChange('contact_person', e.target.value)} className={inputClass} />
              </Field>
              <Field label="NV quản lý">
                <input value={form.manager_name} onChange={(e) => onChange('manager_name', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Bảng giá">
                <input value={form.price_table} onChange={(e) => onChange('price_table', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Giao nhận">
                <input value={form.delivery_handler} onChange={(e) => onChange('delivery_handler', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">Kho nhận Hà Nội</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Người nhận HAN">
                <input value={form.receiver_han} onChange={(e) => onChange('receiver_han', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Điện thoại nhận HAN">
                <input value={form.phone_han} onChange={(e) => onChange('phone_han', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Địa chỉ kho nhận HAN" className="sm:col-span-2">
                <input value={form.address_han} onChange={(e) => onChange('address_han', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-primary">Kho nhận Hồ Chí Minh</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Người nhận HCM">
                <input value={form.receiver_hcm} onChange={(e) => onChange('receiver_hcm', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Điện thoại nhận HCM">
                <input value={form.phone_hcm} onChange={(e) => onChange('phone_hcm', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Địa chỉ kho nhận HCM" className="sm:col-span-2">
                <input value={form.address_hcm} onChange={(e) => onChange('address_hcm', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">Kho nhận Đà Nẵng (dữ liệu cũ)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Người nhận">
                <input value={form.receiver_dng} onChange={(e) => onChange('receiver_dng', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Điện thoại nhận">
                <input value={form.phone_dng} onChange={(e) => onChange('phone_dng', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Địa chỉ kho nhận DNG" className="sm:col-span-2">
                <input value={form.address_dng} onChange={(e) => onChange('address_dng', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">Khác</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Khu vực">
                <input value={form.region} onChange={(e) => onChange('region', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Công nợ">
                <input value={form.credit_type} onChange={(e) => onChange('credit_type', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Mã CT">
                <input value={form.contract_code} onChange={(e) => onChange('contract_code', e.target.value)} className={inputClass} />
              </Field>
              <Field label="MST">
                <input value={form.tax_id} onChange={(e) => onChange('tax_id', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white p-4">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-60">
            Hủy
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Lưu
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
