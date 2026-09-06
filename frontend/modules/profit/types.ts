import { PlatformType } from '../../platformConfig';
import type { NodeGraphTemplate } from './nodeGraphTypes';

export interface ProfitTemplate {
    id?: string;
    name: string;
    country: string;
    platform?: PlatformType;
    data: Record<string, unknown>;
    productId?: string;
}

export interface ProductProfitTemplate {
    id: string;
    productId: string;
    templateId?: string | null;
    name: string;
    country: string;
    platform?: PlatformType;
    isPrimary?: boolean;
    data: ProductTemplateData;
    createdAt?: string;
    updatedAt?: string;
}

export interface SiteLevelInputs {
    totalRevenue: number;
    sellerCoupon: number;
    sellerCouponType: 'fixed' | 'percent';
    sellerCouponPlatformRatio: number;
    platformInfrastructureFee: number;
    adROI: number;
}

export const DEFAULT_SITE_INPUTS: SiteLevelInputs = {
    totalRevenue: 0,
    sellerCoupon: 0,
    sellerCouponType: 'fixed',
    sellerCouponPlatformRatio: 0,
    platformInfrastructureFee: 0,
    adROI: 15,
};

export interface PlatformNode {
    id: string;
    templateId?: string;
    productTemplateLinkId?: string;
    productId?: string;
    graphTemplateId?: string;
    graphTemplateSnapshot?: NodeGraphTemplate;
    graphInputValues?: Record<string, number>;
    graphOutputValues?: Record<string, number>;
    platform: PlatformType;
    currency: string;
    name?: string;
    data: NodeData;
    /** Canonical imported payload retained solely for lossless re-serialization. */
    persistedData?: ProductTemplateData;
}

export const DEFAULT_NODE_DATA = {
    baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
    firstWeight: 50,
    platformCommissionRate: 0, transactionFeeRate: 0,
    platformCoupon: 0,
    damageReturnRate: 0,
    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0, warehouseOperationFee: 0,
    lastMileFee: 0,
    vatRate: 0, corporateIncomeTaxRate: 0,
};

export type NodeData = typeof DEFAULT_NODE_DATA;

export interface ProductGraphTemplateData {
    graphTemplateId: string;
    graphTemplateSnapshot: NodeGraphTemplate;
    graphInputValues: Record<string, number>;
    graphOutputValues: Record<string, number>;
}

interface ProductTemplateDataBase {
    schemaVersion: number;
    nodeData: Partial<NodeData>;
    extraData: Record<string, unknown>;
}

export interface StandardProductTemplateData extends ProductTemplateDataBase {
    kind: 'standard';
    graphTemplateId?: never;
    graphTemplateSnapshot?: never;
    graphInputValues?: never;
    graphOutputValues?: never;
    rawData?: never;
}

export interface GraphProductTemplateData extends ProductTemplateDataBase, ProductGraphTemplateData {
    kind: 'graph';
    rawData?: never;
}

export interface InvalidProductTemplateData {
    kind: 'invalid';
    schemaVersion: number;
    rawData: Record<string, unknown>;
    nodeData?: never;
    extraData?: never;
    graphTemplateId?: never;
    graphTemplateSnapshot?: never;
    graphInputValues?: never;
    graphOutputValues?: never;
}

/** Canonical, discriminated product-template payload after deserialization. */
export type ProductTemplateData =
    | StandardProductTemplateData
    | GraphProductTemplateData
    | InvalidProductTemplateData;

export type CountryCode = 'SG' | 'MY' | 'PH' | 'TH' | 'ID' | 'CN';
export type CurrencyCode = 'SGD' | 'MYR' | 'PHP' | 'THB' | 'IDR' | 'CNY';

export const COUNTRY_TO_CURRENCY: Record<CountryCode, CurrencyCode> = {
    SG: 'SGD', MY: 'MYR', PH: 'PHP', TH: 'THB', ID: 'IDR', CN: 'CNY',
};

export const CURRENCY_TO_COUNTRY: Record<CurrencyCode, CountryCode> = {
    SGD: 'SG', MYR: 'MY', PHP: 'PH', THB: 'TH', IDR: 'ID', CNY: 'CN',
};

const toSupportedCurrencyCode = (code: string | null | undefined): string => {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) return '';
    const countryCurrency = COUNTRY_TO_CURRENCY[normalized as CountryCode];
    if (countryCurrency) return countryCurrency;
    return CURRENCY_TO_COUNTRY[normalized as CurrencyCode] ? normalized : '';
};

export const normalizeCurrencyCode = (
    code: string | null | undefined,
    fallback = '',
): string => toSupportedCurrencyCode(code) || toSupportedCurrencyCode(fallback);

export class UnsupportedProfitSiteError extends Error {
    constructor(siteCode: string) {
        super(`Unsupported profit site: ${siteCode}`);
        this.name = 'UnsupportedProfitSiteError';
    }
}

export const resolveProfitCurrencyCode = (
    siteCode: string | null | undefined,
    fallback = '',
): string => {
    const explicitSite = siteCode?.trim();
    if (explicitSite) {
        const normalized = normalizeCurrencyCode(explicitSite);
        if (!normalized) throw new UnsupportedProfitSiteError(explicitSite);
        return normalized;
    }
    const explicitFallback = fallback.trim();
    if (!explicitFallback) return '';
    const normalizedFallback = normalizeCurrencyCode(explicitFallback);
    if (!normalizedFallback) throw new UnsupportedProfitSiteError(explicitFallback);
    return normalizedFallback;
};

export const SERVICE_FEE_EXEMPT_CURRENCIES: readonly CurrencyCode[] = ['MYR', 'SGD'];

export interface ProfitGlobalInputs {
    name: string;
    sku: string;
    purchaseCost: number;
    productWeight: number;
    supplierTaxPoint: number;
    supplierInvoice: 'yes' | 'no';
    vatRate: number;
    corporateIncomeTaxRate: number;
}

export const genId = () => {
    try { return crypto.randomUUID(); } catch { return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
};
