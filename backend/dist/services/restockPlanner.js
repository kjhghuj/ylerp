"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRestockPlan = exports.RestockSourceDataError = exports.RestockPlanValidationError = void 0;
class RestockPlanValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RestockPlanValidationError';
    }
}
exports.RestockPlanValidationError = RestockPlanValidationError;
class RestockSourceDataError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RestockSourceDataError';
    }
}
exports.RestockSourceDataError = RestockSourceDataError;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PLANNING_DAYS = 3650;
const MAX_GROWTH_PERCENT = 1000;
const ACTIVE_INBOUND_STATUSES = new Set([2, 3]);
const statusOrder = {
    critical: 0,
    warning: 1,
    missing_sales: 2,
    healthy: 3,
};
const normalizeSite = (site) => site.trim().toUpperCase();
const normalizeSku = (sku) => (sku || '').trim().toUpperCase();
const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'string' && value.trim() === '')
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toRemoteNonNegativeSafeNumber = (value, field) => {
    if (typeof value === 'string' && value.trim() === '') {
        throw new RestockSourceDataError(`${field} must be a finite non-negative safe number`);
    }
    if (value === null || value === undefined || (typeof value !== 'number' && typeof value !== 'string')) {
        throw new RestockSourceDataError(`${field} must be a finite non-negative safe number`);
    }
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        throw new RestockSourceDataError(`${field} must be a finite non-negative safe number`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
        throw new RestockSourceDataError(`${field} must be a finite non-negative safe number`);
    }
    return parsed;
};
const ensureSafeFinite = (value, field) => {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
        throw new RestockSourceDataError(`${field} exceeds the safe numeric range`);
    }
    return value;
};
const safeAdd = (left, right, field) => {
    return ensureSafeFinite(left + right, field);
};
const validateBoundedNumber = (value, field, minimum, maximum, integer = false) => {
    if (typeof value === 'string' && value.trim() === '') {
        throw new RestockPlanValidationError(`${field} must be a number`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
        throw new RestockPlanValidationError(`${field} must be ${integer ? 'an integer ' : ''}between ${minimum} and ${maximum}`);
    }
    return parsed;
};
const parseDateOnly = (value, field) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new RestockPlanValidationError(`${field} must be a valid YYYY-MM-DD date`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new RestockPlanValidationError(`${field} must be a valid YYYY-MM-DD date`);
    }
    return date;
};
const dateOnlyFromTimestamp = (value, field) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
        throw new RestockPlanValidationError(`${field} must be a valid date`);
    return date.toISOString().slice(0, 10);
};
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const formatDateOnly = (date) => date.toISOString().slice(0, 10);
const differenceInDays = (later, earlier) => Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
const hasSiteData = (siteData, site) => {
    if (!siteData || typeof siteData !== 'object')
        return false;
    return Object.prototype.hasOwnProperty.call(siteData, site);
};
const productBelongsToSite = (product, site) => {
    const productSites = (product.sites || []).map(normalizeSite);
    if (productSites.includes(site))
        return true;
    if (product.country && normalizeSite(product.country) === site)
        return true;
    return hasSiteData(product.siteData, site);
};
const buildRemoteStockMap = (rows, site) => {
    const result = new Map();
    for (const row of rows || []) {
        const sku = normalizeSku(row.customerSku);
        if (!sku)
            continue;
        if (row.siteCode && normalizeSite(row.siteCode) !== site)
            continue;
        const previous = result.get(sku) || {
            warehouseCode: null,
            warehouseName: null,
            availableStock: 0,
        };
        result.set(sku, {
            warehouseCode: previous.warehouseCode || row.warehouseCode || null,
            warehouseName: previous.warehouseName || row.warehouseName || null,
            // YC's `available` is authoritative. Do not derive it from inventory or combine it with local stock.
            availableStock: safeAdd(previous.availableStock, toRemoteNonNegativeSafeNumber(row.available, `available for SKU ${sku}`), `available total for SKU ${sku}`),
        });
    }
    return result;
};
const isActiveInboundOrder = (order) => {
    const status = Number(order.status);
    return Number.isInteger(status) && ACTIVE_INBOUND_STATUSES.has(status);
};
const parseOptionalEta = (value) => {
    if (value === null || value === undefined)
        return null;
    if (typeof value !== 'string') {
        throw new RestockSourceDataError('estimatedArrivalDate must be a valid YYYY-MM-DD date');
    }
    if (value.trim() === '')
        return null;
    try {
        return parseDateOnly(value.trim(), 'estimatedArrivalDate');
    }
    catch (error) {
        throw new RestockSourceDataError(error instanceof Error ? error.message : 'estimatedArrivalDate is invalid');
    }
};
const buildInboundEntriesBySku = (orders) => {
    const result = new Map();
    for (const order of orders || []) {
        if (!isActiveInboundOrder(order))
            continue;
        for (const detail of order.details || []) {
            const sku = normalizeSku(detail.customerSku) || normalizeSku(detail.productSku);
            if (!sku)
                continue;
            const quantity = toRemoteNonNegativeSafeNumber(detail.quantity, `quantity for SKU ${sku}`);
            const shiftNum = toRemoteNonNegativeSafeNumber(detail.shiftNum, `shiftNum for SKU ${sku}`);
            const remaining = Math.max(0, quantity - shiftNum);
            if (remaining <= 0)
                continue;
            const entries = result.get(sku) || [];
            entries.push({
                remaining,
                eta: parseOptionalEta(detail.estimatedArrivalDate || order.estimatedArrivalDate),
                orderNumber: order.warehouseOrderNo || order.customerWarehouseOrderNo || 'unknown',
            });
            result.set(sku, entries);
        }
    }
    return result;
};
const summarizeInbound = (sku, entries, arrivalDate, targetDate) => {
    const aggregate = { beforeArrival: 0, duringCoverage: 0, warnings: [] };
    for (const entry of entries || []) {
        if (!entry.eta) {
            aggregate.beforeArrival = safeAdd(aggregate.beforeArrival, entry.remaining, `inbound total for SKU ${sku}`);
            aggregate.warnings.push(`Inbound order ${entry.orderNumber} for SKU ${sku} has no valid ETA; counted before arrival.`);
        }
        else if (entry.eta.getTime() <= arrivalDate.getTime()) {
            aggregate.beforeArrival = safeAdd(aggregate.beforeArrival, entry.remaining, `inbound total for SKU ${sku}`);
        }
        else if (entry.eta.getTime() <= targetDate.getTime()) {
            aggregate.duringCoverage = safeAdd(aggregate.duringCoverage, entry.remaining, `inbound total for SKU ${sku}`);
        }
    }
    return aggregate;
};
const formatDays = (days) => {
    if (!Number.isFinite(days))
        return 0;
    return Math.round(days * 10) / 10;
};
const buildReason = (status, daysCover, leadTimeDays, suggestedQty) => {
    if (status === 'missing_sales')
        return 'Missing daily sales data';
    if (status === 'critical') {
        return `Current and arriving stock will sell out within the ${leadTimeDays}-day lead time.`;
    }
    if (status === 'warning') {
        return `Below target cover; replenish ${suggestedQty} units for the arrival-to-target period and safety stock.`;
    }
    return 'Stock is above the target replenishment line.';
};
const buildRestockPlan = ({ site, products, inventoryItems, remoteStockRows, inboundOrders, planningDate, targetDate, leadTimeDays, safetyDays = 30, growthPercent = 0, skuRules = [], generatedAt = new Date().toISOString(), }) => {
    const normalizedSite = normalizeSite(site);
    const resolvedPlanningDate = planningDate || dateOnlyFromTimestamp(generatedAt, 'generatedAt');
    const planningDateValue = parseDateOnly(resolvedPlanningDate, 'planningDate');
    if (!targetDate)
        throw new RestockPlanValidationError('targetDate is required');
    const targetDateValue = parseDateOnly(targetDate, 'targetDate');
    const planningHorizonDays = differenceInDays(targetDateValue, planningDateValue);
    if (planningHorizonDays <= 0 || planningHorizonDays > MAX_PLANNING_DAYS) {
        throw new RestockPlanValidationError(`targetDate must be within ${MAX_PLANNING_DAYS} days after planningDate`);
    }
    const globalLeadTime = leadTimeDays === undefined
        ? undefined
        : validateBoundedNumber(leadTimeDays, 'leadTimeDays', 0, MAX_PLANNING_DAYS, true);
    const globalSafetyDays = validateBoundedNumber(safetyDays, 'safetyDays', 0, MAX_PLANNING_DAYS, true);
    const globalGrowthPercent = validateBoundedNumber(growthPercent, 'growthPercent', 0, MAX_GROWTH_PERCENT);
    const inventoryBySku = new Map(inventoryItems.map(item => [normalizeSku(item.sku), item]));
    const remoteStockBySku = buildRemoteStockMap(remoteStockRows, normalizedSite);
    const inboundEntriesBySku = buildInboundEntriesBySku(inboundOrders);
    const rulesBySku = new Map(skuRules.map(rule => [normalizeSku(rule.sku), rule]));
    const items = products
        .filter(product => productBelongsToSite(product, normalizedSite))
        .map((product) => {
        const skuKey = normalizeSku(product.sku);
        const inventory = inventoryBySku.get(skuKey);
        const remoteStock = remoteStockBySku.get(skuKey);
        const rule = rulesBySku.get(skuKey);
        const dailySales = Math.max(0, toFiniteNumber(inventory?.dailySales));
        const itemGrowthPercent = validateBoundedNumber(rule?.growthPercent ?? globalGrowthPercent, `growthPercent for ${product.sku}`, 0, MAX_GROWTH_PERCENT);
        const adjustedDailySales = ensureSafeFinite(dailySales * (1 + itemGrowthPercent / 100), `adjustedDailySales for SKU ${product.sku}`);
        const itemSafetyDays = validateBoundedNumber(rule?.safetyDays ?? globalSafetyDays, `safetyDays for ${product.sku}`, 0, MAX_PLANNING_DAYS, true);
        const inventoryLeadTime = toFiniteNumber(inventory?.leadTime, 25);
        const itemLeadTimeDays = validateBoundedNumber(rule?.leadTimeDays ?? globalLeadTime ?? inventoryLeadTime, `leadTimeDays for ${product.sku}`, 0, MAX_PLANNING_DAYS, true);
        const arrivalDateValue = addDays(planningDateValue, itemLeadTimeDays);
        if (targetDateValue.getTime() <= arrivalDateValue.getTime()) {
            throw new RestockPlanValidationError(`targetDate must be after arrivalDate for SKU ${product.sku}`);
        }
        const coverageDays = differenceInDays(targetDateValue, arrivalDateValue);
        if (coverageDays > MAX_PLANNING_DAYS) {
            throw new RestockPlanValidationError(`coverageDays exceeds ${MAX_PLANNING_DAYS} for SKU ${product.sku}`);
        }
        const inbound = summarizeInbound(skuKey, inboundEntriesBySku.get(skuKey), arrivalDateValue, targetDateValue);
        const availableStock = remoteStock?.availableStock || 0;
        const stockSource = remoteStock ? 'yc' : 'missing';
        const transportDemand = ensureSafeFinite(adjustedDailySales * itemLeadTimeDays, `transportDemand for SKU ${product.sku}`);
        const stockBeforeTransportDemand = safeAdd(availableStock, inbound.beforeArrival, `arrival stock for SKU ${product.sku}`);
        const arrivalStock = Math.max(0, stockBeforeTransportDemand - transportDemand);
        const coverageDemand = ensureSafeFinite(adjustedDailySales * coverageDays, `coverageDemand for SKU ${product.sku}`);
        const safetyStockDemand = ensureSafeFinite(adjustedDailySales * itemSafetyDays, `safetyStockDemand for SKU ${product.sku}`);
        const targetDemand = safeAdd(coverageDemand, safetyStockDemand, `targetDemand for SKU ${product.sku}`);
        const rawSuggestedQty = ensureSafeFinite(targetDemand - arrivalStock - inbound.duringCoverage, `suggestedQty for SKU ${product.sku}`);
        const suggestedQty = dailySales > 0 ? Math.max(0, Math.ceil(rawSuggestedQty)) : 0;
        if (!Number.isSafeInteger(suggestedQty)) {
            throw new RestockSourceDataError(`suggestedQty exceeds the safe integer range for SKU ${product.sku}`);
        }
        const daysCover = adjustedDailySales > 0 ? formatDays(availableStock / adjustedDailySales) : 0;
        const status = adjustedDailySales <= 0
            ? 'missing_sales'
            : stockBeforeTransportDemand < transportDemand
                ? 'critical'
                : suggestedQty > 0
                    ? 'warning'
                    : 'healthy';
        const unitCost = toFiniteNumber(inventory?.costPerUnit, toFiniteNumber(product.cost));
        return {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            site: normalizedSite,
            warehouseCode: remoteStock?.warehouseCode || null,
            warehouseName: remoteStock?.warehouseName || null,
            dailySales,
            adjustedDailySales,
            growthPercent: itemGrowthPercent,
            availableStock,
            inTransit: inbound.beforeArrival + inbound.duringCoverage,
            inTransitBeforeArrival: inbound.beforeArrival,
            inTransitDuringCoverage: inbound.duringCoverage,
            daysCover,
            planningDate: resolvedPlanningDate,
            arrivalDate: formatDateOnly(arrivalDateValue),
            targetDate: formatDateOnly(targetDateValue),
            leadTimeDays: itemLeadTimeDays,
            replenishCycleDays: coverageDays,
            coverageDays,
            safetyDays: itemSafetyDays,
            targetCoverDays: coverageDays + itemSafetyDays,
            transportDemand,
            arrivalStock,
            coverageDemand,
            safetyStockDemand,
            reorderPoint: Math.ceil(transportDemand),
            suggestedQty,
            estimatedCost: suggestedQty * unitCost,
            status,
            reason: buildReason(status, daysCover, itemLeadTimeDays, suggestedQty),
            stockSource,
            warnings: inbound.warnings,
        };
    })
        .sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0)
            return statusDiff;
        if (b.suggestedQty !== a.suggestedQty)
            return b.suggestedQty - a.suggestedQty;
        return a.name.localeCompare(b.name);
    });
    const summary = items.reduce((acc, item) => {
        acc.totalProducts += 1;
        if (item.suggestedQty > 0)
            acc.restockCount += 1;
        if (item.status === 'critical')
            acc.criticalCount += 1;
        if (item.status === 'warning')
            acc.warningCount += 1;
        if (item.status === 'healthy')
            acc.healthyCount += 1;
        if (item.status === 'missing_sales')
            acc.missingSalesCount += 1;
        acc.totalSuggestedQty += item.suggestedQty;
        acc.estimatedCost += item.estimatedCost;
        return acc;
    }, {
        totalProducts: 0,
        restockCount: 0,
        criticalCount: 0,
        warningCount: 0,
        healthyCount: 0,
        missingSalesCount: 0,
        totalSuggestedQty: 0,
        estimatedCost: 0,
    });
    return {
        site: normalizedSite,
        generatedAt,
        summary,
        items,
    };
};
exports.buildRestockPlan = buildRestockPlan;
