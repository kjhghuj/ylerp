/**
 * 潜力商品评分（纯函数）。
 * 已确认的默认算法：score = 0.35×环比增长 + 0.25×加购率 + 0.25×优化空间 + 0.15×流量基数，
 * 排除封禁/删除商品与区间总访客不足 MIN_TOTAL_VISITORS 的商品，附中文理由。
 * 转化率统一访客口径（orders/visitors）。
 */

export const MIN_TOTAL_VISITORS = 50;
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

function computeMetrics(candidate: PotentialCandidate): PotentialMetrics & { recentOrders: number; previousOrders: number } {
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
  };
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/** 评分并排序，返回前 limit 名（rank 从 1 开始） */
export function rankPotentialItems(candidates: PotentialCandidate[], limit = 10): PotentialResult[] {
  const eligible = candidates.filter(
    (candidate) =>
      !EXCLUDED_STATUS.has(String(candidate.status ?? '')) &&
      candidate.daily.reduce((total, row) => total + (row.visitors || 0), 0) >= MIN_TOTAL_VISITORS
  );
  const metricsById = new Map(eligible.map((candidate) => [candidate.itemId, computeMetrics(candidate)]));

  const growthValues = eligible
    .map((candidate) => metricsById.get(candidate.itemId)!.growthPercent ?? -100);
  const cartValues = eligible
    .map((candidate) => metricsById.get(candidate.itemId)!.cartRate ?? 0);
  const ctrValues = eligible
    .map((candidate) => metricsById.get(candidate.itemId)!.ctr ?? 0);
  const cvrValues = eligible
    .map((candidate) => metricsById.get(candidate.itemId)!.cvrConfirmed ?? 0);
  const trafficValues = eligible.map((candidate) => {
    const metrics = metricsById.get(candidate.itemId)!;
    return metrics.visitors / Math.max(1, candidate.daily.length);
  });

  const avgCartRate = cartValues.length > 0 ? cartValues.reduce((a, b) => a + b, 0) / cartValues.length : 0;

  const scored = eligible.map((candidate) => {
    const metrics = metricsById.get(candidate.itemId)!;
    // 环比 [-100%, +200%] 线性映射到 [0, 100]
    const growthScore = ((clamp(metrics.growthPercent ?? -100, -100, 200) + 100) / 3);
    const cartScore = pct(cartValues, metrics.cartRate ?? 0);
    const ctrPct = pct(ctrValues, metrics.ctr ?? 0);
    const cvrPct = pct(cvrValues, metrics.cvrConfirmed ?? 0);
    const gapScore = (ctrPct / 100) * (100 - cvrPct);
    const trafficScore = pct(trafficValues, metrics.visitors / Math.max(1, candidate.daily.length));
    const score = Number((0.35 * growthScore + 0.25 * cartScore + 0.25 * gapScore + 0.15 * trafficScore).toFixed(1));

    const reasons: string[] = [];
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
    if (reasons.length === 0) {
      reasons.push('综合流量与转化表现均衡，具备提升空间');
    }

    const { recentOrders: _recent, previousOrders: _prev, ...publicMetrics } = metrics;
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
