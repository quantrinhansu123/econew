import { createPortal } from 'react-dom';
import { useState, type ReactNode } from 'react';
import { Banknote, Briefcase, Building2, CreditCard, Image, Landmark, Loader2, Mail, MapPinned, Phone, Save, Tag, Trash2, Upload, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError } from '../../../../lib/api';
import { formatAmountInput } from '../../../../lib/formatMoney';
import { IMAGE_UPLOAD_ACCEPT, uploadVendorQrImage } from '../../../../lib/uploadImage';
import { CreatableSearchableSelect } from '../../../../components/ui/CreatableSearchableSelect';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import ProvinceMultiSelect from '../components/ProvinceMultiSelect';
import {
  contractTypeFormOptions,
  provinceFormOptions,
  serviceTypeFormOptions,
} from '../data';
import type { VendorFormState } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  fields: string[];
  formState: VendorFormState;
  error?: string;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (key: string, value: string) => void;
}

const inputClass =
  'w-full rounded-xl border border-border bg-muted/10 py-2 pl-10 pr-4 text-[13px] font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10';
const statusOptions = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];

export default function AddEditVendorDialog({
  isOpen,
  isClosing,
  isEditMode,
  isSubmitting,
  fields,
  formState,
  error,
  onClose,
  onSubmit,
  onChange,
}: Props) {
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrError, setQrError] = useState('');
  if (!isOpen && !isClosing) return null;
  const hasField = (field: string) => fields.includes(field);

  const uploadQr = async (file?: File) => {
    if (!file) return;
    setIsUploadingQr(true);
    setQrError('');
    try {
      const url = await uploadVendorQrImage(file, formState.code);
      onChange('qr_image_url', url);
    } catch (uploadError) {
      setQrError(uploadError instanceof ApiError ? uploadError.message : 'Không tải được ảnh QR NCC.');
    } finally {
      setIsUploadingQr(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative flex h-screen w-full max-w-[760px] flex-col overflow-hidden border-l border-border bg-[#f8fafc] shadow-2xl',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary">
              <Building2 size={18} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Nhà cung cấp (NCC)</p>
              <h2 className="text-lg font-bold text-foreground">{isEditMode ? 'Chỉnh sửa NCC' : 'Thêm NCC'}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className="space-y-5">
            <section className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary">
                <Building2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Nhà cung cấp vận tải</p>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {hasField('code') && (
                    <Field label="Mã NCC" icon={<Tag size={16} />}>
                      <input
                        value={formState.code || ''}
                        onChange={event => onChange('code', event.target.value.toUpperCase())}
                        className={inputClass}
                        placeholder="VD: NCC-HAN-01"
                      />
                    </Field>
                  )}
                  {hasField('name') && (
                    <Field label="Tên NCC" icon={<Building2 size={16} />}>
                      <input
                        value={formState.name || ''}
                        onChange={event => onChange('name', event.target.value)}
                        className={inputClass}
                        placeholder="Nhập tên nhà cung cấp"
                      />
                    </Field>
                  )}
                </div>
              </div>
            </section>

            <Section title="Thông tin liên hệ" icon={<User size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {hasField('contact_name') && (
                  <Field label="Người liên hệ" icon={<User size={16} />}>
                    <input
                      value={formState.contact_name || ''}
                      onChange={event => onChange('contact_name', event.target.value)}
                      className={inputClass}
                      placeholder="Tên người phụ trách"
                    />
                  </Field>
                )}
                {hasField('phone') && (
                  <Field label="Số điện thoại" icon={<Phone size={16} />}>
                    <input
                      value={formState.phone || ''}
                      onChange={event => onChange('phone', event.target.value)}
                      className={inputClass}
                      placeholder="Số điện thoại liên hệ"
                    />
                  </Field>
                )}
                {hasField('email') && (
                  <Field label="Email" icon={<Mail size={16} />}>
                    <input
                      type="email"
                      value={formState.email || ''}
                      onChange={event => onChange('email', event.target.value)}
                      className={inputClass}
                      placeholder="email@ncc.vn"
                    />
                  </Field>
                )}
              </div>
            </Section>

            <Section title="Thanh toán & công nợ" icon={<Banknote size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {hasField('opening_debt') && (
                  <Field label="Công nợ tồn đầu kỳ" icon={<Banknote size={16} />}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formState.opening_debt || ''}
                      onChange={event => onChange('opening_debt', formatAmountInput(event.target.value))}
                      className={`${inputClass} text-right font-extrabold tabular-nums`}
                      placeholder="0"
                    />
                  </Field>
                )}
                {hasField('bank_name') && (
                  <Field label="Ngân hàng nhận tiền" icon={<Landmark size={16} />}>
                    <input value={formState.bank_name || ''} onChange={event => onChange('bank_name', event.target.value)} className={inputClass} placeholder="Tên ngân hàng" />
                  </Field>
                )}
                {hasField('bank_account') && (
                  <Field label="Số tài khoản" icon={<CreditCard size={16} />}>
                    <input value={formState.bank_account || ''} onChange={event => onChange('bank_account', event.target.value)} className={inputClass} placeholder="Số tài khoản nhận tiền" />
                  </Field>
                )}
                {hasField('bank_account_holder') && (
                  <Field label="Chủ tài khoản" icon={<User size={16} />}>
                    <input value={formState.bank_account_holder || ''} onChange={event => onChange('bank_account_holder', event.target.value.toUpperCase())} className={inputClass} placeholder="Tên chủ tài khoản" />
                  </Field>
                )}
              </div>

              {hasField('qr_image_url') && (
                <div className="mt-4 rounded-xl border border-border bg-muted/5 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                      {formState.qr_image_url ? <img src={formState.qr_image_url} alt="QR nhận tiền NCC" className="h-full w-full object-contain" /> : <Image size={28} className="text-muted-foreground/50" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-foreground">Ảnh QR nhận tiền</p>
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">Ảnh này sẽ xuất hiện trên phiếu kê thanh toán NCC.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-[12px] font-bold text-white hover:bg-primary/90">
                          {isUploadingQr ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {isUploadingQr ? 'Đang tải...' : 'Chọn ảnh QR'}
                          <input type="file" accept={IMAGE_UPLOAD_ACCEPT} disabled={isUploadingQr} onChange={event => { void uploadQr(event.target.files?.[0]); event.currentTarget.value = ''; }} className="hidden" />
                        </label>
                        {formState.qr_image_url && (
                          <button type="button" onClick={() => onChange('qr_image_url', '')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-bold text-red-600 hover:bg-red-100">
                            <Trash2 size={14} />
                            Bỏ ảnh
                          </button>
                        )}
                      </div>
                      {qrError && <p className="mt-2 text-[12px] font-bold text-red-600">{qrError}</p>}
                    </div>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Dịch vụ & hợp đồng" icon={<Briefcase size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {hasField('service_type') && (
                  <SelectField label="Loại dịch vụ" icon={<Briefcase size={16} />}>
                    <CreatableSearchableSelect
                      value={formState.service_type || ''}
                      options={serviceTypeFormOptions}
                      onValueChange={value => onChange('service_type', value)}
                      placeholder="Chọn hoặc gõ loại dịch vụ mới"
                      searchPlaceholder="Tìm hoặc gõ loại dịch vụ..."
                      createLabel="Thêm loại dịch vụ"
                    />
                  </SelectField>
                )}
                {hasField('contract_type') && (
                  <SelectField label="Loại hợp đồng" icon={<Briefcase size={16} />}>
                    <CreatableSearchableSelect
                      value={formState.contract_type || ''}
                      options={contractTypeFormOptions}
                      onValueChange={value => onChange('contract_type', value)}
                      placeholder="Chọn hoặc gõ loại hợp đồng mới"
                      searchPlaceholder="Tìm hoặc gõ loại hợp đồng..."
                      createLabel="Thêm loại hợp đồng"
                    />
                  </SelectField>
                )}
                {hasField('status') && (
                  <SelectField label="Trạng thái" icon={<Tag size={16} />}>
                    <SearchableSelect
                      value={formState.status || 'ACTIVE'}
                      options={statusOptions}
                      onValueChange={value => onChange('status', value)}
                      placeholder="Chọn trạng thái"
                    />
                  </SelectField>
                )}
              </div>

              {hasField('province') && (
                <div className="mt-4 space-y-2">
                  <label className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                    <MapPinned size={16} className="text-muted-foreground/70" />
                    Khu vực phục vụ
                  </label>
                  <ProvinceMultiSelect
                    options={provinceFormOptions}
                    value={formState.province || ''}
                    onChange={value => onChange('province', value)}
                  />
                </div>
              )}
            </Section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] font-bold text-red-600">{error}</div>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-white p-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Hủy
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting || isUploadingQr}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[13px] font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save size={16} />
            {isSubmitting ? 'Đang lưu...' : 'Lưu NCC'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3 text-primary">
        <span>{icon}</span>
        <span className="text-[12px] font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, icon, children, className }: { label: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label className="text-[13px] font-bold text-foreground">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function SelectField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-[13px] font-bold text-foreground">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
