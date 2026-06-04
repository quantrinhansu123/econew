import { SlidersHorizontal, X } from 'lucide-react';
import type { InventoryColumnId } from './inventoryColumns';
import { INVENTORY_COLUMNS } from './inventoryColumns';

interface Props {
  isOpen: boolean;
  visibleIds: InventoryColumnId[];
  canViewPricing: boolean;
  onChange: (ids: InventoryColumnId[]) => void;
  onClose: () => void;
}

export default function InventoryColumnPicker({ isOpen, visibleIds, canViewPricing, onChange, onClose }: Props) {
  if (!isOpen) return null;

  const toggle = (id: InventoryColumnId) => {
    if (id === 'waybill_code' || id === 'actions') return;
    const set = new Set(visibleIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };

  const options = INVENTORY_COLUMNS.filter((col) => col.id !== 'actions' && (!col.managerOnly || canViewPricing));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl md:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-foreground">
            <SlidersHorizontal size={18} className="text-primary" />
            Tùy chỉnh cột hiển thị / in
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-[12px] font-medium text-muted-foreground">
          Tick chọn cột cần hiện trên bảng và bản in A4. Cột cước chỉ hiện với quyền quản lý.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto custom-scrollbar">
          {options.map((col) => (
            <label
              key={col.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={visibleIds.includes(col.id)}
                disabled={col.id === 'waybill_code'}
                onChange={() => toggle(col.id)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <span className="text-[13px] font-bold text-foreground">{col.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-11 w-full rounded-xl bg-primary text-[13px] font-bold text-white"
        >
          Áp dụng
        </button>
      </div>
    </div>
  );
}
