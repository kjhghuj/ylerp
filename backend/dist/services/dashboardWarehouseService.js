"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginateDashboardRows = exports.buildDashboardWarehouseSnapshot = exports.calculateStockAgeStorageFee = exports.cumulativeStorageFeeRate = exports.storageFeeRateForDay = exports.estimateFifoAgeDays = void 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const estimateFifoAgeDays = (available, receipts, now = new Date()) => {
    if (!Number.isFinite(available) || available <= 0) {
        return { ageDays: null, complete: true };
    }
    const validReceipts = receipts
        .map(receipt => ({
        quantity: Number(receipt.quantity),
        time: Date.parse(receipt.receivedAt),
    }))
        .filter(receipt => Number.isFinite(receipt.quantity) && receipt.quantity > 0
        && Number.isFinite(receipt.time)
        && receipt.time <= now.getTime())
        .sort((a, b) => b.time - a.time);
    let covered = 0;
    for (const receipt of validReceipts) {
        covered += receipt.quantity;
        if (covered >= available) {
            return {
                ageDays: Math.max(0, Math.floor((now.getTime() - receipt.time) / DAY_MS)),
                complete: true,
            };
        }
    }
    return { ageDays: null, complete: false };
};
exports.estimateFifoAgeDays = estimateFifoAgeDays;
const compositeKey = (...values) => values.map(value => value.trim().toUpperCase()).join('\u0000');
const finiteNonNegative = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const storageFeeRateForDay = (stockAgeDay) => {
    const day = Math.max(0, Math.floor(stockAgeDay));
    if (day <= 30)
        return 0;
    if (day <= 60)
        return 3;
    if (day <= 90)
        return 4;
    if (day <= 180)
        return 6;
    return 8;
};
exports.storageFeeRateForDay = storageFeeRateForDay;
const cumulativeStorageFeeRate = (stockAgeDay) => {
    const day = Math.max(0, Math.floor(stockAgeDay));
    return Math.max(0, Math.min(day, 60) - 30) * 3
        + Math.max(0, Math.min(day, 90) - 60) * 4
        + Math.max(0, Math.min(day, 180) - 90) * 6
        + Math.max(0, day - 180) * 8;
};
exports.cumulativeStorageFeeRate = cumulativeStorageFeeRate;
const roundMoney = (value, precision) => {
    const scale = 10 ** precision;
    return Math.round((value + Number.EPSILON) * scale) / scale;
};
const calculateStockAgeStorageFee = (batches) => {
    if (batches.length === 0) {
        return {
            dailyStorageFee: null,
            totalStorageFee: null,
            storageFeeStatus: 'missing_product_specs',
            storageFeeCalculatedAt: null,
        };
    }
    const datedBatches = batches.map(batch => ({
        batch,
        calculatedTime: Date.parse(String(batch.calculateDate || '').trim()),
    }));
    if (datedBatches.some(entry => !Number.isFinite(entry.calculatedTime))) {
        return {
            dailyStorageFee: null,
            totalStorageFee: null,
            storageFeeStatus: 'unavailable',
            storageFeeCalculatedAt: null,
        };
    }
    const latestCalculatedTime = Math.max(...datedBatches.map(entry => entry.calculatedTime));
    const currentBatches = datedBatches
        .filter(entry => entry.calculatedTime === latestCalculatedTime)
        .map(entry => entry.batch);
    const calculatedAt = new Date(latestCalculatedTime).toISOString().slice(0, 10);
    if (currentBatches.some(batch => batch.shelveDescription.includes('退件'))) {
        return {
            dailyStorageFee: null,
            totalStorageFee: null,
            storageFeeStatus: 'return_rule_pending',
            storageFeeCalculatedAt: calculatedAt,
        };
    }
    if (currentBatches.some(batch => (batch.stockAgeVolume === null
        || !Number.isFinite(batch.stockAgeVolume)
        || batch.stockAgeVolume <= 0
        || !Number.isFinite(batch.stockAgeDay)
        || batch.stockAgeDay < 0))) {
        return {
            dailyStorageFee: null,
            totalStorageFee: null,
            storageFeeStatus: 'missing_product_specs',
            storageFeeCalculatedAt: calculatedAt,
        };
    }
    const daily = currentBatches.reduce((sum, batch) => sum + Number(batch.stockAgeVolume) * (0, exports.storageFeeRateForDay)(batch.stockAgeDay), 0);
    const total = currentBatches.reduce((sum, batch) => sum + Number(batch.stockAgeVolume) * (0, exports.cumulativeStorageFeeRate)(batch.stockAgeDay), 0);
    return {
        dailyStorageFee: roundMoney(daily, 4),
        totalStorageFee: roundMoney(total, 2),
        storageFeeStatus: 'ready',
        storageFeeCalculatedAt: calculatedAt,
    };
};
exports.calculateStockAgeStorageFee = calculateStockAgeStorageFee;
const buildDashboardWarehouseSnapshot = ({ now = new Date(), sites, stocks, sales, receipts, stockAges = [], unavailableStockAgeWarehouseCodes = [], }) => {
    const siteMap = new Map(sites.map(site => [site.code.toUpperCase(), site]));
    const salesMap = new Map();
    for (const sale of sales) {
        if (sale.statisticsDays !== 30)
            continue;
        const key = compositeKey(sale.site, sale.sku);
        salesMap.set(key, (salesMap.get(key) || 0) + finiteNonNegative(sale.validSales));
    }
    const receiptMap = new Map();
    for (const receipt of receipts) {
        const key = compositeKey(receipt.warehouseCode, receipt.sku);
        const batches = receiptMap.get(key) || [];
        batches.push({ quantity: finiteNonNegative(receipt.quantity), receivedAt: receipt.receivedAt });
        receiptMap.set(key, batches);
    }
    const stockMap = new Map();
    for (const stock of stocks) {
        const available = finiteNonNegative(stock.available);
        if (available <= 0)
            continue;
        const key = compositeKey(stock.site, stock.warehouseCode, stock.sku);
        const existing = stockMap.get(key);
        if (existing) {
            existing.available += available;
        }
        else {
            stockMap.set(key, { ...stock, available });
        }
    }
    const stockAgeMap = new Map();
    for (const batch of stockAges) {
        const key = compositeKey(batch.warehouseCode, batch.sku);
        const batches = stockAgeMap.get(key) || [];
        batches.push(batch);
        stockAgeMap.set(key, batches);
    }
    const unavailableStockAgeWarehouses = new Set(unavailableStockAgeWarehouseCodes.map(code => code.trim().toUpperCase()));
    const agingRows = [];
    const restockRows = [];
    let missingSalesCount = 0;
    let incompleteAgeCount = 0;
    const restockBySite = new Map();
    const slowBySite = new Map();
    const slowSkus = new Set();
    for (const stock of stockMap.values()) {
        const site = stock.site.toUpperCase();
        const saleKey = compositeKey(site, stock.sku);
        const hasSales = salesMap.has(saleKey);
        const validSales = salesMap.get(saleKey) || 0;
        const dailySales = validSales / 30;
        const availableDays = hasSales
            ? (dailySales === 0 ? Number.POSITIVE_INFINITY : stock.available / dailySales)
            : null;
        if (!hasSales)
            missingSalesCount += 1;
        const age = (0, exports.estimateFifoAgeDays)(stock.available, receiptMap.get(compositeKey(stock.warehouseCode, stock.sku)) || [], now);
        if (!age.complete)
            incompleteAgeCount += 1;
        if (age.complete && age.ageDays !== null && age.ageDays > 60) {
            const fee = unavailableStockAgeWarehouses.has(stock.warehouseCode.trim().toUpperCase())
                ? {
                    dailyStorageFee: null,
                    totalStorageFee: null,
                    storageFeeStatus: 'unavailable',
                    storageFeeCalculatedAt: null,
                }
                : (0, exports.calculateStockAgeStorageFee)(stockAgeMap.get(compositeKey(stock.warehouseCode, stock.sku)) || []);
            agingRows.push({
                name: stock.name,
                sku: stock.sku,
                warehouse: stock.warehouseName || stock.warehouseCode,
                warehouseCode: stock.warehouseCode,
                site,
                quantity: stock.available,
                inboundDays: age.ageDays,
                ...fee,
            });
            if (availableDays !== null && availableDays > 30) {
                slowBySite.set(site, (slowBySite.get(site) || 0) + stock.available);
                slowSkus.add(compositeKey(site, stock.warehouseCode, stock.sku));
            }
        }
        if (availableDays !== null && Number.isFinite(availableDays) && availableDays < 30) {
            const suggestedQty = Math.max(0, Math.ceil(dailySales * 30 - stock.available));
            restockRows.push({
                name: stock.name,
                sku: stock.sku,
                warehouse: stock.warehouseName || stock.warehouseCode,
                warehouseCode: stock.warehouseCode,
                site,
                quantity: stock.available,
                availableDays: Math.round(availableDays * 100) / 100,
                suggestedQty,
            });
            restockBySite.set(site, (restockBySite.get(site) || 0) + suggestedQty);
        }
    }
    const orderedSites = sites.map(site => ({
        ...site,
        code: site.code.toUpperCase(),
    }));
    const bySite = (source) => orderedSites.map(site => ({
        site: site.code,
        name: site.name,
        quantity: source.get(site.code) || 0,
    }));
    const restockSiteQuantities = bySite(restockBySite);
    const slowSiteQuantities = bySite(slowBySite);
    agingRows.sort((a, b) => b.inboundDays - a.inboundDays || a.sku.localeCompare(b.sku));
    restockRows.sort((a, b) => a.availableDays - b.availableDays || a.sku.localeCompare(b.sku));
    return {
        generatedAt: now.toISOString(),
        sites: orderedSites,
        summary: {
            restock: {
                totalQuantity: restockSiteQuantities.reduce((sum, item) => sum + item.quantity, 0),
                bySite: restockSiteQuantities,
            },
            slowMoving: {
                totalQuantity: slowSiteQuantities.reduce((sum, item) => sum + item.quantity, 0),
                skuCount: slowSkus.size,
                bySite: slowSiteQuantities,
            },
        },
        warnings: { missingSalesCount, incompleteAgeCount, unavailableSites: [] },
        agingRows,
        restockRows,
    };
};
exports.buildDashboardWarehouseSnapshot = buildDashboardWarehouseSnapshot;
const SORT_FIELDS = {
    aging: [
        'name',
        'sku',
        'site',
        'warehouse',
        'quantity',
        'inboundDays',
        'dailyStorageFee',
        'totalStorageFee',
    ],
    restock: ['name', 'sku', 'site', 'warehouse', 'quantity', 'availableDays'],
};
const paginateDashboardRows = (rows, options) => {
    const defaults = options.kind === 'aging'
        ? { field: 'inboundDays', direction: 'desc' }
        : { field: 'availableDays', direction: 'asc' };
    const isAllowed = SORT_FIELDS[options.kind].includes(String(options.sortBy || ''));
    const sortBy = isAllowed ? String(options.sortBy) : defaults.field;
    const sortDir = isAllowed && options.sortDir === 'desc'
        ? 'desc'
        : isAllowed && options.sortDir === 'asc'
            ? 'asc'
            : defaults.direction;
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(options.pageSize) || 20)));
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(totalPages, Math.max(1, Math.floor(Number(options.page) || 1)));
    const multiplier = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((left, right) => {
        const leftRecord = left;
        const rightRecord = right;
        const a = leftRecord[sortBy];
        const b = rightRecord[sortBy];
        if (options.kind === 'aging' && (sortBy === 'dailyStorageFee' || sortBy === 'totalStorageFee')) {
            const missingA = typeof a !== 'number' || !Number.isFinite(a);
            const missingB = typeof b !== 'number' || !Number.isFinite(b);
            if (missingA !== missingB)
                return missingA ? 1 : -1;
        }
        const numericA = typeof a === 'number' ? a : null;
        const numericB = typeof b === 'number' ? b : null;
        if (numericA !== null && numericB !== null && numericA !== numericB) {
            return (numericA - numericB) * multiplier;
        }
        const compared = String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN');
        if (compared !== 0)
            return compared * multiplier;
        return String(leftRecord.sku ?? '').localeCompare(String(rightRecord.sku ?? ''));
    });
    const start = (page - 1) * pageSize;
    return {
        items: sorted.slice(start, start + pageSize),
        page,
        pageSize,
        total: rows.length,
        totalPages,
        sortBy,
        sortDir,
    };
};
exports.paginateDashboardRows = paginateDashboardRows;
