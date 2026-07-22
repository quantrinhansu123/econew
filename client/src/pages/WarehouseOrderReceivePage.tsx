import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Layers, Loader2, Package, PackageCheck, RotateCcw, Search, ShieldAlert, Warehouse } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';

import { ApiError, apiRequest } from '../lib/api';
import WaybillReceiveConfirmDialog from './warehouse/orders/dialogs/WaybillReceiveConfirmDialog';
import WaybillPackageSplitEditor from './warehouse/inventory/WaybillPackageSplitEditor';
import type { BadgeConfig, HubSummary, ReceiveFormState, ReceiveWaybillPayload, UserSummary, WaybillDetail } from './warehouse/orders/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const RECEIVABLE_ROLES = 1 | 2 | 32 | 64;
const initialFormState: ReceiveFormState = {
  waybillCode: '',
  deliveryPhotoUrl: '',
};

const statusConfig: Record<string, BadgeConfig> = {
  RECEIVED: { label: 'Đã tạo đơn', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_WAREHOUSE: { label: 'Trong kho', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANIFEST_CLOSED: { label: 'Đã đóng bảng kê', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  AT_DEST_HUB: { label: 'Tới hub đích', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUT_FOR_DELIVERY: { label: 'Đang giao', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  DELIVERED: { label: 'Đã giao', className: 'bg-green-50 text-green-700 border-green-200' },
  RETURNED: { label: 'Hoàn/trả hàng', className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-red-50 text-red-700 border-red-200' },
};

const paymentConfig: Record<string, BadgeConfig> = {
  PP: { label: 'PP · Trả trước', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  CC: { label: 'CC · Người nhận trả', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COD: { label: 'COD', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const priorityConfig: Record<string, BadgeConfig> = {
  HIGH: { label: 'Ưu tiên cao', className: 'bg-red-50 text-red-700 border-red-200' },
  NORMAL: { label: 'Tiêu chuẩn', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  LOW: { label: 'Thấp', className: 'bg-muted text-muted-foreground border-border' },
};

const getStoredUser = (): UserSummary | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSummary;
  } catch {
    return null;
  }
};

const normalizeId = (value: unknown) => value === null || value === undefined ? '' : String(value);
const normalizeStatus = (waybill: WaybillDetail | null) => String(waybill?.current_state || waybill?.status || '').toUpperCase();
const formatHub = (hub: HubSummary | null | undefined, fallbackId?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallbackId ? `Hub #${fallbackId}` : '—';
const displayCode = (waybill: WaybillDetail | null) => waybill?.waybill_code || waybill?.code || '';
const displayNumber = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const isManager = (roleMask: number) => (roleMask & (32 | 64)) !== 0;
const canReceiveByRole = (roleMask: number) => (roleMask & RECEIVABLE_ROLES) !== 0;

const getUserHubIds = (user: UserSummary | null) => {
  if (!user) return new Set<string>();
  const ids = [user.hub_id, ...(user.hub_ids || []), ...((user.hubs || []).map(hub => hub.id))].map(normalizeId).filter(Boolean);
  return new Set(ids);
};

function Badge({ config, fallback }: { config?: BadgeConfig; fallback: string }) {
  const resolved = config || { label: fallback || '—', className: 'bg-muted text-muted-foreground border-border' };
  return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider', resolved.className)}>{resolved.label}</span>;
}

export default function WarehouseOrderReceivePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user] = useState<UserSummary | null>(() => getStoredUser());
  const [formState, setFormState] = useState<ReceiveFormState>(initialFormState);
  const [waybill, setWaybill] = useState<WaybillDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isConfirmClosing, setIsConfirmClosing] = useState(false);

  const roleMask = user?.role_mask ?? 0;
  const canSeeRestrictedMoney = isManager(roleMask);
  const hasReceiveRole = canReceiveByRole(roleMask);
  const userHubIds = useMemo(() => getUserHubIds(user), [user]);
  const status = normalizeStatus(waybill);
  const isReceived = status === 'RECEIVED';
  const isFinalized = status === 'RETURNED' || status === 'CANCELLED' || status === 'DELIVERED';
  const isTerminal = isFinalized;
  const hubAllowed = userHubIds.size === 0 || userHubIds.has(normalizeId(waybill?.current_hub_id)) || userHubIds.has(normalizeId(waybill?.origin_hub_id));
  const hasManifestOrTrip = Boolean(waybill?.manifest_id || waybill?.trip_id);
  const splitDisabled = !waybill || isFinalized || hasManifestOrTrip || !hubAllowed;
  const splitDisabledReason = !waybill
    ? undefined
    : isFinalized
      ? 'Vận đơn đã kết thúc, không thể tách hàng.'
      : hasManifestOrTrip
        ? 'Vận đơn đã gắn manifest/chuyến — không thể tách tại đây.'
        : !hubAllowed
          ? 'Vận đơn không thuộc hub được phân quyền.'
          : undefined;
  const alreadyInWarehouse = status === 'IN_WAREHOUSE';
  const receiveDisabled = !waybill || !hasReceiveRole || !isReceived || isTerminal || hasManifestOrTrip || !hubAllowed || alreadyInWarehouse || isSubmitting;

  const warnings = useMemo(() => {
    const items: string[] = [];
    if (!hasReceiveRole) items.push('Tài khoản hiện tại không có quyền WAREHOUSE, PACKER, MANAGER hoặc DIRECTOR để tiếp nhận đơn.');
    if (waybill && !isReceived && !alreadyInWarehouse) {
      items.push(`Vận đơn đang ở trạng thái ${status || 'không xác định'}, chỉ được tiếp nhận khi trạng thái là RECEIVED.`);
    }
    if (waybill && hasManifestOrTrip) items.push('Vận đơn đã gắn manifest hoặc chuyến xe nên không thể tiếp nhận tại kho.');
    if (waybill && isTerminal) items.push('Vận đơn đã hủy/trả hàng/hoàn tất, không được nhập kho lại.');
    if (waybill && !hubAllowed) items.push('Vận đơn không thuộc hub được phân quyền của nhân sự hiện tại.');
    return items;
  }, [alreadyInWarehouse, hasManifestOrTrip, hasReceiveRole, hubAllowed, isReceived, isTerminal, status, waybill]);

  const infoMessages = useMemo(() => {
    if (waybill && alreadyInWarehouse && !isTerminal) {
      return ['Vận đơn đã trong kho (IN_WAREHOUSE). Không cần tiếp nhận lại — có thể phân xe bên dưới.'];
    }
    return [];
  }, [alreadyInWarehouse, isTerminal, waybill]);

  const setFormField = <K extends keyof ReceiveFormState>(key: K, value: ReceiveFormState[K]) => setFormState(prev => ({ ...prev, [key]: value }));

  const loadWaybill = async (waybillId: string) => {
    setError('');
    const response = await apiRequest<WaybillDetail>(`/waybills/${waybillId}`);
    setWaybill(response);
    setFormState(prev => ({
      ...prev,
      waybillCode: displayCode(response),
    }));
  };

  useEffect(() => {
    let ignore = false;
    const bootstrap = async () => {
      setIsLoading(true);
      setError('');
      try {
        if (ignore) return;
        if (id && id !== ':id') await loadWaybill(id);
      } catch (loadError) {
        if (!ignore) setError(loadError instanceof ApiError ? loadError.message : 'Không thể tải dữ liệu tiếp nhận vận đơn.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    bootstrap();
    return () => { ignore = true; };
  }, [id]);

  const searchByCode = async (event?: FormEvent) => {
    event?.preventDefault();
    const code = formState.waybillCode.trim();
    if (!code) {
      setError('Vui lòng nhập hoặc quét mã vận đơn.');
      return;
    }
    setIsSearching(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await apiRequest<WaybillDetail>(`/waybills/code/${encodeURIComponent(code)}`);
      setWaybill(response);
      setFormState(prev => ({
        ...prev,
        waybillCode: displayCode(response) || code,
      }));
    } catch (searchError) {
      setWaybill(null);
      setError(searchError instanceof ApiError ? searchError.message : 'Không tìm thấy vận đơn theo mã đã nhập.');
    } finally {
      setIsSearching(false);
    }
  };

  const validateReceive = () => {
    if (!formState.deliveryPhotoUrl.trim()) return 'Vui lòng upload ảnh tiếp nhận trước khi xác nhận.';
    if (warnings.length > 0) return warnings[0];
    return '';
  };

  const openConfirm = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateReceive();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setIsConfirmOpen(true);
    setIsConfirmClosing(false);
  };

  const closeConfirm = () => {
    setIsConfirmClosing(true);
    window.setTimeout(() => {
      setIsConfirmOpen(false);
      setIsConfirmClosing(false);
    }, 180);
  };

  const submitReceive = async () => {
    if (!waybill) return;
    const payload: ReceiveWaybillPayload = {
      delivery_photo_url: formState.deliveryPhotoUrl.trim(),
    };
    setIsSubmitting(true);
    setError('');
    try {
      const response = await apiRequest<WaybillDetail>(`/waybills/${waybill.id}/receive`, { method: 'PUT', body: payload });
      setWaybill(response || { ...waybill, current_state: 'IN_WAREHOUSE', received_at: new Date().toISOString(), delivery_photo_url: payload.delivery_photo_url });
      setSuccessMessage('Tiếp nhận thành công. Vận đơn đã chuyển sang IN_WAREHOUSE.');
      closeConfirm();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : 'Không thể tiếp nhận vận đơn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForNextScan = () => {
    setWaybill(null);
    setError('');
    setSuccessMessage('');
    setFormState(initialFormState);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[12px] font-bold text-primary">
            <Warehouse size={14} /> Module 1 · Kho & Bưu cục
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Tiếp nhận đơn tại kho</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">Quét mã vận đơn, tách hàng phân xe, upload ảnh và xác nhận chuyển trạng thái RECEIVED → IN_WAREHOUSE.</p>
        </div>
        <button type="button" onClick={() => navigate('/warehouse/inventory')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted">
          <ArrowLeft size={16} /> Về danh sách tồn kho
        </button>
      </div>

      {isLoading ? (
        <StateCard icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải dữ liệu" description="Đang lấy hub active và thông tin vận đơn nếu có mã trên URL." />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-5">
            <form onSubmit={searchByCode} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <Search size={16} className="text-primary" />
                <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Quét / nhập mã vận đơn</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                  <input value={formState.waybillCode} onChange={(event) => setFormField('waybillCode', event.target.value)} className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-[14px] font-bold uppercase outline-none transition-all placeholder:font-medium placeholder:normal-case placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Nhập hoặc scan mã vận đơn" />
                </div>
                <button type="submit" disabled={isSearching} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSearching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />} Kiểm tra
                </button>
              </div>
            </form>

            <form onSubmit={openConfirm} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={16} className="text-primary" />
                  <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Form tiếp nhận</span>
                </div>
                <Badge config={statusConfig[status]} fallback={status || 'Chưa có vận đơn'} />
              </div>
              <div className="grid grid-cols-1 gap-4">
                <Field label="Mã vận đơn">
                  <input value={formState.waybillCode} onChange={(event) => setFormField('waybillCode', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-4 text-[13px] font-bold uppercase outline-none transition-all placeholder:font-medium placeholder:normal-case placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="WB000001" />
                </Field>
                <Field label="URL ảnh upload">
                  <input value={formState.deliveryPhotoUrl} onChange={(event) => setFormField('deliveryPhotoUrl', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-4 text-[13px] font-medium outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="https://.../receive-photo.jpg" />
                </Field>
              </div>

              {infoMessages.length > 0 && (
                <div className="mt-4 space-y-2">
                  {infoMessages.map(item => (
                    <div key={item} className="flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />{item}
                    </div>
                  ))}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {warnings.map(item => <Alert key={item} message={item} />)}
                </div>
              )}
              {error && <div className="mt-4"><Alert message={error} tone="red" /></div>}
              {successMessage && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 size={16} />{successMessage}</div>}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={resetForNextScan} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted"><RotateCcw size={16} /> Quét đơn khác</button>
                <button type="submit" disabled={receiveDisabled} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"><PackageCheck size={16} /> Xác nhận tiếp nhận</button>
              </div>
            </form>

            {waybill && (
              <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
                  <Layers size={16} className="text-violet-700" />
                  <span className="text-[12px] font-bold uppercase tracking-wider text-violet-700">Tách hàng · phân xe ngay</span>
                </div>
                <WaybillPackageSplitEditor
                  waybill={waybill}
                  disabled={splitDisabled}
                  disabledReason={splitDisabledReason}
                />
              </section>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3">
              <PackageCheck size={16} className="text-primary" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Thông tin vận đơn</span>
            </div>
            {!waybill ? (
              <StateCard compact icon={<ShieldAlert size={22} />} title="Chưa có vận đơn" description="Nhập hoặc quét mã vận đơn để kiểm tra thông tin trước khi tiếp nhận." />
            ) : (
              <div className="space-y-4 p-5">
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/10 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Mã vận đơn</p>
                    <p className="mt-1 text-2xl font-black text-foreground">{displayCode(waybill)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge config={statusConfig[status]} fallback={status} />
                    <Badge config={priorityConfig[String(waybill.priority || 'NORMAL').toUpperCase()]} fallback={waybill.priority || 'Tiêu chuẩn'} />
                    <Badge config={paymentConfig[String(waybill.payment_type || '').toUpperCase()]} fallback={waybill.payment_type || '—'} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Info label="Người gửi" value={waybill.sender_info || '—'} />
                  <Info label="Người nhận" value={waybill.receiver_info || '—'} />
                  <Info label="Địa chỉ nhận" value={waybill.receiver_address || '—'} className="sm:col-span-2" />
                  <Info label="Hub đi" value={formatHub(waybill.origin_hub, waybill.origin_hub_id)} />
                  <Info label="Hub đến" value={formatHub(waybill.dest_hub, waybill.dest_hub_id)} />
                  <Info label="COD" value={canSeeRestrictedMoney ? displayNumber(waybill.cod_amount, ' đ') : 'Ẩn theo phân quyền'} />
                  <Info label="Cước" value={canSeeRestrictedMoney ? displayNumber(waybill.cost_amount ?? waybill.freight_amount ?? waybill.cc_amount, ' đ') : 'Ẩn theo phân quyền'} />
                  <Info label="Số kiện khai báo" value={displayNumber(waybill.package_count || waybill.declared_package_count)} />
                  <Info label="Cân nặng khai báo" value={displayNumber(waybill.weight, ' kg')} />
                  <Info label="Ghi chú" value={waybill.note || waybill.notes || '—'} className="sm:col-span-2" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <WaybillReceiveConfirmDialog isOpen={isConfirmOpen} isClosing={isConfirmClosing} isSubmitting={isSubmitting} waybill={waybill} formState={formState} onClose={closeConfirm} onConfirm={submitReceive} />
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><label className="mb-2 block text-[13px] font-bold text-foreground">{label}</label>{children}</div>;
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border border-border bg-card p-4', className)}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[13px] font-bold leading-6 text-foreground">{value}</p>
    </div>
  );
}

function Alert({ message, tone = 'amber' }: { message: string; tone?: 'amber' | 'red' }) {
  return <div className={clsx('flex gap-2 rounded-2xl border px-4 py-3 text-[13px] font-bold', tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800')}><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</div>;
}

function StateCard({ icon, title, description, compact = false }: { icon: React.ReactNode; title: string; description: string; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white text-center', compact ? 'm-5 min-h-[320px] p-6' : 'min-h-[360px] p-8')}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="text-base font-black text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}


