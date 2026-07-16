import type { PlatformType } from '../../platformConfig';
import {
    cloneProductTemplateData,
    cloneTemplateValue,
    isGraphProductTemplateData,
    toStandardNodeData,
} from '../productTemplateImport';
import {
    CURRENCY_TO_COUNTRY,
    DEFAULT_NODE_DATA,
    genId,
    normalizeCurrencyCode,
    resolveProfitCurrencyCode,
    type CurrencyCode,
    type PlatformNode,
    type ProductTemplateData,
} from './types';

export interface ImportedProductTemplateNode {
    id?: string;
    templateId?: string | null;
    productTemplateLinkId?: string;
    productId?: string;
    name: string;
    country: string;
    platform: string;
    data: ProductTemplateData;
}

export const toImportedPlatformNode = (
    node: ImportedProductTemplateNode,
    fallbackCurrency: string,
    id: string = genId(),
): PlatformNode => {
    const graphData = isGraphProductTemplateData(node.data) ? node.data : undefined;
    const persistedData = cloneProductTemplateData(node.data);
    return {
        id,
        templateId: node.templateId || undefined,
        productTemplateLinkId: node.productTemplateLinkId || node.id,
        productId: node.productId,
        platform: (node.platform || 'other') as PlatformType,
        currency: resolveProfitCurrencyCode(node.country, fallbackCurrency),
        name: node.name,
        data: toStandardNodeData(node.data),
        persistedData,
        graphTemplateId: graphData?.graphTemplateId,
        graphTemplateSnapshot: cloneTemplateValue(graphData?.graphTemplateSnapshot),
        graphInputValues: cloneTemplateValue(graphData?.graphInputValues),
        graphOutputValues: cloneTemplateValue(graphData?.graphOutputValues),
    };
};

export const resolveImportCurrency = (
    productCountry: string | null | undefined,
    currentSiteCurrency: string,
): string => resolveProfitCurrencyCode(productCountry, currentSiteCurrency);

export const selectImportedSiteData = <T>(
    siteData: Record<string, T> | undefined,
    resolvedCurrency: string,
): T | undefined => {
    if (!siteData) return undefined;
    const canonicalCurrency = normalizeCurrencyCode(resolvedCurrency);
    if (!canonicalCurrency) return undefined;
    const canonicalCountry = CURRENCY_TO_COUNTRY[canonicalCurrency as CurrencyCode];
    if (canonicalCountry && siteData[canonicalCountry] !== undefined) {
        return siteData[canonicalCountry];
    }
    if (canonicalCurrency && siteData[canonicalCurrency] !== undefined) {
        return siteData[canonicalCurrency];
    }
    const matchingKey = Object.keys(siteData).find(key => {
        const normalizedKey = normalizeCurrencyCode(key);
        return normalizedKey.length > 0 && normalizedKey === canonicalCurrency;
    });
    return matchingKey ? siteData[matchingKey] : undefined;
};

export const buildImportedProfitNodes = (
    importedNodes: ImportedProductTemplateNode[],
    productCountry: string | null | undefined,
    currentSiteCurrency: string,
    defaultNodeName: string,
    idFactory: () => string = genId,
) => {
    const currency = resolveImportCurrency(productCountry, currentSiteCurrency);
    const nodes: PlatformNode[] = importedNodes.length > 0
        ? importedNodes.map(node => toImportedPlatformNode(node, currency, idFactory()))
        : [{
            id: idFactory(),
            platform: 'other',
            currency,
            name: defaultNodeName,
            data: { ...DEFAULT_NODE_DATA },
        }];
    return {
        currency,
        nodes,
        groupedNodes: groupImportedPlatformNodes(nodes),
    };
};

export const groupImportedPlatformNodes = (
    nodes: PlatformNode[],
): Record<string, PlatformNode[]> => {
    const grouped: Record<string, PlatformNode[]> = {};
    for (const node of nodes) {
        const currency = normalizeCurrencyCode(node.currency);
        const normalizedNode = node.currency === currency ? node : { ...node, currency };
        if (!grouped[currency]) grouped[currency] = [];
        grouped[currency].push(normalizedNode);
    }
    return grouped;
};
