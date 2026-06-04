import { useMemo, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { vi } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type DayPickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const toDate = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const toDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value: string) => {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('vi-VN').format(date) : '';
};

export function DayPicker({ value, onChange, placeholder = 'Chọn ngày', className, disabled }: DayPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => toDate(value), [value]);
  const [month, setMonth] = useState<Date>(selectedDate || new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={clsx(
            'relative flex h-10 w-full items-center rounded-xl border border-border bg-card pl-10 pr-9 text-left text-[13px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60',
            value ? 'text-foreground' : 'text-muted-foreground',
            className,
          )}
        >
          <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <span className="truncate whitespace-nowrap">{value ? formatDisplayDate(value) : placeholder}</span>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Xóa ngày"
              onClick={event => { event.stopPropagation(); onChange(''); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onChange(''); } }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={14} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[10000] w-auto rounded-2xl border-border p-0 shadow-xl outline-none">
        <Calendar
          mode="single"
          selected={selectedDate}
          month={month}
          onMonthChange={setMonth}
          onSelect={date => { if (date) { onChange(toDateValue(date)); setMonth(date); setOpen(false); } }}
          locale={vi}
          weekStartsOn={1}
          className="rounded-2xl"
          classNames={{
            month_caption: 'flex h-8 w-full items-center justify-center px-8 text-[13px] font-extrabold text-foreground',
            button_previous: 'size-8 rounded-xl border border-border bg-white p-0 text-foreground hover:bg-muted',
            button_next: 'size-8 rounded-xl border border-border bg-white p-0 text-foreground hover:bg-muted',
            weekday: 'flex-1 rounded-md py-1 text-[11px] font-bold text-muted-foreground select-none',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
