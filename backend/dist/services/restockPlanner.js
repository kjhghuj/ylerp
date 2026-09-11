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
const MAX_STOCK_SIM_DAYS = 400;
const statusOrder = {
    critical: 0,
    warning: 1,
    no_stock_data: 2,
    missing_sales: 3,
    zero_sales: 4,
    healthy: 5,
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
            byWarehouse: new Map(),
        };
        const available = toRemoteNonNegativeSafeNumber(row.available, `available for SKU ${sku}`);
        const warehouseCode = String(row.warehouseCode || '').trim() || 'UNKNOWN';
        const warehouseEntry = previous.byWarehouse.get(warehouseCode) || {
            warehouseCode,
            warehouseName: row.warehouseName || null,
            available: 0,
        };
        warehouseEntry.available = safeAdd(warehouseEntry.available, available, `available for SKU ${sku} warehouse ${warehouseCode}`);
        previous.byWarehouse.set(warehouseCode, warehouseEntry);
        result.set(sku, {
            warehouseCode: previous.warehouseCode || row.warehouseCode || null,
            warehouseName: previous.warehouseName || row.warehouseName || null,
            // YC's `available` is authoritative. Do not derive it from inventory or combine it with local stock.
            availableStock: safeAdd(previous.availableStock, available, `available total for SKU ${sku}`),
            byWarehouse: previous.byWarehouse,
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
const inboundOrderKey = (order) => {
    const warehouseOrderNo = String(order.warehouseOrderNo || '').trim();
    if (warehouseOrderNo)
        return `wo:${warehouseOrderNo}`;
    const customerNo = String(order.customerWarehouseOrderNo || '').trim();
    if (customerNo)
        return `cw:${customerNo}`;
    // 无可靠单号：不猜测重复，返回 null（保守保留每一条）
    return null;
};
/**
 * 入库单 → 逐 SKU 在途条目。
 * 身份策略：订单级仅在有可靠单号（warehouseOrderNo / customerWarehouseOrderNo）时去重（防分页/跨仓重复）；
 * 明细级仅按接口明细身份 detailId 去重；无 detailId 一律保留（保守，不按内容猜测重复）。
 */
const buildInboundEntriesBySku = (orders) => {
    const result = new Map();
    const seenOrderKeys = new Set();
    for (const order of orders || []) {
        if (!isActiveInboundOrder(order))
            continue;
        const orderKey = inboundOrderKey(order);
        if (orderKey !== null) {
            if (seenOrderKeys.has(orderKey))
                continue;
            seenOrderKeys.add(orderKey);
        }
        const seenDetailIds = new Set();
        for (const detail of order.details || []) {
            const sku = normalizeSku(detail.customerSku) || normalizeSku(detail.productSku);
            if (!sku)
                continue;
            const quantity = toRemoteNonNegativeSafeNumber(detail.quantity, `quantity for SKU ${sku}`);
            const shiftNum = toRemoteNonNegativeSafeNumber(detail.shiftNum, `shiftNum for SKU ${sku}`);
            const remaining = Math.max(0, quantity - shiftNum);
            if (remaining <= 0)
                continue;
            const eta = parseOptionalEta(detail.estimatedArrivalDate || order.estimatedArrivalDate);
            const detailId = detail.detailId ?? null;
            if (detailId !== null && detailId !== undefined && String(detailId) !== '') {
                const detailKey = String(detailId);
                if (seenDetailIds.has(detailKey))
                    continue;
                seenDetailIds.add(detailKey);
            }
            const entries = result.get(sku) || [];
            entries.push({
                remaining,
                eta,
                orderNumber: order.warehouseOrderNo || order.customerWarehouseOrderNo || 'unknown',
                detailId,
            });
            result.set(sku, entries);
        }
    }
    return result;
};
const summarizeInbound = (sku, entries, planningDate, arrivalDate, targetDate, inboundEtaPolicy) => {
    const aggregate = {
        beforeArrival: 0,
        duringCoverage: 0,
        noEta: 0,
        overdue: 0,
        afterCoverage: 0,
        warnings: [],
        breakdown: [],
    };
    const addField = (field, entry) => {
        aggregate[field] = safeAdd(aggregate[field], entry.remaining, `inbound total for SKU ${sku}`);
    };
    for (const entry of entries || []) {
        if (!entry.eta) {
            if (inboundEtaPolicy === 'optimistic') {
                // V2 旧行为：无 ETA 乐观计入到仓前库存
                addField('beforeArrival', entry);
                aggregate.warnings.push(`Inbound order ${entry.orderNumber} for SKU ${sku} has no valid ETA; counted before arrival.`);
            }
            else {
                addField('noEta', entry);
                aggregate.warnings.push(`Inbound order ${entry.orderNumber} for SKU ${sku} has no valid ETA; excluded from confirmed supply.`);
            }
            aggregate.breakdown.push({
                orderNumber: entry.orderNumber,
                detailId: entry.detailId,
                remaining: entry.remaining,
                eta: null,
                category: 'noEta',
            });
            continue;
        }
        if (entry.eta.getTime() < planningDate.getTime()) {
            if (inboundEtaPolicy === 'optimistic') {
                // V2 旧行为：逾期 ETA 仍计入到仓前（eta ≤ arrivalDate 恒成立）
                addField('beforeArrival', entry);
            }
            else {
                addField('overdue', entry);
                aggregate.warnings.push(`Inbound order ${entry.orderNumber} for SKU ${sku} has an overdue ETA (${formatDateOnly(entry.eta)}); excluded from confirmed supply.`);
            }
            aggregate.breakdown.push({
                orderNumber: entry.orderNumber,
                detailId: entry.detailId,
                remaining: entry.remaining,
                eta: formatDateOnly(entry.eta),
                category: 'overdue',
            });
            continue;
        }
        // 在途可用口径：optimistic 为 [planning, target]（旧）；strict 与需求区间一致为 [planning, target)
        const coverageBoundaryInclusive = inboundEtaPolicy === 'optimistic';
        const withinCoverage = coverageBoundaryInclusive
            ? entry.eta.getTime() <= targetDate.getTime()
            : entry.eta.getTime() < targetDate.getTime();
        if (entry.eta.getTime() <= arrivalDate.getTime()) {
            addField('beforeArrival', entry);
            aggregate.breakdown.push({
                orderNumber: entry.orderNumber,
                detailId: entry.detailId,
                remaining: entry.remaining,
                eta: formatDateOnly(entry.eta),
                category: 'beforeArrival',
            });
        }
        else if (withinCoverage) {
            addField('duringCoverage', entry);
            aggregate.breakdown.push({
                orderNumber: entry.orderNumber,
                detailId: entry.detailId,
                remaining: entry.remaining,
                eta: formatDateOnly(entry.eta),
                category: 'duringCoverage',
            });
        }
        else {
            addField('afterCoverage', entry);
            aggregate.breakdown.push({
                orderNumber: entry.orderNumber,
                detailId: entry.detailId,
                remaining: entry.remaining,
                eta: formatDateOnly(entry.eta),
                category: 'afterCoverage',
            });
        }
    }
    return aggregate;
};
/**
 * 逐日库存模拟（丢失销量假设：断货日未满足需求直接损失，期末归零，不积压回补）。
 * 需求与到货区间为左闭右开 [planningDate, targetDate)：targetDate 当日的需求与到货不参与。
 * arrivals：strict 口径下无 ETA / 逾期在途不参与；到货在当日需求前入库。
 */
const runDailySimulation = (startStock, arrivalsByDate, dailyDemand, planningDateValue, arrivalDateValue, horizonDays, includeSim) => {
    let stock = startStock;
    let stockoutDate = null;
    let gapBeforeArrival = 0;
    let gapAfterArrival = 0;
    let endStock = startStock;
    const sim = [];
    for (let day = 0; day < horizonDays; day += 1) {
        const date = addDays(planningDateValue, day);
        const dateStr = formatDateOnly(date);
        const arrivals = arrivalsByDate.get(dateStr) ?? 0;
        const availableToday = stock + arrivals;
        let dayEndStock;
        let stockout = false;
        if (availableToday < dailyDemand) {
            stockout = true;
            if (stockoutDate === null)
                stockoutDate = dateStr;
            const unserved = dailyDemand - Math.max(0, availableToday);
            if (date.getTime() < arrivalDateValue.getTime())
                gapBeforeArrival += unserved;
            else
                gapAfterArrival += unserved;
            dayEndStock = 0;
        }
        else {
            dayEndStock = availableToday - dailyDemand;
        }
        if (includeSim) {
            sim.push({ date: dateStr, startStock: stock, arrivals, demand: dailyDemand, endStock: dayEndStock, stockout });
        }
        stock = dayEndStock;
        endStock = dayEndStock;
    }
    return { sim: includeSim ? sim : null, stockoutDate, gapBeforeArrival, gapAfterArrival, endStock };
};
const buildArrivalsByDate = (entries, planningDateValue, targetDateValue, inboundEtaPolicy, extraAtArrival, arrivalDateValue) => {
    const arrivalsByDate = new Map();
    for (const entry of entries || []) {
        if (!entry.eta)
            continue; // 无 ETA 无法定位到货日，不参与模拟
        if (inboundEtaPolicy === 'strict' && entry.eta.getTime() < planningDateValue.getTime())
            continue;
        if (entry.eta.getTime() > targetDateValue.getTime())
            continue;
        // 左闭右开：targetDate 当日到货不参与区间内需求
        if (entry.eta.getTime() >= targetDateValue.getTime())
            continue;
        const dateStr = formatDateOnly(entry.eta);
        arrivalsByDate.set(dateStr, (arrivalsByDate.get(dateStr) ?? 0) + entry.remaining);
    }
    if (extraAtArrival > 0 && arrivalDateValue.getTime() < targetDateValue.getTime()) {
        const arrivalStr = formatDateOnly(arrivalDateValue);
        arrivalsByDate.set(arrivalStr, (arrivalsByDate.get(arrivalStr) ?? 0) + extraAtArrival);
    }
    return arrivalsByDate;
};
const formatDays = (days) => {
    if (!Number.isFinite(days))
        return 0;
    return Math.round(days * 10) / 10;
};
const buildReason = (status, daysCover, leadTimeDays, suggestedQty) => {
    if (status === 'no_stock_data')
        return 'YC did not return a stock row for this SKU; quantity is not executable.';
    if (status === 'missing_sales')
        return 'Missing daily sales data';
    if (status === 'zero_sales')
        return 'Confirmed zero sales in the period; no replenishment needed.';
    if (status === 'critical') {
        return `Stock will run out before confirmed supply covers demand; ${suggestedQty} units cannot prevent the pre-arrival gap.`;
    }
    if (status === 'warning') {
        return `Below target cover; replenish ${suggestedQty} units to cover post-arrival gaps and the safety-stock target.`;
    }
    return 'Stock is above the target replenishment line.';
};
const buildRestockPlan = ({ site, products, inventoryItems, remoteStockRows, inboundOrders, planningDate, targetDate, leadTimeDays, safetyDays = 30, growthPercent = 0, skuRules = [], generatedAt = new Date().toISOString(), policies = {}, zeroSalesSkus = [], }) => {
    const missingStockPolicy = policies.missingStockPolicy ?? 'zero';
    const inboundEtaPolicy = policies.inboundEtaPolicy ?? 'optimistic';
    const simulateDaily = policies.simulateDaily ?? false;
    const quantityMode = policies.quantityMode ?? 'formula';
    const zeroSalesSet = new Set(zeroSalesSkus.map(sku => normalizeSku(sku)));
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
        const growthSource = rule?.growthPercent !== undefined ? 'sku-rule' : 'global';
        const adjustedDailySales = ensureSafeFinite(dailySales * (1 + itemGrowthPercent / 100), `adjustedDailySales for SKU ${product.sku}`);
        const itemSafetyDays = validateBoundedNumber(rule?.safetyDays ?? globalSafetyDays, `safetyDays for ${product.sku}`, 0, MAX_PLANNING_DAYS, true);
        const safetySource = rule?.safetyDays !== undefined ? 'sku-rule' : 'global';
        const inventoryLeadTime = toFiniteNumber(inventory?.leadTime, 25);
        const itemLeadTimeDays = validateBoundedNumber(rule?.leadTimeDays ?? globalLeadTime ?? inventoryLeadTime, `leadTimeDays for ${product.sku}`, 0, MAX_PLANNING_DAYS, true);
        const leadTimeSource = rule?.leadTimeDays !== undefined
            ? 'sku-rule'
            : globalLeadTime !== undefined
                ? 'global'
                : 'inventory';
        const arrivalDateValue = addDays(planningDateValue, itemLeadTimeDays);
        if (targetDateValue.getTime() <= arrivalDateValue.getTime()) {
            throw new RestockPlanValidationError(`targetDate must be after arrivalDate for SKU ${product.sku}`);
        }
        const coverageDays = differenceInDays(targetDateValue, arrivalDateValue);
        if (coverageDays > MAX_PLANNING_DAYS) {
            throw new RestockPlanValidationError(`coverageDays exceeds ${MAX_PLANNING_DAYS} for SKU ${product.sku}`);
        }
        const inbound = summarizeInbound(skuKey, inboundEntriesBySku.get(skuKey), planningDateValue, arrivalDateValue, targetDateValue, inboundEtaPolicy);
        const hasRemoteRow = remoteStock !== undefined;
        const stockUnknown = missingStockPolicy === 'unknown' && !hasRemoteRow;
        const availableStock = remoteStock?.availableStock || 0;
        const stockSource = hasRemoteRow ? 'yc' : 'missing';
        const transportDemand = ensureSafeFinite(adjustedDailySales * itemLeadTimeDays, `transportDemand for SKU ${product.sku}`);
        const stockBeforeTransportDemand = safeAdd(availableStock, inbound.beforeArrival, `arrival stock for SKU ${product.sku}`);
        const coverageDemand = ensureSafeFinite(adjustedDailySales * coverageDays, `coverageDemand for SKU ${product.sku}`);
        const safetyStockDemand = ensureSafeFinite(adjustedDailySales * itemSafetyDays, `safetyStockDemand for SKU ${product.sku}`);
        const targetDemand = safeAdd(coverageDemand, safetyStockDemand, `targetDemand for SKU ${product.sku}`);
        const useSimulation = quantityMode === 'simulation' && simulateDaily;
        let baseline = {
            sim: null, stockoutDate: null, gapBeforeArrival: 0, gapAfterArrival: 0, endStock: 0,
        };
        let suggested = baseline;
        let suggestedQty = 0;
        let arrivalStock = 0;
        let endSafetyGap = 0;
        let baselineEndSafetyGap = 0;
        let suggestedQtyRaw = null;
        if (useSimulation) {
            // 基线轨迹（不新增补货）：U=到仓后缺口、E0=期末库存
            baseline = runDailySimulation(availableStock, buildArrivalsByDate(inboundEntriesBySku.get(skuKey), planningDateValue, targetDateValue, inboundEtaPolicy, 0, arrivalDateValue), adjustedDailySales, planningDateValue, arrivalDateValue, planningHorizonDays, planningHorizonDays <= MAX_STOCK_SIM_DAYS);
            // 建议量 = 到仓后缺口 + max(0, 安全库存目标 − 基线期末)，向上取整。
            // 等式分项原样输出（gapAfterArrival / baselineEndSafetyGap / suggestedQtyRaw），
            // 展示层不得用「建议量 − 缺口」反推凑数。
            baselineEndSafetyGap = Math.max(0, safetyStockDemand - baseline.endStock);
            const rawSuggested = baseline.gapAfterArrival + baselineEndSafetyGap;
            suggestedQtyRaw = ensureSafeFinite(rawSuggested, `suggestedQtyRaw for SKU ${product.sku}`);
            suggestedQty = stockUnknown ? 0 : (dailySales > 0 ? Math.max(0, Math.ceil(suggestedQtyRaw)) : 0);
            suggested = runDailySimulation(availableStock, buildArrivalsByDate(inboundEntriesBySku.get(skuKey), planningDateValue, targetDateValue, inboundEtaPolicy, suggestedQty, arrivalDateValue), adjustedDailySales, planningDateValue, arrivalDateValue, planningHorizonDays, planningHorizonDays <= MAX_STOCK_SIM_DAYS);
            // 到仓库存与模拟一致：采用建议量后到仓当日期末库存
            const arrivalPoint = suggested.sim?.find(point => point.date === formatDateOnly(arrivalDateValue));
            arrivalStock = arrivalPoint ? arrivalPoint.endStock : suggested.endStock;
            endSafetyGap = Math.max(0, safetyStockDemand - suggested.endStock);
        }
        else {
            const rawSuggestedQty = ensureSafeFinite(targetDemand - Math.max(0, stockBeforeTransportDemand - transportDemand) - inbound.duringCoverage, `suggestedQty for SKU ${product.sku}`);
            // 元仓未返回库存行（unknown 口径）：数量不可执行，待核对，不计入建议统计
            suggestedQty = stockUnknown ? 0 : (dailySales > 0 ? Math.max(0, Math.ceil(rawSuggestedQty)) : 0);
            arrivalStock = Math.max(0, stockBeforeTransportDemand - transportDemand);
            if (simulateDaily) {
                // V2 兼容：仅展示单轨迹（不补货），保持旧字段语义
                baseline = runDailySimulation(availableStock, buildArrivalsByDate(inboundEntriesBySku.get(skuKey), planningDateValue, targetDateValue, inboundEtaPolicy, 0, arrivalDateValue), adjustedDailySales, planningDateValue, arrivalDateValue, planningHorizonDays, planningHorizonDays <= MAX_STOCK_SIM_DAYS);
                suggested = baseline;
            }
        }
        if (!Number.isSafeInteger(suggestedQty)) {
            throw new RestockSourceDataError(`suggestedQty exceeds the safe integer range for SKU ${product.sku}`);
        }
        const daysCover = adjustedDailySales > 0 ? formatDays(availableStock / adjustedDailySales) : 0;
        const isZeroSales = dailySales <= 0 && zeroSalesSet.has(skuKey);
        const stockoutAfterSuggestion = useSimulation ? suggested.stockoutDate : null;
        const status = stockUnknown
            ? 'no_stock_data'
            : dailySales <= 0
                ? (isZeroSales ? 'zero_sales' : 'missing_sales')
                : useSimulation
                    ? (stockoutAfterSuggestion !== null
                        ? 'critical'
                        : suggestedQty > 0
                            ? 'warning'
                            : 'healthy')
                    : stockBeforeTransportDemand < transportDemand
                        ? 'critical'
                        : suggestedQty > 0
                            ? 'warning'
                            : 'healthy';
        const executable = status !== 'no_stock_data' && status !== 'missing_sales' && status !== 'zero_sales';
        // 成本优先级与旧口径一致：库存成本 → 商品成本；两者皆无效 → 未知（不显示为零成本）
        const inventoryCost = inventory !== undefined && Number.isFinite(inventory.costPerUnit)
            ? inventory.costPerUnit
            : null;
        const productCost = typeof product.cost === 'number' && Number.isFinite(product.cost)
            ? product.cost
            : null;
        const unitCost = inventoryCost ?? productCost;
        const costUnknown = unitCost === null;
        const warnings = [...inbound.warnings];
        if (stockUnknown) {
            warnings.push(`YC returned no stock row for SKU ${product.sku}; available stock is unknown.`);
        }
        const displaySim = useSimulation ? suggested.sim : baseline.sim;
        const displayStockoutDate = useSimulation ? suggested.stockoutDate : baseline.stockoutDate;
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
            inTransitNoEta: inbound.noEta,
            inTransitOverdue: inbound.overdue,
            inTransitAfterCoverage: inbound.afterCoverage,
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
            estimatedCost: costUnknown ? null : suggestedQty * unitCost,
            costUnknown,
            status,
            reason: buildReason(status, daysCover, itemLeadTimeDays, suggestedQty),
            stockSource,
            warnings,
            stockByWarehouse: remoteStock
                ? Array.from(remoteStock.byWarehouse.values()).sort((left, right) => left.warehouseCode.localeCompare(right.warehouseCode))
                : [],
            inboundBreakdown: inbound.breakdown,
            stockSim: displaySim,
            baselineStockSim: useSimulation ? baseline.sim : null,
            stockoutDate: displayStockoutDate,
            baselineStockoutDate: useSimulation ? baseline.stockoutDate : null,
            gapBeforeArrival: useSimulation ? suggested.gapBeforeArrival : baseline.gapBeforeArrival,
            gapAfterArrival: useSimulation ? baseline.gapAfterArrival : 0,
            baselineEndSafetyGap: useSimulation ? baselineEndSafetyGap : 0,
            endSafetyGap: useSimulation ? endSafetyGap : 0,
            suggestedQtyRaw,
            executable,
            ruleSources: {
                leadTimeDays: leadTimeSource,
                safetyDays: safetySource,
                growthPercent: growthSource,
            },
            reviewReason: stockUnknown
                ? 'YC returned no stock row for this SKU; confirm the SKU exists in YC warehouses.'
                : null,
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
        if (item.status === 'zero_sales')
            acc.zeroSalesCount += 1;
        if (item.status === 'no_stock_data')
            acc.noStockDataCount += 1;
        acc.totalSuggestedQty += item.suggestedQty;
        if (item.estimatedCost !== null) {
            acc.estimatedCost += item.estimatedCost;
            acc.estimatedCostKnownSkus += 1;
        }
        return acc;
    }, {
        totalProducts: 0,
        restockCount: 0,
        criticalCount: 0,
        warningCount: 0,
        healthyCount: 0,
        missingSalesCount: 0,
        zeroSalesCount: 0,
        noStockDataCount: 0,
        totalSuggestedQty: 0,
        estimatedCost: 0,
        estimatedCostKnownSkus: 0,
    });
    return {
        site: normalizedSite,
        generatedAt,
        summary,
        items,
    };
};
exports.buildRestockPlan = buildRestockPlan;
