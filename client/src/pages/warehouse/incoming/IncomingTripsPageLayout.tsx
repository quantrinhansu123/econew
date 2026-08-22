import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Hash,
  ListFilter,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  Truck as TruckIcon,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { FilterSelect } from '../../../components/ui/FilterSelect';
import {
  formatCollectAmount,
  formatFilterDateRangeLabel,
  formatUpdatedAt,
  type IncomingPaymentStatusOption,
  type IncomingStatusOption,
  type IncomingTripSummary,
  type IncomingVendorCodeOption,
} from './incomingTripUtils';
import { IncomingStateBlock } from './IncomingTripTable';

interface IncomingTripsPageLayoutProps {
  title: string;
  subtitle: string;
  isLoading: boolean;
  error: string;
  updatedAt: Date | null;
  keyword?: string;
  onKeywordChange?: (value: string) => void;
  filterFromDate?: string;
  filterToDate?: string;
  onFilterFromDateChange?: (value: string) => void;
  onFilterToDateChange?: (value: string) => void;
  vendorCodeOptions?: IncomingVendorCodeOption[];
  vendorCode?: string;
  onVendorCodeChange?: (value: string) => void;
  onOpenVendorLedger?: () => void;
  isVendorLedgerLoading?: boolean;
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
  compact?: boolean;
  children: ReactNode;
}

export function IncomingTripsPageLayout({
  title,
  subtitle,
  isLoading,
  error,
  updatedAt,
  keyword = '',
  onKeywordChange,
  filterFromDate = '',
  filterToDate = '',
  onFilterFromDateChange,
  onFilterToDateChange,
  vendorCodeOptions = [],
  vendorCode = '',
  onVendorCodeChange,
  onOpenVendorLedger,
  isVendorLedgerLoading = false,
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
  compact = false,
  children,
}: IncomingTripsPageLayoutProps) {
  const showFilters = !compact
    && summary
    && onKeywordChange
    && onFilterFromDateChange
    && onFilterToDateChange
    && onVendorCodeChange
    && enabledPlates
    && onPlatesChange
    && enabledStatuses
    && onStatusesChange
    && enabledPaymentStatuses
    && onPaymentStatusesChange;
  const hasKeywordFilter = Boolean(keyword.trim());
  const hasDateFilter = Boolean(filterFromDate || filterToDate);
  const hasVendorFilter = Boolean(vendorCode.trim());
  const hasPlateFilter = plateOptions.length > 0 && enabledPlates && enabledPlates.size !== plateOptions.length;
  const hasStatusFilter = statusOptions.length > 0 && enabledStatuses && enabledStatuses.size !== statusOptions.length;
  const hasPaymentStatusFilter = paymentStatusOptions.length > 0 && enabledPaymentStatuses && enabledPaymentStatuses.size !== paymentStatusOptions.length;
  const hasAnyFilter = hasKeywordFilter || hasDateFilter || hasVendorFilter || hasPlateFilter || hasStatusFilter || hasPaymentStatusFilter;

  if (compact) {
    return (
      <div className="h-full min-h-0 flex flex-col gap-2">
        {error && <ErrorBanner error={error} />}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card p-2 shrink-0">
            <BackButton />
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <TruckIcon size={17} />
              </div>
              <h1 className="truncate text-[15px] font-extrabold text-foreground md:text-[17px]">{title}</h1>
            </div>
            <UpdatedAt isLoading={isLoading} updatedAt={updatedAt} />
          </div>
          {isLoading ? (
            <IncomingStateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải danh sách xe" />
          ) : (
            <div className="flex flex-1 min-h-0 w-full flex-col overflow-auto custom-scrollbar p-2">{children}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2 sm:gap-3">
      {error && <ErrorBanner error={error} />}

      <div className="rounded-xl border border-border bg-white px-4 py-3 text-[13px] text-muted-foreground shadow-sm">
        <span className="font-bold text-foreground">{title}</span>
        {' — '}
        {subtitle}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <FilterSummaryCard
            label="Tổng phải thu từ bill (theo bộ lọc)"
            value={isLoading ? '…' : formatCollectAmount(summary.totalCollect)}
            tone="blue"
          />
          <FilterSummaryCard
            label={`Tổng phải trả · ${summary.payableManifestCount.toLocaleString('vi-VN')} bảng kê đã khởi hành`}
            value={isLoading ? '…' : formatCollectAmount(summary.totalPayable)}
            tone="emerald"
          />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        {showFilters && (
          <div className="shrink-0 space-y-2 border-b border-border bg-card p-2 sm:space-y-3 sm:p-3">
            <div className="flex flex-wrap items-center gap-2">
              <BackButton />
              <div className="relative min-w-0 basis-full flex-1 md:basis-auto md:max-w-[390px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={keyword}
                  onChange={(event) => onKeywordChange(event.target.value)}
                  placeholder="Tìm BKS, bảng kê, tuyến, tài xế, mã NCC..."
                  aria-label="Tìm toàn bộ dữ liệu chuyến xe"
                  className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <FilterSelect
                icon={Hash}
                placeholder="Lọc mã NCC"
                searchPlaceholder="Tìm theo mã NCC..."
                options={[{ value: '', label: 'Tất cả mã NCC' }, ...vendorCodeOptions]}
                value={vendorCode}
                onValueChange={onVendorCodeChange}
                className="min-w-0 flex-1 md:w-[210px] md:flex-none"
              />
              <button
                type="button"
                disabled={!vendorCode.trim() || isVendorLedgerLoading}
                onClick={onOpenVendorLedger}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-bold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={vendorCode.trim() ? `Mở bảng kê đối soát NCC ${vendorCode}` : 'Chọn mã NCC để mở bảng kê'}
              >
                {isVendorLedgerLoading ? <Loader2 size={15} className="animate-spin" /> : <ReceiptText size={15} />}
                <span>Bảng kê NCC</span>
              </button>
              <div className="hidden flex-1 md:block" />
              <DateRangePicker
                value={{ from: filterFromDate, to: filterToDate }}
                onChange={({ from, to }) => {
                  onFilterFromDateChange(from || '');
                  onFilterToDateChange(to || '');
                }}
                placeholder="Từ ngày - Đến ngày"
                className="w-full shrink-0 md:w-[18.5rem]"
              />
              {headerActions}
              <UpdatedAt isLoading={isLoading} updatedAt={updatedAt} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {plateOptions.length > 0 && (
                <FilterSelect
                  multiple
                  icon={TruckIcon}
                  placeholder="BKS"
                  searchPlaceholder="Gõ biển số..."
                  className="min-w-[160px]"
                  options={plateOptions.map((plate) => ({ value: plate, label: plate }))}
                  value={Array.from(enabledPlates)}
                  onValueChange={onPlatesChange}
                />
              )}
              {statusOptions.length > 0 && (
                <FilterSelect
                  multiple
                  icon={ListFilter}
                  placeholder="Trạng thái chuyến"
                  searchPlaceholder="Gõ trạng thái chuyến..."
                  className="min-w-[180px]"
                  options={statusOptions}
                  value={Array.from(enabledStatuses)}
                  onValueChange={onStatusesChange}
                />
              )}
              {paymentStatusOptions.length > 0 && (
                <FilterSelect
                  multiple
                  icon={Banknote}
                  placeholder="Trạng thái thanh toán"
                  searchPlaceholder="Gõ trạng thái TT..."
                  className="min-w-[200px]"
                  options={paymentStatusOptions}
                  value={Array.from(enabledPaymentStatuses)}
                  onValueChange={onPaymentStatusesChange}
                />
              )}
              {hasAnyFilter && onClearFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-extrabold text-red-500 hover:bg-red-100"
                >
                  <X size={14} />
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <p className="text-[11px] font-semibold text-muted-foreground">
              {hasAnyFilter
                ? `Đang lọc ${[
                  hasKeywordFilter ? `từ khóa “${keyword.trim()}”` : '',
                  hasDateFilter ? `ngày ${formatFilterDateRangeLabel(filterFromDate, filterToDate)}` : '',
                  hasVendorFilter ? `mã NCC ${vendorCode}` : '',
                  hasPlateFilter ? `${enabledPlates.size}/${plateOptions.length} BKS` : '',
                  hasStatusFilter ? `${enabledStatuses.size}/${statusOptions.length} trạng thái chuyến` : '',
                  hasPaymentStatusFilter ? `${enabledPaymentStatuses.size}/${paymentStatusOptions.length} TT` : '',
                ].filter(Boolean).join(' · ')} — số liệu theo bộ lọc.`
                : 'Chưa lọc — số liệu tổng hợp trên toàn bộ chuyến đang hiển thị.'}
            </p>
          </div>
        )}

        {isLoading ? (
          <IncomingStateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải danh sách xe" />
        ) : (
          <div className="flex flex-1 min-h-0 w-full flex-col overflow-hidden p-2 sm:p-3">{children}</div>
        )}
      </div>
    </div>
  );
}

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      aria-label="Quay lại"
      className="hidden h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted md:flex md:w-auto md:px-3"
    >
      <ArrowLeft size={15} />
      <span className="hidden md:inline">Quay lại</span>
    </button>
  );
}

function UpdatedAt({ isLoading, updatedAt }: { isLoading: boolean; updatedAt: Date | null }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 text-[11px] font-bold text-muted-foreground">
      <RefreshCw size={13} className={isLoading ? 'animate-spin text-primary' : 'text-primary'} />
      <span>{formatUpdatedAt(updatedAt)}</span>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
      <AlertTriangle size={16} />
      {error}
    </div>
  );
}

function FilterSummaryCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'emerald' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <div className={`min-w-0 rounded-xl border p-2.5 shadow-sm sm:rounded-2xl sm:p-4 ${toneClass}`}>
      <p className="truncate text-[9px] font-bold uppercase tracking-wide opacity-80 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-extrabold sm:mt-1 sm:text-[20px]">{value}</p>
    </div>
  );
}
