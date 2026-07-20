import { useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { calcOrderPricing } from '../orderFormUtils';
import {
  DICH_VU_OPTIONS,
  DON_GIA_DON_VI_OPTIONS,
  GIAO_HANG_OPTIONS,
  PHUONG_THUC_OPTIONS,
} from '../orderFormData';
import type { BillListItem, NewOrderFormState } from '../orderFormTypes';
import type { HubSummary } from '../types';
import type { CustomerRecord } from '../../customers/customerFormTypes';
import { CompactField, CompactInput, CompactSelect, FormSection } from './CompactField';
import BillListSidebar from './BillListSidebar';
import CustomerMaKhCombobox from './CustomerMaKhCombobox';
import WaybillImagePicker from './WaybillImagePicker';

interface Props {
  form: NewOrderFormState;
  setField: <K extends keyof NewOrderFormState>(key: K, value: NewOrderFormState[K]) => void;
  onCustomerSelect: (patch: Partial<NewOrderFormState>, customer: CustomerRecord) => void;
  onDestinationChange: (destHubId: string, noiDen: string, huyen: string) => void;
  bills: BillListItem[];
  selectedBillId: string | null;
  onSelectBill: (bill: BillListItem) => void;
  hubOptions: { value: string; label: string }[];
  hubs?: HubSummary[];
  onSave: () => void;
  onNew: () => void;
  onDelete: () => void;
  onDeleteBill: (bill: BillListItem) => void;
  onPreviewA5: () => void;
  onPrintA5: () => void;
  onPrintRegular: () => void;
  printableBillId: string | null;
  billFilterDate: string;
  onBillFilterDateChange: (value: string) => void;
  isBillListLoading: boolean;
  hasMoreBills: boolean;
  onLoadMoreBills: () => void;
  onBulkPrintBills: (billIds: string[]) => void;
  onPrintBill: (bill: BillListItem) => void;
  canManage: boolean;
  isSubmitting: boolean;
  error?: string;
}

export default function NewOrderWorkbench({
  form,
  setField,
  onCustomerSelect,
  onDestinationChange,
  bills,
  selectedBillId,
  onSelectBill,
  hubOptions,
  hubs = [],
  onSave,
  onNew,
  onDelete,
  onDeleteBill,
  onPreviewA5,
  onPrintA5,
  onPrintRegular,
  printableBillId,
  billFilterDate,
  onBillFilterDateChange,
  isBillListLoading,
  hasMoreBills,
  onLoadMoreBills,
  onBulkPrintBills,
  onPrintBill,
  canManage,
  isSubmitting,
  error,
}: Props) {
  const [isImageUploading, setIsImageUploading] = useState(false);
  const pricing = useMemo(
    () => calcOrderPricing(form),
    [form],
  );
  const isBusy = isSubmitting || isImageUploading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#e8eef5]">
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex flex-none flex-col overflow-visible p-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div className="mb-2 rounded-lg border border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-1.5 text-center text-[14px] font-black text-slate-800 shadow-sm">
            Thông tin đơn hàng
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-600">
              {error}
            </div>
          )}

          <FormSection title="Thông tin đơn hàng">
            <div className="space-y-2.5">
              <div className="grid grid-cols-12 items-end gap-x-2.5 gap-y-2">
                <CompactField label="BC gửi" className="col-span-12 xl:col-span-6">
                  <CompactSelect value={form.originHubId} onChange={(e) => setField('originHubId', e.target.value)}>
                    <option value="">Chọn bưu cục gửi</option>
                    {hubOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="BC đến" className="col-span-12 xl:col-span-6">
                  <CompactSelect
                    value={form.destHubId}
                    onChange={(e) => {
                      const hub = hubOptions.find((o) => o.value === e.target.value);
                      const code = hub?.label.split(' · ')[0] || '';
                      const huyen = hub?.label.split(' · ').slice(1).join(' · ') || form.huyen;
                      onDestinationChange(e.target.value, code, huyen);
                    }}
                  >
                    <option value="">Chọn bưu cục đến</option>
                    {hubOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
              </div>

              <GroupTitle>Khách hàng</GroupTitle>
              <div className="grid grid-cols-12 items-end gap-x-2.5 gap-y-2">
                <CompactField label="Mã KH" className="col-span-12 sm:col-span-4 xl:col-span-2">
                  <CustomerMaKhCombobox
                    value={form.maKh}
                    onValueChange={(code) => setField('maKh', code)}
                    onCustomerSelect={onCustomerSelect}
                    hubs={hubs}
                    disabled={isSubmitting}
                  />
                </CompactField>
                <CompactField label="Điện thoại KH" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.dienThoaiKh} onChange={(e) => setField('dienThoaiKh', e.target.value)} />
                </CompactField>
                <CompactField label="Người gửi" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.nguoiGui} onChange={(e) => setField('nguoiGui', e.target.value)} />
                </CompactField>
                <CompactField label="Địa chỉ gửi" className="col-span-12 xl:col-span-6">
                  <CompactInput value={form.diaChiGui} onChange={(e) => setField('diaChiGui', e.target.value)} />
                </CompactField>

                <CompactField label="Người nhận" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.nguoiNhan} onChange={(e) => setField('nguoiNhan', e.target.value)} />
                </CompactField>
                <CompactField label="ĐT người nhận" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.dienThoaiNhan} onChange={(e) => setField('dienThoaiNhan', e.target.value)} />
                </CompactField>
                <CompactField label="Địa chỉ nhận" className="col-span-12 xl:col-span-4">
                  <CompactInput value={form.diaChiNhan} onChange={(e) => setField('diaChiNhan', e.target.value)} />
                </CompactField>
                <CompactField label="Nơi đến" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactSelect
                    value={form.destHubId}
                    onChange={(e) => {
                      const hub = hubOptions.find((o) => o.value === e.target.value);
                      const code = hub?.label.split(' · ')[0] || '';
                      const huyen = hub?.label.split(' · ').slice(1).join(' · ') || form.huyen;
                      onDestinationChange(e.target.value, code, huyen);
                    }}
                  >
                    <option value="">Chọn nơi đến</option>
                    {hubOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label.split(' · ')[0] || o.label}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Tỉnh/Thành" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.huyen} onChange={(e) => setField('huyen', e.target.value)} />
                </CompactField>
                <CompactField label="Quận/Huyện" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.quanHuyen} onChange={(e) => setField('quanHuyen', e.target.value)} />
                </CompactField>
                <CompactField label="Phường/Xã" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.phuongXa} onChange={(e) => setField('phuongXa', e.target.value)} />
                </CompactField>
              </div>

              <GroupTitle>Hàng hóa</GroupTitle>
              <div className="grid grid-cols-12 items-end gap-x-2.5 gap-y-2">
                <CompactField label="Số kiện" className="col-span-4 sm:col-span-2 xl:col-span-2">
                  <CompactInput value={form.soKien} onChange={(e) => setField('soKien', e.target.value)} />
                </CompactField>
                <CompactField label="Số bill" className="col-span-8 sm:col-span-4 xl:col-span-2">
                  <CompactInput
                    value={form.soBill}
                    onChange={(e) => setField('soBill', e.target.value.toUpperCase())}
                    placeholder="ECOHAN1"
                    className="font-bold text-primary"
                  />
                </CompactField>
                <CompactField label="Dịch vụ" className="col-span-12 sm:col-span-4 xl:col-span-2">
                  <CompactSelect value={form.dichVu} onChange={(e) => setField('dichVu', e.target.value)}>
                    {DICH_VU_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Giao hàng" className="col-span-6 sm:col-span-4 xl:col-span-3">
                  <CompactSelect value={form.giaoHang} onChange={(e) => setField('giaoHang', e.target.value)}>
                    {GIAO_HANG_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Ngày gửi" className="col-span-6 sm:col-span-4 xl:col-span-3">
                  <CompactInput type="date" value={form.ngayDi} onChange={(e) => setField('ngayDi', e.target.value)} />
                </CompactField>

                <CompactField label="Tính cước theo" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactSelect value={form.donGiaDonVi} onChange={(e) => setField('donGiaDonVi', e.target.value)}>
                    {DON_GIA_DON_VI_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField
                  label="Số cân"
                  className="col-span-6 sm:col-span-4 xl:col-span-2"
                >
                  <CompactInput
                    value={form.klKg}
                    onChange={(e) => setField('klKg', e.target.value)}
                    placeholder="Nhập kg"
                    inputMode="decimal"
                  />
                </CompactField>
                <CompactField
                  label="Số khối"
                  className="col-span-6 sm:col-span-4 xl:col-span-2"
                >
                  <CompactInput
                    value={form.m3}
                    onChange={(e) => setField('m3', e.target.value)}
                    placeholder="Nhập m³"
                    inputMode="decimal"
                  />
                </CompactField>
                <CompactField label="NVGN" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput value={form.nvgn} onChange={(e) => setField('nvgn', e.target.value)} />
                </CompactField>
                <CompactField label="Dịch vụ GTGT" className="col-span-12 xl:col-span-4">
                  <CompactInput value={form.dichVuGiaTang} onChange={(e) => setField('dichVuGiaTang', e.target.value)} />
                </CompactField>
                <CompactField label="Nội dung" className="col-span-12 sm:col-span-6 xl:col-span-6">
                  <CompactInput value={form.noiDung} onChange={(e) => setField('noiDung', e.target.value)} />
                </CompactField>
                <CompactField label="Ghi chú" className="col-span-12 sm:col-span-6 xl:col-span-6">
                  <CompactInput value={form.ghiChu} onChange={(e) => setField('ghiChu', e.target.value)} />
                </CompactField>
                <WaybillImagePicker
                  value={form.billImages}
                  onChange={(urls) => setField('billImages', urls)}
                  onUploadingChange={setIsImageUploading}
                  disabled={!canManage || isBusy}
                />
              </div>

              <GroupTitle>Thanh toán</GroupTitle>
              <div className="grid grid-cols-12 items-end gap-x-2.5 gap-y-2">
                <CompactField label="Phương thức" className="col-span-12 sm:col-span-6 xl:col-span-2">
                  <CompactSelect value={form.phuongThuc} onChange={(e) => setField('phuongThuc', e.target.value)}>
                    {PHUONG_THUC_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Đơn giá" className="col-span-6 sm:col-span-3 xl:col-span-2">
                  <CompactInput
                    value={form.donGia}
                    onChange={(e) => setField('donGia', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
                <CompactField label="COD" className="col-span-6 sm:col-span-3 xl:col-span-2">
                  <CompactInput
                    value={form.cod}
                    onChange={(e) => setField('cod', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
                <CompactField label="Tổng cước" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput
                    value={pricing.tongCuoc}
                    readOnly
                    className="bg-slate-50 text-right font-bold tabular-nums"
                    title="Thành tiền + COD"
                  />
                </CompactField>
                <CompactField label="Phụ phí (công)" className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <CompactInput
                    value={form.giamGia}
                    onChange={(e) => setField('giamGia', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
                <CompactField label="Thanh toán" className="col-span-12 sm:col-span-4 xl:col-span-2">
                  <CompactInput
                    value={pricing.thanhToan}
                    readOnly
                    className="bg-slate-50 text-right font-bold tabular-nums"
                    title="Tổng cước - Phụ phí (công)"
                  />
                </CompactField>
              </div>
            </div>
          </FormSection>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-300 pt-3">
            <ActionButton label={isImageUploading ? 'Đang tải ảnh' : 'Nhập'} onClick={onSave} disabled={!canManage || isBusy} primary />
            <ActionButton label="Mới" onClick={onNew} disabled={isBusy} />
            <ActionButton label="Xóa" onClick={onDelete} disabled={!canManage || !selectedBillId || isBusy} danger />
            <ActionButton label="Xem A5" onClick={onPreviewA5} disabled={!printableBillId} />
            <ActionButton label="In A5" onClick={onPrintA5} disabled={!printableBillId} />
            <ActionButton label="In thường" onClick={onPrintRegular} disabled={!printableBillId} />
          </div>
        </div>

        <BillListSidebar
          bills={bills}
          selectedId={selectedBillId}
          onSelect={onSelectBill}
          onDelete={onDeleteBill}
          canDelete={canManage}
          isDeleting={isBusy}
          disabled={isBusy}
          filterDate={billFilterDate}
          onFilterDateChange={onBillFilterDateChange}
          isLoading={isBillListLoading}
          canLoadMore={hasMoreBills}
          onLoadMore={onLoadMoreBills}
          onBulkPrint={onBulkPrintBills}
          onPrintBill={onPrintBill}
        />
      </div>
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-0.5 first:pt-0">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-primary">{children}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'h-9 min-w-[86px] rounded-lg border px-4 text-[13px] font-black shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        primary && 'border-primary bg-primary text-white hover:bg-primary/90',
        danger && 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100',
        !primary && !danger && 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  );
}
