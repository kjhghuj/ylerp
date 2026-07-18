import type { PlatformType } from '../../platformConfig';
import type { ProductCalcData, SiteData } from '../../types';
import { buildPlatformNodeTemplatePayload } from './templateDataSerializer';
import { findExistingProductTemplateLink, resolveTemplateIdForPayload } from './productTemplateSync';
import {
    DEFAULT_NODE_DATA,
    type PlatformNode,
    type ProductProfitTemplate,
    type ProfitTemplate,
} from './types';
import type { ExchangeRateSnapshot } from './exchangeRateSnapshot';

export interface ProductTemplateWritePayload {
    templateId: string | null;
    name: string;
    country: string;
    platform?: PlatformType | null;
    type: 'profit';
    data: Record<string, unknown>;
}

export type ProductTemplateMutation =
    | ({ operation: 'create' } & ProductTemplateWritePayload)
    | ({ operation: 'update'; linkId: string } & ProductTemplateWritePayload);

interface AtomicProductTemplateSaveRequestBase {
    templateMutations: ProductTemplateMutation[];
    ensureDefaultTemplate?: ProductTemplateWritePayload;
}

type AtomicProductSiteCode = NonNullable<ProductCalcData['sites']>[number];

type AtomicProductSitePatchFor<S extends AtomicProductSiteCode> = {
    sites: [S];
    siteData: { [K in S]: SiteData }
        & { [K in Exclude<AtomicProductSiteCode, S>]?: never };
};

export type AtomicProductSitePatch = {
    [S in AtomicProductSiteCode]: AtomicProductSitePatchFor<S>;
}[AtomicProductSiteCode];

export const buildAtomicProductSitePatch = (
    site: AtomicProductSiteCode,
    data: SiteData,
): AtomicProductSitePatch => {
    switch (site) {
        case 'SG': return { sites: ['SG'], siteData: { SG: data } };
        case 'MY': return { sites: ['MY'], siteData: { MY: data } };
        case 'PH': return { sites: ['PH'], siteData: { PH: data } };
        case 'TH': return { sites: ['TH'], siteData: { TH: data } };
        case 'CN': return { sites: ['CN'], siteData: { CN: data } };
        case 'ID': return { sites: ['ID'], siteData: { ID: data } };
    }
};

export interface AtomicProductTemplateCreateRequest
    extends AtomicProductTemplateSaveRequestBase {
    product: Omit<ProductCalcData, 'id' | 'sites' | 'siteData'>
        & Required<Pick<ProductCalcData, 'sites' | 'siteData'>>;
    sitePatch?: never;
}

export interface AtomicProductTemplateUpdateRequest
    extends AtomicProductTemplateSaveRequestBase {
    product: Omit<ProductCalcData, 'id' | 'sites' | 'siteData'>;
    sitePatch: AtomicProductSitePatch;
}

export type AtomicProductTemplateSaveRequest =
    | AtomicProductTemplateCreateRequest
    | AtomicProductTemplateUpdateRequest;

export const buildAtomicProductUpdateData = (
    product: AtomicProductTemplateCreateRequest['product'],
): AtomicProductTemplateUpdateRequest['product'] => ({
    name: product.name,
    sku: product.sku,
    country: product.country,
    cost: product.cost,
    productWeight: product.productWeight,
    supplierInvoice: product.supplierInvoice,
    supplierTaxPoint: product.supplierTaxPoint,
    vatRate: product.vatRate,
    corporateIncomeTaxRate: product.corporateIncomeTaxRate,
    sellerCouponType: product.sellerCouponType,
    sellerCoupon: product.sellerCoupon,
    sellerCouponPlatformRatio: product.sellerCouponPlatformRatio,
    adROI: product.adROI,
    totalRevenue: product.totalRevenue,
    platformInfrastructureFee: product.platformInfrastructureFee,
});

/** Raw JSON returned by the aggregate endpoint before any import normalization. */
export interface AtomicProductTemplateLinkDto {
    id: string;
    productId: string;
    templateId: string | null;
    name: string;
    country: string;
    platform: string | null;
    data: unknown;
    createdAt: string;
    updatedAt: string;
}

export interface AtomicProductTemplateSaveResponse {
    product: ProductCalcData;
    productTemplates: AtomicProductTemplateLinkDto[];
}

interface TaxOverrides {
    vatRate: number;
    corporateIncomeTaxRate: number;
}

export const buildProductTemplateMutations = (
    nodes: PlatformNode[],
    existingLinks: ProductProfitTemplate[],
    sharedTemplates: ProfitTemplate[],
    taxOverrides: TaxOverrides,
    exchangeRateSnapshots: Readonly<Record<string, ExchangeRateSnapshot>> = {},
): ProductTemplateMutation[] => {
    const updatedLinkIds = new Set<string>();
    return nodes.map(node => {
        const existingLink = findExistingProductTemplateLink(node, existingLinks);
        const templateId = resolveTemplateIdForPayload(
            node.templateId,
            existingLink,
            sharedTemplates,
        );
        const payload = buildPlatformNodeTemplatePayload(
            node,
            node.name || node.platform,
            taxOverrides,
            templateId,
            node.graphTemplateSnapshot ? undefined : exchangeRateSnapshots[node.currency],
        ) as ProductTemplateWritePayload;

        if (!existingLink) {
            return { operation: 'create', ...payload };
        }
        if (updatedLinkIds.has(existingLink.id)) {
            throw new Error(`Multiple mutations target the same product-template link: ${existingLink.id}`);
        }
        updatedLinkIds.add(existingLink.id);
        return { operation: 'update', linkId: existingLink.id, ...payload };
    });
};

export const buildDefaultProductTemplatePayload = (
    name: string,
    country: string,
    taxOverrides: TaxOverrides,
    exchangeRateSnapshot?: ExchangeRateSnapshot,
): ProductTemplateWritePayload => buildPlatformNodeTemplatePayload({
    id: 'default-product-template',
    name,
    currency: country,
    platform: 'other',
    data: { ...DEFAULT_NODE_DATA },
}, name, taxOverrides, null, exchangeRateSnapshot) as ProductTemplateWritePayload;
