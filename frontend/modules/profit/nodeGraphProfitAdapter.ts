import { evaluateGraph } from '../node-designer/formulaEngine';
import type { DesignerNode, NodeGraphTemplate, ParameterNodeData, OutputNodeData } from '../node-designer/types';

export interface NodeGraphInputDescriptor {
    id: string;
    name: string;
    valueType: 'number' | 'percentage';
    min: number;
    max: number;
    defaultValue: number;
}

export interface NodeGraphOutputDescriptor {
    id: string;
    name: string;
    value: number;
}

export const getNodeGraphInputNodes = (template: Pick<NodeGraphTemplate, 'nodes'>): NodeGraphInputDescriptor[] => {
    return template.nodes
        .filter((node) => node.type === 'parameter')
        .map((node) => {
            const data = node.data as ParameterNodeData;
            return {
                id: node.id,
                name: data.name || '输入',
                valueType: data.valueType || 'number',
                min: Number(data.min) || 0,
                max: Number(data.max) || 0,
                defaultValue: Number(data.defaultValue) || 0,
            };
        });
};

const applyInputValues = (
    nodes: DesignerNode[],
    inputValues: Record<string, number>,
): DesignerNode[] => nodes.map((node) => {
    if (node.type !== 'parameter') return node;
    return {
        ...node,
        data: {
            ...node.data,
            defaultValue: inputValues[node.id] ?? (Number((node.data as ParameterNodeData).defaultValue) || 0),
        },
    };
});

export const evaluateNodeGraphProfitTemplate = (
    template: Pick<NodeGraphTemplate, 'nodes' | 'edges'>,
    inputValues: Record<string, number>,
) => {
    const runtimeNodes = applyInputValues(template.nodes, inputValues);
    const result = evaluateGraph(runtimeNodes, template.edges);
    const outputs: NodeGraphOutputDescriptor[] = runtimeNodes
        .filter((node) => node.type === 'output')
        .map((node) => ({
            id: node.id,
            name: ((node.data as OutputNodeData).name || '输出'),
            value: result.values.get(node.id) ?? 0,
        }));

    return {
        inputValues,
        outputs,
        values: result.values,
        errors: result.errors,
    };
};

export const createDefaultInputValues = (
    template: Pick<NodeGraphTemplate, 'nodes'>,
) => Object.fromEntries(
    getNodeGraphInputNodes(template).map(input => [input.id, input.defaultValue])
);
