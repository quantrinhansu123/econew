export const ExpenseCategory = {
  HCM_WAREHOUSE: 'HCM_WAREHOUSE',
  EN_ROUTE_DROP: 'EN_ROUTE_DROP',
  FUEL: 'FUEL',
  OTHER: 'OTHER',
} as const;

export type ExpenseCategoryValue = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
