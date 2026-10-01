/** 加密保存账号 Cookie。密钥位于数据目录独立文件，不写数据库、不进 Git。 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config";
import { nowIso } from "./db";

export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  hostOnly?: boolean;
  expirationDate?: number;
};

type CredentialPayload = { cookies: StoredCookie[]; spcCds: string };

export class CredentialInputError extends Error {
  readonly status = 400;
  constructor(message: string) { super(message); this.name = 'CredentialInputError'; }
}

export class CredentialStore {
  private key: Buffer;

  constructor(private db: DatabaseSync, cfg: AppConfig) {
    const keyPath = path.join(cfg.dataDir, "credential.key");
    if (!fs.existsSync(keyPath)) {
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    this.key = fs.readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("凭据加密密钥长度无效");
    this.db.exec(`CREATE TABLE IF NOT EXISTS credential_scopes (
      account_key TEXT PRIMARY KEY, scope_key TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS credential_scopes_scope ON credential_scopes(scope_key)`);
  }

  /** 同一 ERP 用户的店铺共用一份加密凭据，首次启用时采用最近保存的旧凭据。 */
  registerScope(scopeKey: string, accountKeys: string[]) {
    if (!/^erp-user:[a-z0-9_-]{1,128}$/i.test(scopeKey) ||
      accountKeys.some(key => !/^erp-[0-9a-f-]{36}$/i.test(key))) throw new Error("共用凭据范围无效");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const key of accountKeys) {
        const prior = this.db.prepare("SELECT scope_key FROM credential_scopes WHERE account_key=?").get(key) as {scope_key: string} | undefined;
        if (prior && prior.scope_key !== scopeKey) throw new Error("凭据来源已属于其他账号");
        this.db.prepare("INSERT OR IGNORE INTO credential_scopes(account_key,scope_key) VALUES(?,?)").run(key, scopeKey);
      }
      this.db.prepare(`INSERT OR IGNORE INTO account_credentials
        (account_key,encrypted_payload,status,last_validated_at,last_error,updated_at)
        SELECT ?,c.encrypted_payload,c.status,c.last_validated_at,c.last_error,c.updated_at
        FROM account_credentials c JOIN credential_scopes s ON s.account_key=c.account_key
        WHERE s.scope_key=? ORDER BY c.updated_at DESC,c.account_key LIMIT 1`).run(scopeKey, scopeKey);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private credentialKey(accountKey: string): string {
    const scope = this.db.prepare("SELECT scope_key FROM credential_scopes WHERE account_key=?").get(accountKey) as {scope_key: string} | undefined;
    return scope?.scope_key ?? accountKey;
  }

  relatedAccounts(accountKey: string): string[] {
    const scopeKey = this.credentialKey(accountKey);
    const rows = this.db.prepare("SELECT account_key FROM credential_scopes WHERE scope_key=?").all(scopeKey) as {account_key: string}[];
    return rows.length ? rows.map(row => row.account_key) : [accountKey];
  }

  save(accountKey: string, cookiesInput: unknown, spcCdsInput?: string): boolean {
    accountKey = this.credentialKey(accountKey);
    const cookies = this.normalizeCookies(cookiesInput);
    const cookieCds = cookies.find((c) => c.name === "SPC_CDS")?.value ?? "";
    if (spcCdsInput !== undefined && typeof spcCdsInput !== 'string') throw new CredentialInputError('SPC_CDS 格式无效');
    const spcCds = (spcCdsInput ?? "").trim() || cookieCds.trim();
    if (!spcCds || spcCds.length > 4096 || /[\r\n]/.test(spcCds)) throw new CredentialInputError("请填写有效的 SPC_CDS");
    const plain = JSON.stringify({ cookies, spcCds } satisfies CredentialPayload);
    if (JSON.stringify(this.get(accountKey)) === plain) return false;
    const encrypted = this.encrypt(plain);
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO account_credentials (account_key, encrypted_payload, status, last_validated_at, last_error, updated_at)
         VALUES (?, ?, 'pending', NULL, NULL, ?)
         ON CONFLICT(account_key) DO UPDATE SET encrypted_payload=excluded.encrypted_payload, status='pending',
           last_validated_at=NULL, last_error=NULL, updated_at=excluded.updated_at`,
      )
      .run(accountKey, encrypted, now);
    return true;
  }

  get(accountKey: string): CredentialPayload | null {
    const row = this.db.prepare("SELECT encrypted_payload FROM account_credentials WHERE account_key = ?").get(this.credentialKey(accountKey)) as
      | { encrypted_payload: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(this.decrypt(row.encrypted_payload)) as CredentialPayload;
  }

  view(accountKey: string) {
    const row = this.db
      .prepare("SELECT account_key, status, last_validated_at, last_error, updated_at FROM account_credentials WHERE account_key = ?")
      .get(this.credentialKey(accountKey)) as Record<string, unknown> | undefined;
    return row ? {...row, account_key: accountKey} : { account_key: accountKey, status: "missing", last_validated_at: null, last_error: null, updated_at: null };
  }

  markValid(accountKey: string) {
    const scopeKey = this.credentialKey(accountKey);
    const now = nowIso();
    this.db
      .prepare("UPDATE account_credentials SET status='valid', last_validated_at=?, last_error=NULL WHERE account_key=?")
      .run(now, scopeKey);
    this.db.prepare(`UPDATE accounts SET status='ok', status_detail=NULL, updated_at=?
      WHERE account_key=? OR account_key IN (SELECT account_key FROM credential_scopes WHERE scope_key=?)`).run(now, accountKey, scopeKey);
  }

  markInvalid(accountKey: string, detail: string) {
    const scopeKey = this.credentialKey(accountKey);
    const now = nowIso();
    this.db.prepare("UPDATE account_credentials SET status='invalid', last_error=? WHERE account_key=?").run(detail, scopeKey);
    this.db.prepare(`UPDATE accounts SET status='WAITING_AUTH', status_detail=?, updated_at=?
      WHERE account_key=? OR account_key IN (SELECT account_key FROM credential_scopes WHERE scope_key=?)`).run(detail, now, accountKey, scopeKey);
  }

  cookieHeader(accountKey: string, url: URL): string {
    const payload = this.get(accountKey);
    if (!payload) return "";
    const nowSec = Date.now() / 1000;
    return payload.cookies
      .filter((c) => {
        const domain = c.domain.replace(/^\./, "").toLowerCase();
        const host = url.hostname.toLowerCase();
        return (
          (host === domain || (!c.hostOnly && host.endsWith(`.${domain}`))) &&
          (url.pathname === c.path || url.pathname.startsWith((c.path || "/").replace(/\/$/, "") + "/")) &&
          (!c.secure || url.protocol === "https:") &&
          (!c.expirationDate || c.expirationDate > nowSec)
        );
      })
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  private normalizeCookies(input: unknown): StoredCookie[] {
    if (!Array.isArray(input) || input.length === 0 || input.length > 300) throw new CredentialInputError("Cookie JSON 必须包含 1–300 条 Cookie");
    const out: StoredCookie[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== "object") throw new CredentialInputError("Cookie 项格式无效");
      const r = raw as Record<string, unknown>;
      if (typeof r.name !== 'string' || typeof r.value !== 'string') throw new CredentialInputError('Cookie 项需有 name 和 value 字符串');
      const name = String(r.name ?? "").trim();
      const value = String(r.value ?? "");
      const domain = String(r.domain ?? "").trim().toLowerCase();
      const normalizedDomain = domain.replace(/^\./, "");
      if(/[\r\n;]/.test(value) || /[\s=;\r\n]/.test(name)) throw new CredentialInputError("Cookie 含无效字符");
      if (!name || !value || !["shopee.cn", "seller.shopee.cn"].includes(normalizedDomain)) continue;
      out.push({
        name,
        value,
        domain,
        path: String(r.path ?? "/") || "/",
        secure: r.secure === true,
        httpOnly: r.httpOnly === true,
        hostOnly: r.hostOnly === true,
        expirationDate: Number.isFinite(Number(r.expirationDate)) ? Number(r.expirationDate) : undefined,
      });
    }
    if (!out.length) throw new CredentialInputError("未找到 seller.shopee.cn 可用 Cookie");
    return out;
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
  }

  decrypt(blob: string): string {
    const [iv, tag, body] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }
}
