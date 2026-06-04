import { createPortal } from 'react-dom';
import { Building2, Fuel, Gauge, MapPin, Tag, Truck, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { CreatableSearchableSelect } from '../../../components/ui/CreatableSearchableSelect';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import type { FilterOption, TruckFormState } from '../types';
import { LOAI_XE_CATEGORY_OPTIONS } from '../data';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formState: TruckFormState;
  setFormField: <K extends keyof TruckFormState>(key: K, value: TruckFormState[K]) => void;
  statusOptions: FilterOption[];
  khuVucOptions: string[];
}

const inputClass =
  'w-full h-10 rounded-xl border border-border bg-white pl-10 pr-3 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10';

export default function AddEditTruckDialog({
  isOpen,
  isClosing,
  isEditMode,
  isSubmitting,
  onClose,
  onSubmit,
  formState,
  setFormField,
  statusOptions,
  khuVucOptions,
}: Props) {
  const loaiXeOptions = LOAI_XE_CATEGORY_OPTIONS.map((value) => ({ value, label: value }));
  if (!isOpen && !isClosing) return null;

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
          'relative w-full max-w-[680px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <div className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-lg font-extrabold text-foreground">{isEditMode ? 'Sửa xe' : 'Thêm xe'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          <Section title="Thông tin xe" icon={<Truck size={16} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="BKS" icon={<Truck size={16} />}>
                <input
                  value={formState.bks}
                  onChange={(e) => {
                    const normalizedBks = e.target.value.toUpperCase();
                    setFormField('bks', normalizedBks);
                    setFormField('license_plate', normalizedBks);
                  }}
                  className={inputClass}
                  placeholder="Biển kiểm soát"
                />
              </Field>
              <SelectField
                label="Loại xe"
                value={formState.loai_xe}
                options={[{ value: '', label: 'Chọn loại xe' }, ...loaiXeOptions]}
                onChange={(value) => setFormField('loai_xe', value)}
                icon={<Tag size={16} />}
                fullWidth={false}
              />
              <Field label="Khu vực" icon={<MapPin size={16} />}>
                <CreatableSearchableSelect
                  value={formState.khu_vuc}
                  onValueChange={(value) => setFormField('khu_vuc', value)}
                  options={khuVucOptions}
                  placeholder="Chọn hoặc nhập khu vực"
                  createLabel={(query) => `Thêm khu vực "${query}"`}
                  className="pl-10"
                />
              </Field>
            </div>
          </Section>

          <Section title="Nhà xe & lái xe" icon={<Building2 size={16} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nhà xe" icon={<Building2 size={16} />}>
                <input
                  value={formState.nha_xe}
                  onChange={(e) => setFormField('nha_xe', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Tên lái xe" icon={<User size={16} />}>
                <input
                  value={formState.ten_lai_xe}
                  onChange={(e) => setFormField('ten_lai_xe', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Vận hành" icon={<Gauge size={16} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tải trọng (kg)" icon={<Gauge size={16} />}>
                <input
                  type="number"
                  min="1"
                  value={formState.payload}
                  onChange={(e) => setFormField('payload', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Định mức dầu" icon={<Fuel size={16} />}>
                <input
                  type="number"
                  min="0"
                  value={formState.fuel_consumption_limit}
                  onChange={(e) => setFormField('fuel_consumption_limit', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <SelectField
                label="Trạng thái"
                value={formState.status}
                options={statusOptions.filter((o) => o.value)}
                onChange={(value) => setFormField('status', value)}
                icon={<Tag size={16} />}
              />
            </div>
          </Section>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            Hủy
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-xl bg-primary px-6 py-3 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-primary">
        {icon}
        <h3 className="text-[13px] font-extrabold text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-muted-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        {children}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  icon,
  fullWidth = true,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  icon: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={fullWidth ? 'block sm:col-span-2' : 'block'}>
      <span className="mb-1 block text-[12px] font-bold text-muted-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <SearchableSelect
          value={value}
          options={options}
          onValueChange={onChange}
          placeholder="Chọn..."
          searchPlaceholder="Tìm..."
          className="h-10 pl-10"
        />
      </div>
    </label>
  );
}
