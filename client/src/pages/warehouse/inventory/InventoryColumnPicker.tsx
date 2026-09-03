import { useMemo, useState } from 'react';
import { GripVertical, SlidersHorizontal, X } from 'lucide-react';
import { clsx } from 'clsx';
import { moveItemBefore } from '../../../lib/columnOrder';
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
  const [draggedId, setDraggedId] = useState<InventoryColumnId | null>(null);

  const orderedInventoryColumns = useMemo(() => [
    ...INVENTORY_DEFAULT_COLUMN_IDS
      .map((id) => INVENTORY_COLUMNS.find((column) => column.id === id))
      .filter((column): column is (typeof INVENTORY_COLUMNS)[number] => Boolean(column)),
    ...INVENTORY_COLUMNS.filter((column) => !INVENTORY_DEFAULT_COLUMN_IDS.includes(column.id)),
  ], []);
  const baseOptions = useMemo(() => mode === 'all-orders'
    ? ALL_ORDERS_SELECTABLE_COLUMN_IDS
      .map((id) => INVENTORY_COLUMNS.find((column) => column.id === id))
      .filter((column): column is (typeof INVENTORY_COLUMNS)[number] => Boolean(column))
    : orderedInventoryColumns.filter((col) => (
      col.id !== 'actions'
      && col.id !== 'stt'
      && (!col.managerOnly || canViewPricing)
    )), [canViewPricing, mode, orderedInventoryColumns]);
  const options = useMemo(() => {
    const optionMap = new Map(baseOptions.map((option) => [option.id, option]));
    return [
      ...visibleIds.map((id) => optionMap.get(id)).filter((option): option is (typeof baseOptions)[number] => Boolean(option)),
      ...baseOptions.filter((option) => !visibleIds.includes(option.id)),
    ];
  }, [baseOptions, visibleIds]);

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
          Giữ biểu tượng kéo để đổi vị trí; bản in dùng đúng thứ tự này. Cột cước chỉ hiện với quyền quản lý.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto custom-scrollbar">
          {options.map((col) => {
            const checked = visibleIds.includes(col.id);
            return (
            <label
              key={col.id}
              onDragOver={(event) => {
                if (!checked || !draggedId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (checked && draggedId) onChange(moveItemBefore(visibleIds, draggedId, col.id));
                setDraggedId(null);
              }}
              className={clsx(
                'flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-2.5 transition-colors',
                draggedId === col.id ? 'border-primary bg-primary/5 opacity-70' : 'border-border hover:bg-muted/30',
              )}
            >
              <span
                draggable={checked}
                onClick={(event) => event.preventDefault()}
                onDragStart={(event) => {
                  if (!checked) return;
                  setDraggedId(col.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', col.id);
                }}
                onDragEnd={() => setDraggedId(null)}
                className={clsx(
                  'inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground',
                  checked ? 'cursor-grab hover:bg-muted active:cursor-grabbing' : 'cursor-not-allowed opacity-25',
                )}
                title={checked ? `Kéo để đổi vị trí cột ${col.label}` : 'Tick cột trước khi sắp xếp'}
                aria-label={checked ? `Kéo để đổi vị trí cột ${col.label}` : undefined}
              >
                <GripVertical size={16} />
              </span>
              <input
                type="checkbox"
                checked={checked}
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
            );
          })}
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
