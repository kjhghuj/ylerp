import type { PlatformType } from '../../platformConfig';
import type { NodeGraphTemplate } from './nodeGraphTypes';
import {
    DEFAULT_NODE_DATA,
    genId,
    resolveProfitCurrencyCode,
    type PlatformNode,
    type ProfitTemplate,
} from './types';
import {
    cloneProductTemplateData,
    cloneTemplateValue,
    isGraphProductTemplateData,
    normalizeProductTemplateData,
    toStandardNodeData,
} from '../productTemplateImport';

const resolveNodeCurrency = (
    templateCountry: string | null | undefined,
    siteCountry: string,
): string => resolveProfitCurrencyCode(
    templateCountry,
    siteCountry,
);

export const createTemplatePlatformNode = (
    template: ProfitTemplate,
    siteCountry: string,
    id: string = genId(),
): PlatformNode => {
    const persistedData = normalizeProductTemplateData(template.data);
    const graphData = isGraphProductTemplateData(persistedData) ? persistedData : undefined;
    return {
        id,
        templateId: template.id,
        platform: template.platform || 'other',
        currency: resolveNodeCurrency(template.country, siteCountry),
        name: template.name,
        data: toStandardNodeData(persistedData),
        persistedData: cloneProductTemplateData(persistedData),
        ...(graphData ? {
            graphTemplateId: graphData.graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(graphData.graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(graphData.graphInputValues),
            graphOutputValues: cloneTemplateValue(graphData.graphOutputValues),
        } : {}),
    };
};

export const createGraphPlatformNode = (
    graphTemplate: NodeGraphTemplate,
    siteCountry: string,
    inputValues: Record<string, number>,
    outputValues: Record<string, number>,
    id: string = genId(),
): PlatformNode => ({
    id,
    graphTemplateId: graphTemplate.id,
    graphTemplateSnapshot: cloneTemplateValue(graphTemplate),
    graphInputValues: cloneTemplateValue(inputValues),
    graphOutputValues: cloneTemplateValue(outputValues),
    platform: (graphTemplate.platform || 'other') as PlatformType,
    currency: resolveNodeCurrency(graphTemplate.country, siteCountry),
    name: graphTemplate.name,
    data: { ...DEFAULT_NODE_DATA },
});
