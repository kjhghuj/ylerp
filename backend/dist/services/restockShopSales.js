"use strict";
/**
 * 补货V3：商品分析店铺销量聚合（纯函数，无 DB 依赖）。
 * 数据根基：ProductDailyItem 区间行 —— 有变体时按「规格货号」（modelCode，商家自填、
 * 与元仓 customerSku 同一套编码）跨日求和 unitsOrdered（已下订单件数，补货V3 选定口径）。
 * 规格货号缺失的变体回退「规格编号」（variationSku，Shopee 生成）并标记 skuSource，
 * 两者皆缺计入 noSku 提示（无法映射，不参与计算）；无变体行回退父级 unitsOrdered（键 = itemId）。
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
/** 变体可映射键：规格货号优先；两者皆缺返回 null（计入 noSku 提示） */
function resolveVariationKey(variation) {
    const modelCode = String(variation.modelCode ?? '').trim();
    if (modelCode && modelCode !== '-') {
        return { key: modelCode, source: 'modelCode' };
    }
    const variationSku = String(variation.variationSku ?? '').trim();
    if (variationSku && variationSku !== '-') {
        return { key: variationSku, source: 'variationSku' };
    }
    return null;
}
/** 聚合区间行：变体级优先（规格货号键），无变体回退父级 itemId 键 */
function aggregateShopVariantSales(dailyRows) {
    const bySku = new Map();
    const uploadDates = new Set();
    let noSkuVariationCount = 0;
    let noSkuVariationUnits = 0;
    const upsert = (key, displaySku, skuSource, level, itemId, itemName, variationName, units) => {
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
            skuSource,
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
                const key = resolveVariationKey(variation);
                const units = toUnits(variation.unitsOrdered);
                if (!key) {
                    noSkuVariationCount += 1;
                    noSkuVariationUnits += units ?? 0;
                    continue;
                }
                upsert(key.key, key.key, key.source, 'variation', row.itemId, row.itemName, typeof variation.variationName === 'string' && variation.variationName.trim()
                    ? variation.variationName.trim()
                    : null, units);
            }
            continue;
        }
        upsert(row.itemId, row.itemId, 'item', 'item', row.itemId, row.itemName, null, toUnits(row.unitsOrdered));
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
