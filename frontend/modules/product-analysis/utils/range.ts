/** 区间选择工具：快捷区间以店铺最新上传日为锚点（数据可能停在几天前，锚真实今天会空转） */

export type RangePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function addDays(date: string, delta: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

/** 近 N 天（含锚点当天）：to = 锚点，from = to - (N-1) */
export function resolveQuickRange(latestDate: string, days: 7 | 30 | 90): DateRange {
  return { from: addDays(latestDate, -(days - 1)), to: latestDate };
}

export function presetToDays(preset: RangePreset): 7 | 30 | 90 | null {
  if (preset === '7d') return 7;
  if (preset === '30d') return 30;
  if (preset === '90d') return 90;
  return null;
}

/** 今天的 ISO 日期（本地时区） */
export function todayString(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** 默认上传日期：今天（≤ 锚点不强制，允许补传历史） */
export function defaultUploadDate(): string {
  return todayString();
}
