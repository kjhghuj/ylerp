/** Query numbers must be complete decimal strings; arrays and objects are rejected. */
export function parseQueryInteger(
  value: unknown, fallback: number, minimum: number, maximum: number,
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function parsePagination(query: Record<string, unknown>, maximumPage = 100_000) {
  const page = parseQueryInteger(query.page, 1, 1, maximumPage);
  const limit = parseQueryInteger(query.limit, 20, 1, 50);
  return page === null || limit === null ? null : { page, limit, skip: (page - 1) * limit };
}
