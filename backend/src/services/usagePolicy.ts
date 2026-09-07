export const USAGE_VERSION = 'usage-v2';
const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export const shanghaiDay = (date: Date) => new Date(date.getTime() + OFFSET).toISOString().slice(0, 10);

export interface UsageFilter {
  startAt: Date; endAt: Date; asOf: Date; startDate: string; endDate: string; dates: string[];
  userId?: string; module?: string; status?: string;
}
function dateValue(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} 必须为 YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(parsed.getTime()) || shanghaiDay(parsed) !== value) throw new Error(`${name} 无效`);
  return value;
}
export function parseUsageFilter(query: Record<string, unknown>, now = new Date()): UsageFilter {
  if (query.days !== undefined && (typeof query.days !== 'string' || !/^\d+$/.test(query.days))) throw new Error('days 必须为整数');
  const days = query.days === undefined ? 30 : Number(query.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('days 必须为 1 至 365 的整数');
  const today = shanghaiDay(now);
  const requestedEnd = dateValue(query.endDate, 'endDate') || today;
  const endDate = requestedEnd > today ? today : requestedEnd;
  const startDate = dateValue(query.startDate, 'startDate') || shanghaiDay(new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() - (days - 1) * DAY));
  const startAt = new Date(`${startDate}T00:00:00+08:00`);
  const endExclusive = new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() + DAY);
  if (startDate > endDate || startDate > today || (endExclusive.getTime() - startAt.getTime()) / DAY > 365) throw new Error('日期范围无效或超过 365 天');
  const endAt = new Date(Math.min(endExclusive.getTime(), now.getTime()));
  const dates: string[] = [];
  for (let t = startAt.getTime(); t < endAt.getTime(); t += DAY) dates.push(shanghaiDay(new Date(t)));
  const result: UsageFilter = { startAt, endAt, startDate, endDate: endDate > today ? today : endDate, asOf: now, dates };
  for (const key of ['userId', 'module', 'status'] as const) {
    const value = query[key];
    if (value !== undefined && value !== '') {
      if (typeof value !== 'string' || value.length > 100) throw new Error(`${key} 无效`);
      result[key] = value;
    }
  }
  if (result.status && !['pending', 'success', 'failed', 'unknown'].includes(result.status)) throw new Error('status 无效');
  return result;
}
type PermissionUser = { role: string; isActive: boolean; permissions: string[] };
function permitted(user: PermissionUser | null, action: string) {
  return !!user?.isActive && (user.role === 'owner' || (user.role === 'admin' && ['*', 'usage-stats', `usage-stats.${action}`].some(p => user.permissions.includes(p))));
}
export const canViewUsage = (user: PermissionUser | null) => permitted(user, 'view');
export const canExportUsage = (user: PermissionUser | null) => canViewUsage(user) && permitted(user, 'export');
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
