"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardSnapshotLoader = exports.DashboardDataUnavailableError = void 0;
const dashboardWarehouseService_1 = require("./dashboardWarehouseService");
const restockSalesImport_1 = require("./restockSalesImport");
const ycOpenPlatformClient_1 = require("./ycOpenPlatformClient");
const SITE_NAMES = {
    MY: 'Malaysia',
    SG: 'Singapore',
    PH: 'Philippines',
    TH: 'Thailand',
    ID: 'Indonesia',
};
const SITE_ORDER = ['MY', 'SG', 'PH', 'TH', 'ID'];
const SNAPSHOT_TTL_SECONDS = 5 * 60;
const RECEIPT_TTL_SECONDS = 60 * 60;
const STOCK_AGE_TTL_SECONDS = 60 * 60;
const MAX_CACHED_RECEIPTS = 10_000;
const MAX_CACHED_STOCK_AGES = 10_000;
const MAX_SNAPSHOT_RECEIPTS = 25_000;
const RECEIPT_WAREHOUSE_CONCURRENCY = 4;
class DashboardDataUnavailableError extends Error {
    constructor(message = 'Warehouse monitoring data is unavailable') {
        super(message);
        this.name = 'DashboardDataUnavailableError';
    }
}
exports.DashboardDataUnavailableError = DashboardDataUnavailableError;
const normalizeSite = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'MYR')
        return 'MY';
    if (normalized === 'SGD')
        return 'SG';
    if (normalized === 'PHP')
        return 'PH';
    if (normalized === 'THB')
        return 'TH';
    if (normalized === 'IDR')
        return 'ID';
    return normalized;
};
const productSites = (product) => {
    const sites = new Set();
    for (const site of product.sites || [])
        sites.add(normalizeSite(site));
    if (product.country)
        sites.add(normalizeSite(product.country));
    if (product.siteData && typeof product.siteData === 'object' && !Array.isArray(product.siteData)) {
        for (const site of Object.keys(product.siteData)) {
            sites.add(normalizeSite(site));
        }
    }
    return Array.from(sites).filter(Boolean);
};
const orderedSites = (siteCodes) => {
    const unique = Array.from(new Set(Array.from(siteCodes, normalizeSite))).filter(Boolean);
    unique.sort((a, b) => {
        const aIndex = SITE_ORDER.indexOf(a);
        const bIndex = SITE_ORDER.indexOf(b);
        if (aIndex >= 0 || bIndex >= 0) {
            return (aIndex < 0 ? SITE_ORDER.length : aIndex) - (bIndex < 0 ? SITE_ORDER.length : bIndex);
        }
        return a.localeCompare(b);
    });
    return unique.map(code => ({ code, name: SITE_NAMES[code] || code }));
};
const warehouseCodesForSite = (warehouses, site) => {
    const remote = warehouses
        .filter(warehouse => normalizeSite(warehouse.siteCode) === site)
        .map(warehouse => String(warehouse.code || '').trim())
        .filter(Boolean);
    return Array.from(new Set([...(0, ycOpenPlatformClient_1.getYcWarehouseCodesForSite)(site), ...remote]));
};
const parseAvailable = (value) => {
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        throw new DashboardDataUnavailableError();
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
        throw new DashboardDataUnavailableError();
    }
    return parsed;
};
const isReceipt = (value) => {
    if (!value || typeof value !== 'object')
        return false;
    const receipt = value;
    return typeof receipt.warehouseCode === 'string'
        && (typeof receipt.customerSku === 'string' || receipt.customerSku === null)
        && (typeof receipt.productSku === 'string' || receipt.productSku === null)
        && typeof receipt.receivedAt === 'string'
        && Number.isFinite(Date.parse(receipt.receivedAt))
        && Number.isFinite(receipt.quantity)
        && Number(receipt.quantity) > 0;
};
const isStockAgeRow = (value) => {
    if (!value || typeof value !== 'object')
        return false;
    const row = value;
    return typeof row.warehouseCode === 'string'
        && typeof row.customerSku === 'string'
        && (typeof row.calculateDate === 'string' || row.calculateDate === null)
        && (row.shelveDescription === undefined
            || row.shelveDescription === null
            || typeof row.shelveDescription === 'string');
};
const safeCachedSnapshot = (value) => {
    if (!value || value.length > 5_000_000)
        return null;
    try {
        const parsed = JSON.parse(value);
        if (!parsed || !Array.isArray(parsed.sites) || !Array.isArray(parsed.agingRows)
            || !Array.isArray(parsed.restockRows) || !parsed.summary || !parsed.warnings)
            return null;
        if (!parsed.agingRows.every(row => ('dailyStorageFee' in row
            && 'totalStorageFee' in row
            && 'storageFeeStatus' in row
            && 'storageFeeCalculatedAt' in row)))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
};
const safeCachedStockAges = (value) => {
    if (!value || value.length > 3_000_000)
        return null;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)
            || parsed.length > MAX_CACHED_STOCK_AGES
            || !parsed.every(isStockAgeRow))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
};
const safeCachedReceipts = (value) => {
    if (!value || value.length > 3_000_000)
        return null;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length > MAX_CACHED_RECEIPTS || !parsed.every(isReceipt))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
};
const mapWithConcurrency = async (items, concurrency, mapper) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};
const createDashboardSnapshotLoader = ({ db, cache, ycClient, now = () => new Date(), }) => {
    const inFlight = new Map();
    const credentialScope = ycClient.cacheScope || 'default';
    const loadReceipts = async (userId, warehouseCode) => {
        const cacheKey = `dashboard:receipts:${userId}:${credentialScope}:${warehouseCode}`;
        const cached = safeCachedReceipts(await cache.get(cacheKey));
        if (cached)
            return cached;
        if (!ycClient.listInboundReceiptHistory)
            throw new DashboardDataUnavailableError();
        const receipts = await ycClient.listInboundReceiptHistory({ warehouseCodes: [warehouseCode] });
        if (receipts.length > MAX_CACHED_RECEIPTS)
            throw new DashboardDataUnavailableError();
        await cache.set(cacheKey, JSON.stringify(receipts), 'EX', RECEIPT_TTL_SECONDS);
        return receipts;
    };
    const loadStockAges = async (userId, warehouseCode) => {
        const cacheKey = `dashboard:stock-age:${userId}:${credentialScope}:${warehouseCode}`;
        const cached = safeCachedStockAges(await cache.get(cacheKey));
        if (cached)
            return cached;
        if (!ycClient.listStockAge)
            throw new DashboardDataUnavailableError();
        const rows = await ycClient.listStockAge({ warehouseCodes: [warehouseCode], customerSkus: [] });
        if (rows.length > MAX_CACHED_STOCK_AGES)
            throw new DashboardDataUnavailableError();
        await cache.set(cacheKey, JSON.stringify(rows), 'EX', STOCK_AGE_TTL_SECONDS);
        return rows;
    };
    const build = async (userId) => {
        if (!ycClient.isConfigured())
            throw new DashboardDataUnavailableError('YC is not configured');
        const [products, mappings, warehouses] = await Promise.all([
            db.product.findMany({
                where: { userId },
                select: { sku: true, name: true, country: true, sites: true, siteData: true },
            }),
            db.warehouseMapping.findMany({
                where: { userId },
                select: { sku: true, thirdPartyWarehouseId: true, type: true },
            }),
            ycClient.listCustomerWarehouses(),
        ]);
        const siteCodes = new Set();
        for (const product of products) {
            for (const site of productSites(product))
                siteCodes.add(site);
        }
        for (const warehouse of warehouses) {
            const site = normalizeSite(warehouse.siteCode);
            if (site)
                siteCodes.add(site);
        }
        const sites = orderedSites(siteCodes);
        const productBySku = new Map(products.map(product => [(0, restockSalesImport_1.normalizeRestockSku)(product.sku), product]));
        const skuAliases = new Map();
        for (const mapping of mappings) {
            if (mapping.type !== 'third')
                continue;
            const ycSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.thirdPartyWarehouseId);
            const erpSku = (0, restockSalesImport_1.normalizeRestockSku)(mapping.sku);
            if (ycSku && erpSku && productBySku.has(erpSku))
                skuAliases.set(ycSku, erpSku);
        }
        const warehouseByCode = new Map(warehouses
            .map(warehouse => [String(warehouse.code || '').trim(), warehouse])
            .filter(([code]) => Boolean(code)));
        const salesBySite = new Map();
        await Promise.all(sites.map(async (site) => {
            const salesImport = await db.restockSalesImport.findFirst({
                where: { userId, site: site.code, statisticsDays: 30 },
                orderBy: { createdAt: 'desc' },
                include: { items: { where: { dismissedAt: null } } },
            });
            if (!salesImport)
                return;
            salesBySite.set(site.code, (0, restockSalesImport_1.buildTargetSalesAggregates)(salesImport.items).map(item => ({
                site: site.code,
                sku: item.targetSku,
                validSales: item.validSales,
                statisticsDays: 30,
            })));
        }));
        const stocks = [];
        const receipts = [];
        const stockAges = [];
        const unavailableStockAgeWarehouseCodes = [];
        const unavailableSites = [];
        await Promise.all(sites.map(async (site) => {
            const warehouseCodes = warehouseCodesForSite(warehouses, site.code);
            if (warehouseCodes.length === 0)
                return;
            try {
                const [remoteStocks, receiptGroups] = await Promise.all([
                    ycClient.listProductInventory({ warehouseCodes, customerSkus: [] }),
                    mapWithConcurrency(warehouseCodes, RECEIPT_WAREHOUSE_CONCURRENCY, warehouseCode => loadReceipts(userId, warehouseCode)),
                ]);
                const siteReceipts = receiptGroups.flat();
                if (siteReceipts.length > MAX_SNAPSHOT_RECEIPTS) {
                    throw new DashboardDataUnavailableError();
                }
                for (const row of remoteStocks) {
                    const warehouseCode = String(row.warehouseCode || '').trim();
                    if (!warehouseCode || !warehouseCodes.includes(warehouseCode))
                        continue;
                    const rawSku = (0, restockSalesImport_1.normalizeRestockSku)(row.customerSku);
                    const sku = skuAliases.get(rawSku) || rawSku;
                    if (!sku)
                        continue;
                    const product = productBySku.get(sku);
                    stocks.push({
                        site: site.code,
                        warehouseCode,
                        warehouseName: String(warehouseByCode.get(warehouseCode)?.name || warehouseCode),
                        sku,
                        name: product?.name || String(row.customerSkuName || row.customerSku || sku),
                        available: parseAvailable(row.available),
                    });
                }
                for (const receipt of siteReceipts) {
                    const rawSku = (0, restockSalesImport_1.normalizeRestockSku)(receipt.customerSku || receipt.productSku);
                    const sku = skuAliases.get(rawSku) || rawSku;
                    if (!sku)
                        continue;
                    receipts.push({
                        warehouseCode: receipt.warehouseCode,
                        sku,
                        quantity: receipt.quantity,
                        receivedAt: receipt.receivedAt,
                    });
                }
                const ageGroups = await mapWithConcurrency(warehouseCodes, RECEIPT_WAREHOUSE_CONCURRENCY, async (warehouseCode) => {
                    try {
                        return await loadStockAges(userId, warehouseCode);
                    }
                    catch {
                        unavailableStockAgeWarehouseCodes.push(warehouseCode);
                        return [];
                    }
                });
                for (const row of ageGroups.flat()) {
                    const warehouseCode = String(row.warehouseCode || '').trim();
                    if (!warehouseCode || !warehouseCodes.includes(warehouseCode))
                        continue;
                    const rawSku = (0, restockSalesImport_1.normalizeRestockSku)(row.customerSku);
                    const sku = skuAliases.get(rawSku) || rawSku;
                    if (!sku)
                        continue;
                    const quantity = Number(row.stockAgeQuantity);
                    const stockAgeDay = Number(row.stockAgeDay);
                    const rawVolume = row.stockAgeVolume;
                    const parsedVolume = rawVolume === null || rawVolume === undefined || rawVolume === ''
                        ? null
                        : Number(rawVolume);
                    stockAges.push({
                        warehouseCode,
                        sku,
                        quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
                        stockAgeDay: Number.isFinite(stockAgeDay) ? stockAgeDay : -1,
                        stockAgeVolume: parsedVolume !== null && Number.isFinite(parsedVolume)
                            ? parsedVolume
                            : null,
                        calculateDate: String(row.calculateDate || '').trim(),
                        shelveDescription: String(row.shelveDescription || '').trim(),
                    });
                }
            }
            catch {
                unavailableSites.push(site.code);
            }
        }));
        if (sites.length > 0 && unavailableSites.length === sites.length) {
            throw new DashboardDataUnavailableError();
        }
        const snapshot = (0, dashboardWarehouseService_1.buildDashboardWarehouseSnapshot)({
            now: now(),
            sites,
            stocks,
            sales: Array.from(salesBySite.values()).flat(),
            receipts,
            stockAges,
            unavailableStockAgeWarehouseCodes,
        });
        snapshot.warnings.unavailableSites = unavailableSites;
        return snapshot;
    };
    return {
        async load(userId) {
            const cacheKey = `dashboard:warehouse:v2:${userId}:${credentialScope}`;
            const cached = safeCachedSnapshot(await cache.get(cacheKey));
            if (cached)
                return cached;
            const existing = inFlight.get(userId);
            if (existing)
                return existing;
            const task = build(userId)
                .then(async (snapshot) => {
                await cache.set(cacheKey, JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SECONDS);
                return snapshot;
            })
                .finally(() => inFlight.delete(userId));
            inFlight.set(userId, task);
            return task;
        },
    };
};
exports.createDashboardSnapshotLoader = createDashboardSnapshotLoader;
