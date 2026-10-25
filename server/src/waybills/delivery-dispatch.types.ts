export interface DeliveryDispatchSnapshot {
  kind: 'PLAN' | 'ASSIGNMENT';
  assignment_type: 'INTERNAL' | 'PARTNER' | 'TECHNOLOGY';
  route_code: string | null;
  driver_id: string | null;
  driver_name: string | null;
  truck_id: string | null;
  license_plate: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  delivery_cost: number;
  scheduled_at: string | null;
  note: string | null;
  version: number;
  updated_at: string;
  updated_by_id: string;
  updated_by_name: string;
}
