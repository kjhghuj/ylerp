/**
 * 任务队列：唯一业务键 site+shopId+reportType+reportDate；
 * 基于 SQLite 的租约（lease）认领，防止重复认领/并发导出；支持暂停、继续、重试、取消、补采。
 */
import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import type { AppConfig } from "./config";
import { nowIso, type TaskRow } from "./db";
import { TaskStatus, RUNNABLE } from "./states";
import { isDateTodayOrFuture, isValidDate, dateRange } from "./dates";
import { logger } from "./logger";

export const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 租约时长：恢复时过期租约可被重新认领

export class Queue {
  constructor(
    private db: DatabaseSync,
    private cfg: AppConfig,
  ) {}

  bizKey(site: string, shopId: string, reportType: string, reportDate: string): string {
    return `${site}|${shopId}|${reportType}|${reportDate}`;
  }

  getTask(id: number): TaskRow | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  }

  getByBizKey(key: string): TaskRow | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE biz_key = ?").get(key) as TaskRow | undefined;
  }

  listTasks(filter?: { status?: string; mode?: string }): TaskRow[] {
    const mode = filter?.mode ?? this.cfg.mode;
    if (filter?.status) {
      return this.db
        .prepare("SELECT * FROM tasks WHERE status = ? AND mode = ? ORDER BY id")
        .all(filter.status, mode) as unknown as TaskRow[];
    }
    return this.db.prepare("SELECT * FROM tasks WHERE mode = ? ORDER BY id DESC LIMIT 500").all(mode) as unknown as TaskRow[];
  }

  listTasksPage(input: { status?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(input.pageSize) || 50));
    const where = ["mode = ?"];
    const args: (string | number)[] = [this.cfg.mode];
    if (input.status) {
      where.push("status = ?");
      args.push(input.status);
    }
    const clause = where.join(" AND ");
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE ${clause}`).get(...args) as { c: number }).c);
    const tasks = this.db
      .prepare(`SELECT * FROM tasks WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize) as unknown as TaskRow[];
    const statuses = this.db
      .prepare("SELECT status, COUNT(*) AS count FROM tasks WHERE mode=? GROUP BY status ORDER BY status")
      .all(this.cfg.mode) as unknown as { status: string; count: number }[];
    return { tasks, page, pageSize, total, pages: Math.ceil(total / pageSize), statuses };
  }

  /** 创建单个任务；同 biz_key 已存在则直接返回已有任务（不重复创建）。 */
  createTask(input: {
    site: string;
    shopId: string;
    shopName?: string;
    reportType: string;
    reportDate: string;
    timezone: string;
    accountKey: string;
    mode: string;
  }): { task: TaskRow; created: boolean } {
    const key = this.bizKey(input.site, input.shopId, input.reportType, input.reportDate);
    const existing = this.getByBizKey(key);
    if (existing) return { task: existing, created: false };
    if (!isValidDate(input.reportDate)) throw new Error(`非法日期: ${input.reportDate}`);
    this.db
      .prepare(
        `INSERT INTO tasks (biz_key, site, shop_id, shop_name, report_type, report_date, timezone, account_key, mode, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key,
        input.site,
        input.shopId,
        input.shopName ?? null,
        input.reportType,
        input.reportDate,
        input.timezone,
        input.accountKey,
        input.mode,
        TaskStatus.PENDING,
        nowIso(),
        nowIso(),
      );
    return { task: this.getByBizKey(key)!, created: true };
  }

  /** 补采：闭区间逐日拆分；有界（最多 366 天）；跳过“今天或未来”的日期。 */
  backfill(input: {
    site: string;
    shopId: string;
    shopName?: string;
    reportType: string;
    from: string;
    to: string;
    timezone: string;
    accountKey: string;
    mode: string;
  }): { created: number; skipped: string[]; taskIds: number[] } {
    const dates = dateRange(input.from, input.to);
    if (dates.length > 366) throw new Error(`补采范围过大（${dates.length} 天），上限 366 天`);
    const created: number[] = [];
    const skipped: string[] = [];
    for (const d of dates) {
      if (isDateTodayOrFuture(d, input.timezone)) {
        skipped.push(d);
        continue;
      }
      const r = this.createTask({ ...input, reportDate: d });
      if (r.created) created.push(r.task.id);
    }
    return { created: created.length, skipped, taskIds: created };
  }

  /**
   * 认领一个到期任务：原子 UPDATE + 租约，防止多 worker 重复认领。
   * 同一账号串行：账号已有租约任务时不认领该账号的其他任务（SQL 子查询保证）。
   */
  claimNext(workerId: string, nowMs: number): TaskRow | undefined {
    const now = new Date(nowMs).toISOString();
    const runnable = RUNNABLE.map((s) => `'${s}'`).join(",");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          `SELECT * FROM tasks
           WHERE status IN (${runnable})
             AND mode = ?
             AND erp_run_id IS NOT NULL
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
             AND (lease_owner IS NULL OR lease_expires_at <= ?)
             AND NOT EXISTS (
               SELECT 1 FROM tasks t2
               WHERE t2.account_key = tasks.account_key
                 AND t2.site = tasks.site AND t2.mode = tasks.mode
                 AND t2.id <> tasks.id
                 AND t2.lease_owner IS NOT NULL AND t2.lease_expires_at > ?
             )
           ORDER BY (SELECT COUNT(*) FROM tasks active WHERE active.site=tasks.site AND active.mode=tasks.mode
                     AND active.lease_owner IS NOT NULL AND active.lease_expires_at > ?) ASC,
                    CASE WHEN status = '${TaskStatus.PENDING}' THEN 1 ELSE 0 END,
                    report_date, id
           LIMIT 1`,
        )
        .get(this.cfg.mode, now, now, now, now) as TaskRow | undefined;
      if (!row) {
        this.db.exec("COMMIT");
        return undefined;
      }
      this.db
        .prepare("UPDATE tasks SET lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?")
        .run(workerId, new Date(nowMs + DEFAULT_LEASE_MS).toISOString(), nowIso(), row.id);
      this.db.exec("COMMIT");
      return this.getTask(row.id);
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 续租（长阶段执行中调用）；仅对仍处于可运行状态且未易主的任务生效 */
  renewLease(taskId: number, workerId: string, nowMs: number) {
    const runnable = RUNNABLE.map((s) => `'${s}'`).join(",");
    this.db
      .prepare(
        `UPDATE tasks SET lease_owner = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND lease_owner = ? AND status IN (${runnable})`,
      )
      .run(workerId, new Date(nowMs + DEFAULT_LEASE_MS).toISOString(), nowIso(), taskId, workerId);
  }

  releaseLease(taskId: number, workerId: string) {
    this.db
      .prepare("UPDATE tasks SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND lease_owner = ?")
      .run(nowIso(), taskId, workerId);
  }

  updateStatus(taskId: number, status: TaskStatus, extra?: { stageDetail?: string; lastError?: string | null; nextAttemptAt?: string | null }) {
    const sets = ["status = ?", "updated_at = ?"];
    const vals: (string | number | null)[] = [status, nowIso()];
    if (extra?.stageDetail !== undefined) {
      sets.push("stage_detail = ?");
      vals.push(extra.stageDetail);
    }
    if (extra?.lastError !== undefined) {
      sets.push("last_error = ?");
      vals.push(extra.lastError);
    }
    if (extra?.nextAttemptAt !== undefined) {
      sets.push("next_attempt_at = ?");
      vals.push(extra.nextAttemptAt);
    }
    vals.push(taskId);
    this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  updateFields(taskId: number, fields: Partial<Record<string, string | number | null>>) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    this.db
      .prepare(`UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...(keys.map((k) => fields[k] as string | number | null) as (string | number | null)[]), nowIso(), taskId);
  }

  /**
   * 原子落“正在提交”意图（R3）：状态与不可变的 submit_intent_at 一次写入；
   * 仅当任务仍由该 worker 持有租约且状态可运行时生效（期间被暂停/取消则返回 false，调用方不得再触发外部提交）。
   */
  markSubmitting(taskId: number, workerId: string, intentAt: string): boolean {
    const runnable = RUNNABLE.map((s) => `'${s}'`).join(",");
    const r = this.db
      .prepare(
        `UPDATE tasks SET status = ?, stage_detail = ?, submit_intent_at = ?, updated_at = ?
         WHERE id = ? AND lease_owner = ? AND status IN (${runnable})`,
      )
      .run(TaskStatus.SUBMITTING, "正在提交导出（意图已保存）", intentAt, nowIso(), taskId, workerId);
    return Number(r.changes) > 0;
  }

  recordAttempt(taskId: number, stage: string, outcome: "ok" | "fail" | "interrupted", detail?: string) {
    this.db
      .prepare("INSERT INTO attempts (task_id, stage, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(taskId, stage, outcome, detail ?? null, nowIso());
  }

  incrementAttempts(taskId: number) {
    this.db.prepare("UPDATE tasks SET attempts = attempts + 1, updated_at = ? WHERE id = ?").run(nowIso(), taskId);
  }

  /** 重试失败任务：恢复到最远安全阶段——已有完整文件直接待上传（不重复导出），其次等待生成，否则从头。 */
  retry(taskId: number): TaskRow | undefined {
    const t = this.getTask(taskId);
    if (!t) return undefined;
    if (t.status === TaskStatus.IMPORTED) return t; // 已入库不重试
    const status = this.safestResumableStatus(t);
    this.db
      .prepare("UPDATE tasks SET status = ?, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ?")
      .run(status, nowIso(), taskId);
    return this.getTask(taskId);
  }

  pause(taskId: number): TaskRow | undefined {
    const t = this.getTask(taskId);
    if (!t) return undefined;
    const noRetry: TaskStatus[] = [TaskStatus.IMPORTED, TaskStatus.FAILED, TaskStatus.PAUSED, TaskStatus.SAVED];
    if (noRetry.includes(t.status as TaskStatus)) return t;
    // 只落“暂停意图”，不释放租约：执行中的协程会在下一个检查点停止并释放（R4）。
    // 提前清租约会让同账号下一任务在浏览器操作尚未结束时被认领，破坏同账号串行。
    this.db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(TaskStatus.PAUSED, nowIso(), taskId);
    return this.getTask(taskId);
  }

  resume(taskId: number): TaskRow | undefined {
    const t = this.getTask(taskId);
    if (!t) return undefined;
    if (t.status !== TaskStatus.PAUSED) return t; // 仅暂停任务可继续；已入库/失败任务走 retry
    // 从已到达的最远产物阶段继续，而不是从零开始
    const status = this.safestResumableStatus(t);
    this.db
      .prepare("UPDATE tasks SET status = ?, last_error = NULL, updated_at = ? WHERE id = ?")
      .run(status, nowIso(), taskId);
    return this.getTask(taskId);
  }

  /** 最远安全阶段：文件在盘 → 待上传；已有导出任务标识 → 等待生成（不重复点导出）；提交结果未知 → 先查导出历史；否则从头。 */
  private safestResumableStatus(t: TaskRow): TaskStatus {
    if (t.file_path && t.file_checksum && fs.existsSync(t.file_path)) return TaskStatus.READY_TO_UPLOAD;
    if (t.export_task_id) return TaskStatus.WAITING_GENERATION;
    if (t.submit_intent_at) return TaskStatus.SUBMITTING; // 提交意图已落库但结果未知：恢复后必须先查导出历史（R3）
    return TaskStatus.PENDING;
  }

  cancel(taskId: number): TaskRow | undefined {
    const t = this.getTask(taskId);
    if (!t) return undefined;
    const doneOk: TaskStatus[] = [TaskStatus.IMPORTED, TaskStatus.SAVED];
    if (doneOk.includes(t.status as TaskStatus)) return t; // 已完成（入库/已保存本地）不可取消
    // 同 pause：保留租约，执行协程在下一个检查点确认取消并停止后续外部动作（R4）
    this.db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(TaskStatus.FAILED, nowIso(), taskId);
    this.updateFields(taskId, { last_error: "用户取消" });
    return this.getTask(taskId);
  }

  /**
   * 单独重试上传（不动采集链路）：文件已在盘且校验和有效时，直接回到待上传。
   * 上传失败/仅保存本地的任务都可以用，不重新登录、不重新导出、不重新下载。
   */
  retryUpload(taskId: number): { ok: boolean; task?: TaskRow; error?: string } {
    const t = this.getTask(taskId);
    if (!t) return { ok: false, error: "任务不存在" };
    if (!t.file_path || !t.file_checksum || !fs.existsSync(t.file_path)) {
      return { ok: false, error: "本地文件缺失，无法单独重试上传（需要重新采集）" };
    }
    const imported: TaskStatus[] = [TaskStatus.IMPORTED];
    if (imported.includes(t.status as TaskStatus)) return { ok: false, error: "任务已入库，无需重试上传" };
    this.db
      .prepare("UPDATE tasks SET status = ?, upload_pref = 1, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ?")
      .run(TaskStatus.READY_TO_UPLOAD, nowIso(), taskId);
    return { ok: true, task: this.getTask(taskId)! };
  }

  /** 重启恢复：单实例假设下，启动时旧进程的租约一律视为失效释放；中间态回退到可安全重入的状态。 */
  recoverOnStartup(): { released: number; rescheduled: number } {
    const now = nowIso();
    // 1) 释放全部租约（上一进程已死，其租约必然陈旧；多实例部署需额外心跳机制，见 README）
    const r1 = this.db.prepare("UPDATE tasks SET lease_owner = NULL, lease_expires_at = NULL WHERE lease_owner IS NOT NULL").run();
    // 2) 崩溃在 SUBMITTING：保持 SUBMITTING（可运行），流水线会先查导出历史再决定是否重新提交；
    //    严禁直接回退 PENDING——那会跳过历史核对造成重复导出（R3）。
    //    旧数据缺 submit_intent_at 的，用 updated_at 近似补记（续租最多使其滞后 60s）
    const r2 = this.db
      .prepare("UPDATE tasks SET submit_intent_at = COALESCE(submit_intent_at, updated_at) WHERE status = ?")
      .run(TaskStatus.SUBMITTING);
    // 3) 崩溃在 DOWNLOADING/UPLOADING 等中间态：回退到可安全重入的状态
    const r3 = this.db
      .prepare("UPDATE tasks SET status = ? WHERE status = ? AND lease_owner IS NULL")
      .run(TaskStatus.WAITING_GENERATION, TaskStatus.DOWNLOADING);
    const r4 = this.db
      .prepare("UPDATE tasks SET status = ? WHERE status = ? AND lease_owner IS NULL")
      .run(TaskStatus.READY_TO_UPLOAD, TaskStatus.UPLOADING);
    // 5) 所有可运行任务的 next_attempt_at 清空立即调度
    const runnable = RUNNABLE.map((s) => `'${s}'`).join(",");
    const r5 = this.db
      .prepare(`UPDATE tasks SET next_attempt_at = NULL WHERE status IN (${runnable}) AND next_attempt_at IS NOT NULL`)
      .run();
    const released = Number(r1.changes) + 0;
    const rescheduled = Number(r2.changes) + Number(r3.changes) + Number(r4.changes) + Number(r5.changes);
    logger.info(
      "queue",
      `启动恢复完成：释放租约 ${released} 个，中间态回退/重调度 ${rescheduled} 个`,
    );
    return { released, rescheduled };
  }

  /** 等待登录的账号：其任务暂停为 WAITING_AUTH；恢复后可继续。 */
  markAccountTasksWaitingAuth(accountKey: string, detail: string) {
    const runnable = RUNNABLE.filter((s) => s !== TaskStatus.WAITING_AUTH)
      .map((s) => `'${s}'`)
      .join(",");
    this.db
      .prepare(
        `UPDATE tasks SET status = ?, last_error = ?, updated_at = ?
         WHERE account_key = ? AND status IN (${runnable}) AND mode = ?`,
      )
      .run(TaskStatus.WAITING_AUTH, detail, nowIso(), accountKey, this.cfg.mode);
  }

  markAccountTasksNeedsConfig(accountKey: string, detail: string) {
    const runnable = RUNNABLE.filter((s) => s !== TaskStatus.NEEDS_CONFIG)
      .map((s) => `'${s}'`)
      .join(",");
    this.db
      .prepare(
        `UPDATE tasks SET status = ?, last_error = ?, updated_at = ?
         WHERE account_key = ? AND status IN (${runnable}) AND mode = ?`,
      )
      .run(TaskStatus.NEEDS_CONFIG, detail, nowIso(), accountKey, this.cfg.mode);
  }

  /** 账号恢复登录后，把该账号等待登录的任务放回队列 */
  resumeAccountTasks(accountKey: string) {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE account_key=? AND mode=? AND status IN ('WAITING_AUTH','NEEDS_CONFIG')")
      .all(accountKey,this.cfg.mode) as unknown as TaskRow[];
    for (const row of rows) this.updateStatus(row.id,this.safestResumableStatus(row),{lastError:null,nextAttemptAt:null});
  }
}
