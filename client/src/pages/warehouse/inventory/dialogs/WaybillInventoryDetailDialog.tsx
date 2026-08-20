import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Eye, History, Images, Loader2, MapPin, Package, PackageCheck, Pencil, Printer, Route, Scale, User, UserPlus, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { BadgeConfig, UserSummary, WaybillInventoryDetail } from '../types';
import { resolveUserNote, resolveWarehouseIntakePresentation } from '../inventoryColumns';
import { MAX_WAYBILL_IMAGES, parseWaybillImages } from '../../../../lib/waybillImages';
import { ImagePreviewModal } from '../../../../components/ImagePreviewModal';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  formatWaybillHistoryValue,
  type WaybillHistoryEntry,
  waybillHistoryActionLabel,
  waybillHistoryFieldLabel,
} from '../waybillHistory';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
  canViewPricing: boolean;
  waybill: WaybillInventoryDetail | null;
  statusConfig: Record<string, BadgeConfig>;
  paymentConfig: Record<string, BadgeConfig>;
  priorityConfig: Record<string, BadgeConfig>;
  onClose: () => void;
}

const normalizeStatus = (waybill: WaybillInventoryDetail | null) => String(waybill?.current_state || waybill?.status || '').toUpperCase();
const displayCode = (waybill: WaybillInventoryDetail | null) => waybill?.waybill_code || waybill?.code || `#${waybill?.id || ''}`;
const displayValue = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';
const formatHub = (hub: WaybillInventoryDetail['current_hub'], fallback?: string | number | null) => hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—';
const formatUser = (user?: UserSummary | null, fallback?: string | null) => {
  const name = user?.full_name?.trim() || user?.name?.trim() || fallback?.trim() || user?.username?.trim();
  const username = user?.username?.trim();
  if (!name) return 'Chưa ghi nhận';
  return username && username !== name ? `${name} (@${username})` : name;
};

export default function WaybillInventoryDetailDialog({ isOpen, isClosing, isLoading, canViewPricing, waybill, statusConfig, paymentConfig, priorityConfig, onClose }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPricingOnPrint, setShowPricingOnPrint] = useState(false);
  const [history, setHistory] = useState<WaybillHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (!isOpen || !waybill?.id) return undefined;

    let mounted = true;
    const loadId = window.setTimeout(() => {
      setHistory([]);
      setHistoryError('');
      setIsHistoryLoading(true);
      apiRequest<WaybillHistoryEntry[]>(`/waybills/${waybill.id}/history`)
        .then((items) => {
          if (mounted) setHistory(Array.isArray(items) ? items : []);
        })
        .catch((error: unknown) => {
          if (!mounted) return;
          setHistoryError(error instanceof ApiError && error.status === 404
            ? 'Backend chưa được cập nhật tính năng lịch sử thao tác.'
            : error instanceof ApiError
              ? error.message
              : 'Chưa tải được lịch sử thao tác.');
        })
        .finally(() => {
          if (mounted) setIsHistoryLoading(false);
        });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(loadId);
    };
  }, [isOpen, waybill?.id]);

  if (!isOpen && !isClosing) return null;

  const status = normalizeStatus(waybill);
  const statusBadge = statusConfig[status] || { label: status || '—', className: 'bg-muted text-muted-foreground border-border' };
  const paymentBadge = paymentConfig[String(waybill?.payment_type || '')] || { label: waybill?.payment_type || '—', className: 'bg-muted text-muted-foreground border-border' };
  const priorityBadge = priorityConfig[String(waybill?.priority || 'NORMAL').toUpperCase()] || priorityConfig.NORMAL;
  const billImages = parseWaybillImages(waybill?.delivery_photo_url);
  const warehouseIntake = waybill ? resolveWarehouseIntakePresentation(waybill) : null;
  const printDisabled = isLoading || !waybill?.id;

  const closeDialog = () => {
    setShowPricingOnPrint(false);
    onClose();
  };

  const openPrint = (params: Record<string, string>) => {
    if (!waybill?.id) return;
    const query = new URLSearchParams(params);
    if (canViewPricing && showPricingOnPrint) query.set('pricing', 'show');
    const search = query.toString();
    window.open(
      `/print/waybill/${encodeURIComponent(String(waybill.id))}${search ? `?${search}` : ''}`,
      '_blank',
      'noopener',
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className={clsx('absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity', isClosing ? 'opacity-0' : 'opacity-100')} onClick={closeDialog} />
      <div className={clsx('relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl transition-all duration-200 sm:rounded-[28px]', isClosing ? 'translate-y-6 opacity-0 sm:scale-95' : 'translate-y-0 opacity-100 sm:scale-100')}>
        <div className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Chi tiết vận đơn tồn kho</p>
            <h2 className="mt-1 text-xl font-black text-foreground">{displayCode(waybill)}</h2>
          </div>
          <button onClick={closeDialog} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center text-primary"><Package className="mr-2 animate-pulse" size={20} /> Đang tải chi tiết...</div>
          ) : !waybill ? (
            <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-[13px] font-bold text-muted-foreground">Không tìm thấy vận đơn.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Badge label={statusBadge.label} className={statusBadge.className} />
                <Badge label={paymentBadge.label} className={paymentBadge.className} />
                <Badge label={priorityBadge.label} className={priorityBadge.className} />
                <Badge label={displayValue(waybill.cod_amount, ' đ')} className="bg-amber-50 text-amber-700 border-amber-200" />
              </div>

              <Section title="Thông tin vận đơn" icon={Package}>
                <Info label="Người gửi" value={waybill.sender_info || '—'} icon={User} />
                <Info label="Người nhận" value={waybill.receiver_info || '—'} icon={User} />
                <Info label="Địa chỉ nhận" value={waybill.receiver_address || '—'} className="sm:col-span-2" />
                <Info label="Số kiện" value={displayValue(waybill.package_count || waybill.declared_package_count)} />
                <Info label="Cân nặng" value={displayValue(waybill.actual_weight || waybill.weight, ' kg')} icon={Scale} />
              </Section>

              <Section title="Kho & tuyến" icon={MapPin}>
                <Info label="Hub hiện tại" value={formatHub(waybill.current_hub || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)} icon={MapPin} />
                <Info label="Hub đến" value={formatHub(waybill.dest_hub, waybill.dest_hub_id)} icon={MapPin} />
                <Info label="Tuyến giao" value={waybill.route_code || waybill.delivery_route || 'Chưa gán'} icon={Route} />
                <Info label="Ngày nhận kho" value={formatDate(waybill.received_at)} icon={CalendarClock} />
              </Section>

              <Section title="Xử lý nhập kho" icon={PackageCheck}>
                <Info label="Trạng thái nhập kho" value={warehouseIntake?.title || '—'} />
                <Info label="Xe / người đưa hàng" value={warehouseIntake?.detail || '—'} />
                <Info label="Ghi chú nhập kho" value={warehouseIntake?.note || '—'} className="sm:col-span-2" />
              </Section>

              <AuditSummary waybill={waybill} entries={history} />

              <Section title="Kích thước & ghi chú" icon={Scale}>
                <Info label="Dài × Rộng × Cao" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} />
                <Info label="Khối lượng quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} />
                <Info label="Ghi chú" value={resolveUserNote(waybill) || '—'} className="sm:col-span-2" />
              </Section>

              <Section title={`Ảnh bill / hàng hóa (${billImages.length}/${MAX_WAYBILL_IMAGES})`} icon={Images}>
                <div className="sm:col-span-2">
                  {billImages.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {billImages.map((url, index) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setPreviewUrl(url)}
                          className="overflow-hidden rounded-xl border border-border bg-slate-50 text-left shadow-sm hover:border-primary"
                        >
                          <img src={url} alt={`Ảnh bill ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                          <span className="block px-2 py-1.5 text-[11px] font-bold text-slate-600">Ảnh {index + 1}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/5 p-4 text-center text-[12px] font-bold text-muted-foreground">
                      Vận đơn chưa có ảnh bill hoặc ảnh hàng hóa.
                    </div>
                  )}
                </div>
              </Section>

              <HistorySection
                entries={history}
                isLoading={isHistoryLoading}
                error={historyError}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card p-4">
          {canViewPricing && (
            <label className="mr-auto inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[12px] font-bold text-foreground">
              <input
                type="checkbox"
                checked={showPricingOnPrint}
                onChange={(event) => setShowPricingOnPrint(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              />
              Hiện cước khi in
            </label>
          )}
          <button
            type="button"
            disabled={printDisabled}
            onClick={() => openPrint({ preview: '1' })}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[12px] font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Eye size={15} />
            Xem bản in
          </button>
          <button
            type="button"
            disabled={printDisabled}
            onClick={() => openPrint({ print: '1' })}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-bold text-white shadow-sm shadow-primary/20 disabled:opacity-50"
          >
            <Printer size={15} />
            In A4
          </button>
          <button
            type="button"
            onClick={closeDialog}
            className="h-10 rounded-xl border border-border bg-white px-4 text-[12px] font-bold text-muted-foreground hover:bg-muted"
          >
            Đóng
          </button>
        </div>
        <ImagePreviewModal
          imageUrl={previewUrl}
          title={`Ảnh bill ${displayCode(waybill)}`}
          onClose={() => setPreviewUrl(null)}
        />
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3"><Icon size={16} className="text-primary" /><span className="text-[12px] font-bold uppercase tracking-wider text-primary">{title}</span></div><div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">{children}</div></div>;
}

function Info({ label, value, icon: Icon, className }: { label: string; value: React.ReactNode; icon?: typeof Package; className?: string }) {
  return <div className={clsx('rounded-xl border border-border bg-muted/5 p-3', className)}><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{Icon && <Icon size={14} />}{label}</div><p className="mt-1 text-[13px] font-bold leading-6 text-foreground">{value}</p></div>;
}

function Badge({ label, className }: { label: React.ReactNode; className: string }) {
  return <span className={clsx('inline-flex min-h-10 items-center justify-center rounded-xl border px-3 py-2 text-center text-[12px] font-black', className)}>{label}</span>;
}

function AuditSummary({ waybill, entries }: { waybill: WaybillInventoryDetail; entries: WaybillHistoryEntry[] }) {
  const createdEntry = entries.find((entry) => entry.action === 'CREATED');
  const codEntry = entries.find((entry) => entry.action === 'COD_RECONCILED');
  const editEntry = entries.find((entry) => !['CREATED', 'COD_RECONCILED', 'COD_RECONCILIATION_REVERSED'].includes(entry.action));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3">
        <User size={16} className="text-primary" />
        <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Tài khoản thao tác</span>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-3">
        <AuditItem
          icon={UserPlus}
          label="Người tạo bill"
          user={formatUser(waybill.creator || createdEntry?.changed_by, createdEntry?.changed_by_name)}
          time={formatDate(createdEntry?.created_at || waybill.created_at)}
        />
        <AuditItem
          icon={CheckCircle2}
          label="Người xác nhận COD"
          user={waybill.cod_reconciled_at ? formatUser(waybill.cod_reconciler || codEntry?.changed_by, codEntry?.changed_by_name) : 'Chưa xác nhận'}
          time={waybill.cod_reconciled_at ? formatDate(codEntry?.created_at || waybill.cod_reconciled_at) : '—'}
        />
        <AuditItem
          icon={Pencil}
          label="Người sửa gần nhất"
          user={formatUser(editEntry?.changed_by || waybill.updater, editEntry?.changed_by_name)}
          time={formatDate(editEntry?.created_at || waybill.updated_at)}
        />
      </div>
    </div>
  );
}

function AuditItem({ icon: Icon, label, user, time }: { icon: typeof User; label: string; user: string; time: string }) {
  return (
    <div className="min-w-0 bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Icon size={14} />{label}</div>
      <p className="mt-1 break-words text-[13px] font-extrabold text-foreground">{user}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{time}</p>
    </div>
  );
}

function HistorySection({ entries, isLoading, error }: { entries: WaybillHistoryEntry[]; isLoading: boolean; error: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3">
        <History size={16} className="text-primary" />
        <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Lịch sử thao tác</span>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] font-bold text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Đang tải lịch sử...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] font-semibold text-amber-800">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/5 px-3 py-5 text-center text-[12px] font-semibold text-muted-foreground">
            Bill chưa có thao tác nào được ghi nhận.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const changes = Object.entries(entry.changes || {});
              return (
                <article key={entry.id} className="rounded-xl border border-border bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-extrabold text-foreground">{waybillHistoryActionLabel(entry.action)}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                        Người thao tác: {formatUser(entry.changed_by, entry.changed_by_name || 'Hệ thống')}
                      </p>
                    </div>
                    <time className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                      {formatDate(entry.created_at)}
                    </time>
                  </div>

                  {entry.action === 'LEGACY_UPDATE' && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-5 text-amber-800">
                      Lần sửa này diễn ra trước khi hệ thống lưu chi tiết, nên chỉ xem được thời gian và người thao tác.
                    </p>
                  )}

                  {changes.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                      {changes.map(([field, change]) => (
                        <div key={field} className="grid gap-1 text-[12px] sm:grid-cols-[145px_minmax(0,1fr)]">
                          <span className="font-bold text-slate-600">{waybillHistoryFieldLabel(field)}</span>
                          <div className="min-w-0 break-words font-semibold text-foreground">
                            <span className="text-red-600 line-through decoration-red-300">{formatWaybillHistoryValue(field, change.old_value)}</span>
                            <span className="mx-2 text-slate-400">→</span>
                            <span className="text-emerald-700">{formatWaybillHistoryValue(field, change.new_value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
