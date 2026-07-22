export const ExpenseCategory = {
  HCM_WAREHOUSE: 'HCM_WAREHOUSE',
  WAREHOUSE: 'WAREHOUSE',
  EN_ROUTE_DROP: 'EN_ROUTE_DROP',
  FUEL: 'FUEL',
  TOLL: 'TOLL',
  LOADING_UNLOADING: 'LOADING_UNLOADING',
  PARKING: 'PARKING',
  REPAIR: 'REPAIR',
  DRIVER_ALLOWANCE: 'DRIVER_ALLOWANCE',
  OTHER: 'OTHER',
} as const;

export type ExpenseCategoryValue = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
