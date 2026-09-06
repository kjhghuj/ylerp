/** Excel 解析 Web Worker：大文件（上限 25MB / 2 万行）解析移出主线程，上传期间 UI 不冻结 */
import { parseProductAnalysisWorkbook } from './excelParser';
import type { ParsedProductAnalysisReport } from '../types';

interface ParseRequest {
  buffer: ArrayBuffer;
  fileName: string;
}

export type ParseResponse =
  | { type: 'ok'; report: ParsedProductAnalysisReport }
  | { type: 'error'; message: string };

// 只依赖 dom lib 的最小类型声明，避免与 tsconfig 的 dom/webworker lib 冲突
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage(message: ParseResponse): void;
};

ctx.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { buffer, fileName } = event.data;
  try {
    const report = parseProductAnalysisWorkbook(buffer, fileName);
    ctx.postMessage({ type: 'ok', report });
  } catch (error) {
    ctx.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
