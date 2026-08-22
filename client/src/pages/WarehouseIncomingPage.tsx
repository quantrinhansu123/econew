import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import VendorDetailDialog from './admin/vendors/dialogs/VendorDetailDialog';
import type { Vendor, VendorListResponse } from './admin/vendors/types';
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
  collectVendorCodeOptions,
  filterTripsByDateRange,
  filterTripsByPaymentStatuses,
  filterTripsByPlates,
  filterTripsByStatuses,
  filterTripsByKeyword,
  filterTripsByVendorCode,
  formatFilterDateRangeLabel,
  hasActiveIncomingFilters,
  getManifestId,
  sortTrips,
  summarizeIncomingTrips,
} from './warehouse/incoming/incomingTripUtils';
import type { IncomingVendorPaymentStatus } from './warehouse/incoming/incomingTripUtils';
import { getPrimaryTripActionForTrip } from './trips/tripKanbanUtils';
import TripStatusActionDialog from './trips/dialogs/TripStatusActionDialog';
import type { TripAction } from './trips/types';
import { useIncomingTripActions } from './warehouse/incoming/useIncomingTripActions';
import { useIncomingTrips } from './warehouse/incoming/useIncomingTrips';
import { downloadIncomingTripsExcel } from './warehouse/incoming/incomingTripsExcelUtils';
import type { IncomingTrip } from './warehouse/incoming/types';
import VehicleManifestButton from './warehouse/inventory/VehicleManifestButton';

export interface WarehouseIncomingPageProps {
  mode?: 'overview' | 'expected-arrivals';
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

export default function WarehouseIncomingPage({
  mode = 'overview',
  title = 'Tất cả chuyến xe',
  subtitle = 'Theo dõi chuyến xe, cước đơn, chi phí phát sinh và thanh toán nhà cung cấp.',
  emptyText = 'Chưa có chuyến xe.',
}: WarehouseIncomingPageProps = {}) {
  const navigate = useNavigate();
  const { trips, isLoading, error, updatedAt, refresh, updateTrip } = useIncomingTrips({ source: mode });
  const [keyword, setKeyword] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [enabledPlates, setEnabledPlates] = useState<Set<string>>(new Set());
  const [enabledStatuses, setEnabledStatuses] = useState<Set<string>>(new Set());
  const [enabledPaymentStatuses, setEnabledPaymentStatuses] = useState<Set<IncomingVendorPaymentStatus>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [ledgerVendor, setLedgerVendor] = useState<Vendor | null>(null);
  const [isLedgerVendorLoading, setIsLedgerVendorLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [statusActionTrip, setStatusActionTrip] = useState<IncomingTrip | null>(null);
  const [statusAction, setStatusAction] = useState<TripAction | null>(null);
  const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);
  const [statusActionError, setStatusActionError] = useState('');

  const actions = useIncomingTripActions(refresh);

  const vendorCodeOptions = useMemo(() => collectVendorCodeOptions(trips), [trips]);
  const plateOptions = useMemo(() => collectPlateOptions(trips), [trips]);
  const statusOptions = useMemo(() => collectStatusOptions(trips), [trips]);
  const statusValues = useMemo(() => statusOptions.map((option) => option.value), [statusOptions]);
  const paymentStatusOptions = useMemo(() => collectPaymentStatusOptions(trips), [trips]);
  const paymentStatusValues = useMemo(() => paymentStatusOptions.map((option) => option.value), [paymentStatusOptions]);

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
    setKeyword('');
    setFilterFromDate('');
    setFilterToDate('');
    setVendorCode('');
    setEnabledPlates(new Set(plateOptions));
    setEnabledStatuses(new Set(statusValues));
    setEnabledPaymentStatuses(new Set(paymentStatusValues));
  }, [plateOptions, statusValues, paymentStatusValues]);

  const filteredTrips = useMemo(() => {
    let result = filterTripsByKeyword(trips, keyword);
    result = filterTripsByDateRange(result, filterFromDate, filterToDate);
    result = filterTripsByPlates(result, enabledPlates, plateOptions);
    result = filterTripsByStatuses(result, enabledStatuses, statusValues);
    result = filterTripsByPaymentStatuses(result, enabledPaymentStatuses, paymentStatusValues);
    result = filterTripsByVendorCode(result, vendorCode);
    return result;
  }, [trips, keyword, filterFromDate, filterToDate, enabledPlates, plateOptions, enabledStatuses, statusValues, enabledPaymentStatuses, paymentStatusValues, vendorCode]);

  const summary = useMemo(() => summarizeIncomingTrips(filteredTrips), [filteredTrips]);
  const displayTrips = useMemo(() => sortTrips(filteredTrips), [filteredTrips]);
  const viewTrip = useMemo(() => {
    if (!actions.viewTrip) return null;
    return displayTrips.find((item) => String(item.id) === String(actions.viewTrip?.id)) ?? actions.viewTrip;
  }, [actions.viewTrip, displayTrips]);
  const filtersActive = hasActiveIncomingFilters(
    filterFromDate,
    filterToDate,
    keyword,
    vendorCode,
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
        vendorCode ? `Mã NCC ${vendorCode}` : '',
        keyword.trim() ? `Tìm kiếm “${keyword.trim()}”` : '',
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
  }, [displayTrips, enabledPaymentStatuses, enabledPlates, enabledStatuses, filterFromDate, filterToDate, keyword, mode, paymentStatusValues.length, plateOptions.length, statusValues.length, title, vendorCode]);

  const handleOpenVendorLedger = useCallback(async () => {
    const code = vendorCode.trim();
    if (!code) return;
    setExportError('');
    setIsLedgerVendorLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '100', keyword: code });
      const response = await apiRequest<VendorListResponse | Vendor[]>(`/vendors?${params.toString()}`);
      const vendors = Array.isArray(response) ? response : response.items || response.data || response.vendors || [];
      const vendor = vendors.find((item) => item.code?.trim().toLocaleUpperCase('vi-VN') === code.toLocaleUpperCase('vi-VN'));
      if (!vendor) {
        setExportError(`Không tìm thấy mã NCC ${code}.`);
        return;
      }
      try {
        setLedgerVendor(await apiRequest<Vendor>(`/vendors/${vendor.id}`));
      } catch {
        setLedgerVendor(vendor);
      }
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : `Không mở được bảng kê NCC ${code}.`);
    } finally {
      setIsLedgerVendorLoading(false);
    }
  }, [vendorCode]);

  const handleOpenTrip = useCallback((trip: IncomingTrip) => {
    navigate(`/trips/${encodeURIComponent(String(trip.id))}`);
  }, [navigate]);

  const handleEditTrip = useCallback((trip: IncomingTrip) => {
    navigate(`/trips/${encodeURIComponent(String(trip.id))}?edit=manifest`);
  }, [navigate]);

  const handleOpenTripExpenses = useCallback((trip: IncomingTrip) => {
    navigate(`/trips/${encodeURIComponent(String(trip.id))}/expenses`);
  }, [navigate]);

  const handleTripCostSave = useCallback(async (trip: IncomingTrip, amount: number) => {
    setExportError('');
    try {
      const updated = await apiRequest<IncomingTrip>(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: { trip_cost: amount },
      });
      updateTrip(trip.id, { trip_cost: updated.trip_cost ?? amount });
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Không lưu được cước chuyến đường trục.');
      throw err;
    }
  }, [updateTrip]);

  const handlePrintManifest = useCallback((trip: IncomingTrip) => {
    const manifestId = getManifestId(trip);
    if (!manifestId) return;
    window.open(`/print/manifest/${encodeURIComponent(String(manifestId))}`, '_blank', 'noopener');
  }, []);

  const handleOpenPrimaryTripAction = useCallback((trip: IncomingTrip) => {
    const nextAction = getPrimaryTripActionForTrip(trip);
    if (!nextAction) return;
    setStatusActionTrip(trip);
    setStatusAction(nextAction);
    setStatusActionError('');
  }, []);

  const closeStatusAction = useCallback(() => {
    if (isStatusSubmitting) return;
    setStatusActionTrip(null);
    setStatusAction(null);
    setStatusActionError('');
  }, [isStatusSubmitting]);

  const confirmStatusAction = useCallback(async () => {
    if (!statusActionTrip || !statusAction) return;
    setIsStatusSubmitting(true);
    setStatusActionError('');
    try {
      await apiRequest(`/trips/${statusActionTrip.id}/${statusAction}`, { method: 'PATCH' });
      setStatusActionTrip(null);
      setStatusAction(null);
      await refresh(false);
    } catch (err) {
      setStatusActionError(err instanceof ApiError ? err.message : 'Không cập nhật được trạng thái chuyến.');
    } finally {
      setIsStatusSubmitting(false);
    }
  }, [refresh, statusAction, statusActionTrip]);

  return (
    <>
      <IncomingTripsPageLayout
        title={title}
        subtitle={subtitle}
        isLoading={isLoading}
        error={exportError || error}
        updatedAt={updatedAt}
        compact={mode === 'expected-arrivals'}
        keyword={keyword}
        onKeywordChange={setKeyword}
        filterFromDate={filterFromDate}
        filterToDate={filterToDate}
        onFilterFromDateChange={setFilterFromDate}
        onFilterToDateChange={setFilterToDate}
        vendorCodeOptions={vendorCodeOptions}
        vendorCode={vendorCode}
        onVendorCodeChange={setVendorCode}
        onOpenVendorLedger={handleOpenVendorLedger}
        isVendorLedgerLoading={isLedgerVendorLoading}
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
        headerActions={mode === 'overview' ? (
          <>
            <VehicleManifestButton />
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isLoading || isExporting || !displayTrips.length}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span className="hidden sm:inline">Xuất Excel</span>
            </button>
          </>
        ) : undefined}
      >
        {mode === 'expected-arrivals' ? (
          <IncomingExpectedTripCards
            trips={displayTrips}
            emptyText={emptyHint || emptyText}
            onOpen={handleOpenTrip}
            onEdit={handleEditTrip}
            onPrint={handlePrintManifest}
            onExpenses={handleOpenTripExpenses}
            onPrimaryAction={handleOpenPrimaryTripAction}
          />
        ) : (
          <IncomingTripTable
            trips={displayTrips}
            emptyText={emptyHint || emptyText}
            showOriginColumn
            canDelete={actions.canDelete}
            canPay={actions.canPay}
            canEditCost={actions.canDelete}
            onView={actions.handleView}
            onEdit={actions.handleEdit}
            onDelete={actions.handleDelete}
            onPayment={actions.handlePayment}
            onTripCostSave={handleTripCostSave}
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
      <VendorDetailDialog
        key={ledgerVendor ? `vendor-ledger-${ledgerVendor.id}` : 'vendor-ledger-closed'}
        vendor={ledgerVendor}
        loading={isLedgerVendorLoading}
        canManage={false}
        initialTab="thanh-toan"
        onClose={() => setLedgerVendor(null)}
        onEdit={() => undefined}
      />
      <TripStatusActionDialog
        trip={statusActionTrip}
        action={statusAction}
        isSubmitting={isStatusSubmitting}
        error={statusActionError}
        onClose={closeStatusAction}
        onConfirm={() => void confirmStatusAction()}
      />
    </>
  );
}
