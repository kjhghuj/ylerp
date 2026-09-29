/**
 * SQLite 持久层（Node 内置 node:sqlite）。
 * 所有任务状态、尝试记录、文件版本、限速状态均落库，支持进程重启恢复。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config";

export type TaskRow = {
  id: number;
  biz_key: string;
  site: string;
  shop_id: string;
  shop_name: string | null;
  report_type: string;
  report_date: string;
  timezone: string;
  account_key: string;
  mode: string;
  status: string;
  stage_detail: string | null;
  attempts: number;
  export_task_id: string | null;
  match_evidence: string | null;
  submit_intent_at: string | null;
  file_path: string | null;
  file_checksum: string | null;
  file_rows: number | null;
  upload_idem_key: string | null;
  import_ref: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  upload_pref: number; // 1=采集完成后上传（受全局上传设置约束）；0=仅保存本地
  erp_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AttemptRow = {
  id: number;
  task_id: number;
  stage: string;
  outcome: string;
  detail: string | null;
  created_at: string;
};

export type DownloadRow = {
  id: number;
  task_id: number;
  revision: number;
  file_path: string;
  checksum: string;
  rows: number | null;
  format: string | null;
  worksheets: number | null;
  size_bytes: number | null;
  created_at: string;
};

export function openDb(cfg: AppConfig): DatabaseSync {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  const db = new DatabaseSync(cfg.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_key TEXT UNIQUE NOT NULL,
  mode TEXT NOT NULL,
  site TEXT NOT NULL,
  profile_dir TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  status_detail TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biz_key TEXT UNIQUE NOT NULL,
  site TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT,
  report_type TEXT NOT NULL,
  report_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  account_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  stage_detail TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  export_task_id TEXT,
  match_evidence TEXT,
  submit_intent_at TEXT,
  file_path TEXT,
  file_checksum TEXT,
  file_rows INTEGER,
  upload_idem_key TEXT,
  import_ref TEXT,
  next_attempt_at TEXT,
  last_error TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  upload_pref INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_biz ON tasks(biz_key);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  rows INTEGER,
  format TEXT,
  worksheets INTEGER,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_credentials (
  account_key TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_validated_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  report_type TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batch_tasks (
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  PRIMARY KEY(batch_id, task_id)
);
CREATE TABLE IF NOT EXISTS batch_skips (
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(batch_id, site, shop_id, report_date)
);
CREATE TABLE IF NOT EXISTS batch_task_history (
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  stage_detail TEXT,
  last_error TEXT,
  PRIMARY KEY(batch_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_batch_tasks_task ON batch_tasks(task_id);
CREATE TABLE IF NOT EXISTS ratelimit_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_allowed_at TEXT NOT NULL,
  min_interval_ms INTEGER NOT NULL,
  last_submit_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  portal_base TEXT,
  seller_center_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(mode, code)
);
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_key TEXT NOT NULL,
  login_id TEXT,
  password TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(site_id, shop_id)
);
`);
  // 旧库迁移：CREATE TABLE IF NOT EXISTS 不会为已存在的表补列
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  ensureColumn("tasks", "submit_intent_at", "submit_intent_at TEXT");
  ensureColumn("tasks", "upload_pref", "upload_pref INTEGER NOT NULL DEFAULT 1");
  ensureColumn("tasks", "erp_run_id", "erp_run_id TEXT");
  ensureColumn("batches", "erp_run_id", "erp_run_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_erp_run ON batches(erp_run_id) WHERE erp_run_id IS NOT NULL");
  ensureColumn("ratelimit_state", "last_submit_at", "last_submit_at TEXT");
  ensureColumn("downloads", "format", "format TEXT");
  ensureColumn("downloads", "worksheets", "worksheets INTEGER");
  ensureColumn("downloads", "size_bytes", "size_bytes INTEGER");

  // 限速状态初始化（持久化，重启后仍生效）
  const row = db.prepare("SELECT id FROM ratelimit_state WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO ratelimit_state (id, next_allowed_at, min_interval_ms, updated_at) VALUES (1, ?, ?, ?)").run(
      new Date(0).toISOString(),
      cfg.rateLimitMinIntervalMs,
      nowIso(),
    );
  }
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
