/**
 * 潜力商品评分（纯函数）。
 * 筛选规则：上架 ≤ 60 天、区间点击率 > 4%、区间点击数 > 5、区间加购率 > 1%，且未被封禁/删除。
 * 入围后按已确认算法排序：score = 0.35×环比增长 + 0.25×加购率 + 0.25×优化空间 + 0.15×流量基数，附中文理由。
 * 转化率统一访客口径（orders/visitors）。
 */

export const MAX_LISTED_DAYS = 60;
export const MIN_CTR_PERCENT = 4;
export const MIN_CLICKS = 5;
export const MIN_CART_RATE_PERCENT = 1;
const EXCLUDED_STATUS = new Set(['Banned', 'Deleted']);

export interface PotentialDailyRow {
  date: string;
  ordersOrdered: number;
  visitors: number;
  clicks: number;
  impressions: number;
  cartVisitors: number;
}

export interface PotentialCandidate {
  itemId: string;
  itemName: string;
  sheetKey: string;
  status?: string | null;
  /** extra.createdDays：导出当天的上架天数 */
  createdDays?: number | null;
  /** extra.createdAt：上架日期（YYYY-MM-DD 或原文本） */
  createdAt?: string | null;
  daily: PotentialDailyRow[];
}

export interface PotentialMetrics {
  ordersOrdered: number;
  visitors: number;
  clicks: number;
  impressions: number;
  cartVisitors: number;
  ctr: number | null;
  cvrConfirmed: number | null;
  cartRate: number | null;
  /** 后半程 vs 前半程 已下订单环比（%）；前半为 0 且后半 > 0 时取 100 */
  growthPercent: number | null;
}

export interface PotentialResult {
  rank: number;
  itemId: string;
  itemName: string;
  sheetKey: string;
  score: number;
  reasons: string[];
  metrics: PotentialMetrics;
}

function pct(values: number[], value: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((candidate) => candidate <= value).length;
  return (below / values.length) * 100;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function computeMetrics(candidate: PotentialCandidate): PotentialMetrics & { recentOrders: number; previousOrders: number; lastDate: string | null } {
  const sorted = [...candidate.daily].sort((a, b) => a.date.localeCompare(b.date));
  const totals = sorted.reduce(
    (acc, row) => ({
      ordersOrdered: acc.ordersOrdered + (row.ordersOrdered || 0),
      visitors: acc.visitors + (row.visitors || 0),
      clicks: acc.clicks + (row.clicks || 0),
      impressions: acc.impressions + (row.impressions || 0),
      cartVisitors: acc.cartVisitors + (row.cartVisitors || 0),
    }),
    { ordersOrdered: 0, visitors: 0, clicks: 0, impressions: 0, cartVisitors: 0 }
  );
  const midpoint = Math.floor(sorted.length / 2);
  const sumOrders = (rows: PotentialDailyRow[]) =>
    rows.reduce((total, row) => total + (row.ordersOrdered || 0), 0);
  const previousOrders = midpoint > 0 ? sumOrders(sorted.slice(0, midpoint)) : 0;
  const recentOrders = sumOrders(sorted.slice(midpoint));
  let growthPercent: number | null;
  if (previousOrders > 0) {
    growthPercent = ((recentOrders - previousOrders) / previousOrders) * 100;
  } else {
    growthPercent = recentOrders > 0 ? 100 : null;
  }
  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cvrConfirmed: totals.visitors > 0 ? (totals.ordersOrdered / totals.visitors) * 100 : null,
    cartRate: totals.visitors > 0 ? (totals.cartVisitors / totals.visitors) * 100 : null,
    growthPercent,
    recentOrders,
    previousOrders,
    lastDate: sorted.length > 0 ? sorted[sorted.length - 1].date : null,
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 上架天数：优先用导出的创建天数，其次按上架日期与区间最后一天的差值推算；两者皆缺返回 null（不具备入围资格） */
function resolveListedDays(candidate: PotentialCandidate, referenceDate: string | null): number | null {
  if (typeof candidate.createdDays === 'number' && Number.isFinite(candidate.createdDays)) {
    return candidate.createdDays;
  }
  if (typeof candidate.createdAt === 'string' && referenceDate !== null && ISO_DATE_PATTERN.test(candidate.createdAt)) {
    const diff = Math.floor(
      (Date.parse(`${referenceDate}T00:00:00.000Z`) - Date.parse(`${candidate.createdAt}T00:00:00.000Z`)) / 86_400_000
    );
    return diff >= 0 ? diff : null;
  }
  return null;
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/** 评分并排序，返回前 limit 名（rank 从 1 开始） */
export function rankPotentialItems(candidates: PotentialCandidate[], limit = 10): PotentialResult[] {
  const computed = candidates.map((candidate) => ({ candidate, metrics: computeMetrics(candidate) }));
  // 入围条件：未封禁/删除 + 上架 ≤ 60 天 + 点击率 > 4% + 点击数 > 5 + 加购率 > 1%
  const eligible = computed.filter(({ candidate, metrics }) => {
    if (EXCLUDED_STATUS.has(String(candidate.status ?? ''))) return false;
    const listedDays = resolveListedDays(candidate, metrics.lastDate);
    if (listedDays === null || listedDays > MAX_LISTED_DAYS) return false;
    if (metrics.ctr === null || metrics.ctr <= MIN_CTR_PERCENT) return false;
    if (metrics.clicks <= MIN_CLICKS) return false;
    if (metrics.cartRate === null || metrics.cartRate <= MIN_CART_RATE_PERCENT) return false;
    return true;
  });
  const metricsById = new Map(eligible.map(({ candidate, metrics }) => [candidate.itemId, metrics]));
  const listedDaysById = new Map(eligible.map(({ candidate, metrics }) => [candidate.itemId, resolveListedDays(candidate, metrics.lastDate)!]));

  const growthValues = eligible.map(({ metrics }) => metrics.growthPercent ?? -100);
  const cartValues = eligible.map(({ metrics }) => metrics.cartRate ?? 0);
  const ctrValues = eligible.map(({ metrics }) => metrics.ctr ?? 0);
  const cvrValues = eligible.map(({ metrics }) => metrics.cvrConfirmed ?? 0);
  const trafficValues = eligible.map(({ candidate, metrics }) => metrics.visitors / Math.max(1, candidate.daily.length));

  const avgCartRate = cartValues.length > 0 ? cartValues.reduce((a, b) => a + b, 0) / cartValues.length : 0;

  const scored = eligible.map(({ candidate }) => {
    const metrics = metricsById.get(candidate.itemId)!;
    // 环比 [-100%, +200%] 线性映射到 [0, 100]
    const growthScore = ((clamp(metrics.growthPercent ?? -100, -100, 200) + 100) / 3);
    const cartScore = pct(cartValues, metrics.cartRate ?? 0);
    const ctrPct = pct(ctrValues, metrics.ctr ?? 0);
    const cvrPct = pct(cvrValues, metrics.cvrConfirmed ?? 0);
    const gapScore = (ctrPct / 100) * (100 - cvrPct);
    const trafficScore = pct(trafficValues, metrics.visitors / Math.max(1, candidate.daily.length));
    const score = Number((0.35 * growthScore + 0.25 * cartScore + 0.25 * gapScore + 0.15 * trafficScore).toFixed(1));

    const reasons: string[] = [`上架 ${listedDaysById.get(candidate.itemId)} 天`];
    if (metrics.growthPercent !== null && metrics.growthPercent >= 30) {
      reasons.push(`后半程销量环比 ${metrics.growthPercent >= 0 ? '+' : ''}${metrics.growthPercent.toFixed(0)}%`);
    }
    if (metrics.cartRate !== null && avgCartRate > 0 && metrics.cartRate >= avgCartRate * 1.2) {
      reasons.push(`加购率 ${formatPercent(metrics.cartRate)} 高于店铺均值 ${formatPercent(avgCartRate)}`);
    }
    if (ctrPct >= 60 && cvrPct <= 40) {
      reasons.push(
        `点击率 ${formatPercent(metrics.ctr)} 但访客转化率仅 ${formatPercent(metrics.cvrConfirmed)}，详情页/价格有优化空间`
      );
    }
    if (trafficScore >= 70) {
      reasons.push(`访客基数居前 30%（日均 ${Math.round(metrics.visitors / Math.max(1, candidate.daily.length))}）`);
    }
    if (reasons.length === 1) {
      reasons.push('综合流量与转化表现均衡，具备提升空间');
    }

    const { recentOrders: _recent, previousOrders: _prev, lastDate: _last, ...publicMetrics } = metrics;
    return {
      rank: 0,
      itemId: candidate.itemId,
      itemName: candidate.itemName,
      sheetKey: candidate.sheetKey,
      score,
      reasons,
      metrics: publicMetrics,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, limit)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}
