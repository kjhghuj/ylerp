"use strict";
/**
 * 补货V3 路由（2026-09 升级）：商品分析店铺（需求源）× 元仓站点仓储（供应源）的补货工作台后端。
 *
 * 升级要点：
 * - 计算单位 = 用户 + 库存池（仓库范围）+ 最终补货 SKU；店铺只是需求来源。
 * - 匹配链（restockV3Matching）：店铺专属映射 → 规格货号与元仓 customerSku 唯一精确匹配
 *   （免本地档案直连）→ 无冲突站点级历史映射（V2 兼容）→ 自身即本地 SKU；其余待核对。
 * - 多平台 SKU / 多店铺指向同一最终补货 SKU 时需求合并为一条建议，来源全部可追溯。
 * - 计算策略（restockPlanner policies）：元仓无库存行 ≠ 零库存（不可执行）；无 ETA / 逾期在途
 *   不计入确定供应；逐日模拟识别中途断货与到仓前缺口。V2 引擎默认行为不变。
 * - 销量口径第一阶段保留 unitsOrdered（已下订单件数），分母默认 = 店铺实际上传天数，
 *   全链路标注分母 / 自然日 / 有效观测日 / 缺失日 / 覆盖率与数据质量状态。
 * - 响应带快照指纹（条件版本）；计划快照支持草稿 → 已确认 → 作废与导出版本一致。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRestockV3Router = void 0;
const crypto_1 = require("crypto");
const express_1 = require("express");
const index_1 = require("../index");
const usageEvents_1 = require("../services/usageEvents");
const productCache_1 = require("../services/productCache");
const restockPlanner_1 = require("../services/restockPlanner");
const ycOpenPlatformClient_1 = require("../services/ycOpenPlatformClient");
const restockSalesImport_1 = require("../services/restockSalesImport");
const restockShopSales_1 = require("../services/restockShopSales");
const restockV3Matching_1 = require("../services/restockV3Matching");
const restockYcShared_1 = require("../services/restockYcShared");
const ALGORITHM_VERSION = 'v3.1';
const MAX_QUERY_RANGE_DAYS = 366;
const MAX_SHOPS_PER_PLAN = 10;
const SALES_QUALITY_MIN_OBSERVED_DAYS = 3;
const SALES_QUALITY_STALE_DAYS = 7;
const YC_PRODUCTS_TTL_MS = 5 * 60_000;
const MAX_PLAN_ITEMS = 5000;
const MAX_PLAN_NAME_LENGTH = 200;
const MAX_WAREHOUSE_CODES_PER_POOL = 100;
const RESTOCK_V3_POLICIES = {
    missingStockPolicy: 'unknown',
    inboundEtaPolicy: 'strict',
    simulateDaily: true,
    quantityMode: 'simulation',
};
const requireRestockPermission = (0, restockYcShared_1.createRestockPermissionGuard)(() => index_1.prisma, 'restock-v3');
// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
function parseDateUtc(date) {
    return new Date(`${date}T00:00:00.000Z`);
}
function dateString(date) {
    return date.toISOString().slice(0, 10);
}
/** 区间校验：from ≤ to 且跨度 ≤ 366 天（与商品分析查询口径一致） */
function parseShopRange(query) {
    try {
        const from = (0, restockYcShared_1.parseDateQuery)(query.from, 'from');
        const to = (0, restockYcShared_1.parseDateQuery)(query.to, 'to');
        if (!from || !to || from > to)
            return null;
        const days = Math.round((parseDateUtc(to).getTime() - parseDateUtc(from).getTime()) / 86_400_000) + 1;
        if (days > MAX_QUERY_RANGE_DAYS)
            return null;
        return { from, to };
    }
    catch {
        return null;
    }
}
async function findOwnedShop(id, userId) {
    return index_1.prisma.productAnalysisShop.findFirst({ where: { id, userId } });
}
/** 拉取区间行并转 ShopDailyItemRow（date 由上传记录映射，避免逐行 join） */
async function fetchShopSalesRows(shopId, from, to) {
    const uploads = await index_1.prisma.productAnalysisDailyUpload.findMany({
        where: { shopId, isActive: true, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
        select: { id: true, date: true },
        orderBy: { date: 'asc' },
    });
    if (uploads.length === 0)
        return [];
    const dateByUploadId = new Map(uploads.map((upload) => [upload.id, dateString(upload.date)]));
    const rawRows = await index_1.prisma.productDailyItem.findMany({
        where: { uploadId: { in: uploads.map((upload) => upload.id) } },
        select: { uploadId: true, itemId: true, itemName: true, unitsOrdered: true, variations: true },
    });
    return rawRows.map((raw) => ({
        date: dateByUploadId.get(raw.uploadId) ?? '',
        itemId: raw.itemId,
        itemName: raw.itemName,
        unitsOrdered: raw.unitsOrdered,
        variations: raw.variations,
    }));
}
const ycProductsCache = new Map();
const restockSourceCache = new Map();
const RESTOCK_SOURCE_CACHE_TTL_MS = 10 * 60_000;
const RESTOCK_SOURCE_CACHE_MAX_ENTRIES = 200;
async function fetchYcProductIndex(ycClient, userId) {
    const cached = ycProductsCache.get(userId);
    if (cached && Date.now() - cached.at < YC_PRODUCTS_TTL_MS) {
        return { entry: cached, warning: null };
    }
    if (typeof ycClient.listProducts !== 'function') {
        return { entry: null, warning: 'YC product list is unavailable; exact-match with YC SKUs is disabled.' };
    }
    try {
        const products = await ycClient.listProducts();
        const index = new Map();
        for (const product of products) {
            const sku = (0, restockSalesImport_1.normalizeRestockSku)(product.customerSku ?? '');
            if (!sku)
                continue;
            const entries = index.get(sku) ?? [];
            entries.push({
                customerSku: String(product.customerSku ?? '').trim(),
                customerSkuName: product.customerSkuName ?? null,
            });
            index.set(sku, entries);
        }
        const entry = { at: Date.now(), fetchedAt: new Date().toISOString(), index };
        ycProductsCache.set(userId, entry);
        return { entry, warning: null };
    }
    catch (error) {
        (0, restockYcShared_1.logSafeFailure)('YC product list lookup failed', error);
        return { entry: null, warning: 'YC product list fetch failed; exact-match with YC SKUs is disabled.' };
    }
}
const QUALITY_SEVERITY = {
    ok: 0,
    zero: 1,
    insufficient: 2,
    stale: 3,
    no_data: 4,
};
function sourceQuality(source, planningDate) {
    const staleBefore = parseDateUtc(planningDate).getTime() - SALES_QUALITY_STALE_DAYS * 86_400_000;
    // 过旧锚定计划日（而非区间末日）：最新观测早于「计划日 − 7 天」即视为过旧
    const isStale = source.latestObservedDate === null
        || parseDateUtc(source.latestObservedDate).getTime() < staleBefore;
    const status = source.observedDays === 0
        ? 'no_data'
        : source.units === 0
            ? 'zero'
            : isStale
                ? 'stale'
                : source.observedDays < SALES_QUALITY_MIN_OBSERVED_DAYS
                    ? 'insufficient'
                    : 'ok';
    return {
        status,
        observedDays: source.observedDays,
        shopObservedDays: source.shopObservedDays,
        missingDays: Math.max(0, source.shopObservedDays - source.observedDays),
        coverage: source.shopObservedDays > 0 ? Math.min(1, source.observedDays / source.shopObservedDays) : 0,
        latestObservedDate: source.latestObservedDate,
        totalUnits: source.units,
        executable: status === 'ok' || status === 'zero' || status === 'insufficient',
    };
}
function computeSalesQuality(sources, planningDate) {
    const perSource = sources.map(source => sourceQuality(source, planningDate));
    if (perSource.length === 0) {
        return {
            status: 'no_data',
            observedDays: 0,
            shopObservedDays: 0,
            missingDays: 0,
            coverage: 0,
            latestObservedDate: null,
            totalUnits: 0,
            executable: false,
        };
    }
    // 最差来源决定整体质量：不允许可靠来源掩盖缺失来源（不使用 max 观测天数）
    const worst = perSource.reduce((left, right) => QUALITY_SEVERITY[right.status] > QUALITY_SEVERITY[left.status] ? right : left);
    return {
        ...worst,
        totalUnits: perSource.reduce((sum, quality) => sum + quality.totalUnits, 0),
    };
}
// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------
const createRestockV3Router = ({ ycClient, ycClientFactory, } = {}) => {
    const router = (0, express_1.Router)();
    const getYcClient = async (userId) => {
        if (ycClient)
            return ycClient;
        if (ycClientFactory)
            return ycClientFactory(userId);
        return (0, ycOpenPlatformClient_1.createUserYcOpenPlatformClient)(index_1.prisma, userId);
    };
    // ---- 店铺（商品分析） ----
    router.get('/shops', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const [shops, stats] = await Promise.all([
                index_1.prisma.productAnalysisShop.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
                }),
                index_1.prisma.productAnalysisDailyUpload.groupBy({
                    by: ['shopId'],
                    where: { userId, isActive: true },
                    _count: { _all: true },
                    _max: { date: true },
                }),
            ]);
            const statsByShop = new Map(stats.map((stat) => [stat.shopId, stat]));
            res.json(shops.map((shop) => {
                const stat = statsByShop.get(shop.id);
                return {
                    ...shop,
                    dayCount: stat?._count._all ?? 0,
                    latestUploadDate: stat?._max.date ? dateString(stat._max.date) : null,
                };
            }));
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 shop lookup failed', error);
            res.status(500).json({ error: 'Failed to fetch shops' });
        }
    });
    /** 店铺销量视图：本地聚合 + 本地映射（快，不拉元仓；元仓同码直连在计算时自动完成） */
    router.get('/shops/:id/sales', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const shop = await findOwnedShop(String(req.params.id ?? ''), userId);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            const range = parseShopRange(req.query);
            if (!range) {
                return res.status(400).json({ error: 'from/to must be valid dates (from ≤ to, span ≤ 366 days)' });
            }
            const dailyRows = await fetchShopSalesRows(shop.id, range.from, range.to);
            if (dailyRows.length === 0) {
                return res.status(400).json({ error: 'No product analysis uploads in this date range' });
            }
            const aggregate = (0, restockShopSales_1.aggregateShopVariantSales)(dailyRows);
            const [shopMappings, siteMappings, inventoryItems, products] = await Promise.all([
                index_1.prisma.restockShopSkuMapping.findMany({ where: { userId, shopId: shop.id } }),
                index_1.prisma.externalSkuMapping.findMany({ where: { userId, site: shop.site } }),
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
                index_1.prisma.product.findMany({ where: { userId }, select: { sku: true } }),
            ]);
            const ownedLocalSkus = new Set();
            const localSkuNames = new Map();
            for (const item of [...inventoryItems, ...products]) {
                const sku = (0, restockSalesImport_1.normalizeRestockSku)(item.sku);
                if (sku) {
                    ownedLocalSkus.add(sku);
                    localSkuNames.set(sku, localSkuNames.get(sku) ?? '');
                }
            }
            const { resolved, review } = (0, restockV3Matching_1.buildMatchChain)({
                shopNames: new Map([[shop.id, shop.name]]),
                rowsByShop: new Map([[shop.id, aggregate.rows]]),
                shopMappings,
                siteMappings,
                ownedLocalSkus,
                localSkuNames,
                ycProducts: new Map(), // 销量视图不拉元仓清单；exact-yc 在计算时完成
            });
            const targetByExternal = new Map();
            for (const entry of resolved.values()) {
                for (const source of entry.sources) {
                    targetByExternal.set(`${source.shopId}\0${source.row.externalSku}`, {
                        targetSku: entry.targetSku,
                        matchType: entry.matchType,
                    });
                }
            }
            const reviewByExternal = new Map(review.map(entry => [`${entry.shopId}\0${entry.externalSku}`, entry]));
            const rows = aggregate.rows.map((row) => {
                const matched = targetByExternal.get(`${shop.id}\0${row.externalSku}`) ?? null;
                const reviewEntry = reviewByExternal.get(`${shop.id}\0${row.externalSku}`);
                return {
                    ...row,
                    targetSku: matched?.targetSku ?? null,
                    mappingStatus: matched ? 'mapped' : 'pending',
                    matchType: matched?.matchType ?? null,
                    pendingReasons: reviewEntry?.reasons ?? [],
                };
            });
            return res.json({
                shop: { id: shop.id, name: shop.name, site: shop.site, currency: shop.currency },
                from: range.from,
                to: range.to,
                shopObservedDays: aggregate.shopObservedDays,
                calendarDays: Math.round((parseDateUtc(range.to).getTime() - parseDateUtc(range.from).getTime()) / 86_400_000) + 1,
                observedDates: aggregate.observedDates,
                pendingCount: review.length,
                collisionKeys: aggregate.collisionKeys,
                noSkuVariationCount: aggregate.noSkuVariationCount,
                noSkuVariationUnits: aggregate.noSkuVariationUnits,
                rows,
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 shop sales lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch shop sales' });
        }
    });
    // ---- 目标 SKU（与 V2 同一套本地 SKU 库） ----
    router.get('/target-skus', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const [inventoryItems, products] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { id: true, sku: true, name: true } }),
                index_1.prisma.product.findMany({ where: { userId }, select: { id: true, sku: true, name: true } }),
            ]);
            const unique = new Map();
            [...inventoryItems, ...products].forEach((item) => {
                const sku = (0, restockSalesImport_1.normalizeRestockSku)(item.sku);
                if (!sku || unique.has(sku))
                    return;
                unique.set(sku, { id: String(item.id), sku, name: String(item.name || '').trim() || sku });
            });
            const items = Array.from(unique.values()).sort((left, right) => left.sku.localeCompare(right.sku));
            return res.json({ items });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 target SKU lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch target SKUs' });
        }
    });
    router.post('/target-skus', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let site;
            let sku;
            let name;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.body?.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
                sku = (0, restockSalesImport_1.normalizeRestockSku)(req.body?.sku);
                if (!sku || sku.length > 200)
                    throw new Error('Invalid sku');
                const suppliedName = req.body?.name;
                if (suppliedName !== undefined && typeof suppliedName !== 'string')
                    throw new Error('Invalid name');
                name = suppliedName?.trim() || sku;
                if (name.length > restockYcShared_1.MAX_TARGET_SKU_NAME_LENGTH)
                    throw new Error('Invalid name');
            }
            catch {
                return res.status(400).json({ error: 'Invalid target SKU payload' });
            }
            const [products, inventoryItems] = await Promise.all([
                index_1.prisma.product.findMany({ where: { userId }, select: { sku: true } }),
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
            ]);
            if ([...products, ...inventoryItems].some((item) => (0, restockSalesImport_1.normalizeRestockSku)(item.sku) === sku)) {
                return res.status(409).json({ error: 'Target SKU already exists' });
            }
            const inventory = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_target_create', objectType: 'InventoryItem' }, async (tx) => {
                await tx.product.create({
                    data: {
                        name,
                        sku,
                        country: site,
                        sites: [site],
                        cost: 0,
                        productWeight: 0,
                        supplierTaxPoint: 0,
                        supplierInvoice: 'no',
                        sellerCouponType: 'fixed',
                        sellerCoupon: 0,
                        sellerCouponPlatformRatio: 0,
                        adROI: 15,
                        totalRevenue: 0,
                        platformInfrastructureFee: 0,
                        siteData: { [site]: { totalRevenue: 0 } },
                        userId,
                    },
                });
                return tx.inventoryItem.create({
                    data: {
                        name,
                        sku,
                        currentStock: 0,
                        stockOfficial: 0,
                        stockThirdParty: 0,
                        inTransit: 0,
                        dailySales: 0,
                        leadTime: 25,
                        replenishCycle: 30,
                        costPerUnit: 0,
                        userId,
                    },
                });
            });
            await Promise.all([
                index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId)),
                index_1.safeRedis.del(`inventory:${userId}`),
            ]);
            return res.status(201).json(inventory);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 target SKU create failed', error);
            return res.status(500).json({ error: 'Failed to create target SKU' });
        }
    });
    // ---- 映射（默认店铺专属作用域；scope='site' 写入 V2 共享表） ----
    router.put('/mapping', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let shopId;
            let externalSku;
            let targetSku;
            let scope;
            let externalSkuType;
            try {
                shopId = (0, restockYcShared_1.parseRequiredString)(req.body?.shopId, 'shopId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                externalSku = (0, restockSalesImport_1.normalizeRestockSku)(req.body?.externalSku);
                targetSku = (0, restockSalesImport_1.normalizeRestockSku)(req.body?.targetSku);
                if (!externalSku || !targetSku)
                    throw new Error('Invalid SKU mapping payload');
                scope = req.body?.scope === 'site' ? 'site' : 'shop';
                // 编号类型（人工映射绑定的身份）：仅接受三种编号类型；缺省 = legacy（历史字符串映射）
                externalSkuType = (0, restockV3Matching_1.normalizeExternalSkuType)(req.body?.externalSkuType);
                if (req.body?.externalSkuType !== undefined && externalSkuType === 'legacy'
                    && req.body.externalSkuType !== 'legacy') {
                    throw new Error('Invalid externalSkuType');
                }
            }
            catch {
                return res.status(400).json({ error: 'Invalid SKU mapping payload' });
            }
            const shop = await findOwnedShop(shopId, userId);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            const [inventoryItems, products] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
                index_1.prisma.product.findMany({ where: { userId }, select: { sku: true, name: true, cost: true } }),
            ]);
            const matchedInventory = inventoryItems.find((entry) => (0, restockSalesImport_1.normalizeRestockSku)(entry.sku) === targetSku);
            const matchedProduct = products.find((entry) => (0, restockSalesImport_1.normalizeRestockSku)(entry.sku) === targetSku);
            if (!matchedInventory && !matchedProduct)
                return res.status(400).json({ error: 'Target SKU not found' });
            const normalizedTargetSku = (0, restockSalesImport_1.normalizeRestockSku)(matchedInventory?.sku || matchedProduct.sku);
            if (scope === 'site') {
                // 站点级（V2 共享）：保持 V2 行为，必要时回填 InventoryItem；
                // externalSkuType=legacy 的行 V2 可见，typed 行仅 V3 按 身份 使用
                await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_mapping_save', objectType: 'ExternalSkuMapping' }, async (tx) => {
                    if (!matchedInventory) {
                        await tx.inventoryItem.create({
                            data: {
                                name: matchedProduct.name || matchedProduct.sku,
                                sku: normalizedTargetSku,
                                currentStock: 0,
                                stockOfficial: 0,
                                stockThirdParty: 0,
                                inTransit: 0,
                                dailySales: 0,
                                leadTime: 25,
                                replenishCycle: 30,
                                costPerUnit: Number.isFinite(matchedProduct.cost) ? matchedProduct.cost : 0,
                                userId,
                            },
                        });
                    }
                    await tx.externalSkuMapping.upsert({
                        where: { userId_site_externalSku_externalSkuType: { userId, site: shop.site, externalSku, externalSkuType } },
                        create: { userId, site: shop.site, externalSku, externalSkuType, targetSku: normalizedTargetSku },
                        update: { targetSku: normalizedTargetSku },
                    });
                });
                if (!matchedInventory)
                    await index_1.safeRedis.del(`inventory:${userId}`);
                return res.json({ externalSku, targetSku: normalizedTargetSku, externalSkuType, site: shop.site, scope });
            }
            await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_mapping_save', objectType: 'RestockShopSkuMapping' }, (tx) => tx.restockShopSkuMapping.upsert({
                where: { userId_shopId_externalSku_externalSkuType: { userId, shopId: shop.id, externalSku, externalSkuType } },
                create: { userId, shopId: shop.id, site: shop.site, externalSku, externalSkuType, targetSku: normalizedTargetSku },
                update: { targetSku: normalizedTargetSku },
            }));
            return res.json({ externalSku, targetSku: normalizedTargetSku, externalSkuType, shopId: shop.id, site: shop.site, scope });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 SKU mapping failed', error);
            return res.status(500).json({ error: 'Failed to save SKU mapping' });
        }
    });
    router.delete('/mapping', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let shopId;
            let externalSku;
            let scope;
            let externalSkuType;
            try {
                shopId = (0, restockYcShared_1.parseRequiredString)(req.body?.shopId, 'shopId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                externalSku = (0, restockSalesImport_1.normalizeRestockSku)(req.body?.externalSku);
                if (!externalSku)
                    throw new Error('Invalid SKU mapping payload');
                scope = req.body?.scope === 'site' ? 'site' : 'shop';
                // 指定编号类型 = 只删除该身份的映射；缺省 = 删除该货号全部类型（结果页「恢复继承」）
                if (req.body?.externalSkuType !== undefined) {
                    externalSkuType = (0, restockV3Matching_1.normalizeExternalSkuType)(req.body.externalSkuType);
                    if (externalSkuType === 'legacy' && req.body.externalSkuType !== 'legacy') {
                        throw new Error('Invalid externalSkuType');
                    }
                }
                else {
                    externalSkuType = null;
                }
            }
            catch {
                return res.status(400).json({ error: 'Invalid SKU mapping payload' });
            }
            const shop = await findOwnedShop(shopId, userId);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            if (scope === 'site') {
                await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_mapping_delete', objectType: 'ExternalSkuMapping' }, (tx) => tx.externalSkuMapping.deleteMany({
                    where: { userId, site: shop.site, externalSku, ...(externalSkuType ? { externalSkuType } : {}) },
                }));
            }
            else {
                await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_mapping_delete', objectType: 'RestockShopSkuMapping' }, (tx) => tx.restockShopSkuMapping.deleteMany({
                    where: { userId, shopId: shop.id, externalSku, ...(externalSkuType ? { externalSkuType } : {}) },
                }));
            }
            return res.json({ deleted: true, scope });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 SKU mapping delete failed', error);
            return res.status(500).json({ error: 'Failed to delete SKU mapping' });
        }
    });
    // ---- SKU 规则（店铺专属优先；scope='site' 写 V2 共享表） ----
    router.get('/sku-rules', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const shop = await findOwnedShop((0, restockYcShared_1.parseRequiredString)(req.query.shopId, 'shopId', restockYcShared_1.MAX_IMPORT_ID_LENGTH), req.user.id);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            const [shopRules, siteRules] = await Promise.all([
                index_1.prisma.restockShopRule.findMany({ where: { userId: req.user.id, shopId: shop.id }, orderBy: { sku: 'asc' } }),
                index_1.prisma.restockSkuRule.findMany({ where: { userId: req.user.id, site: shop.site }, orderBy: { sku: 'asc' } }),
            ]);
            return res.json({
                site: shop.site,
                rules: [
                    ...shopRules.map(rule => ({ ...rule, scope: 'shop' })),
                    ...siteRules.map(rule => ({ ...rule, scope: 'site' })),
                ],
            });
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith('Invalid')) {
                return res.status(400).json({ error: 'shopId is required' });
            }
            (0, restockYcShared_1.logSafeFailure)('Restock V3 SKU rule lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch SKU rules' });
        }
    });
    router.put('/sku-rules/:sku', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let shopId;
            let sku;
            let leadTimeDays;
            let safetyDays;
            let growthPercent;
            let scope;
            try {
                shopId = (0, restockYcShared_1.parseRequiredString)(req.body?.shopId, 'shopId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                sku = (0, restockSalesImport_1.normalizeRestockSku)(req.params.sku);
                if (!sku)
                    throw new Error('Invalid sku');
                leadTimeDays = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.leadTimeDays, 'leadTimeDays', 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                safetyDays = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.safetyDays, 'safetyDays', 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                growthPercent = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.growthPercent, 'growthPercent', 0, restockYcShared_1.MAX_GROWTH_PERCENT);
                scope = req.body?.scope === 'site' ? 'site' : 'shop';
            }
            catch {
                return res.status(400).json({ error: 'Invalid SKU rule payload' });
            }
            const shop = await findOwnedShop(shopId, userId);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            // 放宽：元仓同码直连 SKU 无本地档案也需要规则覆盖，故仅校验编码合法性
            const data = { leadTimeDays, safetyDays, growthPercent };
            const rule = scope === 'site'
                ? await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_rule_save', objectType: 'RestockSkuRule' }, (tx) => tx.restockSkuRule.upsert({
                    where: { userId_site_sku: { userId, site: shop.site, sku } },
                    create: { userId, site: shop.site, sku, ...data },
                    update: data,
                }))
                : await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_rule_save', objectType: 'RestockShopRule' }, (tx) => tx.restockShopRule.upsert({
                    where: { userId_shopId_sku: { userId, shopId: shop.id, sku } },
                    create: { userId, shopId: shop.id, sku, ...data },
                    update: data,
                }));
            return res.json(rule);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 SKU rule update failed', error);
            return res.status(500).json({ error: 'Failed to save SKU rule' });
        }
    });
    // ---- 元仓货品清单（待核对候选 / 直连身份） ----
    router.get('/yc-products', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const site = (0, restockYcShared_1.normalizeSite)(req.query.site);
            const activeYcClient = await getYcClient(req.user.id);
            if (!activeYcClient.isConfigured()) {
                return res.status(503).json({ error: 'YC credentials are not configured' });
            }
            const { entry, warning } = await fetchYcProductIndex(activeYcClient, req.user.id);
            if (!entry) {
                return res.status(503).json({ error: 'YC product list is unavailable', warning });
            }
            // 元仓货品为账户级数据（openPlatform/product/list 无站点维度），
            // 不制造虚假的站点过滤；site 仅作为回显供前端标识当前上下文。
            const products = Array.from(entry.index.values())
                .flat()
                .sort((left, right) => left.customerSku.localeCompare(right.customerSku));
            return res.json({ products, site: site || null, fetchedAt: entry.fetchedAt, warning });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 YC product lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch YC products' });
        }
    });
    /** 删除 SKU 规则 = 恢复继承（店铺级删除店铺覆盖；站点级删除 V2 共享覆盖） */
    router.delete('/sku-rules/:sku', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const shopId = (0, restockYcShared_1.parseRequiredString)(req.body?.shopId ?? req.query.shopId, 'shopId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
            const sku = (0, restockSalesImport_1.normalizeRestockSku)(req.params.sku);
            if (!sku)
                return res.status(400).json({ error: 'Invalid sku' });
            const scope = (req.body?.scope ?? req.query.scope) === 'site' ? 'site' : 'shop';
            const shop = await findOwnedShop(shopId, userId);
            if (!shop)
                return res.status(404).json({ error: 'Shop not found' });
            const deleted = scope === 'site'
                ? await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_rule_delete', objectType: 'RestockSkuRule' }, (tx) => tx.restockSkuRule.deleteMany({ where: { userId, site: shop.site, sku } }))
                : await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_rule_delete', objectType: 'RestockShopRule' }, (tx) => tx.restockShopRule.deleteMany({ where: { userId, shopId: shop.id, sku } }));
            return res.json({ deleted: deleted.count > 0 });
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith('Invalid')) {
                return res.status(400).json({ error: 'shopId is required' });
            }
            (0, restockYcShared_1.logSafeFailure)('Restock V3 SKU rule delete failed', error);
            return res.status(500).json({ error: 'Failed to delete SKU rule' });
        }
    });
    // ---- 元仓真实仓库（库存池管理用；账户级数据） ----
    router.get('/warehouses', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const activeYcClient = await getYcClient(req.user.id);
            if (!activeYcClient.isConfigured()) {
                return res.status(503).json({ error: 'YC credentials are not configured' });
            }
            try {
                const warehouses = await activeYcClient.listCustomerWarehouses();
                return res.json({
                    warehouses: warehouses.map(warehouse => ({
                        code: String(warehouse.code ?? '').trim(),
                        name: warehouse.name ?? null,
                        siteCode: warehouse.siteCode ?? null,
                    })).filter(warehouse => warehouse.code),
                });
            }
            catch (error) {
                (0, restockYcShared_1.logSafeFailure)('YC warehouse list failed', error);
                return res.status(503).json({ error: 'YC warehouse list is unavailable' });
            }
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 warehouse lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch warehouses' });
        }
    });
    // ---- 库存池 ----
    router.get('/pools', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const pools = await index_1.prisma.restockStockPool.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
            });
            return res.json({ pools });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 pool lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch stock pools' });
        }
    });
    router.post('/pools', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let name;
            let site;
            let warehouseCodes;
            try {
                name = (0, restockYcShared_1.parseRequiredString)(req.body?.name, 'name', 100);
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.body?.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
                if (!Array.isArray(req.body?.warehouseCodes))
                    throw new Error('Invalid warehouseCodes');
                warehouseCodes = Array.from(new Set(req.body.warehouseCodes
                    .map(code => String(code ?? '').trim())
                    .filter(Boolean)));
                if (warehouseCodes.length === 0 || warehouseCodes.length > MAX_WAREHOUSE_CODES_PER_POOL) {
                    throw new Error('Invalid warehouseCodes');
                }
                if (warehouseCodes.some(code => code.length > 128))
                    throw new Error('Invalid warehouseCodes');
            }
            catch {
                return res.status(400).json({ error: 'Invalid stock pool payload' });
            }
            const pool = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_pool_create', objectType: 'RestockStockPool' }, (tx) => tx.restockStockPool.create({
                data: { userId, name, site, warehouseCodes },
            }));
            return res.status(201).json(pool);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 pool create failed', error);
            return res.status(500).json({ error: 'Failed to create stock pool' });
        }
    });
    router.delete('/pools/:id', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const deleted = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_pool_delete', objectType: 'RestockStockPool' }, (tx) => tx.restockStockPool.deleteMany({
                where: { id: String(req.params.id ?? ''), userId: req.user.id },
            }));
            return res.json({ deleted: deleted.count > 0 });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 pool delete failed', error);
            return res.status(500).json({ error: 'Failed to delete stock pool' });
        }
    });
    // ---- 核心计算 ----
    router.post('/recommendations', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            let shopIds;
            let range;
            let planningDate;
            let targetDate;
            let leadTimeDays;
            let safetyDays;
            let growthPercent;
            let statisticsDaysOverride;
            let poolId;
            let explicitWarehouseCodes;
            try {
                const rawShopIds = Array.isArray(req.body?.shopIds)
                    ? req.body.shopIds.map(id => String(id ?? ''))
                    : req.body?.shopId !== undefined
                        ? [String(req.body.shopId)]
                        : [];
                shopIds = Array.from(new Set(rawShopIds.map(id => id.trim()).filter(Boolean)));
                if (shopIds.length === 0 || shopIds.length > MAX_SHOPS_PER_PLAN)
                    throw new Error('Invalid shopIds');
                if (shopIds.some(id => id.length > restockYcShared_1.MAX_IMPORT_ID_LENGTH))
                    throw new Error('Invalid shopIds');
                range = parseShopRange(req.body);
                if (!range)
                    throw new Error('Invalid range');
                planningDate = (0, restockYcShared_1.parseDateQuery)(req.body?.planningDate, 'planningDate')
                    || new Date().toISOString().slice(0, 10);
                const parsedTargetDate = (0, restockYcShared_1.parseDateQuery)(req.body?.targetDate, 'targetDate');
                if (!parsedTargetDate)
                    throw new Error('Invalid targetDate');
                targetDate = parsedTargetDate;
                leadTimeDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.leadTimeDays, 'leadTimeDays', 25, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                safetyDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.safetyDays, 'safetyDays', 30, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                growthPercent = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.growthPercent, 'growthPercent', 0, 0, restockYcShared_1.MAX_GROWTH_PERCENT);
                statisticsDaysOverride = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.statisticsDays, 'statisticsDays', 1, restockYcShared_1.MAX_PLANNING_DAYS, true);
                poolId = typeof req.body?.poolId === 'string' && req.body.poolId.trim() ? req.body.poolId.trim().slice(0, restockYcShared_1.MAX_IMPORT_ID_LENGTH) : null;
                explicitWarehouseCodes = Array.isArray(req.body?.warehouseCodes)
                    ? Array.from(new Set(req.body.warehouseCodes.map(code => String(code ?? '').trim()).filter(Boolean)))
                    : null;
                const horizonDays = (Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${planningDate}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000);
                if (horizonDays <= leadTimeDays || horizonDays > restockYcShared_1.MAX_PLANNING_DAYS)
                    throw new Error('Invalid targetDate');
            }
            catch {
                return res.status(400).json({ error: 'Invalid restock parameters' });
            }
            const shops = await index_1.prisma.productAnalysisShop.findMany({ where: { userId, id: { in: shopIds } } });
            if (shops.length !== shopIds.length)
                return res.status(404).json({ error: 'Shop not found' });
            const site = (0, restockYcShared_1.normalizeSite)(shops[0].site);
            if (shops.some(shop => (0, restockYcShared_1.normalizeSite)(shop.site) !== site)) {
                return res.status(400).json({ error: 'All shops must belong to the same site for a shared pool calculation' });
            }
            // ---- 销量聚合（逐店铺） ----
            const perShop = await Promise.all(shopIds.map(async (shopId) => {
                const dailyRows = await fetchShopSalesRows(shopId, range.from, range.to);
                const aggregate = (0, restockShopSales_1.aggregateShopVariantSales)(dailyRows);
                return { shopId, aggregate };
            }));
            // 共仓完整性：任一选定店铺区间内无上传 → 其需求未知（不等于零需求），阻断整次计算
            const emptyShops = shops.filter(shop => {
                const entry = perShop.find(candidate => candidate.shopId === shop.id);
                return !entry || entry.aggregate.rows.length === 0;
            });
            if (emptyShops.length > 0) {
                return res.status(400).json({
                    error: `以下店铺在统计区间内没有有效上传数据，无法确定其需求：${emptyShops.map(shop => shop.name).join('、')}。请调整区间或取消选择这些店铺。`,
                });
            }
            const shopsWithRows = perShop.filter(entry => entry.aggregate.rows.length > 0);
            const shopNames = new Map(shops.map(shop => [shop.id, shop.name]));
            const rowsByShop = new Map(shopsWithRows.map(entry => [entry.shopId, entry.aggregate.rows]));
            const shopObservedDaysByShop = new Map(perShop.map(entry => [entry.shopId, entry.aggregate.shopObservedDays]));
            // ---- 本地档案与映射 ----
            const [inventoryItems, products, warehouseMappings, savedSiteRules, savedShopRules, siteMappings, shopMappings] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({ where: { userId } }),
                index_1.prisma.product.findMany({ where: { userId } }),
                index_1.prisma.warehouseMapping.findMany({ where: { userId } }),
                index_1.prisma.restockSkuRule.findMany({ where: { userId, site } }),
                index_1.prisma.restockShopRule.findMany({ where: { userId, shopId: { in: shopIds } } }),
                index_1.prisma.externalSkuMapping.findMany({ where: { userId, site } }),
                index_1.prisma.restockShopSkuMapping.findMany({ where: { userId, shopId: { in: shopIds } } }),
            ]);
            const inventoryBySku = new Map(inventoryItems.map((item) => [(0, restockSalesImport_1.normalizeRestockSku)(item.sku), item]));
            const productBySku = new Map(products.map((product) => [(0, restockSalesImport_1.normalizeRestockSku)(product.sku), product]));
            const ownedLocalSkus = new Set([
                ...Array.from(inventoryBySku.keys()),
                ...Array.from(productBySku.keys()),
            ]);
            const localSkuNames = new Map();
            for (const [sku, item] of inventoryBySku)
                localSkuNames.set(sku, item.name);
            for (const [sku, product] of productBySku)
                localSkuNames.set(sku, product.name || sku);
            // ---- 元仓清单 + 匹配链 ----
            const activeYcClient = await getYcClient(userId);
            if (!activeYcClient.isConfigured()) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const ycProductsResult = await fetchYcProductIndex(activeYcClient, userId);
            const matchChain = (0, restockV3Matching_1.buildMatchChain)({
                shopNames,
                rowsByShop,
                shopMappings,
                siteMappings,
                ownedLocalSkus,
                localSkuNames,
                ycProducts: ycProductsResult.entry?.index ?? new Map(),
            });
            // ---- 目标分组：超长 SKU 不能查询元仓 → 待核对 ----
            const excludedOversizedSkus = [];
            const eligibleTargets = [];
            const review = [...matchChain.review];
            for (const [targetSku, entry] of matchChain.resolved) {
                if (targetSku.length > restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH) {
                    excludedOversizedSkus.push(targetSku);
                    review.push({
                        shopId: entry.sources[0].shopId,
                        shopName: entry.sources[0].shopName,
                        identityKey: entry.sources[0].row.identityKey,
                        externalSku: entry.sources[0].row.externalSku,
                        displaySku: entry.sources[0].row.displaySku,
                        skuSource: entry.sources[0].row.skuSource,
                        level: entry.sources[0].row.level,
                        itemId: entry.sources[0].row.itemId,
                        itemName: entry.sources[0].row.itemName,
                        variationName: entry.sources[0].row.variationName,
                        units: entry.sources.reduce((sum, source) => sum + source.row.units, 0),
                        observedDays: Math.max(...entry.sources.map(source => source.row.observedDays)),
                        salesStatus: entry.sources[0].row.salesStatus,
                        status: 'conflict',
                        reasons: [`目标 SKU 超出元仓查询长度限制（>${restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH} 字符）`],
                        candidates: [],
                    });
                    continue;
                }
                eligibleTargets.push(entry);
            }
            // ---- 合并需求（多平台 SKU / 多店铺） ----
            // 规则作用域：店铺规则按 (shopId, sku)；站点规则按 sku。
            // growth 先按各来源店铺规则折算再合并（blended，与选择顺序无关）；
            // leadTime / safety 多来源冲突取最大值（保守），并在结果行 warning 列明。
            const denominatorByShop = new Map();
            for (const [shopId, observedDays] of shopObservedDaysByShop) {
                denominatorByShop.set(shopId, statisticsDaysOverride ?? Math.max(1, observedDays));
            }
            const shopRuleByShopSku = new Map();
            for (const rule of savedShopRules) {
                const skuKey = (0, restockSalesImport_1.normalizeRestockSku)(rule.sku);
                if (skuKey)
                    shopRuleByShopSku.set(`${rule.shopId}\0${skuKey}`, rule);
            }
            const siteRuleBySku = new Map(savedSiteRules.map(rule => [(0, restockSalesImport_1.normalizeRestockSku)(rule.sku), rule]));
            const baseDailyByTarget = new Map();
            const blendedGrowthByTarget = new Map();
            const hasExplicitGrowthByTarget = new Map();
            const mergedLeadByTarget = new Map();
            const mergedSafetyByTarget = new Map();
            const hasRuleByTarget = new Map();
            const ruleConflictWarningsByTarget = new Map();
            for (const entry of eligibleTargets) {
                const targetSku = entry.targetSku;
                const siteRule = siteRuleBySku.get(targetSku);
                const explicitGrowths = new Set();
                const leadCandidates = [];
                const safetyCandidates = [];
                const sourceShopIds = Array.from(new Set(entry.sources.map(source => source.shopId))).sort();
                let baseDaily = 0;
                let adjustedDaily = 0;
                let shopLeadSeen = false;
                let shopSafetySeen = false;
                for (const shopId of sourceShopIds) {
                    const rule = shopRuleByShopSku.get(`${shopId}\0${targetSku}`);
                    if (rule?.growthPercent !== null && rule?.growthPercent !== undefined)
                        explicitGrowths.add(rule.growthPercent);
                    if (rule?.leadTimeDays !== null && rule?.leadTimeDays !== undefined) {
                        leadCandidates.push(rule.leadTimeDays);
                        shopLeadSeen = true;
                    }
                    if (rule?.safetyDays !== null && rule?.safetyDays !== undefined) {
                        safetyCandidates.push(rule.safetyDays);
                        shopSafetySeen = true;
                    }
                }
                if (siteRule?.growthPercent !== null && siteRule?.growthPercent !== undefined)
                    explicitGrowths.add(siteRule.growthPercent);
                // 店铺规则更具体、优先于站点规则；仅当无任何店铺规则覆盖该字段时回退站点规则。
                // 多店铺店铺规则互相冲突 → 取最大（保守），warning 列明（与选择顺序无关）。
                if (!shopLeadSeen && siteRule?.leadTimeDays !== null && siteRule?.leadTimeDays !== undefined)
                    leadCandidates.push(siteRule.leadTimeDays);
                if (!shopSafetySeen && siteRule?.safetyDays !== null && siteRule?.safetyDays !== undefined)
                    safetyCandidates.push(siteRule.safetyDays);
                for (const source of entry.sources) {
                    const denominator = denominatorByShop.get(source.shopId) ?? 1;
                    const rule = shopRuleByShopSku.get(`${source.shopId}\0${targetSku}`);
                    const sourceGrowth = rule?.growthPercent ?? siteRule?.growthPercent ?? growthPercent;
                    baseDaily += source.row.units / denominator;
                    adjustedDaily += (source.row.units * (1 + sourceGrowth / 100)) / denominator;
                }
                const blendedGrowth = baseDaily > 0 ? ((adjustedDaily / baseDaily) - 1) * 100 : growthPercent;
                baseDailyByTarget.set(targetSku, baseDaily);
                blendedGrowthByTarget.set(targetSku, blendedGrowth);
                hasExplicitGrowthByTarget.set(targetSku, explicitGrowths.size > 0);
                const leadTime = leadCandidates.length > 0 ? Math.max(...leadCandidates) : undefined;
                const safetyDaysValue = safetyCandidates.length > 0 ? Math.max(...safetyCandidates) : undefined;
                mergedLeadByTarget.set(targetSku, leadTime);
                mergedSafetyByTarget.set(targetSku, safetyDaysValue);
                hasRuleByTarget.set(targetSku, leadCandidates.length > 0 || safetyCandidates.length > 0 || explicitGrowths.size > 0);
                const conflictWarnings = [];
                const distinctLeads = Array.from(new Set(leadCandidates));
                const distinctSafeties = Array.from(new Set(safetyCandidates));
                if (distinctLeads.length > 1) {
                    conflictWarnings.push(`多店铺补货时效规则不一致（${distinctLeads.join('/')} 天），已按最大值计算`);
                }
                if (distinctSafeties.length > 1) {
                    conflictWarnings.push(`多店铺安全库存规则不一致（${distinctSafeties.join('/')} 天），已按最大值计算`);
                }
                if (conflictWarnings.length > 0)
                    ruleConflictWarningsByTarget.set(targetSku, conflictWarnings);
            }
            const importedInventoryItems = [];
            const importedProducts = [];
            const sourceIndexByTarget = new Map();
            const qualityIndexByTarget = new Map();
            for (const entry of eligibleTargets) {
                const dailySales = baseDailyByTarget.get(entry.targetSku) ?? 0;
                const archiveInventory = inventoryBySku.get(entry.targetSku);
                const archiveProduct = productBySku.get(entry.targetSku);
                if (archiveInventory) {
                    importedInventoryItems.push({ ...archiveInventory, dailySales });
                }
                else {
                    // 元仓同码直连（无本地档案）：合成库存输入参与计算；成本未知
                    importedInventoryItems.push({
                        id: `yc:${entry.targetSku}`,
                        name: archiveProduct?.name ?? entry.targetSku,
                        sku: entry.targetSku,
                        currentStock: 0,
                        stockOfficial: 0,
                        stockThirdParty: 0,
                        inTransit: 0,
                        dailySales,
                        leadTime: 25,
                        replenishCycle: 30,
                        costPerUnit: Number.NaN,
                    });
                }
                importedProducts.push({
                    id: archiveProduct?.id || archiveInventory?.id || `yc:${entry.targetSku}`,
                    name: archiveProduct?.name || archiveInventory?.name || entry.targetSku,
                    sku: entry.targetSku,
                    country: site,
                    sites: Array.from(new Set([...(archiveProduct?.sites || []), site])),
                    cost: archiveProduct ? archiveProduct.cost : null,
                    siteData: archiveProduct?.siteData,
                });
                sourceIndexByTarget.set(entry.targetSku, entry.sources);
                qualityIndexByTarget.set(entry.targetSku, entry.sources.map(source => ({
                    shopId: source.shopId,
                    units: source.row.units,
                    observedDays: source.row.observedDays,
                    shopObservedDays: shopObservedDaysByShop.get(source.shopId) ?? 0,
                    latestObservedDate: source.row.latestObservedDate,
                })));
            }
            // ---- 仓库范围：库存池 > 显式仓库 > 站点默认（提示） ----
            const integrationWarnings = [...(ycProductsResult.warning ? [ycProductsResult.warning] : [])];
            let poolName = null;
            let warehouseCodes;
            let warehouseScopeSource;
            if (poolId) {
                const pool = await index_1.prisma.restockStockPool.findFirst({ where: { id: poolId, userId } });
                if (!pool)
                    return res.status(404).json({ error: 'Stock pool not found' });
                if ((0, restockYcShared_1.normalizeSite)(pool.site) !== site) {
                    return res.status(400).json({ error: 'Stock pool site does not match the shops' });
                }
                poolName = pool.name;
                warehouseCodes = pool.warehouseCodes.filter(Boolean);
                warehouseScopeSource = 'pool';
                if (warehouseCodes.length === 0) {
                    return res.status(400).json({ error: 'Stock pool has no warehouse codes' });
                }
            }
            else if (explicitWarehouseCodes && explicitWarehouseCodes.length > 0) {
                warehouseCodes = explicitWarehouseCodes;
                warehouseScopeSource = 'explicit';
            }
            else {
                const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
                warehouseCodes = warehouseResolution.warehouseCodes;
                warehouseScopeSource = 'site-default';
                integrationWarnings.push('未指定库存池：本次扣减的是站点全部仓库的库存与在途，请确认范围后使用');
                integrationWarnings.push(...warehouseResolution.warnings);
            }
            if (warehouseCodes.length === 0) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            // ---- 源条件版本（凭据范围/仓库范围/全量目标 SKU/映射与规则内容；不含计算参数） ----
            const forceRefresh = req.body?.forceRefresh === true;
            const mappingRevision = `${shopMappings.length}:${siteMappings.length}:${Math.max(0, ...shopMappings.map(m => m.updatedAt?.getTime?.() ?? 0), ...siteMappings.map(m => m.updatedAt?.getTime?.() ?? 0))}`;
            const ruleRevision = `${savedShopRules.length}:${savedSiteRules.length}:${Math.max(0, ...savedShopRules.map(r => r.updatedAt?.getTime?.() ?? 0), ...savedSiteRules.map(r => r.updatedAt?.getTime?.() ?? 0))}`;
            // WarehouseMapping 内容哈希：同数量但别名内容变化时也必须使缓存失效
            const warehouseMappingContent = warehouseMappings
                .map(mapping => `${(0, restockSalesImport_1.normalizeRestockSku)(mapping.sku)}>${(0, restockSalesImport_1.normalizeRestockSku)(mapping.thirdPartyWarehouseId)}:${mapping.type ?? ''}`)
                .sort()
                .join('|');
            // ---- 元仓库存与在途（每个目标只扣一次；同源条件短缓存复用） ----
            const skus = importedInventoryItems.map((item) => item.sku);
            const ycSkuAliases = (0, restockYcShared_1.buildYcSkuAliasMap)(warehouseMappings, skus);
            const querySkus = Array.from(new Set([...skus, ...Array.from(ycSkuAliases.keys())])).filter((sku) => sku.length <= restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH).sort();
            const sourceFingerprint = (0, crypto_1.createHash)('sha256').update(JSON.stringify({
                cacheScope: activeYcClient.cacheScope ?? 'default',
                shopIds: [...shopIds].sort(),
                from: range.from,
                to: range.to,
                poolId,
                warehouseCodes: [...warehouseCodes].sort(),
                warehouseMappingContent,
                mappingRevision,
                ruleRevision,
                querySkus,
            })).digest('hex').slice(0, 32);
            let stockRows;
            let inboundOrders;
            let stockFetchedAt;
            let sourceSnapshotId;
            let reusedSourceData;
            const cachedSource = forceRefresh ? undefined : restockSourceCache.get(userId);
            if (cachedSource
                && cachedSource.sourceFingerprint === sourceFingerprint
                && Date.now() - cachedSource.at < RESTOCK_SOURCE_CACHE_TTL_MS) {
                stockRows = cachedSource.stockRows;
                inboundOrders = cachedSource.inboundOrders;
                stockFetchedAt = cachedSource.fetchedAt;
                sourceSnapshotId = cachedSource.sourceSnapshotId;
                reusedSourceData = true;
            }
            else {
                const fetchStartedAt = new Date();
                const remoteRows = querySkus.length > 0
                    ? await (0, restockYcShared_1.fetchRemoteRows)(activeYcClient, warehouseCodes, querySkus)
                    : { stockRows: [], inboundOrders: [], failures: [] };
                if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
                    for (const failure of remoteRows.failures) {
                        (0, restockYcShared_1.logSafeFailure)(`YC ${failure.source} lookup failed`, failure.error);
                    }
                    return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
                }
                stockRows = (0, restockYcShared_1.withMappedCustomerSku)(remoteRows.stockRows, ycSkuAliases);
                inboundOrders = (0, restockYcShared_1.withMappedInboundCustomerSku)(remoteRows.inboundOrders, ycSkuAliases);
                // 真实来源时间 = 拉取开始时刻（不是响应组装时间）
                stockFetchedAt = fetchStartedAt.toISOString();
                reusedSourceData = false;
                // 数据版本：同条件重新拉到不同数据（行集变化）→ 不同快照 ID
                sourceSnapshotId = (0, crypto_1.createHash)('sha256').update(JSON.stringify({
                    sourceFingerprint,
                    fetchedAt: stockFetchedAt,
                    stockRows: stockRows.length,
                    inboundOrders: inboundOrders.length,
                    availableSum: stockRows.reduce((sum, row) => sum + (Number(row.available) || 0), 0),
                })).digest('hex').slice(0, 32);
                restockSourceCache.set(userId, {
                    sourceFingerprint,
                    at: Date.now(),
                    fetchedAt: stockFetchedAt,
                    sourceSnapshotId,
                    stockRows,
                    inboundOrders,
                });
                // 容量上限：淘汰最旧条目，避免进程内无限积累
                while (restockSourceCache.size > RESTOCK_SOURCE_CACHE_MAX_ENTRIES) {
                    const oldestKey = restockSourceCache.keys().next().value;
                    if (oldestKey === undefined)
                        break;
                    restockSourceCache.delete(oldestKey);
                }
            }
            if (forceRefresh) {
                // 刷新源数据：货品身份（元仓清单）缓存一并失效
                ycProductsCache.delete(userId);
            }
            // ---- 规则合并（per-target：店铺规则按来源混合 growth；lead/safety 冲突取最大） ----
            const skuRules = [];
            for (const entry of eligibleTargets) {
                const targetSku = entry.targetSku;
                const hasRule = hasRuleByTarget.get(targetSku) ?? false;
                const hasExplicitGrowth = hasExplicitGrowthByTarget.get(targetSku) ?? false;
                const blended = blendedGrowthByTarget.get(targetSku) ?? growthPercent;
                if (!hasRule)
                    continue;
                skuRules.push({
                    sku: targetSku,
                    leadTimeDays: mergedLeadByTarget.get(targetSku),
                    safetyDays: mergedSafetyByTarget.get(targetSku),
                    growthPercent: hasExplicitGrowth ? blended : undefined,
                });
            }
            // 真实零销量：有观测但区间件数合计为 0（区别于无销量数据）
            const zeroSalesSkus = eligibleTargets
                .filter(entry => {
                const totalUnits = entry.sources.reduce((sum, source) => sum + source.row.units, 0);
                const observedDays = entry.sources.reduce((sum, source) => sum + source.row.observedDays, 0);
                return totalUnits === 0 && observedDays > 0;
            })
                .map(entry => entry.targetSku);
            let plan;
            try {
                plan = (0, restockPlanner_1.buildRestockPlan)({
                    site,
                    products: importedProducts,
                    inventoryItems: importedInventoryItems,
                    remoteStockRows: stockRows,
                    inboundOrders,
                    planningDate,
                    targetDate,
                    leadTimeDays,
                    safetyDays,
                    growthPercent,
                    skuRules,
                    zeroSalesSkus,
                    policies: RESTOCK_V3_POLICIES,
                });
            }
            catch (error) {
                (0, restockYcShared_1.logSafeFailure)('Restock V3 plan rejected', error);
                if (error instanceof restockPlanner_1.RestockPlanValidationError) {
                    // 逐项参数错误：消息含字段名、SKU 与允许边界
                    return res.status(400).json({ error: error.message });
                }
                if (error instanceof restockPlanner_1.RestockSourceDataError) {
                    return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
                }
                return res.status(500).json({ error: 'Failed to build restock recommendations' });
            }
            // ---- 附加来源、质量与可执行状态 ----
            const items = plan.items.map((item) => {
                const targetSku = (0, restockSalesImport_1.normalizeRestockSku)(item.sku);
                const sources = sourceIndexByTarget.get(targetSku) ?? [];
                const targetEntry = eligibleTargets.find(entry => entry.targetSku === targetSku);
                const quality = computeSalesQuality(qualityIndexByTarget.get(targetSku) ?? [], planningDate);
                const warnings = [...item.warnings];
                if (targetEntry?.normalizedCollision) {
                    warnings.push('该货号存在归一化碰撞（大小写/空格变体合并），请核对编码是否确属同一货品');
                }
                for (const warning of ruleConflictWarningsByTarget.get(targetSku) ?? []) {
                    warnings.push(warning);
                }
                // 最终可执行 = 库存/销量维度（planner）∧ 数据质量维度（最差来源）
                const executable = item.executable && quality.executable;
                return {
                    ...item,
                    warnings,
                    executable,
                    matchType: targetEntry?.matchType ?? 'exact-yc',
                    salesSources: sources.map(source => {
                        const rule = shopRuleByShopSku.get(`${source.shopId}\0${targetSku}`);
                        return {
                            shopId: source.shopId,
                            shopName: source.shopName,
                            externalSku: source.row.externalSku,
                            identityKey: source.row.identityKey,
                            displaySku: source.row.displaySku,
                            skuSource: source.row.skuSource,
                            level: source.row.level,
                            itemId: source.row.itemId,
                            itemName: source.row.itemName,
                            variationName: source.row.variationName,
                            units: source.row.units,
                            observedDays: source.row.observedDays,
                            latestObservedDate: source.row.latestObservedDate,
                            salesStatus: source.row.salesStatus,
                            denominator: denominatorByShop.get(source.shopId) ?? null,
                            growthPercent: rule?.growthPercent ?? siteRuleBySku.get(targetSku)?.growthPercent ?? growthPercent,
                        };
                    }),
                    salesQuality: quality,
                };
            });
            const singleShop = shopIds.length === 1 ? shops[0] : null;
            const calendarDays = Math.round((parseDateUtc(range.to).getTime() - parseDateUtc(range.from).getTime()) / 86_400_000) + 1;
            const nowIso = new Date().toISOString();
            // 完整条件指纹 = 源条件指纹 + 计算参数（参数变化 → 指纹变化 → 旧结果过期）
            const fingerprint = (0, crypto_1.createHash)('sha256').update(JSON.stringify({
                v: ALGORITHM_VERSION,
                sourceFingerprint,
                planningDate,
                targetDate,
                leadTimeDays,
                safetyDays,
                growthPercent,
                statisticsDays: statisticsDaysOverride,
            })).digest('hex').slice(0, 32);
            const zeroSalesCount = items.filter(item => item.salesQuality.status === 'zero').length;
            const nonExecutableCount = items.filter(item => !item.executable).length;
            const response = {
                ...plan,
                summary: {
                    ...plan.summary,
                    zeroSalesCount,
                    reviewCount: review.length,
                    nonExecutableCount,
                },
                items,
                metadata: {
                    shopIds: shops.map(shop => ({ id: shop.id, name: shop.name, site: shop.site })),
                    from: range.from,
                    to: range.to,
                    calendarDays,
                    shopObservedDays: singleShop ? (shopObservedDaysByShop.get(singleShop.id) ?? 0) : null,
                    observedDaysByShop: Array.from(perShop.map(entry => ({ shopId: entry.shopId, observedDays: entry.aggregate.shopObservedDays }))),
                    statisticsDays: singleShop ? (statisticsDaysOverride ?? denominatorByShop.get(singleShop.id) ?? null) : null,
                    statisticsDaysOverridden: statisticsDaysOverride !== null,
                    denominator: singleShop ? (denominatorByShop.get(singleShop.id) ?? null) : null,
                    denominatorByShop: Array.from(denominatorByShop.entries()).map(([shopId, days]) => ({ shopId, days })),
                    salesMetric: 'unitsOrdered',
                    salesMetricLabel: '已下订单件数',
                    noSkuVariationCount: perShop.reduce((sum, entry) => sum + entry.aggregate.noSkuVariationCount, 0),
                    noSkuVariationUnits: perShop.reduce((sum, entry) => sum + entry.aggregate.noSkuVariationUnits, 0),
                    collisionKeys: Array.from(new Set(perShop.flatMap(entry => entry.aggregate.collisionKeys))),
                    excludedOversizedSkus,
                    poolId,
                    poolName,
                    warehouseCodes,
                    warehouseScopeSource,
                },
                review: review
                    .sort((left, right) => right.units - left.units)
                    .slice(0, 500),
                snapshot: {
                    fingerprint,
                    sourceFingerprint,
                    sourceSnapshotId,
                    salesFetchedAt: nowIso,
                    stockFetchedAt,
                    ycProductFetchedAt: ycProductsResult.entry?.fetchedAt ?? null,
                    mappingRevision,
                    ruleRevision,
                    algorithmVersion: ALGORITHM_VERSION,
                },
                integration: {
                    ycConfigured: true,
                    remoteFetched: true,
                    reusedSourceData,
                    stockSource: stockRows.length > 0 ? 'yc' : 'missing',
                    warehouseCodes,
                    warnings: integrationWarnings,
                },
            };
            // ---- 服务端结果暂存：resultId 与用户/条件/源数据绑定（保存计划时据此重建不可变快照） ----
            const RESULT_TTL_MS = 2 * 60 * 60_000;
            let resultId = null;
            try {
                const stored = await index_1.prisma.restockComputeResult.create({
                    data: {
                        userId,
                        fingerprint,
                        sourceSnapshotId,
                        payload: response,
                        expiresAt: new Date(Date.now() + RESULT_TTL_MS),
                    },
                    select: { id: true },
                });
                resultId = stored.id;
                // 概率性清理过期结果（避免专用定时任务）
                if (Math.random() < 0.05) {
                    await index_1.prisma.restockComputeResult.deleteMany({ where: { expiresAt: { lt: new Date() } } });
                }
            }
            catch (storeError) {
                (0, restockYcShared_1.logSafeFailure)('Restock V3 result store failed', storeError);
            }
            return res.json({ ...response, resultId });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 recommendation request failed', error);
            return res.status(500).json({ error: 'Failed to build restock recommendations' });
        }
    });
    /** 严格非负整数（拒绝 1.5、1e3、字符串数字等），上限 10 亿 */
    const parseStrictQuantity = (value) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000_000)
            return null;
        return value;
    };
    const parseAdjustReason = (value) => {
        if (value === undefined || value === null)
            return null;
        if (typeof value !== 'string')
            return undefined;
        return value.trim().slice(0, 500);
    };
    /** 确认量与建议量不一致时必须携带非空调整原因（保存/编辑/确认共用规则） */
    const adjustReasonMissing = (confirmedQty, suggestedQty, adjustReason) => confirmedQty !== suggestedQty && !(typeof adjustReason === 'string' && adjustReason.trim());
    /**
     * 已存储计划条目的可执行校验（确认/编辑共用；保存走 resolveSnapshotItems 的同规则）。
     * 不信任任何客户端提交的 executable / 质量状态——只读服务端快照里的值。
     */
    const validateStoredItemsForExecution = (items) => {
        if (!Array.isArray(items) || items.length === 0) {
            return '计划不包含任何条目，无法确认执行。请重新计算并保存计划。';
        }
        const snapshotItems = items;
        if (!('dailySales' in snapshotItems[0])) {
            return '该计划为历史版本草稿（缺少完整计算依据快照），无法确认执行。请重新计算并保存新计划后再确认。';
        }
        for (const item of snapshotItems) {
            const sku = String(item.sku ?? '');
            if (item.executable !== true) {
                return `以下商品不可执行（库存未知/无有效销量/数据质量不足），不能确认为可执行计划：${sku}。请重新计算，或另存不含该商品的计划。`;
            }
            const confirmedQty = item.confirmedQty;
            if (typeof confirmedQty !== 'number' || !Number.isInteger(confirmedQty) || confirmedQty < 0 || confirmedQty > 1_000_000_000) {
                return `确认补货量必须是非负整数：${sku}`;
            }
            const suggestedQty = item.suggestedQty;
            if (typeof suggestedQty !== 'number' || !Number.isInteger(suggestedQty) || suggestedQty < 0 || suggestedQty > 1_000_000_000) {
                return `计划数据异常（建议补货量非法）：${sku}。请重新计算并保存计划。`;
            }
            if (adjustReasonMissing(confirmedQty, suggestedQty, item.adjustReason)) {
                return `确认补货量与系统建议量不一致时必须填写调整原因：${sku}`;
            }
        }
        return null;
    };
    /** 从结果项构建快照项（数量/原因来自人工，其余全部服务端权威） */
    const buildSnapshotItem = (resultItem, confirmedQty, adjustReason) => ({
        sku: String(resultItem.sku ?? ''),
        name: String(resultItem.name ?? resultItem.sku ?? ''),
        suggestedQty: Number(resultItem.suggestedQty ?? 0),
        confirmedQty,
        adjustReason,
        dailySales: Number(resultItem.dailySales ?? 0),
        adjustedDailySales: Number(resultItem.adjustedDailySales ?? 0),
        availableStock: Number(resultItem.availableStock ?? 0),
        inTransit: Number(resultItem.inTransit ?? 0),
        stockByWarehouse: Array.isArray(resultItem.stockByWarehouse) ? resultItem.stockByWarehouse : [],
        inboundBreakdown: Array.isArray(resultItem.inboundBreakdown) ? resultItem.inboundBreakdown : [],
        stockoutDate: (resultItem.stockoutDate ?? null),
        baselineStockoutDate: (resultItem.baselineStockoutDate ?? null),
        gapBeforeArrival: Number(resultItem.gapBeforeArrival ?? 0),
        gapAfterArrival: Number(resultItem.gapAfterArrival ?? 0),
        baselineEndSafetyGap: Number(resultItem.baselineEndSafetyGap ?? 0),
        endSafetyGap: Number(resultItem.endSafetyGap ?? 0),
        suggestedQtyRaw: typeof resultItem.suggestedQtyRaw === 'number' && Number.isFinite(resultItem.suggestedQtyRaw)
            ? resultItem.suggestedQtyRaw
            : null,
        arrivalDate: String(resultItem.arrivalDate ?? ''),
        targetDate: String(resultItem.targetDate ?? ''),
        leadTimeDays: Number(resultItem.leadTimeDays ?? 0),
        safetyDays: Number(resultItem.safetyDays ?? 0),
        growthPercent: Number(resultItem.growthPercent ?? 0),
        coverageDays: Number(resultItem.coverageDays ?? 0),
        transportDemand: Number(resultItem.transportDemand ?? 0),
        arrivalStock: Number(resultItem.arrivalStock ?? 0),
        coverageDemand: Number(resultItem.coverageDemand ?? 0),
        safetyStockDemand: Number(resultItem.safetyStockDemand ?? 0),
        matchType: String(resultItem.matchType ?? ''),
        executable: resultItem.executable === true,
        status: String(resultItem.status ?? ''),
        costUnknown: resultItem.costUnknown === true,
        estimatedCost: (resultItem.estimatedCost ?? null),
        warnings: Array.isArray(resultItem.warnings) ? resultItem.warnings.map(String) : [],
        salesSources: Array.isArray(resultItem.salesSources) ? resultItem.salesSources : [],
        salesQuality: (resultItem.salesQuality ?? {}),
        ruleSources: (resultItem.ruleSources ?? {}),
    });
    /** 摘要只针对实际保存的项目重算；建议金额与确认金额分列（成本未知计入 unknownCostSkus） */
    const buildPlanSummary = (items) => {
        let totalSuggestedQty = 0;
        let totalConfirmedQty = 0;
        let suggestedAmount = 0;
        let confirmedAmount = 0;
        let unknownCostSkus = 0;
        for (const item of items) {
            totalSuggestedQty += item.suggestedQty;
            totalConfirmedQty += item.confirmedQty;
            if (item.costUnknown || item.estimatedCost === null) {
                unknownCostSkus += 1;
            }
            else {
                const unitCost = item.suggestedQty > 0 ? item.estimatedCost / item.suggestedQty : 0;
                suggestedAmount += item.estimatedCost ?? 0;
                confirmedAmount += item.confirmedQty * unitCost;
            }
        }
        return {
            savedItemCount: items.length,
            totalSuggestedQty,
            totalConfirmedQty,
            suggestedAmount,
            confirmedAmount,
            unknownCostSkus,
            executableCount: items.filter(item => item.executable).length,
        };
    };
    const RESULT_SELECT = {
        id: true, userId: true, fingerprint: true, sourceSnapshotId: true, payload: true, createdAt: true, expiresAt: true,
    };
    const loadActiveResult = async (userId, resultId) => {
        if (typeof resultId !== 'string' || !resultId.trim() || resultId.length > 100)
            return null;
        const stored = await index_1.prisma.restockComputeResult.findFirst({
            where: { id: resultId.trim(), userId, expiresAt: { gt: new Date() } },
            select: RESULT_SELECT,
        });
        return stored;
    };
    /** 校验并规范化保存请求的项目列表（相对结果快照） */
    const resolveSnapshotItems = (resultItems, rawRequested) => {
        if (!Array.isArray(rawRequested) || rawRequested.length === 0 || rawRequested.length > MAX_PLAN_ITEMS) {
            return { error: 'items 必须是非空数组' };
        }
        const bySku = new Map();
        for (const item of resultItems) {
            const sku = (0, restockSalesImport_1.normalizeRestockSku)(typeof item.sku === 'string' ? item.sku : '');
            if (sku)
                bySku.set(sku, item);
        }
        const seen = new Set();
        const resolved = [];
        for (const entry of rawRequested) {
            if (!entry || typeof entry !== 'object')
                return { error: 'items 含非法条目' };
            const record = entry;
            const sku = (0, restockSalesImport_1.normalizeRestockSku)(typeof record.sku === 'string' ? record.sku : '');
            if (!sku || sku.length > 200)
                return { error: 'items 含非法 SKU' };
            if (seen.has(sku))
                return { error: `SKU 重复：${sku}` };
            seen.add(sku);
            const resultItem = bySku.get(sku);
            if (!resultItem)
                return { error: `SKU 不在本次计算结果中：${sku}` };
            const suggestedQty = parseStrictQuantity(resultItem.suggestedQty);
            if (suggestedQty === null)
                return { error: `结果数据异常：${sku}` };
            let confirmedQty = suggestedQty;
            if (record.confirmedQty !== undefined && record.confirmedQty !== null) {
                const parsed = parseStrictQuantity(record.confirmedQty);
                if (parsed === null) {
                    return { error: `确认补货量必须是非负整数：${sku}` };
                }
                confirmedQty = parsed;
            }
            const adjustReason = parseAdjustReason(record.adjustReason);
            if (adjustReason === undefined) {
                return { error: `调整原因必须是字符串：${sku}` };
            }
            if (resultItem.executable !== true) {
                return { error: `以下商品当前不可执行（库存未知/无有效销量/数据质量不足），不能保存为可执行计划：${sku}` };
            }
            if (adjustReasonMissing(confirmedQty, suggestedQty, adjustReason)) {
                return { error: `确认补货量与系统建议量不一致时必须填写调整原因：${sku}` };
            }
            resolved.push(buildSnapshotItem(resultItem, confirmedQty, adjustReason && adjustReason.trim() ? adjustReason.trim() : null));
        }
        return { items: resolved };
    };
    const isLegacySnapshot = (items) => items.length > 0 && !('dailySales' in items[0]);
    router.get('/plans', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const status = typeof req.query.status === 'string' && ['draft', 'confirmed', 'void'].includes(req.query.status)
                ? req.query.status
                : undefined;
            const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
            const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
            const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
            const where = {
                userId: req.user.id,
                ...(status ? { status } : {}),
                ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
            };
            const [total, plans] = await Promise.all([
                index_1.prisma.restockPlanSnapshot.count({ where }),
                index_1.prisma.restockPlanSnapshot.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    select: {
                        id: true, name: true, status: true, site: true, shopIds: true, poolId: true,
                        warehouseCodes: true, rangeFrom: true, rangeTo: true, summary: true, supersedesId: true,
                        version: true, revision: true, resultId: true,
                        createdAt: true, confirmedAt: true, voidedAt: true, voidReason: true,
                    },
                }),
            ]);
            return res.json({ plans, total, page, pageSize });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan list failed', error);
            return res.status(500).json({ error: 'Failed to fetch plans' });
        }
    });
    router.get('/plans/:id', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const plan = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId: req.user.id },
            });
            if (!plan)
                return res.status(404).json({ error: 'Plan not found' });
            const legacy = isLegacySnapshot((plan.items ?? []));
            return res.json({ plan, legacy });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch plan' });
        }
    });
    router.post('/plans', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const idempotencyKey = typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
                ? req.body.idempotencyKey.trim().slice(0, 100)
                : null;
            // 幂等：同 key 重复提交（双击/重试）返回首次结果
            if (idempotencyKey) {
                const existing = await index_1.prisma.restockPlanSnapshot.findUnique({
                    where: { userId_idempotencyKey: { userId, idempotencyKey } },
                });
                if (existing) {
                    return res.json({ plan: existing, duplicate: true });
                }
            }
            const stored = await loadActiveResult(userId, req.body?.resultId);
            if (!stored) {
                return res.status(410).json({ error: '计算结果已过期或不存在，请重新计算后再保存计划' });
            }
            const payload = (stored.payload ?? {});
            const metadata = (payload.metadata ?? {});
            const snapshot = (payload.snapshot ?? {});
            const resultItems = Array.isArray(payload.items) ? payload.items : [];
            const name = typeof req.body?.name === 'string' && req.body.name.trim()
                ? req.body.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
                : `补货计划 ${metadata.from ?? ''}~${metadata.to ?? ''}`;
            const resolvedItems = resolveSnapshotItems(resultItems, req.body?.items);
            if (resolvedItems.error || !resolvedItems.items) {
                return res.status(400).json({ error: resolvedItems.error ?? 'Invalid plan items' });
            }
            const items = resolvedItems.items;
            // 仓库范围确认：整站默认只能作为预览保存草稿，摘要中标注未确认
            const warehouseScopeSource = String(metadata.warehouseScopeSource ?? 'site-default');
            const scopeConfirmed = warehouseScopeSource === 'pool' || warehouseScopeSource === 'explicit';
            // 版本链：body.sourcePlanId 指向被复制的旧计划（必须属于当前用户）
            let supersedesId = null;
            let version = 1;
            if (typeof req.body?.sourcePlanId === 'string' && req.body.sourcePlanId.trim()) {
                const sourcePlan = await index_1.prisma.restockPlanSnapshot.findFirst({
                    where: { id: req.body.sourcePlanId.trim(), userId },
                    select: { id: true, version: true },
                });
                if (!sourcePlan)
                    return res.status(404).json({ error: 'Source plan not found' });
                supersedesId = sourcePlan.id;
                version = sourcePlan.version + 1;
            }
            const plan = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_plan_save', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.create({
                data: {
                    userId,
                    name,
                    status: 'draft',
                    site: String(metadata.shopIds && Array.isArray(metadata.shopIds) && metadata.shopIds[0]?.site
                        ? metadata.shopIds[0].site
                        : payload.site ?? ''),
                    shopIds: Array.isArray(metadata.shopIds)
                        ? metadata.shopIds.map(shop => String(shop.id ?? '')).filter(Boolean).slice(0, MAX_SHOPS_PER_PLAN)
                        : [],
                    poolId: (metadata.poolId ?? null),
                    warehouseCodes: Array.isArray(metadata.warehouseCodes)
                        ? metadata.warehouseCodes.map(String).slice(0, MAX_WAREHOUSE_CODES_PER_POOL)
                        : [],
                    rangeFrom: String(metadata.from ?? ''),
                    rangeTo: String(metadata.to ?? ''),
                    salesMetric: String(metadata.salesMetric ?? 'unitsOrdered'),
                    parameters: {
                        planningDate: metadata.planningDate ?? null,
                        targetDate: metadata.targetDate ?? null,
                        statisticsDays: metadata.statisticsDays ?? null,
                        statisticsDaysOverridden: metadata.statisticsDaysOverridden ?? false,
                        salesMetricLabel: metadata.salesMetricLabel ?? null,
                        warehouseScopeSource,
                        scopeConfirmed,
                    },
                    items: items,
                    summary: { ...buildPlanSummary(items), scopeConfirmed },
                    snapshotMeta: {
                        ...snapshot,
                        resultId: stored.id,
                        savedAt: new Date().toISOString(),
                    },
                    supersedesId,
                    version,
                    resultId: stored.id,
                    idempotencyKey,
                },
            }));
            return res.status(201).json({ plan });
        }
        catch (error) {
            if (error.code === 'P2002') {
                // 并发下幂等键冲突：返回已存在记录
                const existing = await index_1.prisma.restockPlanSnapshot.findUnique({
                    where: { userId_idempotencyKey: { userId: req.user.id, idempotencyKey: String(req.body?.idempotencyKey).trim().slice(0, 100) } },
                });
                if (existing)
                    return res.json({ plan: existing, duplicate: true });
            }
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan save failed', error);
            return res.status(500).json({ error: 'Failed to save plan' });
        }
    });
    router.put('/plans/:id', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const existing = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId },
            });
            if (!existing)
                return res.status(404).json({ error: 'Plan not found' });
            if (existing.status !== 'draft') {
                return res.status(409).json({ error: 'Only draft plans can be edited; confirmed plans must be copied to a new version' });
            }
            // 乐观并发：revision 不匹配说明草稿已被并发确认/修改
            const revision = parseStrictQuantity(req.body?.revision);
            if (revision === null || revision !== existing.revision) {
                return res.status(409).json({ error: `计划已被其他操作更新（当前版本 ${existing.revision}），请刷新后重试` });
            }
            const currentItems = (existing.items ?? []);
            if (currentItems.length === 0 || !('dailySales' in currentItems[0])) {
                return res.status(409).json({ error: '历史版本草稿不支持编辑（缺少完整快照），请重新计算并保存新计划' });
            }
            const bySku = new Map(currentItems.map(item => [item.sku, item]));
            const rawEdits = req.body?.edits;
            if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
                return res.status(400).json({ error: 'edits 必须是非空数组' });
            }
            const nextItems = currentItems.map(item => ({ ...item }));
            const nextBySku = new Map(nextItems.map(item => [item.sku, item]));
            for (const entry of rawEdits) {
                if (!entry || typeof entry !== 'object')
                    return res.status(400).json({ error: 'edits 含非法条目' });
                const record = entry;
                const sku = (0, restockSalesImport_1.normalizeRestockSku)(typeof record.sku === 'string' ? record.sku : '');
                const target = nextBySku.get(sku);
                if (!target)
                    return res.status(400).json({ error: `SKU 不在该计划中：${sku}` });
                if (record.confirmedQty !== undefined) {
                    const parsed = parseStrictQuantity(record.confirmedQty);
                    if (parsed === null)
                        return res.status(400).json({ error: `确认补货量必须是非负整数：${sku}` });
                    target.confirmedQty = parsed;
                }
                if (record.adjustReason !== undefined) {
                    const reason = parseAdjustReason(record.adjustReason);
                    if (reason === undefined)
                        return res.status(400).json({ error: `调整原因必须是字符串：${sku}` });
                    target.adjustReason = reason && reason.trim() ? reason.trim() : null;
                }
            }
            // 编辑后的完整条目走与保存/确认同一套可执行校验（数量/原因/可执行/快照完整性）
            const validationError = validateStoredItemsForExecution(nextItems);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }
            const name = typeof req.body?.name === 'string' && req.body.name.trim()
                ? req.body.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
                : existing.name;
            const plan = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_plan_update', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.updateMany({
                where: { id: existing.id, userId, status: 'draft', revision: existing.revision },
                data: {
                    name,
                    items: nextItems,
                    summary: { ...buildPlanSummary(nextItems), scopeConfirmed: (existing.summary ?? {}).scopeConfirmed ?? false },
                    revision: existing.revision + 1,
                },
            }));
            if (plan.count === 0) {
                return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重试' });
            }
            const updated = await index_1.prisma.restockPlanSnapshot.findFirst({ where: { id: existing.id, userId } });
            return res.json({ plan: updated });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan update failed', error);
            return res.status(500).json({ error: 'Failed to update plan' });
        }
    });
    /**
     * 重复安排候选：在归属权限（userId）内按 仓库范围重叠 / 同库存池 预筛，
     * 游标分页遍历**全部**候选计划——不以任何数量截断（第 N 条相关计划不得静默漏报）。
     * SKU 交集与提醒组装留在内存；提醒不阻断确认（现有产品规则）。
     */
    const DUPLICATE_SCAN_BATCH_SIZE = 200;
    const collectDuplicateCandidates = async (userId, currentWarehouseCodes, currentPoolId) => {
        const orClauses = [];
        if (currentWarehouseCodes.length > 0) {
            orClauses.push({ warehouseCodes: { hasSome: [...currentWarehouseCodes] } });
        }
        if (currentPoolId) {
            orClauses.push({ poolId: currentPoolId });
        }
        if (orClauses.length === 0)
            return [];
        const where = { userId, status: 'confirmed', OR: orClauses };
        const candidates = [];
        let cursorId;
        // 游标分页（排序键含唯一 id，稳定不重不漏）；批次为扫描单位而非截断上限
        for (;;) {
            const batch = await index_1.prisma.restockPlanSnapshot.findMany({
                where,
                orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
                take: DUPLICATE_SCAN_BATCH_SIZE,
                ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
                select: { id: true, name: true, items: true, poolId: true, warehouseCodes: true, confirmedAt: true, createdAt: true },
            });
            candidates.push(...batch);
            if (batch.length < DUPLICATE_SCAN_BATCH_SIZE)
                break;
            cursorId = batch[batch.length - 1].id;
        }
        return candidates;
    };
    router.post('/plans/:id/confirm', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            // revision 必传（乐观并发）：缺失/非法 = 参数错误；不匹配 = 过期版本
            const revision = parseStrictQuantity(req.body?.revision);
            if (revision === null) {
                return res.status(400).json({ error: 'revision 必填（读取计划时的修订号，非负整数）；请刷新计划列表获取最新版本后重试' });
            }
            const existing = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId },
            });
            if (!existing)
                return res.status(404).json({ error: 'Plan not found' });
            if (existing.status !== 'draft') {
                return res.status(409).json({ error: `Plan is already ${existing.status}` });
            }
            if (revision !== existing.revision) {
                return res.status(409).json({ error: `计划已被其他操作更新（当前修订 ${existing.revision}，提交的是 ${revision}），请刷新后重新核对再确认` });
            }
            // 逐项可执行校验（与保存/编辑同一套规则；只读服务端快照，不信任客户端提交的 executable/质量状态）
            const itemValidationError = validateStoredItemsForExecution(existing.items);
            if (itemValidationError) {
                return res.status(400).json({ error: itemValidationError });
            }
            // 可执行确认约束：整站默认范围未确认归属，不允许确认为可执行计划
            const summary = (existing.summary ?? {});
            if (summary.scopeConfirmed !== true) {
                return res.status(409).json({
                    error: '该计划保存时使用的是整站仓库默认范围（未确认库存归属）。请选择库存池或明确仓库范围后重新计算并保存，再确认计划。',
                });
            }
            // 重复安排提醒：仓库范围重叠 / 同池 + SKU 交集（提醒不阻断；全量分页扫描，不截断）
            const duplicatePlanWarnings = [];
            try {
                const confirmedPlans = await collectDuplicateCandidates(userId, existing.warehouseCodes || [], existing.poolId);
                const currentSkus = new Set((existing.items ?? []).map(item => item.sku));
                const currentWh = new Set(existing.warehouseCodes || []);
                for (const other of confirmedPlans) {
                    if (other.id === existing.id)
                        continue;
                    const otherSkus = (other.items ?? []).map(item => item.sku);
                    const overlap = otherSkus.filter(sku => currentSkus.has(sku));
                    if (overlap.length === 0)
                        continue;
                    const whOverlap = (other.warehouseCodes || []).some(code => currentWh.has(code));
                    const poolOverlap = other.poolId !== null && other.poolId === existing.poolId;
                    if (whOverlap || poolOverlap) {
                        duplicatePlanWarnings.push(`已确认计划「${other.name}」（${dateString(other.confirmedAt ?? other.createdAt)}）在重叠仓库范围内包含 ${overlap.length} 个相同 SKU，请确认没有重复安排`);
                    }
                }
            }
            catch (error) {
                (0, restockYcShared_1.logSafeFailure)('Restock V3 duplicate plan check failed', error);
            }
            const confirmedAt = new Date();
            // 条件更新：status 与 revision 都以读取值为准；成功后原子递增 revision
            const updated = await index_1.prisma.restockPlanSnapshot.updateMany({
                where: { id: existing.id, userId, status: 'draft', revision: existing.revision },
                data: { status: 'confirmed', confirmedAt, revision: existing.revision + 1 },
            });
            if (updated.count === 0) {
                return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重新核对再确认' });
            }
            return res.json({
                plan: {
                    ...existing,
                    status: 'confirmed',
                    confirmedAt,
                    revision: existing.revision + 1,
                },
                duplicatePlanWarnings,
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan confirm failed', error);
            return res.status(500).json({ error: 'Failed to confirm plan' });
        }
    });
    router.post('/plans/:id/void', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            // revision 必传（乐观并发）：缺失/非法 = 参数错误；不匹配 = 过期版本
            const revision = parseStrictQuantity(req.body?.revision);
            if (revision === null) {
                return res.status(400).json({ error: 'revision 必填（读取计划时的修订号，非负整数）；请刷新计划列表获取最新版本后重试' });
            }
            const voidReason = typeof req.body?.voidReason === 'string' && req.body.voidReason.trim()
                ? req.body.voidReason.trim().slice(0, 500)
                : null;
            if (!voidReason)
                return res.status(400).json({ error: 'voidReason is required' });
            const existing = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId },
            });
            if (!existing)
                return res.status(404).json({ error: 'Plan not found' });
            if (existing.status === 'void')
                return res.status(409).json({ error: 'Plan is already void' });
            if (revision !== existing.revision) {
                return res.status(409).json({ error: `计划已被其他操作更新（当前修订 ${existing.revision}，提交的是 ${revision}），请刷新后重新核对再作废` });
            }
            // 条件更新：status 与 revision 都以读取值为准；成功后原子递增 revision
            const updated = await index_1.prisma.restockPlanSnapshot.updateMany({
                where: { id: existing.id, userId, status: { in: ['draft', 'confirmed'] }, revision: existing.revision },
                data: { status: 'void', voidedAt: new Date(), voidReason, revision: existing.revision + 1 },
            });
            if (updated.count === 0)
                return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重试' });
            return res.json({ voided: true });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan void failed', error);
            return res.status(500).json({ error: 'Failed to void plan' });
        }
    });
    router.post('/plans/:id/copy', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const source = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId },
            });
            if (!source)
                return res.status(404).json({ error: 'Plan not found' });
            if (source.status === 'void')
                return res.status(409).json({ error: '作废计划不能复制，请重新计算保存' });
            const copy = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v3', action: 'restock_plan_copy', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.create({
                data: {
                    userId,
                    name: `${source.name}（新版）`.slice(0, MAX_PLAN_NAME_LENGTH),
                    status: 'draft',
                    site: source.site,
                    shopIds: source.shopIds,
                    poolId: source.poolId,
                    warehouseCodes: source.warehouseCodes,
                    rangeFrom: source.rangeFrom,
                    rangeTo: source.rangeTo,
                    salesMetric: source.salesMetric,
                    parameters: source.parameters ?? {},
                    items: source.items ?? {},
                    summary: { ...(source.summary ?? {}), scopeConfirmed: (source.summary ?? {}).scopeConfirmed ?? false },
                    snapshotMeta: source.snapshotMeta ?? {},
                    supersedesId: source.id,
                    version: source.version + 1,
                    resultId: source.resultId,
                },
            }));
            return res.status(201).json({ plan: copy });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan copy failed', error);
            return res.status(500).json({ error: 'Failed to copy plan' });
        }
    });
    router.get('/plans/:id/export', requireRestockPermission('restock-v3.view'), async (req, res) => {
        try {
            const plan = await index_1.prisma.restockPlanSnapshot.findFirst({
                where: { id: String(req.params.id ?? ''), userId: req.user.id },
            });
            if (!plan)
                return res.status(404).json({ error: 'Plan not found' });
            const statusLabels = { draft: '草稿', confirmed: '已确认', void: '已作废' };
            const items = (plan.items ?? []);
            const parameters = (plan.parameters ?? {});
            const meta = (plan.snapshotMeta ?? {});
            const legacy = isLegacySnapshot(items);
            // CSV 公式注入防护：文本字段以 = + - @ 制表/回车开头时前缀单引号，保证表格软件按文本处理
            const csvEscape = (value, isText = false) => {
                let text = value === null || value === undefined ? '' : String(value);
                if (isText && /^[=+\-@\t\r]/.test(text))
                    text = `'${text}`;
                return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
            };
            const lines = [];
            lines.push(`计划号,${csvEscape(plan.id)}`);
            lines.push(`计划名称,${csvEscape(plan.name, true)}`);
            lines.push(`状态,${csvEscape(statusLabels[plan.status] ?? plan.status)},版本,${csvEscape(plan.version)},修订,${csvEscape(plan.revision)}`);
            lines.push(`站点,${csvEscape(plan.site)},店铺,${csvEscape((plan.shopIds || []).join(' | '))}`);
            lines.push(`统计区间,${csvEscape(plan.rangeFrom)} ~ ${csvEscape(plan.rangeTo)},销量口径,${csvEscape(plan.salesMetric === 'unitsOrdered' ? '已下订单件数' : plan.salesMetric)}`);
            lines.push(`计划日,${csvEscape(parameters.planningDate ?? '')},目标覆盖日,${csvEscape(parameters.targetDate ?? '')}`);
            lines.push(`补货时效(天),${csvEscape(parameters.leadTimeDays ?? '')},安全库存(天),${csvEscape(parameters.safetyDays ?? '')},增长率(%),${csvEscape(parameters.growthPercent ?? '')}`);
            lines.push(`数据获取时间,${csvEscape(meta.salesFetchedAt ?? '')},算法版本,${csvEscape(meta.algorithmVersion ?? '')},条件指纹,${csvEscape(meta.fingerprint ?? '')}`);
            lines.push(`确认时间,${csvEscape(plan.confirmedAt ? plan.confirmedAt.toISOString() : '')},创建时间,${csvEscape(plan.createdAt.toISOString())}`);
            if (legacy) {
                lines.push('注意,历史版本（信息不完整，仅含保存时的 SKU 与数量，无计算依据快照）');
            }
            lines.push('');
            if (legacy) {
                lines.push('SKU,建议补货量,确认补货量,调整原因');
                for (const item of items) {
                    lines.push([
                        csvEscape(item.sku),
                        csvEscape(item.suggestedQty),
                        csvEscape(item.confirmedQty ?? ''),
                        csvEscape(item.adjustReason ?? '', true),
                    ].join(','));
                }
            }
            else {
                lines.push('SKU,名称,状态,预测日销,可用库存,确定在途,预计断货日,建议补货量,建议金额,确认补货量,确认金额,调整原因');
                for (const item of items) {
                    const suggestedQty = Number(item.suggestedQty ?? 0);
                    const confirmedQty = Number(item.confirmedQty ?? suggestedQty);
                    const suggestedAmount = typeof item.estimatedCost === 'number' ? item.estimatedCost : null;
                    const unitCost = suggestedQty > 0 && suggestedAmount !== null ? suggestedAmount / suggestedQty : null;
                    lines.push([
                        csvEscape(item.sku),
                        csvEscape(item.name ?? '', true),
                        csvEscape(item.status ?? ''),
                        csvEscape(item.adjustedDailySales ?? ''),
                        csvEscape(item.availableStock ?? ''),
                        csvEscape(item.inTransit ?? ''),
                        csvEscape(item.stockoutDate ?? ''),
                        csvEscape(suggestedQty),
                        csvEscape(item.costUnknown || suggestedAmount === null ? '未知' : suggestedAmount),
                        csvEscape(confirmedQty),
                        csvEscape(item.costUnknown || unitCost === null ? '未知' : confirmedQty * unitCost),
                        csvEscape(item.adjustReason ?? '', true),
                    ].join(','));
                }
            }
            const csv = `\uFEFF${lines.join('\r\n')}`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="restock-plan-${plan.id.slice(0, 8)}.csv"; filename*=UTF-8''${encodeURIComponent(`补货计划_${plan.name}`)}.csv`);
            return res.send(csv);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock V3 plan export failed', error);
            return res.status(500).json({ error: 'Failed to export plan' });
        }
    });
    return router;
};
exports.createRestockV3Router = createRestockV3Router;
exports.default = (0, exports.createRestockV3Router)();
