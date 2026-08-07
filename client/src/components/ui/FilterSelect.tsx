import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface Option {
  value: string;
  label: string;
  count?: number;
}

type SingleProps = {
  multiple?: false;
  value?: string;
  onValueChange: (value: string) => void;
};

type MultiProps = {
  multiple: true;
  value: string[];
  onValueChange: (value: string[]) => void;
};

type FilterSelectProps = (SingleProps | MultiProps) & {
  options: Option[];
  placeholder: string;
  icon: LucideIcon;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
};

export function FilterSelect(props: FilterSelectProps) {
  const {
    options,
    placeholder,
    icon: Icon,
    searchPlaceholder = 'Tìm kiếm...',
    className,
    disabled = false,
  } = props;
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const selectableOptions = options.filter((option) => option.value);
  const selectedValues = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedOptions = selectableOptions.filter((option) => selectedValues.includes(option.value));
  const selectedSingle = !props.multiple ? options.find((option) => option.value === props.value) : undefined;
  const displayLabel = props.multiple
    ? selectedOptions.length ? `${selectedOptions[0].label}${selectedOptions.length > 1 ? ` +${selectedOptions.length - 1}` : ''}` : placeholder
    : selectedSingle?.value ? selectedSingle.label : placeholder;
  const menuOptions = props.multiple ? selectableOptions : options;
  const filteredOptions = menuOptions.filter((option) => option.label.toLowerCase().includes(keyword.trim().toLowerCase()));
  const allSelected = selectableOptions.length > 0 && selectedValues.length === selectableOptions.length;
  const isActive = open || selectedValues.length > 0;

  const setSingleValue = (value: string) => {
    if (!props.multiple) props.onValueChange(value);
    setOpen(false);
  };

  const toggleMultiValue = (value: string) => {
    if (!props.multiple) return;
    if (!value) {
      props.onValueChange([]);
      return;
    }
    props.onValueChange(selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value]);
  };

  const clearValue = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (props.multiple) props.onValueChange([]);
    else props.onValueChange('');
  };

  const selectAll = () => {
    if (props.multiple) props.onValueChange(selectableOptions.map((option) => option.value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'flex h-10 min-w-[140px] items-center justify-between gap-2 rounded-lg border bg-card px-3 text-[13px] font-medium text-muted-foreground transition-all hover:bg-muted/20 focus:outline-none md:h-9',
            isActive ? 'border-primary text-primary shadow-sm shadow-primary/10 ring-1 ring-primary/10' : 'border-border',
            selectedValues.length > 0 && 'text-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Icon size={14} className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
            <span className="truncate">{displayLabel}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {props.multiple && selectedValues.length > 1 && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-bold text-primary">+{selectedValues.length - 1}</span>}
            {selectedValues.length > 0 && !disabled && <X size={13} className="text-muted-foreground/55 hover:text-red-500" onClick={clearValue} />}
            <ChevronDown size={14} className={cn('text-muted-foreground/65 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(288px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-border p-0 shadow-xl" align="start" sideOffset={4} collisionPadding={12}>
        <div className="border-b border-border bg-white p-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/10 md:h-9" />
          </div>
        </div>
        {props.multiple && (
          <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2 text-[13px]">
            <button type="button" onClick={selectAll} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <span className={cn('flex h-4 w-4 items-center justify-center rounded border', allSelected ? 'border-primary bg-primary text-white' : 'border-border bg-white')}>
                {allSelected && <Check size={12} />}
              </span>
              Chọn tất cả
            </button>
            <button type="button" onClick={() => clearValue()} className="font-medium text-primary hover:underline">Xóa chọn</button>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto bg-white p-2 custom-scrollbar">
          {filteredOptions.map((option) => {
            const selected = selectedValues.includes(option.value) || (!props.multiple && props.value === option.value);
            return (
              <button
                key={option.value || 'all'}
                type="button"
                onClick={() => props.multiple ? toggleMultiValue(option.value) : setSingleValue(option.value)}
                className={cn('flex h-10 w-full items-center justify-between rounded-lg px-2 text-left text-[13px] font-medium transition-colors hover:bg-slate-100 md:h-9', selected && 'bg-slate-100 text-primary')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {props.multiple && option.value && <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected ? 'border-primary bg-primary text-white' : 'border-border bg-white')}>{selected && <Check size={12} />}</span>}
                  <span className="truncate">{option.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  {option.count !== undefined && <span className="text-[12px] text-primary">{option.count}</span>}
                  {!props.multiple && selected && <Check size={15} className="text-primary" />}
                </span>
              </button>
            );
          })}
          {!filteredOptions.length && <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">Không có kết quả.</div>}
        </div>
        {props.multiple && <div className="flex items-center justify-between border-t border-border bg-slate-50 px-3 py-2 text-[12px] text-muted-foreground"><span>{selectedValues.length} / {selectableOptions.length} đã chọn</span><button type="button" onClick={() => setOpen(false)} className="font-medium text-primary">Xong</button></div>}
      </PopoverContent>
    </Popover>
  );
}
