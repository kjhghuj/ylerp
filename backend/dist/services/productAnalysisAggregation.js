"use strict";
/**
 * 商品分析区间聚合（纯函数，无 DB 依赖）：
 * - 日行求和 + 率类推导（ctr / 访客转化 / 加购率 / 跳出率 / 客单价）
 * - 单品日序列、变体跨日合并、解析产物 → 日行映射
 * 聚合结果字段键名与前端 ParentProduct 对齐，可直接驱动商品列表与详情。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRA_FIELDS = exports.SUMMABLE_FIELDS = void 0;
exports.aggregateItems = aggregateItems;
exports.buildDailySeries = buildDailySeries;
exports.mergeVariations = mergeVariations;
exports.buildItemDetail = buildItemDetail;
exports.mapParsedSheetItemsToDailyRows = mapParsedSheetItemsToDailyRows;
exports.SUMMABLE_FIELDS = [
    'salesOrdered', 'salesConfirmed',
    'ordersOrdered', 'ordersConfirmed',
    'unitsOrdered', 'unitsConfirmed',
    'buyersOrdered', 'buyersConfirmed',
    'impressions', 'clicks',
    'uniqueImpressions', 'uniqueClicks',
    'visitors', 'pageViews',
    'bounceVisitors', 'searchClicks', 'likes',
    'cartVisitors', 'cartUnits',
];
/** extra Json 中保存的率类与商品属性键（区间不聚合；单品详情取最新日） */
exports.EXTRA_FIELDS = [
    'ctr', 'cvrOrdered', 'cvrConfirmed', 'cvrVisitorsOrdered', 'cvrVisitorsConfirmed',
    'aovOrdered', 'aovConfirmed', 'cartRate', 'bounceRate',
    'repeatOrderRate', 'repurchaseRateConfirmed', 'avgReorderDays', 'avgRepurchaseDays',
    'modelId', 'createdAt', 'createdDays', 'currentPrice', 'priceFlag',
];
function numOrUndef(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function rate(numerator, denominator) {
    if (numerator === null || numerator === undefined)
        return null;
    if (!denominator || denominator <= 0)
        return null;
    return (numerator / denominator) * 100;
}
/** 区间聚合多行 → 单商品（率类统一访客/展示口径推导；cvrOrdered/cvrConfirmed 采用访客口径便于排序与 AI 口径统一） */
function buildAggregate(itemId, rows) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const sums = {};
    for (const field of exports.SUMMABLE_FIELDS) {
        let total = null;
        for (const row of sorted) {
            const value = numOrUndef(row[field]);
            if (value === undefined)
                continue;
            total = (total ?? 0) + value;
        }
        sums[field] = total;
    }
    const visitors = sums.visitors;
    const impressions = sums.impressions;
    return {
        itemId,
        itemName: latest.itemName,
        sheetKey: latest.sheetKey,
        status: latest.status ?? undefined,
        days: new Set(sorted.map((row) => row.date)).size,
        firstDate: sorted[0].date,
        lastDate: latest.date,
        ...sums,
        ctr: rate(sums.clicks, impressions),
        cvrOrdered: rate(sums.ordersOrdered, visitors),
        cvrConfirmed: rate(sums.ordersConfirmed, visitors),
        cvrVisitorsOrdered: rate(sums.ordersOrdered, visitors),
        cvrVisitorsConfirmed: rate(sums.ordersConfirmed, visitors),
        cartRate: rate(sums.cartVisitors, visitors),
        bounceRate: rate(sums.bounceVisitors, visitors),
        aovOrdered: sums.salesOrdered !== null && sums.ordersOrdered ? sums.salesOrdered / sums.ordersOrdered : null,
        aovConfirmed: sums.salesConfirmed !== null && sums.ordersConfirmed ? sums.salesConfirmed / sums.ordersConfirmed : null,
        repeatOrderRate: null,
        repurchaseRateConfirmed: null,
        avgReorderDays: null,
        avgRepurchaseDays: null,
        variations: [],
    };
}
/** 全量商品区间聚合（按 itemId 分组） */
function aggregateItems(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const list = grouped.get(row.itemId);
        if (list)
            list.push(row);
        else
            grouped.set(row.itemId, [row]);
    }
    return [...grouped.entries()].map(([itemId, itemRows]) => buildAggregate(itemId, itemRows));
}
/** 单品日序列（每日期一行，按日升序） */
function buildDailySeries(rows) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((row) => {
        const visitors = numOrUndef(row.visitors) ?? 0;
        const ordersConfirmed = numOrUndef(row.ordersConfirmed);
        return {
            date: row.date,
            ordersOrdered: numOrUndef(row.ordersOrdered) ?? 0,
            ordersConfirmed: numOrUndef(row.ordersConfirmed) ?? 0,
            visitors,
            clicks: numOrUndef(row.clicks) ?? 0,
            unitsOrdered: numOrUndef(row.unitsOrdered) ?? 0,
            cvrConfirmed: ordersConfirmed !== undefined && visitors > 0 ? (ordersConfirmed / visitors) * 100 : null,
        };
    });
}
const VARIATION_SUM_FIELDS = ['unitsOrdered', 'unitsConfirmed', 'buyersOrdered', 'buyersConfirmed', 'cartVisitors', 'cartUnits'];
/** 变体跨日合并：按 规格编号||规格名称 聚合，数值求和，按已下件数降序 */
function mergeVariations(rows) {
    const merged = new Map();
    for (const row of rows) {
        const variations = Array.isArray(row.variations) ? row.variations : [];
        for (const raw of variations) {
            if (typeof raw !== 'object' || raw === null)
                continue;
            const variation = raw;
            const key = String(variation.variationSku || variation.variationName || '');
            if (!key)
                continue;
            const existing = merged.get(key) ?? {
                variationSku: typeof variation.variationSku === 'string' ? variation.variationSku : undefined,
                variationName: typeof variation.variationName === 'string' ? variation.variationName : undefined,
                variationStatus: typeof variation.variationStatus === 'string' ? variation.variationStatus : undefined,
            };
            for (const field of VARIATION_SUM_FIELDS) {
                const value = numOrUndef(variation[field]);
                if (value !== undefined) {
                    existing[field] = (existing[field] ?? 0) + value;
                }
            }
            merged.set(key, existing);
        }
    }
    return [...merged.values()].sort((a, b) => (b.unitsOrdered ?? 0) - (a.unitsOrdered ?? 0));
}
/** 单品详情聚合：指标 + 日序列 + 合并变体 + 最新日 extra */
function buildItemDetail(rows) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return {
        item: buildAggregate(sorted[0].itemId, sorted),
        series: buildDailySeries(sorted),
        variations: mergeVariations(sorted),
        extra: sorted[sorted.length - 1].extra ?? null,
    };
}
/** 解析产物（前端 parseProductAnalysisWorkbook 输出）→ 日行。
 *  真实导出中同一商品可能同时出现在多个工作表（如热销 + 竞争力价格），
 *  而入库按 (uploadId, itemId) 唯一，故按类别优先级去重保留一份 */
const SHEET_PRIORITY = { hot: 0, new: 1, uncompetitive: 2, competitive: 3 };
function sheetPriority(sheetKey) {
    return SHEET_PRIORITY[sheetKey] ?? 99;
}
function mapParsedSheetItemsToDailyRows(sheets) {
    const rows = [];
    const seenItemIds = new Set();
    const ordered = [...sheets].sort((a, b) => sheetPriority(a.sheetKey) - sheetPriority(b.sheetKey));
    for (const sheet of ordered) {
        if (!sheet || typeof sheet !== 'object' || !Array.isArray(sheet.items))
            continue;
        for (const raw of sheet.items) {
            if (typeof raw !== 'object' || raw === null)
                continue;
            const item = raw;
            const itemId = String(item.itemId ?? '').trim();
            if (!itemId || seenItemIds.has(itemId))
                continue;
            seenItemIds.add(itemId);
            const row = {
                itemId,
                itemName: String(item.itemName ?? ''),
                sheetKey: sheet.sheetKey,
                status: typeof item.status === 'string' && item.status ? item.status : null,
                date: '',
            };
            const looseRow = row;
            for (const field of exports.SUMMABLE_FIELDS) {
                const value = numOrUndef(item[field]);
                looseRow[field] = value === undefined ? null : value;
            }
            const extra = {};
            for (const field of exports.EXTRA_FIELDS) {
                const value = item[field];
                if (value !== null && value !== undefined && value !== '')
                    extra[field] = value;
            }
            row.extra = Object.keys(extra).length > 0 ? extra : null;
            row.variations = Array.isArray(item.variations) ? item.variations : null;
            rows.push(row);
        }
    }
    return rows;
}
