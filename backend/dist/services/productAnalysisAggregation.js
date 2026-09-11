"use strict";
/**
 * 商品分析区间聚合（纯函数，无 DB 依赖）：
 * - 日行求和 + 率类推导（ctr / 访客转化 / 加购率 / 跳出率 / 客单价）
 * - 单品日序列、变体跨日合并、解析产物 → 日行映射
 * 聚合结果字段键名与前端 ParentProduct 对齐，可直接驱动商品列表与详情。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRA_FIELDS = exports.SUMMABLE_FIELDS = void 0;
exports.pairwiseSums = pairwiseSums;
exports.pairwiseRatio = pairwiseRatio;
exports.summarizeSheetEffective = summarizeSheetEffective;
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
    'modelId', 'createdAt', 'createdDays', 'currentPrice',
    'uncompetitiveVariations', 'competitiveVariations', 'priceFlag',
];
function numOrUndef(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
/**
 * 成对完整样本求和（聚合 / 新品榜 / 汇总卡共用，保证同名指标同一有效样本口径）：
 * 分子分母仅同时计入两者均为有效数值的观测行——缺失（null/undefined）不计为零、不参与样本。
 * 注意：行上的总量字段（如 visitors 合计）是「各自有效观测」的求和，与这里的成对样本可能不同，
 * 前端不得用总量互除重算比率。
 */
function pairwiseSums(rows, numeratorField, denominatorField) {
    let numerator = 0;
    let denominator = 0;
    let pairs = 0;
    for (const row of rows) {
        const numeratorValue = numOrUndef(row[numeratorField]);
        const denominatorValue = numOrUndef(row[denominatorField]);
        if (numeratorValue === undefined || denominatorValue === undefined)
            continue;
        numerator += numeratorValue;
        denominator += denominatorValue;
        pairs += 1;
    }
    return pairs > 0 ? { numerator, denominator } : null;
}
/** 成对完整样本比率：无任何成对观测或分母合计 ≤ 0 时返回 null（未知，而非 0）。合法零值正常参与。 */
function pairwiseRatio(rows, numeratorField, denominatorField) {
    const sums = pairwiseSums(rows, numeratorField, denominatorField);
    if (sums === null || sums.denominator <= 0)
        return null;
    return sums.numerator / sums.denominator;
}
/** 按原始日行计算工作表级加权转化率（与商品明细、新品榜的下单转化率同一成对样本口径） */
function summarizeSheetEffective(rows) {
    const sums = pairwiseSums(rows, 'ordersOrdered', 'visitors');
    if (sums === null)
        return { weightedCvrNumerator: null, weightedCvrDenominator: null, weightedCvr: null };
    return {
        weightedCvrNumerator: sums.numerator,
        weightedCvrDenominator: sums.denominator,
        weightedCvr: sums.denominator > 0 ? (sums.numerator / sums.denominator) * 100 : null,
    };
}
/** 区间聚合多行 → 单商品。
 *  比率类（ctr / cvrOrdered / cvrConfirmed / cartRate / bounceRate / aov*）统一按成对完整样本计算，
 *  与新品榜（productAnalysisPotential）同名指标同一口径；总量仍为各自有效观测求和。 */
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
    const looseRows = sorted;
    const percent = (numeratorField, denominatorField) => {
        const ratio = pairwiseRatio(looseRows, numeratorField, denominatorField);
        return ratio === null ? null : ratio * 100;
    };
    return {
        itemId,
        itemName: latest.itemName,
        sheetKey: latest.sheetKey,
        status: latest.status ?? undefined,
        days: new Set(sorted.map((row) => row.date)).size,
        firstDate: sorted[0].date,
        lastDate: latest.date,
        ...sums,
        ctr: percent('clicks', 'impressions'),
        cvrOrdered: percent('ordersOrdered', 'visitors'),
        cvrConfirmed: percent('ordersConfirmed', 'visitors'),
        cvrVisitorsOrdered: percent('ordersOrdered', 'visitors'),
        cvrVisitorsConfirmed: percent('ordersConfirmed', 'visitors'),
        cartRate: percent('cartVisitors', 'visitors'),
        bounceRate: percent('bounceVisitors', 'visitors'),
        aovOrdered: pairwiseRatio(looseRows, 'salesOrdered', 'ordersOrdered'),
        aovConfirmed: pairwiseRatio(looseRows, 'salesConfirmed', 'ordersConfirmed'),
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
/** 单品日序列（每日期一行，按日升序）。缺失指标保留 null（未知 ≠ 0），不做日期补齐/补零 */
function buildDailySeries(rows) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((row) => {
        const visitors = numOrUndef(row.visitors) ?? null;
        const ordersConfirmed = numOrUndef(row.ordersConfirmed) ?? null;
        const ordersOrdered = numOrUndef(row.ordersOrdered) ?? null;
        // 当日成对样本：订单与访客均有效且访客 > 0 才有转化率
        const cvrConfirmed = ordersConfirmed !== null && visitors !== null && visitors > 0
            ? (ordersConfirmed / visitors) * 100
            : null;
        return {
            date: row.date,
            ordersOrdered,
            ordersConfirmed,
            visitors,
            clicks: numOrUndef(row.clicks) ?? null,
            unitsOrdered: numOrUndef(row.unitsOrdered) ?? null,
            cvrConfirmed,
        };
    });
}
const VARIATION_SUM_FIELDS = [
    'salesOrdered',
    'salesConfirmed',
    'ordersOrdered',
    'ordersConfirmed',
    'unitsOrdered',
    'unitsConfirmed',
    'buyersOrdered',
    'buyersConfirmed',
    'cartVisitors',
    'cartUnits',
];
const VARIATION_IDENTITY_FIELDS = ['variationSku', 'variationName', 'variationStatus', 'modelCode', 'modelId'];
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
            const existing = merged.get(key) ?? {};
            for (const field of VARIATION_IDENTITY_FIELDS) {
                if (existing[field] === undefined && typeof variation[field] === 'string' && variation[field].trim()) {
                    existing[field] = variation[field];
                }
            }
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
 *  而入库按 (uploadId, itemId) 唯一，故按类别优先级取一条主记录。
 *  跨 sheet 合并规则（2026-09-11 修复字段级丢失）：
 *  - 主记录 = 类别优先级最高的工作表行（hot > new > uncompetitive > competitive），业务口径以主记录为准；
 *  - 主记录**缺失**的字段从其他工作表行补齐（缺失 = null/undefined/空串；数值 0 是有效值不视为缺失），
 *    补齐来源记入 extra.sheetSources；
 *  - 双方都有值且不一致时不覆盖、不求和（避免有效值被覆盖或指标跨 sheet 重复累加），
 *    差异记入 extra.sheetConflicts（保留主记录值，最多记录 10 条）；
 *  - 变体数组同理：主记录有变体则保留；缺失时才整体采用其他 sheet 的变体；都有则记冲突不合并。 */
const SHEET_PRIORITY = { hot: 0, new: 1, uncompetitive: 2, competitive: 3 };
function sheetPriority(sheetKey) {
    return SHEET_PRIORITY[sheetKey] ?? 99;
}
/** 字段值是否缺失（null / undefined / 空串；数值 0 为有效值，不是缺失） */
function isAbsentValue(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
function sameValue(left, right) {
    if (typeof left === 'number' && typeof right === 'number') {
        return Math.abs(left - right) < 1e-9;
    }
    return left === right;
}
/** 用一次出现构建主记录行（原单行构建逻辑，抽出复用） */
function buildRowFromOccurrence(itemId, occurrence) {
    const item = occurrence.item;
    const row = {
        itemId,
        itemName: String(item.itemName ?? ''),
        sheetKey: occurrence.sheetKey,
        status: typeof item.status === 'string' && item.status ? item.status : null,
        date: '',
    };
    const looseRow = row;
    for (const field of exports.SUMMABLE_FIELDS) {
        const value = item[field];
        looseRow[field] = typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    const extra = {};
    for (const field of exports.EXTRA_FIELDS) {
        const value = item[field];
        if (!isAbsentValue(value))
            extra[field] = value;
    }
    row.extra = extra;
    row.variations = Array.isArray(item.variations) ? item.variations : null;
    return row;
}
/** 用低优先级出现补齐主记录缺失字段（不覆盖、不求和；差异记冲突） */
function backfillRowFromOccurrence(itemId, row, occurrence, audit) {
    const item = occurrence.item;
    const extra = row.extra;
    const looseRow = row;
    // 数量指标：主记录缺失(null)时补齐；双方都有且不等时记冲突（保留主记录，绝不相加——
    // 同商品同日在多表的同一指标是同一口径的重复呈现，相加会双计）
    for (const field of exports.SUMMABLE_FIELDS) {
        const incoming = item[field];
        if (typeof incoming !== 'number' || !Number.isFinite(incoming))
            continue;
        const current = looseRow[field];
        if (current === null) {
            looseRow[field] = incoming;
            audit.sources[field] = occurrence.sheetKey;
        }
        else if (!sameValue(current, incoming)) {
            audit.conflicts.push({ field, keep: current, other: incoming, sheet: occurrence.sheetKey });
        }
    }
    // extra 字段（创建日期/创建天数/价格等属性）：缺失补齐；不一致记冲突
    for (const field of exports.EXTRA_FIELDS) {
        const incoming = item[field];
        if (isAbsentValue(incoming))
            continue;
        if (extra[field] === undefined) {
            extra[field] = incoming;
            audit.sources[field] = occurrence.sheetKey;
        }
        else if (!sameValue(extra[field], incoming)) {
            audit.conflicts.push({ field, keep: extra[field], other: incoming, sheet: occurrence.sheetKey });
        }
    }
    // 名称/状态：主记录为空时补齐
    if (isAbsentValue(row.itemName) && !isAbsentValue(item.itemName)) {
        row.itemName = String(item.itemName);
        audit.sources.itemName = occurrence.sheetKey;
    }
    if (isAbsentValue(row.status) && typeof item.status === 'string' && item.status) {
        row.status = item.status;
        audit.sources.status = occurrence.sheetKey;
    }
    // 变体：主记录缺失时整体采用；都有且非空时记冲突（逐条合并会把同变体 units 双计）
    const incomingVariations = Array.isArray(item.variations) ? item.variations : null;
    const hasIncoming = incomingVariations !== null && incomingVariations.length > 0;
    const currentVariations = Array.isArray(row.variations) ? row.variations : null;
    const hasCurrent = currentVariations !== null && currentVariations.length > 0;
    if (hasIncoming && !hasCurrent) {
        row.variations = incomingVariations;
        audit.sources.variations = occurrence.sheetKey;
    }
    else if (hasIncoming && hasCurrent && incomingVariations !== currentVariations) {
        audit.conflicts.push({
            field: 'variations',
            keep: currentVariations.length,
            other: incomingVariations.length,
            sheet: occurrence.sheetKey,
            note: '主记录变体保留；各表变体未合并（避免件数双计）',
        });
    }
}
function mapParsedSheetItemsToDailyRows(sheets) {
    const rows = [];
    // 防御：空元素 / 非对象 / 缺 sheetKey 或 items 的工作表直接剔除（结构问题由路由层 Zod 校验返回 400，这里保证纯函数不崩）
    const validSheets = sheets.filter((sheet) => typeof sheet === 'object' && sheet !== null && !Array.isArray(sheet)
        && typeof sheet.sheetKey === 'string' && sheet.sheetKey !== ''
        && Array.isArray(sheet.items));
    // 每个商品出现过的全部工作表（extra.sheetKeys 保留完整归属，供"新商品分析"等按 sheet 基数筛选）
    const sheetKeysByItem = new Map();
    // 每个商品的全部出现（跨 sheet 合并的输入；不在此处去重）
    const occurrencesByItem = new Map();
    for (const sheet of validSheets) {
        for (const raw of sheet.items) {
            if (typeof raw !== 'object' || raw === null)
                continue;
            const itemId = String(raw.itemId ?? '').trim();
            if (!itemId)
                continue;
            const known = sheetKeysByItem.get(itemId) ?? [];
            if (!known.includes(sheet.sheetKey))
                known.push(sheet.sheetKey);
            sheetKeysByItem.set(itemId, known);
            const occurrences = occurrencesByItem.get(itemId) ?? [];
            occurrences.push({ sheetKey: sheet.sheetKey, item: raw });
            occurrencesByItem.set(itemId, occurrences);
        }
    }
    for (const [itemId, occurrences] of occurrencesByItem) {
        // 主记录 = 类别优先级最高的出现（同优先级重复出现保持原顺序首个）
        const ordered = [...occurrences].sort((left, right) => sheetPriority(left.sheetKey) - sheetPriority(right.sheetKey)
            || occurrences.indexOf(left) - occurrences.indexOf(right));
        const primary = ordered[0];
        const row = buildRowFromOccurrence(itemId, primary);
        const audit = { sources: {}, conflicts: [] };
        for (const secondary of ordered.slice(1)) {
            backfillRowFromOccurrence(itemId, row, secondary, audit);
        }
        const extra = row.extra;
        extra.sheetKeys = sheetKeysByItem.get(itemId) ?? [primary.sheetKey];
        if (Object.keys(audit.sources).length > 0)
            extra.sheetSources = audit.sources;
        if (audit.conflicts.length > 0)
            extra.sheetConflicts = audit.conflicts.slice(0, 10);
        rows.push(row);
    }
    return rows;
}
