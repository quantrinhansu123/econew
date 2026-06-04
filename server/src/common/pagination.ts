export const MAX_PAGINATION_LIMIT = 100;

export function clampPaginationLimit(limit: number | undefined, defaultLimit: number) {
  return Math.min(limit ?? defaultLimit, MAX_PAGINATION_LIMIT);
}

export function normalizePaginationLimit({ value }: { value: unknown }) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(limit, MAX_PAGINATION_LIMIT) : value;
}
