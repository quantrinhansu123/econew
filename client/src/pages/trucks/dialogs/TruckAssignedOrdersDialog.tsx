import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Package, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../lib/api';
import type { LoadPlanningBoardItem, LoadPlanningBoardResponse } from '../../warehouse/load-planning/types';
import { splitLoadStatusClass, splitLoadStatusLabel } from '../../warehouse/splits/splitLoadStatus';
import type { Truck } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  truck: Truck | null;
  canViewCost?: boolean;
  onClose: () => void;
}

const displayBks = (truck: Truck) => truck.bks || truck.license_plate || '—';

const formatNumber = (value?: number | string | null, suffix = '') =>
  value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;

export default function TruckAssignedOrdersDialog({ isOpen, isClosing, truck, canViewCost, onClose }: Props) {
  const [items, setItems] = useState<LoadPlanningBoardItem[]>([]);
  const [meta, setMeta] = useState<{ trip_id?: string | number | null; manifest_code?: string | null; total_packages?: number; total_weight?: number; total_freight?: number }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !truck?.id) return;

    let cancelled = false;
    setIsLoading(true);
    setError('');
    setItems([]);

    const params = new URLSearchParams({ truck_id: String(truck.id), limit: '200' });
    apiRequest<LoadPlanningBoardResponse>(`/waybills/load-planning/board?${params}`)
      .then((response) => {
        if (cancelled) return;
        const group = response.trucks?.find((row) => String(row.truck_id) === String(truck.id)) ?? response.trucks?.[0];
        setItems(group?.items ?? []);
        setMeta({
          trip_id: group?.trip_id,
          manifest_code: group?.manifest_code,
          total_packages: group?.total_packages,
          total_weight: group?.total_weight,
          total_freight: group?.total_freight,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setMeta({});
        setError(err instanceof ApiError ? err.message : 'Không tải được danh sách đơn phụ trách.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, truck?.id]);

  const summary = useMemo(() => {
    if (meta.total_packages != null) {
      return {
        packages: meta.total_packages,
        weight: meta.total_weight ?? 0,
        freight: meta.total_freight,
      };
    }
    return items.reduce(
      (acc, row) => ({
        packages: acc.packages + Number(row.so_luong ?? 0),
        weight: acc.weight + Number(row.weight ?? 0),
        freight: acc.freight + Number(row.allocated_freight ?? 0),
      }),
      { packages: 0, weight: 0, freight: 0 },
    );
  }, [items, meta]);

  if ((!isOpen && !isClosing) || !truck) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div
        className={clsx('fixed inset-0 bg-black/40 backdrop-blur-md', isClosing ? 'opacity-0' : 'animate-in fade-in')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative flex h-screen w-full max-w-[760px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Đơn phụ trách</p>
            <h2 className="truncate text-lg font-extrabold text-foreground">{displayBks(truck)}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className="mb-4 flex flex-wrap gap-2 text-[12px] font-bold">
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{formatNumber(summary.packages)} kiện</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatNumber(summary.weight, ' kg')}</span>
            {canViewCost && summary.freight != null && summary.freight > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{formatNumber(summary.freight, ' đ')}</span>
            )}
            {meta.trip_id && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Chuyến #{meta.trip_id}</span>
            )}
            {meta.manifest_code && (
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-800">BK {meta.manifest_code}</span>
            )}
          </div>

          {isLoading ? (
            <StateBlock icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải đơn phụ trách" />
          ) : error ? (
            <StateBlock icon={<AlertTriangle size={24} />} title={error} />
          ) : items.length === 0 ? (
            <StateBlock
              icon={<Package size={24} />}
              title="Chưa có đơn phân lên xe"
              description="Xe này chưa được gán kiện hàng từ tiếp nhận hoặc tồn kho."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      <th className="w-12 px-3 py-2.5 text-center">Vị trí</th>
                      <th className="px-3 py-2.5">Mã bill</th>
                      <th className="px-3 py-2.5">Công ty</th>
                      <th className="px-3 py-2.5">Mặt hàng</th>
                      <th className="w-14 px-3 py-2.5 text-center">Kiện</th>
                      <th className="px-3 py-2.5">Trạng thái</th>
                      <th className="px-3 py-2.5">Nơi trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={String(row.split_id ?? row.waybill_id)} className="border-b border-border/70 hover:bg-muted/5">
                        <td className="bg-yellow-100 px-3 py-2.5 text-center text-[13px] font-extrabold">
                          {row.vi_tri_hang ?? row.loading_position ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-primary">{row.waybill_code || '—'}</td>
                        <td className="px-3 py-2.5 font-medium">{row.ten_cty || '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{row.mat_hang || '—'}</div>
                          {row.mat_hang_note && <div className="text-[11px] font-bold text-red-600">{row.mat_hang_note}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-extrabold">{row.so_luong ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={clsx('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold', splitLoadStatusClass(row.load_status))}>
                            {splitLoadStatusLabel(row.load_status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px]">{row.noi_tra || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StateBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/80 p-8 text-center">
      <div className="mb-3 text-primary">{icon}</div>
      <p className="text-[14px] font-extrabold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
