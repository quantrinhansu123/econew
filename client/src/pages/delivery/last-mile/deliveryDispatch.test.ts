import { describe, expect, it } from 'vitest';
import { isDeliveryPlanningState, withDeliveryDispatch } from './deliveryDispatch';
import type { DeliveryDispatchSnapshot, LastMileWaybill } from './types';
import { resolveDeliveryProcessingStatus } from './deliveryProcessingStatus';

describe('delivery dispatch plan', () => {
  it('only treats pre-handover states as planning', () => {
    expect(isDeliveryPlanningState('IN_TRANSIT')).toBe(true);
    expect(isDeliveryPlanningState('AT_DEST_HUB')).toBe(true);
    expect(isDeliveryPlanningState('OUT_FOR_DELIVERY')).toBe(false);
    expect(isDeliveryPlanningState('DELIVERED')).toBe(false);
  });
  it('loads the exact saved plan for handover without changing status or proof', () => {
    const waybill = { current_state: 'AT_DEST_HUB', delivery_photo_url: 'proof.jpg', last_mile_vendor: { id: 'old', name: 'Old vendor' },
      delivery_dispatch: { kind: 'PLAN', assignment_type: 'INTERNAL', route_code: 'R1', driver_id: 'd1', driver_name: 'Anh Nam', truck_id: 't1', license_plate: '51H-12345', vendor_id: null, delivery_cost: 120000, version: 3 } as DeliveryDispatchSnapshot } as LastMileWaybill;
    expect(withDeliveryDispatch(waybill)).toMatchObject({ current_state: 'AT_DEST_HUB', delivery_photo_url: 'proof.jpg', route_code: 'R1',
      last_mile_driver_id: 'd1', last_mile_driver_name: 'Anh Nam', last_mile_truck_id: 't1', last_mile_vendor: null, last_mile_cost_amount: 120000 });
    expect(waybill.last_mile_vendor?.id).toBe('old');
  });
  it('keeps a hold visible even after planning', () => {
    const status = resolveDeliveryProcessingStatus({ current_state: 'IN_TRANSIT', delivery_preparation_status: 'HOLD', delivery_hold_reason: 'Khách hẹn gọi lại',
      delivery_dispatch: { kind: 'PLAN', assignment_type: 'INTERNAL', route_code: 'R1', driver_name: 'Anh Nam', license_plate: '51H', vendor_name: null, scheduled_at: null, note: 'Gọi trước 15 phút' } });
    expect(status.title).toBe('Kế hoạch · chờ xử lý');
    expect(status.detail).toContain('Khách hẹn gọi lại');
    expect(status.note).toBe('Gọi trước 15 phút');
    expect(status.tone).toBe('amber');
  });
});
