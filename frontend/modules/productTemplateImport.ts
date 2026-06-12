import { COUNTRY_TO_CURRENCY } from './profit/types';

export interface LinkedProductTemplate {
    id: string;
    productId?: string;
    templateId?: string | null;
    name: string;
    country: string;
    platform?: string;
    data: Record<string, any>;
}

export interface ProductTemplateImportNode {
    id: string;
    productTemplateLinkId: string;
    templateId?: string | null;
    productId?: string;
    name: string;
    country: string;
    platform: string;
    data: Record<string, number>;
}

const countryCurrencyMap = COUNTRY_TO_CURRENCY;

export const matchesActiveSite = (templateCountry: string, activeSite: string) => {
    const currency = countryCurrencyMap[activeSite as keyof typeof countryCurrencyMap] || activeSite;
    return templateCountry === activeSite || templateCountry === currency;
};

export const toProductTemplateImportNode = (tpl: LinkedProductTemplate): ProductTemplateImportNode => ({
    id: tpl.id,
    productTemplateLinkId: tpl.id,
    templateId: tpl.templateId,
    productId: tpl.productId,
    name: tpl.name,
    country: tpl.country,
    platform: tpl.platform || 'other',
    data: Object.fromEntries(
        Object.entries(tpl.data || {}).map(([key, value]) => [key, Number(value) || 0])
    ),
});

export const filterProductTemplatesForSite = (
    templates: LinkedProductTemplate[],
    activeSite: string,
) => templates.filter(tpl => matchesActiveSite(tpl.country, activeSite));

export const loadProductTemplateImportNodes = async (
    apiClient: { get: (url: string) => Promise<{ data: LinkedProductTemplate[] }> },
    productId: string,
    activeSite: string,
) => {
    const res = await apiClient.get(`/products/${productId}/templates`);
    return filterProductTemplatesForSite(res.data || [], activeSite).map(toProductTemplateImportNode);
};
