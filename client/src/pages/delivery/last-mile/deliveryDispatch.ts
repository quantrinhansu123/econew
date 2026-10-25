import type { LastMileWaybill } from './types';

export const isDeliveryPlanningState = (state: string) => ['IN_TRANSIT', 'AT_DEST_HUB'].includes(state.toUpperCase());

export function withDeliveryDispatch(waybill: LastMileWaybill): LastMileWaybill {
  const value = waybill.delivery_dispatch;
  if (!value) return waybill;
  return { ...waybill, delivery_assignment_type: value.assignment_type, route_code: value.route_code,
    last_mile_driver_id: value.driver_id, last_mile_driver_name: value.driver_name,
    last_mile_truck_id: value.truck_id, last_mile_license_plate: value.license_plate,
    last_mile_vendor_id: value.vendor_id, last_mile_cost_amount: value.delivery_cost,
    last_mile_driver: value.driver_id ? { id: value.driver_id, username: '', name: value.driver_name, role_mask: 4 } : null,
    last_mile_vendor: value.vendor_id ? { id: value.vendor_id, name: value.vendor_name } : null,
    last_mile_truck: value.truck_id ? { id: value.truck_id, license_plate: value.license_plate } : null };
}

export function localDeliveryDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
