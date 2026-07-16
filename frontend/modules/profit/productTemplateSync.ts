import {
    normalizeCurrencyCode,
    type PlatformNode,
    type ProductProfitTemplate,
    type ProfitTemplate,
} from './types';

const matchesTemplateCountry = (left: string, right: string): boolean => {
    const normalizedLeft = normalizeCurrencyCode(left);
    const normalizedRight = normalizeCurrencyCode(right);
    if (normalizedLeft && normalizedRight) return normalizedLeft === normalizedRight;
    return left.trim().toUpperCase() === right.trim().toUpperCase();
};

export const findExistingProductTemplateLink = (
    node: PlatformNode,
    productTemplates: ProductProfitTemplate[],
) => {
    const nodeName = node.name || node.platform;
    if (node.productTemplateLinkId) {
        const exactLink = productTemplates.find(t => t.id === node.productTemplateLinkId);
        if (exactLink) return exactLink;
    }
    if (node.templateId) {
        // Compatibility: older imports stored the product link id in templateId.
        const legacyExactLink = productTemplates.find(t => t.id === node.templateId);
        if (legacyExactLink) return legacyExactLink;
        return productTemplates.find(
            t => t.templateId === node.templateId &&
                t.name === nodeName &&
                t.platform === node.platform &&
                matchesTemplateCountry(t.country, node.currency),
        );
    }
    return productTemplates.find(
        t => !t.templateId &&
            t.name === nodeName &&
            t.platform === node.platform &&
            matchesTemplateCountry(t.country, node.currency),
    );
};

export const resolveTemplateIdForPayload = (
    nodeTemplateId: string | undefined,
    existingLink: ProductProfitTemplate | undefined,
    sharedTemplates: ProfitTemplate[],
) => {
    if (nodeTemplateId && sharedTemplates.some(t => t.id === nodeTemplateId)) {
        return nodeTemplateId;
    }
    return existingLink?.templateId || null;
};
