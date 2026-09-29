/**
 * 流水线编排：凭据检查 → 提交导出（先落意图）→ 等待生成 → 下载 → 校验 → 上传 → 入库确认。
 * 每阶段崩溃后按当前状态安全重入；导出提交前必先预约限速槽位。
 *
 * 执行安全（R3/R4/R6）：
 * - 提交意图（submit_intent_at）在触发外部提交动作前原子落库；结果未知时恢复流程必须先查导出历史。
 * - 每个异步步骤返回后都经过“检查点”：任务被暂停/取消/易主即停止后续外部动作，不覆盖既有结论。
 * - 实际提交纳入全局临界区；冷却间隔按实际提交时刻（而非预约时刻）起算。
 */
import path from "node:path";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config";
import type { Queue } from "./queue";
import type { RateLimiter } from "./ratelimit";
import type { TaskRow } from "./db";
import { TaskStatus, Stage } from "./states";
import type { CollectorAdapter } from "./adapters/types";
import type { UploadAdapter, UploadFileMeta } from "./upload/types";
import { validateReportFile, checksumOf } from "./validate";
import { logger } from "./logger";
import { sleep } from "./ratelimit";
import { reportTypeName } from "./config";

const MAX_ATTEMPTS_PER_STAGE = 5;
// 退避基准可经环境变量调整（仅供测试加速；真实使用默认 30s）
const BACKOFF_BASE_MS = Number(process.env.PIPELINE_BACKOFF_BASE_MS || 30_000) || 30_000;
const BACKOFF_CAP_MS = 10 * 60_000;

export class Pipeline {
  /** 全局提交临界区（R6）：同一时刻至多一个协程处于“预约→点击→记录冷却”区间 */
  private submitMutexes = new Map<string, Promise<void>>();

  constructor(
    private cfg: AppConfig,
    private db: DatabaseSync,
    private queue: Queue,
    private limiter: RateLimiter,
    private adapter: CollectorAdapter,
    private getUpload: (task?: TaskRow) => UploadAdapter,
    private workerId: string = "worker",
  ) {}

  /** 本次执行是否需要上传：全局上传设置启用 且 任务本身选择上传 */
  private shouldUpload(task: TaskRow): boolean {
    return this.getUpload(task).isEnabled() && task.upload_pref !== 0;
  }

  private backoffMs(attempts: number): number {
    return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)));
  }

  /** 是否仍持有该任务的执行权：租约未易主，且状态未被暂停/取消/等待登录等接管（R4） */
  private ownsExecution(task: TaskRow): boolean {
    const t = this.queue.getTask(task.id);
    if (!t || t.lease_owner !== this.workerId) return false;
    const interrupted: TaskStatus[] = [
      TaskStatus.PAUSED,
      TaskStatus.FAILED,
      TaskStatus.WAITING_AUTH,
      TaskStatus.NEEDS_CONFIG,
      TaskStatus.IMPORTED,
    ];
    return !interrupted.includes(t.status as TaskStatus);
  }

  /**
   * 异步步骤间的检查点：任务被暂停/取消/易主则返回 false，调用方不得再启动下一阶段的外部动作。
   * 已发生的外部动作通过 attempts 表按事实记录。
   */
  private checkpoint(task: TaskRow, where: string): boolean {
    if (this.ownsExecution(task)) return true;
    const t = this.queue.getTask(task.id);
    this.queue.recordAttempt(task.id, "PIPELINE", "interrupted", `${where}：任务状态为 ${t?.status ?? "已删除"}，不再启动后续阶段`);
    logger.warn("pipeline", `任务#${task.id} 在「${where}」检查点停止（状态=${t?.status ?? "?"}，租约=${t?.lease_owner ?? "无"}）`);
    return false;
  }

  /** 带执行权校验的状态迁移：失去执行权时不动状态（结论由暂停/取消方持有，R4） */
  private setStatus(task: TaskRow, status: TaskStatus, extra?: { stageDetail?: string; lastError?: string | null; nextAttemptAt?: string | null }): boolean {
    if (!this.ownsExecution(task)) return false;
    this.queue.updateStatus(task.id, status, extra);
    return true;
  }

  /** 事实性字段（export_task_id/file_path/import_ref 等）照实落库，即使任务刚被取消也保留证据 */
  private recordFacts(task: TaskRow, fields: Partial<Record<string, string | number | null>>) {
    if (!Object.keys(fields).length) return;
    this.queue.updateFields(task.id, fields);
  }

  private fail(task: TaskRow, reason: string) {
    if (!this.ownsExecution(task)) return; // 已被取消/暂停的任务不被旧协程覆盖结论（R4）
    this.queue.updateStatus(task.id, TaskStatus.FAILED, { lastError: reason });
    logger.error("pipeline", `任务#${task.id} ${task.biz_key} 失败：${reason}`);
  }

  private scheduleRetry(task: TaskRow, reason: string, stageKey: string) {
    if (!this.ownsExecution(task)) return; // 已被暂停/取消：不再改写调度
    const fresh = this.queue.getTask(task.id);
    const attempts = (fresh?.attempts ?? task.attempts) + 1;
    this.queue.updateFields(task.id, { attempts });
    if (attempts >= MAX_ATTEMPTS_PER_STAGE) {
      this.fail(task, `${reason}（已重试 ${attempts} 次，达上限）`);
      return;
    }
    const nextAt = new Date(Date.now() + this.backoffMs(attempts)).toISOString();
    this.queue.updateStatus(task.id, (fresh?.status ?? task.status) as TaskStatus, { lastError: reason, nextAttemptAt: nextAt });
    logger.warn("pipeline", `任务#${task.id} ${stageKey} 重试${attempts}/${MAX_ATTEMPTS_PER_STAGE}（${Math.round(this.backoffMs(attempts) / 1000)}s 后）：${reason}`);
  }

  /** 账号状态维护：登录恢复则解锁该账号任务 */
  private async ensureAccountReady(task: TaskRow): Promise<boolean> {
    const auth = await this.adapter.ensureLogin(task.account_key, task.shop_id, task.site);
    if (!auth.ok) {
      const detail = auth.detail ?? "需要登录";
      if(auth.kind === "NEEDS_CONFIG") {
        this.queue.updateStatus(task.id,TaskStatus.NEEDS_CONFIG,{lastError:detail});
        return false;
      }
      this.queue.updateStatus(task.id, TaskStatus.WAITING_AUTH, { lastError: detail });
      this.db
        .prepare("UPDATE accounts SET status='WAITING_AUTH', status_detail=?, updated_at=? WHERE account_key=?")
        .run(detail, new Date().toISOString(), task.account_key);
      this.queue.markAccountTasksWaitingAuth(task.account_key, detail);
      logger.warn("pipeline", `账号 ${task.account_key} 需要登录：${detail}`);
      return false;
    }
    // 登录正常：如账号此前标记等待登录则恢复其任务
    const acct = this.db.prepare("SELECT status FROM accounts WHERE account_key = ?").get(task.account_key) as
      | { status: string }
      | undefined;
    if (acct && acct.status !== "ok") {
      this.db
        .prepare("UPDATE accounts SET status='ok', status_detail=NULL, updated_at=? WHERE account_key=?")
        .run(new Date().toISOString(), task.account_key);
      this.queue.resumeAccountTasks(task.account_key);
      logger.info("pipeline", `账号 ${task.account_key} 恢复，关联任务重新入队`);
    }
    return true;
  }

  /** 主入口：处理一个被认领的任务（不抛异常） */
  async run(task: TaskRow): Promise<void> {
    try {
      await this.dispatch(task);
    } catch (e) {
      const msg = (e as Error).message;
      logger.error("pipeline", `任务#${task.id} 异常：${msg}`);
      this.queue.recordAttempt(task.id, "PIPELINE", "interrupted", msg);
      this.scheduleRetry(task, msg, "PIPELINE");
    } finally {
      const t = this.queue.getTask(task.id);
      if (t) this.queue.releaseLease(t.id, this.workerId);
    }
  }

  private async dispatch(task: TaskRow): Promise<void> {
    // -1) 模式一致性（R1）：真实 worker 不得执行演示任务（历史库/手工构造的兜底防线）
    if (task.mode !== this.cfg.mode) {
      this.fail(task, `任务模式（${task.mode}）与当前运行模式（${this.cfg.mode}）不一致，拒绝执行`);
      return;
    }
    // 0) 凭据与会话（真实模式直接请求导出接口，不请求店铺身份接口）
    const pureUploadStages: TaskStatus[] = [TaskStatus.READY_TO_UPLOAD, TaskStatus.WAITING_IMPORT_CONFIRM, TaskStatus.UPLOADED_UNCONFIRMED];
    if (!pureUploadStages.includes(task.status as TaskStatus)) {
      const ready = await this.ensureAccountReady(task);
      if (!ready) return;
      if (!this.checkpoint(task, "会话确认后")) return;
    }

    switch (task.status) {
      case TaskStatus.PENDING:
      case TaskStatus.SUBMITTING:
        return this.stageSubmit(task);
      case TaskStatus.WAITING_GENERATION:
        return this.stageWaitAndDownload(task);
      case TaskStatus.DOWNLOADED:
      case TaskStatus.DOWNLOADING:
        return this.stageValidate(task);
      case TaskStatus.READY_TO_UPLOAD:
      case TaskStatus.UPLOADING:
        return this.stageUpload(task);
      case TaskStatus.WAITING_IMPORT_CONFIRM:
      case TaskStatus.UPLOADED_UNCONFIRMED:
        return this.stageConfirm(task);
      default:
        // 其他状态无需处理
        return;
    }
  }

  private async withSubmitLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.submitMutexes.get(key) ?? Promise.resolve();
    let release!: () => void;
    this.submitMutexes.set(key, new Promise<void>((r) => {
      release = r;
    }));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // ---------- 提交导出 ----------
  private async stageSubmit(task: TaskRow): Promise<void> {
    // 崩溃恢复（R3）：提交意图已保存但结果未知 —— 必须先查导出历史，不能直接再点
    if (task.submit_intent_at && !task.export_task_id) {
      const sinceTs = Date.parse(task.submit_intent_at) - 5_000; // 稍放宽时钟差
      const found = await this.adapter.checkExistingExport({
        accountKey: task.account_key,
        site: task.site,
        timezone: task.timezone,
        shopId: task.shop_id,
        reportType: task.report_type,
        reportDate: task.report_date,
        sinceTs,
      });
      if (!this.checkpoint(task, "导出历史核对后")) return;
      if (found.exists && found.exportTaskId) {
        this.recordFacts(task, { export_task_id: found.exportTaskId, match_evidence: JSON.stringify({ recovered: true, ...found }) });
        this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: `恢复发现已提交的导出 ${found.exportTaskId}` });
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "ok", `恢复：发现已存在导出任务 ${found.exportTaskId}（${found.status}）`);
        logger.info("pipeline", `任务#${task.id} 崩溃恢复：复用已提交导出 ${found.exportTaskId}`);
        return;
      }
      if (!found.checked) {
        // 查询失败/未登录/列表未同步 ≠ 远端不存在任务：保守保持现状等待重查，绝不重新提交（R3）
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "fail", "提交结果未确认且导出历史查询不可用，保守等待后重查");
        this.scheduleRetry(task, "导出提交结果未确认（历史查询不可用），保守等待后重查", "SUBMIT_RECHECK");
        return;
      }
      // 明确核实不存在 → 清除旧意图，重新提交
      this.recordFacts(task, { submit_intent_at: null });
      task = this.queue.getTask(task.id)!;
    }

    // 实际提交的全局临界区（R6）：预约 → 等到真正允许 → 落意图 → 提交 → 按实际提交时刻记录冷却
    const limiter = this.limiter.forSite(task.site);
    await this.withSubmitLock(this.limiter.scopeKey(task.site), async () => {
      // 未到冷却点：只调度、不预约（预约会推后全局窗口，避免任务间互相推挤成活锁）
      const waitMs = limiter.msUntilAllowed();
      if (waitMs > 0) {
        this.setStatus(task, TaskStatus.PENDING, {
          stageDetail: `导出冷却中，${Math.ceil(waitMs / 1000)}s 后提交`,
          nextAttemptAt: new Date(Date.now() + waitMs + 50).toISOString(),
        });
        return; // 先让出，冷却后重新认领
      }
      const slot = limiter.bookSlot(); // 排队占位，防止多协程同时通过
      // 等到预约位生效、且距“上次实际提交”满足最小间隔（R6：页面准备耗时会吃掉冷却，不能只看预约时刻）
      for (;;) {
        const wait = Math.max(slot.allowedAt, limiter.submitFloorTs()) - Date.now();
        if (wait <= 0) break;
        await sleep(Math.min(wait + 20, 5_000));
        if (!this.checkpoint(task, "导出冷却等待")) return;
      }
      if (!this.checkpoint(task, "提交导出前")) return;

      // 提交前先落“正在提交”意图（原子写入；期间被暂停/取消则不触发外部提交，R3/R4）
      const intentAt = new Date().toISOString();
      if (!this.queue.markSubmitting(task.id, this.workerId, intentAt)) {
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "interrupted", "落提交意图时任务已被暂停/取消，未触发导出");
        return;
      }
      const result = await this.adapter.submitExport({
        accountKey: task.account_key,
        site: task.site,
        timezone: task.timezone,
        shopId: task.shop_id,
        reportType: task.report_type,
        reportDate: task.report_date,
        sinceTs: Date.parse(intentAt) - 5_000,
      });

      // 冷却按实际提交时刻记录（R6）；明确未到达提交动作的结果清除意图（R3）
      if (result.kind === "SUBMITTED" || result.kind === "RATE_LIMITED" || result.kind === "REJECTED" || result.kind === "ERROR") {
        limiter.recordSubmit(result.kind === "SUBMITTED" && result.submittedAt ? result.submittedAt : Date.now());
      } else {
        this.recordFacts(task, { submit_intent_at: null });
      }
      if (result.kind === "SUBMITTED") {
        this.recordFacts(task, { export_task_id: result.exportTaskId, match_evidence: JSON.stringify(result.evidence) });
      }
      if (!this.checkpoint(task, "提交导出后")) {
        // 外部动作已发生：按事实留痕（结果会随恢复流程经导出历史核对）
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "interrupted", `提交返回 ${result.kind} 后任务已不在执行中`);
        return;
      }

      if (result.kind === "SUBMITTED") {
        this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: `已提交，等待生成（${result.exportTaskId}）`, lastError: null });
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "ok", `导出任务 ${result.exportTaskId}`);
        return;
      }
      if (result.kind === "RATE_LIMITED") {
        limiter.extendUntil(Date.now() + result.retryAfterMs);
        this.recordFacts(task, { submit_intent_at: null }); // 平台明确未创建任务
        this.setStatus(task, TaskStatus.PENDING, {
          stageDetail: `平台限速，${Math.ceil(result.retryAfterMs / 1000)}s 后重试`,
          lastError: result.message,
          nextAttemptAt: new Date(Date.now() + result.retryAfterMs + 1_000).toISOString(),
        });
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "fail", `平台限速: ${result.message}`);
        return;
      }
      if (result.kind === "WAITING_AUTH") {
        this.recordFacts(task, { submit_intent_at: null }); // 未登录即未提交，结果确定
        this.queue.updateStatus(task.id, TaskStatus.WAITING_AUTH, { lastError: "提交导出时发现登录失效" });
        this.queue.markAccountTasksWaitingAuth(task.account_key, "提交导出时发现登录失效");
        return;
      }
      if (result.kind === "IDENTITY_MISMATCH") {
        this.recordFacts(task, { submit_intent_at: null }); // 身份不符即未提交
        this.fail(task, `身份不符：期望 ${result.expected}，页面实际 ${result.actual}`);
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "fail", `身份不符: ${result.expected} vs ${result.actual}`);
        return;
      }
      if (result.kind === "NEEDS_CONFIG") {
        this.recordFacts(task, { submit_intent_at: null });
        this.queue.updateStatus(task.id, TaskStatus.NEEDS_CONFIG, { lastError: result.detail });
        return;
      }
      if (result.kind === "REJECTED") {
        this.recordFacts(task, { submit_intent_at: null });
        this.fail(task, `Shopee 拒绝生成报表：${result.message}`);
        this.queue.recordAttempt(task.id, Stage.SUBMIT, "fail", result.message);
        return;
      }
      // ERROR：结果不明（可能已创建）——保留意图，下轮先查导出历史；回 PENDING 做有界重试
      this.queue.recordAttempt(task.id, Stage.SUBMIT, "fail", result.message);
      this.setStatus(task, TaskStatus.PENDING);
      this.scheduleRetry(this.queue.getTask(task.id)!, result.message, "SUBMIT");
    });
  }

  // ---------- 等待生成 + 下载 ----------
  private async stageWaitAndDownload(task: TaskRow): Promise<void> {
    if (!task.export_task_id) {
      // 无远端任务标识却处于等待态：按“提交结果未知”处理（R3），先核对导出历史再决定是否重新提交
      this.setStatus(task, TaskStatus.SUBMITTING, { stageDetail: "缺少导出任务标识，先核对导出历史" });
      if (!task.submit_intent_at) this.recordFacts(task, { submit_intent_at: task.created_at }); // 保守下界：任务创建起的一切导出都纳入核对
      return;
    }
    this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: "轮询报表生成状态" });
    const wait = await this.adapter.waitForExport({
      accountKey: task.account_key,
      site: task.site,
      shopId: task.shop_id,
      exportTaskId: task.export_task_id,
      timeoutMs: this.cfg.waitGenerationTimeoutMs,
      pollMs: this.cfg.waitGenerationPollMs,
    });
    if (wait.kind === "WAITING_AUTH") {
      this.queue.updateStatus(task.id, TaskStatus.WAITING_AUTH, { lastError: "等待生成时登录失效" });
      this.queue.markAccountTasksWaitingAuth(task.account_key, "等待生成时登录失效");
      return;
    }
    if (wait.kind === "FAILED") {
      this.fail(task, wait.message);
      this.queue.recordAttempt(task.id, Stage.WAIT, "fail", wait.message);
      return;
    }
    if (wait.kind === "TIMEOUT") {
      this.queue.recordAttempt(task.id, Stage.WAIT, "fail", wait.message);
      this.scheduleRetry(task, wait.message, "WAIT");
      return;
    }
    // COMPLETED → 下载（暂停/取消检查点：R4）
    if (!this.checkpoint(task, "下载前")) return;
    this.setStatus(task, TaskStatus.DOWNLOADING, { stageDetail: `报表已生成（${task.export_task_id}），开始下载` });
    this.queue.renewLease(task.id, this.workerId, Date.now());
    const extension = this.cfg.mode === "real" && task.report_type === "product_performance" ? "xlsx" : "csv";
    const safeName = `${task.site}_${task.shop_id}_${task.report_type}_${this.cfg.mode === "real" ? task.report_date.replace(/-/g, "") : task.report_date}.${extension}`;
    const dl = await this.adapter.downloadExport({
      accountKey: task.account_key,
      site: task.site,
      shopId: task.shop_id,
      exportTaskId: task.export_task_id,
      saveDir: this.cfg.downloadDir,
      saveName: safeName,
      timeoutMs: this.cfg.downloadTimeoutMs,
    });
    if (dl.kind === "WAITING_AUTH") {
      this.queue.updateStatus(task.id, TaskStatus.DOWNLOADING, { lastError: "下载时登录失效", nextAttemptAt: new Date(Date.now() + 60_000).toISOString() });
      this.queue.markAccountTasksWaitingAuth(task.account_key, "下载时登录失效");
      return;
    }
    if (dl.kind === "FAILED") {
      this.queue.recordAttempt(task.id, Stage.DOWNLOAD, "fail", dl.message);
      this.scheduleRetry(task, dl.message, "DOWNLOAD");
      // DOWNLOADING 回退到 WAITING_GENERATION（文件还在，不需要重新导出）
      const t = this.queue.getTask(task.id)!;
      if (t.status !== TaskStatus.FAILED) {
        this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: "下载失败，回到等待生成状态重试下载" });
      }
      return;
    }
    this.recordFacts(task, { file_path: dl.filePath });
    this.setStatus(task, TaskStatus.DOWNLOADED, { stageDetail: `已下载 ${path.basename(dl.filePath)}` });
    this.queue.recordAttempt(task.id, Stage.DOWNLOAD, "ok", path.basename(dl.filePath));
    return this.stageValidate(this.queue.getTask(task.id)!);
  }

  // ---------- 校验 ----------
  private async stageValidate(task: TaskRow): Promise<void> {
    if (!this.checkpoint(task, "校验前")) return;
    if (!task.file_path || !fsExists(task.file_path)) {
      // 已下载记录但文件丢失：回退到等待生成重新下载
      this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: "文件丢失，重新下载", lastError: "本地文件缺失" });
      return;
    }
    const result = validateReportFile(task.file_path);
    const checksum = checksumOf(task.file_path);
    if (!result.ok) {
      this.fail(task, `文件校验失败：${result.reason}`);
      this.queue.recordAttempt(task.id, Stage.VALIDATE, "fail", result.reason);
      return;
    }
    // 记录文件版本（同一逻辑任务保留版本历史）
    const rev =
      (
        this.db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE task_id = ?").get(task.id) as { c: number }
      ).c + 1;
    this.db
      .prepare(
        "INSERT INTO downloads (task_id, revision, file_path, checksum, rows, format, worksheets, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        task.id,
        rev,
        task.file_path,
        checksum,
        result.rows,
        result.format,
        result.format === "xlsx" ? result.worksheets : null,
        fs.statSync(task.file_path).size,
        new Date().toISOString(),
      );
    this.recordFacts(task, { file_checksum: checksum, file_rows: result.rows });
    // 上传分流：未启用上传（或该任务选择仅保存）→ 终态 SAVED；否则进入上传/确认链路
    if (!this.shouldUpload(task)) {
      this.queue.recordAttempt(task.id, Stage.VALIDATE, "ok", `${result.rows} 行（仅保存本地，未上传）`);
      this.setStatus(task, TaskStatus.SAVED, {
        stageDetail: `已保存本地：${result.format.toUpperCase()}${result.rows === null ? `，${result.worksheets} 个工作表` : `，${result.rows} 行`}，checksum ${checksum.slice(0, 12)}…（可手动同步）`,
        lastError: null,
      });
      logger.info("pipeline", `任务#${task.id} 校验通过并保存本地（${result.rows} 行，未上传）`);
      return;
    }
    if (!this.setStatus(task, TaskStatus.READY_TO_UPLOAD, {
      stageDetail: `校验通过：${result.format.toUpperCase()}${result.rows === null ? `，${result.worksheets} 个工作表` : `，${result.rows} 行`}，checksum ${checksum.slice(0, 12)}…`,
      lastError: null,
    })) {
      this.queue.recordAttempt(task.id, Stage.VALIDATE, "ok", `${result.rows} 行（任务已不在执行中，未进入上传）`);
      return;
    }
    this.queue.recordAttempt(task.id, Stage.VALIDATE, "ok", `${result.rows} 行`);
    logger.info("pipeline", `任务#${task.id} 校验通过：${result.rows} 行`);
    return this.stageUpload(this.queue.getTask(task.id)!);
  }

  // ---------- 上传 ----------
  private async stageUpload(task: TaskRow): Promise<void> {
    // 兜底归一：已处于待上传但全局未启用上传 → 转 SAVED（设置变更后旧任务的状态收敛）
    if (!this.shouldUpload(task)) {
      if (task.status === TaskStatus.READY_TO_UPLOAD || task.status === TaskStatus.UPLOADING) {
        this.setStatus(task, TaskStatus.SAVED, { stageDetail: "文件已保存本地（当前未启用上传）", lastError: null });
      }
      return;
    }
    if (!task.file_path || !task.file_checksum) {
      this.setStatus(task, TaskStatus.WAITING_GENERATION, { stageDetail: "缺少文件，重新下载" });
      return;
    }
    if (!this.checkpoint(task, "上传前")) return;
    const sizeBytes = fs.existsSync(task.file_path) ? fs.statSync(task.file_path).size : null;
    const meta: UploadFileMeta = {
      site: task.site,
      shopId: task.shop_id,
      shopName: task.shop_name,
      reportType: task.report_type,
      reportDate: task.report_date,
      timezone: task.timezone,
      bizKey: task.biz_key,
      checksum: task.file_checksum,
      mode: task.mode,
      taskId: String(task.id),
      ...(task.erp_run_id ? { erpRunId: task.erp_run_id } : {}),
      rows: task.file_rows,
      fileName: task.erp_run_id
        ? path.basename(task.file_path).replace(task.report_date, task.report_date.replace(/-/g, ""))
        : path.basename(task.file_path),
      sizeBytes,
      collectedAt: task.updated_at,
    };
    const uploadAdapter = this.getUpload(task);
    const idemKey = task.upload_idem_key ?? uploadAdapter.idempotencyKey(meta);
    if (!task.upload_idem_key) this.recordFacts(task, { upload_idem_key: idemKey });

    this.setStatus(task, TaskStatus.UPLOADING, { stageDetail: `上传中（幂等键 ${idemKey.slice(0, 20)}…）` });
    this.queue.renewLease(task.id, this.workerId, Date.now());
    const outcome = await uploadAdapter.upload(task.file_path, meta, idemKey);

    if (outcome.kind === "ACCEPTED") {
      this.recordFacts(task, { import_ref: outcome.importId });
      if (!this.setStatus(task, TaskStatus.WAITING_IMPORT_CONFIRM, {
        stageDetail: `接收端已受理（${outcome.importId}${outcome.dedup ? "，幂等去重" : ""}），等待入库确认`,
        lastError: null,
      })) {
        this.queue.recordAttempt(task.id, Stage.UPLOAD, "ok", `importId=${outcome.importId}（受理后任务已不在执行中）`);
        return;
      }
      this.queue.recordAttempt(task.id, Stage.UPLOAD, "ok", `importId=${outcome.importId}${outcome.dedup ? " dedup" : ""}`);
      return this.stageConfirm(this.queue.getTask(task.id)!);
    }
    if (outcome.kind === "TIMEOUT_UNRESOLVED") {
      // 不重新导出；稍后重试上传（幂等键保护）
      this.queue.recordAttempt(task.id, Stage.UPLOAD, "fail", outcome.message);
      this.scheduleRetry(task, outcome.message, "UPLOAD");
      const t = this.queue.getTask(task.id)!;
      if (t.status !== TaskStatus.FAILED) this.setStatus(task, TaskStatus.READY_TO_UPLOAD);
      return;
    }
    const msg =
      outcome.kind === "HTTP_ERROR" || outcome.kind === "AUTH_ERROR"
        ? `HTTP ${outcome.status}: ${outcome.message}`
        : outcome.message;
    this.fail(task, `上传失败：${msg}`);
    this.queue.recordAttempt(task.id, Stage.UPLOAD, "fail", msg);
  }

  // ---------- 入库确认 ----------
  private async stageConfirm(task: TaskRow): Promise<void> {
    if (!task.import_ref) {
      this.setStatus(task, TaskStatus.READY_TO_UPLOAD, { stageDetail: "缺少 importId，回到上传" });
      return;
    }
    this.setStatus(task, TaskStatus.WAITING_IMPORT_CONFIRM, { stageDetail: "查询入库结果" });
    const outcome = await this.getUpload(task).confirm(task.import_ref);
    if (!this.checkpoint(task, "入库确认后")) {
      // 确认结果按事实留痕（例如已被取消，但接收端确已入库）
      this.queue.recordAttempt(task.id, Stage.CONFIRM, outcome.kind === "IMPORTED" ? "ok" : "fail", `确认返回 ${outcome.kind}（任务已不在执行中）`);
      return;
    }
    if (outcome.kind === "IMPORTED") {
      this.recordFacts(task, { file_rows: outcome.rowCount ?? task.file_rows });
      this.setStatus(task, TaskStatus.IMPORTED, {
        stageDetail: `已入库：${outcome.rowCount ?? task.file_rows ?? "?"} 行`,
        lastError: null,
      });
      this.queue.recordAttempt(task.id, Stage.CONFIRM, "ok", `已入库 ${outcome.rowCount ?? "?"} 行`);
      logger.info("pipeline", `任务#${task.id} ${task.biz_key} 已入库 ✔`);
      return;
    }
    if (outcome.kind === "AUTH_ERROR") {
      this.fail(task, outcome.message);
      this.queue.recordAttempt(task.id, Stage.CONFIRM, "fail", outcome.message);
      return;
    }
    if (outcome.kind === "IMPORT_FAILED") {
      this.fail(task, `入库失败：${outcome.message}`);
      this.queue.recordAttempt(task.id, Stage.CONFIRM, "fail", outcome.message);
      return;
    }
    // STILL_PENDING → 待核实（不假设成功，也不重复外部动作）；5 分钟后复查，避免占用 worker 槽位
    this.setStatus(task, TaskStatus.UPLOADED_UNCONFIRMED, {
      stageDetail: "已上传，入库待确认（轮询超时）",
      lastError: outcome.message,
      nextAttemptAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    this.queue.recordAttempt(task.id, Stage.CONFIRM, "fail", outcome.message);
  }
}

function fsExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
