"use strict";
/**
 * 补货V3：商品分析店铺销量聚合（纯函数，无 DB 依赖）。
 * 数据根基：ProductDailyItem 区间行 —— 有变体时按 variationSku 跨日求和 unitsOrdered
 * （已下订单件数，补货V3 选定口径），无变体行回退父级 unitsOrdered（externalSku = itemId）。
 * 缺失指标（null）语义与商品分析一致：未知 ≠ 0，不计入合计，也不计入该变体的有效观测天数；
 * 店铺级统计天数（statisticsDays 默认值）另行按「区间内实际上传天数」计算。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateShopVariantSales = aggregateShopVariantSales;
const restockSalesImport_1 = require("./restockSalesImport");
function parseVariations(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry) => typeof entry === 'object' && entry !== null);
}
const toUnits = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** 聚合区间行：变体级优先（variationSku 键），无变体回退父级 itemId 键 */
function aggregateShopVariantSales(dailyRows) {
    const bySku = new Map();
    const uploadDates = new Set();
    let noSkuVariationCount = 0;
    let noSkuVariationUnits = 0;
    const upsert = (key, displaySku, level, itemId, itemName, variationName, units) => {
        const normalizedKey = (0, restockSalesImport_1.normalizeRestockSku)(key);
        if (!normalizedKey)
            return;
        const existing = bySku.get(normalizedKey);
        if (existing) {
            if (units !== null) {
                existing.units += units;
                existing.observedDays += 1;
            }
            return;
        }
        bySku.set(normalizedKey, {
            externalSku: normalizedKey,
            displaySku,
            level,
            itemId,
            itemName,
            variationName,
            units: units ?? 0,
            observedDays: units !== null ? 1 : 0,
        });
    };
    for (const row of dailyRows) {
        uploadDates.add(row.date);
        const variations = parseVariations(row.variations);
        if (variations.length > 0) {
            for (const variation of variations) {
                const sku = String(variation.variationSku ?? '').trim();
                const units = toUnits(variation.unitsOrdered);
                if (!sku) {
                    noSkuVariationCount += 1;
                    noSkuVariationUnits += units ?? 0;
                    continue;
                }
                upsert(sku, sku, 'variation', row.itemId, row.itemName, typeof variation.variationName === 'string' && variation.variationName.trim()
                    ? variation.variationName.trim()
                    : null, units);
            }
            continue;
        }
        upsert(row.itemId, row.itemId, 'item', row.itemId, row.itemName, null, toUnits(row.unitsOrdered));
    }
    const rows = Array.from(bySku.values())
        .sort((a, b) => b.units - a.units || a.externalSku.localeCompare(b.externalSku));
    return {
        rows,
        shopObservedDays: uploadDates.size,
        noSkuVariationCount,
        noSkuVariationUnits,
    };
}
