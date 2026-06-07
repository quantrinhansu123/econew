import { useMemo } from 'react';
import { clsx } from 'clsx';
import { calcOrderPricing } from '../orderFormUtils';
import {
  DICH_VU_OPTIONS,
  DON_GIA_DON_VI_OPTIONS,
  GIAO_HANG_OPTIONS,
  ORDER_TABS,
  PHUONG_THUC_OPTIONS,
} from '../orderFormData';
import type { BillListItem, NewOrderFormState, OrderWorkbenchTab } from '../orderFormTypes';
import type { HubSummary } from '../types';
import { CompactField, CompactInput, CompactSelect, FormSection } from './CompactField';
import BillListSidebar from './BillListSidebar';
import CustomerMaKhCombobox from './CustomerMaKhCombobox';

interface Props {
  form: NewOrderFormState;
  setField: <K extends keyof NewOrderFormState>(key: K, value: NewOrderFormState[K]) => void;
  patchForm: (patch: Partial<NewOrderFormState>) => void;
  activeTab: OrderWorkbenchTab;
  onTabChange: (tab: OrderWorkbenchTab) => void;
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
  canManage: boolean;
  isSubmitting: boolean;
  error?: string;
}

export default function NewOrderWorkbench({
  form,
  setField,
  patchForm,
  activeTab,
  onTabChange,
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
  canManage,
  isSubmitting,
  error,
}: Props) {
  const pricing = useMemo(
    () => calcOrderPricing(form),
    [form.donGia, form.cod, form.giamGia],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#e8eef5]">
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-300 bg-slate-100 px-4 py-2.5">
        {ORDER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={clsx(
              'rounded-lg border px-4 py-2 text-[14px] font-bold transition-colors',
              activeTab === tab.id
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <div className="mb-4 rounded-lg border border-slate-300 bg-slate-200/80 px-4 py-2.5 text-center text-[15px] font-extrabold text-slate-800">
            Thông tin đơn hàng
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {activeTab === 'khach-hang' && (
            <FormSection title="Thông tin khách hàng">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CompactField label="Mã KH">
                  <CustomerMaKhCombobox
                    value={form.maKh}
                    onValueChange={(code) => setField('maKh', code)}
                    onCustomerSelect={patchForm}
                    hubs={hubs}
                    disabled={isSubmitting}
                  />
                </CompactField>
                <CompactField label="Điện thoại KH">
                  <CompactInput value={form.dienThoaiKh} onChange={(e) => setField('dienThoaiKh', e.target.value)} />
                </CompactField>
                <CompactField label="Người gửi">
                  <CompactInput value={form.nguoiGui} onChange={(e) => setField('nguoiGui', e.target.value)} />
                </CompactField>
                <CompactField label="Địa chỉ gửi">
                  <CompactInput value={form.diaChiGui} onChange={(e) => setField('diaChiGui', e.target.value)} />
                </CompactField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CompactField label="ĐT người nhận">
                  <CompactInput value={form.dienThoaiNhan} onChange={(e) => setField('dienThoaiNhan', e.target.value)} />
                </CompactField>
                <CompactField label="Nơi đến">
                  <CompactSelect
                    value={form.destHubId}
                    onChange={(e) => {
                      const hub = hubOptions.find((o) => o.value === e.target.value);
                      const code = hub?.label.split(' · ')[0] || '';
                      patchForm({
                        destHubId: e.target.value,
                        noiDen: code,
                        huyen: hub?.label.split(' · ').slice(1).join(' · ') || form.huyen,
                      });
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
                <CompactField label="Huyện">
                  <CompactInput value={form.huyen} onChange={(e) => setField('huyen', e.target.value)} />
                </CompactField>
                <CompactField label="Người nhận">
                  <CompactInput value={form.nguoiNhan} onChange={(e) => setField('nguoiNhan', e.target.value)} />
                </CompactField>
              </div>
              <CompactField label="Địa chỉ nhận">
                <CompactInput value={form.diaChiNhan} onChange={(e) => setField('diaChiNhan', e.target.value)} />
              </CompactField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CompactField label="BC gửi">
                  <CompactSelect value={form.originHubId} onChange={(e) => setField('originHubId', e.target.value)}>
                    <option value="">Chọn bưu cục gửi</option>
                    {hubOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="BC đến">
                  <CompactSelect value={form.destHubId} onChange={(e) => setField('destHubId', e.target.value)}>
                    <option value="">Chọn bưu cục đến</option>
                    {hubOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
              </div>
            </FormSection>
            )}

            {activeTab === 'hang-hoa' && (
            <FormSection title="Thông tin hàng hóa">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <CompactField label="Số kiện">
                  <CompactInput value={form.soKien} onChange={(e) => setField('soKien', e.target.value)} />
                </CompactField>
                <CompactField label="Số bill">
                  <CompactInput
                    value={form.soBill}
                    onChange={(e) => setField('soBill', e.target.value.toUpperCase())}
                    placeholder="ECO-1"
                    className="font-bold text-primary"
                  />
                </CompactField>
                <CompactField label="Dịch vụ">
                  <CompactSelect value={form.dichVu} onChange={(e) => setField('dichVu', e.target.value)}>
                    {DICH_VU_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Giao hàng">
                  <CompactSelect value={form.giaoHang} onChange={(e) => setField('giaoHang', e.target.value)}>
                    {GIAO_HANG_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CompactField label="KL (kg)">
                  <CompactInput value={form.klKg} onChange={(e) => setField('klKg', e.target.value)} />
                </CompactField>
                <CompactField label="NVGN">
                  <CompactInput value={form.nvgn} onChange={(e) => setField('nvgn', e.target.value)} />
                </CompactField>
                <CompactField label="M3">
                  <CompactInput
                    value={form.m3}
                    onChange={(e) => setField('m3', e.target.value)}
                    placeholder="Nhập m³"
                  />
                </CompactField>
                <CompactField label="Đơn vị">
                  <CompactSelect value={form.donGiaDonVi} onChange={(e) => setField('donGiaDonVi', e.target.value)}>
                    {DON_GIA_DON_VI_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CompactField label="Dịch vụ GTGT">
                  <CompactInput value={form.dichVuGiaTang} onChange={(e) => setField('dichVuGiaTang', e.target.value)} />
                </CompactField>
                <CompactField label="Nội dung">
                  <CompactInput value={form.noiDung} onChange={(e) => setField('noiDung', e.target.value)} />
                </CompactField>
                <CompactField label="Ngày gửi">
                  <CompactInput type="date" value={form.ngayDi} onChange={(e) => setField('ngayDi', e.target.value)} />
                </CompactField>
              </div>
              <CompactField label="Ghi chú">
                <CompactInput value={form.ghiChu} onChange={(e) => setField('ghiChu', e.target.value)} />
              </CompactField>
            </FormSection>
            )}

            {activeTab === 'thanh-toan' && (
            <FormSection title="Thanh toán">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <CompactField label="Phương thức">
                  <CompactSelect value={form.phuongThuc} onChange={(e) => setField('phuongThuc', e.target.value)}>
                    {PHUONG_THUC_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CompactSelect>
                </CompactField>
                <CompactField label="Đơn giá">
                  <CompactInput
                    value={form.donGia}
                    onChange={(e) => setField('donGia', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
                <CompactField label="COD">
                  <CompactInput
                    value={form.cod}
                    onChange={(e) => setField('cod', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <CompactField label="Tổng cước">
                  <CompactInput
                    value={pricing.tongCuoc}
                    readOnly
                    className="bg-slate-50 font-bold text-right tabular-nums"
                    title="Đơn giá + COD"
                  />
                </CompactField>
                <CompactField label="Giảm giá">
                  <CompactInput
                    value={form.giamGia}
                    onChange={(e) => setField('giamGia', e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    className="text-right tabular-nums"
                  />
                </CompactField>
                <CompactField label="Thanh toán">
                  <CompactInput
                    value={pricing.thanhToan}
                    readOnly
                    className="bg-slate-50 font-bold text-right tabular-nums"
                    title="Tổng cước − Giảm giá"
                  />
                </CompactField>
              </div>
            </FormSection>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-slate-300 pt-4">
            <ActionButton label="Nhập" onClick={onSave} disabled={!canManage || isSubmitting} primary />
            <ActionButton label="Mới" onClick={onNew} disabled={isSubmitting} />
            <ActionButton label="Xóa" onClick={onDelete} disabled={!canManage || !selectedBillId || isSubmitting} danger />
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
          isDeleting={isSubmitting}
        />
      </div>
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
        'min-w-[88px] rounded-lg border px-5 py-2.5 text-[14px] font-extrabold shadow-sm disabled:cursor-not-allowed disabled:opacity-50',
        primary && 'border-primary bg-primary text-white hover:bg-primary/90',
        danger && 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100',
        !primary && !danger && 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  );
}
