import { createPortal } from 'react-dom';
import { PackageSearch, X } from 'lucide-react';
import type { WaybillDetail } from '../types';

interface Props {
  item: WaybillDetail | null;
  isLoading: boolean;
  error: string;
  onClose: () => void;
}

const formatValue = (value?: string | number | null) => value == null || value === '' ? '—' : String(value);

const fields: Array<{ key: keyof WaybillDetail; label: string }> = [
  { key: 'waybill_code', label: 'Mã bill / vận đơn' },
  { key: 'ma_kh', label: 'Mã khách hàng' },
  { key: 'noi_dung', label: 'Nội dung hàng' },
  { key: 'sender_info', label: 'Người gửi' },
  { key: 'receiver_name', label: 'Người nhận' },
  { key: 'receiver_phone', label: 'SĐT người nhận' },
  { key: 'receiver_address', label: 'Địa chỉ nhận' },
  { key: 'noi_den', label: 'Tỉnh/Thành nhận' },
  { key: 'weight', label: 'Khối lượng' },
  { key: 'length', label: 'Dài' },
  { key: 'width', label: 'Rộng' },
  { key: 'height', label: 'Cao' },
  { key: 'volumetric_weight', label: 'Khối lượng quy đổi' },
  { key: 'payment_type', label: 'Thanh toán' },
  { key: 'cost_amount', label: 'Cước phí' },
  { key: 'origin_hub_id', label: 'HUB gửi' },
  { key: 'dest_hub_id', label: 'HUB đến' },
];

export default function SearchWaybillDetailDialog({ item, isLoading, error, onClose }: Props) {
  if (!item && !isLoading && !error) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative flex h-screen w-full max-w-[680px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl dialog-slide-in">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Chi tiết vận đơn</p>
            <h2 className="truncate text-lg font-black text-foreground">{item?.waybill_code || 'Đang tải...'}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {isLoading && <div className="flex min-h-[320px] items-center justify-center text-[14px] font-semibold text-muted-foreground">Đang tải chi tiết...</div>}
          {error && <div className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">{error}</div>}
          {item && !isLoading && !error && (
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3">
                <PackageSearch size={16} className="text-primary" />
                <span className="text-[12px] font-bold uppercase tracking-wider text-primary">Thông tin vận đơn</span>
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                {fields.map(field => (
                  <div key={field.key} className="rounded-xl border border-border bg-muted/5 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{field.label}</p>
                    <p className="mt-1 break-words text-[13px] font-bold text-foreground">{formatValue(item[field.key])}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-start border-t border-border bg-card p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted">Đóng</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
