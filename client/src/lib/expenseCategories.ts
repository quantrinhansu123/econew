import { ApiError, apiRequest } from './api';

export interface ExpenseCategoryOption {
  id?: string | number;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export const defaultExpenseCategoryNames = [
  'FUEL',
  'TOLL',
  'PARKING',
  'LOADING_UNLOADING',
  'EN_ROUTE_DROP',
  'WAREHOUSE',
  'HCM_WAREHOUSE',
  'REPAIR',
  'DRIVER_ALLOWANCE',
  'OTHER',
];

export async function loadExpenseCategoryNames(): Promise<string[]> {
  try {
    const rows = await apiRequest<ExpenseCategoryOption[]>('/expense-categories');
    const names = rows.filter((row) => row.is_active !== false).map((row) => row.name.trim()).filter(Boolean);
    return [...new Set(names.length ? names : defaultExpenseCategoryNames)];
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const legacy = await apiRequest<string[]>('/expenses/categories');
    return [...new Set(legacy.map((name) => name.trim()).filter(Boolean))];
  }
}
