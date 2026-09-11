/** 补货V3 工作台 API 封装（统一错误转可读文案） */
import api from '../../src/api';
import type {
  ComputeResult,
  ComputeParams,
  PlanListItem,
  PlanSnapshot,
  RestockShop,
  SkuRuleRow,
  StockPool,
  TargetSkuItem,
} from './types';

export class RestockApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'RestockApiError';
  }
}

const toMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { error?: string } } }).response;
    if (response?.status === 401) return '登录已过期，请重新登录';
    if (response?.status === 403) return '没有补货操作权限，请联系管理员';
    if (response?.status === 404) return '店铺或资源不存在，请刷新后重试';
    if (response?.status === 409) return response.data?.error || '状态冲突，请刷新后重试';
    if (response?.status === 503) return '元仓数据暂不可用（凭证未配置或接口失败），请稍后重试';
    return response?.data?.error || fallback;
  }
  return fallback;
};

const request = async <T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> => {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    throw new RestockApiError(toMessage(error, fallback), status);
  }
};

export const fetchShops = () =>
  request<RestockShop[]>(() => api.get('/restock-v3/shops'), '获取店铺列表失败');

export const fetchPools = () =>
  request<{ pools: StockPool[] }>(() => api.get('/restock-v3/pools'), '获取库存池失败');

export const createPool = (payload: { name: string; site: string; warehouseCodes: string[] }) =>
  request<StockPool>(() => api.post('/restock-v3/pools', payload), '创建库存池失败');

export const deletePool = (id: string) =>
  request<{ deleted: boolean }>(() => api.delete(`/restock-v3/pools/${id}`), '删除库存池失败');

export const fetchTargetSkus = () =>
  request<{ items: TargetSkuItem[] }>(() => api.get('/restock-v3/target-skus'), '获取本地 SKU 失败');

export const createTargetSku = (payload: { site: string; sku: string; name?: string }) =>
  request<{ id: string }>(() => api.post('/restock-v3/target-skus', payload), '新建本地 SKU 失败');

/** 人工映射绑定的编号类型（identityKey 的类型部分）；缺省 = legacy（历史字符串映射） */
export type ExternalSkuType = 'modelCode' | 'variationSku' | 'item';

export const saveMapping = (payload: {
  shopId: string;
  externalSku: string;
  targetSku: string;
  scope?: 'shop' | 'site';
  /** 编号类型：映射只作用于该身份，不影响同字符串的其他编号类型 */
  externalSkuType?: ExternalSkuType;
}) =>
  request<{ externalSku: string; targetSku: string; externalSkuType?: string }>(
    () => api.put('/restock-v3/mapping', payload),
    '保存映射失败',
  );

/** 删除映射（店铺级或站点级）；详情抽屉的「恢复继承」入口。指定 externalSkuType 时只删除该身份 */
export const deleteMapping = (payload: {
  shopId: string;
  externalSku: string;
  scope: 'shop' | 'site';
  externalSkuType?: ExternalSkuType;
}) =>
  request<{ deleted: boolean }>(
    () => api.delete('/restock-v3/mapping', { data: payload }),
    '删除映射失败',
  );

export const fetchSkuRules = (shopId: string) =>
  request<{ site: string; rules: SkuRuleRow[] }>(
    () => api.get('/restock-v3/sku-rules', { params: { shopId } }),
    '获取 SKU 规则失败',
  );

export const saveSkuRule = (payload: {
  shopId: string;
  sku: string;
  leadTimeDays: number | null;
  safetyDays: number | null;
  growthPercent: number | null;
  scope?: 'shop' | 'site';
}) =>
  request<SkuRuleRow>(() => api.put(`/restock-v3/sku-rules/${encodeURIComponent(payload.sku)}`, payload), '保存规则失败');

export const computeRecommendations = (params: ComputeParams & { forceRefresh?: boolean }) => {
  const body: Record<string, unknown> = {
    shopIds: params.shopIds,
    from: params.from,
    to: params.to,
    planningDate: params.planningDate,
    targetDate: params.targetDate,
    leadTimeDays: params.leadTimeDays,
    safetyDays: params.safetyDays,
    growthPercent: params.growthPercent,
  };
  if (params.poolId) body.poolId = params.poolId;
  if (params.statisticsDays !== null) body.statisticsDays = params.statisticsDays;
  if (params.forceRefresh) body.forceRefresh = true;
  return request<ComputeResult>(() => api.post('/restock-v3/recommendations', body), '计算补货建议失败');
};

export const fetchPlans = (params?: { status?: string; page?: number; pageSize?: number; q?: string }) =>
  request<{ plans: PlanListItem[]; total: number; page: number; pageSize: number }>(
    () => api.get('/restock-v3/plans', { params }),
    '获取补货计划失败',
  );

export const fetchPlan = (id: string) =>
  request<{ plan: PlanSnapshot; legacy?: boolean }>(() => api.get(`/restock-v3/plans/${id}`), '获取计划详情失败');

/**
 * 保存计划（服务端权威快照）：只提交结果 ID、所选 SKU、人工确认量/原因、名称与幂等键。
 * 服务端从 resultId 重建完整快照并校验归属/有效期/可执行/原因规则。
 */
export const savePlan = (payload: {
  resultId: string;
  name: string;
  items: Array<{ sku: string; confirmedQty?: number | null; adjustReason?: string | null }>;
  idempotencyKey: string;
  sourcePlanId?: string;
}) =>
  request<{ plan: PlanSnapshot; duplicate?: boolean }>(() => api.post('/restock-v3/plans', payload), '保存计划失败');

/** 草稿编辑：乐观并发（revision），只改确认量/原因/名称 */
export const updatePlan = (id: string, payload: {
  revision: number;
  name?: string;
  edits: Array<{ sku: string; confirmedQty?: number; adjustReason?: string | null }>;
}) =>
  request<{ plan: PlanSnapshot }>(() => api.put(`/restock-v3/plans/${id}`, payload), '更新计划失败');

/** 确认计划：revision 必传（乐观并发）；过期版本服务端返回 409 */
export const confirmPlan = (id: string, revision: number) =>
  request<{ plan: PlanSnapshot; duplicatePlanWarnings: string[] }>(
    () => api.post(`/restock-v3/plans/${id}/confirm`, { revision }),
    '确认计划失败',
  );

/** 作废计划：revision 必传（乐观并发）；过期版本服务端返回 409 */
export const voidPlan = (id: string, voidReason: string, revision: number) =>
  request<{ voided: boolean }>(
    () => api.post(`/restock-v3/plans/${id}/void`, { voidReason, revision }),
    '作废计划失败',
  );

/** 已确认计划复制为新草稿版本（历史保留，supersedesId 关联） */
export const copyPlan = (id: string) =>
  request<{ plan: PlanSnapshot }>(() => api.post(`/restock-v3/plans/${id}/copy`, {}), '复制计划失败');

/** 删除 SKU 规则 = 恢复继承（店铺级或站点级） */
export const deleteSkuRule = (shopId: string, sku: string, scope: 'shop' | 'site') =>
  request<{ deleted: boolean }>(() => api.delete(`/restock-v3/sku-rules/${encodeURIComponent(sku)}`, { data: { shopId, scope } }), '恢复继承失败');

/** 全部元仓货品（异常区候选搜索用；账户级数据） */
export const fetchYcProducts = () =>
  request<{ products: Array<{ customerSku: string; customerSkuName: string | null }>; site: string | null; fetchedAt: string; warning: string | null }>(
    () => api.get('/restock-v3/yc-products'),
    '获取元仓货品失败',
  );

/** 元仓真实仓库列表（库存池管理用；账户级数据，site 仅作回显） */
export const fetchYcWarehouses = () =>
  request<{ warehouses: Array<{ code: string; name: string | null; siteCode: string | null }> }>(
    () => api.get('/restock-v3/warehouses'),
    '获取元仓仓库失败',
  );

export const exportPlanCsv = async (id: string, fileName: string): Promise<void> => {
  const response = await api.get(`/restock-v3/plans/${id}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
