/** parseProductAnalysisWorkbook 的异步封装：优先走 Web Worker，环境不支持（jsdom 测试）时同步回退 */
import { ProductAnalysisParseError, parseProductAnalysisWorkbook } from './excelParser';
import type { ParsedProductAnalysisReport } from '../types';
import type { ParseResponse } from './excelWorker';

export function parseProductAnalysisWorkbookAsync(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedProductAnalysisReport> {
  if (typeof Worker === 'undefined') {
    try {
      return Promise.resolve(parseProductAnalysisWorkbook(buffer, fileName));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new ProductAnalysisParseError(String(error))
      );
    }
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excelWorker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      cleanup();
      const response = event.data;
      if (response.type === 'ok') resolve(response.report);
      else reject(new ProductAnalysisParseError(response.message));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new ProductAnalysisParseError(event.message || '解析工作线程异常'));
    };
    // buffer 转移所有权给 worker（主线程不再需要）
    worker.postMessage({ buffer, fileName }, [buffer]);
  });
}
