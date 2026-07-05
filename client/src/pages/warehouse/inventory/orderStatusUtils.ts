import type { BadgeConfig } from './types';
import type { WaybillInventoryItem } from './types';

export type OrderStatusGroup = 'WAREHOUSE' | 'IN_TRANSIT' | 'DELIVERED';

export const ORDER_STATUS_GROUP_OPTIONS = [
  { value: 'WAREHOUSE', label: 'Nhập kho' },
  { value: 'IN_TRANSIT', label: 'Đang vận chuyển' },
  { value: 'DELIVERED', label: 'Phát thành công' },
] as const;

export const ORDER_STATUS_GROUP_TO_STATES: Record<OrderStatusGroup, string[]> = {
  WAREHOUSE: ['RECEIVED', 'IN_WAREHOUSE'],
  IN_TRANSIT: ['MANIFEST_CLOSED', 'LOADED', 'IN_TRANSIT', 'AT_DEST_HUB', 'OUT_FOR_DELIVERY', 'RETURNED'],
  DELIVERED: ['DELIVERED'],
};

export const orderStatusGroupConfig: Record<OrderStatusGroup, BadgeConfig> = {
  WAREHOUSE: { label: 'Nhập kho', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  DELIVERED: { label: 'Phát thành công', className: 'bg-violet-50 text-violet-800 border-violet-200' },
};

export function normalizeWaybillStatus(waybill: WaybillInventoryItem): string {
  return String(waybill.current_state || waybill.status || '').toUpperCase();
}

export function resolveOrderStatusGroup(waybill: WaybillInventoryItem): OrderStatusGroup {
  const status = normalizeWaybillStatus(waybill);
  if (status === 'DELIVERED') return 'DELIVERED';
  if (status === 'RECEIVED' || status === 'IN_WAREHOUSE') return 'WAREHOUSE';
  return 'IN_TRANSIT';
}

export function expandOrderStatusGroups(groups: string[]): string[] {
  const statuses = new Set<string>();
  groups.forEach((group) => {
    const mapped = ORDER_STATUS_GROUP_TO_STATES[group as OrderStatusGroup];
    mapped?.forEach((status) => statuses.add(status));
  });
  return [...statuses];
}
