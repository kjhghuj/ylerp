import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {loadConfig, type AppConfig} from './config';
import {openDb, type TaskRow} from './db';
import {Queue} from './queue';
import {RateLimiter} from './ratelimit';
import {CredentialStore} from './credentials';
import {SiteRegistry} from './registry';
import {BatchService} from './batches';
import {RealAdapter, isSupportedRealRegion} from './adapters/real';
import type {CollectorAdapter} from './adapters/types';
import {Pipeline} from './pipeline';
import {Worker} from './worker';
import {InternalUploadAdapter, type CollectorImportPort} from './upload/internal';
import {checksumOf, validateReportFile} from './validate';

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), {status});
}

export class CollectorRuntime {
  readonly db;
  readonly queue;
  readonly credentials;
  readonly registry;
  readonly batches;
  readonly pipeline;
  readonly worker;
  readonly workerId = `erp-collector-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  private started = false;

  constructor(readonly cfg: AppConfig = loadConfig(), options: {imports?: CollectorImportPort; adapter?: (credentials: CredentialStore) => CollectorAdapter} = {}) {
    this.db = openDb(cfg);
    // Keep existing connection IDs so ERP bindings and migrated credentials remain usable.
    this.db.exec(`CREATE TABLE IF NOT EXISTS browser_connections (
      id TEXT PRIMARY KEY, account_key TEXT NOT NULL, name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'real', created_at TEXT NOT NULL
    )`);
    this.queue = new Queue(this.db, cfg);
    this.credentials = new CredentialStore(this.db, cfg);
    this.registry = new SiteRegistry(this.db);
    this.batches = new BatchService(this.db, cfg, this.queue, this.registry, this.credentials);
    const adapter = options.adapter?.(this.credentials) ?? new RealAdapter(this.credentials);
    const limiter = new RateLimiter(this.db, cfg.rateLimitMinIntervalMs, Date.now, 'real', cfg.rateLimitScope);
    const upload = new InternalUploadAdapter(options.imports);
    this.pipeline = new Pipeline(cfg, this.db, this.queue, limiter, adapter, () => upload, this.workerId);
    this.worker = new Worker(this.db, cfg, this.queue, this.pipeline, this.workerId);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.queue.recoverOnStartup();
    this.worker.start();
  }

  async stop() {
    this.worker.stop();
    const deadline = Date.now() + 15_000;
    while (this.worker.busyCount() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (!this.worker.busyCount()) this.db.close();
  }

  reportFile(batchId: number, taskId: number) {
    const row = this.db.prepare(`SELECT t.* FROM tasks t
      JOIN batch_tasks bt ON bt.task_id=t.id JOIN batches b ON b.id=bt.batch_id
      WHERE b.id=? AND t.id=? AND b.mode='real' AND t.mode='real' AND b.erp_run_id=t.erp_run_id`)
      .get(batchId, taskId) as TaskRow | undefined;
    if (!row?.file_path || !row.file_checksum) fail(404, '批次报表不存在');
    const relative = path.relative(this.cfg.downloadDir, row.file_path);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail(409, '报表路径不在 ERP 数据目录中');
    try {
      if (!validateReportFile(row.file_path).ok || checksumOf(row.file_path) !== row.file_checksum) fail(409, '批次报表校验失败');
    } catch { fail(409, '批次报表文件不可用'); }
    return row;
  }

  /** Compatibility dispatcher used only by authenticated ERP routes and its import worker. */
  async request<T>(requestPath: string, options: {method?: string; body?: unknown} = {}): Promise<T> {
    if (!requestPath.startsWith('/api/erp/')) fail(400, '无效的 ERP 采集操作');
    const url = new URL(requestPath, 'http://erp-internal');
    const route = url.pathname.replace('/api/erp/', '');
    const method = options.method ?? 'GET';
    const body = (options.body ?? {}) as Record<string, any>;
    const result = this.dispatch(route, method, body, url.searchParams);
    return result as T;
  }

  private dispatch(route: string, method: string, body: Record<string, any>, query: URLSearchParams): unknown {
    if (route === 'shared-credentials' && (method === 'GET' || method === 'POST')) {
      const scopeKey = String(body.scopeKey ?? '');
      if (!Array.isArray(body.accountKeys) || body.accountKeys.some((key: unknown) => typeof key !== 'string')) fail(400, '凭据来源无效');
      this.credentials.registerScope(scopeKey, body.accountKeys);
      if (method === 'POST') {
        this.credentials.save(scopeKey, body.cookies, body.spcCds);
        for (const key of this.credentials.relatedAccounts(scopeKey)) this.queue.resumeAccountTasks(key);
      }
      const payload = this.credentials.get(scopeKey);
      return {cookies: payload?.cookies ?? [], spcCds: payload?.spcCds ?? '', credential: this.credentials.view(scopeKey)};
    }
    if (route === 'connections' && method === 'POST') {
      const accountKey = String(body.accountKey ?? '');
      if (!/^erp-[0-9a-f-]{36}$/i.test(accountKey)) fail(400, '凭据来源 ID 无效');
      if (body.credentialScopeKey) this.credentials.registerScope(String(body.credentialScopeKey), [accountKey]);
      const id = crypto.randomUUID(), now = new Date().toISOString();
      this.db.prepare("INSERT OR IGNORE INTO accounts(account_key,mode,site,profile_dir,status,updated_at) VALUES(?,'real','','','WAITING_AUTH',?)").run(accountKey, now);
      this.db.prepare("INSERT INTO browser_connections(id,account_key,name,mode,created_at) VALUES(?,?,?,'real',?)")
        .run(id, accountKey, String(body.name ?? 'ERP 店铺').slice(0, 80), now);
      return {ok: true, connectionId: id};
    }
    const connectionMatch = /^connections\/([^/]+)(\/manual)?$/.exec(route);
    if (connectionMatch) {
      const row = this.db.prepare("SELECT id,account_key FROM browser_connections WHERE id=? AND mode='real'")
        .get(decodeURIComponent(connectionMatch[1])) as {id: string; account_key: string} | undefined;
      if (!row) fail(404, '凭据连接不存在');
      if (method === 'POST' && connectionMatch[2]) {
        this.credentials.save(row.account_key, body.cookies, body.spcCds);
        for (const key of this.credentials.relatedAccounts(row.account_key)) this.queue.resumeAccountTasks(key);
        return {ok: true, credential: this.credentials.view(row.account_key)};
      }
      if (method === 'GET' && !connectionMatch[2]) return {ok: true, connectionId: row.id, paired: false, credential: this.credentials.view(row.account_key)};
    }
    if (route === 'bind-shop' && method === 'POST') {
      const site = String(body.site ?? '').toLowerCase(), shopId = String(body.shopId ?? '');
      if (!isSupportedRealRegion(site) || !/^[0-9]{4,24}$/.test(shopId)) fail(400, '站点或 Shopee 店铺 ID 无效');
      const connection = this.connection(String(body.connectionId ?? ''));
      let siteRow = this.registry.sitesForMode('real').find(row => row.code === site);
      if (!siteRow) {
        this.registry.createSite({mode: 'real', code: site, name: site.toUpperCase(),
          timezone: site === 'ph' ? 'Asia/Manila' : site === 'my' ? 'Asia/Kuala_Lumpur' : 'Asia/Singapore'});
        siteRow = this.registry.sitesForMode('real').find(row => row.code === site)!;
      }
      const existing = this.registry.findShop('real', site, shopId);
      if (existing && existing.shop.account_key !== connection.account_key) fail(409, '此 Shopee 店铺已绑定其他凭据来源');
      if (!existing) this.registry.createShop(siteRow.id, {shopId, name: String(body.name ?? shopId).slice(0, 80), accountKey: connection.account_key});
      return {ok: true, site, shopId, connectionId: body.connectionId};
    }
    if (route === 'batches' && method === 'POST') {
      const runId = String(body.erpRunId ?? '');
      const prior = this.db.prepare("SELECT id FROM batches WHERE erp_run_id=? AND mode='real'").get(runId) as {id: number} | undefined;
      if (prior) return {ok: true, batchId: prior.id, dedup: true};
      const site = String(body.site ?? '').toLowerCase(), shopId = String(body.shopId ?? '');
      const connection = this.connection(String(body.connectionId ?? ''));
      const shop = this.registry.findShop('real', site, shopId);
      if (!shop || shop.shop.account_key !== connection.account_key) fail(409, '店铺与凭据连接不匹配');
      return {ok: true, ...this.batches.create({shopKeys: [`${site}:${shopId}`], reportType: 'product_performance',
        from: String(body.from ?? ''), to: String(body.to ?? ''), skipDates: body.skipDates,
        autoUpload: true, forceRecollect: body.forceRecollect === true, erpRunId: runId})};
    }
    const byRun = /^batches\/by-run\/([^/]+)$/.exec(route);
    if (byRun && method === 'GET') {
      const row = this.db.prepare("SELECT id FROM batches WHERE erp_run_id=? AND mode='real'").get(byRun[1]) as {id: number} | undefined;
      if (!row) fail(404, 'ERP 批次不存在');
      return {ok: true, batchId: row.id};
    }
    const task = /^batches\/(\d+)\/tasks\/(\d+)\/(file|retry-upload)$/.exec(route);
    if (task && ((task[3] === 'file' && method === 'GET') || (task[3] === 'retry-upload' && method === 'POST'))) {
      const row = this.reportFile(Number(task[1]), Number(task[2]));
      if (task[3] === 'retry-upload') {
        const result = this.queue.retryUpload(row.id);
        if (!result.ok) fail(409, result.error ?? '当前状态不能重试入库');
        return {ok: true, taskId: row.id, status: result.task!.status};
      }
      return {ok: true, taskId: row.id, erpRunId: row.erp_run_id, site: row.site, shopId: row.shop_id,
        reportDate: row.report_date, checksum: row.file_checksum};
    }
    const batch = /^batches\/(\d+)(?:\/(pause|resume|cancel|retry))?$/.exec(route);
    if (batch) {
      const found = this.batches.get(Number(batch[1]), {page: Number(query.get('page')) || 1, pageSize: Number(query.get('pageSize')) || 20});
      if (!found || !(found.batch as Record<string,unknown>).erp_run_id) fail(404, 'ERP 批次不存在');
      if (method === 'GET' && !batch[2]) return {ok: true, ...found};
      if (method === 'POST' && batch[2]) return {ok: true, ...this.batches.act(Number(batch[1]), batch[2] as 'pause' | 'resume' | 'cancel' | 'retry')};
    }
    fail(404, 'ERP 采集操作不存在');
  }

  private connection(id: string) {
    const row = this.db.prepare("SELECT account_key FROM browser_connections WHERE id=? AND mode='real'").get(id) as {account_key: string} | undefined;
    if (!row) fail(404, '凭据连接不存在');
    return row;
  }
}

let current: CollectorRuntime | undefined;
let releaseLock: (() => void) | undefined;

export function getCollector(): CollectorRuntime {
  if (current) return current;
  const cfg = loadConfig();
  fs.mkdirSync(cfg.dataDir, {recursive: true});
  const lock = path.join(cfg.dataDir, 'erp-collector.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); alive = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') alive = true; }
    }
    if (alive) throw new Error('ERP 采集数据目录已由另一个后端进程使用');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), {flag: 'wx', mode: 0o600});
  releaseLock = () => { try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch {} };
  try {
    current = new CollectorRuntime(cfg);
    current.start();
    process.once('exit', releaseLock);
    return current;
  } catch (error) { releaseLock(); throw error; }
}

export function stopCollectorClaims(): void {
  current?.worker.stop();
}

export async function stopCollector() {
  if (current) await current.stop();
  if (!current?.worker.busyCount()) releaseLock?.();
}
