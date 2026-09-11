"use strict";
/**
 * 补货V3 匹配链（纯函数）：商品分析规格货号 → 最终补货 SKU。
 *
 * 匹配状态机（2026-09 第二轮）：
 *  - confirmed：店铺专属映射（人工确认，最高优先）
 *  - auto：唯一自动匹配（元仓同码直连 / 无冲突站点级历史映射 / 自身即本地 SKU）
 *  - pending：未找到映射，进入待核对
 *  - conflict：阻断态——发现后**不得**继续任何回退（历史映射/本地回退均绕过冲突），
 *    一律进入待核对由人工确认。冲突类型各自独立：
 *    元仓同码 vs 站点历史映射不一致、历史映射多目标（含 A→A + A→B 组合）、
 *    店铺映射目标失效、元仓同码多货品、编号类型歧义（同值被 modelCode 与 variationSku/item 同时占用）。
 *
 * 身份模型（2026-09 第三轮：identityKey 贯通）：行身份 = identityKey（编号类型:规范化值），
 * 人工映射按「编号类型 + 规范化值」存储（externalSkuType），只能作用于用户选定的身份，
 * 不得修改同字符串的其他编号类型行。
 * legacy（历史字符串映射，身份未知）兼容规则：**只在身份可唯一识别时使用**——
 * 同值仅被一种编号类型占用时照常生效；同值被多种类型占用（歧义）时不得猜测，
 * legacy 行既不解析也不阻断（该值的非 modelCode 行进入 conflict 待人工为具体身份建立映射；
 * modelCode 行走自身身份安全的元仓同码直连）。
 * 有效、身份明确（typed）的人工映射优先级最高，可解除对应身份的歧义。
 *
 * 归一化碰撞（同类型不同原始文本合并）不阻断匹配，但必须传播为 warning / 质量标注。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMatchChain = exports.normalizeExternalSkuType = void 0;
const restockSalesImport_1 = require("./restockSalesImport");
const SKU_SOURCE_TYPES = new Set(['modelCode', 'variationSku', 'item']);
/** 规范化映射记录里的编号类型；非法值按 legacy（身份未知）处理 */
const normalizeExternalSkuType = (value) => typeof value === 'string' && SKU_SOURCE_TYPES.has(value) ? value : 'legacy';
exports.normalizeExternalSkuType = normalizeExternalSkuType;
const MAX_CANDIDATES = 5;
const buildYcIndex = (ycProducts) => {
    const unique = new Map();
    const conflicted = new Set();
    for (const [key, products] of ycProducts) {
        if (products.length === 1)
            unique.set(key, products[0]);
        else
            conflicted.add(key);
    }
    return { unique, conflicted };
};
/** 名称相似候选：元仓货品名包含商品名/规格名的显著片段 */
const nameSimilarityCandidates = (row, ycUnique) => {
    const tokens = new Set([row.itemName, row.variationName ?? '']
        .join(' ')
        .split(/[\s,，/|]+/)
        .map(token => token.trim().toLowerCase())
        .filter(token => token.length >= 2));
    if (tokens.size === 0)
        return [];
    const scored = [];
    for (const product of ycUnique.values()) {
        const name = String(product.customerSkuName ?? '').toLowerCase();
        if (!name)
            continue;
        for (const token of tokens) {
            if (name.includes(token)) {
                scored.push({ sku: product.customerSku, name: product.customerSkuName, source: 'yc' });
                break;
            }
        }
    }
    return scored.slice(0, MAX_CANDIDATES);
};
const localPrefixCandidates = (externalSku, ownedLocalSkus, localSkuNames) => {
    if (externalSku.length < 2)
        return [];
    const candidates = [];
    for (const sku of ownedLocalSkus) {
        if (sku === externalSku)
            continue;
        if (sku.startsWith(externalSku) || externalSku.startsWith(sku)) {
            candidates.push({ sku, name: localSkuNames.get(sku) ?? null, source: 'local' });
            if (candidates.length >= MAX_CANDIDATES)
                break;
        }
    }
    return candidates;
};
const buildMappingIndexes = (shopMappings, siteMappings) => {
    const indexes = {
        shopTyped: new Map(),
        shopLegacy: new Map(),
        siteTyped: new Map(),
        siteLegacy: new Map(),
    };
    for (const mapping of shopMappings) {
        const externalSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.externalSku);
        const targetSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.targetSku);
        if (!externalSku || !targetSku)
            continue;
        const type = (0, exports.normalizeExternalSkuType)(mapping.externalSkuType);
        if (type === 'legacy') {
            indexes.shopLegacy.set(`${mapping.shopId}\0${externalSku}`, targetSku);
        }
        else {
            indexes.shopTyped.set(`${mapping.shopId}\0${type}\0${externalSku}`, targetSku);
        }
    }
    for (const mapping of siteMappings) {
        const externalSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.externalSku);
        const targetSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.targetSku);
        if (!externalSku || !targetSku)
            continue;
        const type = (0, exports.normalizeExternalSkuType)(mapping.externalSkuType);
        const bucketKey = type === 'legacy' ? externalSku : `${type}\0${externalSku}`;
        const bucket = (type === 'legacy' ? indexes.siteLegacy : indexes.siteTyped).get(bucketKey) ?? new Set();
        bucket.add(targetSku);
        (type === 'legacy' ? indexes.siteLegacy : indexes.siteTyped).set(bucketKey, bucket);
    }
    return indexes;
};
const buildMatchChain = ({ shopNames, rowsByShop, shopMappings, siteMappings, ownedLocalSkus, localSkuNames, ycProducts, }) => {
    const indexes = buildMappingIndexes(shopMappings, siteMappings);
    const ycIndex = buildYcIndex(ycProducts);
    /** 目标身份是否有效（本地档案或元仓货品中存在） */
    const targetExists = (targetSku) => ownedLocalSkus.has(targetSku) || ycIndex.unique.has(targetSku) || ycIndex.conflicted.has(targetSku);
    // 跨店铺统计：规范化值 → 占用的编号类型集合（歧义判定基础）
    const valueKinds = new Map();
    for (const rows of rowsByShop.values()) {
        for (const row of rows) {
            const kinds = valueKinds.get(row.identityValue) ?? new Set();
            kinds.add(row.skuSource);
            valueKinds.set(row.identityValue, kinds);
        }
    }
    const resolved = new Map();
    const review = [];
    const emit = (entry, extraCandidates) => {
        const seen = new Set();
        const deduped = extraCandidates.filter(candidate => {
            const key = (0, restockSalesImport_1.normalizeRestockSku)(candidate.sku);
            if (!key || seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        review.push({ ...entry, candidates: deduped.slice(0, MAX_CANDIDATES * 2) });
    };
    for (const [shopId, rows] of rowsByShop) {
        const shopName = shopNames.get(shopId) ?? shopId;
        for (const row of rows) {
            const externalSku = row.identityValue;
            const reasons = [];
            let targetSku = null;
            let matchType = null;
            let matchStatus = null;
            let reviewStatus = 'pending';
            let blocked = false; // 冲突阻断：置位后不得再走任何回退
            const valueKindCount = valueKinds.get(externalSku)?.size ?? 1;
            const valueAmbiguous = valueKindCount > 1;
            // ---- 1. 店铺专属映射（人工确认，最高优先；typed 身份明确 > legacy 单类型值） ----
            const typedShopTarget = indexes.shopTyped.get(`${shopId}\0${row.skuSource}\0${externalSku}`) ?? null;
            const legacyShopTarget = !valueAmbiguous
                ? indexes.shopLegacy.get(`${shopId}\0${externalSku}`) ?? null
                : null; // 值被多种编号类型占用：legacy 映射身份不可识别，不得猜测使用
            // 本身份的 typed 站点映射（存在即可解除歧义，由第 4 步解析）
            const typedSiteTargets = indexes.siteTyped.get(`${row.skuSource}\0${externalSku}`) ?? null;
            const shopTarget = typedShopTarget ?? legacyShopTarget;
            if (shopTarget) {
                targetSku = shopTarget;
                matchType = 'shop-mapping';
                matchStatus = 'confirmed';
                if (!targetExists(shopTarget)) {
                    // 失效的店铺映射不得静默替换成其他身份——阻断待核对
                    targetSku = null;
                    matchType = null;
                    matchStatus = null;
                    reasons.push(`店铺专属映射的目标 SKU（${shopTarget}）在本地档案与元仓货品中均已不存在，需人工更正或删除该映射`);
                    blocked = true;
                    reviewStatus = 'conflict';
                }
            }
            // ---- 2. 编号类型歧义（阻断）：非 modelCode 行的值被多种类型占用，且无 typed 映射解歧 ----
            if (!targetSku && !blocked && valueAmbiguous && row.skuSource !== 'modelCode'
                && (!typedSiteTargets || typedSiteTargets.size === 0)) {
                const kinds = Array.from(valueKinds.get(externalSku) ?? []).join(' / ');
                reasons.push(`编号类型歧义：同一货号值（${externalSku}）同时作为 ${kinds} 出现，历史映射无法唯一识别；请为该编号类型（${row.skuSource}）单独建立映射后重新计算`);
                blocked = true;
                reviewStatus = 'conflict';
            }
            // ---- 3. 规格货号 ↔ 元仓 customerSku 唯一精确匹配（仅 modelCode 身份安全） ----
            if (!targetSku && !blocked && row.skuSource === 'modelCode') {
                if (ycIndex.conflicted.has(externalSku)) {
                    reasons.push('元仓存在多条同码货品，无法唯一确认');
                    blocked = true;
                    reviewStatus = 'conflict';
                }
                else if (ycIndex.unique.has(externalSku)) {
                    // 同码直连前检查历史映射：typed(modelCode) + legacy 的全部目标。
                    // 多目标（含 A→A 与 A→B 并存）一律 conflict；唯一目标与同码不一致同样 conflict。
                    const applicableTargets = new Set(indexes.siteTyped.get(`modelCode\0${externalSku}`) ?? []);
                    for (const target of indexes.siteLegacy.get(externalSku) ?? []) {
                        applicableTargets.add(target);
                    }
                    if (applicableTargets.size > 1) {
                        reasons.push(`站点级历史映射存在多个目标（${Array.from(applicableTargets).join(' / ')}），与元仓同码货品 ${externalSku} 无法唯一确认，需人工确认`);
                        blocked = true;
                        reviewStatus = 'conflict';
                    }
                    else if (applicableTargets.size === 1 && !applicableTargets.has(externalSku)) {
                        const [only] = applicableTargets;
                        reasons.push(`站点级历史映射指向 ${only}，与元仓同码货品 ${externalSku} 不一致，需人工确认以哪个为准`);
                        blocked = true;
                        reviewStatus = 'conflict';
                    }
                    else {
                        targetSku = externalSku;
                        matchType = 'exact-yc';
                        matchStatus = 'auto';
                    }
                }
            }
            // ---- 4. 无冲突的站点级历史映射（V2 兼容；typed(本类型) + 单类型值的 legacy） ----
            if (!targetSku && !blocked) {
                const applicableTargets = new Set(indexes.siteTyped.get(`${row.skuSource}\0${externalSku}`) ?? []);
                if (!valueAmbiguous) {
                    for (const target of indexes.siteLegacy.get(externalSku) ?? []) {
                        applicableTargets.add(target);
                    }
                }
                if (applicableTargets.size === 1) {
                    const [only] = applicableTargets;
                    if (ownedLocalSkus.has(only)) {
                        targetSku = only;
                        matchType = 'site-mapping';
                        matchStatus = 'auto';
                    }
                    else {
                        reasons.push(`站点映射目标 ${only} 的本地档案已不存在`);
                        reviewStatus = 'pending';
                    }
                }
                else if (applicableTargets.size > 1) {
                    reasons.push(`站点级历史映射存在多个目标（${Array.from(applicableTargets).join(' / ')}），需人工确认`);
                    blocked = true;
                    reviewStatus = 'conflict';
                }
            }
            // ---- 5. 自身即本地 SKU（精确回退，不落库；非 modelCode 行要求值无歧义） ----
            if (!targetSku && !blocked && (!valueAmbiguous || row.skuSource === 'modelCode') && ownedLocalSkus.has(externalSku)) {
                targetSku = externalSku;
                matchType = 'self-inventory';
                matchStatus = 'auto';
            }
            if (!targetSku || !matchStatus) {
                if (reasons.length === 0)
                    reasons.push('未找到映射或元仓同码货品');
                const candidates = [
                    ...(row.skuSource === 'modelCode' && ycIndex.unique.has(externalSku)
                        ? [{ sku: externalSku, name: ycIndex.unique.get(externalSku)?.customerSkuName ?? null, source: 'yc' }]
                        : []),
                    ...localPrefixCandidates(externalSku, ownedLocalSkus, localSkuNames),
                    ...nameSimilarityCandidates(row, ycIndex.unique),
                ];
                if (row.normalizedVariants.length > 1) {
                    reasons.push(`该货号存在归一化碰撞（原始变体：${row.normalizedVariants.join('、')}），销量已合并统计`);
                }
                emit({
                    shopId,
                    shopName,
                    identityKey: row.identityKey,
                    externalSku,
                    displaySku: row.displaySku,
                    skuSource: row.skuSource,
                    level: row.level,
                    itemId: row.itemId,
                    itemName: row.itemName,
                    variationName: row.variationName,
                    units: row.units,
                    observedDays: row.observedDays,
                    salesStatus: row.salesStatus,
                    status: reviewStatus,
                    reasons,
                }, candidates);
                continue;
            }
            const normalizedCollision = row.normalizedVariants.length > 1;
            const confirmedMatchType = matchType;
            const confirmedStatus = matchStatus;
            const existing = resolved.get(targetSku);
            if (existing) {
                // 同一最终补货 SKU 多来源合并（多平台货号 / 多店铺）
                if (existing.matchType !== confirmedMatchType) {
                    const precedence = ['shop-mapping', 'exact-yc', 'site-mapping', 'self-inventory'];
                    if (precedence.indexOf(confirmedMatchType) < precedence.indexOf(existing.matchType)) {
                        existing.matchType = confirmedMatchType;
                        existing.status = confirmedStatus;
                    }
                }
                existing.normalizedCollision = existing.normalizedCollision || normalizedCollision;
                existing.sources.push({ shopId, shopName, row });
            }
            else {
                resolved.set(targetSku, {
                    targetSku,
                    matchType: confirmedMatchType,
                    status: confirmedStatus,
                    normalizedCollision,
                    sources: [{ shopId, shopName, row }],
                });
            }
        }
    }
    return { resolved, review };
};
exports.buildMatchChain = buildMatchChain;
