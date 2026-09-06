/** 商品分析后端 API 封装（Express /api/product-analysis/*，Bearer 由 src/api.ts 拦截器附加） */
import api from '../../../src/api';
import type {
  ChatMessage,
  ChatResult,
  ParsedProductAnalysisReport,
  ReportDetail,
  ReportMeta,
} from '../types';

const CHAT_TIMEOUT_MS = 120_000;

export interface ChatRequest {
  reportId: string;
  sheetKey: string;
  itemId?: string;
  messages: ChatMessage[];
}

/** 从 axios/未知错误中提取用户可读信息（后端错误形状 { detail }） */
export function getApiErrorDetail(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: { detail?: unknown } };
      message?: unknown;
    };
    const detail = candidate.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof candidate.message === 'string' && candidate.message) return candidate.message;
  }
  return String(error);
}

export async function fetchProductAnalysisReports(): Promise<ReportMeta[]> {
  const response = await api.get<ReportMeta[]>('/product-analysis/reports');
  return response.data;
}

export async function fetchProductAnalysisReport(id: string): Promise<ReportDetail> {
  const response = await api.get<ReportDetail>(`/product-analysis/reports/${id}`);
  return response.data;
}

export async function createProductAnalysisReport(
  report: ParsedProductAnalysisReport
): Promise<ReportMeta> {
  const response = await api.post<ReportMeta>('/product-analysis/reports', report);
  return response.data;
}

export async function deleteProductAnalysisReport(id: string): Promise<void> {
  await api.delete(`/product-analysis/reports/${id}`);
}

export async function sendProductAnalysisChat(request: ChatRequest): Promise<ChatResult> {
  const response = await api.post<ChatResult>('/product-analysis/chat', request, {
    timeout: CHAT_TIMEOUT_MS,
  });
  return response.data;
}
