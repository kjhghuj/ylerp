/** 商品分析展示层数据加工：漏斗、汇总、排序、格式化（纯函数，无副作用） */
import type { FunnelStage, ParentProduct, SheetGroup } from '../types';

/** 模块级复用 Intl 实例：toLocaleString 每次调用都会走 Intl 构造，列表渲染时是热点 */
const MONEY_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COUNT_FORMATTER = new Intl.NumberFormat('zh-CN');

/** 转化漏斗五级：曝光 → 点击 → 访客 → 加购件数 → 订单。
 *  缺失阶段（含 undefined/NaN 等非有限值）一律归一为 null（显示「—」，不伪造零值）；
 *  相邻阶段任一缺失或上一阶段 ≤ 0 时不计算转化率（不产生虚假 0%/NaN%）；
 *  当前阶段为真实 0 且上一阶段有效 > 0 时显示 0%。 */
export function buildFunnelStages(item: ParentProduct): FunnelStage[] {
  const keys: FunnelStage['key'][] = ['impressions', 'clicks', 'visitors', 'cartUnits', 'orders'];
  const metricByKey: Record<FunnelStage['key'], number | null> = {
    impressions: item.impressions,
    clicks: item.clicks,
    visitors: item.visitors,
    cartUnits: item.cartUnits,
    orders: item.ordersOrdered,
  };
  const toFiniteOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  let prevValue: number | null = null;
  return keys.map((key) => {
    const value = toFiniteOrNull(metricByKey[key]);
    const rateFromPrev =
      value !== null && prevValue !== null && prevValue > 0 ? (value / prevValue) * 100 : null;
    prevValue = value;
    return { key, value, rateFromPrev };
  });
}

export interface SheetSummary {
  itemCount: number;
  totalSalesOrdered: number;
  totalSalesConfirmed: number;
  totalOrders: number;
  totalVisitors: number;
  totalClicks: number;
}

function sumMetric(items: ParentProduct[], key: keyof ParentProduct): number {
  return items.reduce((total, item) => {
    const value = item[key];
    return typeof value === 'number' && Number.isFinite(value) ? total + value : total;
  }, 0);
}

/** 工作表总量汇总（各自有效观测求和）。
 *  注意：加权转化率不在此计算——总量与比率的成对有效样本不同，
 *  由后端按展示范围返回（sheets[].summary.weightedCvr），不得用总量互除重算。 */
export function summarizeSheet(group: SheetGroup): SheetSummary {
  return {
    itemCount: group.items.length,
    totalSalesOrdered: sumMetric(group.items, 'salesOrdered'),
    totalSalesConfirmed: sumMetric(group.items, 'salesConfirmed'),
    totalOrders: sumMetric(group.items, 'ordersOrdered'),
    totalVisitors: sumMetric(group.items, 'visitors'),
    totalClicks: sumMetric(group.items, 'clicks'),
  };
}

export type SortDirection = 'asc' | 'desc';

/** 指标比较器：null 缺失恒排最后，同值按 itemId 稳定排序，direction 控制数值方向 */
export function compareByMetric(
  key: keyof ParentProduct,
  direction: SortDirection = 'desc'
): (a: ParentProduct, b: ParentProduct) => number {
  return (a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    const aNum = typeof aValue === 'number' ? aValue : null;
    const bNum = typeof bValue === 'number' ? bValue : null;
    if (aNum === null && bNum === null) return a.itemId.localeCompare(b.itemId);
    if (aNum === null) return 1;
    if (bNum === null) return -1;
    if (bNum !== aNum) return direction === 'asc' ? aNum - bNum : bNum - aNum;
    return a.itemId.localeCompare(b.itemId);
  };
}

/** 预拼接的小写检索串（itemId/商品名/全部变体名，'\n' 分隔）。
 *  搜索框是单行 input，查询串不含换行，includes 语义与逐字段 OR 匹配等价 */
export function buildItemHaystack(item: ParentProduct): string {
  const parts: string[] = [item.itemId, item.itemName];
  // 聚合端点的商品不携带变体（详情端点才有），此处需容忍缺失
  for (const variation of item.variations ?? []) {
    if (variation.variationName) parts.push(variation.variationName);
  }
  return parts.join('\n').toLowerCase();
}

/** 与 items 平行的小写索引数组：每次切换 sheet 构建一次，键入搜索时只做 includes */
export function buildSearchHaystacks(items: ParentProduct[]): string[] {
  return items.map(buildItemHaystack);
}

/** 搜索匹配：itemId / itemName / 变体名 包含查询串（大小写不敏感） */
export function matchesSearch(item: ParentProduct, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return buildItemHaystack(item).includes(query);
}

/** 列表主路径：haystack 过滤 + 指标排序（返回新数组，不动入参） */
export function filterAndSortItems(
  items: ParentProduct[],
  haystacks: string[],
  rawQuery: string,
  sortKey: keyof ParentProduct,
  direction: SortDirection = 'desc'
): ParentProduct[] {
  const query = rawQuery.trim().toLowerCase();
  const matched = query
    ? items.filter((_, index) => haystacks[index]?.includes(query))
    : items.slice();
  return matched.sort(compareByMetric(sortKey, direction));
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${currency} ${MONEY_FORMATTER.format(value)}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return COUNT_FORMATTER.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}
