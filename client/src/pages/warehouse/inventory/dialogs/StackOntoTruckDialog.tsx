import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../../../../lib/api';
import TruckSearchSelect from '../../components/TruckSearchSelect';
import type { Truck as TruckRecord, TruckListResponse } from '../../../trucks/types';
import type { TruckPickOption } from '../types';
import type { WaybillInventoryItem } from '../types';
import { buildStackFormRows, type StackOntoTruckFormRow } from '../stackOntoTruckUtils';
import { formatDonGia, parseMoneyAmount } from '../../orders/orderFormUtils';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  waybills: WaybillInventoryItem[];
  onClose: () => void;
  onSaved?: () => void;
}

const normalizeTruckList = (response: TruckListResponse | TruckRecord[]) =>
  (Array.isArray(response) ? response : response.items || response.data || response.trucks || []);

const truckPlate = (truck: TruckRecord) => truck.bks || truck.license_plate || '—';

const toTruckOption = (truck: TruckRecord): TruckPickOption => ({
  id: String(truck.id),
  license_plate: truck.license_plate,
  bks: truck.bks,
  nha_xe: truck.nha_xe || truck.vendor?.name || null,
  ten_lai_xe: truck.ten_lai_xe,
  label: [truckPlate(truck), truck.nha_xe || truck.vendor?.name, truck.ten_lai_xe].filter(Boolean).join(' · '),
});

export default function StackOntoTruckDialog({
  isOpen,
  isClosing,
  waybills,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<StackOntoTruckFormRow[]>([]);
  const [truckOptions, setTruckOptions] = useState<TruckPickOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTrucks = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const trucksRes = await apiRequest<TruckListResponse>('/trucks?limit=200');
      const trucks = normalizeTruckList(trucksRes)
        .map(toTruckOption)
        .sort((a, b) => (a.bks || a.license_plate || '').localeCompare(b.bks || b.license_plate || '', 'vi'));
      setTruckOptions(trucks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách xe.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setRows(buildStackFormRows(waybills));
    void loadTrucks();
  }, [isOpen, waybills, loadTrucks]);

  const updateRow = (waybillId: string, patch: Partial<StackOntoTruckFormRow>) => {
    setRows((prev) => prev.map((row) => (row.waybill_id === waybillId ? { ...row, ...patch } : row)));
  };

  const handleTruckChange = (waybillId: string, truckId: string) => {
    const truck = truckOptions.find((item) => item.id === truckId);
    updateRow(waybillId, {
      truck_id: truckId,
      nha_xe: truck?.nha_xe || '',
    });
  };

  async function handleSubmit() {
    setError('');
    const missingTruck = rows.find((row) => !row.truck_id);
    if (missingTruck) {
      setError(`Chọn biển số xe cho đơn ${missingTruck.waybill_code}.`);
      return;
    }

    const invalidPackages = rows.find((row) => {
      const count = Number(row.package_count);
      return !Number.isFinite(count) || count < 1 || count > row.max_package_count;
    });
    if (invalidPackages) {
      setError(`Số kiện của ${invalidPackages.waybill_code} phải từ 1 đến ${invalidPackages.max_package_count}.`);
      return;
    }

    const payload = {
      items: rows.map((row) => ({
        waybill_id: row.waybill_id,
        truck_id: row.truck_id,
        loading_position: row.loading_position ? Number(row.loading_position) : undefined,
        package_count: Number(row.package_count),
        ...(row.vendor_cost.trim()
          ? { vendor_cost: parseMoneyAmount(row.vendor_cost) }
          : {}),
      })),
    };

    setIsSaving(true);
    try {
      await apiRequest('/waybills/inventory/stack-onto-truck', { method: 'POST', body: payload });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được phân xếp hàng.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className={clsx('absolute inset-0 bg-slate-900/50 backdrop-blur-sm', isClosing ? 'opacity-0' : 'opacity-100')} onClick={onClose} />
      <div className={clsx(
        'relative z-10 flex max-h-[96vh] min-h-[min(80vh,720px)] w-full max-w-[min(98vw,1600px)] flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl sm:rounded-[28px]',
        isClosing ? 'translate-y-6 opacity-0 sm:scale-95' : 'translate-y-0 opacity-100',
      )}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <p className="text-[18px] font-black text-foreground">Xếp hàng lên xe</p>
            <p className="text-[13px] text-muted-foreground">{rows.length} dòng được chọn · dữ liệu đồng bộ sang Phân loại ưu tiên</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2.5 hover:bg-muted"><X size={22} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar p-6">
          {error && (
            <div className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[160px] items-center justify-center text-primary"><Loader2 className="animate-spin" size={24} /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[1100px] border-collapse text-[14px]">
                <thead>
                  <tr className="bg-slate-100 text-[12px] font-bold uppercase tracking-wide text-slate-700">
                    <th className="border-b border-r border-border px-4 py-3 text-left">Mã vận đơn</th>
                    <th className="border-b border-r border-border px-4 py-3 text-center">Số kiện</th>
                    <th className="border-b border-r border-border px-4 py-3 text-center">Vị trí xếp hàng</th>
                    <th className="border-b border-r border-border px-4 py-3 text-left">Biển số xe</th>
                    <th className="border-b border-r border-border px-4 py-3 text-left">NCC</th>
                    <th className="border-b border-r border-border px-4 py-3 text-right">Cước NCC</th>
                    <th className="border-b border-border px-4 py-3 text-center">Ngày tới</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.waybill_id} className="border-b border-border align-top">
                      <td className="border-r border-border px-4 py-3 text-[15px] font-extrabold text-primary">{row.waybill_code}</td>
                      <td className="border-r border-border px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          max={row.max_package_count}
                          value={row.package_count}
                          onChange={(e) => updateRow(row.waybill_id, { package_count: e.target.value })}
                          title={`Tối đa ${row.max_package_count} kiện`}
                          className="h-11 w-full min-w-[88px] rounded-lg border border-violet-300 bg-violet-50 px-2 text-center text-[15px] font-extrabold outline-none focus:border-primary"
                        />
                        <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">/ {row.max_package_count}</p>
                      </td>
                      <td className="border-r border-border px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          value={row.loading_position}
                          onChange={(e) => updateRow(row.waybill_id, { loading_position: e.target.value })}
                          placeholder="VT"
                          className="h-11 w-full min-w-[88px] rounded-lg border border-yellow-300 bg-yellow-50 px-2 text-center text-[15px] font-bold outline-none focus:border-primary"
                        />
                      </td>
                      <td className="border-r border-border px-4 py-3 min-w-[220px]">
                        <TruckSearchSelect
                          options={truckOptions}
                          value={row.truck_id}
                          onChange={(truckId) => handleTruckChange(row.waybill_id, truckId)}
                          placeholder="Chọn xe..."
                          searchPlaceholder="Tìm biển số..."
                          className="h-11 text-[14px]"
                        />
                      </td>
                      <td className="border-r border-border px-4 py-3 text-[14px] font-bold text-muted-foreground">
                        {row.nha_xe || '—'}
                      </td>
                      <td className="border-r border-border px-4 py-3">
                        <input
                          value={row.vendor_cost}
                          onChange={(e) => updateRow(row.waybill_id, { vendor_cost: formatDonGia(e.target.value) })}
                          placeholder="Nhập sau..."
                          className="h-11 w-full min-w-[130px] rounded-lg border border-amber-300 bg-amber-50/40 px-3 text-right text-[15px] font-bold outline-none focus:border-primary"
                        />
                        <p className="mt-1 text-right text-[10px] font-medium text-muted-foreground">Ghi công nợ NCC khi có số</p>
                      </td>
                      <td className="px-4 py-3 text-center text-[15px] font-bold text-emerald-800">{row.expected_arrival_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-border px-5 text-[14px] font-bold text-muted-foreground hover:bg-muted">
            Hủy
          </button>
          <button
            type="button"
            disabled={isSaving || isLoading || rows.length === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-violet-700 px-5 text-[14px] font-bold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Xác nhận xếp hàng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
