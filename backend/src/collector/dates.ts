/** 时区与“昨天”日期计算。每个站点使用自己的 IANA 时区。 */
import path from "node:path";

/** 将某个时刻映射到指定时区的 YYYY-MM-DD */
export function dateInTz(tsMs: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(tsMs)); // en-CA => YYYY-MM-DD
}

/** 指定时区的“昨天”（相对真实当前时间），保证不采集未完成的今天 */
export function yesterdayInTz(timeZone: string, nowMs: number = Date.now()): string {
  return dateInTz(nowMs - 24 * 3600 * 1000, timeZone);
}

/** 校验 YYYY-MM-DD 格式 */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 日期加 n 天（按 UTC 历法，用于逐日拆分） */
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 闭区间日期序列（安全上限 1000 天，批次/补采入口另限制为 366 天） */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 站点时区下，今天 0 点对应的时刻（用于判断某日期是否为“今天或未来”） */
export function isDateTodayOrFuture(date: string, timeZone: string, nowMs: number = Date.now()): boolean {
  return date >= dateInTz(nowMs, timeZone);
}

/** 数据目录内的相对路径规范化，防路径穿越 */
export function safeJoin(baseDir: string, name: string): string {
  const cleaned = path.basename(name).replace(/[^\w.\-]/g, "_");
  return path.join(baseDir, cleaned);
}

// ---------- 定时调度：计划时区时刻计算（不依赖服务器系统时区） ----------

function tzParts(tsMs: number, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(tsMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { y: parts.year, mo: parts.month, d: parts.day, h: parts.hour % 24, mi: parts.minute };
}

/** 指定时区的某日某时刻 → UTC 时间戳（两次逼近，兼容夏令时偏移变化） */
export function tzTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  let ts = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = tzParts(ts, timeZone);
    ts += Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return ts;
}

/** 校验 HH:MM 格式 */
export function parseHhmm(s: string): { h: number; mi: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

/** ≤now 的最近一次计划时刻（用于判断是否已触发/错过） */
export function latestPlannedAtOrBefore(hhmm: string, timeZone: string, nowMs: number): number {
  const t = parseHhmm(hhmm);
  if (!t) throw new Error(`非法执行时间: ${hhmm}`);
  const p = tzParts(nowMs, timeZone);
  const today = tzTimeToUtc(p.y, p.mo, p.d, t.h, t.mi, timeZone);
  if (today <= nowMs) return today;
  // 今天未到点 → 昨天该时刻
  const yts = tzTimeToUtc(p.y, p.mo, p.d, 0, 0, timeZone) - 12 * 3600 * 1000; // 昨天0点附近（时区安全）
  const yp = tzParts(yts, timeZone);
  return tzTimeToUtc(yp.y, yp.mo, yp.d, t.h, t.mi, timeZone);
}

/** >now 的下一次计划时刻（用于展示“下次执行”） */
export function nextPlannedAtAfter(hhmm: string, timeZone: string, nowMs: number): number {
  const t = parseHhmm(hhmm);
  if (!t) throw new Error(`非法执行时间: ${hhmm}`);
  const p = tzParts(nowMs, timeZone);
  const today = tzTimeToUtc(p.y, p.mo, p.d, t.h, t.mi, timeZone);
  if (today > nowMs) return today;
  const tmr = tzTimeToUtc(p.y, p.mo, p.d, 12, 0, timeZone) + 12 * 3600 * 1000; // 明天中午附近（时区安全）
  const tp = tzParts(tmr, timeZone);
  return tzTimeToUtc(tp.y, tp.mo, tp.d, t.h, t.mi, timeZone);
}

/** 校验 IANA 时区是否有效 */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
