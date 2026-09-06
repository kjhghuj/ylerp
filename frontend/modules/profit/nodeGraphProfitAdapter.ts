import { all, create } from 'mathjs';
import { topologicalSort } from './formulaEngine';
import type {
    DesignerEdge,
    DesignerNode,
    FormulaNodeData,
    NodeGraphTemplate,
    OutputNodeData,
    ParameterNodeData,
} from './nodeGraphTypes';

export const GRAPH_EXECUTION_LIMITS = Object.freeze({
    maxNodes: 500,
    maxEdges: 2000,
    maxVariablesPerFormula: 64,
    maxTotalVariables: 2000,
    maxExpressionLength: 2048,
    maxFormulaAstNodes: 128,
    maxFormulaAstDepth: 32,
    maxFunctionArguments: 8,
});

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
    metricKey?: 'netProfitCNY';
}

export type NodeGraphEvaluationErrorCode =
    | 'missing_input'
    | 'non_finite_input'
    | 'input_out_of_range'
    | 'invalid_parameter'
    | 'invalid_binding'
    | 'formula_error'
    | 'dependency_error'
    | 'cycle'
    | 'graph_structure'
    | 'missing_output'
    | 'non_finite_output';

export interface NodeGraphEvaluationError {
    code: NodeGraphEvaluationErrorCode;
    message: string;
    context: Record<string, string | number>;
    nodeId?: string;
    inputId?: string;
}

export type NodeGraphEvaluationErrorLabels = Record<NodeGraphEvaluationErrorCode, string>;

interface NodeGraphEvaluationSuccess {
    ok: true;
    inputValues: Record<string, number>;
    outputs: NodeGraphOutputDescriptor[];
    values: Map<string, number>;
}

interface NodeGraphEvaluationFailure {
    ok: false;
    inputValues: Record<string, unknown>;
    errors: NodeGraphEvaluationError[];
}

export type NodeGraphProfitEvaluation =
    | NodeGraphEvaluationSuccess
    | NodeGraphEvaluationFailure;

interface GraphStructure {
    nodeById: Map<string, DesignerNode>;
    incomingByTarget: Map<string, DesignerEdge[]>;
    sortedNodeIds: string[];
    outputNodes: DesignerNode[];
}

const strictMath = create(all, {});
const ALLOWED_FORMULA_CONSTANTS = new Set(['pi', 'e']);
const ALLOWED_FORMULA_OPERATORS = new Set(['+', '-', '*', '/', '%', '^']);
const ALLOWED_FORMULA_FUNCTIONS = Object.freeze({
    abs: { minArgs: 1, maxArgs: 1 },
    ceil: { minArgs: 1, maxArgs: 1 },
    floor: { minArgs: 1, maxArgs: 1 },
    round: { minArgs: 1, maxArgs: 2 },
    sqrt: { minArgs: 1, maxArgs: 1 },
    min: { minArgs: 1, maxArgs: GRAPH_EXECUTION_LIMITS.maxFunctionArguments },
    max: { minArgs: 1, maxArgs: GRAPH_EXECUTION_LIMITS.maxFunctionArguments },
    pow: { minArgs: 2, maxArgs: 2 },
});
type AllowedFormulaFunction = keyof typeof ALLOWED_FORMULA_FUNCTIONS;

interface FormulaPolicyNode {
    type: string;
    value?: unknown;
    name?: unknown;
    op?: unknown;
    args?: unknown;
    content?: unknown;
    fn?: unknown;
    evaluate: (scope?: Record<string, number>) => unknown;
}

interface FormulaPolicySuccess {
    ok: true;
    node: FormulaPolicyNode;
}

interface FormulaPolicyFailure {
    ok: false;
    detail: string;
}

type FormulaPolicyResult = FormulaPolicySuccess | FormulaPolicyFailure;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const isNonEmptyString = (value: unknown): value is string => (
    typeof value === 'string' && value.trim().length > 0
);

const readFiniteNumber = (value: unknown, fallback = 0): number => (
    isFiniteNumber(value) ? value : fallback
);

const graphFailure = (
    inputValues: Record<string, unknown>,
    errors: NodeGraphEvaluationError[],
): NodeGraphEvaluationFailure => ({
    ok: false,
    inputValues: { ...inputValues },
    errors,
});

const graphStructureError = (message: string, nodeId?: string): NodeGraphEvaluationError => ({
    code: 'graph_structure',
    message,
    context: { detail: message },
    ...(nodeId ? { nodeId } : {}),
});

const asFormulaPolicyNode = (value: unknown): FormulaPolicyNode | null => (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { evaluate?: unknown }).evaluate === 'function'
        ? value as FormulaPolicyNode
        : null
);

const validateFormulaPolicy = (
    expression: string,
    variableLabels: Set<string>,
): FormulaPolicyResult => {
    let parsed: FormulaPolicyNode;
    try {
        const candidate = asFormulaPolicyNode(strictMath.parse(expression));
        if (!candidate) return { ok: false, detail: 'formula parser returned an invalid AST' };
        parsed = candidate;
    } catch (error) {
        return {
            ok: false,
            detail: error instanceof Error ? `invalid syntax: ${error.message}` : 'invalid syntax',
        };
    }

    let nodeCount = 0;
    const visit = (node: FormulaPolicyNode, depth: number): string | null => {
        nodeCount += 1;
        if (nodeCount > GRAPH_EXECUTION_LIMITS.maxFormulaAstNodes) {
            return `formula AST must not exceed ${GRAPH_EXECUTION_LIMITS.maxFormulaAstNodes} nodes`;
        }
        if (depth > GRAPH_EXECUTION_LIMITS.maxFormulaAstDepth) {
            return `formula AST must not exceed depth ${GRAPH_EXECUTION_LIMITS.maxFormulaAstDepth}`;
        }

        if (node.type === 'ConstantNode') {
            return isFiniteNumber(node.value)
                ? null
                : 'constants must be finite numbers';
        }
        if (node.type === 'SymbolNode') {
            if (typeof node.name !== 'string') return 'symbols must have a valid name';
            return variableLabels.has(node.name) || ALLOWED_FORMULA_CONSTANTS.has(node.name)
                ? null
                : `symbol "${node.name}" is not allowed`;
        }
        if (node.type === 'ParenthesisNode') {
            const content = asFormulaPolicyNode(node.content);
            return content ? visit(content, depth + 1) : 'parentheses must contain one scalar expression';
        }
        if (node.type === 'OperatorNode') {
            if (typeof node.op !== 'string' || !ALLOWED_FORMULA_OPERATORS.has(node.op)) {
                return `operator "${String(node.op)}" is not allowed`;
            }
            if (!Array.isArray(node.args) || (node.args.length !== 1 && node.args.length !== 2)) {
                return `operator "${node.op}" must have one or two scalar operands`;
            }
            if (node.args.length === 1 && node.op !== '+' && node.op !== '-') {
                return `unary operator "${node.op}" is not allowed`;
            }
            for (const argument of node.args) {
                const argumentNode = asFormulaPolicyNode(argument);
                if (!argumentNode) return `operator "${node.op}" contains an invalid operand`;
                const error = visit(argumentNode, depth + 1);
                if (error) return error;
            }
            return null;
        }
        if (node.type === 'FunctionNode') {
            const functionNode = asFormulaPolicyNode(node.fn);
            if (
                !functionNode ||
                functionNode.type !== 'SymbolNode' ||
                typeof functionNode.name !== 'string'
            ) {
                return 'only direct calls to approved scalar functions are allowed';
            }
            const functionName = functionNode.name as AllowedFormulaFunction;
            const policy = ALLOWED_FORMULA_FUNCTIONS[functionName];
            if (!policy) return `function "${functionNode.name}" is not allowed`;
            if (!Array.isArray(node.args)) return `function "${functionName}" has invalid arguments`;
            if (
                node.args.length < policy.minArgs ||
                node.args.length > policy.maxArgs ||
                node.args.length > GRAPH_EXECUTION_LIMITS.maxFunctionArguments
            ) {
                return `function "${functionName}" received an unsupported number of arguments`;
            }
            for (const argument of node.args) {
                const argumentNode = asFormulaPolicyNode(argument);
                if (!argumentNode) return `function "${functionName}" contains an invalid argument`;
                const error = visit(argumentNode, depth + 1);
                if (error) return error;
            }
            return null;
        }
        return `AST node "${node.type}" is not allowed`;
    };

    const detail = visit(parsed, 1);
    return detail ? { ok: false, detail } : { ok: true, node: parsed };
};

export const formatNodeGraphEvaluationError = (
    error: Pick<NodeGraphEvaluationError, 'code' | 'context' | 'message'>,
    labels: NodeGraphEvaluationErrorLabels,
): string => {
    const template = labels[error.code] || error.message;
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => (
        Object.prototype.hasOwnProperty.call(error.context, key)
            ? String(error.context[key])
            : `{${key}}`
    ));
};

export const getNodeGraphInputNodes = (
    template: Pick<NodeGraphTemplate, 'nodes'>,
): NodeGraphInputDescriptor[] => {
    if (!Array.isArray(template.nodes)) return [];
    return template.nodes
        .filter(node => node.type === 'parameter')
        .map(node => {
            const data = node.data as ParameterNodeData;
            return {
                id: node.id,
                name: typeof data.name === 'string' && data.name.trim() ? data.name : node.id,
                valueType: data.valueType === 'percentage' ? 'percentage' : 'number',
                min: readFiniteNumber(data.min),
                max: readFiniteNumber(data.max),
                defaultValue: readFiniteNumber(data.defaultValue),
            };
        });
};

const validateGraphStructure = (
    nodes: DesignerNode[],
    edges: DesignerEdge[],
): { errors: NodeGraphEvaluationError[]; structure?: GraphStructure } => {
    const errors: NodeGraphEvaluationError[] = [];
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return { errors: [graphStructureError('graph nodes and edges must be arrays')] };
    }
    if (nodes.length > GRAPH_EXECUTION_LIMITS.maxNodes) {
        errors.push(graphStructureError(
            `graph must not exceed ${GRAPH_EXECUTION_LIMITS.maxNodes} nodes`,
        ));
    }
    if (edges.length > GRAPH_EXECUTION_LIMITS.maxEdges) {
        errors.push(graphStructureError(
            `graph must not exceed ${GRAPH_EXECUTION_LIMITS.maxEdges} edges`,
        ));
    }
    if (errors.length > 0) return { errors };

    const nodeById = new Map<string, DesignerNode>();
    const outputNodes: DesignerNode[] = [];
    let totalVariables = 0;
    for (const node of nodes) {
        if (!isNonEmptyString(node?.id)) {
            errors.push(graphStructureError('node id must be a non-empty string'));
            continue;
        }
        if (nodeById.has(node.id)) {
            errors.push(graphStructureError(`duplicate node id：${node.id}`, node.id));
            continue;
        }
        if (
            !isRecord(node.position) ||
            !isFiniteNumber(node.position.x) ||
            !isFiniteNumber(node.position.y)
        ) {
            errors.push(graphStructureError(`node "${node.id}" must contain a finite position`, node.id));
        }
        if (!isRecord(node.data)) {
            errors.push(graphStructureError(`node "${node.id}" must contain valid data`, node.id));
        } else if (!isNonEmptyString(node.data.name)) {
            errors.push(graphStructureError(`node "${node.id}" must have a non-empty name`, node.id));
        }
        if (node.type !== 'parameter' && node.type !== 'formula' && node.type !== 'output') {
            errors.push(graphStructureError(`node "${node.id}" has an unsupported profit node type`, node.id));
        }
        if (node.type === 'formula') {
            const variables = (node.data as Partial<FormulaNodeData>)?.variables;
            if (Array.isArray(variables)) {
                totalVariables += variables.length;
                if (variables.length > GRAPH_EXECUTION_LIMITS.maxVariablesPerFormula) {
                    errors.push(graphStructureError(
                        `formula node "${node.id}" must not exceed ${GRAPH_EXECUTION_LIMITS.maxVariablesPerFormula} variables`,
                        node.id,
                    ));
                }
            }
            const expression = (node.data as Partial<FormulaNodeData>)?.expression;
            if (
                typeof expression === 'string' &&
                expression.length > GRAPH_EXECUTION_LIMITS.maxExpressionLength
            ) {
                errors.push(graphStructureError(
                    `formula node "${node.id}" expression must not exceed ${GRAPH_EXECUTION_LIMITS.maxExpressionLength} characters`,
                    node.id,
                ));
            }
        }
        if (node.type === 'output') outputNodes.push(node);
        nodeById.set(node.id, node);
    }
    if (totalVariables > GRAPH_EXECUTION_LIMITS.maxTotalVariables) {
        errors.push(graphStructureError(
            `graph formula variables must not exceed ${GRAPH_EXECUTION_LIMITS.maxTotalVariables} in total`,
        ));
    }

    const edgeIds = new Set<string>();
    const incomingByTarget = new Map<string, DesignerEdge[]>();
    for (const nodeId of nodeById.keys()) incomingByTarget.set(nodeId, []);
    for (const edge of edges) {
        if (!isNonEmptyString(edge?.id)) {
            errors.push(graphStructureError('edge id must be a non-empty string'));
            continue;
        }
        if (edgeIds.has(edge.id)) {
            errors.push(graphStructureError(`duplicate edge id：${edge.id}`));
            continue;
        }
        edgeIds.add(edge.id);
        if (!isNonEmptyString(edge.source) || !nodeById.has(edge.source)) {
            errors.push(graphStructureError(`edge "${edge.id}" source must reference an existing node`));
            continue;
        }
        if (!isNonEmptyString(edge.target) || !nodeById.has(edge.target)) {
            errors.push(graphStructureError(`edge "${edge.id}" target must reference an existing node`));
            continue;
        }
        if (
            edge.targetHandle !== undefined &&
            edge.targetHandle !== null &&
            !isNonEmptyString(edge.targetHandle)
        ) {
            errors.push(graphStructureError(`edge "${edge.id}" targetHandle must be a non-empty string`));
        }
        if (
            edge.sourceHandle !== undefined &&
            edge.sourceHandle !== null &&
            !isNonEmptyString(edge.sourceHandle)
        ) {
            errors.push(graphStructureError(`edge "${edge.id}" sourceHandle must be a non-empty string`));
        }
        incomingByTarget.get(edge.target)?.push(edge);
    }
    for (const node of nodes) {
        if (node.type === 'parameter' && (incomingByTarget.get(node.id)?.length ?? 0) > 0) {
            errors.push(graphStructureError(
                `parameter node "${node.id}" must not have incoming edges`,
                node.id,
            ));
        }
    }
    if (outputNodes.length === 0) {
        errors.push({
            code: 'missing_output',
            message: 'graph must contain at least one output node',
            context: { name: 'graph' },
        });
    }
    if (errors.length > 0) return { errors };

    const sortedNodeIds = topologicalSort(nodes, edges);
    if (sortedNodeIds.length !== nodes.length) {
        return {
            errors: [{
                code: 'cycle',
                message: 'graph contains a dependency cycle',
                context: {},
            }],
        };
    }
    return {
        errors: [],
        structure: {
            nodeById,
            incomingByTarget,
            sortedNodeIds,
            outputNodes,
        },
    };
};

const validateRuntimeInputs = (
    template: Pick<NodeGraphTemplate, 'nodes'>,
    inputValues: Record<string, unknown>,
): {
    errors: NodeGraphEvaluationError[];
    values: Record<string, number>;
} => {
    const errors: NodeGraphEvaluationError[] = [];
    const values: Record<string, number> = {};
    const expectedInputIds = new Set(
        template.nodes
            .filter(candidate => candidate.type === 'parameter')
            .map(candidate => candidate.id),
    );
    for (const key of Object.keys(inputValues)) {
        if (!key.trim()) {
            errors.push(graphStructureError('graph input keys must be non-empty'));
        } else if (!expectedInputIds.has(key)) {
            errors.push(graphStructureError(`graph input "${key}" does not match a parameter node`));
        }
    }

    for (const node of template.nodes.filter(candidate => candidate.type === 'parameter')) {
        const data = node.data as ParameterNodeData;
        const name = typeof data.name === 'string' && data.name.trim() ? data.name : node.id;
        const value = inputValues[node.id];
        if (!Object.prototype.hasOwnProperty.call(inputValues, node.id) || value === '' || value === null || value === undefined) {
            errors.push({
                code: 'missing_input',
                nodeId: node.id,
                inputId: node.id,
                message: `missing input "${name}"`,
                context: { name },
            });
            continue;
        }
        if (!isFiniteNumber(value)) {
            errors.push({
                code: 'non_finite_input',
                nodeId: node.id,
                inputId: node.id,
                message: `input "${name}" must be a finite number`,
                context: { name },
            });
            continue;
        }
        if (
            !isFiniteNumber(data.min) ||
            !isFiniteNumber(data.max) ||
            !isFiniteNumber(data.defaultValue) ||
            data.min > data.max ||
            data.defaultValue < data.min ||
            data.defaultValue > data.max ||
            (data.valueType !== 'number' && data.valueType !== 'percentage')
        ) {
            errors.push({
                code: 'invalid_parameter',
                nodeId: node.id,
                inputId: node.id,
                message: `parameter node "${name}" has invalid bounds or value type`,
                context: { name },
            });
            continue;
        }
        if (value < data.min || value > data.max) {
            errors.push({
                code: 'input_out_of_range',
                nodeId: node.id,
                inputId: node.id,
                message: `input "${name}" must be between ${data.min} and ${data.max}`,
                context: { name, min: data.min, max: data.max },
            });
            continue;
        }
        values[node.id] = value;
    }

    return { errors, values };
};

export const evaluateNodeGraphProfitTemplate = (
    template: Pick<NodeGraphTemplate, 'nodes' | 'edges'>,
    inputValues: Record<string, unknown>,
): NodeGraphProfitEvaluation => {
    const validation = validateGraphStructure(template.nodes, template.edges);
    if (validation.errors.length > 0 || !validation.structure) {
        return graphFailure(inputValues, validation.errors);
    }
    const { incomingByTarget, nodeById, outputNodes, sortedNodeIds } = validation.structure;

    const runtimeInputs = validateRuntimeInputs(template, inputValues);
    if (runtimeInputs.errors.length > 0) {
        return graphFailure(inputValues, runtimeInputs.errors);
    }

    const values = new Map<string, number>();
    const nodeErrors = new Map<string, NodeGraphEvaluationError>();
    const errors: NodeGraphEvaluationError[] = [];

    for (const nodeId of sortedNodeIds) {
        const node = nodeById.get(nodeId);
        if (!node) continue;

        if (node.type === 'parameter') {
            const data = node.data as ParameterNodeData;
            const rawValue = runtimeInputs.values[node.id];
            values.set(node.id, data.valueType === 'percentage' ? rawValue / 100 : rawValue);
            continue;
        }

        if (node.type === 'formula') {
            const data = node.data as FormulaNodeData;
            const name = typeof data.name === 'string' && data.name.trim() ? data.name : node.id;
            if (
                typeof data.expression !== 'string' ||
                !data.expression.trim() ||
                !Array.isArray(data.variables)
            ) {
                const error: NodeGraphEvaluationError = {
                    code: 'formula_error',
                    nodeId: node.id,
                    message: `formula node "${name}" must contain an expression and variable definitions`,
                    context: { name, detail: 'missing expression or variable definitions' },
                };
                errors.push(error);
                nodeErrors.set(node.id, error);
                continue;
            }

            const declaredPortIds = new Set<string>();
            const declaredLabels = new Set<string>();
            const variables: Record<string, number> = {};
            let currentError: NodeGraphEvaluationError | undefined;
            let validatedFormulaNode: FormulaPolicyNode | undefined;
            const incoming = incomingByTarget.get(node.id) || [];

            for (const variable of data.variables) {
                if (
                    !variable ||
                    !isNonEmptyString(variable.portId) ||
                    !isNonEmptyString(variable.label) ||
                    declaredPortIds.has(variable.portId) ||
                    declaredLabels.has(variable.label)
                ) {
                    currentError = {
                        code: 'invalid_binding',
                        nodeId: node.id,
                        message: `formula node "${name}" contains invalid or duplicate variable bindings`,
                        context: { name },
                    };
                    break;
                }
                declaredPortIds.add(variable.portId);
                declaredLabels.add(variable.label);

                const matches = incoming.filter(edge => edge.targetHandle === variable.portId);
                if (matches.length !== 1) {
                    currentError = {
                        code: 'invalid_binding',
                        nodeId: node.id,
                        message: `formula node "${name}" variable "${variable.label}" must bind exactly one input`,
                        context: { name, variable: variable.label },
                    };
                    break;
                }
                const sourceId = matches[0].source;
                if (nodeErrors.has(sourceId)) {
                    currentError = {
                        code: 'dependency_error',
                        nodeId: node.id,
                        message: `formula node "${name}" depends on a failed upstream node`,
                        context: { name },
                    };
                    break;
                }
                const sourceValue = values.get(sourceId);
                if (!isFiniteNumber(sourceValue)) {
                    currentError = {
                        code: 'dependency_error',
                        nodeId: node.id,
                        message: `formula node "${name}" is missing an upstream result`,
                        context: { name },
                    };
                    break;
                }
                variables[variable.label] = sourceValue;
            }

            const unmatchedIncoming = incoming.find(
                edge => !edge.targetHandle || !declaredPortIds.has(edge.targetHandle),
            );
            if (!currentError && unmatchedIncoming) {
                currentError = {
                    code: 'invalid_binding',
                    nodeId: node.id,
                    message: `formula node "${name}" contains an undeclared input port`,
                    context: { name },
                };
            }
            if (!currentError) {
                const formulaPolicy = validateFormulaPolicy(data.expression, declaredLabels);
                if (formulaPolicy.ok === false) {
                    currentError = {
                        code: 'formula_error',
                        nodeId: node.id,
                        message: `formula node "${name}" is not allowed: ${formulaPolicy.detail}`,
                        context: { name, detail: formulaPolicy.detail },
                    };
                } else {
                    validatedFormulaNode = formulaPolicy.node;
                }
            }

            if (currentError) {
                errors.push(currentError);
                nodeErrors.set(node.id, currentError);
                continue;
            }

            try {
                if (!validatedFormulaNode) throw new Error('formula policy was not validated');
                const result = validatedFormulaNode.evaluate(variables);
                if (!isFiniteNumber(result)) throw new Error('non-finite result');
                values.set(node.id, result);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'unknown formula error';
                const nonFinite = /division by zero|non-finite|infinite/i.test(message);
                const evaluationError: NodeGraphEvaluationError = {
                    code: nonFinite ? 'non_finite_output' : 'formula_error',
                    nodeId: node.id,
                    message: nonFinite
                        ? `formula node "${name}" produced a non-finite result`
                        : `formula node "${name}" failed to execute: ${message}`,
                    context: { name, detail: message },
                };
                errors.push(evaluationError);
                nodeErrors.set(node.id, evaluationError);
            }
            continue;
        }

        const data = node.data as OutputNodeData;
        const name = typeof data.name === 'string' && data.name.trim() ? data.name : node.id;
        const incoming = incomingByTarget.get(node.id) || [];
        if (incoming.length !== 1) {
            const error: NodeGraphEvaluationError = {
                code: 'missing_output',
                nodeId: node.id,
                message: `output node "${name}" must connect exactly one upstream result`,
                context: { name },
            };
            errors.push(error);
            nodeErrors.set(node.id, error);
            continue;
        }
        const sourceId = incoming[0].source;
        if (nodeErrors.has(sourceId)) {
            const error: NodeGraphEvaluationError = {
                code: 'dependency_error',
                nodeId: node.id,
                message: `output node "${name}" depends on a failed upstream node`,
                context: { name },
            };
            errors.push(error);
            nodeErrors.set(node.id, error);
            continue;
        }
        const sourceValue = values.get(sourceId);
        if (!isFiniteNumber(sourceValue)) {
            const error: NodeGraphEvaluationError = {
                code: 'non_finite_output',
                nodeId: node.id,
                message: `output node "${name}" did not resolve to a finite number`,
                context: { name },
            };
            errors.push(error);
            nodeErrors.set(node.id, error);
            continue;
        }
        values.set(node.id, sourceValue);
    }

    if (errors.length > 0) return graphFailure(inputValues, errors);
    return {
        ok: true,
        inputValues: { ...runtimeInputs.values },
        outputs: outputNodes.map(node => ({
            id: node.id,
            name: ((node.data as OutputNodeData).name || node.id),
            value: values.get(node.id)!,
            ...((node.data as OutputNodeData).metricKey === 'netProfitCNY'
                ? { metricKey: 'netProfitCNY' as const }
                : {}),
        })),
        values,
    };
};

export const createDefaultInputValues = (
    template: Pick<NodeGraphTemplate, 'nodes'>,
) => Object.fromEntries(
    getNodeGraphInputNodes(template).map(input => [input.id, input.defaultValue]),
);
