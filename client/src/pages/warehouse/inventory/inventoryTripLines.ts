import type { InventoryFilters } from './types';
import type { WaybillInventoryItem } from './types';

export const isIncompleteSplitRow = (item: WaybillInventoryItem) => {
  if (item.split_id) return false;
  if (item.remaining_packages != null) return Number(item.remaining_packages) > 0;
  if (item.trip_label?.startsWith('Còn ') || item.trip_label === 'Chưa phân xe') return true;
  const totalPackages = Math.max(1, Number(item.order_total_packages ?? item.package_count ?? 1));
  return Number(item.trip_package_count ?? item.package_count ?? 0) < totalPackages;
};

export function buildInventoryTripLinesQuery(
  filters: Pick<InventoryFilters, 'page' | 'limit' | 'keyword' | 'hubIds' | 'statuses' | 'customerPaymentStatuses' | 'paymentTypes' | 'priorities' | 'receivedFrom' | 'receivedTo' | 'ma_kh'>,
  options?: { onlyIncompleteSplit?: boolean },
) {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.receivedFrom) params.set('received_from', filters.receivedFrom);
  if (filters.receivedTo) params.set('received_to', filters.receivedTo);
  if (options?.onlyIncompleteSplit !== false) {
    params.set('only_incomplete_split', '1');
  }
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.ma_kh?.trim()) params.set('ma_kh', filters.ma_kh.trim());
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.customerPaymentStatuses.length) params.set('customer_payment_status', filters.customerPaymentStatuses.join(','));
  if (filters.hubIds.length) params.set('hub_id', filters.hubIds.join(','));
  if (filters.paymentTypes.length) params.set('payment_type', filters.paymentTypes.join(','));
  if (filters.priorities.length) params.set('priority', filters.priorities.join(','));
  return params.toString();
}

export function filterManifestAddableInventoryRows<T extends WaybillInventoryItem>(
  items: T[],
  options: { manifestId: string; existingWaybillIds?: Set<string> },
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
