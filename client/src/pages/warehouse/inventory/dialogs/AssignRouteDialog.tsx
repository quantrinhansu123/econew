import { createPortal } from 'react-dom';
import { Loader2, Route, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDeliveryRoutes } from '../../../../hooks/useDeliveryRoutes';
import type { RouteFormState, WaybillInventoryItem } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isSubmitting: boolean;
  waybill: WaybillInventoryItem | null;
  formState: RouteFormState;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const displayCode = (waybill: WaybillInventoryItem | null) => waybill?.waybill_code || waybill?.code || `#${waybill?.id || ''}`;

export default function AssignRouteDialog({ isOpen, isClosing, isSubmitting, waybill, formState, onChange, onClose, onSubmit }: Props) {
  const hubId = waybill?.dest_hub_id ?? waybill?.current_hub_id ?? waybill?.origin_hub_id ?? null;
  const { routes, isLoading: routesLoading } = useDeliveryRoutes(isOpen, hubId ? String(hubId) : null);
  const listId = 'inventory-route-catalog';

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className={clsx('absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity', isClosing ? 'opacity-0' : 'opacity-100')} onClick={onClose} />
      <div className={clsx('relative z-10 w-full max-w-md rounded-t-[28px] border border-border bg-background shadow-2xl transition-all duration-200 sm:rounded-[28px]', isClosing ? 'translate-y-6 opacity-0 sm:scale-95' : 'translate-y-0 opacity-100 sm:scale-100')}>
        <div className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Gán tuyến nhanh</p>
            <h2 className="mt-1 text-lg font-black text-foreground">{displayCode(waybill)}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5">
          <label className="mb-2 block text-[13px] font-bold text-foreground">Mã tuyến / tuyến giao</label>
          <div className="relative">
            <Route size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              list={listId}
              value={formState.route_code}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Chọn hoặc nhập mã tuyến (VD: HCM-Q7-01)"
              className="h-12 w-full rounded-xl border border-input bg-white pl-10 pr-4 text-[13px] font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <datalist id={listId}>
              {routes.map((route) => (
                <option key={String(route.id)} value={route.code}>
                  {route.name}
                  {route.province ? ` · ${route.province}` : ''}
                </option>
              ))}
            </datalist>
          </div>
          <p className="mt-2 text-[11px] font-medium text-muted-foreground">
            {routesLoading ? 'Đang tải danh mục tuyến…' : routes.length ? `${routes.length} tuyến trong danh mục` : 'Chưa có danh mục tuyến — liên hệ quản trị hoặc chạy SQL delivery_routes.sql'}
          </p>
        </div>
        <div className="border-t border-border bg-card p-5">
          <button disabled={isSubmitting || !formState.route_code.trim()} onClick={onSubmit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting && <Loader2 size={16} className="animate-spin" />}Gán tuyến</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
