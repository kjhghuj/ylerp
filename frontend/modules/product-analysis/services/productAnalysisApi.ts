/** 商品分析后端 API 封装（Express /api/product-analysis/*，Bearer 由 src/api.ts 拦截器附加） */
import api from '../../../src/api';
import type {
  AggResponse,
  ChatMessage,
  ChatResult,
  DayMeta,
  ItemDetailResponse,
  ParsedProductAnalysisReport,
  PotentialResponse,
  PotentialFilters,
  ShopDraft,
  ShopMeta,
} from '../types';

const CHAT_TIMEOUT_MS = 130_000;

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

// ---- 店铺 ----

export async function fetchShops(): Promise<ShopMeta[]> {
  const response = await api.get<ShopMeta[]>('/product-analysis/shops');
  return response.data;
}

export async function createShop(draft: ShopDraft): Promise<ShopMeta> {
  const response = await api.post<ShopMeta>('/product-analysis/shops', draft);
  return response.data;
}

export async function updateShop(id: string, patch: Partial<ShopDraft>): Promise<ShopMeta> {
  const response = await api.patch<ShopMeta>(`/product-analysis/shops/${id}`, patch);
  return response.data;
}

export async function deleteShop(id: string): Promise<void> {
  await api.delete(`/product-analysis/shops/${id}`);
}

// ---- 每日上传 ----

export async function fetchShopDays(shopId: string): Promise<DayMeta[]> {
  const response = await api.get<DayMeta[]>(`/product-analysis/shops/${shopId}/days`);
  return response.data;
}

export async function uploadDailyReport(
  shopId: string,
  date: string,
  payload: ParsedProductAnalysisReport
): Promise<{ date: string; itemCount: number }> {
  const response = await api.post(`/product-analysis/shops/${shopId}/daily-uploads`, { date, payload });
  return response.data;
}

export async function deleteDailyUpload(shopId: string, date: string): Promise<void> {
  await api.delete(`/product-analysis/shops/${shopId}/daily-uploads/${date}`);
}

export async function batchDeleteDailyUploads(shopId: string, dates: string[]): Promise<number> {
  const response = await api.post<{ ok: true; deletedCount: number }>(
    `/product-analysis/shops/${shopId}/daily-uploads/batch-delete`,
    { dates }
  );
  return response.data.deletedCount;
}

// ---- 区间聚合 ----

export async function fetchShopAgg(shopId: string, from: string, to: string): Promise<AggResponse> {
  const response = await api.get<AggResponse>(`/product-analysis/shops/${shopId}/agg`, {
    params: { from, to },
  });
  return response.data;
}

export async function fetchPotential(
  shopId: string,
  from: string,
  to: string,
  filters?: PotentialFilters
): Promise<PotentialResponse> {
  const response = await api.get<PotentialResponse>(`/product-analysis/shops/${shopId}/potential`, {
    params: {
      from,
      to,
      // null → 'none'（服务端解释为不限制该条件）
      ...(filters ? {
        minCtr: filters.minCtrPercent ?? 'none',
        minClicks: filters.minClicks ?? 'none',
        minCartRate: filters.minCartRatePercent ?? 'none',
        excludeBannedDeleted: filters.excludeBannedDeleted ? '1' : '0',
        limit: filters.limit,
      } : {}),
    },
  });
  return response.data;
}

export async function fetchShopItem(
  shopId: string,
  itemId: string,
  from: string,
  to: string
): Promise<ItemDetailResponse> {
  const response = await api.get<ItemDetailResponse>(
    `/product-analysis/shops/${shopId}/items/${encodeURIComponent(itemId)}`,
    { params: { from, to } }
  );
  return response.data;
}

// ---- GLM AI 对话（店铺区间模式；from/to 缺省时后端默认近 7 天） ----

export interface ChatRequest {
  shopId: string;
  from?: string;
  to?: string;
  itemId?: string;
  messages: ChatMessage[];
  requestKey?: string;
  operationId?: string;
  /** false 时后端对 GLM 系列降低/关闭深度思考，换取更快首字 */
  deepThinking?: boolean;
}

export async function sendProductAnalysisChat(request: ChatRequest): Promise<ChatResult> {
  const response = await api.post<ChatResult>('/product-analysis/chat', {
    ...request,
    requestKey: request.requestKey || crypto.randomUUID(),
    operationId: request.operationId || crypto.randomUUID(),
  }, {
    timeout: CHAT_TIMEOUT_MS,
  });
  return response.data;
}

// ---- 流式对话（SSE）：fetch 逐块读取，onDelta 收到增量文本 ----

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** 与 axios 错误形状兼容（{ response: { data: { detail } } }），便于 getApiErrorDetail 提取 */
function chatStreamError(detail: string): Error {
  return Object.assign(new Error(detail), { response: { data: { detail } } });
}

/** 解析一段 SSE 缓冲：返回 data 负载与未完成的尾部行 */
export function consumeSseLines(buffer: string): { events: string[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (data) events.push(data);
  }
  return { events, rest };
}

export interface ChatStreamEvents {
  onDelta: (delta: string) => void;
  /** 推理模型的思考过程增量（与正文分开传输） */
  onReasoning?: (reasoning: string) => void;
  onDone?: (model: string) => void;
}

/** 流式发送对话：结束后 resolve；错误（含流中途的错误事件）以 detail 形状抛出 */
export async function sendProductAnalysisChatStream(request: ChatRequest, events: ChatStreamEvents): Promise<void> {
  const token = localStorage.getItem('erp_token');
  const response = await fetch(`${API_BASE}/product-analysis/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...request,
      stream: true,
      requestKey: request.requestKey || crypto.randomUUID(),
      operationId: request.operationId || crypto.randomUUID(),
    }),
  });

  if (!response.ok || !response.body) {
    let detail = `请求失败（HTTP ${response.status}）`;
    try {
      const data = await response.json();
      if (typeof data?.detail === 'string' && data.detail) detail = data.detail;
    } catch { /* 非 JSON 响应时用默认文案 */ }
    throw chatStreamError(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const consumed = consumeSseLines(buffer);
    buffer = consumed.rest;
    for (const event of consumed.events) {
      if (event === '[DONE]') continue;
      let parsed: { delta?: unknown; reasoning?: unknown; done?: unknown; error?: unknown; model?: unknown };
      try {
        parsed = JSON.parse(event);
      } catch {
        continue; // 无法解析的行跳过
      }
      if (typeof parsed.error === 'string' && parsed.error) {
        throw chatStreamError(parsed.error);
      }
      if (typeof parsed.reasoning === 'string' && parsed.reasoning) {
        events.onReasoning?.(parsed.reasoning);
      }
      if (typeof parsed.delta === 'string' && parsed.delta) {
        events.onDelta(parsed.delta);
      }
      if (parsed.done) {
        events.onDone?.(typeof parsed.model === 'string' ? parsed.model : '');
      }
    }
  }
}
