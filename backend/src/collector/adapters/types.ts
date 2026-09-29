/** 采集适配器接口：DEMO 与真实模式共用。 */
export type AuthState = { ok: boolean; kind: "AUTHED" | "NEEDS_LOGIN" | "NEEDS_CONFIG"; detail?: string };

export type SubmitOutcome =
  | { kind: "SUBMITTED"; exportTaskId: string; evidence: Record<string, unknown>; submittedAt?: number } // submittedAt=实际点击/请求时刻，供限速记录
  | { kind: "RATE_LIMITED"; retryAfterMs: number; message: string }
  | { kind: "WAITING_AUTH" }
  | { kind: "NEEDS_CONFIG"; detail: string }
  | { kind: "IDENTITY_MISMATCH"; expected: string; actual: string }
  | { kind: "REJECTED"; message: string }
  | { kind: "ERROR"; message: string };

export type WaitOutcome =
  | { kind: "COMPLETED"; evidence: Record<string, unknown> }
  | { kind: "FAILED"; message: string }
  | { kind: "TIMEOUT"; message: string }
  | { kind: "WAITING_AUTH" };

export type DownloadOutcome =
  | { kind: "SAVED"; filePath: string; fileName: string }
  | { kind: "FAILED"; message: string }
  | { kind: "WAITING_AUTH" };

export interface CollectorAdapter {
  /** 确保会话有效；失效时返回 NEEDS_LOGIN */
  ensureLogin(accountKey: string, shopId: string, site?: string): Promise<AuthState>;
  /** 通过页面提交单日导出；返回远端任务标识 */
  submitExport(input: {
    accountKey: string;
    site: string;
    timezone: string;
    shopId: string;
    reportType: string;
    reportDate: string;
    sinceTs: number; // 用于匹配新建任务（提交意图时刻）
  }): Promise<SubmitOutcome>;
  /** 崩溃恢复：查询导出历史确认是否已创建（不直接再点导出）。checked=false 表示无法核实（未登录/查询失败/列表不可用），调用方不得据此重新提交导出 */
  checkExistingExport(input: {
    accountKey: string;
    site: string;
    timezone: string;
    shopId: string;
    reportType: string;
    reportDate: string;
    sinceTs: number;
  }): Promise<{ exists: boolean; checked: boolean; exportTaskId?: string; status?: string }>;
  /** 有界轮询等待报表生成完成 */
  waitForExport(input: {
    accountKey: string;
    site: string;
    shopId: string;
    exportTaskId: string;
    timeoutMs: number;
    pollMs: number;
  }): Promise<WaitOutcome>;
  /** 绑定下载事件点击下载并保存 */
  downloadExport(input: {
    accountKey: string;
    site: string;
    shopId: string;
    exportTaskId: string;
    saveDir: string;
    saveName: string;
    timeoutMs: number;
  }): Promise<DownloadOutcome>;

}
