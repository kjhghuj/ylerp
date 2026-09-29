/**
 * 上传适配器接口：隔离“上传协议”与采集/调度逻辑。
 * 未来对接正式分析系统 API 时，只需新增/修改适配器与字段映射，不改动采集器、调度器与页面。
 * 设计要点：
 * - 同步受理与异步入库确认分离；HTTP 200/202 不等同业务入库成功，最终以 confirm() 为准。
 * - 幂等键稳定（内容级），网络超时后服务端可能已收到文件——先按幂等键查询再决定重传。
 */

export type UploadFileMeta = {
  site: string;
  shopId: string;
  shopName?: string | null;
  reportType: string;
  reportDate: string;
  timezone: string;
  bizKey: string;
  checksum: string;
  mode: string;
  taskId: string;
  erpRunId?: string;
  rows?: number | null;
  fileName: string;
  sizeBytes?: number | null;
  collectedAt?: string;
};

export type UploadOutcome =
  | { kind: "ACCEPTED"; importId: string; dedup: boolean }
  | { kind: "BUSINESS_REJECTED"; message: string }
  | { kind: "INVALID_FILE"; message: string }
  | { kind: "AUTH_ERROR"; status: number; message: string }
  | { kind: "HTTP_ERROR"; status: number; message: string }
  | { kind: "TIMEOUT_UNRESOLVED"; message: string }
  | { kind: "NOT_ENABLED"; message: string };

export type ConfirmOutcome =
  | { kind: "IMPORTED"; rowCount: number | null }
  | { kind: "IMPORT_FAILED"; message: string }
  | { kind: "AUTH_ERROR"; status: number; message: string }
  | { kind: "STILL_PENDING"; message: string };

export interface UploadAdapter {
  readonly kind: string;
  /** 全局是否启用上传（false = 仅保存本地模式） */
  isEnabled(): boolean;
  /** 稳定幂等键（内容级：模式 + 业务键 + 校验和） */
  idempotencyKey(meta: UploadFileMeta): string;
  /** 上传；超时后内部先按幂等键查询，避免重复传输 */
  upload(filePath: string, meta: UploadFileMeta, idemKey: string): Promise<UploadOutcome>;
  /** 异步入库结果轮询（同步确认型接口在服务端立即返回终态即可） */
  confirm(importRef: string): Promise<ConfirmOutcome>;
}
