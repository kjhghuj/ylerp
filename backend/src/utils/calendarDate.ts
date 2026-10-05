const DAY_MS = 86_400_000;

/** Calendar dates must round-trip; Date alone silently normalizes February 31. */
export const isValidCalendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDateUtc(value);
  return Number.isFinite(date.getTime()) && dateString(date) === value;
};

export const parseDateUtc = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
export const dateString = (date: Date): string => date.toISOString().slice(0, 10);
export const addDays = (date: string, days: number): string => {
  const result = parseDateUtc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return dateString(result);
};
/** Difference in whole calendar days; callers add one for inclusive intervals. */
export const diffDays = (from: string, to: string): number =>
  Math.round((parseDateUtc(to).getTime() - parseDateUtc(from).getTime()) / DAY_MS);
