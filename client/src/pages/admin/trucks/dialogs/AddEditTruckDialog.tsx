import { createPortal } from 'react-dom';
import { Building2, Fuel, Gauge, Tag, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import type { FilterOption, TruckFormState } from '../types';

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
  internalOnly?: boolean;
  hubOptions?: FilterOption[];
  vendorOptions?: FilterOption[];
}

const inputClass = 'w-full h-10 rounded-xl border border-border bg-white pl-10 pr-3 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10';

export default function AddEditTruckDialog({ isOpen, isClosing, isEditMode, isSubmitting, onClose, onSubmit, formState, setFormField, statusOptions, internalOnly = false, hubOptions = [], vendorOptions = [] }: Props) {
  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className={clsx('fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out', isClosing ? 'opacity-0' : 'animate-in fade-in duration-300')} onClick={onClose} />
      <div className={clsx('relative w-full max-w-[680px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border', isClosing ? 'dialog-slide-out' : 'dialog-slide-in')}>
        <div className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">{isEditMode ? 'Chỉnh sửa xe' : 'Tạo xe mới'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className="space-y-5">
            <section className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary"><Truck size={22} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{isEditMode ? 'Chỉnh sửa xe' : 'Tạo xe mới'}</p>
                <Field label="Biển số xe (BKS)" icon={<Truck size={16} />} className="mt-2 max-w-sm"><input value={formState.license_plate} onChange={e => { const value = e.target.value.toUpperCase(); setFormField('license_plate', value); setFormField('bks', value); }} className={inputClass} placeholder="VD: 29H-12345" /></Field>
              </div>
            </section>

            <Section title="Thông tin vận hành" icon={<Gauge size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tải trọng (kg)" icon={<Gauge size={16} />}><input type="number" min="1" value={formState.payload} onChange={e => setFormField('payload', e.target.value)} className={inputClass} /></Field>
                <Field label="Định mức dầu" icon={<Fuel size={16} />}><input type="number" min="0" value={formState.fuel_consumption_limit} onChange={e => setFormField('fuel_consumption_limit', e.target.value)} className={inputClass} placeholder="L/100km" /></Field>
              </div>
            </Section>

            {internalOnly ? (
              <Section title="Bưu cục hoạt động" icon={<Tag size={16} />}>
                <SelectField label="Gán bưu cục" value={formState.hub_id} options={hubOptions} onChange={value => setFormField('hub_id', value)} icon={<Tag size={16} />} />
              </Section>
            ) : (
              <Section title="Nhà cung cấp" icon={<Building2 size={16} />}>
                <SelectField label="Gán nhà cung cấp (NCC)" value={formState.vendor_id} options={vendorOptions} onChange={value => setFormField('vendor_id', value)} icon={<Building2 size={16} />} />
                <p className="mt-3 text-[12px] font-medium text-muted-foreground">Tài xế không gắn cố định với BKS; nhập tên và SĐT tài xế khi tạo hoặc sửa chuyến.</p>
              </Section>
            )}

            <Section title="Trạng thái hệ thống" icon={<Tag size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Biển số" icon={<Truck size={16} />}><input value={formState.license_plate || '—'} disabled className={`${inputClass} opacity-80 disabled:cursor-not-allowed`} /></Field>
                <SelectField label="Trạng thái" value={formState.status} options={statusOptions.filter(option => option.value)} onChange={value => setFormField('status', value)} icon={<Tag size={16} />} />
              </div>
            </Section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card p-5">
          <button onClick={onClose} className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Hủy</button>
          <button onClick={onSubmit} disabled={isSubmitting} className="rounded-xl bg-primary px-6 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">{isSubmitting ? 'Đang lưu...' : 'Lưu xe'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3 text-primary"><span>{icon}</span><span className="text-[12px] font-bold uppercase tracking-wider">{title}</span></div><div className="p-5">{children}</div></section>;
}

function Field({ label, icon, children, className }: { label: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return <div className={clsx('space-y-1.5', className)}><label className="text-[13px] font-bold text-foreground">{label}</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>{children}</div></div>;
}

function SelectField({ label, value, options, onChange, icon }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void; icon: ReactNode }) {
  return <div className="space-y-1.5"><label className="flex items-center gap-2 text-[13px] font-bold text-foreground">{icon}{label}</label><SearchableSelect value={value} options={options} onValueChange={onChange} placeholder={`Chọn ${label.toLowerCase()}`} /></div>;
}
