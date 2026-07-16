import type { ProductCalcData } from '../types';

export const DEFAULT_PRODUCT_TAX_RATES = Object.freeze({
    vatRate: 1,
    corporateIncomeTaxRate: 5,
});

export type ProductTaxRateField = keyof typeof DEFAULT_PRODUCT_TAX_RATES;
type ProductTaxRateSource = Partial<Pick<ProductCalcData, ProductTaxRateField>>;
export type LegacyProductTaxRateCandidate =
    Partial<Record<ProductTaxRateField, number>>;

const hasOwn = (value: object, key: PropertyKey): boolean => (
    Object.prototype.hasOwnProperty.call(value, key)
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const COMMON_ASCII_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
const FINITE_DECIMAL_PATTERN =
    /^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$/;

const toValidTaxRate = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return undefined;
        return value === 0 ? 0 : value;
    }
    if (typeof value !== 'string') return undefined;

    const normalized = value.replace(COMMON_ASCII_WHITESPACE, '');
    if (!normalized || !FINITE_DECIMAL_PATTERN.test(normalized)) return undefined;

    const significand = normalized.toLowerCase().split('e', 1)[0];
    if (!/[1-9]/.test(significand)) return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
};

const readRawLegacyTaxRateSource = (
    source: unknown,
): Record<string, unknown> | undefined => {
    if (!isRecord(source)) return undefined;
    if (
        (source.kind === 'standard' || source.kind === 'graph') &&
        isRecord(source.nodeData)
    ) {
        return source.nodeData;
    }
    if (source.kind === 'invalid' && isRecord(source.rawData)) {
        return readRawLegacyTaxRateSource(source.rawData);
    }
    return source;
};

export const extractLegacyProductTaxRateCandidate = (
    source: unknown,
): LegacyProductTaxRateCandidate => {
    const rawSource = readRawLegacyTaxRateSource(source);
    if (!rawSource) return {};

    const candidate: LegacyProductTaxRateCandidate = {};
    for (const field of Object.keys(DEFAULT_PRODUCT_TAX_RATES) as ProductTaxRateField[]) {
        if (!hasOwn(rawSource, field)) continue;
        const parsed = toValidTaxRate(rawSource[field]);
        if (parsed !== undefined) candidate[field] = parsed;
    }
    return candidate;
};

export const resolveCanonicalProductTaxRates = (
    product: ProductTaxRateSource,
    legacyCandidates: readonly LegacyProductTaxRateCandidate[],
    defaults: Record<ProductTaxRateField, number> = DEFAULT_PRODUCT_TAX_RATES,
): Record<ProductTaxRateField, number> => {
    const resolveField = (field: ProductTaxRateField): number => {
        if (hasOwn(product, field)) {
            return toValidTaxRate(product[field]) ?? defaults[field];
        }
        for (const candidate of legacyCandidates) {
            const legacyRate = hasOwn(candidate, field)
                ? toValidTaxRate(candidate[field])
                : undefined;
            if (legacyRate !== undefined) return legacyRate;
        }
        return defaults[field];
    };

    return {
        vatRate: resolveField('vatRate'),
        corporateIncomeTaxRate: resolveField('corporateIncomeTaxRate'),
    };
};

export const parseImportedProductTaxRates = (
    source: Record<string, unknown>,
): Record<ProductTaxRateField, number> => ({
    vatRate: toValidTaxRate(source.vatRate) ?? DEFAULT_PRODUCT_TAX_RATES.vatRate,
    corporateIncomeTaxRate: toValidTaxRate(source.corporateIncomeTaxRate) ??
        DEFAULT_PRODUCT_TAX_RATES.corporateIncomeTaxRate,
});
