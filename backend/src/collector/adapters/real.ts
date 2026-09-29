/** 真实 Shopee 商品表现日报适配器：Cookie + 官方卖家中心 HTTP 接口。 */
import fs from "node:fs";
import path from "node:path";
import type { CollectorAdapter, AuthState, SubmitOutcome, WaitOutcome, DownloadOutcome } from "./types";
import type { CredentialStore } from "../credentials";
import { addDays, tzTimeToUtc } from "../dates";
import { validateReportFile } from "../validate";

type ApiResponse = { code?: number; errcode?: number; message?: string; user_message?: string; data?: Record<string, unknown> };

export const REAL_SHOPEE_REGIONS = ["ph", "sg", "my"] as const;
export function isSupportedRealRegion(site: string): boolean {
  return (REAL_SHOPEE_REGIONS as readonly string[]).includes(site.toLowerCase());
}

export class RealAdapter implements CollectorAdapter {
  constructor(private credentials: CredentialStore) {}

  async ensureLogin(accountKey: string, _shopId: string, site?: string): Promise<AuthState> {
    if (!site || !isSupportedRealRegion(site)) {
      return { ok: false, kind: "NEEDS_CONFIG", detail: `真实采集暂不支持站点代码 ${site || "（空）"}，当前支持 ph、sg、my` };
    }
    const credential = this.credentials.get(accountKey);
    if (!credential) return { ok: false, kind: "NEEDS_LOGIN", detail: "账号尚未导入 Cookie" };
    if (this.credentials.view(accountKey).status === "invalid") return { ok: false, kind: "NEEDS_LOGIN", detail: "请重新登录 Shopee 后粘贴新的 Cookie 和 SPC_CDS" };
    if (!credential.spcCds) return { ok: false, kind: "NEEDS_CONFIG", detail: "账号缺少 SPC_CDS" };
    return { ok: true, kind: "AUTHED" };
  }

  async submitExport(input: {
    accountKey: string;
    site: string;
    timezone: string;
    shopId: string;
    reportType: string;
    reportDate: string;
    sinceTs: number;
  }): Promise<SubmitOutcome> {
    if (input.reportType !== "product_performance") {
      return { kind: "NEEDS_CONFIG", detail: `真实模式尚未支持报表类型 ${input.reportType}` };
    }
    const credential = this.credentials.get(input.accountKey);
    if (!isSupportedRealRegion(input.site)) return { kind: "NEEDS_CONFIG", detail: "任务站点快照只支持 ph、sg、my" };
    if (!credential) return { kind: "WAITING_AUTH" };
    const [y, m, d] = input.reportDate.split("-").map(Number);
    const next = addDays(input.reportDate, 1).split("-").map(Number);
    const startTs = Math.floor(tzTimeToUtc(y, m, d, 0, 0, input.timezone) / 1000);
    const endTs = Math.floor(tzTimeToUtc(next[0], next[1], next[2], 0, 0, input.timezone) / 1000);
    const url = this.apiUrl("/api/mydata/cnsc/shop/v3/product/performance/export/", {
      start_ts: String(startTs),
      end_ts: String(endTs),
      period: "day",
      sort_by: "",
      acc: "false",
      SPC_CDS: credential.spcCds,
      SPC_CDS_VER: "2",
      cnsc_shop_id: input.shopId,
      cbsc_shop_region: input.site,
    });
    const result = await this.requestJson(input.accountKey, input.shopId, url);
    if (result.kind === "auth") return { kind: "WAITING_AUTH" };
    if (result.kind === "error") return { kind: "ERROR", message: result.message };
    if (result.status === 429) {
      return { kind: "RATE_LIMITED", retryAfterMs: result.retryAfterMs ?? 70_000, message: "Shopee 请求过于频繁（HTTP 429）" };
    }
    if (result.body.code !== 0 || !result.body.data?.report_id) {
      return { kind: "REJECTED", message: result.body.user_message || result.body.message || "Shopee 未返回报表 ID" };
    }
    this.credentials.markValid(input.accountKey);
    return {
      kind: "SUBMITTED",
      exportTaskId: String(result.body.data.report_id),
      submittedAt: Date.now(),
      evidence: { status: result.body.data.status, fileName: result.body.data.report_file_name, requestTime: result.body.data.request_time },
    };
  }

  async checkExistingExport(): Promise<{ exists: boolean; checked: boolean }> {
    return { exists: false, checked: false };
  }

  async waitForExport(input: {
    accountKey: string;
    site: string;
    shopId: string;
    exportTaskId: string;
    timeoutMs: number;
    pollMs: number;
  }): Promise<WaitOutcome> {
    const credential = this.credentials.get(input.accountKey);
    if (!credential) return { kind: "WAITING_AUTH" };
    const url = this.apiUrl("/api/v3/settings/get_report/", {
      SPC_CDS: credential.spcCds,
      SPC_CDS_VER: "2",
      report_id: input.exportTaskId,
      cnsc_shop_id: input.shopId,
      cbsc_shop_region: input.site,
    });
    const deadline = Date.now() + input.timeoutMs;
    let lastStatus: unknown = null;
    while (Date.now() < deadline) {
      const result = await this.requestJson(input.accountKey, input.shopId, url);
      if (result.kind === "auth") return { kind: "WAITING_AUTH" };
      if (result.kind === "error") return { kind: "TIMEOUT", message: result.message };
      if (result.status === 429) return { kind: "TIMEOUT", message: "Shopee 查询限流（HTTP 429），稍后继续使用原 report_id 查询" };
      if (result.body.code !== 0) return { kind: "FAILED", message: result.body.user_message || result.body.message || "报表查询失败" };
      lastStatus = result.body.data?.status;
      if (lastStatus === 2 || lastStatus === 3) {
        this.credentials.markValid(input.accountKey);
        return { kind: "COMPLETED", evidence: { status: lastStatus, reportId: input.exportTaskId } };
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, input.pollMs)));
    }
    return { kind: "TIMEOUT", message: `等待报表生成超时，最后状态=${String(lastStatus)}` };
  }

  async downloadExport(input: {
    accountKey: string;
    site: string;
    shopId: string;
    exportTaskId: string;
    saveDir: string;
    saveName: string;
    timeoutMs: number;
  }): Promise<DownloadOutcome> {
    const credential = this.credentials.get(input.accountKey);
    if (!credential) return { kind: "WAITING_AUTH" };
    const url = this.apiUrl("/api/v3/settings/download_report/", {
      SPC_CDS: credential.spcCds,
      SPC_CDS_VER: "2",
      report_id: input.exportTaskId,
      cnsc_shop_id: input.shopId,
      cbsc_shop_region: input.site,
    });
    const response = await this.request(input.accountKey, input.shopId, url, input.timeoutMs);
    if (response.kind === "auth") return { kind: "WAITING_AUTH" };
    if (response.kind === "error") return { kind: "FAILED", message: response.message };
    if (!response.response.ok) return { kind: "FAILED", message: `下载失败：HTTP ${response.response.status}` };
    const declaredSize = Number(response.response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > 200 * 1024 * 1024) {
      return { kind: "FAILED", message: "下载文件超过 200MB 限制" };
    }
    const bytes = Buffer.from(await response.response.arrayBuffer());
    if (bytes.length > 200 * 1024 * 1024) return { kind: "FAILED", message: "下载文件超过 200MB 限制" };
    fs.mkdirSync(input.saveDir, { recursive: true });
    const finalName = input.saveName.toLowerCase().endsWith(".xlsx") ? input.saveName : input.saveName.replace(/\.[^.]+$/, "") + ".xlsx";
    const finalPath = path.join(input.saveDir, path.basename(finalName));
    const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, bytes, { flag: "wx" });
      const checked = validateReportFile(tempPath);
      if (!checked.ok || checked.format !== "xlsx") return { kind: "FAILED", message: checked.ok ? "下载内容不是 XLSX" : checked.reason };
      fs.renameSync(tempPath, finalPath);
      this.credentials.markValid(input.accountKey);
      return { kind: "SAVED", filePath: finalPath, fileName: path.basename(finalPath) };
    } catch (e) {
      return { kind: "FAILED", message: `保存下载文件失败：${(e as Error).message}` };
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
  }

  private apiUrl(endpoint: string, params: Record<string, string>): URL {
    const url = new URL(endpoint, "https://seller.shopee.cn");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  private async requestJson(accountKey: string, shopId: string, url: URL) {
    const result = await this.request(accountKey, shopId, url, 30_000);
    if (result.kind !== "ok") return result;
    if (result.response.status === 429) {
      const raw = result.response.headers.get("retry-after");
      const delay = raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw)*1000 : raw ? Date.parse(raw)-Date.now() : 0;
      return {kind:"ok" as const, body:{} as ApiResponse, status:429,
        retryAfterMs: Number.isFinite(delay) && delay>0 ? delay : 70_000};
    }
    try {
      const retryAfter = Number(result.response.headers.get("retry-after"));
      return {
        kind: "ok" as const,
        body: (await result.response.json()) as ApiResponse,
        status: result.response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      };
    } catch {
      return { kind: "error" as const, message: `Shopee 返回了非 JSON 响应（HTTP ${result.response.status}）` };
    }
  }

  private async request(accountKey: string, shopId: string, url: URL, timeoutMs: number) {
    if (url.protocol !== "https:" || url.hostname !== "seller.shopee.cn") return { kind: "error" as const, message: "拒绝向非 Shopee 地址发送凭据" };
    const cookie = this.credentials.cookieHeader(accountKey, url);
    if (!cookie) return { kind: "auth" as const };
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: {
          Accept: "application/json, application/force-download, text/plain, */*",
          Cookie: cookie,
          Referer: `https://seller.shopee.cn/datacenter/product/performance?cnsc_shop_id=${encodeURIComponent(shopId)}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 401) {
        this.credentials.markInvalid(accountKey, "Shopee 登录已失效（HTTP 401）");
        return { kind: "auth" as const };
      }
      if (response.status === 403) {
        const text = await response.clone().text().catch(() => "");
        const block = response.headers.get("x-gw-block") ?? "";
        if (/invalid cookie|token not found|login|auth/i.test(`${block} ${text}`)) {
          this.credentials.markInvalid(accountKey, "Shopee Cookie 已失效或缺少登录令牌");
          return { kind: "auth" as const };
        }
        return { kind: "error" as const, message: `Shopee 拒绝请求（HTTP 403）：${text.slice(0, 120)}` };
      }
      if (response.status >= 300 && response.status < 400) return { kind: "error" as const, message: "Shopee 返回重定向，已拒绝跨地址传递 Cookie" };
      return { kind: "ok" as const, response };
    } catch (e) {
      return { kind: "error" as const, message: `Shopee 请求失败：${(e as Error).message}` };
    }
  }
}
