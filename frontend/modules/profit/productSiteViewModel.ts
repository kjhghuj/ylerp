import type { ProductCalcData, SiteData } from '../../types';
import {
    DEFAULT_PRODUCT_TAX_RATES,
    resolveCanonicalProductTaxRates,
    type LegacyProductTaxRateCandidate,
} from '../productTaxRates';
import { selectImportedSiteData } from './importCompatibility';
import {
    normalizeHistoricalSiteInputs,
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    readHistoricalProfitNumber,
    type ProfitInputError,
    type ProfitInputNormalizationResult,
} from './profitInputNormalization';
import {
    COUNTRY_TO_CURRENCY,
    CURRENCY_TO_COUNTRY,
    normalizeCurrencyCode,
    type CountryCode,
    type ProfitGlobalInputs,
    type SiteLevelInputs,
} from './types';

const SITE_INPUT_KEYS = [
    'totalRevenue',
    'sellerCoupon',
    'sellerCouponType',
    'sellerCouponPlatformRatio',
    'platformInfrastructureFee',
    'adROI',
] as const;

export const MAX_PRODUCT_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMPORT_RECORDS = 1000;
export const MAX_PRODUCT_IMPORT_STRING_LENGTH = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toCountryCode = (value: unknown): CountryCode | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toUpperCase();
    if (COUNTRY_TO_CURRENCY[normalized as CountryCode]) return normalized as CountryCode;
    return CURRENCY_TO_COUNTRY[normalized as keyof typeof CURRENCY_TO_COUNTRY];
};

export const normalizeProductSiteMembership = (
    product: ProductCalcData | Record<string, unknown>,
): CountryCode[] => {
    const source = product as unknown as Record<string, unknown>;
    const sites = Array.isArray(source.sites)
        ? source.sites.map(toCountryCode).filter((value): value is CountryCode => Boolean(value))
        : [];
    if (sites.length > 0) return Array.from(new Set(sites));
    const country = toCountryCode(source.country);
    return country ? [country] : [];
};

const resolveCountry = (value: unknown, fallback: string): CountryCode => (
    toCountryCode(value) || toCountryCode(fallback) || 'MY'
);

const prefixErrors = (prefix: string, errors: ProfitInputError[]): ProfitInputError[] => (
    errors.map(error => ({ ...error, field: `${prefix}${error.field}` }))
);

export interface ProductSiteViewModel {
    country: CountryCode;
    currency: string;
    sites: CountryCode[];
    globalInputs: ProfitGlobalInputs;
    siteInputs: SiteLevelInputs;
}

export const createProductSiteViewModel = (
    product: ProductCalcData | Record<string, unknown>,
    site: string,
    legacyTaxRateCandidates: readonly LegacyProductTaxRateCandidate[] = [],
): ProductSiteViewModel => {
    const source = product as unknown as Record<string, unknown>;
    const country = resolveCountry(site, typeof source.country === 'string' ? source.country : 'MY');
    const currency = normalizeCurrencyCode(site, COUNTRY_TO_CURRENCY[country]) || COUNTRY_TO_CURRENCY[country];
    const rawSites = Array.isArray(source.sites)
        ? source.sites.map(toCountryCode).filter((value): value is CountryCode => Boolean(value))
        : [];
    const sites = rawSites.length > 0
        ? Array.from(new Set(rawSites))
        : [resolveCountry(source.country, country)];

    const siteData = isRecord(source.siteData)
        ? source.siteData as Record<string, Record<string, unknown>>
        : undefined;
    const selectedSiteData = selectImportedSiteData(siteData, currency);
    const historicalSiteSource: Record<string, unknown> = {};
    for (const key of SITE_INPUT_KEYS) {
        historicalSiteSource[key] = selectedSiteData && selectedSiteData[key] !== null && selectedSiteData[key] !== undefined
            ? selectedSiteData[key]
            : source[key];
    }

    const taxRates = resolveCanonicalProductTaxRates(
        source as unknown as Partial<Pick<ProductCalcData, 'vatRate' | 'corporateIncomeTaxRate'>>,
        legacyTaxRateCandidates,
    );

    return {
        country,
        currency,
        sites,
        globalInputs: {
            name: typeof source.name === 'string' ? source.name : '',
            sku: typeof source.sku === 'string' ? source.sku : '',
            purchaseCost: readHistoricalProfitNumber(source.cost, 0, { min: 0 }),
            productWeight: readHistoricalProfitNumber(source.productWeight, 0, { min: 0 }),
            supplierTaxPoint: readHistoricalProfitNumber(source.supplierTaxPoint, 0),
            supplierInvoice: source.supplierInvoice === 'yes' ? 'yes' : 'no',
            vatRate: taxRates.vatRate,
            corporateIncomeTaxRate: taxRates.corporateIncomeTaxRate,
        },
        siteInputs: normalizeHistoricalSiteInputs(historicalSiteSource),
    };
};

export const normalizeImportedProductRecord = (
    input: unknown,
    activeSite: string,
): ProfitInputNormalizationResult<Omit<ProductCalcData, 'id'>> => {
    if (!isRecord(input)) {
        return { ok: false, errors: [{ field: 'product', code: 'required' }] };
    }

    const errors: ProfitInputError[] = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const sku = typeof input.sku === 'string' ? input.sku.trim() : '';
    if (!name) errors.push({ field: 'name', code: 'required' });
    if (!sku) errors.push({ field: 'sku', code: 'required' });
    if (name.length > MAX_PRODUCT_IMPORT_STRING_LENGTH) {
        errors.push({ field: 'name', code: 'max', max: MAX_PRODUCT_IMPORT_STRING_LENGTH });
    }
    if (sku.length > MAX_PRODUCT_IMPORT_STRING_LENGTH) {
        errors.push({ field: 'sku', code: 'max', max: MAX_PRODUCT_IMPORT_STRING_LENGTH });
    }

    const explicitCountry = input.country !== undefined && input.country !== null;
    const parsedCountry = toCountryCode(input.country);
    if (explicitCountry && !parsedCountry) {
        errors.push({ field: 'country', code: 'invalid_enum' });
    }
    const country = parsedCountry || resolveCountry(undefined, activeSite);
    const rawSites = input.sites;
    let sites: CountryCode[];
    if (rawSites === undefined || (Array.isArray(rawSites) && rawSites.length === 0)) {
        sites = [country];
    } else if (Array.isArray(rawSites)) {
        const normalizedSites = rawSites.map(toCountryCode);
        if (normalizedSites.some(site => !site)) {
            errors.push({ field: 'sites', code: 'invalid_enum' });
        }
        sites = Array.from(new Set(normalizedSites.filter((site): site is CountryCode => Boolean(site))));
    } else {
        errors.push({ field: 'sites', code: 'invalid_enum' });
        sites = [country];
    }

    const globalResult = normalizeProfitGlobalInputs({
        name,
        sku,
        purchaseCost: input.cost ?? 0,
        productWeight: input.productWeight ?? 0,
        supplierTaxPoint: input.supplierTaxPoint ?? 0,
        supplierInvoice: input.supplierInvoice ?? 'no',
        vatRate: input.vatRate ?? DEFAULT_PRODUCT_TAX_RATES.vatRate,
        corporateIncomeTaxRate: input.corporateIncomeTaxRate ?? DEFAULT_PRODUCT_TAX_RATES.corporateIncomeTaxRate,
    });
    if (globalResult.ok === false) errors.push(...prefixErrors('', globalResult.errors));

    const topSiteResult = normalizeSiteInputs(input);
    if (topSiteResult.ok === false) errors.push(...prefixErrors('', topSiteResult.errors));

    const normalizedSiteData: Record<string, SiteData> = {};
    if (input.siteData !== undefined) {
        if (!isRecord(input.siteData)) {
            errors.push({ field: 'siteData', code: 'required' });
        } else if (topSiteResult.ok === true) {
            const seenSiteCountries = new Set<CountryCode>();
            for (const [rawSite, rawValue] of Object.entries(input.siteData)) {
                const siteCountry = toCountryCode(rawSite);
                if (!siteCountry) {
                    errors.push({ field: `siteData.${rawSite}`, code: 'invalid_enum' });
                    continue;
                }
                if (seenSiteCountries.has(siteCountry)) {
                    errors.push({ field: `siteData.${rawSite}`, code: 'invalid_enum' });
                    continue;
                }
                seenSiteCountries.add(siteCountry);
                if (!isRecord(rawValue)) {
                    errors.push({ field: `siteData.${rawSite}`, code: 'required' });
                    continue;
                }
                const mergedSite: Record<string, unknown> = { ...topSiteResult.value };
                for (const [key, value] of Object.entries(rawValue)) {
                    if (value !== undefined) mergedSite[key] = value;
                }
                const siteResult = normalizeSiteInputs(mergedSite);
                if (siteResult.ok === false) {
                    errors.push(...prefixErrors(`siteData.${rawSite}.`, siteResult.errors));
                    continue;
                }
                normalizedSiteData[siteCountry] = siteResult.value;
            }
        }
    }

    if (errors.length > 0 || globalResult.ok === false || topSiteResult.ok === false) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            name,
            sku,
            country,
            sites,
            cost: globalResult.value.purchaseCost,
            productWeight: globalResult.value.productWeight,
            supplierInvoice: globalResult.value.supplierInvoice,
            supplierTaxPoint: globalResult.value.supplierTaxPoint,
            vatRate: globalResult.value.vatRate,
            corporateIncomeTaxRate: globalResult.value.corporateIncomeTaxRate,
            ...topSiteResult.value,
            siteData: normalizedSiteData,
        },
    };
};

export const normalizeImportedProductBatch = (
    input: unknown,
    activeSite: string,
): ProfitInputNormalizationResult<Omit<ProductCalcData, 'id'>[]> => {
    if (!Array.isArray(input)) {
        return { ok: false, errors: [{ field: 'products', code: 'required' }] };
    }
    if (input.length > MAX_PRODUCT_IMPORT_RECORDS) {
        return {
            ok: false,
            errors: [{ field: 'products', code: 'max', max: MAX_PRODUCT_IMPORT_RECORDS }],
        };
    }

    const values: Omit<ProductCalcData, 'id'>[] = [];
    const errors: ProfitInputError[] = [];
    input.forEach((record, index) => {
        const normalized = normalizeImportedProductRecord(record, activeSite);
        if (normalized.ok === true) {
            values.push(normalized.value);
        } else {
            errors.push(...prefixErrors(`products.${index}.`, normalized.errors));
        }
    });
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, value: values };
};
