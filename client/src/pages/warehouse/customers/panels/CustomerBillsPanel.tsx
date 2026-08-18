import { useMemo } from 'react';
import { clsx } from 'clsx';
import { ExternalLink, Loader2, Printer } from 'lucide-react';
import { DayPicker } from '../../../../components/ui/DayPicker';
import { resolveNoiDen } from '../../inventory/inventoryColumns';
import type { WaybillInventoryItem } from '../../inventory/types';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import {
  buildPaidByWaybill,
  computeCustomerDebtSummary,
  computeVoucherMeta,
  filterBills,
  getBillFreight,
  resolvePaidForBill,
  type BillFilters,
} from '../utils/customerFinanceUtils';
import { formatMoney } from '../../../../lib/formatMoney';

interface Props {
  customerCode: string;
  items: WaybillInventoryItem[];
  totalCount: number;
  vouchers: WaybillCashVoucher[];
  openingDebt?: number | string | null;
  filters: BillFilters;
  loading: boolean;
  vouchersLoading: boolean;
  error: string;
  canViewCost: boolean;
  enablePaymentTracking?: boolean;
  filterSubjectLabel?: string;
  inventoryLinkLabel?: string;
  onFiltersChange: (patch: Partial<BillFilters>) => void;
  onOpenInventory: () => void;
  formatDate: (value?: string | null) => string;
}

export default function CustomerBillsPanel({
  customerCode,
  items,
  totalCount,
  vouchers,
  openingDebt = 0,
  filters,
  loading,
  vouchersLoading,
  error,
  canViewCost,
  enablePaymentTracking = true,
  filterSubjectLabel = 'Mã KH',
  inventoryLinkLabel = 'Tồn kho',
  onFiltersChange,
  onOpenInventory,
  formatDate,
}: Props) {
  const paidMaps = useMemo(() => buildPaidByWaybill(vouchers), [vouchers]);
  const showPaymentColumns = canViewCost && enablePaymentTracking;

  const filteredItems = useMemo(() => filterBills(items, filters), [items, filters]);

  const summary = useMemo(() => {
    return computeCustomerDebtSummary(filteredItems, paidMaps, openingDebt, showPaymentColumns);
  }, [filteredItems, openingDebt, paidMaps, showPaymentColumns]);
  const voucherMeta = useMemo(() => {
    const ids = new Set(filteredItems.map((item) => String(item.id)));
    const codes = new Set(filteredItems.map((item) => (item.waybill_code || item.order_code || '').trim().toUpperCase()).filter(Boolean));
    return computeVoucherMeta(vouchers.filter((voucher) => (
      (voucher.waybill_id != null && ids.has(String(voucher.waybill_id)))
      || Boolean(voucher.waybill_code && codes.has(voucher.waybill_code.trim().toUpperCase()))
    )));
  }, [filteredItems, vouchers]);

  const hasFilters = Boolean(filters.fromDate || filters.toDate || filters.billCode.trim() || filters.paymentType);

  return (
    <div className="space-y-4">
      {canViewCost && (
        <div className={clsx('grid grid-cols-1 gap-3', showPaymentColumns ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-1')}>
          {showPaymentColumns && <SummaryCard label="Công nợ tồn cũ" value={formatMoney(summary.openingDebt)} tone="amber" />}
          <SummaryCard label="Tổng cước phí" value={formatMoney(summary.totalFreight)} tone="blue" />
          {showPaymentColumns && (
            <>
              <SummaryCard label="COD đã đối trừ" value={formatMoney(voucherMeta.cod_offset)} tone="blue" />
              <SummaryCard label="Đã TT / COD" value={formatMoney(summary.totalPaid)} tone="emerald" />
              <SummaryCard
                label={summary.totalDebt < 0 ? 'ECO cần trả khách' : 'Công nợ hiện tại'}
                value={formatMoney(Math.abs(summary.totalDebt))}
                tone={summary.totalDebt < 0 ? 'amber' : 'red'}
              />
            </>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-primary">
            Bộ lọc · {filterSubjectLabel} {customerCode}
            {summary.count > 0 && (
              <span className="ml-2 font-medium normal-case text-muted-foreground">({summary.count} bill)</span>
            )}
          </p>
          <button
            type="button"
            onClick={onOpenInventory}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted"
          >
            <ExternalLink size={12} />
            {inventoryLinkLabel}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Từ ngày nhận</span>
            <DayPicker
              value={filters.fromDate}
              onChange={(value) => onFiltersChange({ fromDate: value })}
              className="h-10 w-full border-input text-[13px] font-medium"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Đến ngày nhận</span>
            <DayPicker
              value={filters.toDate}
              onChange={(value) => onFiltersChange({ toDate: value })}
              className="h-10 w-full border-input text-[13px] font-medium"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Số bill</span>
            <input
              type="text"
              value={filters.billCode}
              onChange={(event) => onFiltersChange({ billCode: event.target.value })}
              placeholder="Tìm số bill..."
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Hình thức TT</span>
            <select
              value={filters.paymentType}
              onChange={(event) => onFiltersChange({ paymentType: event.target.value as BillFilters['paymentType'] })}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
            >
              <option value="">Tất cả</option>
              <option value="PP">PP</option>
              <option value="CC">CC</option>
              <option value="COD">COD</option>
            </select>
          </label>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => onFiltersChange({ fromDate: '', toDate: '', billCode: '', paymentType: '' })}
            className="mt-3 text-[12px] font-bold text-red-500 hover:underline"
          >
            × Xóa bộ lọc
          </button>
        )}
      </div>

      {loading || vouchersLoading ? (
        <div className="flex justify-center rounded-2xl border border-border bg-white py-12 shadow-sm">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      ) : error ? (
        <p className="py-8 text-center text-[13px] font-bold text-red-600">{error}</p>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white py-10 text-center shadow-sm">
          <Printer size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-[13px] font-medium text-muted-foreground">
            {items.length === 0 ? 'Chưa có bill với mã KH này.' : 'Không có bill phù hợp bộ lọc.'}
          </p>
          {totalCount > items.length && (
            <p className="mt-1 text-[12px] text-muted-foreground">Đang hiển thị {items.length}/{totalCount} bill.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm -mx-1">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Số Bill</th>
                <th className="px-3 py-2.5">Ngày bốc</th>
                <th className="px-3 py-2.5">Ngày nhận</th>
                <th className="px-3 py-2.5">Tỉnh đến</th>
                <th className="px-3 py-2.5 text-right">Kiện</th>
                <th className="px-3 py-2.5">TT</th>
                {canViewCost && <th className="px-3 py-2.5 text-right">Cước phí</th>}
                {showPaymentColumns && <th className="px-3 py-2.5 text-right">Đã TT / COD</th>}
                {showPaymentColumns && <th className="px-3 py-2.5 text-right">Số dư bill</th>}
                <th className="px-3 py-2.5 text-right">In</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const freight = getBillFreight(item);
                const paid = showPaymentColumns ? resolvePaidForBill(item, paidMaps) : 0;
                const debt = freight - paid;
                return (
                  <tr key={String(item.id)} className="border-b border-border/70 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-extrabold text-primary">
                      {item.waybill_code || item.order_code || `#${item.id}`}
                    </td>
                    <td className="px-3 py-2.5">{formatDate(item.loaded_at)}</td>
                    <td className="px-3 py-2.5">{formatDate(item.received_at || item.created_at)}</td>
                    <td className="px-3 py-2.5">{resolveNoiDen(item)}</td>
                    <td className="px-3 py-2.5 text-right">{item.package_count ?? item.trip_package_count ?? '—'}</td>
                    <td className="px-3 py-2.5">{item.payment_type || '—'}</td>
                    {canViewCost && (
                      <>
                        <td className="px-3 py-2.5 text-right font-bold">{formatMoney(freight)}</td>
                        {showPaymentColumns && (
                          <>
                            <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{formatMoney(paid)}</td>
                            <td className={clsx('px-3 py-2.5 text-right font-extrabold', debt > 0 ? 'text-red-600' : debt < 0 ? 'text-emerald-700' : 'text-foreground')}>
                              {formatMoney(debt)}
                            </td>
                          </>
                        )}
                      </>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          title="In bill"
                          onClick={() => window.open(`/print/waybill/${item.id}?print=1`, '_blank', 'noopener')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'blue' | 'amber' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : tone === 'amber'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-[18px] font-extrabold">{value}</p>
    </div>
  );
}
