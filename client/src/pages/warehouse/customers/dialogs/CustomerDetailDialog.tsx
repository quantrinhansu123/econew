import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, Edit, ExternalLink, Loader2, Package, Printer, Receipt, Truck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../../lib/api';
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
  computeVoucherMeta,
  getBillFreight,
  resolvePaidForBill,
  type BillFilters,
} from '../utils/customerFinanceUtils';
import type { WaybillCashVoucher } from '../../inventory/dialogs/WaybillCashVoucherDialog';

interface Props {
  customer: CustomerRecord | null;
  loading?: boolean;
  onClose: () => void;
  onEdit: () => void;
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
const formatMoney = (value?: number | string | null) =>
  value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')} đ`;

const printMoney = (value?: number | string | null) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const parseAmountInput = (value: string) => Number(String(value).replace(/\D/g, '') || 0);

const formatAmountInput = (value: string) => {
  const digits = String(value).replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

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

export default function CustomerDetailDialog({ customer, loading, onClose, onEdit }: Props) {
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
  const [collectWaybillId, setCollectWaybillId] = useState('');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [collectError, setCollectError] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const canViewCost = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (MANAGER | DIRECTOR)) !== 0;
  }, []);

  const canViewCashVouchers = useMemo(() => {
    const user = getStoredUser();
    return ((user?.role_mask ?? 0) & (ACCOUNTANT | MANAGER | DIRECTOR)) !== 0;
  }, []);

  useEffect(() => {
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
        setCollectWaybillId('');
        setCollectAmount('');
        setCollectNote('');
        setCollectError('');
        setIsStatementOpen(false);
      });
    }
  }, [customer?.id]);

  const statementData = useMemo(() => {
    const paidMaps = buildPaidByWaybill(cashVouchers);
    const voucherMeta = computeVoucherMeta(cashVouchers);
    const totalFreight = inventoryItems.reduce((sum, item) => sum + getBillFreight(item), 0);
    const totalPaid = inventoryItems.reduce((sum, item) => sum + resolvePaidForBill(item, paidMaps), 0);
    return { paidMaps, voucherMeta, totalFreight, totalPaid, totalDebt: totalFreight - totalPaid };
  }, [cashVouchers, inventoryItems]);

  useEffect(() => {
    const needsInventory = activeTab === 'don-hang' || activeTab === 'bill' || activeTab === 'thanh-toan';
    if (!customer?.code?.trim() || !needsInventory) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setInventoryLoading(true);
      setInventoryError('');

      apiRequest<InventoryListResponse | WaybillInventoryItem[]>(
        `/waybills/inventory/trip-lines?ma_kh=${encodeURIComponent(customer.code.trim())}&limit=200&page=1`,
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

      apiRequest<{ items?: WaybillCashVoucher[]; meta?: { total?: number } }>(
        `/waybills/cash-vouchers?ma_kh=${encodeURIComponent(maKh)}&limit=200`,
      )
        .then((response) => {
          if (cancelled) return;
          setCashVouchers(response.items ?? []);
        })
        .catch(() => {
          if (cancelled) return;
          setCashVouchers([]);
          setCashVouchersError('Không tải được danh sách thu chi.');
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
    const response = await apiRequest<{ items?: WaybillCashVoucher[]; meta?: { total?: number } }>(
      `/waybills/cash-vouchers?ma_kh=${encodeURIComponent(maKh)}&limit=200`,
    );
    setCashVouchers(response.items ?? []);
  };

  const openCollectDialog = () => {
    setCollectWaybillId(inventoryItems[0]?.id ? String(inventoryItems[0].id) : '');
    setCollectAmount('');
    setCollectNote('');
    setCollectError('');
    setIsCollectOpen(true);
  };

  const submitCollectVoucher = async () => {
    const maKh = customer?.code?.trim();
    const amount = parseAmountInput(collectAmount);
    if (!collectWaybillId) {
      setCollectError('Chọn bill cần thu tiền.');
      return;
    }
    if (amount <= 0) {
      setCollectError('Nhập số tiền thu lớn hơn 0.');
      return;
    }
    setCollectSubmitting(true);
    setCollectError('');
    try {
      await apiRequest(`/waybills/${collectWaybillId}/cash-vouchers`, {
        method: 'POST',
        body: {
          voucher_type: 'Thu',
          amount,
          note: collectNote.trim() || `Thu tiền khách hàng ${maKh || customer?.name || ''}`.trim(),
        },
      });
      if (maKh) await loadCashVouchers(maKh);
      setIsCollectOpen(false);
    } catch {
      setCollectError('Không lưu được phiếu thu.');
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
              <Row label="Tỉnh đến" value={customer.destination_province} />
              <Row label="Người nhận HCM" value={customer.receiver_hcm} />
              <Row label="ĐC kho HCM" value={customer.address_hcm} />
              <Row label="ĐT nhận HCM" value={customer.phone_hcm} />
              <Row label="Người nhận DNG" value={customer.receiver_dng} />
              <Row label="ĐC DNG" value={customer.address_dng} />
              <Row label="ĐT DNG" value={customer.phone_dng} />
            </DetailSection>

            <DetailSection title="Bill & giá">
              <Row label="Bảng giá" value={customer.price_table} />
              <Row label="Mã hợp đồng" value={customer.contract_code} />
              <Row label="Cơ chế" value={customer.mechanism} />
              <Row label="Chiết khấu %" value={String(customer.discount_percent ?? 0)} />
              <Row label="Công nợ" value={customer.credit_type} />
            </DetailSection>

            <DetailSection title="Thanh toán">
              <Row label="Hình thức CN" value={customer.credit_type} />
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
                onPrintStatement={printPaymentStatement}
              />
            ) : (
              <Panel>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Danh sách phiếu thu/chi chỉ hiển thị với quyền Kế toán hoặc Quản lý.
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

            <div className="mt-4 grid grid-cols-4 gap-2">
              <PrintMetric label="Số đơn" value={inventoryItems.length.toLocaleString('vi-VN')} />
              <PrintMetric label="Tổng cước" value={printMoney(statementData.totalFreight)} />
              <PrintMetric label="Đã TT theo đơn" value={printMoney(statementData.totalPaid)} />
              <PrintMetric label="Công nợ còn lại" value={printMoney(statementData.totalDebt)} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <PrintMetric label="Tổng thu" value={printMoney(statementData.voucherMeta.total_thu)} />
              <PrintMetric label="Tổng chi" value={printMoney(statementData.voucherMeta.total_chi)} />
              <PrintMetric label="Chênh lệch" value={printMoney(statementData.voucherMeta.net)} />
              <PrintMetric label="Số phiếu" value={Number(statementData.voucherMeta.total || 0).toLocaleString('vi-VN')} />
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
                    <td className="border border-slate-300 px-2 py-2 font-bold">{voucher.waybill_code || voucher.waybill_id || '—'}</td>
                    <td className="border border-slate-300 px-2 py-2">{voucher.voucher_type || '—'}</td>
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
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90"
          >
            <Edit size={15} />
            Sửa
          </button>
        </div>

        {isCollectOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-extrabold uppercase tracking-wide text-emerald-600">Lập phiếu thu</p>
                  <h3 className="text-lg font-extrabold text-foreground">{customer.name}</h3>
                  <p className="text-[12px] font-bold text-primary">{customer.code}</p>
                </div>
                <button type="button" onClick={() => setIsCollectOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                  <X size={18} />
                </button>
              </div>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bill cần thu</span>
                <select
                  value={collectWaybillId}
                  onChange={(event) => setCollectWaybillId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-bold"
                >
                  <option value="">Chọn bill</option>
                  {inventoryItems.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {item.waybill_code || item.code || `#${item.id}`} · {formatMoney(item.cost_amount || item.freight_amount || item.cod_amount)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Số tiền thu</span>
                <input
                  value={collectAmount}
                  onChange={(event) => setCollectAmount(formatAmountInput(event.target.value))}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] font-extrabold outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ghi chú</span>
                <textarea
                  value={collectNote}
                  onChange={(event) => setCollectNote(event.target.value)}
                  rows={3}
                  placeholder="Nội dung phiếu thu..."
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>

              {inventoryLoading && <p className="mb-3 text-[12px] font-bold text-muted-foreground">Đang tải danh sách bill...</p>}
              {collectError && <p className="mb-3 text-[13px] font-bold text-red-600">{collectError}</p>}

              <button
                type="button"
                disabled={collectSubmitting || inventoryLoading}
                onClick={() => void submitCollectVoucher()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {collectSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Receipt size={16} />}
                Lưu phiếu thu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )}
    {statementDialog}
  </>;
}
