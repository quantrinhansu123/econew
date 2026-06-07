export const SPLIT_LOAD_STATUSES = [
  { value: 'WAITING_LOAD', label: 'Chờ bốc', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'LOADED', label: 'Đã bốc', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'DEPARTED', label: 'Đã khởi hành', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'IN_TRANSIT', label: 'Đang vận chuyển', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'ARRIVED', label: 'Đã tới', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
] as const;

export type SplitLoadStatus = typeof SPLIT_LOAD_STATUSES[number]['value'];

export const splitLoadStatusLabel = (value?: string | null) =>
  SPLIT_LOAD_STATUSES.find((item) => item.value === value)?.label ?? 'Chờ bốc';

export const splitLoadStatusClass = (value?: string | null) =>
  SPLIT_LOAD_STATUSES.find((item) => item.value === value)?.className ?? SPLIT_LOAD_STATUSES[0].className;
