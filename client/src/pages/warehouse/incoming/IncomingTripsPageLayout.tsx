import { AlertTriangle, ArrowLeft, CalendarDays, Loader2, RefreshCw, Truck as TruckIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatFilterDateLabel, formatUpdatedAt, type IncomingTripSummary } from './incomingTripUtils';
import { IncomingStateBlock } from './IncomingTripTable';

export function IncomingTripsPageLayout({
  title,
  subtitle,
  isLoading,
  error,
  updatedAt,
  filterDate = '',
  onFilterDateChange,
  summary,
  children,
}: {
  title: string;
  subtitle: string;
  isLoading: boolean;
  error: string;
  updatedAt: Date | null;
  filterDate?: string;
  onFilterDateChange?: (value: string) => void;
  summary?: IncomingTripSummary;
  children: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 flex items-center gap-2 shrink-0">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border bg-card p-3 shrink-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="h-9 w-9 shrink-0 rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted flex items-center justify-center md:w-auto md:px-3 md:gap-2"
            >
              <ArrowLeft size={15} />
              <span className="hidden md:inline text-[13px] font-medium">Quay lại</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <TruckIcon size={17} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-extrabold text-foreground md:text-[17px]">{title}</h1>
                <p className="hidden text-[12px] font-medium text-muted-foreground md:block">{subtitle}</p>
              </div>
            </div>
            <div className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 text-[11px] font-bold text-muted-foreground">
              <RefreshCw size={13} className={isLoading ? 'animate-spin text-primary' : 'text-primary'} />
              <span>{formatUpdatedAt(updatedAt)}</span>
            </div>
          </div>

          {summary && onFilterDateChange && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/10 p-2">
                <label className="inline-flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground">
                  <CalendarDays size={14} className="shrink-0 text-primary" />
                  <span className="shrink-0 text-muted-foreground">Lọc ngày</span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(event) => onFilterDateChange(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-[12px] font-extrabold outline-none"
                  />
                </label>
                {filterDate && (
                  <button
                    type="button"
                    onClick={() => onFilterDateChange('')}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-white px-3 text-[12px] font-extrabold text-muted-foreground hover:bg-muted"
                  >
                    <X size={14} />
                    Bỏ lọc
                  </button>
                )}
                <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                  <SummaryChip label="Tổng chuyến" value={summary.total} tone="border-slate-200 bg-white text-slate-800" />
                  <SummaryChip label="Dự kiến đến" value={summary.expectedArriving} tone="border-amber-200 bg-amber-50 text-amber-800" />
                  <SummaryChip label="Đã đến" value={summary.arrived} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {filterDate
                  ? `Đang lọc ngày ${formatFilterDateLabel(filterDate)} — số liệu tổng hợp theo ngày đã chọn.`
                  : 'Chưa chọn ngày — số liệu tổng hợp trên toàn bộ chuyến đang hiển thị.'}
              </p>
            </>
          )}
        </div>

        {isLoading ? (
          <IncomingStateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải danh sách xe" />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 md:p-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 ${tone}`}>
      <span className="text-[11px] font-bold">{label}</span>
      <span className="text-[15px] font-black tabular-nums">{value}</span>
    </div>
  );
}
