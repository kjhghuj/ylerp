import { cloneTemplateValue } from '../productTemplateImport';
import {
    hasCompleteRuntimeGraph,
    hasRuntimeGraphClaim,
} from './graphNodeSavePreparation';
import type { NodeData, PlatformNode } from './types';

const stripDeprecatedDerivedNodeFields = (
    data: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== 'platformCouponRate'),
);

export const serializePlatformNodeTemplateData = (
    node: PlatformNode,
    nodeDataOverrides: Partial<NodeData> = {},
): Record<string, unknown> => {
    const persisted = node.persistedData;
    const currentNodeData = stripDeprecatedDerivedNodeFields({
        ...node.data,
        ...nodeDataOverrides,
    });
    if (persisted?.kind === 'invalid') {
        return cloneTemplateValue(persisted.rawData);
    }
    const persistedGraph = persisted?.kind === 'graph' ? persisted : undefined;
    const runtimeGraphClaim = hasRuntimeGraphClaim(node);
    if (runtimeGraphClaim && !hasCompleteRuntimeGraph(node)) {
        throw new Error(`runtime graph node "${node.id}" must provide all graph fields`);
    }
    const hasRuntimeGraph = runtimeGraphClaim && hasCompleteRuntimeGraph(node);

    if (persistedGraph || hasRuntimeGraph) {
        return {
            ...cloneTemplateValue(stripDeprecatedDerivedNodeFields(persistedGraph?.extraData ?? {})),
            ...cloneTemplateValue(currentNodeData),
            kind: 'graph',
            schemaVersion: persistedGraph?.schemaVersion ?? 2,
            graphTemplateId: node.graphTemplateId ?? persistedGraph?.graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(node.graphTemplateSnapshot ?? persistedGraph?.graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(node.graphInputValues ?? persistedGraph?.graphInputValues),
            graphOutputValues: cloneTemplateValue(node.graphOutputValues ?? persistedGraph?.graphOutputValues),
        };
    }

    return {
        ...cloneTemplateValue(stripDeprecatedDerivedNodeFields(persisted?.extraData ?? {})),
        ...cloneTemplateValue(currentNodeData),
        kind: 'standard',
        schemaVersion: persisted?.schemaVersion ?? 2,
    };
};

export const buildPlatformNodeTemplatePayload = (
    node: PlatformNode,
    name: string,
    nodeDataOverrides: Partial<NodeData> = {},
    templateId?: string | null,
) => {
    const data = node.persistedData?.kind === 'invalid'
        ? {
            kind: 'invalid',
            schemaVersion: node.persistedData.schemaVersion,
            compatibilityEnvelope: true,
            rawData: cloneTemplateValue(node.persistedData.rawData),
        }
        : serializePlatformNodeTemplateData(node, nodeDataOverrides);
    return {
        ...(templateId !== undefined ? { templateId } : {}),
        name,
        country: node.currency,
        platform: node.platform,
        type: 'profit',
        data,
    };
};
