/**
 * Worker：周期认领到期任务并执行流水线。全局并发上限；同账号串行由队列租约保证。
 * 暂停/恢复状态持久化到 app_state，重启后保持。
 */
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config";
import type { Queue } from "./queue";
import type { Pipeline } from "./pipeline";
import { logger } from "./logger";

export class Worker {
  readonly workerId: string;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = 0;

  constructor(
    private db: DatabaseSync,
    private cfg: AppConfig,
    private queue: Queue,
    private pipeline: Pipeline,
    workerId?: string,
    private syncTick?: () => Promise<void>,
  ) {
    this.workerId = workerId ?? `worker-${process.pid}-${crypto.randomBytes(2).toString("hex")}`;
  }

  isPaused(): boolean {
    const row = this.db.prepare("SELECT value FROM app_state WHERE key = 'workerPaused'").get() as
      | { value: string }
      | undefined;
    return row?.value === "1";
  }

  setPaused(paused: boolean) {
    this.db
      .prepare(
        "INSERT INTO app_state (key, value, updated_at) VALUES ('workerPaused', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(paused ? "1" : "0", new Date().toISOString());
    logger.info("worker", paused ? "已暂停（不再认领新任务）" : "已恢复");
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => void this.tick(), this.cfg.workerTickMs);
    logger.info("worker", `启动（workerId=${this.workerId}，tick=${this.cfg.workerTickMs}ms，并发=${this.cfg.workerMaxConcurrency}）`);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  busyCount(): number {
    return this.inFlight;
  }

  private async tick(): Promise<void> {
    if (this.running) void this.syncTick?.().catch((e) => logger.error("sync", String(e)));
    if (!this.running || this.isPaused()) return;
    while (this.inFlight < this.cfg.workerMaxConcurrency) {
      let task;
      try {
        task = this.queue.claimNext(this.workerId, Date.now());
      } catch (e) {
        logger.error("worker", `认领任务失败: ${(e as Error).message}`);
        return;
      }
      if (!task) return;
      this.inFlight++;
      // 长阶段（等待生成+下载）可能超过租约时长；执行期间持续续租，
      // 防止租约过期后同一任务被再次认领并发执行。
      const renewTimer = setInterval(() => {
        try {
          this.queue.renewLease(task.id, this.workerId, Date.now());
        } catch {
          /* 续租失败不影响主流程 */
        }
      }, 60_000);
      void this.pipeline
        .run(task)
        .catch((e) => logger.error("worker", `任务#${task.id} 执行异常: ${(e as Error).message}`))
        .finally(() => {
          clearInterval(renewTimer);
          this.inFlight--;
        });
    }
  }
}
