import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Banknote, Building2, Loader2, Save, Truck as TruckIcon, X } from 'lucide-react';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { ApiError, apiRequest } from '../../../lib/api';
import { formatAmountInput, formatAmountInputFromNumber, parseAmountInput } from '../../../lib/formatMoney';
import type { ListResponse, Trip, TruckSummary, VendorSummary } from '../types';

interface Props {
  trip: Trip;
  currentTruck?: TruckSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

interface TransportFormState {
  truck_id: string;
  vendor_id: string;
  trip_cost: string;
}

const normalizeList = <T,>(response: ListResponse<T> | T[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trucks || []
);

const truckPlate = (truck?: TruckSummary | null) => truck?.bks?.trim() || truck?.license_plate?.trim() || '';

export default function EditTripTransportDialog({ trip, currentTruck, onClose, onSaved }: Props) {
  const [trucks, setTrucks] = useState<TruckSummary[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [form, setForm] = useState<TransportFormState>(() => ({
    truck_id: String(trip.truck_id || currentTruck?.id || ''),
    vendor_id: String(trip.vendor_id || trip.vendor?.id || currentTruck?.vendor_id || currentTruck?.vendor?.id || ''),
    trip_cost: formatAmountInputFromNumber(trip.trip_cost),
  }));
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canChangeTruck = String(trip?.status || '') === 'PLANNED';

  useEffect(() => {
    Promise.all([
      apiRequest<ListResponse<TruckSummary> | TruckSummary[]>('/trucks?limit=100'),
      apiRequest<ListResponse<VendorSummary> | VendorSummary[]>('/vendors/active?limit=100'),
    ])
      .then(([truckResponse, vendorResponse]) => {
        const loadedTrucks = normalizeList(truckResponse).filter((item) => (
          String(item.id) === String(trip.truck_id || currentTruck?.id || '')
          || String(item.status || '').toUpperCase() === 'AVAILABLE'
        ));
        if (currentTruck && !loadedTrucks.some((item) => String(item.id) === String(currentTruck.id))) {
          loadedTrucks.unshift(currentTruck);
        }
        setTrucks(loadedTrucks);
        setVendors(normalizeList(vendorResponse));
      })
      .catch((requestError) => {
        setError(requestError instanceof ApiError ? requestError.message : 'Không tải được danh sách BKS và NCC.');
      })
      .finally(() => setIsLoading(false));
  }, [trip, currentTruck]);

  const truckOptions = useMemo(() => trucks.map((item) => ({
    value: String(item.id),
    label: [truckPlate(item) || `Xe #${item.id}`, item.vendor?.name || item.nha_xe].filter(Boolean).join(' · '),
  })), [trucks]);

  const vendorOptions = useMemo(() => vendors.map((item) => ({
    value: String(item.id),
    label: [item.code, item.name || `NCC #${item.id}`].filter(Boolean).join(' · '),
  })), [vendors]);

  const changeTruck = (truckId: string) => {
    const selectedTruck = trucks.find((item) => String(item.id) === truckId);
    setForm((current) => ({
      ...current,
      truck_id: truckId,
      vendor_id: String(selectedTruck?.vendor_id || selectedTruck?.vendor?.id || ''),
    }));
  };

  const submit = async () => {
    if (!form.truck_id) {
      setError('Chọn biển kiểm soát cho chuyến.');
      return;
    }
    if (!form.vendor_id) {
      setError('Chọn nhà cung cấp cho chuyến.');
      return;
    }
    const tripCost = parseAmountInput(form.trip_cost);
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest<Trip>(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: {
          ...(canChangeTruck && String(form.truck_id) !== String(trip.truck_id || '') ? { truck_id: Number(form.truck_id) } : {}),
          vendor_id: form.vendor_id,
          trip_cost: tripCost,
        },
      });
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không lưu được BKS, NCC và cước xe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <section className="relative z-10 w-full rounded-t-[26px] border border-border bg-white shadow-2xl sm:max-w-[560px] sm:rounded-[26px]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Thông tin vận chuyển</p>
            <h2 className="text-[17px] font-black text-foreground">Sửa BKS, NCC và cước xe · Chuyến #{trip.id}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X size={20} /></button>
        </header>

        <div className="grid gap-4 p-5">
          {isLoading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground"><Loader2 className="animate-spin text-primary" size={18} />Đang tải BKS và NCC...</div>
          ) : (
            <>
              <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><TruckIcon size={14} />Biển kiểm soát (BKS)</span>
                <SearchableSelect options={truckOptions} value={form.truck_id} onValueChange={changeTruck} disabled={!canChangeTruck || isSubmitting} placeholder="Chọn BKS" searchPlaceholder="Tìm BKS..." />
                {!canChangeTruck && <span className="text-[11px] font-medium text-amber-700">Chuyến đã khởi hành nên không thể đổi xe/BKS.</span>}
              </label>

              <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Building2 size={14} />Nhà cung cấp (NCC)</span>
                <SearchableSelect options={vendorOptions} value={form.vendor_id} onValueChange={(vendorId) => setForm((current) => ({ ...current, vendor_id: vendorId }))} disabled={isSubmitting} placeholder="Chọn NCC" searchPlaceholder="Tìm mã hoặc tên NCC..." />
              </label>

              <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Banknote size={14} />Cước xe (VNĐ)</span>
                <input type="text" inputMode="numeric" value={form.trip_cost} onChange={(event) => setForm((current) => ({ ...current, trip_cost: formatAmountInput(event.target.value) }))} disabled={isSubmitting} placeholder="VD: 28.000.000" className="h-11 rounded-xl border border-border bg-white px-3 text-right text-[14px] font-extrabold tabular-nums text-foreground outline-none focus:border-primary disabled:bg-muted/30" />
              </label>
            </>
          )}

          {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{error}</div>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-[13px] font-bold text-muted-foreground disabled:opacity-50">Hủy</button>
          <button type="button" disabled={isLoading || isSubmitting || !form.truck_id || !form.vendor_id} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Lưu thông tin
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
