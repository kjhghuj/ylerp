"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductTaxRateBackfill = exports.parseOptionalProductTaxRates = exports.parseFiniteDecimalTaxRate = exports.ProductTaxRateValidationError = exports.DEFAULT_PRODUCT_TAX_RATES = void 0;
exports.DEFAULT_PRODUCT_TAX_RATES = Object.freeze({
    vatRate: 1,
    corporateIncomeTaxRate: 5,
});
class ProductTaxRateValidationError extends Error {
    field;
    constructor(field) {
        super(`Invalid product tax rate: ${field}`);
        this.field = field;
        this.name = 'ProductTaxRateValidationError';
    }
}
exports.ProductTaxRateValidationError = ProductTaxRateValidationError;
const hasOwn = (value, key) => (Object.prototype.hasOwnProperty.call(value, key));
const COMMON_ASCII_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
const FINITE_DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const trimCommonAsciiWhitespace = (value) => (value.replace(COMMON_ASCII_WHITESPACE, ''));
const parseFiniteDecimalTaxRate = (value) => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return undefined;
        return value === 0 ? 0 : value;
    }
    if (typeof value !== 'string')
        return undefined;
    const normalized = trimCommonAsciiWhitespace(value);
    if (!normalized || !FINITE_DECIMAL_PATTERN.test(normalized))
        return undefined;
    const significand = normalized.toLowerCase().split('e', 1)[0];
    if (!/[1-9]/.test(significand))
        return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
};
exports.parseFiniteDecimalTaxRate = parseFiniteDecimalTaxRate;
const parseOptionalProductTaxRates = (source) => {
    const result = {};
    for (const field of Object.keys(exports.DEFAULT_PRODUCT_TAX_RATES)) {
        if (!hasOwn(source, field))
            continue;
        const parsed = (0, exports.parseFiniteDecimalTaxRate)(source[field]);
        if (parsed === undefined)
            throw new ProductTaxRateValidationError(field);
        result[field] = parsed;
    }
    return result;
};
exports.parseOptionalProductTaxRates = parseOptionalProductTaxRates;
const COUNTRY_TO_CURRENCY = {
    SG: 'SGD',
    MY: 'MYR',
    PH: 'PHP',
    TH: 'THB',
    ID: 'IDR',
    CN: 'CNY',
};
const normalizeSite = (value) => {
    const normalized = value
        ? trimCommonAsciiWhitespace(value).toUpperCase()
        : '';
    return COUNTRY_TO_CURRENCY[normalized] || normalized;
};
const toTimestamp = (value) => {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const templateSitePriority = (product, template) => {
    const templateSite = normalizeSite(template.country);
    if (templateSite && templateSite === normalizeSite(product.country))
        return 0;
    const productSites = product.sites || [];
    return productSites.some(site => normalizeSite(site) === templateSite) ? 1 : 2;
};
const isRecord = (value) => (typeof value === 'object' && value !== null && !Array.isArray(value));
const readTemplateTaxRate = (template, field) => (isRecord(template.data) ? (0, exports.parseFiniteDecimalTaxRate)(template.data[field]) : undefined);
const resolveProductTaxRateBackfill = (product, templates) => {
    const ordered = [...templates].sort((left, right) => (templateSitePriority(product, left) - templateSitePriority(product, right) ||
        toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt) ||
        toTimestamp(right.createdAt) - toTimestamp(left.createdAt) ||
        left.id.localeCompare(right.id)));
    const resolveField = (field) => {
        const canonical = product[field];
        if (canonical !== undefined && canonical !== null)
            return canonical;
        for (const template of ordered) {
            const candidate = readTemplateTaxRate(template, field);
            if (candidate !== undefined)
                return candidate;
        }
        return exports.DEFAULT_PRODUCT_TAX_RATES[field];
    };
    return {
        vatRate: resolveField('vatRate'),
        corporateIncomeTaxRate: resolveField('corporateIncomeTaxRate'),
    };
};
exports.resolveProductTaxRateBackfill = resolveProductTaxRateBackfill;
