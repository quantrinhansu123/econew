import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, Edit, ExternalLink, Loader2, Package, Printer, Receipt, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import CashFundSelect from '../../../../components/finance/CashFundSelect';
import { ApiError, apiRequest } from '../../../../lib/api';
import { formatAmountInput, formatAmountInputFromNumber, formatMoney, parseAmountInput } from '../../../../lib/formatMoney';
import { specialGoodsLabels } from '../../../../lib/waybillSpecialGoods';
import type { AuthUserProfile } from '../../../login/types';
import { CUSTOMER_DETAIL_TABS, type CustomerDetailTabId } from '../customerDetailTabs';
import type { InventoryListResponse, WaybillInventoryItem } from '../../inventory/types';
import { resolveNoiDen } from '../../inventory/inventoryColumns';
import LoadPlanningTruckBoard from '../../load-planning/LoadPlanningTruckBoard';
import type { LoadPlanningBoardResponse } from '../../load-planning/types';
import type { CustomerRecord } from '../customerFormTypes';
import CustomerCashVouchersPanel, { type CashVoucherFilters } from '../panels/CustomerCashVouchersPanel';
import CustomerBillsPanel from '../panels/CustomerBillsPanel';
import {
  buildPaidByWaybill,
  computeCustomerDebtSummary,
  computeVoucherMeta,
  getBillFreight,
  resolvePaidForBill,
  type BillFilters,
} from '../utils/customerFinanceUtils';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';
import CustomerPayoutDialog from './CustomerPayoutDialog';

interface Props {
  customer: CustomerRecord | null;
  loading?: boolean;
  initialTab?: CustomerDetailTabId;
  onClose: () => void;
  onEdit?: () => void;
}

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;
const ACCOUNTANT = 16;

const statusLabel: Record<string, string> = {
  RECEIVED: 'Đã tạo đơn',
  IN_WAREHOUSE: 'Trong kho',
  MANIFEST_CLOSED: 'Chờ bốc',
  LOADED: 'Đã bốc',
  IN_TRANSIT: 'Đang vận chuyển',
  AT_DEST_HUB: 'Tới hub đích',
  OUT_FOR_DELIVERY: 'Chờ giao',
  DELIVERED: 'Đã giao',
  RETURNED: 'Hoàn hàng',
  CANCELLED: 'Đã hủy',
};

function Row({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-[140px_1fr] gap-2 border-b border-border/60 py-2.5 text-[13px] last:border-0', className)}>
      <span className="font-bold text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value?.trim() || '—'}</span>
    </div>
  );
}

function PriceListRow({ name, url }: { name?: string | null; url?: string | null }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-border/60 py-2.5 text-[13px]">
      <span className="font-bold text-muted-foreground">File bảng giá</span>
      {url ? (
        <button
          type="button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          className="inline-flex min-w-0 items-center gap-1.5 text-left font-bold text-primary hover:underline"
        >
          <span className="truncate">{name || 'Bảng giá khách hàng'}</span>
          <ExternalLink size={13} className="shrink-0" />
        </button>
      ) : <span className="font-medium text-foreground">—</span>}
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
const printMoney = (value?: number | string | null) => formatMoney(value ?? 0, { empty: '0 đ' });

const normalizeInventoryList = (response: InventoryListResponse | WaybillInventoryItem[]) =>
  Array.isArray(response) ? response : response.data || response.items || response.waybills || [];

const dedupeWaybills = (lines: WaybillInventoryItem[]) => {
  const map = new Map<string, WaybillInventoryItem>();
  for (const line of lines) {
    const key = String(line.id);
    if (!map.has(key)) map.set(key, line);
  }
  return [...map.values()];
};

const inventoryTotalFromResponse = (response: InventoryListResponse | WaybillInventoryItem[], fallback: number) =>
  Array.isArray(response) ? fallback : response.meta?.total_waybills ?? response.total ?? response.meta?.total ?? fallback;

const CUSTOMER_BILL_PAGE_SIZE = 200;

async function loadAllCustomerBills(customerCode: string) {
  const requestPage = (page: number) => apiRequest<InventoryListResponse | WaybillInventoryItem[]>(
    `/waybills/inventory/trip-lines?ma_kh=${encodeURIComponent(customerCode)}&list_scope=all_orders&limit=${CUSTOMER_BILL_PAGE_SIZE}&page=${page}`,
  );
  const firstResponse = await requestPage(1);
  const firstItems = normalizeInventoryList(firstResponse);
  if (Array.isArray(firstResponse)) {
    const items = dedupeWaybills(firstItems);
    return { items, total: items.length };
  }

  const total = inventoryTotalFromResponse(firstResponse, firstItems.length);
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_BILL_PAGE_SIZE));
  const allItems = [...firstItems];
  for (let page = 2; page <= totalPages; page += 4) {
    const pageNumbers = Array.from(
      { length: Math.min(4, totalPages - page + 1) },
      (_, index) => page + index,
    );
    const responses = await Promise.all(pageNumbers.map(requestPage));
    responses.forEach((response) => allItems.push(...normalizeInventoryList(response)));
  }
  const items = dedupeWaybills(allItems);
  return { items, total: Math.max(total, items.length) };
}

interface CashVoucherListResponse {
  items?: WaybillCashVoucher[];
  meta?: { total?: number };
}

async function loadAllCustomerCashVouchers(customerCode: string) {
  const requestPage = (page: number) => apiRequest<CashVoucherListResponse>(
    `/waybills/cash-vouchers?ma_kh=${encodeURIComponent(customerCode)}&limit=${CUSTOMER_BILL_PAGE_SIZE}&page=${page}`,
  );
  const firstResponse = await requestPage(1);
  const allItems = [...(firstResponse.items ?? [])];
  const total = Number(firstResponse.meta?.total ?? allItems.length);
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_BILL_PAGE_SIZE));
  for (let page = 2; page <= totalPages; page += 4) {
    const pageNumbers = Array.from(
      { length: Math.min(4, totalPages - page + 1) },
      (_, index) => page + index,
    );
    const responses = await Promise.all(pageNumbers.map(requestPage));
    responses.forEach((response) => allItems.push(...(response.items ?? [])));
  }
  return allItems;
}

export default function CustomerDetailDialog({ customer, loading, initialTab = 'chi-tiet', onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CustomerDetailTabId>('chi-tiet');
  const [inventoryItems, setInventoryItems] = useState<WaybillInventoryItem[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [deliveryBoard, setDeliveryBoard] = useState<LoadPlanningBoardResponse | null>(null);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [cashVouchers, setCashVouchers] = useState<WaybillCashVoucher[]>([]);
  const [cashVoucherFilters, setCashVoucherFilters] = useState<CashVoucherFilters>({
    fromDate: '',
    toDate: '',
    voucherType: '',
  });
  const [billFilters, setBillFilters] = useState<BillFilters>({
    fromDate: '',
    toDate: '',
    billCode: '',
    paymentType: '',
  });
  const [cashVouchersLoading, setCashVouchersLoading] = useState(false);
  const [cashVouchersError, setCashVouchersError] = useState('');
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [collectWaybillIds, setCollectWaybillIds] = useState<string[]>([]);
  const [collectAmounts, setCollectAmounts] = useState<Record<string, string>>({});
  const [collectOpeningDebt, setCollectOpeningDebt] = useState(false);
  const [collectOpeningDebtAmount, setCollectOpeningDebtAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectFundId, setCollectFundId] = useState('');
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [collectError, setCollectError] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);

  const canViewCost = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (MANAGER | DIRECTOR)) !== 0;
  }, []);

  const canViewCashVouchers = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  }, []);

  useEffect(() => {
    if (customer) {
      queueMicrotask(() => setActiveTab(initialTab));
      return;
    }
    if (!customer) {
      queueMicrotask(() => {
        setActiveTab('chi-tiet');
        setInventoryItems([]);
        setInventoryTotal(0);
        setInventoryError('');
        setDeliveryBoard(null);
        setDeliveryTotal(0);
        setDeliveryError('');
        setCashVouchers([]);
        setCashVoucherFilters({ fromDate: '', toDate: '', voucherType: '' });
        setBillFilters({ fromDate: '', toDate: '', billCode: '', paymentType: '' });
        setCashVouchersError('');
        setIsCollectOpen(false);
        setCollectWaybillIds([]);
        setCollectAmounts({});
        setCollectOpeningDebt(false);
        setCollectOpeningDebtAmount('');
        setCollectNote('');
        setCollectError('');
        setIsStatementOpen(false);
        setIsPayoutOpen(false);
      });
    }
  }, [customer?.id, initialTab]);

  const statementData = useMemo(() => {
    const paidMaps = buildPaidByWaybill(cashVouchers);
    const voucherMeta = computeVoucherMeta(cashVouchers);
    return {
      paidMaps,
      voucherMeta,
      ...computeCustomerDebtSummary(inventoryItems, paidMaps, customer?.opening_debt, true),
    };
  }, [cashVouchers, customer?.opening_debt, inventoryItems]);
  const collectableBills = useMemo(() => inventoryItems.map((item) => {
    const freight = getBillFreight(item);
    const paid = resolvePaidForBill(item, statementData.paidMaps);
    return { item, remaining: Math.max(0, freight - paid) };
  }).filter(({ remaining }) => remaining > 0), [inventoryItems, statementData.paidMaps]);
  const selectedCollectBills = useMemo(() => collectableBills.filter(({ item }) => (
    collectWaybillIds.includes(String(item.id))
  )), [collectWaybillIds, collectableBills]);
  const collectTotal = selectedCollectBills.reduce((sum, { item }) => (
    sum + parseAmountInput(collectAmounts[String(item.id)] || '')
  ), 0) + (collectOpeningDebt ? parseAmountInput(collectOpeningDebtAmount) : 0);
  const collectSelectionCount = selectedCollectBills.length + (collectOpeningDebt ? 1 : 0);
  const creditBills = useMemo(() => inventoryItems.map((item) => {
    const freight = getBillFreight(item);
    const paid = resolvePaidForBill(item, statementData.paidMaps);
    return { item, credit: Math.max(0, paid - freight) };
  }).filter(({ credit }) => credit > 0), [inventoryItems, statementData.paidMaps]);

  useEffect(() => {
    const needsInventory = activeTab === 'don-hang' || activeTab === 'bill' || activeTab === 'thanh-toan';
    if (!customer?.code?.trim() || !needsInventory) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setInventoryLoading(true);
      setInventoryError('');

      loadAllCustomerBills(customer.code.trim())
        .then(({ items, total }) => {
          if (cancelled) return;
          setInventoryItems(items);
          setInventoryTotal(total);
        })
        .catch(() => {
          if (!cancelled) {
            setInventoryItems([]);
            setInventoryTotal(0);
            setInventoryError('Không tải được danh sách bill / tồn kho.');
          }
        })
        .finally(() => {
          if (!cancelled) setInventoryLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, customer?.code]);

  const deliveryTenCty = customer?.code?.trim() || customer?.name?.trim() || '';

  useEffect(() => {
    if (!deliveryTenCty || activeTab !== 'giao-hang') return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDeliveryLoading(true);
      setDeliveryError('');

      apiRequest<LoadPlanningBoardResponse>(
        `/waybills/load-planning/board?ten_cty=${encodeURIComponent(deliveryTenCty)}&limit=100`,
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
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, deliveryTenCty]);

  useEffect(() => {
    const maKh = customer?.code?.trim();
    const needsVouchers = (activeTab === 'thanh-toan' || activeTab === 'bill') && canViewCashVouchers;
    if (!maKh || !needsVouchers) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCashVouchersLoading(true);
      setCashVouchersError('');

      loadAllCustomerCashVouchers(maKh)
        .then((items) => {
          if (cancelled) return;
          setCashVouchers(items);
        })
        .catch(() => {
          if (cancelled) return;
          setCashVouchers([]);
          setCashVouchersError('Không tải được lịch sử thanh toán.');
        })
        .finally(() => {
          if (!cancelled) setCashVouchersLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, customer?.code, canViewCashVouchers]);

  const handleCashVoucherFiltersChange = (patch: Partial<CashVoucherFilters>) => {
    setCashVoucherFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleBillFiltersChange = (patch: Partial<BillFilters>) => {
    setBillFilters((prev) => ({ ...prev, ...patch }));
  };

  const loadCashVouchers = async (maKh: string) => {
    setCashVouchers(await loadAllCustomerCashVouchers(maKh));
  };

  const reloadCustomerFinance = async () => {
    const maKh = customer?.code?.trim();
    if (!maKh) return;
    const [{ items, total }, vouchers] = await Promise.all([
      loadAllCustomerBills(maKh),
      loadAllCustomerCashVouchers(maKh),
    ]);
    setInventoryItems(items);
    setInventoryTotal(total);
    setCashVouchers(vouchers);
  };

  const openCollectDialog = () => {
    setCollectWaybillIds([]);
    setCollectAmounts({});
    setCollectOpeningDebt(false);
    setCollectOpeningDebtAmount('');
    setCollectNote('');
    setCollectFundId('');
    setCollectError('');
    setIsCollectOpen(true);
  };

  const selectAllCollectBills = () => {
    setCollectWaybillIds(collectableBills.map(({ item }) => String(item.id)));
    setCollectAmounts((current) => collectableBills.reduce<Record<string, string>>((amounts, { item, remaining }) => {
      const id = String(item.id);
      amounts[id] = current[id] || formatAmountInputFromNumber(remaining);
      return amounts;
    }, {}));
    if (statementData.openingDebtRemaining > 0) {
      setCollectOpeningDebt(true);
      setCollectOpeningDebtAmount((current) => current || formatAmountInputFromNumber(statementData.openingDebtRemaining));
    }
    setCollectError('');
  };

  const toggleCollectBill = (id: string, remaining: number) => {
    const isSelected = collectWaybillIds.includes(id);
    setCollectWaybillIds((current) => (
      isSelected ? current.filter((value) => value !== id) : [...current, id]
    ));
    if (!isSelected) {
      setCollectAmounts((current) => ({
        ...current,
        [id]: current[id] || formatAmountInputFromNumber(remaining),
      }));
    }
    setCollectError('');
  };

  const submitCollectVoucher = async () => {
    const maKh = customer?.code?.trim();
    if (!collectSelectionCount) {
      setCollectError('Chọn ít nhất một bill hoặc công nợ tồn cũ cần thanh toán.');
      return;
    }
    if (!collectFundId) {
      setCollectError('Vui lòng chọn sổ quỹ nhận tiền.');
      return;
    }
    const paymentItems = selectedCollectBills.map(({ item, remaining }) => ({
      item,
      remaining,
      amount: parseAmountInput(collectAmounts[String(item.id)] || ''),
    }));
    const invalidPayment = paymentItems.find(({ amount, remaining }) => amount <= 0 || amount > remaining);
    if (invalidPayment) {
      const billCode = invalidPayment.item.waybill_code || invalidPayment.item.code || String(invalidPayment.item.id);
      setCollectError(
        invalidPayment.amount <= 0
          ? `Nhập số tiền thanh toán cho bill ${billCode}.`
          : `Số tiền của bill ${billCode} không được vượt quá ${formatMoney(invalidPayment.remaining)}.`,
      );
      return;
    }
    const openingDebtAmount = collectOpeningDebt ? parseAmountInput(collectOpeningDebtAmount) : 0;
    if (collectOpeningDebt && (openingDebtAmount <= 0 || openingDebtAmount > statementData.openingDebtRemaining)) {
      setCollectError(
        openingDebtAmount <= 0
          ? 'Nhập số tiền thanh toán công nợ tồn cũ.'
          : `Số tiền công nợ tồn cũ không được vượt quá ${formatMoney(statementData.openingDebtRemaining)}.`,
      );
      return;
    }
    setCollectSubmitting(true);
    setCollectError('');
    try {
      await apiRequest('/waybills/cash-vouchers/bulk-payment', {
        method: 'POST',
        body: {
          items: paymentItems.map(({ item, amount }) => ({
            waybill_id: String(item.id),
            waybill_code: item.waybill_code || item.code || String(item.id),
            amount,
          })),
          customer_code: maKh,
          opening_debt_amount: openingDebtAmount || undefined,
          fund_id: collectFundId,
          note: collectNote.trim() || `Thanh toán khách hàng ${maKh || customer?.name || ''}`.trim(),
        },
      });
      if (maKh) {
        const [{ items, total }] = await Promise.all([
          loadAllCustomerBills(maKh),
          loadCashVouchers(maKh),
        ]);
        setInventoryItems(items);
        setInventoryTotal(total);
      }
      setIsCollectOpen(false);
    } catch (err) {
      setCollectError(err instanceof ApiError ? err.message : 'Không lưu được thanh toán.');
    } finally {
      setCollectSubmitting(false);
    }
  };

  const reloadDeliveryBoard = () => {
    if (!deliveryTenCty) return;
    setDeliveryLoading(true);
    setDeliveryError('');
    apiRequest<LoadPlanningBoardResponse>(
      `/waybills/load-planning/board?ten_cty=${encodeURIComponent(deliveryTenCty)}&limit=100`,
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

  const openInventory = () => {
    if (!customer?.code?.trim()) return;
    onClose();
    navigate(`/warehouse/inventory?ma_kh=${encodeURIComponent(customer.code.trim())}`);
  };

  const openPriority = () => {
    if (!deliveryTenCty) return;
    onClose();
    navigate(`/warehouse/priority?keyword=${encodeURIComponent(deliveryTenCty)}`);
  };

  const printPaymentStatement = () => setIsStatementOpen(true);

  if (!customer) return null;

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
          <div className="space-y-4 pb-2">
            <DetailSection title="Thông tin chính">
              <Row label="Mã KH" value={customer.code} />
              <Row label="Tên KH" value={customer.name} />
              <Row label="Tên tắt" value={customer.short_name} />
              <Row label="Tiếng Anh" value={customer.english_name} />
              <Row label="Loại KH" value={customer.customer_type || 'KHACH_HANG'} />
              <Row label="Trạng thái" value={customer.is_suspended ? 'Tạm dừng' : customer.status || 'ACTIVE'} />
              <Row label="Số đơn" value={String(customer.waybill_count ?? inventoryTotal ?? 0)} />
              <Row label="Công nợ tồn cũ" value={formatMoney(customer.opening_debt ?? 0)} />
            </DetailSection>

            <DetailSection title="Liên hệ">
              <Row label="Liên hệ" value={customer.contact_person} />
              <Row label="Di động" value={customer.mobile} />
              <Row label="Số ĐT" value={customer.phone_landline} />
              <Row label="Email" value={customer.email} />
              <Row label="Địa chỉ gửi" value={customer.address} />
              <Row label="Đ/chỉ LH" value={customer.contact_address} />
              <Row label="Khu vực" value={customer.region} />
              <Row label="NV quản lý" value={customer.manager_name} />
              <Row label="MST" value={customer.tax_id} />
              <Row label="Số CMT" value={customer.id_number} />
            </DetailSection>

            <DetailSection title="Giao nhận & kho">
              <Row label="Giao nhận" value={customer.delivery_handler} />
              <Row label="Người nhận HAN" value={customer.receiver_han} />
              <Row label="ĐC kho HAN" value={customer.address_han} />
              <Row label="ĐT nhận HAN" value={customer.phone_han} />
              <Row label="Người nhận HCM" value={customer.receiver_hcm} />
              <Row label="ĐC kho HCM" value={customer.address_hcm} />
              <Row label="ĐT nhận HCM" value={customer.phone_hcm} />
              {(customer.receiver_dng || customer.address_dng || customer.phone_dng) && (
                <>
                  <Row label="Người nhận DNG (cũ)" value={customer.receiver_dng} />
                  <Row label="ĐC DNG (cũ)" value={customer.address_dng} />
                  <Row label="ĐT DNG (cũ)" value={customer.phone_dng} />
                </>
              )}
            </DetailSection>

            <DetailSection title="Bill & giá">
              <Row label="Bảng giá" value={customer.price_table} />
              <PriceListRow name={customer.price_list_name} url={customer.price_list_url} />
              <Row label="Tỉnh đến mặc định" value={customer.destination_province} />
              <Row label="Dịch vụ mặc định" value={customer.default_service} />
              <Row label="Giao hàng mặc định" value={customer.default_delivery_method} />
              <Row label="Tính cước theo" value={customer.default_billing_unit} />
              <Row label="Phương thức mặc định" value={customer.default_payment_method} />
              <Row label="Tính chất HH" value={specialGoodsLabels(customer.default_special_goods).join(', ')} />
              <Row label="Mã hợp đồng" value={customer.contract_code} />
              <Row label="Cơ chế" value={customer.mechanism} />
              <Row label="Chiết khấu %" value={String(customer.discount_percent ?? 0)} />
              <Row label="Công nợ" value={customer.credit_type} />
            </DetailSection>

            <DetailSection title="Thanh toán">
              <Row label="Hình thức CN" value={customer.credit_type} />
              <Row label="Công nợ tồn cũ" value={formatMoney(customer.opening_debt ?? 0)} />
              <Row label="Ngân hàng" value={customer.bank_name} />
              <Row label="Tài khoản" value={customer.bank_account} />
              <Row label="Chủ t.khoản" value={customer.bank_account_holder} />
            </DetailSection>
          </div>
        );

      case 'don-hang':
        return (
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-foreground">
                Mã KH: <span className="text-primary">{customer.code}</span>
                {inventoryTotal > 0 && (
                  <span className="ml-2 font-medium text-muted-foreground">({inventoryTotal} đơn)</span>
                )}
              </p>
              <button
                type="button"
                onClick={openInventory}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted"
              >
                <ExternalLink size={12} />
                Tồn kho
              </button>
            </div>

            {inventoryLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : inventoryError ? (
              <p className="py-8 text-center text-[13px] font-bold text-red-600">{inventoryError}</p>
            ) : inventoryItems.length === 0 ? (
              <div className="py-10 text-center">
                <Package size={28} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-[13px] font-medium text-muted-foreground">Chưa có đơn hàng với mã KH này.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Mã vận đơn</th>
                      <th className="px-2 py-2">Ngày</th>
                      <th className="px-2 py-2">Trạng thái</th>
                      <th className="px-2 py-2">Nơi đến</th>
                      <th className="px-2 py-2 text-right">Kiện</th>
                      <th className="px-2 py-2">TT</th>
                      {canViewCost && <th className="px-2 py-2 text-right">Cước</th>}
                      <th className="px-2 py-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.map((order) => {
                      const state = String(order.current_state || '').toUpperCase();
                      const freight = order.freight_amount ?? order.cost_amount;
                      return (
                        <tr key={String(order.id)} className="border-b border-border/70 hover:bg-muted/20">
                          <td className="px-2 py-2.5 font-extrabold text-primary">
                            {order.waybill_code || order.order_code || `#${order.id}`}
                          </td>
                          <td className="px-2 py-2.5">{formatDate(order.received_at || order.created_at)}</td>
                          <td className="px-2 py-2.5">{statusLabel[state] || state || '—'}</td>
                          <td className="px-2 py-2.5">{resolveNoiDen(order)}</td>
                          <td className="px-2 py-2.5 text-right">{order.package_count ?? order.trip_package_count ?? '—'}</td>
                          <td className="px-2 py-2.5">{order.payment_type || '—'}</td>
                          {canViewCost && (
                            <td className="px-2 py-2.5 text-right font-bold">{formatMoney(freight)}</td>
                          )}
                          <td className="px-2 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                title="Sửa đơn"
                                onClick={() => navigate(`/orders/new?edit=${encodeURIComponent(String(order.id))}`)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                title="In bill"
                                onClick={() => window.open(`/print/waybill/${order.id}?print=1`, '_blank', 'noopener')}
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

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => navigate('/orders/new', { state: { maKh: customer.code, nguoiGui: customer.name } })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-bold text-white hover:bg-primary/90"
              >
                <Package size={14} />
                Nhập đơn mới
              </button>
            </div>
          </Panel>
        );

      case 'giao-hang':
        return (
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-foreground">
                Tên CTY: <span className="text-primary">{deliveryTenCty}</span>
                {deliveryTotal > 0 && (
                  <span className="ml-2 font-medium text-muted-foreground">({deliveryTotal} dòng)</span>
                )}
              </p>
              <button
                type="button"
                onClick={openPriority}
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
                <p className="text-[13px] font-medium text-muted-foreground">
                  Chưa có hàng phân xe cho Tên CTY này.
                </p>
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
            customerCode={customer.code}
            items={inventoryItems}
            totalCount={inventoryTotal}
            vouchers={cashVouchers}
            openingDebt={customer.opening_debt}
            filters={billFilters}
            loading={inventoryLoading}
            vouchersLoading={canViewCashVouchers && cashVouchersLoading}
            error={inventoryError || (canViewCashVouchers ? cashVouchersError : '')}
            canViewCost={canViewCost}
            onFiltersChange={handleBillFiltersChange}
            onOpenInventory={openInventory}
            formatDate={formatDate}
          />
        );

      case 'thanh-toan':
        return (
          <div className="space-y-4">
            <DetailSection title="Thông tin thanh toán">
              <Row label="Hình thức CN" value={customer.credit_type} />
              <Row label="Công nợ tồn cũ" value={formatMoney(customer.opening_debt ?? 0)} />
              <Row label="Cơ chế" value={customer.mechanism} />
              <Row label="Ngân hàng" value={customer.bank_name} />
              <Row label="Tài khoản" value={customer.bank_account} />
              <Row label="Chủ t.khoản" value={customer.bank_account_holder} />
              <Row label="MST" value={customer.tax_id} />
              <Row label="Mã hợp đồng" value={customer.contract_code} />
            </DetailSection>

            {canViewCashVouchers ? (
              <CustomerCashVouchersPanel
                customerCode={customer.code}
                vouchers={cashVouchers}
                filters={cashVoucherFilters}
                loading={cashVouchersLoading}
                error={cashVouchersError}
                onFiltersChange={handleCashVoucherFiltersChange}
                onCollect={openCollectDialog}
                onPayout={() => setIsPayoutOpen(true)}
                onPrintStatement={printPaymentStatement}
              />
            ) : (
              <Panel>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Lịch sử thanh toán chỉ hiển thị với quyền Kế toán hoặc Quản lý.
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
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">in phiếu kê</p>
            <h3 className="text-[16px] font-extrabold text-foreground">Phiếu kê thanh toán · {customer.code}</h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90"
            >
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
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Phiếu kê thanh toán khách hàng</h1>
                <p className="mt-1 text-slate-500">Liệt kê các đơn và các khoản thanh toán của khách hàng</p>
              </div>
              <div className="text-right text-[12px]">
                <p><b>Ngày in:</b> {new Date().toLocaleString('vi-VN')}</p>
                <p><b>Mã KH:</b> {customer.code}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-1 text-[13px]">
              <p><b>Khách hàng:</b> {customer.name || '—'}</p>
              <p><b>Địa chỉ:</b> {customer.address || '—'}</p>
              <p><b>MST:</b> {customer.tax_id || '—'} <span className="mx-2">·</span> <b>Hợp đồng:</b> {customer.contract_code || '—'}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <PrintMetric label="Số đơn" value={inventoryItems.length.toLocaleString('vi-VN')} />
              <PrintMetric label="Công nợ tồn cũ" value={printMoney(statementData.openingDebt)} />
              <PrintMetric label="Tổng cước" value={printMoney(statementData.totalFreight)} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <PrintMetric label="Khách thanh toán" value={printMoney(statementData.voucherMeta.manual_thu)} />
              <PrintMetric label="Phiếu thu COD" value={printMoney(statementData.voucherMeta.cod_offset)} />
              <PrintMetric label="Đã chi trả khách" value={printMoney(statementData.voucherMeta.customer_payout)} />
              <PrintMetric label="Đối trừ ròng" value={printMoney(statementData.voucherMeta.net)} />
              <PrintMetric label={statementData.totalDebt < 0 ? 'ECO cần trả khách' : 'Công nợ còn lại'} value={printMoney(Math.abs(statementData.totalDebt))} />
              <PrintMetric label="Số giao dịch" value={Number(statementData.voucherMeta.total || 0).toLocaleString('vi-VN')} />
            </div>

            <h2 className="mt-6 text-[14px] font-extrabold uppercase text-primary">Danh sách đơn</h2>
            <table className="mt-2 w-full border-collapse text-left text-[11px]">
              <thead className="bg-slate-100 uppercase text-slate-600">
                <tr>{['#', 'Số bill', 'Ngày', 'Nơi đến / người nhận', 'TT', 'Cước', 'Đã TT', 'Còn lại'].map((header) => <th key={header} className="border border-slate-300 px-2 py-2">{header}</th>)}</tr>
              </thead>
              <tbody>
                {inventoryItems.length ? inventoryItems.map((item, index) => {
                  const freight = getBillFreight(item);
                  const paid = resolvePaidForBill(item, statementData.paidMaps);
                  return (
                    <tr key={String(item.id)}>
                      <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                      <td className="border border-slate-300 px-2 py-2 font-bold">{item.waybill_code || item.code || item.order_code || item.id}</td>
                      <td className="border border-slate-300 px-2 py-2">{formatDate(item.received_at || item.created_at)}</td>
                      <td className="border border-slate-300 px-2 py-2">{item.receiver_info || resolveNoiDen(item)}</td>
                      <td className="border border-slate-300 px-2 py-2">{item.payment_type || '—'}</td>
                      <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{printMoney(freight)}</td>
                      <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{printMoney(paid)}</td>
                      <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{printMoney(freight - paid)}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={8} className="border border-slate-300 px-2 py-6 text-center text-slate-500">Chưa có đơn.</td></tr>}
              </tbody>
            </table>

            <h2 className="mt-6 text-[14px] font-extrabold uppercase text-primary">Các khoản thanh toán</h2>
            <table className="mt-2 w-full border-collapse text-left text-[11px]">
              <thead className="bg-slate-100 uppercase text-slate-600">
                <tr>{['#', 'Ngày', 'Số bill', 'Loại', 'Số tiền', 'Ghi chú', 'Người lập'].map((header) => <th key={header} className="border border-slate-300 px-2 py-2">{header}</th>)}</tr>
              </thead>
              <tbody>
                {cashVouchers.length ? cashVouchers.map((voucher, index) => (
                  <tr key={String(voucher.id)}>
                    <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatDate(voucher.created_at)}</td>
                    <td className="border border-slate-300 px-2 py-2 font-bold">
                      {voucher.source_type === 'OPENING_DEBT' ? 'Công nợ tồn cũ' : voucher.waybill_code || voucher.waybill_id || '—'}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      {voucher.source_type === 'COD_COLLECTION'
                        ? 'Phiếu thu COD'
                        : voucher.source_type === 'CUSTOMER_PAYOUT'
                          ? 'Chi trả khách'
                          : voucher.source_type === 'OPENING_DEBT'
                            ? 'Thu công nợ tồn cũ'
                          : String(voucher.voucher_type).toLowerCase() === 'thu'
                            ? 'Khách thanh toán'
                            : 'Điều chỉnh giảm'}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-2 text-right">{printMoney(voucher.amount)}</td>
                    <td className="border border-slate-300 px-2 py-2">{voucher.note || '—'}</td>
                    <td className="border border-slate-300 px-2 py-2">{voucher.created_by_name || '—'}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="border border-slate-300 px-2 py-6 text-center text-slate-500">Chưa có khoản thanh toán.</td></tr>}
              </tbody>
            </table>

            <div className="mt-10 grid grid-cols-2 gap-10 text-center font-bold">
              <div>Khách hàng<br /><br /><br /><br /><span className="font-normal">Ký, ghi rõ họ tên</span></div>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-foreground">{customer.name}</h2>
              <p className="text-[12px] font-bold text-primary">{customer.code}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-border bg-slate-100 px-2 py-2">
          <div className="flex gap-1 overflow-x-auto custom-scrollbar">
            {CUSTOMER_DETAIL_TABS.map((tab) => (
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

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white p-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted">
            Đóng
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90"
            >
              <Edit size={15} />
              Sửa
            </button>
          )}
        </div>

        {isCollectOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-extrabold uppercase tracking-wide text-emerald-600">Thanh toán khách hàng</p>
                  <h3 className="text-lg font-extrabold text-foreground">{customer.name}</h3>
                  <p className="text-[12px] font-bold text-primary">{customer.code}</p>
                </div>
                <button type="button" onClick={() => setIsCollectOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                  <X size={18} />
                </button>
              </div>

              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Chọn khoản thanh toán</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={selectAllCollectBills}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-700"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCollectWaybillIds([]);
                        setCollectOpeningDebt(false);
                        setCollectError('');
                      }}
                      className="rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-extrabold text-muted-foreground"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="custom-scrollbar max-h-52 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/10 p-2">
                  {statementData.openingDebtRemaining > 0 && (
                    <div
                      className={clsx(
                        'rounded-lg border px-3 py-2.5 transition-colors',
                        collectOpeningDebt ? 'border-amber-300 bg-amber-50' : 'border-border bg-white hover:bg-muted/30',
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={collectOpeningDebt}
                          onChange={() => {
                            setCollectOpeningDebt((current) => !current);
                            setCollectOpeningDebtAmount((current) => current || formatAmountInputFromNumber(statementData.openingDebtRemaining));
                            setCollectError('');
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-300"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-extrabold text-foreground">Công nợ tồn cũ</span>
                          <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
                            Còn lại: {formatMoney(statementData.openingDebtRemaining)}
                          </span>
                        </span>
                      </label>
                      {collectOpeningDebt && (
                        <label className="mt-2 block border-t border-amber-200 pt-2">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-800">Số tiền thanh toán</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={collectOpeningDebtAmount}
                            onChange={(event) => {
                              setCollectOpeningDebtAmount(formatAmountInput(event.target.value));
                              setCollectError('');
                            }}
                            placeholder="0"
                            className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-[14px] font-extrabold outline-none focus:ring-2 focus:ring-amber-200"
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {collectableBills.length ? collectableBills.map(({ item, remaining }) => {
                    const id = String(item.id);
                    const checked = collectWaybillIds.includes(id);
                    const billDate = formatDate(item.sent_date || item.received_at || item.created_at);
                    return (
                      <div
                        key={id}
                        className={clsx(
                          'rounded-lg border px-3 py-2.5 transition-colors',
                          checked ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-white hover:bg-muted/30',
                        )}
                      >
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCollectBill(id, remaining)}
                            className="mt-0.5 h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-extrabold text-foreground">
                              {item.waybill_code || item.code || `#${item.id}`}
                            </span>
                            <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
                              Ngày bill: {billDate} · Còn lại: {formatMoney(remaining)}
                            </span>
                          </span>
                        </label>
                        {checked && (
                          <label className="mt-2 block border-t border-emerald-200 pt-2">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                              Số tiền thanh toán
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={collectAmounts[id] || ''}
                              onChange={(event) => {
                                setCollectAmounts((current) => ({
                                  ...current,
                                  [id]: formatAmountInput(event.target.value),
                                }));
                                setCollectError('');
                              }}
                              placeholder="0"
                              className="h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 text-[14px] font-extrabold outline-none focus:ring-2 focus:ring-emerald-200"
                            />
                          </label>
                        )}
                      </div>
                    );
                  }) : statementData.openingDebtRemaining <= 0 && (
                    <p className="px-3 py-6 text-center text-[12px] font-bold text-muted-foreground">Không còn bill cần thanh toán.</p>
                  )}
                </div>
              </div>

              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-bold text-emerald-800">{collectSelectionCount} khoản đã chọn</span>
                  <span className="text-[16px] font-black text-emerald-800">{formatMoney(collectTotal)}</span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-emerald-700">Mỗi khoản được ghi đúng số tiền thanh toán đã nhập.</p>
              </div>

              <CashFundSelect value={collectFundId} onChange={(value) => { setCollectFundId(value); setCollectError(''); }} className="mb-3" />

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú</span>
                <textarea
                  value={collectNote}
                  onChange={(event) => setCollectNote(event.target.value)}
                  rows={3}
                  placeholder="Nội dung thanh toán..."
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              {inventoryLoading && <p className="mb-3 text-[12px] font-bold text-muted-foreground">Đang tải danh sách bill...</p>}
              {collectError && <p className="mb-3 text-[13px] font-bold text-red-600">{collectError}</p>}

              <button
                type="button"
                disabled={collectSubmitting || inventoryLoading || collectSelectionCount === 0 || collectTotal <= 0}
                onClick={() => void submitCollectVoucher()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {collectSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Receipt size={16} />}
                Thanh toán {collectSelectionCount} khoản · {formatMoney(collectTotal)}
              </button>
            </div>
          </div>
        )}
        <CustomerPayoutDialog
          open={isPayoutOpen}
          customerName={customer.name}
          customerCode={customer.code}
          bills={creditBills}
          onClose={() => setIsPayoutOpen(false)}
          onSaved={reloadCustomerFinance}
        />
      </div>
    </div>,
    document.body,
  )}
    {statementDialog}
  </>;
}
