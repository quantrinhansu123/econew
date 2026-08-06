import { createPortal } from 'react-dom';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, FileText, Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { ApiError } from '../../../../lib/api';
import { CUSTOMER_PRICE_LIST_ACCEPT, uploadCustomerPriceList } from '../../../../lib/uploadImage';
import type { CustomerFormState } from '../customerFormTypes';
import {
  DICH_VU_OPTIONS,
  DON_GIA_DON_VI_OPTIONS,
  GIAO_HANG_OPTIONS,
  PHUONG_THUC_OPTIONS,
} from '../../orders/orderFormData';
import { WAYBILL_SPECIAL_GOODS_OPTIONS } from '../../../../lib/waybillSpecialGoods';
import { VIETNAM_PROVINCES_63 } from '../../../../lib/vietnamProvince';

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
  const [isPriceFileUploading, setIsPriceFileUploading] = useState(false);
  const [priceFileError, setPriceFileError] = useState('');
  if (!isOpen) return null;

  const handlePriceFile = async (file?: File) => {
    if (!file || isPriceFileUploading) return;
    if (!form.code.trim()) {
      setPriceFileError('Nhập Mã KH trước khi tải bảng giá.');
      return;
    }
    setIsPriceFileUploading(true);
    setPriceFileError('');
    try {
      const url = await uploadCustomerPriceList(file, form.code);
      onChange('price_list_url', url);
      onChange('price_list_name', file.name);
    } catch (uploadError) {
      setPriceFileError(uploadError instanceof ApiError ? uploadError.message : 'Không upload được file bảng giá.');
    } finally {
      setIsPriceFileUploading(false);
    }
  };

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
              <div className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  File bảng giá đính kèm
                </span>
                {form.price_list_url ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                    <FileText size={18} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700">
                      {form.price_list_name || 'Bảng giá khách hàng'}
                    </span>
                    <button
                      type="button"
                      onClick={() => window.open(form.price_list_url, '_blank', 'noopener,noreferrer')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-bold text-primary hover:bg-blue-50"
                    >
                      <ExternalLink size={14} /> Xem
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange('price_list_url', '');
                        onChange('price_list_name', '');
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Bỏ file
                    </button>
                  </div>
                ) : (
                  <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 px-3 text-[13px] font-bold text-primary hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                    {isPriceFileUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {isPriceFileUploading ? 'Đang tải bảng giá...' : 'Chọn ảnh / PDF'}
                    <input
                      type="file"
                      accept={CUSTOMER_PRICE_LIST_ACCEPT}
                      disabled={isPriceFileUploading || isSubmitting || !form.code.trim()}
                      className="hidden"
                      onChange={(event) => {
                        void handlePriceFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
                {priceFileError && <p className="mt-1.5 text-[12px] font-bold text-red-600">{priceFileError}</p>}
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {!form.code.trim()
                    ? 'Nhập Mã KH trước khi chọn file.'
                    : `Lưu theo mã ${form.code.trim().toUpperCase()}, tối đa 10 MB. Chỉ dùng để xem; không tự thay đổi đơn giá.`}
                </p>
              </div>
              <Field label="Giao nhận">
                <input value={form.delivery_handler} onChange={(e) => onChange('delivery_handler', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-emerald-700">Mặc định khi tạo bill</p>
            <p className="mb-3 text-[12px] font-medium text-muted-foreground">Khi chọn mã khách, các giá trị này tự điền và vẫn có thể sửa riêng trên từng bill.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tỉnh đến mặc định">
                <select value={form.destination_province} onChange={(e) => onChange('destination_province', e.target.value)} className={inputClass}>
                  <option value="">Chưa đặt mặc định</option>
                  {VIETNAM_PROVINCES_63.map((province) => <option key={province} value={province}>{province}</option>)}
                </select>
              </Field>
              <Field label="Dịch vụ mặc định">
                <select value={form.default_service} onChange={(e) => onChange('default_service', e.target.value)} className={inputClass}>
                  <option value="">Mặc định hệ thống</option>
                  {DICH_VU_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Giao hàng mặc định">
                <select value={form.default_delivery_method} onChange={(e) => onChange('default_delivery_method', e.target.value)} className={inputClass}>
                  <option value="">Mặc định hệ thống</option>
                  {GIAO_HANG_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Tính cước theo">
                <select value={form.default_billing_unit} onChange={(e) => onChange('default_billing_unit', e.target.value)} className={inputClass}>
                  <option value="">Mặc định hệ thống</option>
                  {DON_GIA_DON_VI_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Phương thức thanh toán">
                <select value={form.default_payment_method} onChange={(e) => onChange('default_payment_method', e.target.value)} className={inputClass}>
                  <option value="">Mặc định hệ thống</option>
                  {PHUONG_THUC_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tính chất hàng hóa thường dùng</p>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-2">
                  {WAYBILL_SPECIAL_GOODS_OPTIONS.map((option) => {
                    const checked = form.default_special_goods.includes(option.value);
                    return (
                      <label key={option.value} className="flex min-h-7 cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onChange(
                            'default_special_goods',
                            checked
                              ? form.default_special_goods.filter((value) => value !== option.value)
                              : [...form.default_special_goods, option.value],
                          )}
                          className="h-4 w-4 rounded border-emerald-400 accent-emerald-600"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>
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
          <button type="button" onClick={onClose} disabled={isSubmitting || isPriceFileUploading} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-60">
            Hủy
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || isPriceFileUploading}
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
