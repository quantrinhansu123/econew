export enum WaybillSplitLoadStatus {
  WAITING_LOAD = 'WAITING_LOAD',
  LOADED = 'LOADED',
  DEPARTED = 'DEPARTED',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
}

export const WAYBILL_SPLIT_LOAD_STATUS_LABELS: Record<WaybillSplitLoadStatus, string> = {
  [WaybillSplitLoadStatus.WAITING_LOAD]: 'Chờ bốc',
  [WaybillSplitLoadStatus.LOADED]: 'Đã bốc',
  [WaybillSplitLoadStatus.DEPARTED]: 'Đã khởi hành',
  [WaybillSplitLoadStatus.IN_TRANSIT]: 'Đang vận chuyển',
  [WaybillSplitLoadStatus.ARRIVED]: 'Đã tới',
};
