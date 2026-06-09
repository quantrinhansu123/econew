import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { vi } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type DateRangeValue = {
  from?: string;
  to?: string;
};

type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatDate = (date?: Date) => date ? new Intl.DateTimeFormat('vi-VN').format(date) : '';

const toDateInputValue = (date?: Date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function DateRangePicker({ value, onChange, placeholder = 'Chọn khoảng ngày', className = '', disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo<DateRange>(() => ({ from: parseDate(value.from), to: parseDate(value.to) }), [value.from, value.to]);
  const label = selected.from && selected.to
    ? `${formatDate(selected.from)} - ${formatDate(selected.to)}`
    : selected.from
      ? `${formatDate(selected.from)} - ...`
      : placeholder;

  const handleSelect = (range?: DateRange) => {
    onChange({ from: toDateInputValue(range?.from), to: toDateInputValue(range?.to) });
  };

  const clear = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onChange({ from: '', to: '' });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`inline-flex h-10 min-w-[17rem] max-w-full items-center gap-2 rounded-lg border border-border bg-white px-3 text-left text-[13px] font-bold text-foreground shadow-sm transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        >
          <CalendarDays size={16} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {(value.from || value.to) && (
            <span onClick={clear} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={13} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="z-[10000] w-auto overflow-hidden rounded-xl border border-border bg-white p-0 shadow-xl shadow-slate-900/10">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          locale={vi}
          numberOfMonths={2}
          className="border-0 shadow-none"
        />
      </PopoverContent>
    </Popover>
  );
}
