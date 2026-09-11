"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRestockV2Router = exports.parseYcProductDimensions = void 0;
const usageEvents_1 = require("../services/usageEvents");
const express_1 = require("express");
const index_1 = require("../index");
const productCache_1 = require("../services/productCache");
const restockPlanner_1 = require("../services/restockPlanner");
const ycOpenPlatformClient_1 = require("../services/ycOpenPlatformClient");
const restockSalesImport_1 = require("../services/restockSalesImport");
const restockYcShared_1 = require("../services/restockYcShared");
const parseOptionalYcSkuSelection = (value) => {
    if (value === undefined)
        return null;
    if (!Array.isArray(value) || value.length < 1 || value.length > ycOpenPlatformClient_1.YC_CLIENT_LIMITS.maxListRows) {
        throw new Error('Invalid YC SKU selection');
    }
    const normalized = value.map(item => {
        if (typeof item !== 'string')
            throw new Error('Invalid YC SKU selection');
        const sku = (0, restockYcShared_1.normalizeSku)(item);
        if (!sku || sku.length > ycOpenPlatformClient_1.YC_CLIENT_LIMITS.maxIdentifierLength) {
            throw new Error('Invalid YC SKU selection');
        }
        return sku;
    });
    return Array.from(new Set(normalized));
};
const salesImportResponse = (salesImport) => {
    const items = Array.isArray(salesImport.items) ? salesImport.items : [];
    const activeItems = items.filter((item) => !item.dismissedAt);
    return {
        import: {
            id: salesImport.id,
            site: salesImport.site,
            fileName: salesImport.fileName,
            statisticsDays: salesImport.statisticsDays,
            createdAt: salesImport.createdAt,
            updatedAt: salesImport.updatedAt,
        },
        items: activeItems,
        aggregates: (0, restockSalesImport_1.buildTargetSalesAggregates)(activeItems),
        pending: activeItems.filter((item) => !(0, restockSalesImport_1.normalizeRestockSku)(item.targetSku)),
    };
};
const siteSetForProduct = (product) => {
    const sites = new Set();
    for (const site of product.sites || []) {
        if (site)
            sites.add((0, restockYcShared_1.normalizeSite)(site));
    }
    if (product.country)
        sites.add((0, restockYcShared_1.normalizeSite)(product.country));
    if (product.siteData && typeof product.siteData === 'object') {
        for (const site of Object.keys(product.siteData)) {
            sites.add((0, restockYcShared_1.normalizeSite)(site));
        }
    }
    return sites;
};
const collectLocalSites = (products, remoteWarehouses = []) => {
    const counts = new Map();
    for (const product of products) {
        for (const site of siteSetForProduct(product)) {
            if (!site)
                continue;
            counts.set(site, (counts.get(site) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([site, productCount]) => ({
        code: site,
        label: restockYcShared_1.SITE_LABELS[site] || site,
        productCount,
        warehouseCodes: (0, restockYcShared_1.mergeWarehouseCodes)((0, ycOpenPlatformClient_1.getYcWarehouseCodesForSite)(site), (0, restockYcShared_1.warehouseCodesForSite)(remoteWarehouses, site)),
    }));
};
const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'string' && value.trim() === '')
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toStockInt = (value) => Math.max(0, Math.round(toFiniteNumber(value)));
const parseYcProductDimensions = (specs) => {
    const dimension = (value) => {
        if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const ycLengthCm = dimension(specs?.length);
    const ycWidthCm = dimension(specs?.width);
    const ycHeightCm = dimension(specs?.height);
    const ycVolumeM3 = ycLengthCm !== null && ycWidthCm !== null && ycHeightCm !== null
        ? Math.round(((ycLengthCm * ycWidthCm * ycHeightCm) / 1_000_000) * 1_000_000_000) / 1_000_000_000
        : null;
    return { ycLengthCm, ycWidthCm, ycHeightCm, ycVolumeM3 };
};
exports.parseYcProductDimensions = parseYcProductDimensions;
const toYcStockInt = (value, field, required = false) => {
    if (value === null || value === undefined) {
        if (!required)
            return 0;
        throw new restockPlanner_1.RestockSourceDataError(`${field} is required`);
    }
    if (typeof value === 'string' && value.trim() === '') {
        throw new restockPlanner_1.RestockSourceDataError(`${field} is invalid`);
    }
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        throw new restockPlanner_1.RestockSourceDataError(`${field} is invalid`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
        throw new restockPlanner_1.RestockSourceDataError(`${field} is invalid`);
    }
    const rounded = Math.round(parsed);
    if (!Number.isSafeInteger(rounded))
        throw new restockPlanner_1.RestockSourceDataError(`${field} is unsafe`);
    return rounded;
};
const safeYcStockAdd = (left, right, field) => {
    const total = left + right;
    if (!Number.isSafeInteger(total) || total < 0)
        throw new restockPlanner_1.RestockSourceDataError(`${field} is unsafe`);
    return total;
};
const requireRestockPermission = (0, restockYcShared_1.createRestockPermissionGuard)(() => index_1.prisma, 'restock-v2');
const aggregateYcStockRows = (rows) => {
    const aggregates = new Map();
    for (const row of rows) {
        const rawSku = String(row.customerSku || '').trim();
        if (!rawSku)
            continue;
        const skuKey = (0, restockYcShared_1.normalizeSku)(rawSku);
        const existing = aggregates.get(skuKey);
        const warehouseCode = String(row.warehouseCode || '').trim();
        const next = existing || {
            sku: rawSku,
            name: String(row.customerSkuName || rawSku).trim() || rawSku,
            warehouseCodes: [],
            available: 0,
            inventory: 0,
            occupy: 0,
            unshipped: 0,
        };
        if (warehouseCode && !next.warehouseCodes.includes(warehouseCode)) {
            next.warehouseCodes.push(warehouseCode);
        }
        if (!next.name || next.name === next.sku) {
            next.name = String(row.customerSkuName || rawSku).trim() || rawSku;
        }
        next.available = safeYcStockAdd(next.available, toYcStockInt(row.available, `available for ${skuKey}`, true), `available total for ${skuKey}`);
        next.inventory = safeYcStockAdd(next.inventory, toYcStockInt(row.inventory, `inventory for ${skuKey}`), `inventory total for ${skuKey}`);
        next.occupy = safeYcStockAdd(next.occupy, toYcStockInt(row.occupy, `occupy for ${skuKey}`), `occupy total for ${skuKey}`);
        next.unshipped = safeYcStockAdd(next.unshipped, toYcStockInt(row.unshipped, `unshipped for ${skuKey}`), `unshipped total for ${skuKey}`);
        aggregates.set(skuKey, next);
    }
    return Array.from(aggregates.values()).sort((a, b) => a.sku.localeCompare(b.sku));
};
const mergeSiteData = (siteData, site) => {
    const next = siteData && typeof siteData === 'object' && !Array.isArray(siteData)
        ? { ...siteData }
        : {};
    if (!Object.prototype.hasOwnProperty.call(next, site)) {
        next[site] = { totalRevenue: 0 };
    }
    return next;
};
const mappingKey = (sku, ycSku) => `${(0, restockYcShared_1.normalizeSku)(sku)}::${(0, restockYcShared_1.normalizeSku)(ycSku)}`;
const createRestockV2Router = ({ ycClient, ycClientFactory, } = {}) => {
    const router = (0, express_1.Router)();
    const getYcClient = async (userId) => {
        if (ycClient)
            return ycClient;
        if (ycClientFactory)
            return ycClientFactory(userId);
        return (0, ycOpenPlatformClient_1.createUserYcOpenPlatformClient)(index_1.prisma, userId);
    };
    router.get('/sites', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            const products = await index_1.prisma.product.findMany({ where: { userId } });
            const remoteWarehouses = activeYcClient.isConfigured()
                ? await activeYcClient.listCustomerWarehouses().catch(error => {
                    (0, restockYcShared_1.logSafeFailure)('YC warehouse lookup failed', error);
                    return [];
                })
                : [];
            res.json({
                ycConfigured: activeYcClient.isConfigured(),
                sites: collectLocalSites(products, remoteWarehouses),
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock site lookup failed', error);
            res.status(500).json({ error: 'Failed to fetch restock sites' });
        }
    });
    router.get('/sync-products/preview', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            const site = (0, restockYcShared_1.normalizeSite)(req.query.site);
            if (!site) {
                return res.status(400).json({ error: 'site is required' });
            }
            if (!activeYcClient.isConfigured()) {
                return res.status(400).json({ error: 'YC credentials are not configured' });
            }
            const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
            const warehouseCodes = warehouseResolution.warehouseCodes;
            if (warehouseCodes.length === 0) {
                return res.status(400).json({
                    error: `YC warehouse mapping is not configured for ${site}`,
                    warnings: warehouseResolution.warnings,
                });
            }
            const [stockRows, products] = await Promise.all([
                activeYcClient.listProductInventory({ warehouseCodes, customerSkus: [] }),
                index_1.prisma.product.findMany({ where: { userId } }),
            ]);
            const currentSiteSkus = new Set(products
                .filter(product => siteSetForProduct(product).has(site))
                .map(product => (0, restockYcShared_1.normalizeSku)(product.sku)));
            const items = aggregateYcStockRows(stockRows).map(item => ({
                ...item,
                alreadyInCurrentSite: currentSiteSkus.has((0, restockYcShared_1.normalizeSku)(item.sku)),
            }));
            return res.json({
                site,
                warehouseCodes,
                warnings: warehouseResolution.warnings,
                items,
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('YC product sync preview failed', error);
            if (error instanceof restockPlanner_1.RestockSourceDataError) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            return res.status(500).json({ error: 'Failed to preview YC products' });
        }
    });
    router.post('/sync-products', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            const site = (0, restockYcShared_1.normalizeSite)(req.body?.site || req.query.site);
            let selectedSkus;
            if (!site) {
                return res.status(400).json({ error: 'site is required' });
            }
            try {
                selectedSkus = parseOptionalYcSkuSelection(req.body?.skus);
            }
            catch {
                return res.status(400).json({ error: 'Invalid YC SKU selection' });
            }
            if (!activeYcClient.isConfigured()) {
                return res.status(400).json({ error: 'YC credentials are not configured' });
            }
            const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
            const warehouseCodes = warehouseResolution.warehouseCodes;
            if (warehouseCodes.length === 0) {
                return res.status(400).json({
                    error: `YC warehouse mapping is not configured for ${site}`,
                    warnings: warehouseResolution.warnings,
                });
            }
            const [stockRows, ycProducts] = await Promise.all([
                activeYcClient.listProductInventory({ warehouseCodes, customerSkus: [] }),
                activeYcClient.listProducts ? activeYcClient.listProducts() : Promise.resolve([]),
            ]);
            const dimensionsBySku = new Map(ycProducts
                .map(product => [
                (0, restockYcShared_1.normalizeSku)(product.customerSku),
                (0, exports.parseYcProductDimensions)(product.productSpecs),
            ])
                .filter(([sku]) => Boolean(sku)));
            const specsSyncedAt = new Date();
            const selectedSkuSet = selectedSkus ? new Set(selectedSkus) : null;
            const syncItems = aggregateYcStockRows(selectedSkuSet
                ? stockRows.filter(row => selectedSkuSet.has((0, restockYcShared_1.normalizeSku)(row.customerSku)))
                : stockRows);
            if (selectedSkus) {
                const availableSkus = new Set(syncItems.map(item => (0, restockYcShared_1.normalizeSku)(item.sku)));
                if (selectedSkus.some(sku => !availableSkus.has(sku))) {
                    return res.status(400).json({ error: 'Selected YC products are no longer available' });
                }
            }
            const [products, inventoryItems, warehouseMappings] = await Promise.all([
                index_1.prisma.product.findMany({ where: { userId } }),
                index_1.prisma.inventoryItem.findMany({ where: { userId } }),
                index_1.prisma.warehouseMapping.findMany({ where: { userId } }),
            ]);
            const productBySku = new Map(products.map(product => [(0, restockYcShared_1.normalizeSku)(product.sku), product]));
            const inventoryBySku = new Map(inventoryItems.map(item => [(0, restockYcShared_1.normalizeSku)(item.sku), item]));
            const thirdMappingKeys = new Set(warehouseMappings
                .filter(mapping => mapping.type === 'third' && mapping.thirdPartyWarehouseId)
                .map(mapping => mappingKey(mapping.sku, mapping.thirdPartyWarehouseId || '')));
            let createdProducts = 0;
            let updatedProducts = 0;
            let createdInventoryItems = 0;
            let updatedInventoryItems = 0;
            let createdMappings = 0;
            await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_sync', objectType: 'SKU', affectedCount: syncItems.length, metadata: { site } }, async (tx) => {
                for (const item of syncItems) {
                    const skuKey = (0, restockYcShared_1.normalizeSku)(item.sku);
                    const dimensions = dimensionsBySku.get(skuKey)
                        || (0, exports.parseYcProductDimensions)(null);
                    const existingProduct = productBySku.get(skuKey);
                    if (existingProduct) {
                        const nextSites = Array.from(new Set([...(existingProduct.sites || []), site]));
                        const nextSiteData = mergeSiteData(existingProduct.siteData, site);
                        const productUpdates = {};
                        Object.assign(productUpdates, dimensions, { ycSpecsSyncedAt: specsSyncedAt });
                        if (!existingProduct.country)
                            productUpdates.country = site;
                        if (nextSites.length !== (existingProduct.sites || []).length)
                            productUpdates.sites = nextSites;
                        if (JSON.stringify(nextSiteData) !== JSON.stringify(existingProduct.siteData || {})) {
                            productUpdates.siteData = nextSiteData;
                        }
                        if ((!existingProduct.name || (0, restockYcShared_1.normalizeSku)(existingProduct.name) === skuKey) && item.name !== item.sku) {
                            productUpdates.name = item.name;
                        }
                        if (Object.keys(productUpdates).length > 0) {
                            await tx.product.update({
                                where: { id: existingProduct.id },
                                data: productUpdates,
                            });
                            updatedProducts += 1;
                        }
                    }
                    else {
                        const created = await tx.product.create({
                            data: {
                                name: item.name,
                                sku: item.sku,
                                country: site,
                                sites: [site],
                                cost: 0,
                                productWeight: 0,
                                ...dimensions,
                                ycSpecsSyncedAt: specsSyncedAt,
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
                        productBySku.set(skuKey, created);
                        createdProducts += 1;
                    }
                    const existingInventory = inventoryBySku.get(skuKey);
                    if (existingInventory) {
                        const stockOfficial = toStockInt(existingInventory.stockOfficial);
                        await tx.inventoryItem.update({
                            where: { id: existingInventory.id },
                            data: {
                                name: existingInventory.name || item.name,
                                stockOfficial,
                                stockThirdParty: item.available,
                                currentStock: stockOfficial + item.available,
                                dailySales: toFiniteNumber(existingInventory.dailySales),
                                leadTime: Math.max(1, toStockInt(existingInventory.leadTime) || 25),
                                replenishCycle: Math.max(1, toStockInt(existingInventory.replenishCycle) || 30),
                                costPerUnit: toFiniteNumber(existingInventory.costPerUnit),
                            },
                        });
                        updatedInventoryItems += 1;
                    }
                    else {
                        const created = await tx.inventoryItem.create({
                            data: {
                                name: item.name,
                                sku: item.sku,
                                currentStock: item.available,
                                stockOfficial: 0,
                                stockThirdParty: item.available,
                                inTransit: 0,
                                dailySales: 0,
                                leadTime: 25,
                                replenishCycle: 30,
                                costPerUnit: 0,
                                userId,
                            },
                        });
                        inventoryBySku.set(skuKey, created);
                        createdInventoryItems += 1;
                    }
                    const key = mappingKey(item.sku, item.sku);
                    if (!thirdMappingKeys.has(key)) {
                        await tx.warehouseMapping.create({
                            data: {
                                sku: item.sku,
                                type: 'third',
                                officialWarehouseId: null,
                                thirdPartyWarehouseId: item.sku,
                                userId,
                            },
                        });
                        thirdMappingKeys.add(key);
                        createdMappings += 1;
                    }
                }
            });
            await Promise.all([
                index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId)),
                index_1.safeRedis.del(`inventory:${userId}`),
                index_1.safeRedis.del(`warehouse-mappings:${userId}`),
            ]);
            res.json({
                site,
                warehouseCodes,
                warnings: warehouseResolution.warnings,
                fetchedRows: stockRows.length,
                syncedSkus: syncItems.length,
                createdProducts,
                updatedProducts,
                createdInventoryItems,
                updatedInventoryItems,
                createdMappings,
                samples: syncItems.slice(0, 10),
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('YC product sync failed', error);
            if (error instanceof restockPlanner_1.RestockSourceDataError) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            res.status(500).json({ error: 'Failed to sync YC products' });
        }
    });
    router.post('/sales-imports', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let site;
            let fileName;
            let statisticsDays;
            let initialItems;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.body?.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
                fileName = (0, restockYcShared_1.parseRequiredString)(req.body?.fileName, 'fileName', restockYcShared_1.MAX_IMPORT_FILE_NAME_LENGTH);
                statisticsDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.statisticsDays, 'statisticsDays', 30, 1, restockYcShared_1.MAX_PLANNING_DAYS, true);
                initialItems = (0, restockSalesImport_1.aggregateSalesImportRows)(req.body?.rows);
            }
            catch {
                return res.status(400).json({ error: 'Invalid sales import payload' });
            }
            const externalSkus = Array.from(new Set(initialItems.map(item => item.platformSku).filter((sku) => Boolean(sku))));
            const [savedMappings, inventoryItems] = await Promise.all([
                externalSkus.length > 0
                    ? index_1.prisma.externalSkuMapping.findMany({
                        // V2 无编号类型概念：只读 legacy 身份的行（V3 按类型保存的映射不作用于 V2）
                        where: { userId, site, externalSku: { in: externalSkus }, externalSkuType: 'legacy' },
                    })
                    : Promise.resolve([]),
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
            ]);
            const ownedInventorySkus = new Set(inventoryItems.map(item => (0, restockSalesImport_1.normalizeRestockSku)(item.sku)));
            const reusableMappings = new Map();
            for (const mapping of savedMappings) {
                const externalSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.externalSku);
                const targetSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.targetSku);
                if (externalSku && targetSku && ownedInventorySkus.has(targetSku)) {
                    reusableMappings.set(externalSku, targetSku);
                }
            }
            const exactFallbackMappings = [];
            for (const externalSku of externalSkus) {
                if (reusableMappings.has(externalSku) || !ownedInventorySkus.has(externalSku))
                    continue;
                reusableMappings.set(externalSku, externalSku);
                exactFallbackMappings.push({ externalSku, targetSku: externalSku });
            }
            const items = (0, restockSalesImport_1.aggregateSalesImportRows)(req.body.rows, reusableMappings);
            const created = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_sales_import', objectType: 'RestockSalesImport', affectedCount: items.length, metadata: { site, inputRows: req.body.rows.length } }, async (tx) => {
                await Promise.all(exactFallbackMappings.map(({ externalSku, targetSku }) => tx.externalSkuMapping.upsert({
                    where: { userId_site_externalSku_externalSkuType: { userId, site, externalSku, externalSkuType: 'legacy' } },
                    create: { userId, site, externalSku, externalSkuType: 'legacy', targetSku },
                    update: { targetSku },
                })));
                return tx.restockSalesImport.create({
                    data: {
                        userId,
                        site,
                        fileName,
                        statisticsDays,
                        items: { create: items },
                    },
                    include: { items: true },
                });
            });
            return res.status(201).json(salesImportResponse(created));
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock sales import failed', error);
            return res.status(500).json({ error: 'Failed to import sales data' });
        }
    });
    router.get('/sales-imports/latest', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            let site;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.query.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
            }
            catch {
                return res.status(400).json({ error: 'site is required' });
            }
            const salesImport = await index_1.prisma.restockSalesImport.findFirst({
                where: { userId, site },
                orderBy: { createdAt: 'desc' },
                include: { items: true },
            });
            if (!salesImport)
                return res.status(404).json({ error: 'Sales import not found' });
            return res.json(salesImportResponse(salesImport));
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock sales import lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch sales import' });
        }
    });
    router.get('/sales-imports/:id', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const id = (0, restockYcShared_1.parseRequiredString)(req.params.id, 'id', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
            const salesImport = await index_1.prisma.restockSalesImport.findFirst({
                where: { id, userId: req.user.id },
                include: { items: true },
            });
            if (!salesImport)
                return res.status(404).json({ error: 'Sales import not found' });
            return res.json(salesImportResponse(salesImport));
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith('Invalid')) {
                return res.status(400).json({ error: 'Invalid sales import id' });
            }
            (0, restockYcShared_1.logSafeFailure)('Restock sales import lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch sales import' });
        }
    });
    router.get('/target-skus', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const [inventoryItems, products] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({
                    where: { userId }, select: { id: true, sku: true, name: true },
                }),
                index_1.prisma.product.findMany({
                    where: { userId }, select: { id: true, sku: true, name: true },
                }),
            ]);
            const unique = new Map();
            [...inventoryItems, ...products].forEach(item => {
                const sku = (0, restockSalesImport_1.normalizeRestockSku)(item.sku);
                if (!sku || unique.has(sku))
                    return;
                unique.set(sku, {
                    id: String(item.id),
                    sku,
                    name: String(item.name || '').trim() || sku,
                });
            });
            const items = Array.from(unique.values()).sort((left, right) => left.sku.localeCompare(right.sku));
            return res.json({ items });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock target SKU lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch target SKUs' });
        }
    });
    router.post('/target-skus', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
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
            if ([...products, ...inventoryItems].some(item => (0, restockSalesImport_1.normalizeRestockSku)(item.sku) === sku)) {
                return res.status(409).json({ error: 'Target SKU already exists' });
            }
            const inventory = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_target_create', objectType: 'InventoryItem' }, async (tx) => {
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
            (0, restockYcShared_1.logSafeFailure)('Restock target SKU create failed', error);
            return res.status(500).json({ error: 'Failed to create target SKU' });
        }
    });
    router.put('/sales-imports/:importId/items/:itemId/mapping', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let importId;
            let itemId;
            let targetSku;
            try {
                importId = (0, restockYcShared_1.parseRequiredString)(req.params.importId, 'importId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                itemId = (0, restockYcShared_1.parseRequiredString)(req.params.itemId, 'itemId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                targetSku = (0, restockSalesImport_1.normalizeRestockSku)(req.body?.targetSku);
                if (!targetSku)
                    throw new Error('Invalid targetSku');
            }
            catch {
                return res.status(400).json({ error: 'Invalid SKU mapping payload' });
            }
            const salesImport = await index_1.prisma.restockSalesImport.findFirst({
                where: { id: importId, userId },
            });
            if (!salesImport)
                return res.status(404).json({ error: 'Sales import not found' });
            const item = await index_1.prisma.restockSalesItem.findFirst({ where: { id: itemId, importId } });
            if (!item)
                return res.status(404).json({ error: 'Sales import item not found' });
            const [inventoryItems, products] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
                index_1.prisma.product.findMany({ where: { userId }, select: { sku: true, name: true, cost: true } }),
            ]);
            const matchedInventory = inventoryItems.find(entry => (0, restockSalesImport_1.normalizeRestockSku)(entry.sku) === targetSku);
            const matchedProduct = products.find(entry => (0, restockSalesImport_1.normalizeRestockSku)(entry.sku) === targetSku);
            if (!matchedInventory && !matchedProduct)
                return res.status(400).json({ error: 'Target SKU not found' });
            const normalizedTargetSku = (0, restockSalesImport_1.normalizeRestockSku)(matchedInventory?.sku || matchedProduct.sku);
            const externalSku = (0, restockSalesImport_1.normalizeRestockSku)(item.platformSku);
            const updatedItem = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_mapping_save', objectType: 'RestockSalesItem' }, async (tx) => {
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
                if (externalSku) {
                    await tx.externalSkuMapping.upsert({
                        where: { userId_site_externalSku_externalSkuType: { userId, site: salesImport.site, externalSku, externalSkuType: 'legacy' } },
                        create: { userId, site: salesImport.site, externalSku, externalSkuType: 'legacy', targetSku: normalizedTargetSku },
                        update: { targetSku: normalizedTargetSku },
                    });
                }
                return tx.restockSalesItem.update({
                    where: { id: item.id },
                    data: { targetSku: normalizedTargetSku },
                });
            });
            if (!matchedInventory)
                await index_1.safeRedis.del(`inventory:${userId}`);
            return res.json(updatedItem);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock SKU mapping failed', error);
            return res.status(500).json({ error: 'Failed to save SKU mapping' });
        }
    });
    router.patch('/sales-imports/:importId/items/:itemId/dismissal', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let importId;
            let itemId;
            try {
                importId = (0, restockYcShared_1.parseRequiredString)(req.params.importId, 'importId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                itemId = (0, restockYcShared_1.parseRequiredString)(req.params.itemId, 'itemId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                if (req.body?.dismissed !== true)
                    throw new Error('Invalid dismissed');
            }
            catch {
                return res.status(400).json({ error: 'Invalid sales import dismissal payload' });
            }
            const salesImport = await index_1.prisma.restockSalesImport.findFirst({
                where: { id: importId, userId },
            });
            if (!salesImport)
                return res.status(404).json({ error: 'Sales import not found' });
            const item = await index_1.prisma.restockSalesItem.findFirst({ where: { id: itemId, importId } });
            if (!item)
                return res.status(404).json({ error: 'Sales import item not found' });
            const updatedItem = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_item_dismiss', objectType: 'RestockSalesItem' }, tx => tx.restockSalesItem.update({
                where: { id: item.id },
                data: { dismissedAt: new Date() },
            }));
            return res.json(updatedItem);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock sales import dismissal failed', error);
            return res.status(500).json({ error: 'Failed to dismiss sales import item' });
        }
    });
    router.get('/sku-rules', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            let site;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.query.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
            }
            catch {
                return res.status(400).json({ error: 'site is required' });
            }
            const rules = await index_1.prisma.restockSkuRule.findMany({
                where: { userId: req.user.id, site },
                orderBy: { sku: 'asc' },
            });
            return res.json({ site, rules });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock SKU rule lookup failed', error);
            return res.status(500).json({ error: 'Failed to fetch SKU rules' });
        }
    });
    router.put('/sku-rules/:sku', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
        try {
            const userId = req.user.id;
            let site;
            let sku;
            let leadTimeDays;
            let safetyDays;
            let growthPercent;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.body?.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
                sku = (0, restockSalesImport_1.normalizeRestockSku)(req.params.sku);
                if (!sku)
                    throw new Error('Invalid sku');
                leadTimeDays = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.leadTimeDays, 'leadTimeDays', 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                safetyDays = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.safetyDays, 'safetyDays', 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                growthPercent = (0, restockYcShared_1.parseNullableBoundedNumber)(req.body?.growthPercent, 'growthPercent', 0, restockYcShared_1.MAX_GROWTH_PERCENT);
            }
            catch {
                return res.status(400).json({ error: 'Invalid SKU rule payload' });
            }
            const inventoryItems = await index_1.prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } });
            if (!inventoryItems.some(item => (0, restockSalesImport_1.normalizeRestockSku)(item.sku) === sku)) {
                return res.status(400).json({ error: 'Inventory SKU not found' });
            }
            const data = { leadTimeDays, safetyDays, growthPercent };
            const rule = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'restock-v2', action: 'restock_rule_save', objectType: 'RestockSkuRule' }, tx => tx.restockSkuRule.upsert({
                where: { userId_site_sku: { userId, site, sku } },
                create: { userId, site, sku, ...data },
                update: data,
            }));
            return res.json(rule);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock SKU rule update failed', error);
            return res.status(500).json({ error: 'Failed to save SKU rule' });
        }
    });
    router.get('/stock-snapshot', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            const site = (0, restockYcShared_1.normalizeSite)(req.query.site);
            if (!site) {
                return res.status(400).json({ error: 'site is required' });
            }
            const warnings = [];
            if (!activeYcClient.isConfigured()) {
                return res.json({
                    site,
                    remoteFetched: false,
                    warehouseCodes: [],
                    warnings: ['YC credentials are not configured'],
                    items: [],
                });
            }
            const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
            const warehouseCodes = warehouseResolution.warehouseCodes;
            warnings.push(...warehouseResolution.warnings);
            if (warehouseCodes.length === 0) {
                warnings.push(`YC warehouse mapping is not configured for ${site}`);
                return res.json({
                    site,
                    remoteFetched: false,
                    warehouseCodes,
                    warnings,
                    items: [],
                });
            }
            const [products, warehouseMappings] = await Promise.all([
                index_1.prisma.product.findMany({ where: { userId } }),
                index_1.prisma.warehouseMapping.findMany({ where: { userId } }),
            ]);
            const siteProducts = products.filter(product => siteSetForProduct(product).has(site));
            const skus = siteProducts.map(product => product.sku).filter(Boolean);
            const ycSkuAliases = (0, restockYcShared_1.buildYcSkuAliasMap)(warehouseMappings, skus);
            const querySkus = Array.from(new Set([
                ...skus,
                ...Array.from(ycSkuAliases.keys()),
            ]));
            const stockRows = await activeYcClient.listProductInventory({
                warehouseCodes,
                customerSkus: querySkus,
            });
            const mappedRows = (0, restockYcShared_1.withMappedCustomerSku)(stockRows, ycSkuAliases);
            const items = aggregateYcStockRows(mappedRows);
            res.json({
                site,
                remoteFetched: true,
                warehouseCodes,
                warnings,
                items,
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('YC stock snapshot failed', error);
            if (error instanceof restockPlanner_1.RestockSourceDataError) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            res.status(500).json({ error: 'Failed to fetch YC stock snapshot' });
        }
    });
    router.post('/recommendations', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            let site;
            let salesImportId;
            let planningDate;
            let targetDate;
            let leadTimeDays;
            let safetyDays;
            let growthPercent;
            try {
                site = (0, restockYcShared_1.normalizeSite)((0, restockYcShared_1.parseRequiredString)(req.body?.site, 'site', restockYcShared_1.MAX_SITE_LENGTH));
                salesImportId = (0, restockYcShared_1.parseRequiredString)(req.body?.salesImportId, 'salesImportId', restockYcShared_1.MAX_IMPORT_ID_LENGTH);
                planningDate = (0, restockYcShared_1.parseDateQuery)(req.body?.planningDate, 'planningDate')
                    || new Date().toISOString().slice(0, 10);
                const parsedTargetDate = (0, restockYcShared_1.parseDateQuery)(req.body?.targetDate, 'targetDate');
                if (!parsedTargetDate)
                    throw new Error('Invalid targetDate');
                targetDate = parsedTargetDate;
                leadTimeDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.leadTimeDays, 'leadTimeDays', 25, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                safetyDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.safetyDays, 'safetyDays', 30, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                growthPercent = (0, restockYcShared_1.parseBoundedQueryNumber)(req.body?.growthPercent, 'growthPercent', 0, 0, restockYcShared_1.MAX_GROWTH_PERCENT);
                const horizonDays = (Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${planningDate}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000);
                if (horizonDays <= leadTimeDays || horizonDays > restockYcShared_1.MAX_PLANNING_DAYS)
                    throw new Error('Invalid targetDate');
            }
            catch {
                return res.status(400).json({ error: 'Invalid restock parameters' });
            }
            if (!activeYcClient.isConfigured()) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const salesImport = await index_1.prisma.restockSalesImport.findFirst({
                where: { id: salesImportId, userId, site },
                include: { items: true },
            });
            if (!salesImport)
                return res.status(404).json({ error: 'Sales import not found' });
            if (!Number.isInteger(salesImport.statisticsDays)
                || salesImport.statisticsDays < 1
                || salesImport.statisticsDays > restockYcShared_1.MAX_PLANNING_DAYS) {
                return res.status(500).json({ error: 'Sales import contains invalid statistics days' });
            }
            const activeItems = salesImport.items.filter(item => !item.dismissedAt);
            const salesAggregates = (0, restockSalesImport_1.buildTargetSalesAggregates)(activeItems);
            const [inventoryItems, products, warehouseMappings, savedRules] = await Promise.all([
                index_1.prisma.inventoryItem.findMany({ where: { userId } }),
                index_1.prisma.product.findMany({ where: { userId } }),
                index_1.prisma.warehouseMapping.findMany({ where: { userId } }),
                index_1.prisma.restockSkuRule.findMany({ where: { userId, site } }),
            ]);
            const inventoryBySku = new Map(inventoryItems.map(item => [(0, restockSalesImport_1.normalizeRestockSku)(item.sku), item]));
            const productBySku = new Map(products.map(product => [(0, restockSalesImport_1.normalizeRestockSku)(product.sku), product]));
            const inventoryBackedAggregates = salesAggregates.filter(aggregate => inventoryBySku.has(aggregate.targetSku));
            const excludedOversizedSkus = inventoryBackedAggregates
                .filter(aggregate => aggregate.targetSku.length > restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH)
                .map(aggregate => aggregate.targetSku);
            const validAggregates = inventoryBackedAggregates.filter(aggregate => aggregate.targetSku.length <= restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH);
            const importedInventoryItems = validAggregates.map(aggregate => {
                const inventory = inventoryBySku.get(aggregate.targetSku);
                return {
                    ...inventory,
                    dailySales: aggregate.validSales / salesImport.statisticsDays,
                };
            });
            const importedProducts = validAggregates.map(aggregate => {
                const inventory = inventoryBySku.get(aggregate.targetSku);
                const product = productBySku.get(aggregate.targetSku);
                return {
                    id: product?.id || inventory.id,
                    name: product?.name || inventory.name,
                    sku: inventory.sku,
                    country: site,
                    sites: Array.from(new Set([...(product?.sites || []), site])),
                    cost: product?.cost ?? inventory.costPerUnit,
                    siteData: product?.siteData,
                };
            });
            const skus = importedInventoryItems.map(item => item.sku);
            const ycSkuAliases = (0, restockYcShared_1.buildYcSkuAliasMap)(warehouseMappings, skus);
            const querySkus = Array.from(new Set([...skus, ...Array.from(ycSkuAliases.keys())])).filter(sku => sku.length <= restockYcShared_1.YC_STOCK_SKU_MAX_LENGTH);
            const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
            const warehouseCodes = warehouseResolution.warehouseCodes;
            if (warehouseCodes.length === 0) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const remoteRows = querySkus.length > 0
                ? await (0, restockYcShared_1.fetchRemoteRows)(activeYcClient, warehouseCodes, querySkus)
                : { stockRows: [], inboundOrders: [], failures: [] };
            if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
                for (const failure of remoteRows.failures) {
                    (0, restockYcShared_1.logSafeFailure)(`YC ${failure.source} lookup failed`, failure.error);
                }
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const stockRows = (0, restockYcShared_1.withMappedCustomerSku)(remoteRows.stockRows, ycSkuAliases);
            const inboundOrders = (0, restockYcShared_1.withMappedInboundCustomerSku)(remoteRows.inboundOrders, ycSkuAliases);
            const eligibleSkus = new Set(validAggregates.map(aggregate => aggregate.targetSku));
            const skuRules = savedRules
                .filter(rule => eligibleSkus.has((0, restockSalesImport_1.normalizeRestockSku)(rule.sku)))
                .map(rule => ({
                sku: (0, restockSalesImport_1.normalizeRestockSku)(rule.sku),
                leadTimeDays: rule.leadTimeDays ?? undefined,
                safetyDays: rule.safetyDays ?? undefined,
                growthPercent: rule.growthPercent ?? undefined,
            }));
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
                });
            }
            catch (error) {
                (0, restockYcShared_1.logSafeFailure)('Imported restock plan rejected', error);
                if (error instanceof restockPlanner_1.RestockPlanValidationError) {
                    return res.status(400).json({ error: 'Invalid restock parameters' });
                }
                if (error instanceof restockPlanner_1.RestockSourceDataError || error instanceof restockSalesImport_1.SalesImportValidationError) {
                    return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
                }
                return res.status(500).json({ error: 'Failed to build restock recommendations' });
            }
            return res.json({
                ...plan,
                metadata: {
                    salesImportId: salesImport.id,
                    statisticsDays: salesImport.statisticsDays,
                    pendingCount: activeItems.filter(item => !(0, restockSalesImport_1.normalizeRestockSku)(item.targetSku)).length,
                    excludedMissingInventoryCount: salesAggregates.length - inventoryBackedAggregates.length,
                    excludedOversizedSkus,
                },
                integration: {
                    ycConfigured: true,
                    remoteFetched: true,
                    stockSource: stockRows.length > 0 ? 'yc' : 'missing',
                    warehouseCodes,
                    warnings: warehouseResolution.warnings,
                },
            });
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Imported restock recommendation request failed', error);
            return res.status(500).json({ error: 'Failed to build restock recommendations' });
        }
    });
    router.get('/recommendations', requireRestockPermission('restock-v2.view'), async (req, res) => {
        try {
            const userId = req.user.id;
            const activeYcClient = await getYcClient(userId);
            const site = (0, restockYcShared_1.normalizeSite)(req.query.site);
            if (!site) {
                return res.status(400).json({ error: 'site is required' });
            }
            let planningDate;
            let targetDate;
            let leadTimeDays;
            let safetyDays;
            let growthPercent;
            try {
                planningDate = (0, restockYcShared_1.parseDateQuery)(req.query.planningDate, 'planningDate')
                    || new Date().toISOString().slice(0, 10);
                const parsedTargetDate = (0, restockYcShared_1.parseDateQuery)(req.query.targetDate, 'targetDate');
                if (!parsedTargetDate)
                    throw new Error('Invalid targetDate');
                targetDate = parsedTargetDate;
                leadTimeDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.query.leadTimeDays, 'leadTimeDays', 25, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                safetyDays = (0, restockYcShared_1.parseBoundedQueryNumber)(req.query.safetyDays, 'safetyDays', 30, 0, restockYcShared_1.MAX_PLANNING_DAYS, true);
                growthPercent = (0, restockYcShared_1.parseBoundedQueryNumber)(req.query.growthPercent, 'growthPercent', 0, 0, restockYcShared_1.MAX_GROWTH_PERCENT);
                const planningTime = Date.parse(`${planningDate}T00:00:00.000Z`);
                const targetTime = Date.parse(`${targetDate}T00:00:00.000Z`);
                const planningHorizonDays = (targetTime - planningTime) / (24 * 60 * 60 * 1000);
                if (planningHorizonDays <= leadTimeDays || planningHorizonDays > restockYcShared_1.MAX_PLANNING_DAYS) {
                    throw new Error('Invalid targetDate');
                }
            }
            catch {
                return res.status(400).json({ error: 'Invalid restock parameters' });
            }
            const ycConfigured = activeYcClient.isConfigured();
            if (!ycConfigured) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const warehouseResolution = await (0, restockYcShared_1.resolveWarehouseCodesForSite)(activeYcClient, site);
            const warehouseCodes = warehouseResolution.warehouseCodes;
            if (warehouseCodes.length === 0) {
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const products = await index_1.prisma.product.findMany({ where: { userId } });
            const inventoryItems = await index_1.prisma.inventoryItem.findMany({ where: { userId } });
            const warehouseMappings = await index_1.prisma.warehouseMapping.findMany({ where: { userId } });
            const warnings = [...warehouseResolution.warnings];
            const skus = products.map(product => product.sku).filter(Boolean);
            const ycSkuAliases = (0, restockYcShared_1.buildYcSkuAliasMap)(warehouseMappings, skus);
            const querySkus = Array.from(new Set([
                ...skus,
                ...Array.from(ycSkuAliases.keys()),
            ]));
            const remoteRows = await (0, restockYcShared_1.fetchRemoteRows)(activeYcClient, warehouseCodes, querySkus);
            if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
                for (const failure of remoteRows.failures) {
                    (0, restockYcShared_1.logSafeFailure)(`YC ${failure.source} lookup failed`, failure.error);
                }
                return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
            }
            const stockRows = (0, restockYcShared_1.withMappedCustomerSku)(remoteRows.stockRows, ycSkuAliases);
            const inboundOrders = (0, restockYcShared_1.withMappedInboundCustomerSku)(remoteRows.inboundOrders, ycSkuAliases);
            let plan;
            try {
                plan = (0, restockPlanner_1.buildRestockPlan)({
                    site,
                    products,
                    inventoryItems,
                    remoteStockRows: stockRows,
                    inboundOrders,
                    planningDate,
                    targetDate,
                    leadTimeDays,
                    safetyDays,
                    growthPercent,
                });
            }
            catch (error) {
                (0, restockYcShared_1.logSafeFailure)('Restock plan rejected', error);
                if (error instanceof restockPlanner_1.RestockPlanValidationError) {
                    return res.status(400).json({ error: 'Invalid restock parameters' });
                }
                if (error instanceof restockPlanner_1.RestockSourceDataError) {
                    return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
                }
                return res.status(500).json({ error: 'Failed to build restock recommendations' });
            }
            const response = {
                ...plan,
                integration: {
                    ycConfigured,
                    remoteFetched: true,
                    stockSource: stockRows.length > 0 ? 'yc' : 'missing',
                    warehouseCodes,
                    warnings,
                },
            };
            res.json(response);
        }
        catch (error) {
            (0, restockYcShared_1.logSafeFailure)('Restock recommendation request failed', error);
            res.status(500).json({ error: 'Failed to build restock recommendations' });
        }
    });
    return router;
};
exports.createRestockV2Router = createRestockV2Router;
exports.default = (0, exports.createRestockV2Router)();
