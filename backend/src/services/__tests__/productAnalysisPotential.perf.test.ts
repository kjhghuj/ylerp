/**
 * 新品榜评分性能基准（可重复合成数据，无时序断言，仅输出实测数据）：
 * - legacy：改版前实现 —— 环比按记录数对半分 + 每次评分全量扫描的 O(n²) 百分位 pct()；
 * - current：现行实现 —— 查询区间等长日历窗口 + 预排序二分百分位 buildPercentileRanker()。
 * 输出各规模下的耗时，验证百分位排名从反复全量扫描到预排序查询的复杂度改善；
 * 另输出新品榜查询不加载 variations 时的 JSON 体积差（字段精简的数据规模收益）。
 */

import {
  rankPotentialItems,
  type PotentialCandidate,
  type PotentialDailyRow,
  type PotentialMetrics,
} from '../productAnalysisPotential';

/** mulberry32：确定性 PRNG，保证每次运行生成完全相同的合成数据 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANGE_DAYS = 30;

function buildCandidates(count: number): PotentialCandidate[] {
  const random = mulberry32(20260909);
  return Array.from({ length: count }, (_, itemIndex) => {
    const base = 5 + random() * 50;
    const trend = random() < 0.5 ? 0.5 + random() : 1 - random() * 0.5;
    const daily: PotentialDailyRow[] = Array.from({ length: RANGE_DAYS }, (_, dayIndex) => {
      const date = `2026-08-${String(dayIndex + 2).padStart(2, '0')}`; // 2026-08-02 ~ 2026-08-31
      const factor = trend ** (dayIndex / 4);
      const visitors = Math.round(base * factor * 20);
      const clicks = Math.round(visitors * (0.08 + random() * 0.08));
      return {
        date,
        ordersOrdered: Math.round(base * factor * (0.4 + random() * 0.4)),
        visitors,
        clicks,
        // ctr = clicks/impressions ≈ 5%~20%，加购率 ≈ 2%~10%：默认阈值下可入围，评分样本不空心
        impressions: Math.round(clicks * (5 + random() * 10)),
        cartVisitors: Math.round(visitors * (0.02 + random() * 0.08)),
      };
    });
    return {
      itemId: `item-${itemIndex}`,
      itemName: `合成商品 ${itemIndex}`,
      sheetKey: 'new',
      status: random() < 0.03 ? 'Banned' : 'Normal',
      daily,
    };
  });
}

// ---- 改版前实现（照搬 git 历史，仅用于对照计时） ----

function legacyPct(values: number[], value: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((candidate) => candidate <= value).length;
  return (below / values.length) * 100;
}

function legacyComputeMetrics(candidate: PotentialCandidate): PotentialMetrics {
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
  const sumOrders = (rows: PotentialDailyRow[]) => rows.reduce((total, row) => total + (row.ordersOrdered || 0), 0);
  const previousOrders = midpoint > 0 ? sumOrders(sorted.slice(0, midpoint)) : 0;
  const recentOrders = sumOrders(sorted.slice(midpoint));
  let growthPercent: number | null;
  if (previousOrders > 0) growthPercent = ((recentOrders - previousOrders) / previousOrders) * 100;
  else growthPercent = recentOrders > 0 ? 100 : null;
  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cvrOrdered: totals.visitors > 0 ? (totals.ordersOrdered / totals.visitors) * 100 : null,
    cartRate: totals.visitors > 0 ? (totals.cartVisitors / totals.visitors) * 100 : null,
    growthPercent,
    growthStatus: 'ok',
    growthWindowDays: 0,
    growthPreviousObservedDays: 0,
    growthRecentObservedDays: 0,
  };
}

function legacyRank(candidates: PotentialCandidate[], limit: number) {
  // 对照口径：全部候选参与评分（等价于现行 OPTIONS 的“不限”最坏场景），百分位为 O(n²) 全量扫描
  const computed = candidates.map((candidate) => ({ candidate, metrics: legacyComputeMetrics(candidate) }));
  const eligible = computed;
  const growthValues = eligible.map(({ metrics }) => metrics.growthPercent ?? -100);
  const cartValues = eligible.map(({ metrics }) => metrics.cartRate ?? 0);
  const ctrValues = eligible.map(({ metrics }) => metrics.ctr ?? 0);
  const cvrValues = eligible.map(({ metrics }) => metrics.cvrOrdered ?? 0);
  const trafficValues = eligible.map(({ candidate, metrics }) => (metrics.visitors ?? 0) / Math.max(1, candidate.daily.length));
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return eligible
    .map(({ candidate, metrics }) => {
      const growthScore = ((clamp(metrics.growthPercent ?? -100, -100, 200) + 100) / 3);
      const cartScore = legacyPct(cartValues, metrics.cartRate ?? 0);
      const ctrPct = legacyPct(ctrValues, metrics.ctr ?? 0);
      const cvrPct = legacyPct(cvrValues, metrics.cvrOrdered ?? 0);
      const gapScore = (ctrPct / 100) * (100 - cvrPct);
      const trafficScore = legacyPct(trafficValues, (metrics.visitors ?? 0) / Math.max(1, candidate.daily.length));
      const score = 0.35 * growthScore + 0.25 * cartScore + 0.25 * gapScore + 0.15 * trafficScore;
      return { itemId: candidate.itemId, score: Number(score.toFixed(1)) };
    })
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, limit);
}

function time(label: string, run: () => void): number {
  const started = process.hrtime.bigint();
  run();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  // eslint-disable-next-line no-console
  console.log(`[perf] ${label}: ${elapsedMs.toFixed(1)} ms`);
  return elapsedMs;
}

const OPTIONS = {
  minCtrPercent: null,
  minClicks: null,
  minCartRatePercent: null,
  excludeBannedDeleted: false,
  range: { from: '2026-08-02', to: '2026-08-31' },
};

describe('rankPotentialItems performance benchmark', () => {
  test.each([1_000, 2_000, 5_000])('synthetic dataset with %i candidates x 30 days', (count) => {
    const candidates = buildCandidates(count);
    // 预热 JIT（各跑一次小规模不计时；计时跑取 3 次中位数）
    legacyRank(candidates.slice(0, Math.min(200, count)), 10);
    rankPotentialItems(candidates.slice(0, Math.min(200, count)), OPTIONS);

    const legacyTimes: number[] = [];
    const currentTimes: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      legacyTimes.push(time(`legacy  n=${count} round=${round + 1}`, () => { legacyRank(candidates, 10); }));
      currentTimes.push(time(`current n=${count} round=${round + 1}`, () => { rankPotentialItems(candidates, OPTIONS); }));
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const legacyMs = median(legacyTimes);
    const currentMs = median(currentTimes);
    // eslint-disable-next-line no-console
    console.log(`[perf] summary n=${count} candidates x ${RANGE_DAYS} days -> legacy median ${legacyMs.toFixed(1)} ms, current median ${currentMs.toFixed(1)} ms`);

    // 正确性 sanity：两种实现返回相同数量且按分数降序
    const legacyResult = legacyRank(candidates, 10);
    const currentResult = rankPotentialItems(candidates, OPTIONS);
    expect(currentResult).toHaveLength(10);
    expect(legacyResult).toHaveLength(currentResult.length);
    for (let index = 1; index < currentResult.length; index += 1) {
      expect(currentResult[index - 1].score).toBeGreaterThanOrEqual(currentResult[index].score);
    }
  }, 120_000);

  test('quantifies payload saved by not loading variations in the potential query', () => {
    // 合成与详情等价的变体数据（每商品 5 个变体），对比 select 带/不带 variations 的 JSON 体积
    const random = mulberry32(7);
    const itemCount = 1_000;
    const baseRows = Array.from({ length: itemCount }, (_, index) => ({
      itemId: `item-${index}`,
      itemName: `合成商品 ${index}`,
      sheetKey: 'new',
      status: 'Normal',
      visitors: Math.round(random() * 500),
      clicks: Math.round(random() * 80),
      impressions: Math.round(random() * 5000),
      ordersOrdered: Math.round(random() * 20),
      cartVisitors: Math.round(random() * 40),
      extra: { sheetKeys: ['new'] },
    }));
    const withVariations = baseRows.map((row) => ({
      ...row,
      variations: Array.from({ length: 5 }, () => ({
        variationSku: `SKU-${Math.floor(random() * 1e9)}`,
        variationName: `规格-${Math.floor(random() * 1000)}`,
        unitsOrdered: Math.round(random() * 30),
        cartUnits: Math.round(random() * 30),
      })),
    }));
    const sizeWithout = JSON.stringify(baseRows).length;
    const sizeWith = JSON.stringify(withVariations).length;
    // eslint-disable-next-line no-console
    console.log(
      `[perf] potential query payload for ${itemCount} rows: without variations ${(sizeWithout / 1024).toFixed(0)} KB, with variations ${(sizeWith / 1024).toFixed(0)} KB (${((1 - sizeWithout / sizeWith) * 100).toFixed(0)}% reduction)`
    );
    expect(sizeWith).toBeGreaterThan(sizeWithout);
  });
});
