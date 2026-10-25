import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Truck, X } from 'lucide-react';
import type { DeliveryRouteOption } from '../../../../hooks/useDeliveryRoutes';
import { formatAmountInput, formatAmountInputFromNumber, parseAmountInput } from '../../../../lib/formatMoney';
import { isDeliveryPlanningState, localDeliveryDateTime, withDeliveryDispatch } from '../deliveryDispatch';
import type { DeliveryDispatchInput, DeliveryResources, LastMileWaybill } from '../types';
import { useDeliveryDialogFocus } from './useDeliveryDialogFocus';

interface Props {
  waybill: LastMileWaybill;
  resources: DeliveryResources;
  routes: DeliveryRouteOption[];
  loading: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: DeliveryDispatchInput) => void;
}

const control = 'mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50';

export default function DeliveryDispatchDialog({ waybill, resources, routes, loading, busy, error, onClose, onSave }: Props) {
  const panel = useDeliveryDialogFocus(true, onClose, busy);
  const planning = isDeliveryPlanningState(waybill.current_state);
  const initial = withDeliveryDispatch(waybill);
  const useExisting = Boolean(waybill.delivery_dispatch) || !planning;
  const [assignmentType, setAssignmentType] = useState<DeliveryDispatchInput['assignment_type']>(useExisting && ['PARTNER', 'TECHNOLOGY'].includes(initial.delivery_assignment_type || '') ? initial.delivery_assignment_type as 'PARTNER' | 'TECHNOLOGY' : 'INTERNAL');
  const [routeCode, setRouteCode] = useState(initial.route_code || '');
  const [driverId, setDriverId] = useState(useExisting ? String(initial.last_mile_driver_id || '') : '');
  const [truckId, setTruckId] = useState(useExisting ? String(initial.last_mile_truck_id || '') : '');
  const [vendorId, setVendorId] = useState(useExisting ? String(initial.last_mile_vendor_id || '') : '');
  const [driverName, setDriverName] = useState(useExisting ? initial.last_mile_driver_name || initial.last_mile_driver?.name || '' : '');
  const [plate, setPlate] = useState(useExisting ? initial.last_mile_license_plate || initial.last_mile_truck?.bks || initial.last_mile_truck?.license_plate || '' : '');
  const [cost, setCost] = useState(formatAmountInputFromNumber(useExisting ? initial.last_mile_cost_amount : 0));
  const [scheduledAt, setScheduledAt] = useState(localDeliveryDateTime(waybill.delivery_dispatch?.scheduled_at));
  const [note, setNote] = useState(waybill.delivery_dispatch?.note || '');
  const [validation, setValidation] = useState('');
  const title = planning ? 'Kế hoạch điều phối' : 'Chỉnh sửa điều phối';
  const save = () => {
    if (assignmentType === 'INTERNAL' && !driverName.trim() && !driverId) return setValidation('Nhập hoặc chọn tài xế nội bộ.');
    if (assignmentType === 'PARTNER' && !vendorId) return setValidation('Chọn đối tác giao hàng.');
    if (assignmentType === 'TECHNOLOGY' && !vendorId && !driverName.trim()) return setValidation('Chọn hoặc nhập đơn vị xe công nghệ.');
    setValidation('');
    onSave({ assignment_type: assignmentType, route_code: routeCode,
      ...(assignmentType === 'INTERNAL' ? { driver_id: driverId || undefined, truck_id: truckId || undefined } : { vendor_id: vendorId || undefined }),
      driver_name: driverName.trim(), license_plate: plate.trim().toUpperCase(), delivery_cost: parseAmountInput(cost), note: note.trim(),
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined, expected_version: waybill.delivery_dispatch?.version ?? 0 });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delivery-dispatch-title" className="dialog-slide-in relative flex h-dvh w-full max-w-[560px] flex-col border-l border-border bg-slate-50 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-white p-5">
          <div><h2 id="delivery-dispatch-title" className="text-lg font-extrabold text-foreground">{title}</h2><p className="mt-1 text-[12px] text-muted-foreground">{waybill.waybill_code}{waybill.trip_id ? ` · Chuyến #${waybill.trip_id}` : ''}</p></div>
          <button type="button" aria-label="Đóng điều phối" disabled={busy} onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"><X size={20} /></button>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[12px] font-medium leading-relaxed text-blue-800">{planning ? 'Chỉ lưu kế hoạch. Hàng vẫn giữ trạng thái hiện tại; khi hàng đến HUB và sẵn sàng mới xác nhận bàn giao.' : 'Sửa tuyến, xe, tài xế hoặc chi phí. Trạng thái giao hàng và chứng từ đã lưu được giữ nguyên.'}</p>
          <fieldset disabled={busy} className="space-y-4 text-[12px] font-bold text-slate-700">
            <label className="block">Tuyến giao<select aria-label="Tuyến giao" value={routeCode} onChange={event => setRouteCode(event.target.value)} className={control}><option value="">Không chọn tuyến</option>{routeCode && !routes.some(route => route.code === routeCode) && <option value={routeCode}>{routeCode} · Tuyến đã lưu</option>}{routes.map(route => <option key={String(route.id)} value={route.code}>{route.code} · {route.name}</option>)}</select></label>
            <label className="block">Hình thức giao<select aria-label="Hình thức giao" value={assignmentType} onChange={event => setAssignmentType(event.target.value as DeliveryDispatchInput['assignment_type'])} className={control}><option value="INTERNAL">Xe nội bộ</option><option value="PARTNER">Xe đối tác</option><option value="TECHNOLOGY">Xe công nghệ</option></select></label>
            {assignmentType === 'INTERNAL' ? <>
              <label className="block">Tài xế nội bộ<select aria-label="Tài xế nội bộ" value={driverId} disabled={loading} onChange={event => { const id = event.target.value; setDriverId(id); const driver = resources.drivers.find(item => String(item.id) === id); if (driver) setDriverName(driver.name || driver.username || ''); }} className={control}><option value="">Nhập tài xế bên dưới</option>{driverId && !resources.drivers.some(driver => String(driver.id) === driverId) && <option value={driverId}>{driverName || `Tài xế #${driverId}`} · Đã lưu</option>}{resources.drivers.map(driver => <option key={String(driver.id)} value={String(driver.id)}>{driver.name || driver.username}</option>)}</select></label>
              <label className="block">Xe nội bộ<select aria-label="Xe nội bộ" value={truckId} disabled={loading} onChange={event => { const id = event.target.value; setTruckId(id); const truck = resources.trucks.find(item => String(item.id) === id); if (truck) { setPlate(truck.bks || truck.license_plate || ''); if (truck.driver_id) setDriverId(String(truck.driver_id)); if (truck.driver_name) setDriverName(truck.driver_name); } }} className={control}><option value="">Không chọn xe</option>{truckId && !resources.trucks.some(truck => String(truck.id) === truckId) && <option value={truckId}>{plate || `Xe #${truckId}`} · Đã lưu</option>}{resources.trucks.map(truck => <option key={String(truck.id)} value={String(truck.id)}>{truck.bks || truck.license_plate}{['IN_TRIP', 'IN_USE'].includes(truck.status || '') ? ' · Xe đang chạy' : ''}</option>)}</select></label>
            </> : <label className="block">Đối tác / đơn vị giao<select aria-label="Đối tác / đơn vị giao" value={vendorId} disabled={loading} onChange={event => setVendorId(event.target.value)} className={control}><option value="">{assignmentType === 'PARTNER' ? 'Chọn đối tác' : 'Nhập đơn vị bên dưới'}</option>{vendorId && !resources.vendors.some(vendor => String(vendor.id) === vendorId) && <option value={vendorId}>{initial.last_mile_vendor?.name || `Đối tác #${vendorId}`} · Đã lưu</option>}{resources.vendors.map(vendor => <option key={String(vendor.id)} value={String(vendor.id)}>{vendor.name || vendor.code}</option>)}</select></label>}
            <label className="block">{assignmentType === 'TECHNOLOGY' ? 'Ứng dụng / tài xế' : 'Tên tài xế'}<input value={driverName} onChange={event => setDriverName(event.target.value)} maxLength={255} className={control} /></label>
            <label className="block">Biển kiểm soát<input value={plate} onChange={event => setPlate(event.target.value.toUpperCase())} maxLength={32} className={control} /></label>
            <label className="block">{planning ? 'Chi phí giao dự kiến (VNĐ)' : 'Chi phí giao (VNĐ)'}<input type="text" inputMode="numeric" value={cost} onChange={event => setCost(formatAmountInput(event.target.value))} className={`${control} text-right`} /></label>
            <label className="block">Ngày giờ giao dự kiến<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className={control} /></label>
            <label className="block">Ghi chú điều phối<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} className={`${control} h-24 resize-none py-2`} /></label>
          </fieldset>
          {(validation || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-700">{validation || error}</p>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white p-5">
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold disabled:opacity-50">Đóng</button>
          <button type="button" disabled={busy || loading} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}{busy ? 'Đang lưu...' : planning ? 'Lưu kế hoạch' : 'Lưu điều phối'}</button>
        </footer>
      </section>
    </div>, document.body,
  );
}
