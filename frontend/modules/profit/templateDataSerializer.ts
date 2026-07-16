import { cloneTemplateValue } from '../productTemplateImport';
import type { NodeData, PlatformNode } from './types';

export const serializePlatformNodeTemplateData = (
    node: PlatformNode,
    nodeDataOverrides: Partial<NodeData> = {},
): Record<string, unknown> => {
    const persisted = node.persistedData;
    const currentNodeData = { ...node.data, ...nodeDataOverrides };
    if (persisted?.kind === 'invalid') {
        return cloneTemplateValue(persisted.rawData);
    }
    const persistedGraph = persisted?.kind === 'graph' ? persisted : undefined;
    const hasRuntimeGraph = (
        typeof node.graphTemplateId === 'string' &&
        node.graphTemplateSnapshot !== undefined &&
        node.graphInputValues !== undefined &&
        node.graphOutputValues !== undefined
    );

    if (persistedGraph || hasRuntimeGraph) {
        return {
            ...cloneTemplateValue(persistedGraph?.extraData ?? {}),
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
        ...cloneTemplateValue(persisted?.extraData ?? {}),
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
) => ({
    ...(templateId !== undefined ? { templateId } : {}),
    name,
    country: node.currency,
    platform: node.platform,
    type: 'profit',
    data: serializePlatformNodeTemplateData(node, nodeDataOverrides),
});
