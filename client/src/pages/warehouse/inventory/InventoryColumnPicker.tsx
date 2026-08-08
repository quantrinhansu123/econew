import { SlidersHorizontal, X } from 'lucide-react';
import type { InventoryColumnId } from './inventoryColumns';
import {
  ALL_ORDERS_SELECTABLE_COLUMN_IDS,
  INVENTORY_DEFAULT_COLUMN_IDS,
  INVENTORY_COLUMNS,
  resolveAllOrdersColumnLabel,
} from './inventoryColumns';

interface Props {
  isOpen: boolean;
  visibleIds: InventoryColumnId[];
  canViewPricing: boolean;
  mode?: 'inventory' | 'all-orders';
  onChange: (ids: InventoryColumnId[]) => void;
  onClose: () => void;
}

export default function InventoryColumnPicker({ isOpen, visibleIds, canViewPricing, mode = 'inventory', onChange, onClose }: Props) {
  if (!isOpen) return null;

  const toggle = (id: InventoryColumnId) => {
    if (
      id === 'actions'
      || id === 'stt'
      || (mode === 'all-orders' && id === 'waybill_code')
    ) return;
    const set = new Set(visibleIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };

  const orderedInventoryColumns = [
    ...INVENTORY_DEFAULT_COLUMN_IDS
      .map((id) => INVENTORY_COLUMNS.find((column) => column.id === id))
      .filter((column): column is (typeof INVENTORY_COLUMNS)[number] => Boolean(column)),
    ...INVENTORY_COLUMNS.filter((column) => !INVENTORY_DEFAULT_COLUMN_IDS.includes(column.id)),
  ];
  const options = mode === 'all-orders'
    ? ALL_ORDERS_SELECTABLE_COLUMN_IDS
      .map((id) => INVENTORY_COLUMNS.find((column) => column.id === id))
      .filter((column): column is (typeof INVENTORY_COLUMNS)[number] => Boolean(column))
    : orderedInventoryColumns.filter((col) => (
      col.id !== 'actions'
      && col.id !== 'stt'
      && (!col.managerOnly || canViewPricing)
    ));

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
          Chỉ các cột được tick mới hiện trên bảng và bản in A4. Lựa chọn được giữ khi mở lại trang hoặc F5.
          Cột cước chỉ hiện với quyền quản lý.
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
                disabled={
                  mode === 'all-orders' && col.id === 'waybill_code'
                }
                onChange={() => toggle(col.id)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <span className="min-w-0 flex-1 text-[13px] font-bold text-foreground">
                {mode === 'all-orders' ? resolveAllOrdersColumnLabel(col.id) : col.label}
              </span>
              {mode === 'inventory' && INVENTORY_DEFAULT_COLUMN_IDS.includes(col.id) && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  Mặc định
                </span>
              )}
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
