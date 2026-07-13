"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTargetSalesAggregates = exports.aggregateSalesImportRows = exports.normalizeRestockSku = exports.SalesImportValidationError = exports.MAX_SHOP_LENGTH = exports.MAX_SPEC_LENGTH = exports.MAX_TITLE_LENGTH = exports.MAX_SKU_LENGTH = exports.MAX_SALES_VALUE = exports.MAX_SALES_IMPORT_ROWS = void 0;
exports.MAX_SALES_IMPORT_ROWS = 10_000;
exports.MAX_SALES_VALUE = 1_000_000_000;
exports.MAX_SKU_LENGTH = 200;
exports.MAX_TITLE_LENGTH = 500;
exports.MAX_SPEC_LENGTH = 500;
exports.MAX_SHOP_LENGTH = 200;
class SalesImportValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SalesImportValidationError';
    }
}
exports.SalesImportValidationError = SalesImportValidationError;
const normalizeRestockSku = (value) => {
    if (value === null || value === undefined)
        return '';
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new SalesImportValidationError('SKU must be a string or number');
    }
    return String(value).replace(/\t/g, '').trim().toUpperCase();
};
exports.normalizeRestockSku = normalizeRestockSku;
const readOptionalString = (value, field, maxLength) => {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new SalesImportValidationError(`${field} must be a string or number`);
    }
    const normalized = String(value).trim();
    if (normalized.length > maxLength)
        throw new SalesImportValidationError(`${field} exceeds ${maxLength} characters`);
    return normalized || null;
};
const readSku = (value, field) => {
    const normalized = (0, exports.normalizeRestockSku)(value);
    if (normalized.length > exports.MAX_SKU_LENGTH) {
        throw new SalesImportValidationError(`${field} exceeds ${exports.MAX_SKU_LENGTH} characters`);
    }
    return normalized || null;
};
const readValidSales = (value) => {
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        throw new SalesImportValidationError('validSales must be a finite non-negative number');
    }
    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new SalesImportValidationError('validSales must be a finite non-negative number');
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > exports.MAX_SALES_VALUE) {
        throw new SalesImportValidationError(`validSales must be between 0 and ${exports.MAX_SALES_VALUE}`);
    }
    return parsed;
};
const normalizeReusableMappings = (mappings) => {
    const normalized = new Map();
    for (const [externalSku, targetSku] of mappings.entries()) {
        const externalKey = readSku(externalSku, 'externalSku');
        const targetKey = readSku(targetSku, 'targetSku');
        if (externalKey && targetKey)
            normalized.set(externalKey, targetKey);
    }
    return normalized;
};
const aggregateSalesImportRows = (rows, reusableMappings = new Map()) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new SalesImportValidationError('rows must contain at least one item');
    }
    if (rows.length > exports.MAX_SALES_IMPORT_ROWS) {
        throw new SalesImportValidationError(`rows exceeds ${exports.MAX_SALES_IMPORT_ROWS}`);
    }
    const mappings = normalizeReusableMappings(reusableMappings);
    const grouped = new Map();
    const pendingWithoutPlatformSku = [];
    rows.forEach((rawRow, index) => {
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
            throw new SalesImportValidationError(`rows[${index}] must be an object`);
        }
        const row = rawRow;
        const platformSku = readSku(row.platformSku, `rows[${index}].platformSku`);
        const sourceSku = readSku(row.sourceSku, `rows[${index}].sourceSku`);
        const validSales = readValidSales(row.validSales);
        const item = {
            platformSku,
            sourceSku,
            validSales,
            title: readOptionalString(row.title, `rows[${index}].title`, exports.MAX_TITLE_LENGTH),
            spec: readOptionalString(row.spec, `rows[${index}].spec`, exports.MAX_SPEC_LENGTH),
            shop: readOptionalString(row.shop, `rows[${index}].shop`, exports.MAX_SHOP_LENGTH),
            targetSku: platformSku ? mappings.get(platformSku) || null : null,
        };
        if (!platformSku) {
            pendingWithoutPlatformSku.push(item);
            return;
        }
        const previous = grouped.get(platformSku);
        if (!previous) {
            grouped.set(platformSku, item);
            return;
        }
        const nextSales = previous.validSales + validSales;
        if (!Number.isFinite(nextSales) || nextSales > exports.MAX_SALES_VALUE) {
            throw new SalesImportValidationError(`aggregated validSales for ${platformSku} exceeds ${exports.MAX_SALES_VALUE}`);
        }
        previous.validSales = nextSales;
        previous.sourceSku ||= sourceSku;
        previous.title ||= item.title;
        previous.spec ||= item.spec;
        previous.shop ||= item.shop;
    });
    return [...pendingWithoutPlatformSku, ...grouped.values()];
};
exports.aggregateSalesImportRows = aggregateSalesImportRows;
const buildTargetSalesAggregates = (items) => {
    const grouped = new Map();
    for (const item of items) {
        const targetSku = readSku(item.targetSku, 'targetSku');
        if (!targetSku)
            continue;
        const validSales = readValidSales(item.validSales);
        const previous = grouped.get(targetSku) || { targetSku, validSales: 0, itemIds: [] };
        const nextSales = previous.validSales + validSales;
        if (!Number.isFinite(nextSales) || nextSales > exports.MAX_SALES_VALUE) {
            throw new SalesImportValidationError(`aggregated validSales for ${targetSku} exceeds ${exports.MAX_SALES_VALUE}`);
        }
        previous.validSales = nextSales;
        previous.itemIds.push(item.id);
        grouped.set(targetSku, previous);
    }
    return Array.from(grouped.values()).sort((a, b) => a.targetSku.localeCompare(b.targetSku));
};
exports.buildTargetSalesAggregates = buildTargetSalesAggregates;
