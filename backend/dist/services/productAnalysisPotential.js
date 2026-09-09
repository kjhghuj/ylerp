"use strict";
/**
 * 新商品分析评分（纯函数）。
 * 数据根基：区间内出现在「新上架商品」sheet 的商品（由路由层筛选后传入）。
 * 筛选规则默认：区间点击率 > 4%、区间点击数 > 5、区间加购率 > 1%，且未被封禁/删除；
 * 全部阈值可由调用方覆盖（null = 不限该条件），前端筛选面板即基于此。
 * 入围后按已确认算法排序：score = 0.35×环比增长 + 0.25×加购率 + 0.25×优化空间 + 0.15×流量基数，附中文理由。
 *
 * 环比口径（growthPercent）：
 * - 基于查询区间建立两个等长日历窗口（所有商品共用同一窗口）：奇数天舍弃最早一天，
 *   如 7 天区间 = 前 3 天（第 2~4 天）vs 后 3 天（第 5~7 天）；
 * - 每窗口仅使用「有效订单观测」（ordersOrdered 非 null 的日期）：真实 0 单是有效观测，
 *   缺失指标（null，当日导出无该数据）为未知，不计为 0 也不计入样本；
 * - 覆盖度要求：前、后窗口各需 ≥1 条有效订单观测，否则 growthPercent = null；
 * - 前窗口有效订单确实全部为 0 且后窗口 > 0：无法计算百分比（growthStatus = 'new-orders'，不伪造 +∞）；
 * - 区间仅 1 天或某侧窗口无有效观测：growthPercent = null（'insufficient' / 'no-data'），
 *   评分中增长项记 0 分——缺失数据既无奖励也无惩罚。
 *
 * 缺失指标语义：ordersOrdered/visitors 等为 null 表示未知（与 0 严格区分）；合计仅统计有效观测，
 * 比率（ctr / cvrOrdered / cartRate）分子分母仅使用两者均有观测的日期（成对完整样本），避免口径错配；
 * 成对比率复用 productAnalysisAggregation.pairwiseRatio，与聚合/详情同名指标同一有效样本口径。
 * 环比覆盖度：growthPreviousObservedDays / growthRecentObservedDays 返回两侧窗口的有效订单观测天数，
 * 供前端展示「前期 1/3 天 · 后期 3/3 天」；环比基于有效观测的日均订单。
 *
 * 转化率口径：cvrOrdered = 已下订单 / 访客（下单口径），区别于详情页的 cvrConfirmed（已确认口径）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CART_RATE_PERCENT = exports.MIN_CLICKS = exports.MIN_CTR_PERCENT = void 0;
exports.buildGrowthWindows = buildGrowthWindows;
exports.buildPercentileRanker = buildPercentileRanker;
exports.rankPotentialItems = rankPotentialItems;
const productAnalysisAggregation_1 = require("./productAnalysisAggregation");
exports.MIN_CTR_PERCENT = 4;
exports.MIN_CLICKS = 5;
exports.MIN_CART_RATE_PERCENT = 1;
const EXCLUDED_STATUS = new Set(['Banned', 'Deleted']);
function parseDateUtc(date) {
    return new Date(`${date}T00:00:00.000Z`);
}
function dateString(date) {
    return date.toISOString().slice(0, 10);
}
function addDays(date, delta) {
    const next = parseDateUtc(date);
    next.setUTCDate(next.getUTCDate() + delta);
    return dateString(next);
}
function daysBetweenInclusive(from, to) {
    return Math.round((parseDateUtc(to).getTime() - parseDateUtc(from).getTime()) / 86_400_000) + 1;
}
/** 由查询区间推导两个等长日历窗口（区间内所有商品共用）：
 *  偶数天对半分；奇数天舍弃最早一天（如 7 天 = 后 3 天 vs 此前 3 天）；不足 2 天无窗口。 */
function buildGrowthWindows(range) {
    const totalDays = daysBetweenInclusive(range.from, range.to);
    const windowDays = Math.floor(totalDays / 2);
    if (windowDays < 1)
        return { windowDays: 0, previousDays: new Set(), recentDays: new Set() };
    const recentFrom = addDays(range.to, -(windowDays - 1));
    const previousFrom = addDays(recentFrom, -windowDays);
    const previousDays = new Set();
    const recentDays = new Set();
    for (let offset = 0; offset < windowDays; offset += 1) {
        previousDays.add(addDays(previousFrom, offset));
        recentDays.add(addDays(recentFrom, offset));
    }
    return { windowDays, previousDays, recentDays };
}
/** 百分位排名器：预排序后二分统计 ≤value 的个数，替代逐次全量扫描（O(n²) → O(n log n)）；
 *  语义与 values.filter(v => v <= value).length / n 一致（并列值同分） */
function buildPercentileRanker(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return (value) => {
        if (sorted.length === 0)
            return 50;
        let low = 0;
        let high = sorted.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (sorted[mid] <= value)
                low = mid + 1;
            else
                high = mid;
        }
        return (low / sorted.length) * 100;
    };
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** 有效观测求和：仅统计字段非 null 的日期；无有效观测返回 null（未知 ≠ 0） */
function sumObserved(rows, field) {
    let total = null;
    for (const row of rows) {
        const value = row[field];
        if (typeof value === 'number')
            total = (total ?? 0) + value;
    }
    return total;
}
/** 成对比率（%）：复用聚合服务的 pairwiseRatio，保证同名指标（ctr / cvrOrdered / cartRate）同一有效样本口径 */
function pairwisePercent(rows, numerator, denominator) {
    const ratio = (0, productAnalysisAggregation_1.pairwiseRatio)(rows, numerator, denominator);
    return ratio === null ? null : ratio * 100;
}
function computeMetrics(candidate, windows) {
    const sorted = [...candidate.daily].sort((a, b) => a.date.localeCompare(b.date));
    // 环比：仅使用「有效订单观测」（ordersOrdered 非 null）；缺失观测不计为零，也不参与样本
    // 覆盖度要求：前、后窗口各需 ≥1 条有效订单观测，否则视为样本不足
    let growthPercent = null;
    let growthStatus;
    let previousObservedDays = 0;
    let recentObservedDays = 0;
    if (windows.windowDays >= 1) {
        const observedOrders = (rows) => rows.filter((row) => typeof row.ordersOrdered === 'number');
        const previousObserved = observedOrders(sorted.filter((row) => windows.previousDays.has(row.date)));
        const recentObserved = observedOrders(sorted.filter((row) => windows.recentDays.has(row.date)));
        previousObservedDays = previousObserved.length;
        recentObservedDays = recentObserved.length;
        if (previousObserved.length === 0 && recentObserved.length === 0) {
            growthStatus = 'no-data';
        }
        else if (previousObserved.length === 0 || recentObserved.length === 0) {
            growthStatus = 'insufficient';
        }
        else {
            const averageOrders = (rows) => rows.reduce((total, row) => total + row.ordersOrdered, 0) / rows.length;
            const previousAvg = averageOrders(previousObserved);
            const recentAvg = averageOrders(recentObserved);
            if (previousAvg === 0 && recentAvg > 0) {
                // 仅当前期有效订单确实全部为 0 时才标记新增订单
                growthStatus = 'new-orders';
            }
            else {
                growthStatus = 'ok';
                growthPercent = previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / previousAvg) * 100;
            }
        }
    }
    else {
        growthStatus = 'insufficient';
    }
    return {
        ordersOrdered: sumObserved(sorted, 'ordersOrdered'),
        visitors: sumObserved(sorted, 'visitors'),
        clicks: sumObserved(sorted, 'clicks'),
        impressions: sumObserved(sorted, 'impressions'),
        cartVisitors: sumObserved(sorted, 'cartVisitors'),
        ctr: pairwisePercent(sorted, 'clicks', 'impressions'),
        cvrOrdered: pairwisePercent(sorted, 'ordersOrdered', 'visitors'),
        cartRate: pairwisePercent(sorted, 'cartVisitors', 'visitors'),
        growthPercent,
        growthStatus,
        growthWindowDays: windows.windowDays,
        growthPreviousObservedDays: previousObservedDays,
        growthRecentObservedDays: recentObservedDays,
    };
}
function formatPercent(value) {
    return value === null ? '—' : `${value.toFixed(1)}%`;
}
/** 阈值归一：0 与 null 都视为"不限"（填 0 是用户放宽条件的常见习惯，不应卡出"必须>0"） */
function normalizeThreshold(value, fallback) {
    if (value === null)
        return null;
    if (value === undefined)
        return fallback;
    return value > 0 ? value : null;
}
/** options.range 缺省时（历史直连调用方）按全部候选的日期并集推导窗口，仅作兜底 */
function resolveWindows(candidates, range) {
    if (range)
        return buildGrowthWindows(range);
    let min = null;
    let max = null;
    for (const candidate of candidates) {
        for (const row of candidate.daily) {
            if (min === null || row.date < min)
                min = row.date;
            if (max === null || row.date > max)
                max = row.date;
        }
    }
    return min && max ? buildGrowthWindows({ from: min, to: max }) : { windowDays: 0, previousDays: new Set(), recentDays: new Set() };
}
/** 评分并排序，返回前 limit 名（rank 从 1 开始）；阈值条件由 options 覆盖，0/null 表示不限 */
function rankPotentialItems(candidates, options = {}) {
    const resolved = {
        minCtrPercent: normalizeThreshold(options.minCtrPercent, exports.MIN_CTR_PERCENT),
        minClicks: normalizeThreshold(options.minClicks, exports.MIN_CLICKS),
        minCartRatePercent: normalizeThreshold(options.minCartRatePercent, exports.MIN_CART_RATE_PERCENT),
        excludeBannedDeleted: options.excludeBannedDeleted !== undefined ? options.excludeBannedDeleted : true,
        limit: options.limit !== undefined && options.limit > 0 ? options.limit : 10,
    };
    const windows = resolveWindows(candidates, options.range);
    const computed = candidates.map((candidate) => ({ candidate, metrics: computeMetrics(candidate, windows) }));
    // 入围条件（任一项为 null 即跳过该条件）；指标未知（null，无有效观测）不能满足任何正阈值
    const eligible = computed.filter(({ candidate, metrics }) => {
        if (resolved.excludeBannedDeleted && EXCLUDED_STATUS.has(String(candidate.status ?? '')))
            return false;
        if (resolved.minCtrPercent !== null && (metrics.ctr === null || metrics.ctr <= resolved.minCtrPercent))
            return false;
        if (resolved.minClicks !== null && (metrics.clicks === null || metrics.clicks <= resolved.minClicks))
            return false;
        if (resolved.minCartRatePercent !== null && (metrics.cartRate === null || metrics.cartRate <= resolved.minCartRatePercent))
            return false;
        return true;
    });
    const metricsById = new Map(eligible.map(({ candidate, metrics }) => [candidate.itemId, metrics]));
    // 访客基数仅用于排名：未知（null）按 0 参与排名，不改变其他口径
    const dailyVisitorRate = ({ candidate, metrics }) => (metrics.visitors ?? 0) / Math.max(1, candidate.daily.length);
    // 百分位基准：入围样本（推荐理由中如引用均值，均指入围样本而非全店）
    const cartRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.cartRate ?? 0));
    const ctrRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.ctr ?? 0));
    const cvrRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.cvrOrdered ?? 0));
    const trafficRank = buildPercentileRanker(eligible.map(dailyVisitorRate));
    const cartValues = eligible.map(({ metrics }) => metrics.cartRate ?? 0);
    const avgEligibleCartRate = cartValues.length > 0 ? cartValues.reduce((a, b) => a + b, 0) / cartValues.length : 0;
    const scored = eligible.map(({ candidate }) => {
        const metrics = metricsById.get(candidate.itemId);
        // 环比 [-100%, +200%] 线性映射到 [0, 100]；无可比数据（null）记 0 分，无奖励也无惩罚
        const growthScore = metrics.growthPercent === null
            ? 0
            : (clamp(metrics.growthPercent, -100, 200) + 100) / 3;
        const cartScore = cartRank(metrics.cartRate ?? 0);
        const ctrPct = ctrRank(metrics.ctr ?? 0);
        const cvrPct = cvrRank(metrics.cvrOrdered ?? 0);
        const gapScore = (ctrPct / 100) * (100 - cvrPct);
        const trafficScore = trafficRank(dailyVisitorRate({ candidate, metrics }));
        const score = Number((0.35 * growthScore + 0.25 * cartScore + 0.25 * gapScore + 0.15 * trafficScore).toFixed(1));
        const reasons = [];
        if (metrics.growthStatus === 'new-orders') {
            reasons.push(`近 ${metrics.growthWindowDays} 天新增订单（前期有效订单为 0，无法计算百分比）`);
        }
        else if (metrics.growthPercent !== null && metrics.growthPercent >= 30) {
            reasons.push(`后 ${metrics.growthWindowDays} 天日均订单环比 ${metrics.growthPercent >= 0 ? '+' : ''}${metrics.growthPercent.toFixed(0)}%`);
        }
        if (metrics.cartRate !== null && avgEligibleCartRate > 0 && metrics.cartRate >= avgEligibleCartRate * 1.2) {
            reasons.push(`加购率 ${formatPercent(metrics.cartRate)} 高于入围商品平均加购率 ${formatPercent(avgEligibleCartRate)}`);
        }
        if (ctrPct >= 60 && cvrPct <= 40) {
            reasons.push(`点击率 ${formatPercent(metrics.ctr)} 但下单转化率仅 ${formatPercent(metrics.cvrOrdered)}，详情页/价格有优化空间`);
        }
        if (trafficScore >= 70) {
            reasons.push(`访客基数居前 30%（日均 ${Math.round(dailyVisitorRate({ candidate, metrics }))}）`);
        }
        if (reasons.length === 0) {
            reasons.push('综合流量与转化表现均衡，具备提升空间');
        }
        return {
            rank: 0,
            itemId: candidate.itemId,
            itemName: candidate.itemName,
            sheetKey: candidate.sheetKey,
            score,
            reasons,
            metrics,
        };
    });
    return scored
        .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
        .slice(0, resolved.limit)
        .map((result, index) => ({ ...result, rank: index + 1 }));
}
