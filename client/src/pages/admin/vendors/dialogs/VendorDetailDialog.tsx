import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, Edit, ExternalLink, Loader2, Printer, Receipt, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import CashFundSelect from '../../../../components/finance/CashFundSelect';
import { apiRequest } from '../../../../lib/api';
import { formatAmountInput, formatMoney, parseAmountInput } from '../../../../lib/formatMoney';
import { defaultExpenseCategoryNames, loadExpenseCategoryNames } from '../../../../lib/expenseCategories';
import type { AuthUserProfile } from '../../../login/types';
import { VENDOR_DETAIL_TABS, type VendorDetailTabId } from '../vendorDetailTabs';
import {
  formatContractType,
  formatProvince,
  formatServiceType,
  formatStatus,
} from '../data';
import type { Vendor } from '../types';
import type { InventoryListResponse, WaybillInventoryItem } from '../../../warehouse/inventory/types';
import LoadPlanningTruckBoard from '../../../warehouse/load-planning/LoadPlanningTruckBoard';
import type { LoadPlanningBoardResponse } from '../../../warehouse/load-planning/types';
import CustomerBillsPanel from '../../../warehouse/customers/panels/CustomerBillsPanel';
import type { BillFilters } from '../../../warehouse/customers/utils/customerFinanceUtils';
import VendorPaymentsPanel, {
  type VendorLedgerBalance,
  type VendorLedgerEntry,
  type VendorPaymentFilters,
} from '../panels/VendorPaymentsPanel';

interface Props {
  vendor: Vendor | null;
  loading?: boolean;
  canManage: boolean;
  initialTab?: VendorDetailTabId;
  onClose: () => void;
  onEdit: (vendor: Vendor) => void;
}

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;
const ACCOUNTANT = 16;
const DISPATCHER = 8;

const vendorExpenseTypes = defaultExpenseCategoryNames;

function Row({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-[140px_1fr] gap-2 border-b border-border/60 py-2.5 text-[13px] last:border-0', className)}>
      <span className="font-bold text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value?.trim() || '—'}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-primary">{title}</p>
      {children}
    </section>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-2xl border border-border bg-white p-4 shadow-sm', className)}>{children}</div>;
}

function PrintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-300 p-2">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-[14px] font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function getStoredUser(): AuthUserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
}

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const normalizeInventoryList = (response: InventoryListResponse | WaybillInventoryItem[]) =>
  Array.isArray(response) ? response : response.data || response.items || response.waybills || [];

const dedupeWaybills = (lines: WaybillInventoryItem[]) => {
  const map = new Map<string, WaybillInventoryItem>();
  for (const line of lines) {
    const key = `${line.id}-${line.split_id ?? '0'}`;
    if (!map.has(key)) map.set(key, line);
  }
  return [...map.values()];
};

const inventoryTotalFromResponse = (response: InventoryListResponse | WaybillInventoryItem[], fallback: number) =>
  Array.isArray(response) ? fallback : response.meta?.total_waybills ?? response.total ?? response.meta?.total ?? fallback;

const formatJson = (value: unknown): string => {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

interface VendorDebtTrip {
  id: string | number;
  departure_time?: string | null;
  status?: string | null;
  trip_cost?: string | number | null;
  license_plate?: string | null;
  manifest_id?: string | number | null;
  manifest_code?: string | null;
}

interface VendorDebtDashboardResponse {
  trips?: VendorDebtTrip[];
}

export default function VendorDetailDialog({ vendor, loading, canManage, initialTab = 'chi-tiet', onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const vendorId = vendor?.id != null ? String(vendor.id) : '';
  const [activeTab, setActiveTab] = useState<VendorDetailTabId>(initialTab);
  const [inventoryItems, setInventoryItems] = useState<WaybillInventoryItem[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [debtTrips, setDebtTrips] = useState<VendorDebtTrip[]>([]);
  const [debtTripsLoading, setDebtTripsLoading] = useState(false);
  const [debtTripsError, setDebtTripsError] = useState('');
  const [deliveryBoard, setDeliveryBoard] = useState<LoadPlanningBoardResponse | null>(null);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState<VendorLedgerEntry[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<VendorLedgerBalance>({});
  const [paymentFilters, setPaymentFilters] = useState<VendorPaymentFilters>({
    fromDate: '',
    toDate: '',
    entryType: '',
  });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const [isSpendOpen, setIsSpendOpen] = useState(false);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendType, setSpendType] = useState(vendorExpenseTypes[0]);
  const [expenseCategoryOptions, setExpenseCategoryOptions] = useState<string[]>(vendorExpenseTypes);
  const [spendFundId, setSpendFundId] = useState('');
  const [spendNote, setSpendNote] = useState('');
  const [spendSubmitting, setSpendSubmitting] = useState(false);
  const [spendError, setSpendError] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [billFilters, setBillFilters] = useState<BillFilters>({
    fromDate: '',
    toDate: '',
    billCode: '',
    paymentType: '',
  });

  useEffect(() => {
    void loadExpenseCategoryNames().then((items) => {
      setExpenseCategoryOptions(items);
      setSpendType((current) => items.includes(current) ? current : items[0] || '');
    }).catch(() => undefined);
  }, []);

  const canViewCost = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (DISPATCHER | ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  }, []);

  const canViewFinance = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  }, []);

  useEffect(() => {
    if (!vendor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('chi-tiet');
      setInventoryItems([]);
      setInventoryTotal(0);
      setInventoryError('');
      setDebtTrips([]);
      setDebtTripsError('');
      setDeliveryBoard(null);
      setDeliveryTotal(0);
      setDeliveryError('');
      setLedgerEntries([]);
      setLedgerBalance({});
      setPaymentFilters({ fromDate: '', toDate: '', entryType: '' });
      setBillFilters({ fromDate: '', toDate: '', billCode: '', paymentType: '' });
      setLedgerError('');
      setIsSpendOpen(false);
      setSpendAmount('');
      setSpendDate(new Date().toISOString().slice(0, 10));
      setSpendType(vendorExpenseTypes[0]);
      setSpendNote('');
      setSpendError('');
      setIsStatementOpen(false);
    }
  }, [vendor?.id]);

  const statementData = useMemo(() => {
    const totalFreight = debtTrips.reduce((sum, trip) => sum + Number(trip.trip_cost ?? 0), 0);
    const totalIncurred = ledgerBalance.total_incurred ?? ledgerEntries
      .filter((entry) => String(entry.type) !== 'PAYMENT')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0)), 0);
    const totalPaid = ledgerBalance.total_paid ?? ledgerEntries
      .filter((entry) => String(entry.type) === 'PAYMENT')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0)), 0);
    return { totalFreight, totalIncurred, totalPaid, remaining: ledgerBalance.remaining ?? totalIncurred - totalPaid };
  }, [debtTrips, ledgerBalance, ledgerEntries]);

  useEffect(() => {
    const needsInventory = activeTab === 'bill';
    if (!vendorId || !needsInventory) return;

    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError('');

    apiRequest<InventoryListResponse | WaybillInventoryItem[]>(
      `/waybills/inventory/trip-lines?vendor_id=${encodeURIComponent(vendorId)}&limit=200&page=1`,
    )
      .then((response) => {
        if (cancelled) return;
        const list = dedupeWaybills(normalizeInventoryList(response));
        setInventoryItems(list);
        setInventoryTotal(inventoryTotalFromResponse(response, list.length));
      })
      .catch(() => {
        if (!cancelled) {
          setInventoryItems([]);
          setInventoryTotal(0);
          setInventoryError('Không tải được danh sách đơn / bill của NCC.');
        }
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, vendorId]);

  useEffect(() => {
    const needsDebtTrips = activeTab === 'don-hang' || activeTab === 'thanh-toan';
    if (!vendorId || !needsDebtTrips) return;

    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setDebtTripsLoading(true);
      setDebtTripsError('');
      try {
        const response = await apiRequest<VendorDebtDashboardResponse>(`/vendors/${vendorId}/debt-dashboard`);
        if (!cancelled) setDebtTrips(response.trips ?? []);
      } catch {
        if (!cancelled) {
          setDebtTrips([]);
          setDebtTripsError('Không tải được danh sách chuyến phát sinh công nợ NCC.');
        }
      } finally {
        if (!cancelled) setDebtTripsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, vendorId]);

  useEffect(() => {
    if (!vendorId || activeTab !== 'giao-hang') return;

    let cancelled = false;
    setDeliveryLoading(true);
    setDeliveryError('');

    apiRequest<LoadPlanningBoardResponse>(
      `/waybills/load-planning/board?vendor_id=${encodeURIComponent(vendorId)}&limit=100`,
    )
      .then((response) => {
        if (cancelled) return;
        setDeliveryBoard(response);
        setDeliveryTotal(response.total_items ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setDeliveryBoard(null);
          setDeliveryTotal(0);
          setDeliveryError('Không tải được danh sách phân xe / giao hàng.');
        }
      })
      .finally(() => {
        if (!cancelled) setDeliveryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, vendorId]);

  useEffect(() => {
    if (!vendorId || activeTab !== 'thanh-toan' || !canViewFinance) return;

    let cancelled = false;
    setLedgerLoading(true);
    setLedgerError('');

    apiRequest<{ entries?: VendorLedgerEntry[]; balance?: VendorLedgerBalance }>(`/vendors/${vendorId}/ledger`)
      .then((response) => {
        if (cancelled) return;
        setLedgerEntries(response.entries ?? []);
        setLedgerBalance(response.balance ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setLedgerEntries([]);
        setLedgerBalance({});
        setLedgerError('Không tải được sổ cái công nợ NCC.');
      })
      .finally(() => {
        if (!cancelled) setLedgerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, vendorId, canViewFinance]);

  const reloadDeliveryBoard = () => {
    if (!vendorId) return;
    setDeliveryLoading(true);
    setDeliveryError('');
    apiRequest<LoadPlanningBoardResponse>(
      `/waybills/load-planning/board?vendor_id=${encodeURIComponent(vendorId)}&limit=100`,
    )
      .then((response) => {
        setDeliveryBoard(response);
        setDeliveryTotal(response.total_items ?? 0);
      })
      .catch(() => {
        setDeliveryBoard(null);
        setDeliveryTotal(0);
        setDeliveryError('Không tải được danh sách phân xe / giao hàng.');
      })
      .finally(() => setDeliveryLoading(false));
  };

  const openLoadPlanning = () => {
    if (!vendorId) return;
    onClose();
    navigate(`/warehouse/load-planning?vendor_id=${encodeURIComponent(vendorId)}`);
  };

  const reloadLedger = async () => {
    if (!vendorId) return;
    const response = await apiRequest<{ entries?: VendorLedgerEntry[]; balance?: VendorLedgerBalance }>(`/vendors/${vendorId}/ledger`);
    setLedgerEntries(response.entries ?? []);
    setLedgerBalance(response.balance ?? {});
  };

  const openSpendDialog = () => {
    setSpendAmount('');
    setSpendDate(new Date().toISOString().slice(0, 10));
    setSpendType(vendorExpenseTypes[0]);
    setSpendFundId('');
    setSpendNote('');
    setSpendError('');
    setIsSpendOpen(true);
  };

  const submitVendorPayment = async () => {
    const amount = parseAmountInput(spendAmount);
    if (amount <= 0) {
      setSpendError('Nhập số tiền chi lớn hơn 0.');
      return;
    }
    if (!spendFundId) {
      setSpendError('Vui lòng chọn sổ quỹ chi tiền.');
      return;
    }
    setSpendSubmitting(true);
    setSpendError('');
    try {
      await apiRequest(`/vendors/${vendorId}/payments`, {
        method: 'POST',
        body: {
          payment_date: new Date(`${spendDate || new Date().toISOString().slice(0, 10)}T12:00:00`).toISOString(),
          amount,
          fund_id: spendFundId,
          cost_category: spendType,
          description: `[${spendType}] ${spendNote.trim() || `Chi thanh toán NCC ${vendor?.code || vendor?.name || vendorId}`}`,
        },
      });
      await reloadLedger();
      setIsSpendOpen(false);
    } catch {
      setSpendError('Không lưu được phiếu chi NCC.');
    } finally {
      setSpendSubmitting(false);
    }
  };

  if (!vendor) return null;

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      );
    }

    switch (activeTab) {
      case 'chi-tiet':
        return (
          <div className="space-y-4">
            <DetailSection title="Thông tin NCC">
              <Row label="Mã NCC" value={vendor.code} />
              <Row label="Tên NCC" value={vendor.name} />
              <Row label="Loại dịch vụ" value={formatServiceType(vendor.service_type)} />
              <Row label="Loại hợp đồng" value={formatContractType(vendor.contract_type)} />
              <Row label="Trạng thái" value={formatStatus(vendor.status)} />
              <Row label="Công nợ tồn đầu kỳ" value={formatMoney(vendor.opening_debt)} />
              <Row label="Công nợ phải trả" value={formatMoney(vendor.payable_balance)} />
            </DetailSection>

            <DetailSection title="Liên hệ">
              <Row label="Người liên hệ" value={vendor.contact_name} />
              <Row label="Số điện thoại" value={vendor.phone} />
              <Row label="Email" value={vendor.email} />
              <Row label="Khu vực" value={formatProvince(vendor.province)} />
            </DetailSection>

            <DetailSection title="Thông tin nhận tiền">
              <Row label="Ngân hàng" value={vendor.bank_name} />
              <Row label="Số tài khoản" value={vendor.bank_account} />
              <Row label="Chủ tài khoản" value={vendor.bank_account_holder} />
              {vendor.qr_image_url && (
                <div className="mt-3 flex justify-center rounded-xl border border-border bg-muted/5 p-3">
                  <img src={vendor.qr_image_url} alt="QR nhận tiền NCC" className="max-h-56 w-auto object-contain" />
                </div>
              )}
            </DetailSection>

            {(vendor.routes != null || vendor.pricing != null) && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {vendor.routes != null && (
                  <DetailSection title="Tuyến phục vụ">
                    <pre className="max-h-48 overflow-auto rounded-lg bg-muted/20 p-3 text-[11px] font-medium text-foreground">
                      {formatJson(vendor.routes)}
                    </pre>
                  </DetailSection>
                )}
                {vendor.pricing != null && (
                  <DetailSection title="Bảng giá tham chiếu">
                    <pre className="max-h-48 overflow-auto rounded-lg bg-muted/20 p-3 text-[11px] font-medium text-foreground">
                      {formatJson(vendor.pricing)}
                    </pre>
                  </DetailSection>
                )}
              </div>
            )}
          </div>
        );

      case 'don-hang':
        return (
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-foreground">
                NCC: <span className="text-primary">{vendor.code}</span>
                {debtTrips.length > 0 && (
                  <span className="ml-2 font-medium text-muted-foreground">({debtTrips.length} chuyến phát sinh)</span>
                )}
              </p>
              <span className="text-[11px] font-bold text-muted-foreground">1 chuyến = 1 mã bảng kê = 1 cước chuyến</span>
            </div>

            {debtTripsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : debtTripsError ? (
              <p className="py-8 text-center text-[13px] font-bold text-red-600">{debtTripsError}</p>
            ) : debtTrips.length === 0 ? (
              <div className="py-10 text-center">
                <Truck size={28} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-[13px] font-medium text-muted-foreground">Chưa có chuyến nhập cước cho NCC này.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Mã chuyến</th>
                      <th className="px-2 py-2">Mã bảng kê</th>
                      <th className="px-2 py-2">Ngày chuyến</th>
                      <th className="px-2 py-2">BKS</th>
                      <th className="px-2 py-2">Trạng thái</th>
                      <th className="px-2 py-2 text-right">Cước chuyến</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtTrips.map((trip) => (
                      <tr key={String(trip.id)} className="border-b border-border/70 hover:bg-muted/20">
                        <td className="px-2 py-2.5 font-extrabold text-primary">#{trip.id}</td>
                        <td className="px-2 py-2.5 font-bold">{trip.manifest_code || (trip.manifest_id ? `#${trip.manifest_id}` : '—')}</td>
                        <td className="px-2 py-2.5">{formatDate(trip.departure_time)}</td>
                        <td className="px-2 py-2.5">{trip.license_plate || '—'}</td>
                        <td className="px-2 py-2.5">{trip.status || '—'}</td>
                        <td className="px-2 py-2.5 text-right font-extrabold tabular-nums">{formatMoney(trip.trip_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );

      case 'giao-hang':
        return (
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-foreground">
                NCC: <span className="text-primary">{vendor.name || vendor.code}</span>
                {deliveryTotal > 0 && (
                  <span className="ml-2 font-medium text-muted-foreground">({deliveryTotal} dòng)</span>
                )}
              </p>
              <button
                type="button"
                onClick={openLoadPlanning}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted"
              >
                <ExternalLink size={12} />
                Phân xe
              </button>
            </div>

            {deliveryLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : deliveryError ? (
              <p className="py-8 text-center text-[13px] font-bold text-red-600">{deliveryError}</p>
            ) : !deliveryBoard?.trucks?.length ? (
              <div className="py-10 text-center">
                <Truck size={28} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-[13px] font-medium text-muted-foreground">Chưa có hàng phân xe cho NCC này.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deliveryBoard.trucks.map((truck) => (
                  <LoadPlanningTruckBoard
                    key={String(truck.truck_id)}
                    truck={truck}
                    canViewCost={canViewCost}
                    onStatusUpdated={reloadDeliveryBoard}
                  />
                ))}
              </div>
            )}
          </Panel>
        );

      case 'bill':
        return (
          <CustomerBillsPanel
            customerCode={vendor.code || vendor.name || vendorId}
            items={inventoryItems}
            totalCount={inventoryTotal}
            vouchers={[]}
            filters={billFilters}
            loading={inventoryLoading}
            vouchersLoading={false}
            error={inventoryError}
            canViewCost={canViewCost}
            enablePaymentTracking={false}
            filterSubjectLabel="NCC"
            inventoryLinkLabel="Phân xe"
            onFiltersChange={(patch) => setBillFilters((prev) => ({ ...prev, ...patch }))}
            onOpenInventory={openLoadPlanning}
            formatDate={formatDate}
          />
        );

      case 'thanh-toan':
        return (
          <div className="space-y-4">
            <DetailSection title="Thông tin thanh toán NCC">
              <Row label="Loại hợp đồng" value={formatContractType(vendor.contract_type)} />
              <Row label="Công nợ tồn đầu kỳ" value={formatMoney(vendor.opening_debt)} />
              <Row label="Công nợ phải trả" value={formatMoney(vendor.payable_balance)} />
              <Row label="Tổng phát sinh" value={formatMoney(ledgerBalance.total_incurred)} />
              <Row label="Đã chi trả" value={formatMoney(ledgerBalance.total_paid)} />
              <Row label="Còn lại" value={formatMoney(ledgerBalance.remaining)} />
              <Row label="Ngân hàng" value={vendor.bank_name} />
              <Row label="Số tài khoản" value={vendor.bank_account} />
              <Row label="Chủ tài khoản" value={vendor.bank_account_holder} />
              {vendor.qr_image_url && (
                <div className="mt-3 flex justify-center rounded-xl border border-border bg-muted/5 p-3">
                  <img src={vendor.qr_image_url} alt="QR nhận tiền NCC" className="max-h-52 w-auto object-contain" />
                </div>
              )}
            </DetailSection>

            {canViewFinance ? (
              <VendorPaymentsPanel
                vendorCode={vendor.code || vendor.name || vendorId}
                entries={ledgerEntries}
                balance={ledgerBalance}
                filters={paymentFilters}
                loading={ledgerLoading}
                error={ledgerError}
                onFiltersChange={(patch) => setPaymentFilters((prev) => ({ ...prev, ...patch }))}
                onSpend={openSpendDialog}
                onPrintStatement={() => setIsStatementOpen(true)}
              />
            ) : (
              <Panel>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Sổ cái công nợ chỉ hiển thị với quyền Kế toán hoặc Quản lý.
                </p>
              </Panel>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const statementDialog = isStatementOpen ? createPortal(
    <div className="statement-print-root fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0 print:backdrop-blur-none">
      <style>{`@media print { body > *:not(.statement-print-root) { display: none !important; } .statement-print-root { display: block !important; position: static !important; inset: auto !important; background: #fff !important; padding: 0 !important; backdrop-filter: none !important; } .statement-print-shell { display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; box-shadow: none !important; } .statement-print-toolbar { display: none !important; } .statement-print-scroll { display: block !important; overflow: visible !important; padding: 0 !important; } .statement-print-page { margin: 0 !important; min-height: 0 !important; max-width: none !important; padding: 0 !important; box-shadow: none !important; } }`}</style>
      <div className="statement-print-shell flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-2xl print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="statement-print-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 print:hidden">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Giao diện in phiếu kê NCC</p>
            <h3 className="text-[16px] font-extrabold text-foreground">Phiếu kê thanh toán · {vendor.code || vendor.name}</h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90">
              <Printer size={16} />
              In
            </button>
            <button type="button" onClick={() => setIsStatementOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="statement-print-scroll flex-1 overflow-auto p-4 custom-scrollbar print:block print:overflow-visible print:p-0">
          <div className="statement-print-page mx-auto min-h-[1120px] w-full max-w-[900px] bg-white p-8 text-[12px] text-slate-900 shadow-xl print:m-0 print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Phiếu kê thanh toán nhà cung cấp</h1>
                <p className="mt-1 text-slate-500">Sổ phát sinh công nợ và các khoản chi thanh toán NCC</p>
              </div>
              <div className="text-right text-[12px]">
                <p><b>Ngày in:</b> {new Date().toLocaleString('vi-VN')}</p>
                <p><b>Mã NCC:</b> {vendor.code || '—'}</p>
              </div>
            </div>
            <div className={clsx('mt-4 grid gap-4', vendor.qr_image_url && 'grid-cols-[1fr_150px]')}>
              <div className="grid content-start gap-1 text-[13px]">
                <p><b>Nhà cung cấp:</b> {vendor.name || '—'}</p>
                <p><b>Loại dịch vụ:</b> {formatServiceType(vendor.service_type)} <span className="mx-2">·</span> <b>Tỉnh:</b> {formatProvince(vendor.province)}</p>
                <p><b>Liên hệ:</b> {vendor.contact_name || '—'} <span className="mx-2">·</span> <b>Điện thoại:</b> {vendor.phone || '—'}</p>
                <p><b>Ngân hàng:</b> {vendor.bank_name || '—'}</p>
                <p><b>Số tài khoản:</b> {vendor.bank_account || '—'}</p>
                <p><b>Chủ tài khoản:</b> {vendor.bank_account_holder || '—'}</p>
              </div>
              {vendor.qr_image_url && <img src={vendor.qr_image_url} alt="QR nhận tiền NCC" className="h-[150px] w-[150px] border border-slate-300 object-contain p-1" />}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <PrintMetric label="Tổng phát sinh" value={formatMoney(statementData.totalIncurred)} />
              <PrintMetric label="Còn phải trả" value={formatMoney(statementData.remaining)} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <PrintMetric label="Đã chi" value={formatMoney(statementData.totalPaid)} />
              <PrintMetric label="Số phiếu chi" value={ledgerEntries.filter((entry) => String(entry.type) === 'PAYMENT').length.toLocaleString('vi-VN')} />
              <PrintMetric label="Số phát sinh" value={ledgerEntries.filter((entry) => String(entry.type) !== 'PAYMENT').length.toLocaleString('vi-VN')} />
              <PrintMetric label="Sổ cái" value={ledgerEntries.length.toLocaleString('vi-VN')} />
            </div>

            <h2 className="mt-6 text-[14px] font-extrabold uppercase text-primary">Các khoản phát sinh và thanh toán</h2>
            <table className="mt-2 w-full border-collapse text-left text-[11px]">
              <thead className="bg-slate-100 uppercase text-slate-600"><tr>{['#', 'Ngày', 'Loại', 'Chuyến', 'Mã bảng kê', 'Số tiền', 'Ghi chú', 'Dư nợ'].map((header) => <th key={header} className="border border-slate-300 px-2 py-2">{header}</th>)}</tr></thead>
              <tbody>
                {ledgerEntries.length ? ledgerEntries.map((entry, index) => {
                  const isPayment = String(entry.type) === 'PAYMENT';
                  const isOpening = String(entry.type) === 'OPENING';
                  return <tr key={String(entry.id)}>
                    <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatDate(entry.date)}</td>
                    <td className="border border-slate-300 px-2 py-2">{isPayment ? 'Phiếu chi' : isOpening ? 'Công nợ đầu kỳ' : String(entry.type) === 'TRIP' ? 'Phát sinh chuyến' : 'Chi phí phát sinh'}</td>
                    <td className="border border-slate-300 px-2 py-2">{entry.trip_id ? `#${entry.trip_id}${entry.license_plate ? ` · ${entry.license_plate}` : ''}` : '—'}</td>
                    <td className="border border-slate-300 px-2 py-2">{entry.manifest_code || '—'}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{formatMoney(Math.abs(Number(entry.signed_amount ?? entry.amount ?? 0)))}</td>
                    <td className="border border-slate-300 px-2 py-2">{entry.description || '—'}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{formatMoney(entry.running_balance)}</td>
                  </tr>;
                }) : <tr><td colSpan={8} className="border border-slate-300 px-2 py-6 text-center text-slate-500">Chưa có phát sinh công nợ.</td></tr>}
              </tbody>
            </table>

            <div className="mt-10 grid grid-cols-2 gap-10 text-center font-bold">
              <div>Nhà cung cấp<br /><br /><br /><br /><span className="font-normal">Ký, ghi rõ họ tên</span></div>
              <div>ECO Transport<br /><br /><br /><br /><span className="font-normal">Ký, ghi rõ họ tên</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return <>
    {createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end print:hidden">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-[#f8fafc] shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-foreground">{vendor.name || '—'}</h2>
              <p className="text-[12px] font-bold text-primary">{vendor.code || '—'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-border bg-slate-100 px-2 py-2">
          <div className="flex gap-1 overflow-x-auto custom-scrollbar">
            {VENDOR_DETAIL_TABS.map((tab) => (
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

        <div className={clsx('flex-1 overflow-y-auto custom-scrollbar p-4', activeTab === 'chi-tiet' && 'pb-8')}>
          {renderTabContent()}
        </div>

        {isSpendOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-extrabold uppercase tracking-wide text-emerald-600">Lập phiếu chi NCC</p>
                  <h3 className="text-lg font-extrabold text-foreground">{vendor.name}</h3>
                  <p className="text-[12px] font-bold text-primary">{vendor.code || `#${vendorId}`}</p>
                </div>
                <button type="button" onClick={() => setIsSpendOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                  <X size={18} />
                </button>
              </div>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ngày chi</span>
                <input
                  type="date"
                  value={spendDate}
                  onChange={(event) => setSpendDate(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <CashFundSelect value={spendFundId} onChange={(value) => { setSpendFundId(value); setSpendError(''); }} label="Sổ quỹ chi tiền" className="mb-3" />

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Loại chi</span>
                <select
                  value={spendType}
                  onChange={(event) => setSpendType(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold outline-none focus:ring-2 focus:ring-primary/15"
                >
                  {expenseCategoryOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Số tiền chi</span>
                <input
                  value={spendAmount}
                  onChange={(event) => setSpendAmount(formatAmountInput(event.target.value))}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] font-extrabold outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú</span>
                <textarea
                  value={spendNote}
                  onChange={(event) => setSpendNote(event.target.value)}
                  rows={3}
                  placeholder="Nội dung phiếu chi..."
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              {spendError && <p className="mb-3 text-[13px] font-bold text-red-600">{spendError}</p>}

              <button
                type="button"
                disabled={spendSubmitting}
                onClick={() => void submitVendorPayment()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {spendSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Receipt size={16} />}
                Lưu phiếu chi
              </button>
            </div>
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white p-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            Đóng
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => onEdit(vendor)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90"
            >
              <Edit size={15} />
              Sửa
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )}
    {statementDialog}
  </>;
}
