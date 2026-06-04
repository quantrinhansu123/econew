import { createPortal } from 'react-dom';
import { MapPin, Route, Tag, X } from 'lucide-react';
import { clsx } from 'clsx';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import type { FilterOption, RouteFormState } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  formState: RouteFormState;
  hubOptions: FilterOption[];
  statusOptions: FilterOption[];
  onClose: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<RouteFormState>) => void;
}

const inputClass =
  'w-full h-10 rounded-xl border border-border bg-white px-3 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/10';

export default function AddEditRouteDialog({
  isOpen,
  isClosing,
  isEditMode,
  isSubmitting,
  formState,
  hubOptions,
  statusOptions,
  onClose,
  onSubmit,
  onChange,
}: Props) {
  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-300',
          isClosing ? 'opacity-0' : 'animate-in fade-in',
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative flex h-screen w-full max-w-[560px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <h2 className="text-lg font-extrabold text-foreground">
            {isEditMode ? 'Sửa tuyến giao' : 'Thêm tuyến giao'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-foreground">
              <Route size={14} /> Mã tuyến *
            </span>
            <input
              value={formState.code}
              onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
              placeholder="VD: HCM-Q7-01"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-foreground">Tên tuyến *</span>
            <input
              value={formState.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Quận 7 — khu Nam Sài Gòn"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-foreground">
              <MapPin size={14} /> Hub phụ trách
            </span>
            <SearchableSelect
              value={formState.hub_id}
              options={hubOptions}
              onValueChange={(value) => onChange({ hub_id: value })}
              placeholder="Chọn hub (tùy chọn)"
              className="w-full"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-foreground">Tỉnh/TP</span>
              <input
                value={formState.province}
                onChange={(e) => onChange({ province: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-foreground">Quận/Huyện</span>
              <input
                value={formState.district}
                onChange={(e) => onChange({ district: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-foreground">Mô tả</span>
            <textarea
              value={formState.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              className={`${inputClass} min-h-[72px] py-2`}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-foreground">Thứ tự hiển thị</span>
              <input
                type="number"
                min={0}
                value={formState.sort_order}
                onChange={(e) => onChange({ sort_order: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-foreground">
                <Tag size={14} /> Trạng thái
              </span>
              <SearchableSelect
                value={formState.status}
                options={statusOptions.filter((o) => o.value)}
                onValueChange={(value) => onChange({ status: value })}
                placeholder="Trạng thái"
                className="w-full"
              />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-card p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !formState.code.trim() || !formState.name.trim()}
            className="rounded-xl bg-primary px-6 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 disabled:opacity-60"
          >
            {isSubmitting ? 'Đang lưu…' : 'Lưu tuyến'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
