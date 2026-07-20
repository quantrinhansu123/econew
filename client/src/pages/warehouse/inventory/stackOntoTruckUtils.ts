import type { WaybillInventoryItem } from './types';

export interface StackOntoTruckFormRow {
  waybill_id: string;
  waybill_code: string;
  package_count: string;
  max_package_count: number;
  loading_position: string;
  expected_arrival_label: string;
  delivery_instruction: string;
}

export interface StackOntoTruckSharedFields {
  truck_id: string;
  nha_xe: string;
  vendor_id: string;
  vendor_cost: string;
  driver_name: string;
  driver_phone: string;
}

export interface StackOntoTruckPayloadItem {
  waybill_id: string;
  truck_id: string;
  loading_position?: number;
  package_count: number;
  note: string;
}

export interface StackOntoTruckPayload {
  vendor_id?: string;
  vendor_cost?: number;
  driver_name?: string;
  driver_phone?: string;
  items: StackOntoTruckPayloadItem[];
}

export const DELIVERY_INSTRUCTION_OPTIONS = ['Lái xe giao tận nơi', 'Về chành'] as const;

const cleanHubPart = (value?: string | null) => String(value || '').trim();

export function resolveDestinationHubLabel(waybill?: WaybillInventoryItem | null): string {
  const code = cleanHubPart(waybill?.dest_hub?.code);
  const name = cleanHubPart(waybill?.dest_hub?.name);
  if (code && name && code.toLocaleLowerCase('vi') !== name.toLocaleLowerCase('vi')) {
    return `${code} · ${name}`;
  }
  return code || name || (waybill?.dest_hub_id ? `#${waybill.dest_hub_id}` : 'HUB đến');
}

export function buildDestinationInstruction(waybill?: WaybillInventoryItem | null): string {
  return `Kho ${resolveDestinationHubLabel(waybill)}`;
}

export function computeExpectedArrivalDate(base?: string | Date | null): Date {
  const date = base ? new Date(base) : new Date();
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + 3 * 86400000);
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 3);
  return next;
}

export function formatExpectedArrivalLabel(base?: string | Date | null): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(computeExpectedArrivalDate(base));
}

export function buildStackFormRows(waybills: WaybillInventoryItem[], loadingDate: Date = new Date()): StackOntoTruckFormRow[] {
  return waybills.map((waybill) => {
    return {
      waybill_id: String(waybill.id),
      waybill_code: waybill.waybill_code || waybill.code || `#${waybill.id}`,
      package_count: String(Math.max(1, Number(waybill.remaining_packages ?? waybill.package_count ?? 1))),
      max_package_count: Math.max(1, Number(waybill.remaining_packages ?? waybill.package_count ?? 1)),
      loading_position: waybill.loading_position ? String(waybill.loading_position) : '',
      expected_arrival_label: formatExpectedArrivalLabel(loadingDate),
      delivery_instruction: buildDestinationInstruction(waybill),
    };
  });
}

export function buildInitialSharedFields(waybills: WaybillInventoryItem[]): StackOntoTruckSharedFields {
  const preset = waybills.find((waybill) => waybill.truck_id);
  return {
    truck_id: preset?.truck_id ? String(preset.truck_id) : '',
    nha_xe: preset?.trip_nha_xe || '',
    vendor_id: '',
    vendor_cost: '',
    driver_name: '',
    driver_phone: '',
  };
}

export function buildStackOntoTruckPayload(
  rows: StackOntoTruckFormRow[],
  shared: StackOntoTruckSharedFields,
  parsedVendorCost?: number,
): StackOntoTruckPayload {
  const vendorId = shared.vendor_id.trim();
  const driverName = shared.driver_name.trim();
  const driverPhone = shared.driver_phone.trim();
  const hasVendorCost = shared.vendor_cost.trim() !== ''
    && parsedVendorCost != null
    && Number.isFinite(parsedVendorCost)
    && parsedVendorCost >= 0;

  return {
    ...(vendorId ? { vendor_id: vendorId } : {}),
    ...(hasVendorCost ? { vendor_cost: parsedVendorCost } : {}),
    ...(driverName ? { driver_name: driverName } : {}),
    ...(driverPhone ? { driver_phone: driverPhone } : {}),
    items: rows.map((row) => ({
      waybill_id: row.waybill_id,
      truck_id: shared.truck_id,
      ...(row.loading_position ? { loading_position: Number(row.loading_position) } : {}),
      package_count: Number(row.package_count),
      note: row.delivery_instruction,
    })),
  };
}

