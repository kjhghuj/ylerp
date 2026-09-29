import path from 'node:path';
import {getCollector} from '../collector/runtime';

/** Existing ERP routes dispatch inside the API process without a separate service or token. */
export async function collectorRequest<T>(operation: string, options: {method?: string; body?: unknown} = {}): Promise<T> {
  return getCollector().request<T>(operation, options);
}

export async function collectorReportFile(batchId: number, taskId: number) {
  const report = getCollector().reportFile(batchId, taskId);
  return {path: report.file_path!, fileName: path.basename(report.file_path!)};
}
