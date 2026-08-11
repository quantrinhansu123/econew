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
  manual_license_plate: string;
  vendor_id: string;
  trip_cost: string;
}

type LicensePlateMode = 'EXISTING' | 'MANUAL';

const normalizeList = <T,>(response: ListResponse<T> | T[]) => (
  Array.isArray(response) ? response : response.data || response.items || response.trucks || []
);

const truckPlate = (truck?: TruckSummary | null) => truck?.bks?.trim() || truck?.license_plate?.trim() || '';

export default function EditTripTransportDialog({ trip, currentTruck, onClose, onSaved }: Props) {
  const [trucks, setTrucks] = useState<TruckSummary[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [form, setForm] = useState<TransportFormState>(() => ({
    truck_id: String(trip.truck_id || currentTruck?.id || ''),
    manual_license_plate: String(trip.manual_license_plate || ''),
    vendor_id: String(trip.vendor_id || trip.vendor?.id || currentTruck?.vendor_id || currentTruck?.vendor?.id || ''),
    trip_cost: formatAmountInputFromNumber(trip.trip_cost),
  }));
  const [licensePlateMode, setLicensePlateMode] = useState<LicensePlateMode>(trip.manual_license_plate ? 'MANUAL' : 'EXISTING');
  const [isLoading, setIsLoading] = useState(true);
  const [isTruckLoading, setIsTruckLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const tripStatus = String(trip?.status || '').toUpperCase();
  const isHistoricalTrip = ['ARRIVED', 'COMPLETED', 'CANCELLED'].includes(tripStatus);
  const currentTruckId = String(trip.truck_id || currentTruck?.id || '');

  useEffect(() => {
    let active = true;
    apiRequest<ListResponse<VendorSummary> | VendorSummary[]>('/vendors/active?limit=100')
      .then((vendorResponse) => {
        if (active) setVendors(normalizeList(vendorResponse));
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof ApiError ? requestError.message : 'Không tải được danh sách NCC.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: '100' });
    if (form.vendor_id) params.set('vendor_id', form.vendor_id);
    setIsTruckLoading(true);
    setTrucks([]);
    apiRequest<ListResponse<TruckSummary> | TruckSummary[]>(`/trucks?${params.toString()}`)
      .then((truckResponse) => {
        if (!active) return;
        const loadedTrucks = normalizeList(truckResponse).filter((item) => (
          String(item.id) === currentTruckId
          || isHistoricalTrip
          || String(item.status || '').toUpperCase() === 'AVAILABLE'
        ));
        if (currentTruck && !loadedTrucks.some((item) => String(item.id) === String(currentTruck.id))) {
          loadedTrucks.unshift(currentTruck);
        }
        setTrucks(loadedTrucks);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof ApiError ? requestError.message : 'Không tải được danh sách BKS theo NCC.');
      })
      .finally(() => { if (active) setIsTruckLoading(false); });
    return () => { active = false; };
  }, [currentTruck, currentTruckId, form.vendor_id, isHistoricalTrip]);

  const truckOptions = useMemo(() => trucks.filter((item) => (
    !form.vendor_id
    || String(item.vendor_id || item.vendor?.id || '') === form.vendor_id
    || String(item.id) === form.truck_id
  )).map((item) => ({
    value: String(item.id),
    label: [truckPlate(item) || `Xe #${item.id}`, item.vendor?.name || item.nha_xe].filter(Boolean).join(' · '),
  })), [form.truck_id, form.vendor_id, trucks]);

  const vendorOptions = useMemo(() => vendors.map((item) => ({
    value: String(item.id),
    label: [item.code, item.name || `NCC #${item.id}`].filter(Boolean).join(' · '),
  })), [vendors]);

  const changeTruck = (truckId: string) => {
    const selectedTruck = trucks.find((item) => String(item.id) === truckId);
    setForm((current) => ({
      ...current,
      truck_id: truckId,
      manual_license_plate: '',
      vendor_id: String(selectedTruck?.vendor_id || selectedTruck?.vendor?.id || ''),
    }));
  };

  const changeVendor = (vendorId: string) => {
    setForm((current) => {
      const selectedTruck = trucks.find((item) => String(item.id) === current.truck_id);
      const selectedTruckVendorId = String(selectedTruck?.vendor_id || selectedTruck?.vendor?.id || '');
      return {
        ...current,
        vendor_id: vendorId,
        truck_id: licensePlateMode === 'EXISTING' && selectedTruckVendorId && selectedTruckVendorId !== vendorId ? '' : current.truck_id,
      };
    });
  };

  const submit = async () => {
    const tripCost = form.trip_cost.trim() ? parseAmountInput(form.trip_cost) : null;
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest<Trip>(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: {
          truck_id: licensePlateMode === 'EXISTING' && form.truck_id ? Number(form.truck_id) : null,
          manual_license_plate: licensePlateMode === 'MANUAL' ? form.manual_license_plate.trim().toUpperCase() || null : null,
          vendor_id: form.vendor_id || null,
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
                <span className="inline-flex items-center gap-1.5"><Building2 size={14} />Nhà cung cấp (NCC)</span>
                <SearchableSelect options={vendorOptions} value={form.vendor_id} onValueChange={changeVendor} disabled={isSubmitting} placeholder="Có thể để trống và bổ sung sau" searchPlaceholder="Tìm mã hoặc tên NCC..." />
              </label>

              <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><TruckIcon size={14} />Biển kiểm soát (BKS) <span className="font-medium">— không bắt buộc</span></span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setLicensePlateMode('EXISTING')} disabled={isSubmitting} className={`h-9 rounded-lg border text-[12px] font-extrabold ${licensePlateMode === 'EXISTING' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-muted-foreground'}`}>Chọn xe có sẵn</button>
                  <button type="button" onClick={() => setLicensePlateMode('MANUAL')} disabled={isSubmitting} className={`h-9 rounded-lg border text-[12px] font-extrabold ${licensePlateMode === 'MANUAL' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-muted-foreground'}`}>Nhập BKS thủ công</button>
                </div>
                {licensePlateMode === 'EXISTING' ? (
                  <SearchableSelect options={truckOptions} value={form.truck_id} onValueChange={changeTruck} disabled={isSubmitting || isTruckLoading} placeholder={isTruckLoading ? 'Đang tải BKS theo NCC...' : form.vendor_id ? 'Chọn BKS theo NCC' : 'Chọn NCC trước hoặc tìm BKS'} searchPlaceholder="Tìm BKS..." emptyMessage={form.vendor_id ? 'NCC này chưa có xe/BKS trong danh mục.' : 'Chưa có xe/BKS phù hợp.'} />
                ) : (
                  <input value={form.manual_license_plate} onChange={(event) => setForm((current) => ({ ...current, manual_license_plate: event.target.value.toUpperCase() }))} maxLength={32} disabled={isSubmitting} placeholder="Có thể để trống nếu đối tác chưa có BKS" className="h-11 rounded-xl border border-border bg-white px-3 text-[14px] font-extrabold uppercase text-foreground outline-none focus:border-primary disabled:bg-muted/30" />
                )}
                {licensePlateMode === 'EXISTING' && !isTruckLoading && form.vendor_id && truckOptions.length === 0 && (
                  <button type="button" onClick={() => setLicensePlateMode('MANUAL')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-bold text-amber-800">
                    NCC này chưa khai báo xe/BKS. Bấm để nhập BKS thủ công hoặc để trống.
                  </button>
                )}
                <span className="text-[11px] font-medium text-emerald-700">Sửa được ở mọi trạng thái; dữ liệu lịch sử không làm đổi trạng thái hoạt động hiện tại của xe.</span>
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
          <button type="button" disabled={isLoading || isTruckLoading || isSubmitting} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Lưu thông tin
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
