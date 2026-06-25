import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { AlertTriangle, Loader2, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { VendorCreatableSelect } from '../../../../components/ui/VendorCreatableSelect';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../../lib/api';
import TruckSearchSelect from '../../components/TruckSearchSelect';
import type { Truck as TruckRecord, TruckListResponse } from '../../../trucks/types';
import type { AuthUserProfile } from '../../../login/types';
import DispatchPrintColumnDropdown from '../../../print/DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from '../../../print/dispatchPrintColumns';
import { loadVisibleDispatchColumnIds, saveVisibleDispatchColumnIds } from '../../../print/dispatchPrintColumns';
import LoadPlanningPrintTemplate from '../../../print/LoadPlanningPrintTemplate';
import { mapStackOntoTruckToPrintPayload } from '../../../print/loadPlanningPrintUtils';
import type { TruckPickOption } from '../types';
import type { WaybillInventoryItem } from '../types';
import {
  DELIVERY_INSTRUCTION_OPTIONS,
  buildInitialSharedFields,
  buildStackFormRows,
  type StackOntoTruckFormRow,
  type StackOntoTruckSharedFields,
} from '../stackOntoTruckUtils';
import { formatDonGia, parseMoneyAmount } from '../../orders/orderFormUtils';
import '../../../print/inventory-stock-list.css';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  waybills: WaybillInventoryItem[];
  onClose: () => void;
  onSaved?: (result?: StackOntoTruckResult) => void;
}

interface VendorOption {
  id: string;
  code?: string | null;
  name?: string | null;
  phone?: string | null;
}

interface VendorListResponse {
  data?: VendorOption[];
  items?: VendorOption[];
  vendors?: VendorOption[];
}

interface StackOntoTruckResult {
  saved_count?: number;
  manifest_id?: string | number | null;
  manifest_code?: string | null;
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
  const [shared, setShared] = useState<StackOntoTruckSharedFields>({ truck_id: '', nha_xe: '', vendor_id: '', vendor_cost: '', driver_name: '', driver_phone: '' });
  const [truckOptions, setTruckOptions] = useState<TruckPickOption[]>([]);
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [truckDraft, setTruckDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [error, setError] = useState('');
  const user = useMemo(getStoredUser, []);
  const canViewPricing = ((user?.role_mask ?? 0) & (MANAGER | DIRECTOR)) !== 0;
  const [printColumnIds, setPrintColumnIds] = useState<DispatchPrintColumnId[]>(() =>
    loadVisibleDispatchColumnIds(canViewPricing),
  );

  const selectedTruckLabel = useMemo(() => {
    const truck = truckOptions.find((item) => item.id === shared.truck_id);
    return truck?.bks || truck?.license_plate || '';
  }, [shared.truck_id, truckOptions]);

  const filteredTruckOptions = useMemo(() => {
    const selectedVendorName = shared.nha_xe.trim().toLowerCase();
    const keyword = truckDraft.trim().toLowerCase();
    return truckOptions.filter((truck) => {
      const vendorOk = !selectedVendorName || (truck.nha_xe || '').toLowerCase() === selectedVendorName;
      const plate = (truck.bks || truck.license_plate || '').toLowerCase();
      return vendorOk && (!keyword || plate.includes(keyword));
    });
  }, [shared.nha_xe, truckDraft, truckOptions]);

  const updatePrintColumnIds = (ids: DispatchPrintColumnId[]) => {
    saveVisibleDispatchColumnIds(ids);
    setPrintColumnIds(ids);
  };

  const printPayload = useMemo(
    () =>
      mapStackOntoTruckToPrintPayload(
        waybills,
        rows,
        shared,
        selectedTruckLabel,
        canViewPricing,
        printColumnIds,
      ),
    [waybills, rows, shared, selectedTruckLabel, canViewPricing, printColumnIds],
  );

  useEffect(() => {
    setPrintColumnIds(loadVisibleDispatchColumnIds(canViewPricing));
  }, [canViewPricing]);

  const loadVendors = useCallback(async () => {
    try {
      const vendorsRes = await apiRequest<VendorListResponse | VendorOption[]>('/vendors/active?limit=200');
      const vendors = (Array.isArray(vendorsRes) ? vendorsRes : vendorsRes.items || vendorsRes.data || vendorsRes.vendors || [])
        .map((vendor) => ({ ...vendor, id: String(vendor.id) }))
        .sort((a, b) => String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), 'vi'));
      setVendorOptions(vendors);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách NCC.');
    }
  }, []);

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
    if (!isOpen) {
      setIsPrintOpen(false);
      return;
    }
    setRows(buildStackFormRows(waybills));
    setShared(buildInitialSharedFields(waybills));
    void Promise.all([loadTrucks(), loadVendors()]);
  }, [isOpen, waybills, loadTrucks, loadVendors]);

  const updateRow = (waybillId: string, patch: Partial<StackOntoTruckFormRow>) => {
    setRows((prev) => prev.map((row) => (row.waybill_id === waybillId ? { ...row, ...patch } : row)));
  };

  const handleTruckChange = (truckId: string) => {
    const truck = truckOptions.find((item) => item.id === truckId);
    setShared((prev) => ({
      ...prev,
      truck_id: truckId,
      nha_xe: truck?.nha_xe || prev.nha_xe,
      driver_name: truck?.ten_lai_xe || prev.driver_name,
    }));
  };

  const handleVendorChange = (vendorId: string) => {
    const vendor = vendorOptions.find((item) => item.id === vendorId);
    setShared((prev) => ({ ...prev, vendor_id: vendorId, nha_xe: vendor?.name || '', truck_id: '' }));
  };

  const handleCreateVendor = async (name: string) => {
    const vendorName = name.trim();
    if (!vendorName) return '';
    setIsSaving(true);
    setError('');
    try {
      const vendor = await apiRequest<VendorOption>('/vendors', { method: 'POST', body: { name: vendorName, code: vendorName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || undefined, status: 'ACTIVE' } });
      const option = { ...vendor, id: String(vendor.id) };
      setVendorOptions((prev) => [...prev, option]);
      setShared((prev) => ({ ...prev, vendor_id: option.id, nha_xe: option.name || vendorName, truck_id: '' }));
      return option.id;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thêm được NCC.');
      return '';
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTruck = async () => {
    const plate = truckDraft.trim().toUpperCase();
    if (!plate || !shared.nha_xe.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const truck = await apiRequest<TruckRecord>('/trucks', { method: 'POST', body: { license_plate: plate, bks: plate, payload: 1, nha_xe: shared.nha_xe, vendor_id: shared.vendor_id || undefined, ten_lai_xe: shared.driver_name || undefined, status: 'AVAILABLE' } });
      const option = toTruckOption(truck);
      setTruckOptions((prev) => [...prev, option]);
      setShared((prev) => ({ ...prev, truck_id: option.id }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thêm được BKS.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeRow = (waybillId: string) => setRows((prev) => prev.filter((row) => row.waybill_id !== waybillId));

  async function handleSubmit() {
    setError('');
    if (!shared.truck_id) {
      setError('Chọn biển số xe trước khi xếp hàng.');
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

    const vendorCost = shared.vendor_cost.trim() ? parseMoneyAmount(shared.vendor_cost) : undefined;
    const payload = {
      items: rows.map((row, index) => ({
        waybill_id: row.waybill_id,
        truck_id: shared.truck_id,
        loading_position: row.loading_position ? Number(row.loading_position) : undefined,
        package_count: Number(row.package_count),
        note: row.delivery_instruction,
        ...(vendorCost != null && vendorCost > 0 && index === 0 ? { vendor_cost: vendorCost } : {}),
      })),
    };

    setIsSaving(true);
    try {
      const result = await apiRequest<StackOntoTruckResult>('/waybills/inventory/stack-onto-truck', { method: 'POST', body: payload });
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được phân xếp hàng.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen && !isClosing) return null;

  const printPreview = isPrintOpen ? createPortal(
    <div className="statement-print-root fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0 print:backdrop-blur-none">
      <style>{`@media print { body > *:not(.statement-print-root) { display: none !important; } .statement-print-root { display: block !important; position: static !important; inset: auto !important; background: #fff !important; padding: 0 !important; backdrop-filter: none !important; } .statement-print-shell { display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; box-shadow: none !important; } .statement-print-toolbar { display: none !important; } .statement-print-scroll { display: block !important; overflow: visible !important; padding: 0 !important; } }`}</style>
      <div className="statement-print-shell flex max-h-[92vh] w-full max-w-[min(98vw,1200px)] flex-col overflow-hidden rounded-2xl border border-border bg-slate-100 shadow-2xl print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="statement-print-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 print:hidden">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">In duyệt xếp hàng</p>
            <h3 className="text-[16px] font-extrabold text-foreground">
              {printPayload.groups[0]?.manifestCode || 'BẢNG KÊ PHÁT HÀNG ECO'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DispatchPrintColumnDropdown
              value={printColumnIds}
              canViewPricing={canViewPricing}
              onChange={updatePrintColumnIds}
              className="w-[min(220px,42vw)]"
            />
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90">
              <Printer size={16} />
              In bảng kê (A4 ngang)
            </button>
            <button type="button" onClick={() => setIsPrintOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="statement-print-scroll flex-1 overflow-auto p-4 custom-scrollbar print:block print:overflow-visible print:p-0">
          <LoadPlanningPrintTemplate data={printPayload} />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
    {printPreview}
    {createPortal(
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
            <>
              <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                <div className="grid grid-cols-12 items-end gap-3">
                  <div className="col-span-12 md:col-span-6">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">NCC</label>
                    <VendorCreatableSelect
                      value={shared.vendor_id}
                      options={vendorOptions.map((vendor) => ({ value: vendor.id, label: vendor.name || vendor.code || `NCC #${vendor.id}`, code: vendor.code }))}
                      onValueChange={handleVendorChange}
                      onCreate={handleCreateVendor}
                      isCreating={isSaving}
                      placeholder="Chọn NCC..."
                      searchPlaceholder="Tìm NCC hoặc nhập NCC mới..."
                      emptyMessage="Không tìm thấy NCC. Nhấn thêm để tạo mới."
                      createLabel="Thêm NCC"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">BKS theo NCC</label>
                    <TruckSearchSelect options={filteredTruckOptions} value={shared.truck_id} onChange={handleTruckChange} disabled={!shared.nha_xe} placeholder={shared.nha_xe ? 'Chọn BKS...' : 'Chọn NCC trước'} searchPlaceholder="Tìm biển số..." className="h-11 text-[14px]" />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">Thêm BKS nếu chưa có</label>
                    <div className="flex gap-2">
                      <input value={truckDraft} onChange={(e) => setTruckDraft(e.target.value.toUpperCase())} disabled={!shared.nha_xe} placeholder="VD: 89H-09800" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-bold outline-none focus:border-primary disabled:bg-slate-100" />
                      <button type="button" disabled={isSaving || !shared.nha_xe || !truckDraft.trim()} onClick={() => void handleCreateTruck()} className="inline-flex h-11 items-center gap-1 rounded-lg border border-primary/20 bg-white px-3 text-[12px] font-black text-primary disabled:opacity-50"><Plus size={14} />BKS</button>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">Tài xế</label>
                    <input value={shared.driver_name} onChange={(e) => setShared((prev) => ({ ...prev, driver_name: e.target.value }))} placeholder="Nhập sau..." className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-bold outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">SĐT tài xế</label>
                    <input value={shared.driver_phone} onChange={(e) => setShared((prev) => ({ ...prev, driver_phone: e.target.value }))} placeholder="Không bắt buộc" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-bold outline-none focus:border-primary" />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-slate-700">Cước NCC</label>
                    <input value={shared.vendor_cost} onChange={(e) => setShared((prev) => ({ ...prev, vendor_cost: formatDonGia(e.target.value) }))} placeholder="Nhập sau..." className="h-11 w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 text-right text-[15px] font-bold outline-none focus:border-primary" />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[1180px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                      <th className="border-b border-r border-border px-3 py-3 text-left">Mã bill</th>
                      <th className="border-b border-r border-border px-3 py-3 text-left">Người nhận / nơi trả</th>
                      <th className="border-b border-r border-border px-3 py-3 text-center">Số kiện</th>
                      <th className="border-b border-r border-border px-3 py-3 text-center">Vị trí</th>
                      <th className="border-b border-r border-border px-3 py-3 text-center">Ngày tới</th>
                      <th className="border-b border-r border-border px-3 py-3 text-center">Hướng dẫn phát</th>
                      <th className="border-b border-border px-3 py-3 text-center">DS đã khởi hành</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const waybill = waybills.find((item) => String(item.id) === row.waybill_id);
                      return (
                        <tr key={row.waybill_id} className="border-b border-border align-top">
                          <td className="border-r border-border px-3 py-3 text-[14px] font-extrabold text-primary">{row.waybill_code}</td>
                          <td className="border-r border-border px-3 py-3">
                            <p className="font-bold text-slate-900">{waybill?.receiver_info || waybill?.receiver_phone || '—'}</p>
                            <p className="mt-1 text-[12px] font-medium text-muted-foreground">{waybill?.receiver_address || waybill?.dest_hub?.name || '—'}</p>
                          </td>
                          <td className="border-r border-border px-3 py-3">
                            <input type="number" min={1} max={row.max_package_count} value={row.package_count} onChange={(e) => updateRow(row.waybill_id, { package_count: e.target.value })} title={`Tối đa ${row.max_package_count} kiện`} className="h-10 w-full min-w-[72px] rounded-lg border border-violet-300 bg-violet-50 px-2 text-center text-[14px] font-extrabold outline-none focus:border-primary" />
                            <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground">/ {row.max_package_count}</p>
                          </td>
                          <td className="border-r border-border px-3 py-3"><input type="number" min={1} value={row.loading_position} onChange={(e) => updateRow(row.waybill_id, { loading_position: e.target.value })} placeholder="VT" className="h-10 w-full min-w-[72px] rounded-lg border border-yellow-300 bg-yellow-50 px-2 text-center text-[14px] font-bold outline-none focus:border-primary" /></td>
                          <td className="border-r border-border px-3 py-3 text-center text-[14px] font-bold text-emerald-800">{row.expected_arrival_label}</td>
                          <td className="border-r border-border px-3 py-3"><select value={row.delivery_instruction} onChange={(e) => updateRow(row.waybill_id, { delivery_instruction: e.target.value })} className="h-10 w-full min-w-[150px] rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-bold outline-none focus:border-primary">{DELIVERY_INSTRUCTION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                          <td className="px-3 py-3 text-center"><button type="button" onClick={() => removeRow(row.waybill_id)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-3 text-[12px] font-black text-red-600 hover:bg-red-100"><Trash2 size={14} />Bỏ đơn</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-border px-5 text-[14px] font-bold text-muted-foreground hover:bg-muted">
            Hủy
          </button>
          <button
            type="button"
            disabled={isLoading || rows.length === 0}
            onClick={() => setIsPrintOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary/20 bg-blue-50 px-5 text-[14px] font-bold text-primary hover:bg-blue-100 disabled:opacity-50"
          >
            <Printer size={16} />
            In duyệt
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
    )}
    </>
  );
}
