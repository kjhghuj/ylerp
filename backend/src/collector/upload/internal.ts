import type {UploadAdapter, UploadFileMeta, UploadOutcome, ConfirmOutcome} from './types';

export interface CollectorImportPort {
  accept(file: string, metadata: Record<string,string>, key: string): Promise<{
    status: number; body: {importId?: string; dedup?: boolean; error?: string | null};
  }>;
  find(id: string): Promise<{status: string; rowCount: number | null; error: string | null} | null>;
}

const erpImports: CollectorImportPort = {
  async accept(file, metadata, key) {
    const service = await import('../../services/productAnalysisImportService');
    return service.enqueueCollectorFile(file, metadata, key);
  },
  async find(id) {
    const service = await import('../../services/productAnalysisImportService');
    return service.findCollectorImport(id);
  },
};

/** Calls ERP's existing validated import queue directly, without HTTP or service tokens. */
export class InternalUploadAdapter implements UploadAdapter {
  readonly kind = 'erp-internal';
  constructor(private imports: CollectorImportPort = erpImports) {}
  isEnabled() { return true; }
  idempotencyKey(meta: UploadFileMeta) {
    return `real:${meta.erpRunId}:${meta.bizKey}:${meta.checksum}`;
  }

  async upload(file: string, meta: UploadFileMeta, key: string): Promise<UploadOutcome> {
    try {
      const metadata = Object.fromEntries(Object.entries(meta).filter(([, value]) => value != null)
        .map(([name, value]) => [name, String(value)]));
      const response = await this.imports.accept(file, metadata, key);
      if (response.status >= 400 || !response.body.importId) {
        return {kind: 'BUSINESS_REJECTED', message: response.body.error || 'ERP 未受理报表'};
      }
      return {kind: 'ACCEPTED', importId: response.body.importId, dedup: response.body.dedup === true};
    } catch {
      return {kind: 'TIMEOUT_UNRESOLVED', message: 'ERP 入库暂不可用，将使用同一幂等键重试'};
    }
  }

  async confirm(id: string): Promise<ConfirmOutcome> {
    const deadline = Date.now() + 120_000;
    try {
      while (Date.now() < deadline) {
        const row = await this.imports.find(id);
        if (!row) return {kind: 'IMPORT_FAILED', message: 'ERP 入库记录不存在'};
        if (row.status === 'IMPORTED') return {kind: 'IMPORTED', rowCount: row.rowCount};
        if (row.status === 'FAILED') return {kind: 'IMPORT_FAILED', message: row.error || 'ERP 入库失败'};
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
    } catch {
      return {kind: 'STILL_PENDING', message: 'ERP 入库状态暂不可用，稍后继续确认'};
    }
    return {kind: 'STILL_PENDING', message: '报表已交给 ERP，等待入库确认'};
  }
}
