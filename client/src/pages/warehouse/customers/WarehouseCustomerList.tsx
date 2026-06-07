import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Edit,
  Eye,
  Loader2,
  PackagePlus,
  PauseCircle,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../lib/api';
import { ConfirmDialog, type ConfirmDialogState } from '../../../components/ui/ConfirmDialog';
import CustomerDetailDialog from './dialogs/CustomerDetailDialog';
import CustomerFormDialog from './dialogs/CustomerFormDialog';
import { emptyCustomerForm } from './customerFormTypes';
import type { CustomerRecord } from './customerFormTypes';
import type { CustomerFormState } from './customerFormTypes';
import { customerToForm, formToPayload, validateCustomerForm } from './customerFormUtils';
import type { CustomerListItem, CustomerListResponse } from './types';

interface Props {
  keyword?: string;
  embedded?: boolean;
  manageable?: boolean;
}

const normalizeList = (payload: CustomerListResponse | CustomerListItem[]) =>
  Array.isArray(payload) ? payload : payload.items || [];

export default function WarehouseCustomerList({
  keyword = '',
  embedded = false,
  manageable: manageableProp,
}: Props) {
  const manageable = manageableProp ?? !embedded;
  const navigate = useNavigate();
  const [localKeyword, setLocalKeyword] = useState('');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const search = keyword || localKeyword;

  const refreshList = useCallback(() => setReloadTick((n) => n + 1), []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: '1', limit: '100' });
    if (search.trim()) params.set('keyword', search.trim());

    try {
      const response = await apiRequest<CustomerListResponse>(`/customers?${params.toString()}`);
      const items = normalizeList(response);
      setCustomers(items);
      setTotal(Array.isArray(response) ? items.length : response.meta?.total ?? items.length);
    } catch (err: unknown) {
      let message = err instanceof ApiError ? err.message : 'Không thể tải danh sách khách hàng.';
      if (err instanceof ApiError && err.status === 401) {
        message = 'Phiên đăng nhập hết hạn. Vui lòng đăng xuất và đăng nhập lại.';
      } else if (err instanceof ApiError && (err.status === 500 || err.status === 404)) {
        message = `${message} Kiểm tra đã chạy SQL bảng customers trên Supabase.`;
      }
      setError(message);
      setCustomers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers, reloadTick]);

  const setFormField = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreate = () => {
    setFormMode('create');
    setEditingId(null);
    setForm(emptyCustomerForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = async (customer: CustomerListItem) => {
    setFormMode('edit');
    setEditingId(customer.id);
    setForm(customerToForm(customer));
    setFormError('');
    setFormOpen(true);
    setDetailCustomer(null);

    try {
      const full = await apiRequest<CustomerRecord>(`/customers/${customer.id}`);
      setForm(customerToForm(full));
    } catch {
      /* giữ dữ liệu từ danh sách */
    }
  };

  const openView = async (customer: CustomerListItem) => {
    setDetailCustomer(customer);
    setDetailLoading(true);
    try {
      const full = await apiRequest<CustomerRecord>(`/customers/${customer.id}`);
      setDetailCustomer({ ...customer, ...full });
    } catch {
      setDetailCustomer(customer);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitForm = async () => {
    const validation = validateCustomerForm(form, formMode === 'edit');
    if (validation) {
      setFormError(validation);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      const body = formToPayload(form, formMode === 'edit');
      if (formMode === 'create') {
        await apiRequest('/customers', { method: 'POST', body });
      } else if (editingId) {
        await apiRequest(`/customers/${editingId}`, { method: 'PATCH', body });
      }
      setFormOpen(false);
      refreshList();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Không lưu được khách hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (customer: CustomerListItem) => {
    setConfirmDialog({
      title: 'Xóa khách hàng',
      message: `Xóa khách hàng "${customer.name}" (${customer.code})? Hành động không hoàn tác.`,
      confirmLabel: 'Xóa',
      danger: true,
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await apiRequest(`/customers/${customer.id}`, { method: 'DELETE' });
          refreshList();
        } catch (err: unknown) {
          setError(err instanceof ApiError ? err.message : 'Không xóa được khách hàng.');
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  return (
    <div className={clsx('flex min-h-0 flex-col', embedded ? 'h-[calc(100vh-220px)]' : 'h-full')}>
      {!embedded && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Danh sách khách hàng</h2>
            <p className="text-[13px] text-muted-foreground">Quản lý mã KH, kho nhận HCM và thông tin liên hệ</p>
          </div>
          {manageable && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white shadow-sm hover:bg-primary/90"
            >
              <Plus size={16} />
              Thêm khách hàng mới
            </button>
          )}
        </div>
      )}

      {manageable && embedded && (
        <div className="mb-2 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-bold text-white hover:bg-primary/90"
          >
            <Plus size={14} />
            Thêm mới
          </button>
        </div>
      )}

      {!embedded && (
        <div className="relative mb-3 shrink-0 max-w-md">
          <input
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            placeholder="Tìm mã KH, tên, SĐT, khu vực..."
            className="h-10 w-full rounded-lg border border-border bg-muted/10 px-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="shrink-0 border-b border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground">
          Tổng: {total} khách hàng
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          {loading ? (
            <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải..." />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={24} />} title={error} />
          ) : customers.length === 0 ? (
            <StateBlock
              icon={<Building2 size={24} />}
              title="Chưa có khách hàng"
              description={manageable ? 'Bấm "Thêm khách hàng mới" để tạo bản ghi đầu tiên.' : undefined}
            />
          ) : (
            <table className="w-full min-w-[1360px] border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                <tr>
                  {['Mã KH', 'Tên KH', 'Tên tắt', 'Tỉnh đến', 'Địa chỉ nhận', 'ĐC kho HCM', 'ĐT nhận', 'CK %', 'Giao nhận', 'TT', 'Số đơn', 'Thao tác'].map((h) => (
                    <th key={h} className="border-b border-border px-3 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((customer) => (
                  <tr key={customer.id} className={clsx('hover:bg-blue-50/40', customer.is_suspended && 'opacity-60')}>
                    <td className="px-3 py-3 font-extrabold text-primary">{customer.code}</td>
                    <td className="px-3 py-3 font-medium">{customer.name}</td>
                    <td className="max-w-[140px] truncate px-3 py-3" title={customer.short_name || ''}>
                      {customer.short_name || '—'}
                    </td>
                    <td className="px-3 py-3">{customer.destination_province || '—'}</td>
                    <td className="max-w-[200px] truncate px-3 py-3" title={customer.address || ''}>
                      {customer.address || '—'}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3" title={customer.address_hcm || ''}>
                      {customer.address_hcm || '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1">
                        <Phone size={13} className="text-muted-foreground" />
                        {customer.phone_hcm || customer.mobile || customer.phone_landline || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">{Number(customer.discount_percent) || 0}</td>
                    <td className="px-3 py-3">{customer.delivery_handler || '—'}</td>
                    <td className="px-3 py-3">
                      {customer.is_suspended || customer.status === 'SUSPENDED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <PauseCircle size={12} />
                          Tạm dừng
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-600">Hoạt động</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-bold">{customer.waybill_count}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {manageable && (
                          <>
                            <RowIconButton title="Xem" onClick={() => void openView(customer)} icon={<Eye size={15} />} />
                            <RowIconButton title="Sửa" onClick={() => void openEdit(customer)} icon={<Edit size={15} />} />
                            <RowIconButton
                              title="Xóa"
                              danger
                              onClick={() => confirmDelete(customer)}
                              icon={<Trash2 size={15} />}
                            />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            navigate('/orders/new', {
                              state: { maKh: customer.code, nguoiGui: customer.name },
                            })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold text-primary hover:bg-primary/5"
                        >
                          <PackagePlus size={13} />
                          Đơn
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CustomerFormDialog
        isOpen={formOpen}
        isEdit={formMode === 'edit'}
        isSubmitting={isSubmitting}
        error={formError}
        form={form}
        onClose={() => setFormOpen(false)}
        onSubmit={() => void submitForm()}
        onChange={setFormField}
      />

      <CustomerDetailDialog
        customer={detailCustomer}
        loading={detailLoading}
        onClose={() => setDetailCustomer(null)}
        onEdit={() => {
          if (detailCustomer) void openEdit(detailCustomer);
        }}
      />

      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function RowIconButton({
  title,
  icon,
  onClick,
  danger,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white transition-colors hover:bg-muted',
        danger && 'text-red-500 hover:border-red-200 hover:bg-red-50',
      )}
    >
      {icon}
    </button>
  );
}

function StateBlock({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>
      <div className="font-extrabold text-foreground">{title}</div>
      {description && <p className="max-w-md text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
