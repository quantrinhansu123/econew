import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import type { AllOrdersSort, AllOrdersSortDirection } from './allOrdersColumnFilters';
import type { InventoryColumnId, InventoryColumnView } from './inventoryColumns';
import { getSpreadsheetColumnName } from './allOrdersSortUtils';

const NON_SORTABLE_COLUMN_IDS = new Set<InventoryColumnId>(['stt', 'actions', 'bill_images']);

interface Props {
  columns: InventoryColumnView[];
  sort: AllOrdersSort;
  onChange: (columnId: InventoryColumnId, direction: AllOrdersSortDirection) => void;
}

export default function AllOrdersSortControl({ columns, sort, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const sortableColumns = useMemo(
    () => columns
      .map((column, index) => ({ column, spreadsheetName: getSpreadsheetColumnName(index) }))
      .filter(({ column }) => !NON_SORTABLE_COLUMN_IDS.has(column.id)),
    [columns],
  );
  const fallbackColumnId = sortableColumns[0]?.column.id || 'received_at';
  const [draftColumnId, setDraftColumnId] = useState<InventoryColumnId>(sort.columnId);
  const [draftDirection, setDraftDirection] = useState<AllOrdersSortDirection>(sort.direction);
  const activeColumn = columns.find((column) => column.id === sort.columnId);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftColumnId(sortableColumns.some(({ column }) => column.id === sort.columnId) ? sort.columnId : fallbackColumnId);
      setDraftDirection(sort.direction);
    }
  };

  const applySort = () => {
    onChange(draftColumnId, draftDirection);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[13px] font-bold text-primary hover:bg-blue-100"
          title="Sắp xếp danh sách theo cột như Excel"
        >
          <ArrowUpDown size={16} />
          <span>Sắp xếp</span>
          <span className="hidden max-w-[130px] truncate font-medium text-blue-700 xl:inline">
            {activeColumn?.label || sort.columnId} {sort.direction === 'asc' ? '↑' : '↓'}
          </span>
          <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-[330px] rounded-xl border-border p-0 shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-extrabold text-foreground">Sắp xếp như Excel</p>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">Chọn cột và chiều sắp xếp trước khi tải Excel.</p>
        </div>

        <div className="space-y-4 p-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Sắp xếp theo cột</span>
            <select
              value={draftColumnId}
              onChange={(event) => setDraftColumnId(event.target.value as InventoryColumnId)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/15"
            >
              {sortableColumns.map(({ column, spreadsheetName }) => (
                <option key={column.id} value={column.id}>Cột {spreadsheetName} · {column.label}</option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Thứ tự</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraftDirection('asc')}
                className={clsx(
                  'flex min-h-16 flex-col items-start justify-center rounded-lg border px-3 text-left transition-colors',
                  draftDirection === 'asc' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-slate-600 hover:bg-muted',
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold"><ArrowUp size={14} />Tăng dần</span>
                <span className="mt-1 text-[10px] font-medium opacity-80">A → Z · Cũ → mới</span>
              </button>
              <button
                type="button"
                onClick={() => setDraftDirection('desc')}
                className={clsx(
                  'flex min-h-16 flex-col items-start justify-center rounded-lg border px-3 text-left transition-colors',
                  draftDirection === 'desc' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-slate-600 hover:bg-muted',
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold"><ArrowDown size={14} />Giảm dần</span>
                <span className="mt-1 text-[10px] font-medium opacity-80">Z → A · Mới → cũ</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={applySort}
            disabled={!sortableColumns.length}
            className="h-10 w-full rounded-lg bg-primary text-[13px] font-extrabold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Áp dụng sắp xếp
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
