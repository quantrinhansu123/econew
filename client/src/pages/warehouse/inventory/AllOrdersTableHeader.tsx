import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check, Filter, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import {
  ALL_ORDERS_FINANCIAL_COLUMN_IDS,
  ALL_ORDERS_PREFIX_COLUMN_IDS,
  ALL_ORDERS_SENDER_COLUMN_IDS,
  ALL_ORDERS_STICKY_COLUMN_IDS,
  ALL_ORDERS_SUFFIX_COLUMN_IDS,
  getAllOrdersStickyLeft,
  type InventoryColumnId,
  type InventoryColumnView,
} from './inventoryColumns';
import type { AllOrdersColumnFilterOption, AllOrdersColumnFilters, AllOrdersSort, AllOrdersSortDirection } from './allOrdersColumnFilters';

interface Props {
  columns: InventoryColumnView[];
  selectionEnabled?: boolean;
  allRowsSelected?: boolean;
  onToggleSelectAll?: () => void;
  filterOptions?: Partial<Record<InventoryColumnId, AllOrdersColumnFilterOption[]>>;
  filterValues?: AllOrdersColumnFilters;
  onFilterChange?: (columnId: InventoryColumnId, value: string) => void;
  sort?: AllOrdersSort;
  onSortChange?: (columnId: InventoryColumnId, direction: AllOrdersSortDirection) => void;
  grouped?: boolean;
}

function ColumnFilterLabel({
  column,
  options,
  value,
  onChange,
  sort,
  onSortChange,
}: {
  column: InventoryColumnView;
  options: AllOrdersColumnFilterOption[];
  value: string;
  onChange?: (columnId: InventoryColumnId, value: string) => void;
  sort?: AllOrdersSort;
  onSortChange?: (columnId: InventoryColumnId, direction: AllOrdersSortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const filteredOptions = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase('vi-VN');
    return query
      ? options.filter((option) => option.label.toLocaleLowerCase('vi-VN').includes(query))
      : options;
  }, [keyword, options]);
  const activeSort = sort?.columnId === column.id ? sort.direction : null;
  const filterActive = Boolean(value);
  const active = filterActive || Boolean(activeSort);
  const canSort = Boolean(onSortChange) && !['stt', 'actions', 'bill_images'].includes(column.id);

  if ((!options.length || !onChange) && !canSort) return <>{column.label}</>;

  return (
    <div className="flex min-w-0 items-center justify-between gap-1">
      <span className="min-w-0 truncate" title={column.label}>{column.label}</span>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setKeyword('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={clsx(
              'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
              active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-slate-500 hover:border-primary hover:text-primary',
            )}
            title={`Lọc hoặc sắp xếp theo ${column.label}`}
            aria-label={`Lọc hoặc sắp xếp theo ${column.label}`}
          >
            {activeSort === 'asc' ? <ArrowUp size={12} /> : activeSort === 'desc' ? <ArrowDown size={12} /> : <Filter size={11} fill={value ? 'currentColor' : 'none'} />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} collisionPadding={12} className="w-[280px] overflow-hidden rounded-xl border-border p-0 shadow-xl">
          {canSort && <div className="grid grid-cols-2 gap-1.5 border-b border-border p-2 normal-case">
            <button type="button" onClick={() => { onSortChange?.(column.id, 'asc'); setOpen(false); }} className={clsx('inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-bold', activeSort === 'asc' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-slate-600 hover:bg-muted')}><ArrowUp size={14} />Tăng dần</button>
            <button type="button" onClick={() => { onSortChange?.(column.id, 'desc'); setOpen(false); }} className={clsx('inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-bold', activeSort === 'desc' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-slate-600 hover:bg-muted')}><ArrowDown size={14} />Giảm dần</button>
          </div>}
          {options.length > 0 && onChange && <div className="border-b border-border p-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={`Tìm ${column.label.toLocaleLowerCase('vi-VN')}...`}
                className="h-9 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-8 text-[13px] font-medium normal-case outline-none focus:ring-2 focus:ring-primary/15"
              />
              {keyword && (
                <button type="button" onClick={() => setKeyword('')} className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>}
          {options.length > 0 && onChange && <div className="custom-scrollbar max-h-64 overflow-y-auto p-1.5 normal-case">
            <button
              type="button"
              onClick={() => {
                onChange(column.id, '');
                setOpen(false);
              }}
              className={clsx('flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] font-bold hover:bg-muted', !filterActive && 'bg-blue-50 text-primary')}
            >
              <span>Tất cả</span>
              {!filterActive && <Check size={14} />}
            </button>
            {filteredOptions.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(column.id, option.value);
                    setOpen(false);
                  }}
                  className={clsx('flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-muted', selected && 'bg-blue-50 font-bold text-primary')}
                >
                  <span className="min-w-0 truncate" title={option.label}>{option.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">{option.count}</span>
                    {selected && <Check size={14} />}
                  </span>
                </button>
              );
            })}
            {!filteredOptions.length && <p className="px-3 py-6 text-center text-[12px] font-medium text-muted-foreground">Không có dữ liệu phù hợp.</p>}
          </div>}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function AllOrdersTableHeader({
  columns,
  selectionEnabled,
  allRowsSelected,
  onToggleSelectAll,
  filterOptions = {},
  filterValues = {},
  onFilterChange,
  sort,
  onSortChange,
  grouped = true,
}: Props) {
  if (!grouped) {
    return (
      <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
        {selectionEnabled && (
          <th className="w-10 border-b border-r border-border px-2 py-2.5 text-center font-bold">
            <input type="checkbox" checked={Boolean(allRowsSelected)} onChange={onToggleSelectAll} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" aria-label="Chọn tất cả" />
          </th>
        )}
        {columns.map((column) => (
          <th key={column.id} className={clsx('border-b border-r border-border px-2 py-2 font-bold last:border-r-0 whitespace-nowrap', column.headerClass)}>
            <ColumnFilterLabel column={column} options={filterOptions[column.id] || []} value={filterValues[column.id] || ''} onChange={onFilterChange} sort={sort} onSortChange={onSortChange} />
          </th>
        ))}
      </tr>
    );
  }
  const prefixColumns = columns.filter((col) => ALL_ORDERS_PREFIX_COLUMN_IDS.includes(col.id));
  const senderColumns = columns.filter((col) => ALL_ORDERS_SENDER_COLUMN_IDS.includes(col.id));
  const financialColumns = columns.filter((col) => ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(col.id));
  const otherColumns = columns.filter(
    (col) =>
      !ALL_ORDERS_PREFIX_COLUMN_IDS.includes(col.id) &&
      !ALL_ORDERS_SENDER_COLUMN_IDS.includes(col.id) &&
      !ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(col.id) &&
      ALL_ORDERS_SUFFIX_COLUMN_IDS.includes(col.id),
  );

  return (
    <>
      <tr className="text-[11px] uppercase tracking-wider">
        {selectionEnabled && (
          <th rowSpan={2} className="w-10 border-b border-r border-border bg-slate-100 px-2 py-2 font-bold text-center">
            <input
              type="checkbox"
              checked={Boolean(allRowsSelected)}
              onChange={onToggleSelectAll}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              aria-label="Chọn tất cả"
            />
          </th>
        )}
        {prefixColumns.map((col) => (
          <th
            key={col.id}
            rowSpan={2}
            style={col.id === 'stt' ? { left: 0 } : undefined}
            className={clsx(
              'border-b border-r border-border bg-slate-100 px-1.5 py-2.5 font-bold text-slate-600 whitespace-nowrap text-center',
              col.id === 'stt' && 'sticky z-30',
            )}
          >
            <ColumnFilterLabel column={col} options={filterOptions[col.id] || []} value={filterValues[col.id] || ''} onChange={onFilterChange} sort={sort} onSortChange={onSortChange} />
          </th>
        ))}
        {senderColumns.length > 0 && (
          <th
            colSpan={senderColumns.length}
            className="border-b border-r border-border bg-sky-100 px-4 py-2 font-extrabold text-sky-900 text-center"
          >
            Thông tin người gửi
          </th>
        )}
        {financialColumns.length > 0 && (
          <th
            colSpan={financialColumns.length}
            className="border-b border-r border-border bg-violet-50 px-4 py-2 font-extrabold text-violet-900 text-center"
          >
            &nbsp;
          </th>
        )}
        {otherColumns.map((col) => (
          <th
            key={col.id}
            rowSpan={2}
            className={clsx(
              'overflow-hidden border-b border-r border-border bg-slate-100 px-1.5 py-2 font-bold text-slate-600 last:border-r-0 whitespace-nowrap',
              col.id === 'actions' && 'sticky right-0 z-20 w-[112px] border-l bg-slate-100 shadow-[-4px_0_8px_rgba(15,23,42,0.08)]',
            )}
          >
            <ColumnFilterLabel column={col} options={filterOptions[col.id] || []} value={filterValues[col.id] || ''} onChange={onFilterChange} sort={sort} onSortChange={onSortChange} />
          </th>
        ))}
      </tr>
      <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
        {senderColumns.map((col) => (
          <th
            key={col.id}
            style={ALL_ORDERS_STICKY_COLUMN_IDS.includes(col.id) ? { left: getAllOrdersStickyLeft(col.id) } : undefined}
            className={clsx(
              'overflow-hidden border-b border-r border-border px-1.5 py-2.5 font-bold whitespace-nowrap',
              ALL_ORDERS_STICKY_COLUMN_IDS.includes(col.id) && 'sticky z-30 bg-slate-100',
              col.id === ALL_ORDERS_STICKY_COLUMN_IDS.at(-1) && 'shadow-[5px_0_8px_rgba(15,23,42,0.10)]',
            )}
          >
            <ColumnFilterLabel column={col} options={filterOptions[col.id] || []} value={filterValues[col.id] || ''} onChange={onFilterChange} sort={sort} onSortChange={onSortChange} />
          </th>
        ))}
        {financialColumns.map((col) => (
          <th
            key={col.id}
            className={clsx(
              'overflow-hidden border-b border-r border-border px-1.5 py-2.5 font-bold whitespace-nowrap',
              col.headerClass,
            )}
          >
            <ColumnFilterLabel column={col} options={filterOptions[col.id] || []} value={filterValues[col.id] || ''} onChange={onFilterChange} sort={sort} onSortChange={onSortChange} />
          </th>
        ))}
      </tr>
    </>
  );
}
