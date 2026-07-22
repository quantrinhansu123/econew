import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IncomingTripTable } from './warehouse/incoming/IncomingTripTable';
import { IncomingExpectedTripCards } from './warehouse/incoming/IncomingExpectedTripCards';
import { IncomingTripsPageLayout } from './warehouse/incoming/IncomingTripsPageLayout';
import { IncomingTripDeleteDialog } from './warehouse/incoming/dialogs/IncomingTripDeleteDialog';
import { IncomingTripDetailDialog } from './warehouse/incoming/dialogs/IncomingTripDetailDialog';
import { IncomingTripPaymentDialog } from './warehouse/incoming/dialogs/IncomingTripPaymentDialog';
import {
  collectPaymentStatusOptions,
  collectPlateOptions,
  collectStatusOptions,
  collectVendorOptions,
  filterTripsByDateRange,
  filterTripsByPaymentStatuses,
  filterTripsByPlates,
  filterTripsByStatuses,
  filterTripsByVendors,
  formatFilterDateRangeLabel,
  hasActiveIncomingFilters,
  getManifestId,
  sortTrips,
  summarizeIncomingTrips,
} from './warehouse/incoming/incomingTripUtils';
import type { IncomingVendorPaymentStatus } from './warehouse/incoming/incomingTripUtils';
import { useIncomingTripActions } from './warehouse/incoming/useIncomingTripActions';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';
import { downloadIncomingTripsExcel } from './warehouse/incoming/incomingTripsExcelUtils';
import type { IncomingTrip } from './warehouse/incoming/types';

export interface WarehouseIncomingPageProps {
  mode?: 'overview' | 'expected-arrivals';
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

export default function WarehouseIncomingPage({
  mode = 'overview',
  title = 'Tất cả chuyến xe',
  subtitle = 'Theo dõi chuyến xe, ngày đến, BKS, tài xế và nhà cung cấp.',
  emptyText = 'Chưa có chuyến xe.',
}: WarehouseIncomingPageProps = {}) {
  const navigate = useNavigate();
  const { trips, isLoading, error, updatedAt, refresh } = useIncomingTrips({ source: mode });
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [enabledVendors, setEnabledVendors] = useState<Set<string>>(new Set());
  const [enabledPlates, setEnabledPlates] = useState<Set<string>>(new Set());
  const [enabledStatuses, setEnabledStatuses] = useState<Set<string>>(new Set());
  const [enabledPaymentStatuses, setEnabledPaymentStatuses] = useState<Set<IncomingVendorPaymentStatus>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const actions = useIncomingTripActions(refresh);

  const vendorOptions = useMemo(() => collectVendorOptions(trips), [trips]);
  const plateOptions = useMemo(() => collectPlateOptions(trips), [trips]);
  const statusOptions = useMemo(() => collectStatusOptions(trips), [trips]);
  const statusValues = useMemo(() => statusOptions.map((option) => option.value), [statusOptions]);
  const paymentStatusOptions = useMemo(() => collectPaymentStatusOptions(trips), [trips]);
  const paymentStatusValues = useMemo(() => paymentStatusOptions.map((option) => option.value), [paymentStatusOptions]);

  useEffect(() => {
    // Đồng bộ các lựa chọn khi API trả thêm/bớt nhà cung cấp.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledVendors((previous) => {
      const next = new Set(previous);
      let changed = false;
      vendorOptions.forEach((vendor) => {
        if (!next.has(vendor)) {
          next.add(vendor);
          changed = true;
        }
      });
      [...next].forEach((vendor) => {
        if (!vendorOptions.includes(vendor)) {
          next.delete(vendor);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [vendorOptions]);

  useEffect(() => {
    // Đồng bộ các lựa chọn khi API trả thêm/bớt biển số.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledPlates((previous) => {
      const next = new Set(previous);
      let changed = false;
      plateOptions.forEach((plate) => {
        if (!next.has(plate)) {
          next.add(plate);
          changed = true;
        }
      });
      [...next].forEach((plate) => {
        if (!plateOptions.includes(plate)) {
          next.delete(plate);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [plateOptions]);

  useEffect(() => {
    // Đồng bộ các lựa chọn khi API trả thêm/bớt trạng thái chuyến.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledStatuses((previous) => {
      const next = new Set(previous);
      let changed = false;
      statusValues.forEach((status) => {
        if (!next.has(status)) {
          next.add(status);
          changed = true;
        }
      });
      [...next].forEach((status) => {
        if (!statusValues.includes(status)) {
          next.delete(status);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [statusValues]);

  useEffect(() => {
    // Đồng bộ các lựa chọn khi API trả thêm/bớt trạng thái thanh toán.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledPaymentStatuses((previous) => {
      const next = new Set(previous);
      let changed = false;
      paymentStatusValues.forEach((status) => {
        if (!next.has(status)) {
          next.add(status);
          changed = true;
        }
      });
      [...next].forEach((status) => {
        if (!paymentStatusValues.includes(status)) {
          next.delete(status);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [paymentStatusValues]);

  const handleVendorToggle = useCallback((vendor: string) => {
    setEnabledVendors((previous) => {
      const next = new Set(previous);
      if (next.has(vendor)) next.delete(vendor);
      else next.add(vendor);
      return next;
    });
  }, []);

  const handlePlatesChange = useCallback((plates: string[]) => {
    setEnabledPlates(new Set(plates));
  }, []);

  const handleStatusesChange = useCallback((statuses: string[]) => {
    setEnabledStatuses(new Set(statuses));
  }, []);

  const handlePaymentStatusesChange = useCallback((statuses: string[]) => {
    setEnabledPaymentStatuses(new Set(statuses as IncomingVendorPaymentStatus[]));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilterFromDate('');
    setFilterToDate('');
    setEnabledVendors(new Set(vendorOptions));
    setEnabledPlates(new Set(plateOptions));
    setEnabledStatuses(new Set(statusValues));
    setEnabledPaymentStatuses(new Set(paymentStatusValues));
  }, [vendorOptions, plateOptions, statusValues, paymentStatusValues]);

  const filteredTrips = useMemo(() => {
    let result = filterTripsByDateRange(trips, filterFromDate, filterToDate);
    result = filterTripsByPlates(result, enabledPlates, plateOptions);
    result = filterTripsByStatuses(result, enabledStatuses, statusValues);
    result = filterTripsByPaymentStatuses(result, enabledPaymentStatuses, paymentStatusValues);
    result = filterTripsByVendors(result, enabledVendors, vendorOptions);
    return result;
  }, [trips, filterFromDate, filterToDate, enabledPlates, plateOptions, enabledStatuses, statusValues, enabledPaymentStatuses, paymentStatusValues, enabledVendors, vendorOptions]);

  const summary = useMemo(() => summarizeIncomingTrips(filteredTrips), [filteredTrips]);
  const displayTrips = useMemo(() => sortTrips(filteredTrips), [filteredTrips]);
  const viewTrip = useMemo(() => {
    if (!actions.viewTrip) return null;
    return displayTrips.find((item) => String(item.id) === String(actions.viewTrip?.id)) ?? actions.viewTrip;
  }, [actions.viewTrip, displayTrips]);
  const filtersActive = hasActiveIncomingFilters(
    filterFromDate,
    filterToDate,
    enabledVendors,
    vendorOptions,
    enabledPlates,
    plateOptions,
    enabledStatuses,
    statusValues,
    enabledPaymentStatuses,
    paymentStatusValues,
  );

  const emptyHint = filtersActive
    ? `Không có chuyến phù hợp bộ lọc${filterFromDate || filterToDate ? ` (${formatFilterDateRangeLabel(filterFromDate, filterToDate)})` : ''}.`
    : '';

  const handleDownloadExcel = useCallback(() => {
    setExportError('');
    if (!displayTrips.length) {
      setExportError('Không có chuyến xe phù hợp để xuất Excel.');
      return;
    }
    setIsExporting(true);
    try {
      const filterSummary = [
        filterFromDate || filterToDate ? `Ngày ${formatFilterDateRangeLabel(filterFromDate, filterToDate)}` : 'Tất cả ngày',
        enabledPlates.size !== plateOptions.length ? `${enabledPlates.size}/${plateOptions.length} BKS` : '',
        enabledStatuses.size !== statusValues.length ? `${enabledStatuses.size}/${statusValues.length} trạng thái chuyến` : '',
        enabledPaymentStatuses.size !== paymentStatusValues.length ? `${enabledPaymentStatuses.size}/${paymentStatusValues.length} trạng thái thanh toán` : '',
        enabledVendors.size !== vendorOptions.length ? `${enabledVendors.size}/${vendorOptions.length} nhà cung cấp` : '',
      ].filter(Boolean).join(' · ');
      const success = downloadIncomingTripsExcel(displayTrips, filterSummary, {
        title: title.toLocaleUpperCase('vi-VN'),
        filePrefix: mode === 'overview' ? 'tat-ca-chuyen-xe' : 'xe-dang-den',
      });
      if (!success) setExportError('Không có dữ liệu để xuất Excel.');
    } catch {
      setExportError('Không thể tạo file Excel danh sách chuyến xe.');
    } finally {
      setIsExporting(false);
    }
  }, [displayTrips, enabledPaymentStatuses, enabledPlates, enabledStatuses, enabledVendors, filterFromDate, filterToDate, mode, paymentStatusValues.length, plateOptions.length, statusValues.length, title, vendorOptions.length]);

  const handleViewManifest = useCallback((trip: IncomingTrip) => {
    const manifestId = getManifestId(trip);
    if (!manifestId) return;
    navigate(`/warehouse/manifests/${encodeURIComponent(String(manifestId))}`);
  }, [navigate]);

  const handlePrintManifest = useCallback((trip: IncomingTrip) => {
    const manifestId = getManifestId(trip);
    if (!manifestId) return;
    window.open(`/print/manifest/${encodeURIComponent(String(manifestId))}`, '_blank', 'noopener');
  }, []);

  return (
    <>
      <IncomingTripsPageLayout
        title={title}
        subtitle={subtitle}
        isLoading={isLoading}
        error={exportError || error}
        updatedAt={updatedAt}
        filterFromDate={filterFromDate}
        filterToDate={filterToDate}
        onFilterFromDateChange={setFilterFromDate}
        onFilterToDateChange={setFilterToDate}
        vendorOptions={vendorOptions}
        enabledVendors={enabledVendors}
        onVendorToggle={handleVendorToggle}
        plateOptions={plateOptions}
        enabledPlates={enabledPlates}
        onPlatesChange={handlePlatesChange}
        statusOptions={statusOptions}
        enabledStatuses={enabledStatuses}
        onStatusesChange={handleStatusesChange}
        paymentStatusOptions={paymentStatusOptions}
        enabledPaymentStatuses={enabledPaymentStatuses}
        onPaymentStatusesChange={handlePaymentStatusesChange}
        onClearFilters={handleClearFilters}
        summary={summary}
        headerActions={
          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={isLoading || isExporting || !displayTrips.length}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        }
      >
        {mode === 'expected-arrivals' ? (
          <IncomingExpectedTripCards
            trips={displayTrips}
            emptyText={emptyHint || emptyText}
            onViewManifest={handleViewManifest}
            onPrintManifest={handlePrintManifest}
          />
        ) : (
          <IncomingTripTable
            trips={displayTrips}
            emptyText={emptyHint || emptyText}
            showOriginColumn
            canDelete={actions.canDelete}
            canPay={actions.canPay}
            onView={actions.handleView}
            onEdit={actions.handleEdit}
            onDelete={actions.handleDelete}
            onPayment={actions.handlePayment}
          />
        )}
      </IncomingTripsPageLayout>

      <IncomingTripDeleteDialog
        trip={actions.deleteTrip}
        isSubmitting={actions.isSubmitting}
        error={actions.actionError}
        onClose={actions.closeDelete}
        onConfirm={() => void actions.confirmDelete()}
      />
      <IncomingTripPaymentDialog
        trip={actions.paymentTrip}
        isSubmitting={actions.isSubmitting}
        error={actions.actionError}
        onClose={actions.closePayment}
        onConfirm={(payload) => void actions.confirmPayment(payload)}
      />
      <IncomingTripDetailDialog
        trip={viewTrip}
        onClose={actions.closeView}
      />
    </>
  );
}
