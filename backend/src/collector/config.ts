import path from 'node:path';

export type AppConfig = {
  mode: 'real';
  dataDir: string;
  downloadDir: string;
  dbPath: string;
  logFile: string;
  rateLimitMinIntervalMs: number;
  rateLimitScope: 'site' | 'global';
  workerTickMs: number;
  workerMaxConcurrency: number;
  waitGenerationTimeoutMs: number;
  waitGenerationPollMs: number;
  downloadTimeoutMs: number;
  reportTypes: {code: string; name: string}[];
};

function positive(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** ERP owns the queue, encrypted credentials and original workbooks in one persistent directory. */
export function loadConfig(dataDir = process.env.PRODUCT_ANALYSIS_COLLECTOR_DIR || path.join(process.cwd(), 'data', 'product-analysis-collector')): AppConfig {
  const root = path.resolve(dataDir);
  return {
    mode: 'real', dataDir: root, downloadDir: path.join(root, 'downloads'),
    dbPath: path.join(root, 'collector.db'), logFile: path.join(root, 'collector.log'),
    rateLimitMinIntervalMs: Math.max(70_000, positive('PRODUCT_ANALYSIS_COLLECTOR_INTERVAL_MS', 70_000)),
    rateLimitScope: 'site', workerTickMs: 2_000, workerMaxConcurrency: 3,
    waitGenerationTimeoutMs: 180_000, waitGenerationPollMs: 5_000, downloadTimeoutMs: 120_000,
    reportTypes: [{code: 'product_performance', name: '商品表现日报'}],
  };
}

export function reportTypeName(cfg: AppConfig, code: string) {
  return cfg.reportTypes.find(type => type.code === code)?.name ?? code;
}
