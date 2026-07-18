import { createPortal } from 'react-dom';
import { CalendarClock, MapPin, Package, Route, Scale, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { BadgeConfig, WaybillInventoryDetail } from '../types';
import { resolveUserNote } from '../inventoryColumns';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
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

export default function WaybillInventoryDetailDialog({ isOpen, isClosing, isLoading, waybill, statusConfig, paymentConfig, priorityConfig, onClose }: Props) {
  if (!isOpen && !isClosing) return null;

  const status = normalizeStatus(waybill);
  const statusBadge = statusConfig[status] || { label: status || '—', className: 'bg-muted text-muted-foreground border-border' };
  const paymentBadge = paymentConfig[String(waybill?.payment_type || '')] || { label: waybill?.payment_type || '—', className: 'bg-muted text-muted-foreground border-border' };
  const priorityBadge = priorityConfig[String(waybill?.priority || 'NORMAL').toUpperCase()] || priorityConfig.NORMAL;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className={clsx('absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity', isClosing ? 'opacity-0' : 'opacity-100')} onClick={onClose} />
      <div className={clsx('relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl transition-all duration-200 sm:rounded-[28px]', isClosing ? 'translate-y-6 opacity-0 sm:scale-95' : 'translate-y-0 opacity-100 sm:scale-100')}>
        <div className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Chi tiết vận đơn tồn kho</p>
            <h2 className="mt-1 text-xl font-black text-foreground">{displayCode(waybill)}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></button>
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
                <Info label="Ngày nhận kho" value={formatDate(waybill.received_at || waybill.created_at)} icon={CalendarClock} />
              </Section>

              <Section title="Kích thước & ghi chú" icon={Scale}>
                <Info label="Dài × Rộng × Cao" value={`${displayValue(waybill.length)} × ${displayValue(waybill.width)} × ${displayValue(waybill.height)}`} />
                <Info label="Khối lượng quy đổi" value={displayValue(waybill.volumetric_weight, ' kg')} />
                <Info label="Ghi chú" value={resolveUserNote(waybill) || '—'} className="sm:col-span-2" />
              </Section>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card p-5">
          <button onClick={onClose} className="w-full rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20">Đóng</button>
        </div>
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
