import type { FilterOption, Truck, TruckKanbanColumn } from './types';

/** Phân loại vận hành xe — lưu vào cột trucks.loai_xe */
export const LOAI_XE_CATEGORY_OPTIONS = ['Nội bộ', 'Đường trục', 'Đối tác'] as const;

export type LoaiXeCategory = (typeof LOAI_XE_CATEGORY_OPTIONS)[number];

export function getLoaiXeCategoryOptions(): FilterOption[] {
  return LOAI_XE_CATEGORY_OPTIONS.map((value) => ({ value, label: value }));
}

export const DEFAULT_KHU_VUC_OPTIONS = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Bình Dương', 'Đồng Nai'];

export const UNASSIGNED_KHU_VUC_KEY = '__unassigned__';
export const UNASSIGNED_KHU_VUC_LABEL = 'Chưa phân khu vực';

export const KANBAN_FETCH_LIMIT = 100;

const columnAccent = [
  'border-t-blue-500 bg-blue-50/50',
  'border-t-emerald-500 bg-emerald-50/50',
  'border-t-violet-500 bg-violet-50/50',
  'border-t-amber-500 bg-amber-50/50',
  'border-t-rose-500 bg-rose-50/50',
  'border-t-cyan-500 bg-cyan-50/50',
];

export function getKanbanColumnAccent(index: number): string {
  return columnAccent[index % columnAccent.length];
}

export function khuVucKeyFromTruck(truck: Truck): string {
  return truck.khu_vuc?.trim() || UNASSIGNED_KHU_VUC_KEY;
}

export function khuVucLabelFromKey(key: string): string {
  return key === UNASSIGNED_KHU_VUC_KEY ? UNASSIGNED_KHU_VUC_LABEL : key;
}

export function khuVucValueFromColumnId(columnId: string): string {
  return columnId === UNASSIGNED_KHU_VUC_KEY ? '' : columnId;
}

function sortColumnKeys(keys: string[]): string[] {
  return keys.sort((a, b) => {
    if (a === UNASSIGNED_KHU_VUC_KEY) return 1;
    if (b === UNASSIGNED_KHU_VUC_KEY) return -1;
    const ai = DEFAULT_KHU_VUC_OPTIONS.indexOf(a);
    const bi = DEFAULT_KHU_VUC_OPTIONS.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b, 'vi');
  });
}

export function groupTrucksByKhuVuc(trucks: Truck[]): TruckKanbanColumn[] {
  const grouped = new Map<string, Truck[]>();

  for (const region of DEFAULT_KHU_VUC_OPTIONS) {
    grouped.set(region, []);
  }
  grouped.set(UNASSIGNED_KHU_VUC_KEY, []);

  for (const truck of trucks) {
    const key = khuVucKeyFromTruck(truck);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(truck);
  }

  return sortColumnKeys(Array.from(grouped.keys())).map((id) => ({
    id,
    label: khuVucLabelFromKey(id),
    trucks: grouped.get(id) ?? [],
  }));
}

export function buildKhuVucSuggestions(trucks: Truck[]): string[] {
  const fromDb = trucks.map((t) => t.khu_vuc?.trim()).filter(Boolean) as string[];
  return [...DEFAULT_KHU_VUC_OPTIONS, ...fromDb];
}
