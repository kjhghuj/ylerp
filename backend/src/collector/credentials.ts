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
  }

  save(accountKey: string, cookiesInput: unknown, spcCdsInput?: string): boolean {
    const cookies = this.normalizeCookies(cookiesInput);
    const cookieCds = cookies.find((c) => c.name === "SPC_CDS")?.value ?? "";
    const spcCds = String(spcCdsInput ?? "").trim() || cookieCds.trim();
    if (!spcCds) throw new Error("请单独填写 SPC_CDS");
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
    const row = this.db.prepare("SELECT encrypted_payload FROM account_credentials WHERE account_key = ?").get(accountKey) as
      | { encrypted_payload: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(this.decrypt(row.encrypted_payload)) as CredentialPayload;
  }

  view(accountKey: string) {
    const row = this.db
      .prepare("SELECT account_key, status, last_validated_at, last_error, updated_at FROM account_credentials WHERE account_key = ?")
      .get(accountKey) as Record<string, unknown> | undefined;
    return row ?? { account_key: accountKey, status: "missing", last_validated_at: null, last_error: null, updated_at: null };
  }

  markValid(accountKey: string) {
    const now = nowIso();
    this.db
      .prepare("UPDATE account_credentials SET status='valid', last_validated_at=?, last_error=NULL WHERE account_key=?")
      .run(now, accountKey);
    this.db.prepare("UPDATE accounts SET status='ok', status_detail=NULL, updated_at=? WHERE account_key=?").run(now, accountKey);
  }

  markInvalid(accountKey: string, detail: string) {
    const now = nowIso();
    this.db.prepare("UPDATE account_credentials SET status='invalid', last_error=? WHERE account_key=?").run(detail, accountKey);
    this.db.prepare("UPDATE accounts SET status='WAITING_AUTH', status_detail=?, updated_at=? WHERE account_key=?").run(detail, now, accountKey);
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
    if (!Array.isArray(input) || input.length === 0) throw new Error("Cookie JSON 必须是非空数组");
    const out: StoredCookie[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== "object") throw new Error("Cookie 项格式无效");
      const r = raw as Record<string, unknown>;
      const name = String(r.name ?? "").trim();
      const value = String(r.value ?? "");
      const domain = String(r.domain ?? "").trim().toLowerCase();
      const normalizedDomain = domain.replace(/^\./, "");
      if(/[\r\n;]/.test(value) || /[\s=;\r\n]/.test(name)) throw new Error("Cookie 含无效字符");
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
    if (!out.length) throw new Error("未找到 seller.shopee.cn 可用 Cookie");
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
