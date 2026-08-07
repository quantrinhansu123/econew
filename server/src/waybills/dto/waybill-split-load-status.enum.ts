export enum WaybillSplitLoadStatus {
  WAITING_LOAD = 'WAITING_LOAD',
  LOADED = 'LOADED',
  DEPARTED = 'DEPARTED',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export const WAYBILL_SPLIT_LOAD_STATUS_LABELS: Record<WaybillSplitLoadStatus, string> = {
  [WaybillSplitLoadStatus.WAITING_LOAD]: 'Chờ bốc',
  [WaybillSplitLoadStatus.LOADED]: 'Đã bốc',
  [WaybillSplitLoadStatus.DEPARTED]: 'Đã khởi hành',
  [WaybillSplitLoadStatus.IN_TRANSIT]: 'Đang vận chuyển',
  [WaybillSplitLoadStatus.ARRIVED]: 'Tới hub đích',
  [WaybillSplitLoadStatus.OUT_FOR_DELIVERY]: 'Đang giao',
  [WaybillSplitLoadStatus.DELIVERED]: 'Đã giao',
  [WaybillSplitLoadStatus.RETURNED]: 'Hoàn hàng',
};

const SPLIT_LOAD_STATUS_TRANSITIONS: Partial<Record<WaybillSplitLoadStatus, WaybillSplitLoadStatus[]>> = {
  [WaybillSplitLoadStatus.WAITING_LOAD]: [WaybillSplitLoadStatus.LOADED],
  [WaybillSplitLoadStatus.LOADED]: [WaybillSplitLoadStatus.DEPARTED],
  [WaybillSplitLoadStatus.DEPARTED]: [WaybillSplitLoadStatus.IN_TRANSIT],
  [WaybillSplitLoadStatus.IN_TRANSIT]: [WaybillSplitLoadStatus.OUT_FOR_DELIVERY, WaybillSplitLoadStatus.DELIVERED],
  [WaybillSplitLoadStatus.ARRIVED]: [WaybillSplitLoadStatus.OUT_FOR_DELIVERY, WaybillSplitLoadStatus.DELIVERED],
  [WaybillSplitLoadStatus.OUT_FOR_DELIVERY]: [WaybillSplitLoadStatus.DELIVERED, WaybillSplitLoadStatus.RETURNED],
  [WaybillSplitLoadStatus.DELIVERED]: [],
  [WaybillSplitLoadStatus.RETURNED]: [],
};

export function assertSplitLoadStatusTransition(
  current: WaybillSplitLoadStatus,
  next: WaybillSplitLoadStatus,
) {
  const allowed = SPLIT_LOAD_STATUS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`INVALID_SPLIT_LOAD_STATUS_TRANSITION:${current}->${next}`);
  }
}
