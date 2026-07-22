import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileSpreadsheet, Loader2, ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { getLoginDisplayName, getStoredAuthUser } from '../lib/authUser';
import CreateWaybillSuccessDialog from './warehouse/orders/dialogs/CreateWaybillSuccessDialog';
import OrderBulkImportDialog from './warehouse/orders/dialogs/OrderBulkImportDialog';
import NewOrderWorkbench from './warehouse/orders/components/NewOrderWorkbench';
import { emptyOrderForm } from './warehouse/orders/orderFormData';
import { applyReceiverByDestination, customerToOrderPatch } from './warehouse/customers/customerOrderPatch';
import type { CustomerRecord } from './warehouse/customers/customerFormTypes';
import {
  applyPricingToForm,
  buildCreatePayload,
  calcVolumetricWeight,
  isPricingField,
  isValidVnPhone,
  waybillToBillItem,
  waybillToOrderForm,
} from './warehouse/orders/orderFormUtils';
import type { CustomerListItem, CustomerListResponse } from './warehouse/customers/types';
import type { BillListItem, NewOrderFormState } from './warehouse/orders/orderFormTypes';
import { nextEcoBillCodeFromCodes } from './warehouse/orders/waybillCodeUtils';
import type { BadgeConfig, CreatedWaybill, HubSummary, PaymentType, UserSummary, WaybillDetail } from './warehouse/orders/types';
import { canViewWaybillPricing } from './print/waybillPricingAccess';

const USER_PROFILE_KEY = 'eco_user_profile';
const CREATE_ROLES = 1 | 32 | 64;
const INITIAL_BILL_LIST_LIMIT = 20;
const EXPANDED_BILL_LIST_LIMIT = 100;
type NextWaybillCodeResponse = { waybill_code?: string; code?: string };

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
};

const paymentConfig: Record<string, BadgeConfig> = {
  PP: { label: 'PP', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  CC: { label: 'CC', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COD: { label: 'COD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const getStoredUser = (): UserSummary | null => {
  const auth = getStoredAuthUser();
  if (auth) return auth as UserSummary;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSummary;
  } catch {
    return null;
  }
};

const extractList = <T,>(payload: T[] | { data?: T[]; items?: T[]; waybills?: T[] }): T[] =>
  Array.isArray(payload) ? payload : payload.data || payload.items || payload.waybills || [];

const normalizeActive = (hub: HubSummary) =>
  hub.is_active === undefined && !hub.status
    ? true
    : hub.is_active === true ||
      hub.is_active === 'true' ||
      hub.is_active === 1 ||
      String(hub.status || '').toUpperCase() === 'ACTIVE';

const formatHub = (hub: HubSummary) =>
  [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}`;

const hasCreateRole = (roleMask: number) => (roleMask & CREATE_ROLES) !== 0;

const getHubCode = (hubs: HubSummary[], hubId: string) =>
  hubs.find((hub) => String(hub.id) === String(hubId))?.code?.trim().toUpperCase() || 'HUB';

export default function WarehouseOrderNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const editWaybillId = searchParams.get('edit')?.trim() || '';
  const loadedEditIdRef = useRef('');
  const skipNewFormInitRef = useRef(Boolean(editWaybillId));
  const billRequestIdRef = useRef(0);
  const billListLimitRef = useRef(INITIAL_BILL_LIST_LIMIT);
  const [user] = useState<UserSummary | null>(() => getStoredUser());
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [form, setForm] = useState<NewOrderFormState>(() => emptyOrderForm());
  const [isLoading, setIsLoading] = useState(true);
  const [hubError, setHubError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdWaybill, setCreatedWaybill] = useState<CreatedWaybill | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isSuccessClosing, setIsSuccessClosing] = useState(false);
  const [showPricingOnPrint, setShowPricingOnPrint] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [billFilterDate, setBillFilterDate] = useState('');
  const [isBillListLoading, setIsBillListLoading] = useState(false);
  const [hasMoreBills, setHasMoreBills] = useState(false);

  const canCreate = hasCreateRole(user?.role_mask ?? 0);
  const canViewPricing = canViewWaybillPricing(user?.role_mask);
  const loginName = getLoginDisplayName(user as Parameters<typeof getLoginDisplayName>[0]);
  const hubOptions = useMemo(
    () => hubs.filter(normalizeActive).map((hub) => ({ value: String(hub.id), label: formatHub(hub) })),
    [hubs],
  );

  const volumetricWeight = useMemo(() => {
    const v = calcVolumetricWeight(form.chieuDai, form.chieuRong, form.chieuCao);
    return Number(String(v).replace(/[^\d.-]/g, '')) || 0;
  }, [form.chieuDai, form.chieuRong, form.chieuCao]);

  const loadBills = useCallback(async (dateFilter = '', limit = INITIAL_BILL_LIST_LIMIT) => {
    const requestId = ++billRequestIdRef.current;
    const requestLimit = dateFilter ? EXPANDED_BILL_LIST_LIMIT : limit;
    billListLimitRef.current = requestLimit;
    setIsBillListLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(requestLimit), page: '1' });
      if (dateFilter) {
        query.set('from_date', dateFilter);
        query.set('to_date', `${dateFilter}T23:59:59.999`);
      }
      const response = await apiRequest<
        WaybillDetail[] | {
          items?: WaybillDetail[];
          data?: WaybillDetail[];
          meta?: { total?: number };
        }
      >(
        `/waybills?${query.toString()}`,
      );
      const list = extractList(response);
      const billItems = list.map(waybillToBillItem);
      if (requestId === billRequestIdRef.current) {
        const total = Array.isArray(response) ? billItems.length : Number(response.meta?.total ?? billItems.length);
        setBills(billItems);
        setHasMoreBills(!dateFilter && requestLimit < total);
      }
      return billItems;
    } catch {
      if (requestId === billRequestIdRef.current) {
        setBills([]);
        setHasMoreBills(false);
      }
      return [];
    } finally {
      if (requestId === billRequestIdRef.current) setIsBillListLoading(false);
    }
  }, []);

  const loadNextWaybillCode = useCallback(async (originHubId?: string) => {
    try {
      const query = originHubId ? `?origin_hub_id=${encodeURIComponent(originHubId)}` : '';
      const response = await apiRequest<NextWaybillCodeResponse>(`/waybills/next-code${query}`);
      return (response.waybill_code || response.code || '').trim().toUpperCase();
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setHubError('');
      const hubsPromise = apiRequest<HubSummary[] | { data?: HubSummary[]; hubs?: HubSummary[] }>('/hubs/active');
      const billsPromise = loadBills('', INITIAL_BILL_LIST_LIMIT);
      try {
        const response = await hubsPromise;
        const activeHubs = extractList(response).filter(normalizeActive);
        setHubs(activeHubs);

        const pendingEditId =
          searchParams.get('edit')?.trim()
          || (location.state as { waybillId?: string } | null)?.waybillId?.trim()
          || '';
        if (pendingEditId || skipNewFormInitRef.current) {
          if (pendingEditId) skipNewFormInitRef.current = true;
          return;
        }

        const defaultOrigin = user?.hub_id ? String(user.hub_id) : String(activeHubs[0]?.id || '');
        const defaultDest = String(activeHubs.find((h) => h.code?.toUpperCase() === 'HCM')?.id || activeHubs[1]?.id || '');
        const nextCode = await loadNextWaybillCode(defaultOrigin);
        const fallbackBills = nextCode ? [] : await billsPromise;
        const defaultOriginCode = getHubCode(activeHubs, defaultOrigin);
        setForm(() =>
          applyPricingToForm({
            ...emptyOrderForm(),
            soBill: nextCode || nextEcoBillCodeFromCodes(fallbackBills.map((item) => item.waybill_code), defaultOriginCode),
            originHubId: defaultOrigin,
            destHubId: defaultDest,
            noiDen: 'HCM',
            nvgn: loginName !== 'bạn' ? loginName : 'ADMIN',
          }),
        );
      } catch (error) {
        setHubError(error instanceof ApiError ? error.message : 'Không thể tải danh sách bưu cục.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [loadBills, loadNextWaybillCode, location.state, loginName, searchParams, user?.hub_id]);

  useEffect(() => {
    const state = location.state as { maKh?: string; nguoiGui?: string; waybillId?: string } | null;
    const waybillId = editWaybillId || state?.waybillId?.trim() || '';

    if (waybillId) {
      if (isLoading || hubs.length === 0) return;
      if (loadedEditIdRef.current === waybillId) return;
      loadedEditIdRef.current = waybillId;
      skipNewFormInitRef.current = true;
      void (async () => {
        setActionError('');
        try {
          const detail = await apiRequest<WaybillDetail>(`/waybills/${waybillId}`);
          setSelectedBillId(String(waybillId));
          setSelectedCustomer(null);
          setForm(waybillToOrderForm(detail, hubs));
          if (editWaybillId) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('edit');
            setSearchParams(nextParams, { replace: true });
          } else {
            navigate(location.pathname, { replace: true, state: null });
          }
        } catch {
          loadedEditIdRef.current = '';
          setActionError('Không tải được vận đơn để sửa.');
        }
      })();
      return;
    }

    if (!state?.maKh || isLoading || hubs.length === 0) return;

    const code = state.maKh.toUpperCase();
    void (async () => {
      try {
        const response = await apiRequest<CustomerListResponse>(`/customers?keyword=${encodeURIComponent(code)}&limit=5`);
        const items = Array.isArray(response) ? response : response.items || [];
        const match = items.find((c) => c.code.toUpperCase() === code);
        if (match) {
          const full = await apiRequest<Partial<CustomerListItem>>(`/customers/${match.id}`);
          const record = { ...match, ...full } as CustomerRecord;
          setSelectedCustomer(record);
          setForm((prev) => applyPricingToForm({ ...prev, ...customerToOrderPatch(record, hubs) }));
          return;
        }
      } catch {
        /* fallback */
      }
      setForm((prev) =>
        applyPricingToForm({
          ...prev,
          maKh: code,
          nguoiGui: state.nguoiGui?.trim() || prev.nguoiGui,
        }),
      );
    })();
  }, [editWaybillId, location.state, isLoading, hubs, navigate, location.pathname, searchParams, setSearchParams]);

  const setField = <K extends keyof NewOrderFormState>(key: K, value: NewOrderFormState[K]) => {
    setForm((prev) => {
      let next = { ...prev, [key]: value };
      if (key === 'chieuDai' || key === 'chieuRong' || key === 'chieuCao') {
        next = {
          ...next,
          klQuyDoi: calcVolumetricWeight(next.chieuDai, next.chieuRong, next.chieuCao),
        };
      }
      if (isPricingField(key) || key === 'chieuDai' || key === 'chieuRong' || key === 'chieuCao') {
        next = applyPricingToForm(next);
      }
      return next;
    });
    if (key === 'originHubId' && typeof value === 'string' && value) {
      void (async () => {
        const nextCode = await loadNextWaybillCode(value);
        const originCode = getHubCode(hubs, value);
        setForm((prev) => ({
          ...prev,
          soBill: nextCode || nextEcoBillCodeFromCodes(bills.map((item) => item.waybill_code), originCode),
        }));
      })();
    }
    setActionError('');
  };

  const handleCustomerSelect = (patch: Partial<NewOrderFormState>, customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setForm((prev) => {
      const noiDen = patch.noiDen || prev.noiDen || 'HCM';
      const huyen = patch.huyen || prev.huyen;
      const receiverPatch = applyReceiverByDestination(customer, noiDen, huyen);
      return applyPricingToForm({ ...prev, ...patch, ...receiverPatch, noiDen });
    });
    setActionError('');
  };

  const handleDestinationChange = (destHubId: string, noiDen: string, huyen: string) => {
    setForm((prev) => {
      const receiverPatch = selectedCustomer
        ? applyReceiverByDestination(selectedCustomer, noiDen, huyen || prev.huyen)
        : {};
      return applyPricingToForm({ ...prev, destHubId, noiDen, huyen, ...receiverPatch });
    });
    setActionError('');
  };

  const validate = () => {
    if (!form.soBill.trim()) return 'Số bill là bắt buộc.';
    if (!form.nguoiGui.trim()) return 'Người gửi là bắt buộc.';
    if (!form.nguoiNhan.trim()) return 'Người nhận là bắt buộc.';
    if (!form.diaChiNhan.trim()) return 'Địa chỉ nhận là bắt buộc.';
    if (form.dienThoaiNhan.trim() && !isValidVnPhone(form.dienThoaiNhan)) {
      return 'Số điện thoại người nhận không hợp lệ.';
    }
    if (!form.originHubId) return 'Chọn bưu cục gửi.';
    if (!form.destHubId) return 'Chọn bưu cục đến.';
    if (form.originHubId === form.destHubId) return 'Bưu cục gửi và đến không được trùng.';
    if (!Number(form.klKg) && !volumetricWeight) return 'Nhập khối lượng hoặc kích thước.';
    return '';
  };

  const handleSelectBill = async (bill: BillListItem) => {
    setSelectedBillId(bill.id);
    setSelectedCustomer(null);
    setActionError('');
    try {
      const detail = await apiRequest<WaybillDetail>(`/waybills/${bill.id}`);
      setForm(waybillToOrderForm(detail, hubs));
    } catch {
      setActionError('Không tải được chi tiết vận đơn.');
    }
  };

  const handleNew = async () => {
    skipNewFormInitRef.current = false;
    loadedEditIdRef.current = '';
    const defaultOrigin = user?.hub_id ? String(user.hub_id) : String(hubs[0]?.id || '');
    const defaultDest = String(hubs.find((h) => h.code?.toUpperCase() === 'HCM')?.id || hubs[1]?.id || '');
    const nextCode = await loadNextWaybillCode(defaultOrigin);
    const defaultOriginCode = getHubCode(hubs, defaultOrigin);
    setSelectedBillId(null);
    setSelectedCustomer(null);
    setForm(
      applyPricingToForm({
        ...emptyOrderForm(),
        soBill: nextCode || nextEcoBillCodeFromCodes(bills.map((item) => item.waybill_code), defaultOriginCode),
        originHubId: defaultOrigin,
        destHubId: defaultDest,
        noiDen: 'HCM',
        nvgn: loginName !== 'bạn' ? loginName : 'ADMIN',
      }),
    );
    setActionError('');
  };

  const handleSave = async () => {
    if (!canCreate) return;
    const message = validate();
    if (message) {
      setActionError(message);
      return;
    }
    setIsSubmitting(true);
    setActionError('');
    try {
      const body = buildCreatePayload(form, volumetricWeight, selectedBillId ? 'update' : 'create');
      if (selectedBillId) {
        await apiRequest(`/waybills/${selectedBillId}`, { method: 'PATCH', body });
        await loadBills(billFilterDate, billListLimitRef.current);
        setActionError('');
      } else {
        const response = await apiRequest<CreatedWaybill>('/waybills', { method: 'POST', body });
        setCreatedWaybill({
          ...response,
          current_state: response.current_state || 'RECEIVED',
          payment_type: (response.payment_type as PaymentType) || 'PP',
        });
        setForm((prev) => ({
          ...prev,
          soBill: response.waybill_code || response.code || prev.soBill,
        }));
        setIsSuccessOpen(true);
        await loadBills(billFilterDate, billListLimitRef.current);
        if (response.id) setSelectedBillId(String(response.id));
      }
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không thể lưu đơn hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBill = async (bill: BillListItem) => {
    if (!canCreate) return;
    if (!window.confirm(`Xóa vận đơn ${bill.waybill_code}?`)) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/waybills/${bill.id}`, { method: 'DELETE' });
      if (selectedBillId === bill.id) void handleNew();
      await loadBills(billFilterDate, billListLimitRef.current);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không thể xóa vận đơn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    const bill = bills.find((item) => item.id === selectedBillId);
    if (!bill) return;
    void handleDeleteBill(bill);
  };

  const printableBillId = useMemo(() => {
    if (selectedBillId) return selectedBillId;
    const code = form.soBill.trim().toUpperCase();
    if (!code) return null;
    return bills.find((bill) => bill.waybill_code.toUpperCase() === code)?.id ?? null;
  }, [selectedBillId, form.soBill, bills]);

  const buildPrintQuery = (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params);
    if (canViewPricing && showPricingOnPrint) query.set('pricing', 'show');
    else query.delete('pricing');
    return query.toString();
  };

  const openPrintBill = (params: Record<string, string> = {}, billId?: string | null) => {
    const id = billId ?? printableBillId;
    if (!id) return;
    const query = buildPrintQuery(params);
    window.open(`/print/waybill/${id}${query ? `?${query}` : ''}`, '_blank', 'noopener');
  };

  const handlePrintBill = (bill: BillListItem) => {
    openPrintBill({ print: '1' }, bill.id);
  };

  const handleBulkPrintBills = (billIds: string[]) => {
    if (!billIds.length) return;
    const query = buildPrintQuery({
      ids: billIds.join(','),
      print: '1',
    });
    window.open(`/print/waybills?${query}`, '_blank', 'noopener');
  };

  const handleBillFilterDateChange = (value: string) => {
    setBillFilterDate(value);
    void loadBills(value, value ? EXPANDED_BILL_LIST_LIMIT : INITIAL_BILL_LIST_LIMIT);
  };

  const handleLoadMoreBills = () => {
    void loadBills(billFilterDate, EXPANDED_BILL_LIST_LIMIT);
  };

  const closeSuccess = () => {
    setIsSuccessClosing(true);
    window.setTimeout(() => {
      setIsSuccessOpen(false);
      setIsSuccessClosing(false);
    }, 250);
  };

  const handleCreateAnother = () => {
    setIsSuccessOpen(false);
    setIsSuccessClosing(false);
    setCreatedWaybill(null);
    void handleNew();
  };

  const createdId = createdWaybill?.id || createdWaybill?.waybill_code;

  if (!canCreate) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-[13px] font-semibold text-red-600">
        <ShieldAlert className="mr-2" size={18} />
        Cần quyền WAREHOUSE, MANAGER hoặc DIRECTOR để nhập đơn.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-extrabold text-foreground">Nhập đơn mới</h1>
          <p className="text-[12px] font-medium text-muted-foreground">Thông tin đơn hàng · NVGN: {loginName}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsBulkImportOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-800 hover:bg-emerald-100"
        >
          <FileSpreadsheet size={15} />
          <span className="hidden sm:inline">Nhập loạt Excel</span>
        </button>
        {isSubmitting && <Loader2 size={18} className="animate-spin text-primary" />}
      </div>

      {hubError && (
        <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          <AlertTriangle className="mr-1 inline" size={14} />
          {hubError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border shadow-sm">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center bg-[#e8eef5]">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : (
          <NewOrderWorkbench
            form={form}
            setField={setField}
            onCustomerSelect={handleCustomerSelect}
            onDestinationChange={handleDestinationChange}
            bills={bills}
            selectedBillId={selectedBillId}
            onSelectBill={(bill) => void handleSelectBill(bill)}
            hubOptions={hubOptions}
            hubs={hubs}
            onSave={() => void handleSave()}
            onNew={() => void handleNew()}
            onDelete={handleDelete}
            onDeleteBill={(bill) => void handleDeleteBill(bill)}
            onPreviewRegular={() => openPrintBill()}
            onPrintRegular={() => openPrintBill({ print: '1' })}
            onPrintA5={() => openPrintBill({ print: '1', format: 'a5' })}
            printableBillId={printableBillId}
            canViewPricing={canViewPricing}
            showPricingOnPrint={showPricingOnPrint}
            onShowPricingOnPrintChange={setShowPricingOnPrint}
            billFilterDate={billFilterDate}
            onBillFilterDateChange={handleBillFilterDateChange}
            isBillListLoading={isBillListLoading}
            hasMoreBills={hasMoreBills}
            onLoadMoreBills={handleLoadMoreBills}
            onBulkPrintBills={handleBulkPrintBills}
            onPrintBill={handlePrintBill}
            canManage={canCreate}
            isSubmitting={isSubmitting}
            error={actionError}
          />
        )}
      </div>

      <CreateWaybillSuccessDialog
        isOpen={isSuccessOpen}
        isClosing={isSuccessClosing}
        waybill={createdWaybill}
        statusConfig={statusConfig}
        paymentConfig={paymentConfig}
        onClose={closeSuccess}
        onCreateAnother={handleCreateAnother}
        onPrint={() => {
          if (!createdId) return;
          navigate(`/print/waybill/${createdId}?${buildPrintQuery({ print: '1' })}`);
        }}
      />

      <OrderBulkImportDialog
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        hubs={hubs}
        existingWaybillCodes={bills.map((bill) => bill.waybill_code)}
        defaultNvgn={loginName !== 'bạn' ? loginName : 'ADMIN'}
        onImported={async () => { await loadBills(billFilterDate, billListLimitRef.current); }}
      />
    </div>
  );
}
