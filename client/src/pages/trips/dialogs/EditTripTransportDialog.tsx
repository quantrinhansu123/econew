import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Banknote, Building2, Loader2, Phone, Plus, Save, Truck as TruckIcon, UserRound, X } from 'lucide-react';
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
  driver_name: string;
  driver_phone: string;
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
    driver_name: String(trip.driver_name || currentTruck?.ten_lai_xe || currentTruck?.driver?.full_name || ''),
    driver_phone: String(trip.driver_phone || currentTruck?.driver?.phone || ''),
  }));
  const [licensePlateMode, setLicensePlateMode] = useState<LicensePlateMode>(trip.manual_license_plate ? 'MANUAL' : 'EXISTING');
  const [isLoading, setIsLoading] = useState(true);
  const [isTruckLoading, setIsTruckLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingTruck, setIsCreatingTruck] = useState(false);
  const [showCreateTruck, setShowCreateTruck] = useState(false);
  const [newLicensePlate, setNewLicensePlate] = useState('');
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
      driver_name: selectedTruck?.ten_lai_xe || selectedTruck?.driver?.full_name || current.driver_name,
      driver_phone: selectedTruck?.driver?.phone || current.driver_phone,
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

  const createTruck = async () => {
    const plate = newLicensePlate.trim().toUpperCase();
    if (!form.vendor_id) {
      setError('Chọn NCC trước khi thêm BKS mới.');
      return;
    }
    if (!plate) {
      setError('Nhập BKS cần thêm.');
      return;
    }

    const vendor = vendors.find((item) => String(item.id) === form.vendor_id);
    setIsCreatingTruck(true);
    setError('');
    try {
      const created = await apiRequest<TruckSummary>('/trucks', {
        method: 'POST',
        body: {
          license_plate: plate,
          bks: plate,
          payload: 1,
          vendor_id: form.vendor_id,
          nha_xe: vendor?.name || vendor?.code || undefined,
          ten_lai_xe: form.driver_name.trim() || undefined,
          status: 'AVAILABLE',
        },
      });
      const createdTruck = { ...created, vendor: created.vendor || vendor || null };
      setTrucks((current) => [createdTruck, ...current.filter((item) => String(item.id) !== String(createdTruck.id))]);
      setForm((current) => ({
        ...current,
        truck_id: String(createdTruck.id),
        manual_license_plate: '',
      }));
      setLicensePlateMode('EXISTING');
      setNewLicensePlate('');
      setShowCreateTruck(false);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không thêm được BKS mới cho NCC.');
    } finally {
      setIsCreatingTruck(false);
    }
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
          driver_name: form.driver_name.trim() || null,
          driver_phone: form.driver_phone.trim() || null,
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
      <section className="relative z-10 flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-[26px] border border-border bg-white shadow-2xl sm:max-w-[560px] sm:rounded-[26px]">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Thông tin vận chuyển</p>
            <h2 className="text-[17px] font-black text-foreground">Sửa BKS, NCC, tài xế và cước xe · Chuyến #{trip.id}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X size={20} /></button>
        </header>

        <div className="custom-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
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
                  <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                    <SearchableSelect options={truckOptions} value={form.truck_id} onValueChange={changeTruck} disabled={isSubmitting || isTruckLoading || isCreatingTruck} placeholder={isTruckLoading ? 'Đang tải BKS theo NCC...' : form.vendor_id ? 'Chọn BKS theo NCC' : 'Chọn NCC trước hoặc tìm BKS'} searchPlaceholder="Tìm BKS..." emptyMessage={form.vendor_id ? 'NCC này chưa có xe/BKS trong danh mục.' : 'Chưa có xe/BKS phù hợp.'} />
                    <button
                      type="button"
                      title="Thêm BKS mới gắn với NCC"
                      aria-label="Thêm BKS mới gắn với NCC"
                      disabled={isSubmitting || isCreatingTruck}
                      onClick={() => {
                        if (!form.vendor_id) setError('Chọn NCC trước khi thêm BKS mới.');
                        else {
                          setError('');
                          setShowCreateTruck((current) => !current);
                        }
                      }}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 disabled:opacity-50"
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                ) : (
                  <input value={form.manual_license_plate} onChange={(event) => setForm((current) => ({ ...current, manual_license_plate: event.target.value.toUpperCase() }))} maxLength={32} disabled={isSubmitting} placeholder="Có thể để trống nếu đối tác chưa có BKS" className="h-11 rounded-xl border border-border bg-white px-3 text-[14px] font-extrabold uppercase text-foreground outline-none focus:border-primary disabled:bg-muted/30" />
                )}
                {licensePlateMode === 'EXISTING' && showCreateTruck && (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                    <input
                      value={newLicensePlate}
                      onChange={(event) => setNewLicensePlate(event.target.value.toUpperCase())}
                      maxLength={32}
                      disabled={isCreatingTruck}
                      placeholder="Nhập BKS mới"
                      className="h-10 min-w-0 rounded-lg border border-blue-200 bg-white px-3 text-[13px] font-extrabold uppercase text-foreground outline-none focus:border-primary"
                    />
                    <button type="button" disabled={isCreatingTruck || !newLicensePlate.trim()} onClick={() => void createTruck()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-extrabold text-white disabled:opacity-50">
                      {isCreatingTruck ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      Lưu BKS
                    </button>
                  </div>
                )}
                {licensePlateMode === 'EXISTING' && !isTruckLoading && form.vendor_id && truckOptions.length === 0 && (
                  <button type="button" onClick={() => setLicensePlateMode('MANUAL')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-bold text-amber-800">
                    NCC này chưa khai báo xe/BKS. Bấm để nhập BKS thủ công hoặc để trống.
                  </button>
                )}
                <span className="text-[11px] font-medium text-emerald-700">Sửa được ở mọi trạng thái; dữ liệu lịch sử không làm đổi trạng thái hoạt động hiện tại của xe.</span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><UserRound size={14} />Tên tài xế</span>
                  <input value={form.driver_name} onChange={(event) => setForm((current) => ({ ...current, driver_name: event.target.value }))} maxLength={255} disabled={isSubmitting} placeholder="Nhập tên tài xế" className="h-11 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none focus:border-primary disabled:bg-muted/30" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Phone size={14} />SĐT tài xế</span>
                  <input type="tel" inputMode="tel" value={form.driver_phone} onChange={(event) => setForm((current) => ({ ...current, driver_phone: event.target.value }))} maxLength={32} disabled={isSubmitting} placeholder="Nhập số điện thoại" className="h-11 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none focus:border-primary disabled:bg-muted/30" />
                </label>
              </div>

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
          <button type="button" disabled={isLoading || isTruckLoading || isSubmitting || isCreatingTruck} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-50">
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Lưu thông tin
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
