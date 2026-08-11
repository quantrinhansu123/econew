import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { ApiError } from '../../../../lib/api';
import { formatAmountInput, formatAmountInputFromNumber, parseAmountInput } from '../../../../lib/formatMoney';
import { IMAGE_UPLOAD_ACCEPT, uploadWaybillImage } from '../../../../lib/uploadImage';
import type { DeliveryResources, LastMileWaybill } from '../types';
import type { DeliveryRouteOption } from '../../../../hooks/useDeliveryRoutes';

type DeliveryStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';

interface Props {
  waybill: LastMileWaybill | null;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  resources?: DeliveryResources;
  currentUserId?: string | number | null;
  routes?: DeliveryRouteOption[];
  routesLoading?: boolean;
  onConfirm: (status: DeliveryStatus, deliveryPhotoUrl?: string, assignment?: { assignment_type: 'INTERNAL' | 'PARTNER'; driver_id?: string; truck_id?: string; vendor_id?: string; route_code?: string; driver_name?: string; license_plate?: string; delivery_cost?: number }, failureReason?: string) => void;
}

export default function UpdateDeliveryStatusDialog({ waybill, isSubmitting, error, resources, routes = [], routesLoading = false, currentUserId, onClose, onConfirm }: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [assignmentType, setAssignmentType] = useState<'INTERNAL' | 'PARTNER'>('INTERNAL');
  const [driverId, setDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  const [routeCode, setRouteCode] = useState('');
  const [failureReason, setFailureReason] = useState('');

  useEffect(() => {
    setPhotos(String(waybill?.delivery_photo_url || '').split('|').map((item) => item.trim()).filter(Boolean));
    setUploadError('');
    setAssignmentType(waybill?.delivery_assignment_type || 'INTERNAL');
    const currentDriver = resources?.drivers.find((driver) => String(driver.id) === String(currentUserId || ''));
    setDriverId(String(waybill?.last_mile_driver_id || currentDriver?.id || ''));
    setTruckId(String(waybill?.last_mile_truck_id || ''));
    setVendorId(String(waybill?.last_mile_vendor_id || ''));
    setDriverName(String(waybill?.last_mile_driver_name || waybill?.last_mile_driver?.name || currentDriver?.name || currentDriver?.username || ''));
    setLicensePlate(String(waybill?.last_mile_license_plate || waybill?.last_mile_truck?.bks || waybill?.last_mile_truck?.license_plate || ''));
    setDeliveryCost(formatAmountInputFromNumber(waybill?.last_mile_cost_amount));
    setRouteCode(String(waybill?.route_code || ''));
    setFailureReason(String(waybill?.last_delivery_failure_reason || ''));
  }, [currentUserId, resources, waybill]);

  if (!waybill) return null;

  const currentStatus = String(waybill.current_state || '').toUpperCase();
  const nextStatuses: DeliveryStatus[] = currentStatus === 'AT_DEST_HUB'
    ? ['OUT_FOR_DELIVERY']
    : ['DELIVERED', 'RETURNED'];
  const labels: Record<DeliveryStatus, string> = {
    OUT_FOR_DELIVERY: 'Bàn giao tài xế chặng cuối',
    DELIVERED: 'Xác nhận giao thành công',
    RETURNED: 'Giao không thành công',
  };

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []).slice(0, Math.max(0, 4 - photos.length));
    if (!selected.length) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const urls = await Promise.all(selected.map(uploadWaybillImage));
      setPhotos((current) => [...current, ...urls].slice(0, 4));
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof ApiError ? uploadFailure.message : 'Không upload được ảnh giao hàng.');
    } finally {
      setIsUploading(false);
    }
  };

  const submitStatus = (status: DeliveryStatus) => {
    if (status === 'OUT_FOR_DELIVERY') {
      if (assignmentType === 'INTERNAL' && !driverName.trim()) {
        setUploadError('Phải nhập hoặc chọn tài xế nội bộ.');
        return;
      }
      if (assignmentType === 'PARTNER' && !vendorId) {
        setUploadError('Phải chọn đối tác giao hàng.');
        return;
      }
      onConfirm(status, undefined, {
        assignment_type: assignmentType,
        route_code: routeCode || undefined,
        driver_name: driverName.trim() || undefined,
        license_plate: licensePlate.trim().toUpperCase() || undefined,
        delivery_cost: parseAmountInput(deliveryCost),
        ...(assignmentType === 'INTERNAL' ? { driver_id: driverId, truck_id: truckId || undefined } : { vendor_id: vendorId }),
      });
      return;
    }
    if (status === 'DELIVERED' && !photos.length) {
      setUploadError('Giao thành công bắt buộc có ít nhất 1 ảnh.');
      return;
    }
    if (status === 'RETURNED' && !failureReason.trim()) {
      setUploadError('Phải nhập lý do giao hàng không thành công.');
      return;
    }
    onConfirm(status, photos.length ? photos.join('|') : undefined, undefined, failureReason.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">Cập nhật trạng thái</p>
            <h2 className="text-base font-black text-foreground">{waybill.waybill_code}</h2>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4 text-[13px] text-muted-foreground">
          <p>Chọn trạng thái giao chặng cuối hợp lệ theo state machine cho vận đơn này.</p>
          {currentStatus === 'AT_DEST_HUB' && resources && (
            <div className="space-y-3 rounded-xl border border-border bg-slate-50 p-3">
              <p className="font-black text-foreground">Phân giao chặng cuối</p>
              <select value={routeCode} onChange={(event) => setRouteCode(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                <option value="">{routesLoading ? 'Đang tải tuyến...' : 'Không chọn tuyến (không bắt buộc)'}</option>
                {routeCode && !routes.some((route) => route.code === routeCode) && <option value={routeCode}>{routeCode} · Tuyến đang gán</option>}
                {routes.map((route) => <option key={String(route.id)} value={route.code}>{route.code} · {route.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAssignmentType('INTERNAL')} className={`h-9 rounded-lg border text-[12px] font-black ${assignmentType === 'INTERNAL' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-muted-foreground'}`}>Xe nội bộ</button>
                <button type="button" onClick={() => setAssignmentType('PARTNER')} className={`h-9 rounded-lg border text-[12px] font-black ${assignmentType === 'PARTNER' ? 'border-primary bg-blue-50 text-primary' : 'border-border bg-white text-muted-foreground'}`}>Đối tác</button>
              </div>
              {assignmentType === 'INTERNAL' ? (
                <div className="grid gap-2">
                  <select value={driverId} onChange={(event) => { const value = event.target.value; setDriverId(value); const driver = resources.drivers.find((item) => String(item.id) === value); if (driver) setDriverName(String(driver.name || driver.username || '')); }} className="h-10 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                    <option value="">Chọn tài xế</option>
                    {resources.drivers.map((driver) => <option key={String(driver.id)} value={String(driver.id)}>{driver.name || driver.username}{driver.phone ? ` · ${driver.phone}` : ''}</option>)}
                  </select>
                  <select value={truckId} onChange={(event) => { const value = event.target.value; setTruckId(value); const truck = resources.trucks.find((item) => String(item.id) === value); if (truck?.driver_id) setDriverId(String(truck.driver_id)); if (truck?.driver_name) setDriverName(truck.driver_name); if (truck) setLicensePlate(String(truck.bks || truck.license_plate || '')); }} className="h-10 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                    <option value="">Không chọn xe</option>
                    {resources.trucks.map((truck) => <option key={String(truck.id)} value={String(truck.id)}>{truck.bks || truck.license_plate}{truck.driver_name ? ` · ${truck.driver_name}` : ''}</option>)}
                  </select>
                </div>
              ) : (
                <select value={vendorId} onChange={(event) => setVendorId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none">
                  <option value="">Chọn đối tác giao hàng</option>
                  {resources.vendors.map((vendor) => <option key={String(vendor.id)} value={String(vendor.id)}>{vendor.name || vendor.code}{vendor.phone ? ` · ${vendor.phone}` : ''}</option>)}
                </select>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Tài xế
                  <input value={driverName} onChange={(event) => setDriverName(event.target.value)} maxLength={255} placeholder="Nhập tên tài xế" className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-foreground outline-none" />
                </label>
                <label className="text-[11px] font-bold text-muted-foreground">
                  Biển kiểm soát <span className="font-medium">(không bắt buộc)</span>
                  <input value={licensePlate} onChange={(event) => setLicensePlate(event.target.value.toUpperCase())} maxLength={32} placeholder="VD: 51H-123.45" className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold uppercase text-foreground outline-none" />
                </label>
              </div>
              <label className="block text-[11px] font-bold text-muted-foreground">
                Cước giao chặng cuối
                <input inputMode="numeric" value={deliveryCost} onChange={(event) => setDeliveryCost(formatAmountInput(event.target.value))} placeholder="Có thể để trống và nhập sau khi đối soát" className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-right text-[13px] font-extrabold text-foreground outline-none" />
              </label>
            </div>
          )}
          {currentStatus === 'OUT_FOR_DELIVERY' && (
            <div className="rounded-xl border border-border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-foreground">Ảnh giao hàng</p>
                <span className="text-[11px] font-bold">{photos.length}/4 ảnh</span>
              </div>
              {photos.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {photos.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-white">
                      <img src={url} alt={`Ảnh giao hàng ${index + 1}`} className="h-full w-full object-cover" />
                      <button type="button" title="Bỏ ảnh" onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} disabled={isSubmitting || isUploading} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-white/95 text-red-600 shadow">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 4 && (
                <label className="mt-2 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-white px-3 font-bold text-primary hover:bg-primary/5">
                  {isUploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                  {isUploading ? 'Đang tải ảnh...' : 'Thêm ảnh'}
                  <input type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple disabled={isSubmitting || isUploading} onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ''; }} className="sr-only" />
                </label>
              )}
            </div>
          )}
          {currentStatus === 'OUT_FOR_DELIVERY' && (
            <label className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-900">
              Lý do nếu giao không thành công
              <textarea value={failureReason} onChange={(event) => setFailureReason(event.target.value)} maxLength={500} className="mt-2 min-h-20 w-full rounded-lg border border-amber-200 bg-white p-2 text-[13px] font-medium text-foreground outline-none" placeholder="Ví dụ: Không liên lạc được, khách hẹn lại, sai địa chỉ..." />
            </label>
          )}
          <div className="grid gap-2">
            {nextStatuses.map(status => (
              <button
                key={status}
                onClick={() => submitStatus(status)}
                disabled={isSubmitting || isUploading}
                className="flex h-10 items-center justify-between rounded-xl border border-border px-3 text-left text-[13px] font-black text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <span>{labels[status]}</span>
                <span className="text-[11px] text-muted-foreground">{status}</span>
              </button>
            ))}
          </div>
          {uploadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{uploadError}</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} disabled={isSubmitting} className="h-9 rounded-lg border border-border px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">Hủy</button>
          {isSubmitting && <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-black text-white"><Loader2 size={15} className="animate-spin" />Đang cập nhật</span>}
        </div>
      </div>
    </div>
  );
}
