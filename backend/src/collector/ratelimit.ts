/**
 * 持久化导出限速器：
 * - 所有真实导出共用一个最小提交间隔（默认 70s），状态存 SQLite，进程重启后仍有效。
 * - 先预约（book）再提交：同一瞬间多 worker / 多入口不会并发提交。
 * - 平台返回更长等待（Retry-After / 提示语）时可延后 nextAllowedAt（取更严格值）。
 * - 测试注入时钟时只能走显式 clockFn（DEMO/TEST 模式），真实模式使用真实时间。
 */
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "./db";

export class RateLimiter {
  constructor(
    private db: DatabaseSync,
    private minIntervalMs: number,
    private clockFn: () => number = () => Date.now(),
    private bucket = "global",
    private scope: "site" | "global" = "global",
  ) {
    this.db.exec("CREATE TABLE IF NOT EXISTS export_cooldowns (bucket TEXT PRIMARY KEY, next_allowed_at TEXT NOT NULL, last_submit_at TEXT, min_interval_ms INTEGER NOT NULL, updated_at TEXT NOT NULL)");
    this.db.prepare("INSERT OR IGNORE INTO export_cooldowns SELECT ?,next_allowed_at,last_submit_at,min_interval_ms,updated_at FROM ratelimit_state WHERE id=1").run(bucket);
    // 切换限流作用域时继承更严格的持久化冷却。
    if(!bucket.includes(":")) {
      if(scope === "global") {
        const row=this.db.prepare("SELECT MAX(next_allowed_at) AS next FROM export_cooldowns WHERE bucket LIKE ?").get(bucket+":%") as {next:string|null};
        if(row.next) this.extendUntil(Date.parse(row.next));
      }
    } else {
      const parent=bucket.split(":")[0];
      const row=this.db.prepare("SELECT next_allowed_at AS next FROM export_cooldowns WHERE bucket=?").get(parent) as {next:string}|undefined;
      if(row) this.extendUntil(Date.parse(row.next));
    }
  }

  forSite(site: string): RateLimiter {
    return this.scope === "global" ? this : new RateLimiter(this.db, this.minIntervalMs, this.clockFn, this.bucket + ":" + site);
  }

  scopeKey(site: string): string { return this.scope === "global" ? this.bucket : this.bucket + ":" + site; }


  /** 距离下次允许导出还有多少 ms（<=0 表示立即可用） */
  msUntilAllowed(): number {
    const row = this.db.prepare("SELECT next_allowed_at FROM export_cooldowns WHERE bucket = ?").get(this.bucket) as
      | { next_allowed_at: string }
      | undefined;
    if (!row) return 0;
    const next = Date.parse(row.next_allowed_at);
    return Math.max(0, next - this.clockFn());
  }

  nextAllowedAtIso(): string {
    const row = this.db.prepare("SELECT next_allowed_at FROM export_cooldowns WHERE bucket = ?").get(this.bucket) as
      | { next_allowed_at: string }
      | undefined;
    return row?.next_allowed_at ?? new Date(0).toISOString();
  }

  /** 预约一个导出时机：把 next_allowed_at 前移。返回本槽位的允许时间。 */
  bookSlot(): { allowedAt: number; waitMs: number } {
    const now = this.clockFn();
    const row = this.db.prepare("SELECT next_allowed_at FROM export_cooldowns WHERE bucket = ?").get(this.bucket) as
      | { next_allowed_at: string }
      | undefined;
    const current = row ? Date.parse(row.next_allowed_at) : 0;
    const allowedAt = Math.max(now, current);
    const nextAllowed = allowedAt + this.minIntervalMs;
    this.db
      .prepare("UPDATE export_cooldowns SET next_allowed_at = ?, min_interval_ms = ?, updated_at = ? WHERE bucket = ?")
      .run(new Date(nextAllowed).toISOString(), this.minIntervalMs, nowIso(), this.bucket);
    return { allowedAt, waitMs: Math.max(0, allowedAt - now) };
  }

  /** 平台提示更长等待时，取 max(现有, untilTs)（更严格值） */
  extendUntil(untilTs: number) {
    const now = this.clockFn();
    const row = this.db.prepare("SELECT next_allowed_at FROM export_cooldowns WHERE bucket = ?").get(this.bucket) as
      | { next_allowed_at: string }
      | undefined;
    const current = row ? Date.parse(row.next_allowed_at) : 0;
    const next = Math.max(current, untilTs);
    if (next !== current) {
      this.db
        .prepare("UPDATE export_cooldowns SET next_allowed_at = ?, updated_at = ? WHERE bucket = ?")
        .run(new Date(next).toISOString(), nowIso(), this.bucket);
    }
  }

  /**
   * 记录一次实际提交（R6）：submitTs 为适配器实际点击/请求时刻（缺省取当前时间）。
   * 预约只保证排队顺序，页面准备耗时会吃掉冷却间隔；冷却必须从实际提交时刻起算。
   */
  recordSubmit(submitTs?: number) {
    const ts = submitTs ?? this.clockFn();
    this.db
      .prepare("UPDATE export_cooldowns SET last_submit_at = ?, updated_at = ? WHERE bucket = ?")
      .run(new Date(ts).toISOString(), nowIso(), this.bucket);
    this.extendUntil(ts + this.minIntervalMs);
  }

  /** 上次实际提交 + 最小间隔：提交前等待的下界（防止“预约早于实际提交”导致间隔不足） */
  submitFloorTs(): number {
    const row = this.db.prepare("SELECT last_submit_at FROM export_cooldowns WHERE bucket = ?").get(this.bucket) as
      | { last_submit_at: string | null }
      | undefined;
    if (!row?.last_submit_at) return 0;
    return Date.parse(row.last_submit_at) + this.minIntervalMs;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
