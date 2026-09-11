import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import {
  Banknote,
  CalendarClock,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../../lib/api';
import { ProofImageButton } from '../../../../components/ImagePreviewModal';
import { formatMoney, normalizeMoney } from '../../../../lib/formatMoney';
import type { IncomingTrip } from '../types';
import type { IncomingTripDetail } from '../incomingTripDetailTypes';
import { INCOMING_TRIP_DETAIL_TABS, type IncomingTripDetailTabId } from '../incomingTripDetailTabs';
import {
  formatNumber,
  getManifestCode,
  getManifestId,
  getPlateLabel,
  getTripStatusLabel,
  getTripStatusTone,
  getVendorPaymentStatus,
  getVendorPaymentStatusLabel,
  getVendorPaymentStatusTone,
} from '../incomingTripUtils';

const formatDateTime = (value?: string | null) => (
  value
    ? new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
    : '—'
);

const hubLabel = (hub?: { code?: string | null; name?: string | null } | null) => (
  hub?.code?.trim() || hub?.name?.trim() || '—'
);

export function IncomingTripDetailDialog({
  trip,
  onClose,
}: {
  trip: IncomingTrip | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<IncomingTripDetailTabId>('tong-quan');
  const [detail, setDetail] = useState<IncomingTripDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    if (!trip?.id) return;
    setIsLoading(true);
    setError('');
    try {
      const payload = await apiRequest<IncomingTripDetail>(`/trips/${trip.id}/incoming-detail`);
      setDetail(payload);
    } catch (err) {
      setDetail(null);
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết chuyến xe.');
    } finally {
      setIsLoading(false);
    }
  }, [trip?.id]);

  useEffect(() => {
    if (!trip) {
      setDetail(null);
      setError('');
      setActiveTab('tong-quan');
      return;
    }
    void loadDetail();
  }, [trip, trip?.vendor_paid_amount, trip?.vendor_payment_status, trip?.vendor_payment_proof_url, trip?.vendor_payment_note, loadDetail]);

  if (!trip) return null;

  const manifestId = getManifestId(trip);
  const titleCode = detail?.manifest_code || getManifestCode(trip);
  const titlePlate = detail?.license_plate || getPlateLabel(trip);

  const openManifest = () => {
    if (!manifestId) return;
    onClose();
    navigate(`/warehouse/manifests/${manifestId}`);
  };

  const paymentSummary = detail?.payment_summary;
  const displayPaidAmount = normalizeMoney(
    paymentSummary?.paid_amount
    ?? paymentSummary?.vendor_paid_amount
    ?? trip.vendor_paid_amount,
  );
  const displayPayableAmount = normalizeMoney(
    paymentSummary?.payable_amount
    ?? detail?.trip_cost
    ?? trip.trip_cost
    ?? trip.other_costs,
  );
  const displayRemainingAmount = Math.max(0, displayPayableAmount - displayPaidAmount);
  const paymentTrip = {
    ...trip,
    trip_cost: displayPayableAmount,
    vendor_paid_amount: displayPaidAmount,
    vendor_payment_status: getVendorPaymentStatus({
      ...trip,
      trip_cost: displayPayableAmount,
      vendor_paid_amount: displayPaidAmount,
    }),
  };

  const dialog = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Chi tiết chuyến xe</p>
            <h2 className="text-[16px] font-black text-foreground">{titleCode} · {titlePlate}</h2>
            <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">Chuyến #{trip.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {manifestId && (
              <button
                type="button"
                onClick={openManifest}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[12px] font-bold text-primary hover:bg-blue-50"
              >
                <ExternalLink size={14} />
                Mở bảng kê
              </button>
            )}
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border bg-slate-100 px-2 py-2">
          <div className="flex gap-1 overflow-x-auto custom-scrollbar">
            {INCOMING_TRIP_DETAIL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors',
                  activeTab === tab.id
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-foreground hover:bg-muted/60',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-semibold text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              Đang tải thông số chuyến...
            </div>
          )}
          {!isLoading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
              {error}
            </div>
          )}
          {!isLoading && !error && detail && (
            <>
              {activeTab === 'tong-quan' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard icon={<Package size={15} />} label="Bảng kê" value={detail.manifest_code || '—'} />
                  <MetricCard icon={<Package size={15} />} label="Seal" value={detail.seal_code || '—'} />
                  <MetricCard icon={<MapPin size={15} />} label="Tuyến" value={`${hubLabel(detail.origin_hub || detail.start_hub)} → ${hubLabel(detail.dest_hub || detail.end_hub)}`} />
                  <MetricCard
                    icon={<Truck size={15} />}
                    label="Trạng thái chuyến"
                    value={(
                      <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold', getTripStatusTone({ ...trip, status: detail.status }))}>
                        {getTripStatusLabel({ ...trip, status: detail.status })}
                      </span>
                    )}
                  />
                  <MetricCard icon={<CalendarClock size={15} />} label="Khởi hành" value={formatDateTime(detail.departure_time)} />
                  <MetricCard icon={<CalendarClock size={15} />} label="Dự kiến đến" value={formatDateTime(detail.expected_arrival_time)} />
                  <MetricCard icon={<CalendarClock size={15} />} label="Đã đến" value={formatDateTime(detail.arrival_time)} />
                  <MetricCard icon={<Banknote size={15} />} label="Cước chuyến (NCC)" value={formatMoney(detail.trip_cost)} />
                </div>
              )}

              {activeTab === 'hang-hoa' && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard icon={<Package size={15} />} label="Số đơn" value={(detail.waybill_count ?? 0).toLocaleString('vi-VN')} />
                  <MetricCard icon={<Package size={15} />} label="Tổng khối lượng" value={`${formatNumber(detail.planned_total_weight, 1)} kg`} />
                  <MetricCard icon={<Package size={15} />} label="Tổng thể tích" value={`${formatNumber(detail.planned_total_volume, 2)} m³`} />
                  <MetricCard icon={<Banknote size={15} />} label="Phải thu trên xe" value={formatMoney(detail.total_collect)} highlight />
                  <MetricCard icon={<Banknote size={15} />} label="Chi phí nhiên liệu" value={formatMoney(detail.fuel_cost)} />
                  <MetricCard icon={<Banknote size={15} />} label="Chi phí khác" value={formatMoney(detail.other_costs)} />
                </div>
              )}

              {activeTab === 'van-hanh' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard icon={<Truck size={15} />} label="Biển kiểm soát" value={detail.license_plate || '—'} />
                  <MetricCard icon={<Truck size={15} />} label="Loại xe" value={detail.vehicle_type || '—'} />
                  <MetricCard icon={<User size={15} />} label="Tài xế" value={detail.driver_name || '—'} />
                  <MetricCard icon={<Phone size={15} />} label="SĐT tài xế" value={detail.driver_phone || '—'} />
                  <MetricCard icon={<Truck size={15} />} label="Nhà cung cấp" value={detail.vendor_name || '—'} className="sm:col-span-2" />
                </div>
              )}

              {activeTab === 'lich-su-thanh-toan' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-muted/10 p-4">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Trạng thái hiện tại</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Trạng thái TT</p>
                        <span className={clsx('mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold', getVendorPaymentStatusTone(paymentTrip))}>
                          {getVendorPaymentStatusLabel(paymentTrip)}
                        </span>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Đã chi</p>
                        <p className="mt-1 text-[15px] font-black tabular-nums text-foreground">{formatMoney(displayPaidAmount, { empty: '0 đ' })}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Phải trả NCC</p>
                        <p className="mt-1 text-[15px] font-black tabular-nums text-foreground">{formatMoney(displayPayableAmount, { empty: '0 đ' })}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Còn lại</p>
                        <p className={clsx('mt-1 text-[15px] font-black tabular-nums', displayRemainingAmount > 0 ? 'text-amber-700' : 'text-emerald-700')}>{formatMoney(displayRemainingAmount, { empty: '0 đ' })}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Chứng từ</p>
                        {paymentSummary?.proof_image_url ? (
                          <div className="mt-1">
                            <ProofImageButton imageUrl={paymentSummary.proof_image_url} label="Xem ảnh" title="Chứng từ thanh toán NCC" />
                          </div>
                        ) : (
                          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">—</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground">Ghi chú</p>
                        <p className="mt-1 text-[13px] font-medium text-foreground">{detail.vendor_payment_note?.trim() || paymentSummary?.payment_note?.trim() || '—'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-border">
                    <div className="border-b border-border bg-slate-100 px-4 py-2.5">
                      <h3 className="text-[13px] font-extrabold text-foreground">Phiếu chi / ghi nhận thanh toán</h3>
                    </div>
                    {detail.payment_history.length === 0 ? (
                      <p className="px-4 py-8 text-center text-[13px] font-medium text-muted-foreground">
                        Chưa có phiếu chi NCC gắn với chuyến này.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-[13px]">
                          <thead className="bg-white text-[11px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2.5 font-bold">Ngày</th>
                              <th className="px-4 py-2.5 font-bold">Số tiền</th>
                              <th className="px-4 py-2.5 font-bold">NCC</th>
                              <th className="px-4 py-2.5 font-bold">Diễn giải</th>
                              <th className="px-4 py-2.5 font-bold">Chứng từ</th>
                              <th className="px-4 py-2.5 font-bold">Người ghi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.payment_history.map((item) => (
                              <tr key={item.id} className="border-t border-border">
                                <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{formatDateTime(item.payment_date)}</td>
                                <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-emerald-700">{formatMoney(item.amount, { empty: '0 đ' })}</td>
                                <td className="px-4 py-2.5">{item.vendor_name || '—'}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{item.description?.trim() || '—'}</td>
                                <td className="px-4 py-2.5">
                                  <ProofImageButton imageUrl={item.proof_image_url} label="Xem" title="Chứng từ thanh toán" />
                                  {!item.proof_image_url && '—'}
                                </td>
                                <td className="px-4 py-2.5">{item.created_by_name || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

function MetricCard({
  icon,
  label,
  value,
  highlight = false,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-2xl border border-border bg-muted/5 p-4', highlight && 'border-emerald-200 bg-emerald-50/40', className)}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={clsx('mt-1 text-[13px] font-bold text-foreground', highlight && 'text-emerald-800')}>{value}</div>
    </div>
  );
}
