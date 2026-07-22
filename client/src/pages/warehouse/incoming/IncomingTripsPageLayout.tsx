import { AlertTriangle, ArrowLeft, Banknote, CalendarDays, ListFilter, Loader2, RefreshCw, Truck as TruckIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { FilterSelect } from '../../../components/ui/FilterSelect';
import {
  formatCollectAmount,
  formatFilterDateRangeLabel,
  formatUpdatedAt,
  type IncomingPaymentStatusOption,
  type IncomingStatusOption,
  type IncomingTripSummary,
} from './incomingTripUtils';
import { IncomingStateBlock } from './IncomingTripTable';

export function IncomingTripsPageLayout({
  title,
  subtitle,
  isLoading,
  error,
  updatedAt,
  filterFromDate = '',
  filterToDate = '',
  onFilterFromDateChange,
  onFilterToDateChange,
  vendorOptions = [],
  enabledVendors,
  onVendorToggle,
  plateOptions = [],
  enabledPlates,
  onPlatesChange,
  statusOptions = [],
  enabledStatuses,
  onStatusesChange,
  paymentStatusOptions = [],
  enabledPaymentStatuses,
  onPaymentStatusesChange,
  onClearFilters,
  summary,
  headerActions,
  children,
}: {
  title: string;
  subtitle: string;
  isLoading: boolean;
  error: string;
  updatedAt: Date | null;
  filterFromDate?: string;
  filterToDate?: string;
  onFilterFromDateChange?: (value: string) => void;
  onFilterToDateChange?: (value: string) => void;
  vendorOptions?: string[];
  enabledVendors?: Set<string>;
  onVendorToggle?: (vendor: string) => void;
  plateOptions?: string[];
  enabledPlates?: Set<string>;
  onPlatesChange?: (plates: string[]) => void;
  statusOptions?: IncomingStatusOption[];
  enabledStatuses?: Set<string>;
  onStatusesChange?: (statuses: string[]) => void;
  paymentStatusOptions?: IncomingPaymentStatusOption[];
  enabledPaymentStatuses?: Set<string>;
  onPaymentStatusesChange?: (statuses: string[]) => void;
  onClearFilters?: () => void;
  summary?: IncomingTripSummary;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const showFilters = summary && onFilterFromDateChange && onFilterToDateChange && enabledVendors && onVendorToggle && enabledPlates && onPlatesChange && enabledStatuses && onStatusesChange && enabledPaymentStatuses && onPaymentStatusesChange;
  const hasDateFilter = Boolean(filterFromDate || filterToDate);
  const hasVendorFilter = vendorOptions.length > 0 && enabledVendors && enabledVendors.size !== vendorOptions.length;
  const hasPlateFilter = plateOptions.length > 0 && enabledPlates && enabledPlates.size !== plateOptions.length;
  const hasStatusFilter = statusOptions.length > 0 && enabledStatuses && enabledStatuses.size !== statusOptions.length;
  const hasPaymentStatusFilter = paymentStatusOptions.length > 0 && enabledPaymentStatuses && enabledPaymentStatuses.size !== paymentStatusOptions.length;

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
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
              <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 text-[11px] font-bold text-muted-foreground">
                <RefreshCw size={13} className={isLoading ? 'animate-spin text-primary' : 'text-primary'} />
                <span>{formatUpdatedAt(updatedAt)}</span>
              </div>
            </div>
          </div>

          {showFilters && (
            <>
              <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground">
                    <CalendarDays size={14} className="shrink-0 text-primary" />
                    <span className="shrink-0 text-muted-foreground">Từ ngày</span>
                    <input
                      type="date"
                      value={filterFromDate}
                      max={filterToDate || undefined}
                      onChange={(event) => onFilterFromDateChange(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[12px] font-extrabold outline-none"
                    />
                  </label>
                  <label className="inline-flex h-9 min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-foreground">
                    <CalendarDays size={14} className="shrink-0 text-primary" />
                    <span className="shrink-0 text-muted-foreground">Đến ngày</span>
                    <input
                      type="date"
                      value={filterToDate}
                      min={filterFromDate || undefined}
                      onChange={(event) => onFilterToDateChange(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[12px] font-extrabold outline-none"
                    />
                  </label>
                  {plateOptions.length > 0 && (
                    <FilterSelect
                      multiple
                      icon={TruckIcon}
                      placeholder="BKS"
                      searchPlaceholder="Gõ biển số..."
                      className="min-w-[160px]"
                      options={plateOptions.map((plate) => ({ value: plate, label: plate }))}
                      value={Array.from(enabledPlates ?? [])}
                      onValueChange={onPlatesChange}
                    />
                  )}
                  {statusOptions.length > 0 && (
                    <FilterSelect
                      multiple
                      icon={ListFilter}
                      placeholder="Trạng thái chuyến"
                      searchPlaceholder="Gõ trạng thái chuyến..."
                      className="min-w-[160px]"
                      options={statusOptions}
                      value={Array.from(enabledStatuses ?? [])}
                      onValueChange={onStatusesChange}
                    />
                  )}
                  {paymentStatusOptions.length > 0 && (
                    <FilterSelect
                      multiple
                      icon={Banknote}
                      placeholder="Trạng thái thanh toán"
                      searchPlaceholder="Gõ trạng thái TT..."
                      className="min-w-[180px]"
                      options={paymentStatusOptions}
                      value={Array.from(enabledPaymentStatuses ?? [])}
                      onValueChange={onPaymentStatusesChange}
                    />
                  )}
                  {(hasDateFilter || hasVendorFilter || hasPlateFilter || hasStatusFilter || hasPaymentStatusFilter) && onClearFilters && (
                    <button
                      type="button"
                      onClick={onClearFilters}
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
                    <SummaryMoneyChip label="Tổng phải thu" value={formatCollectAmount(summary.totalCollect)} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
                  </div>
                </div>

                {vendorOptions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/70 bg-white px-3 py-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground shrink-0">Nhà cung cấp</span>
                    {vendorOptions.map((vendor) => {
                      const checked = enabledVendors.has(vendor);
                      return (
                        <label
                          key={vendor}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onVendorToggle(vendor)}
                            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
                          />
                          <span className="text-[12px] font-bold text-foreground">{vendor}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {hasDateFilter || hasVendorFilter || hasPlateFilter || hasStatusFilter || hasPaymentStatusFilter
                  ? `Đang lọc ${[
                    hasDateFilter ? `ngày ${formatFilterDateRangeLabel(filterFromDate, filterToDate)}` : '',
                    hasPlateFilter ? `${enabledPlates?.size ?? 0}/${plateOptions.length} BKS` : '',
                    hasStatusFilter ? `${enabledStatuses?.size ?? 0}/${statusOptions.length} trạng thái chuyến` : '',
                    hasPaymentStatusFilter ? `${enabledPaymentStatuses?.size ?? 0}/${paymentStatusOptions.length} TT` : '',
                    hasVendorFilter ? `${enabledVendors?.size ?? 0}/${vendorOptions.length} nhà cung cấp` : '',
                  ].filter(Boolean).join(' · ')} — số liệu theo bộ lọc.`
                  : 'Chưa lọc — số liệu tổng hợp trên toàn bộ chuyến đang hiển thị.'}
              </p>
            </>
          )}
        </div>

        {isLoading ? (
          <IncomingStateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải danh sách xe" />
        ) : (
          <div className="flex flex-1 min-h-0 w-full flex-col overflow-auto custom-scrollbar p-3 md:p-4">
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

function SummaryMoneyChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 ${tone}`}>
      <span className="text-[11px] font-bold">{label}</span>
      <span className="text-[13px] font-black tabular-nums">{value}</span>
    </div>
  );
}
