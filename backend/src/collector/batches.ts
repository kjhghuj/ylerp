/** 多店铺逐日批次：批次只组织任务，任务仍由现有队列负责去重、恢复与执行。 */
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config";
import type { Queue } from "./queue";
import type { SiteRegistry } from "./registry";
import { dateRange, isValidDate, yesterdayInTz } from "./dates";
import { nowIso, type TaskRow } from "./db";
import { checksumOf, validateReportFile } from "./validate";
import { TaskStatus } from "./states";
import type { CredentialStore } from "./credentials";

export class BatchService {
  constructor(
    private db: DatabaseSync,
    private cfg: AppConfig,
    private queue: Queue,
    private registry: SiteRegistry,
    private credentials?: CredentialStore,
  ) {}

  create(input: { shopKeys: unknown; reportType: string; from: string; to: string;
    skipDates?: string[]; autoUpload?: boolean; forceRecollect?: boolean; erpRunId?: string }) {
    if (!Array.isArray(input.shopKeys) || input.shopKeys.length === 0) throw new Error("至少选择一家店铺");
    if (!isValidDate(input.from) || !isValidDate(input.to) || input.from > input.to) throw new Error("日期范围无效");
    if (!this.cfg.reportTypes.some((r) => r.code === input.reportType)) throw new Error("未知报表类型");
    const dates = dateRange(input.from, input.to);
    const skipDates = new Set(input.skipDates ?? []);
    if ([...skipDates].some((date) => !dates.includes(date))) throw new Error("跳过日期必须属于采集区间");
    if (input.erpRunId && !/^[0-9a-f-]{36}$/i.test(input.erpRunId)) throw new Error("ERP 任务 ID 无效");
    if (dates.length > 366) throw new Error(`日期范围为 ${dates.length} 天，最多 366 天`);
    const keys = [...new Set(input.shopKeys.map(String))];
    if (keys.length * dates.length > 10_000) throw new Error("本次店铺日任务超过 10,000 个上限");

    const shops = keys.map((key) => {
      const at = key.indexOf(":");
      const siteCode = at > 0 ? key.slice(0, at) : "";
      const shopId = at > 0 ? key.slice(at + 1) : "";
      const found = this.registry.findShop(this.cfg.mode, siteCode, shopId);
      if (!found) throw new Error(`未知店铺：${key}`);
      if (input.to > yesterdayInTz(found.site.timezone)) throw new Error(`${found.shop.name} 只能选择 ${found.site.timezone} 时区昨天及更早日期`);
      return found;
    });
    if (this.cfg.mode === "real" && this.credentials) {
      for (const {site,shop} of shops) {
        if(!["ph","sg","my"].includes(site.code)) throw new Error("不支持的站点："+site.code);
        if(input.reportType!=="product_performance") throw new Error("真实模式只支持商品表现日报");
        for(const date of dates) {
          if(skipDates.has(date)) continue;
          const old=this.db.prepare("SELECT * FROM tasks WHERE mode=? AND site=? AND shop_id=? AND report_type=? AND report_date=?").get(this.cfg.mode,site.code,shop.shop_id,input.reportType,date) as TaskRow|undefined;
          if(!input.forceRecollect) {
            try { if(old?.file_path && validateReportFile(old.file_path).ok && checksumOf(old.file_path)===old.file_checksum) continue; } catch {}
          }
          const account=old?.account_key ?? shop.account_key;
          if(!this.credentials.get(account) || this.credentials.view(account).status==="invalid" || !this.credentials.cookieHeader(account,new URL("https://seller.shopee.cn/api/"))) {
            throw new Error(shop.name+" 缺少有效凭据，请粘贴 Cookie 和 SPC_CDS");
          }
        }
      }
    }
    if(input.erpRunId)for (const {site,shop} of shops) {
      for (const date of dates) {
        if(skipDates.has(date))continue;
        const old=this.db.prepare("SELECT lease_owner,submit_intent_at,export_task_id FROM tasks WHERE mode=? AND site=? AND shop_id=? AND report_type=? AND report_date=?")
          .get(this.cfg.mode,site.code,shop.shop_id,input.reportType,date) as
          {lease_owner:string|null;submit_intent_at:string|null;export_task_id:string|null}|undefined;
        if(old?.lease_owner)throw new Error(`日期 ${date} 的采集任务正在运行，请稍后重试`);
        if(input.forceRecollect && old?.submit_intent_at && !old.export_task_id)
          throw new Error(`日期 ${date} 的导出提交结果待人工核实，请先补录报表 ID`);
      }
    }

    const now = nowIso();
    this.db
      .prepare("INSERT INTO batches (mode, report_type, date_from, date_to, status, created_at, updated_at, erp_run_id) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)")
      .run(this.cfg.mode, input.reportType, input.from, input.to, now, now, input.erpRunId ?? null);
    const batchId = Number((this.db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
    let created = 0;
    let reused = 0;
    const taskIds: number[] = [];
    for (const found of shops) {
      for (const reportDate of dates) {
        if (skipDates.has(reportDate)) {
          this.db.prepare("INSERT INTO batch_skips(batch_id,site,shop_id,report_date,reason) VALUES(?,?,?,?,?)")
            .run(batchId,found.site.code,found.shop.shop_id,reportDate,"已有日报");
          continue;
        }
        const result = this.queue.createTask({
          site: found.site.code,
          shopId: found.shop.shop_id,
          shopName: found.shop.name,
          reportType: input.reportType,
          reportDate,
          timezone: found.site.timezone,
          accountKey: found.shop.account_key,
          mode: this.cfg.mode,
        });
        if (result.created) {
          created++;
          this.queue.updateFields(result.task.id, { upload_pref: input.autoUpload ? 1 : 0, erp_run_id: input.erpRunId ?? null });
        } else {
          reused++;
          if (result.task.lease_owner) throw new Error(`日期 ${reportDate} 的采集任务正在运行，请稍后重试`);
          if (input.erpRunId) {
            this.db.prepare(`INSERT OR IGNORE INTO batch_task_history(batch_id,task_id,status,stage_detail,last_error)
              SELECT bt.batch_id,t.id,t.status,t.stage_detail,t.last_error FROM batch_tasks bt
              JOIN batches b ON b.id=bt.batch_id JOIN tasks t ON t.id=bt.task_id
              WHERE bt.task_id=? AND b.erp_run_id IS NOT NULL AND b.erp_run_id<>?`)
              .run(result.task.id,input.erpRunId);
          }
          this.queue.updateFields(result.task.id, { upload_pref: input.autoUpload ? 1 : 0,
            erp_run_id: input.erpRunId ?? null, upload_idem_key: null, import_ref: null });
          if (input.forceRecollect) {
            this.queue.updateFields(result.task.id, { export_task_id: null, submit_intent_at: null,
              file_path: null, file_checksum: null, file_rows: null, attempts: 0, next_attempt_at: null });
            this.queue.updateStatus(result.task.id, TaskStatus.PENDING, { lastError: null, stageDetail: "重新采集" });
          } else {
          if (["SAVED", "IMPORTED", "FAILED", "WAITING_AUTH", "NEEDS_CONFIG"].includes(result.task.status) && !result.task.lease_owner) {
            let valid = false;
            try {
              valid = !!result.task.file_path && validateReportFile(result.task.file_path).ok &&
                checksumOf(result.task.file_path) === result.task.file_checksum;
            } catch { /* 缺失文件需要恢复下载 */ }
            if (!valid) {
              this.queue.updateFields(result.task.id, { file_path: null, file_checksum: null, file_rows: null,
                upload_pref: input.autoUpload ? 1 : 0, attempts: 0, next_attempt_at: null });
              this.queue.updateStatus(result.task.id, result.task.export_task_id ? TaskStatus.WAITING_GENERATION : TaskStatus.PENDING,
                { lastError: null, stageDetail: "复用文件已丢失或损坏，恢复下载" });
            } else if (input.autoUpload) {
              this.queue.updateStatus(result.task.id, TaskStatus.READY_TO_UPLOAD,
                { lastError: null, stageDetail: "复用已缓存报表，等待上传" });
            } else if (["FAILED", "WAITING_AUTH", "NEEDS_CONFIG"].includes(result.task.status)) {
              this.queue.updateStatus(result.task.id, TaskStatus.SAVED,
                { lastError: null, stageDetail: "复用已缓存报表" });
            }
          }
          }
        }
        taskIds.push(result.task.id);
        this.db.prepare("INSERT OR IGNORE INTO batch_tasks (batch_id, task_id) VALUES (?, ?)").run(batchId, result.task.id);
      }
    }
    return { batchId, created, reused, skipped: skipDates.size * shops.length, total: dates.length * shops.length, taskIds };
  }

  get(batchId: number, input: { page?: number; pageSize?: number; all?: boolean } = {}) {
    const batch = this.db.prepare("SELECT * FROM batches WHERE id = ? AND mode = ?").get(batchId, this.cfg.mode) as
      | Record<string, unknown>
      | undefined;
    if (!batch) return null;
    const countRows = this.db
      .prepare("SELECT t.status, COUNT(*) AS count FROM tasks t JOIN batch_tasks bt ON bt.task_id=t.id WHERE bt.batch_id=? GROUP BY t.status")
      .all(batchId) as unknown as { status: string; count: number }[];
    const counts = Object.fromEntries(countRows.map((row) => [row.status, Number(row.count)]));
    const skips = this.db.prepare("SELECT site,shop_id,report_date,reason FROM batch_skips WHERE batch_id=? ORDER BY site,shop_id,report_date")
      .all(batchId) as {site:string;shop_id:string;report_date:string;reason:string}[];
    if (skips.length) counts.SKIPPED = skips.length;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = input.all ? Math.max(1, total) : Math.max(1, Math.min(200, Number(input.pageSize) || 50));
    const allTasks = this.db
      .prepare(
        "SELECT t.* FROM tasks t JOIN batch_tasks bt ON bt.task_id=t.id WHERE bt.batch_id=? ORDER BY t.site,t.shop_id,t.report_date",
      )
      .all(batchId) as unknown as TaskRow[];
    const history=this.db.prepare("SELECT task_id,status,stage_detail,last_error FROM batch_task_history WHERE batch_id=?")
      .all(batchId) as {task_id:number;status:string;stage_detail:string|null;last_error:string|null}[];
    const byId=new Map(history.map(row=>[row.task_id,row]));
    const visibleTasks=allTasks.map(task=>{
      const snapshot=byId.get(task.id);
      if (snapshot) {
        counts[task.status]=Math.max(0,(counts[task.status]??0)-1);
        counts[snapshot.status]=(counts[snapshot.status]??0)+1;
      }
      return snapshot?{...task,status:snapshot.status,stage_detail:snapshot.stage_detail,last_error:snapshot.last_error}:task;
    });
    const merged = [...visibleTasks, ...skips.map(skip => ({...skip, id: null, status: "SKIPPED", stage_detail: skip.reason}))]
      .sort((a,b) => `${a.site}:${a.shop_id}:${a.report_date}`.localeCompare(`${b.site}:${b.shop_id}:${b.report_date}`));
    const tasks = (input.all ? merged : merged.slice((page - 1) * pageSize, page * pageSize)) as TaskRow[];
    return { batch: { ...batch, counts, total }, tasks, page, pageSize, pages: Math.ceil(total / pageSize) };
  }

  list(limit = 50) {
    return this.db
      .prepare(
        `SELECT b.*, COUNT(bt.task_id) AS total,
           SUM(CASE WHEN EXISTS(SELECT 1 FROM downloads d WHERE d.task_id=t.id) THEN 1 ELSE 0 END) AS downloaded,
           SUM(CASE WHEN t.status='FAILED' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN t.status IN ('PENDING','SUBMITTING','WAITING_GENERATION','DOWNLOADING') THEN 1 ELSE 0 END) AS running
         FROM batches b
         LEFT JOIN batch_tasks bt ON bt.batch_id=b.id
         LEFT JOIN tasks t ON t.id=bt.task_id
         WHERE b.mode=? GROUP BY b.id ORDER BY b.id DESC LIMIT ?`,
      )
      .all(this.cfg.mode, Math.max(1, Math.min(200, limit)));
  }

  act(batchId: number, action: "pause" | "resume" | "cancel" | "retry") {
    const detail = this.get(batchId, { all: true });
    if (!detail) throw new Error("批次不存在");
    let changed = 0;
    for (const task of detail.tasks) {
      if (task.id === null) continue;
      const erpRunId=(detail.batch as Record<string,unknown>).erp_run_id;
      if (erpRunId && task.erp_run_id !== erpRunId) continue;
      const before = task.status;
      if (action === "pause") this.queue.pause(task.id);
      else if (action === "resume") this.queue.resume(task.id);
      else if (action === "cancel") this.queue.cancel(task.id);
      else if (task.status === "FAILED") this.queue.retry(task.id);
      if (this.queue.getTask(task.id)?.status !== before) changed++;
    }
    const status = action === "pause" ? "PAUSED" : action === "cancel" ? "CANCELLED" : "ACTIVE";
    this.db.prepare("UPDATE batches SET status=?, updated_at=? WHERE id=?").run(status, nowIso(), batchId);
    return { changed, batch: this.get(batchId) };
  }
}
