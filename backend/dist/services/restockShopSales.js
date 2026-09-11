"use strict";
/**
 * 补货V3：商品分析店铺销量聚合（纯函数，无 DB 依赖）。
 * 数据根基：ProductDailyItem 区间行 —— 有变体时按「规格货号」（modelCode，商家自填、
 * 与元仓 customerSku 同一套编码）跨日求和 unitsOrdered（已下订单件数，补货V3 选定口径）。
 * 规格货号缺失的变体回退「规格编号」（variationSku，Shopee 生成）并标记 skuSource，
 * 两者皆缺计入 noSku 提示（无法映射，不参与计算）；无变体行回退父级 unitsOrdered（键 = itemId）。
 *
 * 2026-09 升级口径：
 * - 观测天数按「唯一日期」统计：同一天同一货号出现在多个父商品/多行时只算一天，件数仍求和。
 * - 区分有效正销量 / 真实零销量（units=0）/ 无有效观测（null 或非法值）：
 *   salesStatus = has_sales | zero_sales | no_data；null 与非法件数不计入合计与观测天数。
 * - 变体键（modelCode/variationSku）与父商品键（itemId）属不同编码空间，分开聚合互不串扰。
 * - 检测规范化碰撞：不同原始货号（大小写/空格变体）归一到同键时合并，并在 collisionKeys 标记。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateShopVariantSales = aggregateShopVariantSales;
const restockSalesImport_1 = require("./restockSalesImport");
function parseVariations(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry) => typeof entry === 'object' && entry !== null);
}
/** 有效件数：有限非负数；null/负数/NaN/Infinity 均为无效观测 */
const toUnits = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
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
/** 聚合区间行：变体级优先（规格货号键），无变体回退父级 itemId 键；两套键空间分开累计 */
function aggregateShopVariantSales(dailyRows) {
    /** 变体命名空间（modelCode / variationSku）与父商品命名空间（item）分开聚合，避免跨空间串扰 */
    const bySku = new Map();
    const byItemId = new Map();
    const uploadDates = new Set();
    let noSkuVariationCount = 0;
    let noSkuVariationUnits = 0;
    const upsert = (namespace, key, displaySku, skuSource, level, itemId, itemName, variationName, units, date) => {
        const normalizedKey = (0, restockSalesImport_1.normalizeRestockSku)(key);
        if (!normalizedKey)
            return;
        // 编号类型进入键空间：modelCode/variationSku/item 三套编码互不相通
        const identityKey = `${skuSource}:${normalizedKey}`;
        let accumulator = namespace.get(identityKey);
        if (!accumulator) {
            accumulator = {
                row: {
                    externalSku: normalizedKey,
                    identityKey,
                    identityValue: normalizedKey,
                    displaySku,
                    skuSource,
                    level,
                    itemId,
                    itemName,
                    variationName,
                },
                dailyUnits: new Map(),
                rawKeys: new Set(),
                itemIds: new Set(),
            };
            namespace.set(identityKey, accumulator);
        }
        accumulator.rawKeys.add(key.trim());
        accumulator.itemIds.add(itemId);
        if (units !== null) {
            accumulator.dailyUnits.set(date, (accumulator.dailyUnits.get(date) ?? 0) + units);
        }
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
                upsert(bySku, key.key, key.key, key.source, 'variation', row.itemId, row.itemName, typeof variation.variationName === 'string' && variation.variationName.trim()
                    ? variation.variationName.trim()
                    : null, units, row.date);
            }
            continue;
        }
        upsert(byItemId, row.itemId, row.itemId, 'item', 'item', row.itemId, row.itemName, null, toUnits(row.unitsOrdered), row.date);
    }
    const collisionKeys = [];
    const finalize = (accumulator) => {
        let units = 0;
        let positiveDays = 0;
        let zeroDays = 0;
        let latestObservedDate = null;
        for (const [date, dailyTotal] of accumulator.dailyUnits) {
            units += dailyTotal;
            if (dailyTotal > 0)
                positiveDays += 1;
            else
                zeroDays += 1;
            if (latestObservedDate === null || date > latestObservedDate)
                latestObservedDate = date;
        }
        const normalizedVariants = Array.from(accumulator.rawKeys).sort();
        if (normalizedVariants.length > 1)
            collisionKeys.push(accumulator.row.externalSku);
        const observedDays = accumulator.dailyUnits.size;
        return {
            ...accumulator.row,
            units,
            observedDays,
            positiveDays,
            zeroDays,
            latestObservedDate,
            salesStatus: observedDays === 0 ? 'no_data' : units > 0 ? 'has_sales' : 'zero_sales',
            normalizedVariants,
            itemIds: Array.from(accumulator.itemIds),
        };
    };
    const rows = [
        ...Array.from(bySku.values()).map(finalize),
        ...Array.from(byItemId.values()).map(finalize),
    ].sort((a, b) => b.units - a.units || a.externalSku.localeCompare(b.externalSku));
    // 跨类型同值检测（与归一化碰撞不同：这是编号类型歧义，需匹配层阻断共享映射）
    const valueKinds = new Map();
    for (const accumulator of [...bySku.values(), ...byItemId.values()]) {
        const value = accumulator.row.identityValue;
        const kinds = valueKinds.get(value) ?? new Set();
        kinds.add(accumulator.row.skuSource);
        valueKinds.set(value, kinds);
    }
    const kindAmbiguousKeys = Array.from(valueKinds.entries())
        .filter(([, kinds]) => kinds.size > 1)
        .map(([value]) => value);
    return {
        rows,
        shopObservedDays: uploadDates.size,
        observedDates: Array.from(uploadDates).sort(),
        noSkuVariationCount,
        noSkuVariationUnits,
        collisionKeys,
        kindAmbiguousKeys,
    };
}
