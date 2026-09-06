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

// ---- 区间聚合 ----

export async function fetchShopAgg(shopId: string, from: string, to: string): Promise<AggResponse> {
  const response = await api.get<AggResponse>(`/product-analysis/shops/${shopId}/agg`, {
    params: { from, to },
  });
  return response.data;
}

export async function fetchPotential(shopId: string, from: string, to: string): Promise<PotentialResponse> {
  const response = await api.get<PotentialResponse>(`/product-analysis/shops/${shopId}/potential`, {
    params: { from, to },
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
}

export async function sendProductAnalysisChat(request: ChatRequest): Promise<ChatResult> {
  const response = await api.post<ChatResult>('/product-analysis/chat', request, {
    timeout: CHAT_TIMEOUT_MS,
  });
  return response.data;
}
