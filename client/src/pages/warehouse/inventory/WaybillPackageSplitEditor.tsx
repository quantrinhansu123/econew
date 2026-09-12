import { clsx } from 'clsx';
import { AlertTriangle, Loader2, Plus, Save, Trash2, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../lib/api';
import type { Truck as TruckRecord, TruckListResponse } from '../../trucks/types';
import type { TruckPickOption, WaybillSplitResponse } from './types';
import SplitLoadStatusControl from '../splits/SplitLoadStatusControl';
import TruckSearchSelect from '../components/TruckSearchSelect';

export interface WaybillSplitTarget {
  id: string | number;
  waybill_code?: string | null;
  code?: string | null;
  package_count?: number | string | null;
  freight_amount?: number | string | null;
  cost_amount?: number | string | null;
  cod_amount?: number | string | null;
}

interface Props {
  waybill: WaybillSplitTarget;
  onSaved?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

type EditableSplit = {
  key: string;
  split_id?: string;
  trip_id?: string;
  load_status?: string | null;
  truck_id: string;
  package_count: string;
  loading_position: string;
  note: string;
};

const normalizeTruckList = (response: TruckListResponse | TruckRecord[]) =>
  (Array.isArray(response) ? response : response.items || response.data || response.trucks || []);

const truckPlate = (truck: TruckRecord) => truck.bks || truck.license_plate || '—';

const toTruckOption = (truck: TruckRecord): TruckPickOption => ({
  id: String(truck.id),
  license_plate: truck.license_plate,
  bks: truck.bks,
  nha_xe: truck.nha_xe,
  ten_lai_xe: truck.ten_lai_xe,
  label: [truckPlate(truck), truck.nha_xe, truck.ten_lai_xe].filter(Boolean).join(' · '),
});

const displayCode = (waybill: WaybillSplitTarget) =>
  waybill.waybill_code || waybill.code || `#${waybill.id}`;

const emptyRow = (): EditableSplit => ({
  key: `${Date.now()}-${Math.random()}`,
  truck_id: '',
  package_count: '',
  loading_position: '',
  note: '',
});

export default function WaybillPackageSplitEditor({ waybill, onSaved, disabled, disabledReason }: Props) {
  const [summary, setSummary] = useState<WaybillSplitResponse | null>(null);
  const [rows, setRows] = useState<EditableSplit[]>([emptyRow()]);
  const [truckOptions, setTruckOptions] = useState<TruckPickOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const totalPackages = summary?.total_packages ?? Math.max(1, Number(waybill.package_count || 1));

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    setSavedMessage('');
    try {
      const [splitRes, trucksRes] = await Promise.all([
        apiRequest<WaybillSplitResponse>(`/waybills/${waybill.id}/splits`),
        apiRequest<TruckListResponse>('/trucks?limit=100'),
      ]);

      setSummary(splitRes);
      setRows(
        splitRes.splits.length
          ? splitRes.splits.map((line) => ({
              key: String(line.id ?? `${line.truck_id}-${line.package_count}`),
              split_id: line.id ? String(line.id) : undefined,
              trip_id: line.trip_id ? String(line.trip_id) : undefined,
              load_status: line.load_status ?? 'WAITING_LOAD',
              truck_id: line.truck_id ? String(line.truck_id) : '',
              package_count: String(line.package_count),
              loading_position: line.loading_position ? String(line.loading_position) : '',
              note: line.note ?? '',
            }))
          : [emptyRow()],
      );

      const trucks = normalizeTruckList(trucksRes)
        .map(toTruckOption)
        .sort((a, b) => (a.bks || a.license_plate || '').localeCompare(b.bks || b.license_plate || '', 'vi'));
      setTruckOptions(trucks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu chia đơn.');
    } finally {
      setIsLoading(false);
    }
  }, [waybill.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const allocated = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.package_count) || 0), 0),
    [rows],
  );
  const remaining = totalPackages - allocated;

  const previewAccounting = useMemo(() => {
    const freight = summary?.total_freight ?? Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
    const cod = summary?.total_cod ?? Number(waybill.cod_amount ?? 0);
    return rows
      .filter((row) => row.truck_id && Number(row.package_count) > 0)
      .map((row) => {
        const count = Number(row.package_count);
        const ratio = count / totalPackages;
        const truck = truckOptions.find((t) => t.id === row.truck_id);
        return {
          key: row.key,
          label: truck?.label || `Xe #${row.truck_id}`,
          package_count: count,
          allocated_freight: Math.round(freight * ratio),
          allocated_cod: Math.round(cod * ratio),
        };
      });
  }, [rows, summary, waybill, truckOptions, totalPackages]);

  async function handleSave() {
    if (disabled) return;
    setError('');
    setSavedMessage('');
    const splits = rows
      .filter((row) => row.truck_id && Number(row.package_count) > 0)
      .map((row) => ({
        id: row.split_id,
        trip_id: row.trip_id,
        truck_id: row.truck_id,
        package_count: Number(row.package_count),
        loading_position: row.loading_position ? Number(row.loading_position) : undefined,
        note: row.note.trim() || undefined,
        load_status: row.load_status ?? undefined,
      }));

    if (!splits.length) {
      setError('Thêm ít nhất một dòng chia kiện cho xe.');
      return;
    }
    if (allocated > totalPackages) {
      setError(`Tổng kiện đã phân (${allocated}) vượt quá đơn (${totalPackages}).`);
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest<WaybillSplitResponse>(`/waybills/${waybill.id}/splits`, {
        method: 'PUT',
        body: { splits },
      });
      setSavedMessage('Đã lưu phân kiện lên xe.');
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được chia đơn.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Tách hàng · phân xe</p>
          <h3 className="text-[15px] font-black text-foreground">{displayCode(waybill)}</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Chia kiện lên từng xe — cùng 1 vận đơn, hạch toán theo tỷ lệ kiện.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg border border-border bg-white px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Tổng kiện</p>
            <p className="text-[16px] font-black">{totalPackages}</p>
          </div>
          <div className="rounded-lg border border-violet-200 bg-white px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase text-violet-700">Đã phân</p>
            <p className={clsx('text-[16px] font-black', allocated > totalPackages ? 'text-red-600' : 'text-violet-800')}>{allocated}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase text-emerald-700">Còn lại</p>
            <p className="text-[16px] font-black text-emerald-800">{remaining}</p>
          </div>
        </div>
      </div>

      {disabled && disabledReason && (
        <div className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />{disabledReason}
        </div>
      )}

      {error && (
        <div className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}
        </div>
      )}

      {savedMessage && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700">
          {savedMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[120px] items-center justify-center text-primary"><Loader2 className="animate-spin" size={24} /></div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-[1fr_88px_72px_minmax(130px,auto)_1fr_auto]">
                <label className="block min-w-0">
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
                    <Truck size={12} /> Biển số xe
                  </span>
                  <TruckSearchSelect
                    options={truckOptions}
                    value={row.truck_id}
                    disabled={disabled}
                    placeholder="Chọn xe..."
                    searchPlaceholder="Tìm biển số, nhà xe, tài xế..."
                    onChange={(truckId) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, truck_id: truckId } : r))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Số kiện</span>
                  <input
                    type="number"
                    min={1}
                    disabled={disabled}
                    value={row.package_count}
                    onChange={(e) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, package_count: e.target.value } : r))}
                    className="h-9 w-full rounded-lg border border-input px-2 text-center text-[13px] font-extrabold outline-none focus:border-primary disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Vị trí</span>
                  <input
                    type="number"
                    min={1}
                    disabled={disabled}
                    value={row.loading_position}
                    onChange={(e) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, loading_position: e.target.value } : r))}
                    className="h-9 w-full rounded-lg border border-yellow-300 bg-yellow-50 px-2 text-center text-[12px] font-bold outline-none disabled:opacity-50"
                  />
                </label>
                <div className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Trạng thái</span>
                  <SplitLoadStatusControl
                    splitId={row.split_id}
                    value={row.load_status ?? 'WAITING_LOAD'}
                    disabled={disabled}
                    compact
                    onUpdated={(status) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, load_status: status } : r))}
                  />
                </div>
                <label className="block min-w-0">
                  <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Ghi chú</span>
                  <input
                    disabled={disabled}
                    value={row.note}
                    onChange={(e) => setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, note: e.target.value } : r))}
                    className="h-9 w-full rounded-lg border border-input px-2 text-[12px] outline-none disabled:opacity-50"
                  />
                </label>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    disabled={disabled || rows.length <= 1}
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-white px-3 text-[12px] font-bold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            >
              <Plus size={14} /> Thêm xe
            </button>
            <button
              type="button"
              disabled={disabled || isSaving}
              onClick={() => void handleSave()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-4 text-[12px] font-bold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Lưu phân xe
            </button>
          </div>

          {previewAccounting.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <p className="mb-2 text-[11px] font-black uppercase text-muted-foreground">Hạch toán tạm tính</p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left uppercase text-muted-foreground">
                    <th className="pb-1">Xe</th>
                    <th className="pb-1 text-right">Kiện</th>
                    <th className="pb-1 text-right">Cước</th>
                    <th className="pb-1 text-right">COD</th>
                  </tr>
                </thead>
                <tbody>
                  {previewAccounting.map((line) => (
                    <tr key={line.key} className="border-t border-border">
                      <td className="py-1 font-bold">{line.label}</td>
                      <td className="py-1 text-right font-extrabold">{line.package_count}</td>
                      <td className="py-1 text-right">{line.allocated_freight.toLocaleString('vi-VN')}</td>
                      <td className="py-1 text-right">{line.allocated_cod.toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
