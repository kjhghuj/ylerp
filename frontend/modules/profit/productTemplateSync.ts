import type { PlatformNode, ProductProfitTemplate, ProfitTemplate } from './types';

export const findExistingProductTemplateLink = (
    node: PlatformNode,
    productTemplates: ProductProfitTemplate[],
) => {
    const nodeName = node.name || node.platform;
    return productTemplates.find(
        t => (node.productTemplateLinkId && t.id === node.productTemplateLinkId) ||
            // Compatibility: older imports stored the product link id in templateId.
            (node.templateId && t.id === node.templateId) ||
            (node.templateId && t.templateId === node.templateId && t.name === nodeName && t.platform === node.platform && t.country === node.currency) ||
            (!node.templateId && !t.templateId && t.name === nodeName && t.platform === node.platform && t.country === node.currency)
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
