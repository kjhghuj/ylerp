import { cloneTemplateValue } from '../productTemplateImport';
import {
    evaluateNodeGraphProfitTemplate,
    type NodeGraphEvaluationError,
} from './nodeGraphProfitAdapter';
import type { PlatformNode } from './types';

export const GRAPH_RUNTIME_NODE_KEYS = [
    'graphTemplateId',
    'graphTemplateSnapshot',
    'graphInputValues',
    'graphOutputValues',
] as const;

const hasOwn = (value: object, key: PropertyKey): boolean => (
    Object.prototype.hasOwnProperty.call(value, key)
);

export const hasRuntimeGraphClaim = (node: PlatformNode): boolean => (
    GRAPH_RUNTIME_NODE_KEYS.some(key => hasOwn(node, key))
);

export const hasCompleteRuntimeGraph = (node: PlatformNode): boolean => (
    GRAPH_RUNTIME_NODE_KEYS.every(key => hasOwn(node, key) && node[key] !== undefined)
);

export type PreparedGraphNode =
    | { ok: true; node: PlatformNode }
    | { ok: false; error: NodeGraphEvaluationError };

const preparationError = (detail: string, nodeId: string): PreparedGraphNode => ({
    ok: false,
    error: {
        code: 'graph_structure',
        nodeId,
        message: detail,
        context: { detail },
    },
});

export const prepareGraphNodeForSave = (source: PlatformNode): PreparedGraphNode => {
    const node = cloneTemplateValue(source);
    if (node.persistedData?.kind === 'invalid') {
        return { ok: true, node };
    }

    const runtimeClaim = hasRuntimeGraphClaim(node);
    const persistedGraph = node.persistedData?.kind === 'graph'
        ? node.persistedData
        : undefined;
    if (!runtimeClaim && !persistedGraph) {
        return { ok: true, node };
    }
    if (runtimeClaim && !hasCompleteRuntimeGraph(node)) {
        return preparationError(
            `runtime graph node "${node.id}" must provide all graph fields`,
            node.id,
        );
    }

    const graphTemplateId = runtimeClaim
        ? node.graphTemplateId
        : persistedGraph?.graphTemplateId;
    const graphTemplateSnapshot = runtimeClaim
        ? node.graphTemplateSnapshot
        : persistedGraph?.graphTemplateSnapshot;
    const graphInputValues = runtimeClaim
        ? node.graphInputValues
        : persistedGraph?.graphInputValues;
    if (
        typeof graphTemplateId !== 'string' ||
        !graphTemplateId.trim() ||
        !graphTemplateSnapshot ||
        !graphInputValues
    ) {
        return preparationError(
            `runtime graph node "${node.id}" contains an incomplete graph tuple`,
            node.id,
        );
    }
    const invalidSnapshotMetadata = (['name', 'createdAt', 'updatedAt'] as const)
        .find(field => (
            typeof graphTemplateSnapshot[field] !== 'string' ||
            !graphTemplateSnapshot[field].trim()
        ));
    if (invalidSnapshotMetadata) {
        return preparationError(
            `runtime graph node "${node.id}" graphTemplateSnapshot.${invalidSnapshotMetadata} must be a non-empty string`,
            node.id,
        );
    }
    if (graphTemplateSnapshot.id !== graphTemplateId) {
        return preparationError(
            `runtime graph node "${node.id}" graphTemplateId must match snapshot.id`,
            node.id,
        );
    }

    const result = evaluateNodeGraphProfitTemplate(graphTemplateSnapshot, graphInputValues);
    if (result.ok === false) {
        return { ok: false, error: result.errors[0] };
    }

    const freshInputs = cloneTemplateValue(result.inputValues);
    const freshOutputs = Object.fromEntries(
        result.outputs.map(output => [output.id, output.value]),
    );
    node.graphTemplateId = graphTemplateId;
    node.graphTemplateSnapshot = cloneTemplateValue(graphTemplateSnapshot);
    node.graphInputValues = freshInputs;
    node.graphOutputValues = cloneTemplateValue(freshOutputs);
    if (persistedGraph) {
        node.persistedData = {
            kind: 'graph',
            schemaVersion: persistedGraph.schemaVersion,
            nodeData: cloneTemplateValue(persistedGraph.nodeData),
            extraData: cloneTemplateValue(persistedGraph.extraData),
            graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(freshInputs),
            graphOutputValues: cloneTemplateValue(freshOutputs),
        };
    }
    return { ok: true, node };
};

export const prepareGraphNodesForSave = (
    nodes: PlatformNode[],
): { ok: true; nodes: PlatformNode[] } | { ok: false; error: NodeGraphEvaluationError } => {
    const prepared: PlatformNode[] = [];
    for (const node of nodes) {
        const result = prepareGraphNodeForSave(node);
        if (result.ok === false) return result;
        prepared.push(result.node);
    }
    return { ok: true, nodes: prepared };
};
