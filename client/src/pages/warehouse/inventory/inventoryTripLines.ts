import type { InventoryFilters } from './types';
import type { WaybillInventoryItem } from './types';
import { expandOrderStatusGroups } from './orderStatusUtils';

export const isIncompleteSplitRow = (item: WaybillInventoryItem) => {
  if (item.split_id) return false;
  if (item.remaining_packages != null) return Number(item.remaining_packages) > 0;
  if (item.trip_label?.startsWith('Còn ') || item.trip_label === 'Chưa phân xe') return true;
  const totalPackages = Math.max(1, Number(item.order_total_packages ?? item.package_count ?? 1));
  return Number(item.trip_package_count ?? item.package_count ?? 0) < totalPackages;
};

const compareDescendingIds = (left: WaybillInventoryItem, right: WaybillInventoryItem) => {
  const leftId = String(left.id);
  const rightId = String(right.id);
  if (/^\d+$/.test(leftId) && /^\d+$/.test(rightId) && leftId.length !== rightId.length) {
    return rightId.length - leftId.length;
  }
  return rightId.localeCompare(leftId, 'en', { numeric: true });
};

export const sortAllOrdersByCreatedAt = <T extends WaybillInventoryItem>(items: T[]): T[] =>
  [...items].sort((left, right) => {
    const leftCreatedAt = new Date(left.created_at || 0).getTime();
    const rightCreatedAt = new Date(right.created_at || 0).getTime();
    if (rightCreatedAt !== leftCreatedAt) return rightCreatedAt - leftCreatedAt;
    return compareDescendingIds(left, right);
  });

export function buildInventoryTripLinesQuery(
  filters: Pick<
    InventoryFilters,
    | 'page'
    | 'limit'
    | 'keyword'
    | 'originHubIds'
    | 'destHubIds'
    | 'statuses'
    | 'orderStatusGroups'
    | 'noiDenKeyword'
    | 'billingUnits'
    | 'customerPaymentStatuses'
    | 'paymentTypes'
    | 'priorities'
    | 'receivedFrom'
    | 'receivedTo'
    | 'ma_kh'
  >,
  options?: {
    onlyIncompleteSplit?: boolean;
    listScope?: 'all_orders' | 'all_inventory';
    destHubId?: string | number | null;
  },
) {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.receivedFrom) {
    params.set(options?.listScope === 'all_orders' ? 'sent_from' : 'received_from', filters.receivedFrom);
  }
  if (filters.receivedTo) {
    params.set(options?.listScope === 'all_orders' ? 'sent_to' : 'received_to', filters.receivedTo);
  }
  if (options?.onlyIncompleteSplit) {
    params.set('only_incomplete_split', '1');
  }
  if (options?.listScope) {
    params.set('list_scope', options.listScope);
  }
  const destHubIds = options?.destHubId != null
    ? [String(options.destHubId).trim()].filter(Boolean)
    : filters.destHubIds;
  if (destHubIds.length) params.set('dest_hub_id', destHubIds.join(','));
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.ma_kh?.trim()) params.set('ma_kh', filters.ma_kh.trim());
  const statusFromGroups = expandOrderStatusGroups(filters.orderStatusGroups);
  const statuses = [...new Set([...filters.statuses, ...statusFromGroups])];
  if (statuses.length) params.set('status', statuses.join(','));
  if (filters.customerPaymentStatuses.length) params.set('customer_payment_status', filters.customerPaymentStatuses.join(','));
  if (filters.originHubIds.length) params.set('origin_hub_id', filters.originHubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  if (filters.noiDenKeyword.trim()) params.set('noi_den', filters.noiDenKeyword.trim());
  if (filters.billingUnits.length) params.set('billing_unit', filters.billingUnits.join(','));
  return params.toString();
}

export function filterManifestAddableInventoryRows<T extends WaybillInventoryItem>(
  items: T[],
  options: {
    manifestId: string;
    existingWaybillIds?: Set<string>;
  },
) {
  const existingIds = options.existingWaybillIds ?? new Set<string>();
  const seen = new Set<string>();
  return items.filter((waybill) => {
    const id = String(waybill.id);
    if (!id || seen.has(id)) return false;
    if (waybill.manifest_id && String(waybill.manifest_id) !== options.manifestId) return false;
    if (existingIds.has(id)) {
      const remaining = Number(waybill.remaining_packages ?? 0);
      if (remaining <= 0) return false;
      seen.add(id);
      return true;
    }
    seen.add(id);
    return true;
  });
}
