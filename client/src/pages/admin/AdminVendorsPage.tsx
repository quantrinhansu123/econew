import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  Edit,
  Eye,
  Filter,
  GripVertical,
  LayoutGrid,
  Loader2,
  MapPinned,
  Plus,
  Power,
  Search,
  ServerOff,
  Tag,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../lib/api';
import { formatAmountInputFromNumber, formatMoney, parseAmountInput } from '../../lib/formatMoney';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { FilterSelect } from '../../components/ui/FilterSelect';
import type { AuthUserProfile } from '../login/types';
import AddEditVendorDialog from './vendors/dialogs/AddEditVendorDialog';
import VendorDetailDialog from './vendors/dialogs/VendorDetailDialog';
import VendorPricingDialog from './vendors/dialogs/VendorPricingDialog';
import VendorRoutesDialog from './vendors/dialogs/VendorRoutesDialog';
import VendorStatusConfirmDialog from './vendors/dialogs/VendorStatusConfirmDialog';
import {
  contractTypeOptions,
  defaultVendorColumnOrder,
  defaultVisibleVendorColumns,
  formatContractType,
  formatProvince,
  formatServiceType,
  formatStatus,
  provinceOptions,
  serviceTypeOptions,
  statusOptions,
  vendorFormFields,
  vendorTableHeaders,
  type VendorTableColumnId,
} from './vendors/data';
import type { Vendor, VendorFilters, VendorFormState, VendorListResponse } from './vendors/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

type Capability = 'create' | 'update' | 'status' | 'routes' | 'pricing' | 'delete';

const capabilityMessages: Record<Capability, string> = {
  create: 'Chưa thể tạo nhà cung cấp lúc này.',
  update: 'Chưa thể cập nhật thông tin nhà cung cấp lúc này.',
  status: 'Chưa thể cập nhật trạng thái nhà cung cấp lúc này.',
  routes: 'Chưa thể cập nhật tuyến phục vụ lúc này.',
  pricing: 'Chưa thể cập nhật bảng giá tham chiếu lúc này.',
  delete: 'Chưa thể xóa nhà cung cấp lúc này.',
};

const emptyForm: VendorFormState = {
  code: '',
  name: '',
  service_type: '',
  contact_name: '',
  phone: '',
  email: '',
  opening_debt: '',
  bank_name: '',
  bank_account: '',
  bank_account_holder: '',
  qr_image_url: '',
  province: '',
  contract_type: '',
  status: 'ACTIVE',
};

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

const isManager = (roleMask: number) => (roleMask & (MANAGER | DIRECTOR)) !== 0;
const isDirector = (roleMask: number) => (roleMask & DIRECTOR) !== 0;
const normalizeId = (value?: string | number | null) => (value == null ? '' : String(value));
const normalizeList = (response: VendorListResponse | Vendor[]) =>
  Array.isArray(response) ? response : response.items || response.data || response.vendors || [];
const normalizeTotal = (response: VendorListResponse | Vendor[], fallback: number) =>
  Array.isArray(response) ? fallback : response.meta?.total ?? response.total ?? fallback;
const vendorName = (vendor: Vendor) => vendor.name || vendor.code || `NCC #${vendor.id}`;
const apiMessage = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const isUnsupported = (error: unknown) => error instanceof ApiError && [404, 405, 501].includes(error.status);

export default function AdminVendorsPage() {
  const [filters, setFilters] = useState<VendorFilters>({
    keyword: '',
    status: [],
    service_type: [],
    province: [],
    contract_type: [],
    page: 1,
    limit: 500,
  });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [unsupportedCapabilities, setUnsupportedCapabilities] = useState<Capability[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formState, setFormState] = useState<VendorFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFormClosing, setIsFormClosing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [routesValue, setRoutesValue] = useState('');
  const [pricingValue, setPricingValue] = useState('');
  const [routesOpen, setRoutesOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [visibleColumns, setVisibleColumns] = useState<VendorTableColumnId[]>(defaultVisibleVendorColumns);
  const [columnOrder, setColumnOrder] = useState<VendorTableColumnId[]>(defaultVendorColumnOrder);

  const user = useMemo(getStoredUser, []);
  const canManage = isManager(user?.role_mask ?? 0);
  const canDelete = isDirector(user?.role_mask ?? 0);
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const orderedVisibleHeaders = useMemo(
    () =>
      columnOrder
        .map(columnId => vendorTableHeaders.find(header => header.id === columnId))
        .filter((header): header is (typeof vendorTableHeaders)[number] => Boolean(header && visibleColumnSet.has(header.id))),
    [columnOrder, visibleColumnSet],
  );
  const activeFilterCount =
    filters.status.length + filters.service_type.length + filters.province.length + filters.contract_type.length;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.status.length) params.set('status', filters.status.join(','));
    if (filters.service_type.length) params.set('service_type', filters.service_type.join(','));
    if (filters.province.length) params.set('province', filters.province.join(','));
    if (filters.contract_type.length) params.set('contract_type', filters.contract_type.join(','));
    params.set('page', String(filters.page));
    params.set('limit', String(filters.limit));
    return params.toString();
  }, [filters]);

  useEffect(() => {
    void fetchVendors();
  }, [queryString]);

  const updateFilter = <K extends keyof VendorFilters>(key: K, value: VendorFilters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? (value as number) : 1 }));
  const clearFilters = () =>
    setFilters(prev => ({ ...prev, status: [], service_type: [], province: [], contract_type: [], page: 1 }));
  const rememberUnsupported = (capability: Capability) =>
    setUnsupportedCapabilities(prev => (prev.includes(capability) ? prev : [...prev, capability]));
  const isCapabilityUnsupported = (capability: Capability) => unsupportedCapabilities.includes(capability);
  const toggleColumn = (columnId: VendorTableColumnId) =>
    setVisibleColumns(prev => (prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]));
  const reorderColumn = (sourceId: VendorTableColumnId, targetId: VendorTableColumnId) =>
    setColumnOrder(prev => moveColumn(prev, sourceId, targetId));

  async function fetchVendors() {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<VendorListResponse | Vendor[]>(`/vendors?${queryString}`);
      const list = normalizeList(response);
      setVendors(list);
      setTotal(normalizeTotal(response, list.length));
    } catch (err) {
      setError(apiMessage(err, 'Không tải được danh sách NCC.'));
      setVendors([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }

  const closeForm = () => closeWithAnimation(setIsFormClosing, setIsFormOpen);

  const openCreate = () => {
    setSelectedVendor(null);
    setIsEditMode(false);
    setFormState(emptyForm);
    setActionError('');
    setIsFormOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsEditMode(true);
    setFormState(toFormState(vendor));
    setActionError('');
    setIsFormOpen(true);
  };

  const openDetail = async (vendor: Vendor) => {
    const id = normalizeId(vendor.id);
    setDetailVendor(vendor);
    if (!id) return;
    setDetailLoading(true);
    try {
      const detail = await apiRequest<Vendor>(`/vendors/${id}`);
      setDetailVendor(detail);
    } catch (err) {
      if (!isUnsupported(err)) setActionError(apiMessage(err, 'Không tải được chi tiết NCC.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitForm = async () => {
    setIsSubmitting(true);
    setActionError('');
    try {
      const payload = toVendorPayload(formState, isEditMode);
      if (isEditMode && selectedVendor?.id != null) {
        await apiRequest(`/vendors/${selectedVendor.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiRequest('/vendors', { method: 'POST', body: payload });
      }
      closeForm();
      await fetchVendors();
    } catch (err) {
      if (isUnsupported(err)) rememberUnsupported(isEditMode ? 'update' : 'create');
      setActionError(apiMessage(err, isEditMode ? capabilityMessages.update : capabilityMessages.create));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitJsonConfig = async (kind: 'routes' | 'pricing') => {
    if (!selectedVendor?.id) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      const raw = kind === 'routes' ? routesValue : pricingValue;
      await apiRequest(`/vendors/${selectedVendor.id}/${kind}`, {
        method: 'PATCH',
        body: raw.trim() ? JSON.parse(raw) : {},
      });
      if (kind === 'routes') setRoutesOpen(false);
      else setPricingOpen(false);
      await fetchVendors();
    } catch (err) {
      if (isUnsupported(err)) rememberUnsupported(kind);
      setActionError(apiMessage(err, capabilityMessages[kind]));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openJsonConfig = (vendor: Vendor, kind: 'routes' | 'pricing') => {
    setSelectedVendor(vendor);
    setActionError('');
    const value = JSON.stringify(vendor[kind] ?? {}, null, 2);
    if (kind === 'routes') {
      setRoutesValue(value);
      setRoutesOpen(true);
    } else {
      setPricingValue(value);
      setPricingOpen(true);
    }
  };

  const openStatus = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setActionError('');
    setStatusOpen(true);
  };

  const nextStatus = selectedVendor && String(selectedVendor.status || '').toUpperCase() === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const submitStatus = async () => {
    if (!selectedVendor?.id) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/vendors/${selectedVendor.id}/status`, { method: 'PATCH', body: { status: nextStatus } });
      setStatusOpen(false);
      await fetchVendors();
    } catch (err) {
      if (isUnsupported(err)) rememberUnsupported('status');
      setActionError(apiMessage(err, capabilityMessages.status));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (vendor: Vendor) =>
    setConfirmDialog({
      title: 'Xóa NCC',
      message: `Xóa ${vendorName(vendor)}? Chỉ DIRECTOR được thực hiện thao tác này.`,
      confirmLabel: 'Xóa',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/vendors/${vendor.id}`, { method: 'DELETE' });
          await fetchVendors();
        } catch (err) {
          if (isUnsupported(err)) rememberUnsupported('delete');
          setError(apiMessage(err, capabilityMessages.delete));
        }
      },
    });

  const filterPanelGroups = [
    {
      id: 'status',
      title: 'Trạng thái NCC',
      icon: Tag,
      options: statusOptions,
      value: filters.status,
      onChange: (value: string[]) => updateFilter('status', value),
    },
    {
      id: 'service_type',
      title: 'Loại dịch vụ',
      icon: ServerOff,
      options: serviceTypeOptions,
      value: filters.service_type,
      onChange: (value: string[]) => updateFilter('service_type', value),
    },
    {
      id: 'province',
      title: 'Khu vực phục vụ',
      icon: MapPinned,
      options: provinceOptions,
      value: filters.province,
      onChange: (value: string[]) => updateFilter('province', value),
    },
    {
      id: 'contract_type',
      title: 'Loại hợp đồng',
      icon: Building2,
      options: contractTypeOptions,
      value: filters.contract_type,
      onChange: (value: string[]) => updateFilter('contract_type', value),
    },
  ];

  function renderVendorCell(columnId: VendorTableColumnId, vendor: Vendor) {
    switch (columnId) {
      case 'code':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border">
            <div className="font-extrabold text-[13px] text-foreground">{vendor.code || '—'}</div>
          </td>
        );
      case 'name':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border">
            <div className="font-bold text-[13px] text-foreground">{vendor.name || '—'}</div>
            {vendor.email && <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{vendor.email}</div>}
          </td>
        );
      case 'service_type':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border">
            <ServiceTypeBadge value={vendor.service_type} />
          </td>
        );
      case 'contact_name':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-medium">
            {vendor.contact_name || '—'}
          </td>
        );
      case 'phone':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-bold">
            {vendor.phone || '—'}
          </td>
        );
      case 'province':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-medium">
            {formatProvince(vendor.province)}
          </td>
        );
      case 'contract_type':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border">
            <ContractTypeBadge value={vendor.contract_type} />
          </td>
        );
      case 'payable_balance':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border text-[13px] font-extrabold text-amber-700">
            {formatMoney(vendor.payable_balance)}
          </td>
        );
      case 'status':
        return (
          <td key={columnId} className="px-4 py-3 border-r border-border">
            <StatusBadge status={vendor.status} />
          </td>
        );
      case 'actions':
        return (
          <td key={columnId} className="w-[220px] min-w-[220px] px-4 py-3">
            <VendorActions
              vendor={vendor}
              canManage={canManage}
              canDelete={canDelete}
              unsupported={unsupportedCapabilities}
              onDetail={openDetail}
              onEdit={openEdit}
              onRoutes={item => openJsonConfig(item, 'routes')}
              onPricing={item => openJsonConfig(item, 'pricing')}
              onStatus={openStatus}
              onDelete={confirmDelete}
            />
          </td>
        );
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {actionError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-[13px] font-medium flex items-center gap-2 shrink-0">
          <AlertTriangle size={16} />
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border bg-card p-3 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted flex items-center justify-center md:w-auto md:px-3"
            >
              <ArrowLeft size={15} />
              <span className="hidden md:inline ml-2 text-[13px] font-medium">Quay lại</span>
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-[460px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.keyword}
                onChange={event => updateFilter('keyword', event.target.value)}
                placeholder="Tìm mã, tên, SĐT, email NCC..."
                className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <button
              title="Mở bộ lọc"
              onClick={() => setIsFilterPanelOpen(true)}
              className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"
            >
              <Filter size={16} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <div className="order-last basis-full md:order-none md:basis-auto">
                <button
                  onClick={clearFilters}
                  className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10"
                >
                  × Xóa {activeFilterCount} bộ lọc
                </button>
              </div>
            )}
            <div className="hidden flex-1 md:block" />
            <ColumnSettings
              columns={vendorTableHeaders}
              columnOrder={columnOrder}
              visibleColumns={visibleColumns}
              onToggle={toggleColumn}
              onReorder={reorderColumn}
            />
            {canManage && !isCapabilityUnsupported('create') && (
              <button
                onClick={openCreate}
                className="h-10 w-12 shrink-0 rounded-lg bg-primary text-white text-[14px] font-bold shadow-sm shadow-primary/20 flex items-center justify-center gap-2 md:w-auto md:px-4"
              >
                <Plus size={18} />
                <span className="hidden md:inline">Thêm NCC</span>
              </button>
            )}
          </div>

          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterSelect
              multiple
              icon={Tag}
              placeholder="Trạng thái"
              value={filters.status}
              options={statusOptions}
              onValueChange={value => updateFilter('status', value)}
              className="w-[160px]"
            />
            <FilterSelect
              multiple
              icon={ServerOff}
              placeholder="Loại dịch vụ"
              value={filters.service_type}
              options={serviceTypeOptions}
              onValueChange={value => updateFilter('service_type', value)}
              className="w-[160px]"
            />
            <FilterSelect
              multiple
              icon={MapPinned}
              placeholder="Khu vực"
              value={filters.province}
              options={provinceOptions}
              onValueChange={value => updateFilter('province', value)}
              className="w-[150px]"
            />
            <FilterSelect
              multiple
              icon={Building2}
              placeholder="Loại HĐ"
              value={filters.contract_type}
              options={contractTypeOptions}
              onValueChange={value => updateFilter('contract_type', value)}
              className="w-[150px]"
            />
          </div>
        </div>

        {isLoading ? (
          <StateBlock
            icon={<Loader2 className="animate-spin" size={24} />}
            title="Đang tải danh sách NCC"
            description="Đang cập nhật danh sách nhà cung cấp mới nhất."
          />
        ) : error ? (
          <StateBlock icon={<AlertTriangle size={24} />} title="Không tải được NCC" description={error} />
        ) : vendors.length === 0 ? (
          <StateBlock
            icon={<ServerOff size={24} />}
            title="Chưa có NCC"
            description="Không có nhà cung cấp vận tải phù hợp bộ lọc hiện tại. Thử đổi bộ lọc hoặc thêm NCC mới."
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <table className="hidden md:table w-full min-w-[1280px] text-left border-collapse">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                <tr>
                  {orderedVisibleHeaders.map(header => (
                    <th
                      key={header.id}
                      className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}
                    >
                      {header.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map(vendor => (
                  <tr
                    key={normalizeId(vendor.id)}
                    onClick={() => void openDetail(vendor)}
                    className="cursor-pointer border-b border-border hover:bg-muted/10 transition-colors"
                  >
                    {orderedVisibleHeaders.map(header => renderVendorCell(header.id, vendor))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid gap-3 p-3 md:hidden">
              {vendors.map(vendor => (
                <VendorMobileCard
                  key={normalizeId(vendor.id)}
                  vendor={vendor}
                  canManage={canManage}
                  canDelete={canDelete}
                  unsupported={unsupportedCapabilities}
                  onDetail={openDetail}
                  onEdit={openEdit}
                  onRoutes={item => openJsonConfig(item, 'routes')}
                  onPricing={item => openJsonConfig(item, 'pricing')}
                  onStatus={openStatus}
                  onDelete={confirmDelete}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-2 text-[12px] text-muted-foreground">
          <span>Hiển thị <b className="font-bold text-foreground">{vendors.length}</b>/Tổng:{total} NCC trong một danh sách.</span>
        </div>
      </div>

      <AddEditVendorDialog
        isOpen={isFormOpen}
        isClosing={isFormClosing}
        isEditMode={isEditMode}
        isSubmitting={isSubmitting}
        fields={[...vendorFormFields]}
        formState={formState}
        error={actionError}
        onClose={closeForm}
        onSubmit={submitForm}
        onChange={(key, value) => setFormState(prev => ({ ...prev, [key]: value }))}
      />
      <VendorDetailDialog
        vendor={detailVendor}
        loading={detailLoading}
        canManage={canManage}
        onClose={() => setDetailVendor(null)}
        onEdit={(vendor) => { setDetailVendor(null); openEdit(vendor); }}
      />
      <VendorRoutesDialog isOpen={routesOpen} value={routesValue} isSubmitting={isSubmitting} error={actionError} onClose={() => setRoutesOpen(false)} onChange={setRoutesValue} onSubmit={() => submitJsonConfig('routes')} />
      <VendorPricingDialog isOpen={pricingOpen} value={pricingValue} isSubmitting={isSubmitting} error={actionError} onClose={() => setPricingOpen(false)} onChange={setPricingValue} onSubmit={() => submitJsonConfig('pricing')} />
      <VendorStatusConfirmDialog isOpen={statusOpen} vendorName={selectedVendor ? vendorName(selectedVendor) : '—'} nextStatus={nextStatus || 'ACTIVE'} isSubmitting={isSubmitting} error={actionError} onClose={() => setStatusOpen(false)} onConfirm={submitStatus} />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <FilterPanel open={isFilterPanelOpen} activeCount={activeFilterCount} groups={filterPanelGroups} onClose={() => setIsFilterPanelOpen(false)} onApply={() => setIsFilterPanelOpen(false)} onClear={clearFilters} />
    </div>
  );
}

function toFormState(vendor: Vendor): VendorFormState {
  return {
    code: vendor.code || '',
    name: vendor.name || '',
    service_type: vendor.service_type || '',
    contact_name: vendor.contact_name || '',
    phone: vendor.phone || '',
    email: vendor.email || '',
    opening_debt: formatAmountInputFromNumber(vendor.opening_debt),
    bank_name: vendor.bank_name || '',
    bank_account: vendor.bank_account || '',
    bank_account_holder: vendor.bank_account_holder || '',
    qr_image_url: vendor.qr_image_url || '',
    province: vendor.province || '',
    contract_type: vendor.contract_type || '',
    status: vendor.status || 'ACTIVE',
  };
}

function toVendorPayload(form: VendorFormState, isEdit: boolean) {
  const payload: Record<string, string | number | null> = {};
  Object.entries(form).forEach(([key, value]) => {
    if (key === 'opening_debt') {
      payload.opening_debt = parseAmountInput(value);
      return;
    }
    if (value !== '') payload[key] = value;
    else if (isEdit && ['bank_name', 'bank_account', 'bank_account_holder', 'qr_image_url'].includes(key)) payload[key] = null;
  });
  return payload;
}

function StatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status || '').toUpperCase();
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold border',
        normalized === 'ACTIVE'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-slate-100 text-slate-600 border-slate-200',
      )}
    >
      {formatStatus(status)}
    </span>
  );
}

function ServiceTypeBadge({ value }: { value?: string | null }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-primary">
      {formatServiceType(value)}
    </span>
  );
}

function ContractTypeBadge({ value }: { value?: string | null }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
      {formatContractType(value)}
    </span>
  );
}

type VendorActionProps = {
  vendor: Vendor;
  canManage: boolean;
  canDelete: boolean;
  unsupported: Capability[];
  onDetail: (vendor: Vendor) => void;
  onEdit: (vendor: Vendor) => void;
  onRoutes: (vendor: Vendor) => void;
  onPricing: (vendor: Vendor) => void;
  onStatus: (vendor: Vendor) => void;
  onDelete: (vendor: Vendor) => void;
};

function VendorActions({ vendor, canManage, canDelete, unsupported, onDetail, onEdit, onRoutes, onPricing, onStatus, onDelete }: VendorActionProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton title="Xem" icon={<Eye size={15} />} onClick={() => onDetail(vendor)} />
      {canManage && !unsupported.includes('update') && (
        <IconButton title="Sửa" icon={<Edit size={15} />} onClick={() => onEdit(vendor)} />
      )}
      {canManage && !unsupported.includes('routes') && (
        <IconButton title="Tuyến" icon={<MapPinned size={15} />} onClick={() => onRoutes(vendor)} />
      )}
      {canManage && !unsupported.includes('pricing') && (
        <IconButton title="Giá" icon={<BadgeDollarSign size={15} />} onClick={() => onPricing(vendor)} />
      )}
      {canManage && !unsupported.includes('status') && (
        <IconButton title="Bật/tắt" icon={<Power size={15} />} onClick={() => onStatus(vendor)} warning={vendor.status !== 'INACTIVE'} />
      )}
      {canDelete && !unsupported.includes('delete') && (
        <IconButton title="Xóa" icon={<Trash2 size={15} />} onClick={() => onDelete(vendor)} danger />
      )}
    </div>
  );
}

function VendorMobileCard(props: VendorActionProps) {
  const { vendor } = props;
  return (
    <article
      onClick={() => props.onDetail(vendor)}
      className="cursor-pointer rounded-2xl border border-border bg-white p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-700">
          <Building2 size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-extrabold text-foreground">{vendor.name || '—'}</h3>
              <p className="mt-1 text-[12px] font-bold text-primary">{vendor.code || '—'}</p>
            </div>
            <StatusBadge status={vendor.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ServiceTypeBadge value={vendor.service_type} />
            <ContractTypeBadge value={vendor.contract_type} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <InfoChip label="Liên hệ" value={vendor.contact_name || '—'} />
        <InfoChip label="SĐT" value={vendor.phone || '—'} />
        <InfoChip label="Khu vực" value={formatProvince(vendor.province)} />
        <InfoChip label="Công nợ" value={formatMoney(vendor.payable_balance)} highlight />
      </div>
      <div className="mt-3 border-t border-border pt-3" onClick={event => event.stopPropagation()}>
        <VendorActions {...props} />
      </div>
    </article>
  );
}

function InfoChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/20 p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={clsx('mt-0.5 text-[12px] font-bold', highlight ? 'text-amber-700' : 'text-foreground')}>{value}</div>
    </div>
  );
}

function IconButton({
  icon,
  title,
  danger,
  warning,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  danger?: boolean;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={clsx(
        'p-2 rounded-lg border transition-colors',
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : warning
            ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}

function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center text-muted-foreground">
      <div className="mb-3 text-primary">{icon}</div>
      <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-[13px] max-w-md">{description}</p>
    </div>
  );
}

function moveColumn(columnIds: VendorTableColumnId[], sourceId: VendorTableColumnId, targetId: VendorTableColumnId) {
  if (sourceId === targetId) return columnIds;
  const next = [...columnIds];
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return columnIds;
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceId);
  return next;
}

function ColumnSettings({
  columns,
  columnOrder,
  visibleColumns,
  onToggle,
  onReorder,
}: {
  columns: typeof vendorTableHeaders;
  columnOrder: VendorTableColumnId[];
  visibleColumns: VendorTableColumnId[];
  onToggle: (columnId: VendorTableColumnId) => void;
  onReorder: (sourceId: VendorTableColumnId, targetId: VendorTableColumnId) => void;
}) {
  const [draggingColumnId, setDraggingColumnId] = useState<VendorTableColumnId | null>(null);
  const orderedColumns = columnOrder
    .map(columnId => columns.find(column => column.id === columnId))
    .filter((column): column is (typeof columns)[number] => Boolean(column));

  return (
    <details className="relative hidden md:block">
      <summary
        title="Cài đặt cột"
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"
      >
        <LayoutGrid size={16} />
      </summary>
      <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-border bg-white p-2 shadow-lg">
        <div className="px-2 pb-2 text-[12px] font-extrabold text-foreground">Cài đặt cột</div>
        <div className="space-y-1">
          {orderedColumns.map(column => (
            <div
              key={column.id}
              draggable
              onDragStart={event => {
                setDraggingColumnId(column.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', column.id);
              }}
              onDragOver={event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={event => {
                event.preventDefault();
                const sourceId = (event.dataTransfer.getData('text/plain') || draggingColumnId) as VendorTableColumnId | null;
                if (sourceId) onReorder(sourceId, column.id);
                setDraggingColumnId(null);
              }}
              onDragEnd={() => setDraggingColumnId(null)}
              className={clsx(
                'flex cursor-grab items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium active:cursor-grabbing',
                draggingColumnId === column.id
                  ? 'bg-blue-50 text-primary opacity-70'
                  : column.locked
                    ? 'text-muted-foreground'
                    : 'text-foreground hover:bg-muted/60',
              )}
            >
              <GripVertical size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.id)}
                disabled={column.locked}
                onChange={() => onToggle(column.id)}
                className="h-4 w-4 rounded border-border disabled:opacity-50"
              />
              <span>{column.label}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function closeWithAnimation(setClosing: (value: boolean) => void, setOpen: (value: boolean) => void) {
  setClosing(true);
  window.setTimeout(() => {
    setOpen(false);
    setClosing(false);
  }, 280);
}
