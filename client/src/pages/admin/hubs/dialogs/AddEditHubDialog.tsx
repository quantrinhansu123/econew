import { createPortal } from 'react-dom';
import { Building2, Hash, MapPin, Phone, Tag, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import type { FilterOption, HubFormState, HubManager } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formState: HubFormState;
  setFormField: <K extends keyof HubFormState>(key: K, value: HubFormState[K]) => void;
  typeOptions: FilterOption[];
  statusOptions: FilterOption[];
  managerOptions: FilterOption[];
  managers: HubManager[];
}

const inputClass = 'w-full h-10 rounded-xl border border-border bg-white pl-10 pr-3 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10';

export default function AddEditHubDialog({ isOpen, isClosing, isEditMode, isSubmitting, onClose, onSubmit, formState, setFormField, typeOptions, statusOptions, managerOptions, managers }: Props) {
  const setManager = (managerId: string) => {
    const manager = managers.find(item => String(item.id) === managerId);
    setFormField('manager_id', managerId);
    setFormField('manager_name', manager ? manager.name || manager.full_name || manager.username || '' : '');
    setFormField('manager_phone', manager?.phone || '');
  };

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className={clsx('fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out', isClosing ? 'opacity-0' : 'animate-in fade-in duration-300')} onClick={onClose} />
      <div className={clsx('relative w-full max-w-[680px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border', isClosing ? 'dialog-slide-out' : 'dialog-slide-in')}>
        <div className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">{isEditMode ? 'Chỉnh sửa bưu cục' : 'Tạo bưu cục mới'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className="space-y-5">
            <section className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-primary"><Building2 size={22} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{isEditMode ? 'Chỉnh sửa hub' : 'Tạo hub mới'}</p>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Mã hub" required icon={<Hash size={16} />}><input value={formState.code} onChange={event => setFormField('code', event.target.value.toUpperCase())} className={inputClass} placeholder="VD: HAN" /></Field>
                  <Field label="Tên bưu cục/kho" required icon={<Building2 size={16} />}><input value={formState.name} onChange={event => setFormField('name', event.target.value)} className={inputClass} placeholder="Bưu cục Hà Nội" /></Field>
                </div>
              </div>
            </section>

            <Section title="Phân loại & trạng thái" icon={<Tag size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField label="Loại hub" value={formState.type} options={typeOptions.filter(option => option.value)} onChange={value => setFormField('type', value)} icon={<Building2 size={16} />} />
                <SelectField label="Trạng thái" value={formState.status} options={statusOptions.filter(option => option.value)} onChange={value => setFormField('status', value)} icon={<Tag size={16} />} />
              </div>
            </Section>

            <Section title="Địa chỉ" icon={<MapPin size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Địa chỉ" required icon={<MapPin size={16} />} className="sm:col-span-2"><input value={formState.address} onChange={event => setFormField('address', event.target.value)} className={inputClass} placeholder="Số nhà, đường, phường/xã" /></Field>
                <Field label="Tỉnh/thành" required icon={<MapPin size={16} />}><input value={formState.province} onChange={event => setFormField('province', event.target.value)} className={inputClass} placeholder="VD: Hà Nội" /></Field>
                <Field label="Quận/huyện" required icon={<MapPin size={16} />}><input value={formState.district} onChange={event => setFormField('district', event.target.value)} className={inputClass} placeholder="VD: Cầu Giấy" /></Field>
                <Field label="Phường/xã" icon={<MapPin size={16} />}><input value={formState.ward} onChange={event => setFormField('ward', event.target.value)} className={inputClass} /></Field>
                <Field label="Tọa độ GPS" icon={<MapPin size={16} />}><input value={formState.coordinates} onChange={event => setFormField('coordinates', event.target.value)} className={inputClass} placeholder="21.0278,105.8342" /></Field>
              </div>
            </Section>

            <Section title="Liên hệ quản lý" icon={<User size={16} />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField label="Người quản lý" value={formState.manager_id} options={managerOptions} onChange={setManager} icon={<User size={16} />} />
                <Field label="Số điện thoại quản lý" icon={<Phone size={16} />}><input value={formState.manager_phone} onChange={event => setFormField('manager_phone', event.target.value)} className={inputClass} /></Field>
                <Field label="Số điện thoại bưu cục" icon={<Phone size={16} />}><input value={formState.phone} onChange={event => setFormField('phone', event.target.value)} className={inputClass} /></Field>
              </div>
            </Section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card p-5">
          <button onClick={onClose} className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Hủy</button>
          <button onClick={onSubmit} disabled={isSubmitting} className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">
            {isSubmitting ? 'Đang lưu...' : isEditMode ? 'Lưu thay đổi' : 'Tạo bưu cục'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3"><span className="text-primary">{icon}</span><span className="text-[12px] font-bold uppercase tracking-wider text-primary">{title}</span></div><div className="p-4">{children}</div></section>;
}

function Field({ label, icon, required, className, children }: { label: string; icon: ReactNode; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={clsx('block space-y-1.5', className)}><span className="text-[13px] font-bold text-foreground">{label}{required && <span className="text-red-500"> *</span>}</span><span className="relative block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">{icon}</span>{children}</span></label>;
}

function SelectField({ label, value, options, onChange, icon }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void; icon: ReactNode }) {
  return <div className="space-y-1.5"><label className="text-[13px] font-bold text-foreground">{label}</label><div className="relative"><span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground/50">{icon}</span><SearchableSelect options={options} value={value} onValueChange={onChange} placeholder={label} className="pl-9" /></div></div>;
}
