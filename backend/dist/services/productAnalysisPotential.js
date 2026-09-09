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
 * - 每窗口只统计该商品「有记录」的日期的日均已下订单——零订单记录是真实 0，
 *   缺失记录（当天导出无此商品）为未知、不假设为 0；
 * - 前窗口日均为 0 且后窗口 > 0：无法计算百分比（growthStatus = 'new-orders'，不伪造 +∞）；
 * - 区间仅 1 天、某侧窗口无任何记录：growthPercent = null（'insufficient' / 'no-data'），
 *   评分中增长项记 0 分——缺失数据既无奖励也无惩罚。
 *
 * 转化率口径：cvrOrdered = 已下订单 / 访客（下单口径），区别于详情页的 cvrConfirmed（已确认口径）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CART_RATE_PERCENT = exports.MIN_CLICKS = exports.MIN_CTR_PERCENT = void 0;
exports.buildGrowthWindows = buildGrowthWindows;
exports.buildPercentileRanker = buildPercentileRanker;
exports.rankPotentialItems = rankPotentialItems;
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
function computeMetrics(candidate, windows) {
    const sorted = [...candidate.daily].sort((a, b) => a.date.localeCompare(b.date));
    const totals = sorted.reduce((acc, row) => ({
        ordersOrdered: acc.ordersOrdered + (row.ordersOrdered || 0),
        visitors: acc.visitors + (row.visitors || 0),
        clicks: acc.clicks + (row.clicks || 0),
        impressions: acc.impressions + (row.impressions || 0),
        cartVisitors: acc.cartVisitors + (row.cartVisitors || 0),
    }), { ordersOrdered: 0, visitors: 0, clicks: 0, impressions: 0, cartVisitors: 0 });
    // 环比：仅统计窗口内「有记录」的日期；缺失日不假设为 0
    let growthPercent = null;
    let growthStatus;
    if (windows.windowDays < 1) {
        growthStatus = 'insufficient';
    }
    else {
        const averageOrders = (rows) => {
            const sum = rows.reduce((total, row) => total + (row.ordersOrdered || 0), 0);
            return { avg: rows.length > 0 ? sum / rows.length : null, sum };
        };
        const previous = averageOrders(sorted.filter((row) => windows.previousDays.has(row.date)));
        const recent = averageOrders(sorted.filter((row) => windows.recentDays.has(row.date)));
        if (previous.avg === null && recent.avg === null) {
            growthStatus = 'no-data';
        }
        else if (previous.avg === null || recent.avg === null) {
            growthStatus = 'insufficient';
        }
        else if (previous.avg === 0 && recent.avg > 0) {
            growthStatus = 'new-orders';
        }
        else {
            growthStatus = 'ok';
            growthPercent = previous.avg === 0 ? 0 : ((recent.avg - previous.avg) / previous.avg) * 100;
        }
    }
    return {
        ...totals,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
        cvrOrdered: totals.visitors > 0 ? (totals.ordersOrdered / totals.visitors) * 100 : null,
        cartRate: totals.visitors > 0 ? (totals.cartVisitors / totals.visitors) * 100 : null,
        growthPercent,
        growthStatus,
        growthWindowDays: windows.windowDays,
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
    // 入围条件（任一项为 null 即跳过该条件）
    const eligible = computed.filter(({ candidate, metrics }) => {
        if (resolved.excludeBannedDeleted && EXCLUDED_STATUS.has(String(candidate.status ?? '')))
            return false;
        if (resolved.minCtrPercent !== null && (metrics.ctr === null || metrics.ctr <= resolved.minCtrPercent))
            return false;
        if (resolved.minClicks !== null && metrics.clicks <= resolved.minClicks)
            return false;
        if (resolved.minCartRatePercent !== null && (metrics.cartRate === null || metrics.cartRate <= resolved.minCartRatePercent))
            return false;
        return true;
    });
    const metricsById = new Map(eligible.map(({ candidate, metrics }) => [candidate.itemId, metrics]));
    // 百分位基准：入围样本（推荐理由中如引用均值，均指入围样本而非全店）
    const cartRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.cartRate ?? 0));
    const ctrRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.ctr ?? 0));
    const cvrRank = buildPercentileRanker(eligible.map(({ metrics }) => metrics.cvrOrdered ?? 0));
    const trafficRank = buildPercentileRanker(eligible.map(({ candidate, metrics }) => metrics.visitors / Math.max(1, candidate.daily.length)));
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
        const trafficScore = trafficRank(metrics.visitors / Math.max(1, candidate.daily.length));
        const score = Number((0.35 * growthScore + 0.25 * cartScore + 0.25 * gapScore + 0.15 * trafficScore).toFixed(1));
        const reasons = [];
        if (metrics.growthStatus === 'new-orders') {
            reasons.push(`近 ${metrics.growthWindowDays} 天新增订单（前期无订单，无法计算百分比）`);
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
            reasons.push(`访客基数居前 30%（日均 ${Math.round(metrics.visitors / Math.max(1, candidate.daily.length))}）`);
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
