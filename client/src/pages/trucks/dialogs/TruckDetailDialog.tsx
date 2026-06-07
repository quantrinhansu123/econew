import { createPortal } from 'react-dom';
import { Building2, Eye, MapPin, Truck as TruckIcon, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { Truck } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  truck: Truck | null;
  onClose: () => void;
  formatStatus: (status?: string | null) => string;
  getDriverName: (truck: Truck) => string;
  onViewOrders?: (truck: Truck) => void;
}

export default function TruckDetailDialog({ isOpen, isClosing, truck, onClose, formatStatus, getDriverName, onViewOrders }: Props) {
  if ((!isOpen && !isClosing) || !truck) return null;

  const bks = truck.bks || truck.license_plate || '—';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className={clsx('fixed inset-0 bg-black/40 backdrop-blur-md', isClosing ? 'opacity-0' : 'animate-in fade-in')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative h-screen w-full max-w-[620px] bg-[#f8fafc] shadow-2xl flex flex-col border-l border-border',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <div className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Chi tiết xe</p>
            <h2 className="text-lg font-extrabold text-foreground">{bks}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          <Info
            title="Thông tin xe"
            icon={<TruckIcon size={16} />}
            rows={[
              ['BKS', bks],
              ['Biển số hệ thống', truck.license_plate || '—'],
              ['Loại xe', truck.loai_xe || '—'],
              ['Khu vực', truck.khu_vuc || '—'],
              ['Trạng thái', formatStatus(truck.status)],
            ]}
          />
          <Info
            title="Nhà xe & lái xe"
            icon={<Building2 size={16} />}
            rows={[
              ['Nhà xe (NCC)', truck.vendor?.name || truck.nha_xe || '—'],
              ['Tên lái xe', truck.ten_lai_xe || getDriverName(truck)],
              ['Tài xế hệ thống', getDriverName(truck)],
            ]}
          />
          <Info
            title="Vận hành"
            icon={<MapPin size={16} />}
            rows={[
              ['Tải trọng', truck.payload != null ? `${Number(truck.payload).toLocaleString('vi-VN')} kg` : '—'],
              ['Định mức dầu', truck.fuel_consumption_limit != null ? `${truck.fuel_consumption_limit}` : '—'],
            ]}
          />
        </div>
        {onViewOrders && (
          <div className="shrink-0 border-t border-border bg-card p-4">
            <button
              type="button"
              onClick={() => onViewOrders(truck)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 text-[13px] font-bold text-sky-700 hover:bg-sky-100"
            >
              <Eye size={16} />
              Xem đơn phụ trách
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Info({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: Array<[string, string]> }) {
  return (
    <section className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2 text-primary">
        {icon}
        <span className="text-[12px] font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-muted/10 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-[13px] font-extrabold text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
