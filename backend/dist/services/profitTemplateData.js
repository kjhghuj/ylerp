"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProductProfitTemplateData = exports.validateSharedProfitTemplateData = exports.ProfitTemplateDataValidationError = exports.GRAPH_EXECUTION_LIMITS = void 0;
const mathjs_1 = require("mathjs");
const CURRENT_SCHEMA_VERSION = 2;
const MIN_SAFE_PROFIT_EXCHANGE_RATE = Number.MAX_SAFE_INTEGER / Number.MAX_VALUE;
const SUPPORTED_GRAPH_SCHEMA_VERSIONS = new Set([CURRENT_SCHEMA_VERSION]);
const GRAPH_KEYS = [
    'graphTemplateId',
    'graphTemplateSnapshot',
    'graphInputValues',
    'graphOutputValues',
];
exports.GRAPH_EXECUTION_LIMITS = Object.freeze({
    maxNodes: 500,
    maxEdges: 2000,
    maxVariablesPerFormula: 64,
    maxTotalVariables: 2000,
    maxExpressionLength: 2048,
    maxFormulaAstNodes: 128,
    maxFormulaAstDepth: 32,
    maxFunctionArguments: 8,
});
const strictMath = (0, mathjs_1.create)(mathjs_1.all, {});
const ALLOWED_FORMULA_CONSTANTS = new Set(['pi', 'e']);
const ALLOWED_FORMULA_OPERATORS = new Set(['+', '-', '*', '/', '%', '^']);
const ALLOWED_FORMULA_FUNCTIONS = Object.freeze({
    abs: { minArgs: 1, maxArgs: 1 },
    ceil: { minArgs: 1, maxArgs: 1 },
    floor: { minArgs: 1, maxArgs: 1 },
    round: { minArgs: 1, maxArgs: 2 },
    sqrt: { minArgs: 1, maxArgs: 1 },
    min: { minArgs: 1, maxArgs: exports.GRAPH_EXECUTION_LIMITS.maxFunctionArguments },
    max: { minArgs: 1, maxArgs: exports.GRAPH_EXECUTION_LIMITS.maxFunctionArguments },
    pow: { minArgs: 2, maxArgs: 2 },
});
class ProfitTemplateDataValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProfitTemplateDataValidationError';
    }
}
exports.ProfitTemplateDataValidationError = ProfitTemplateDataValidationError;
const fail = (field, reason) => {
    throw new ProfitTemplateDataValidationError(`${field}: ${reason}`);
};
const isRecord = (value) => (typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value));
const requireRecord = (value, field) => {
    if (!isRecord(value))
        fail(field, 'must be an object');
    return value;
};
const requireString = (value, field) => {
    if (typeof value !== 'string' || !value.trim())
        fail(field, 'must be a non-empty string');
    return value;
};
const validateOptionalString = (value, field) => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
        fail(field, 'must be a string or null when provided');
    }
};
const requireFiniteNumber = (value, field) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(field, 'must be a finite number');
    }
    return value;
};
const validateCurrentSchemaVersion = (value, field = 'schemaVersion') => {
    const version = requireFiniteNumber(value, field);
    if (!Number.isInteger(version) || version !== CURRENT_SCHEMA_VERSION) {
        fail(field, `must be the current version ${CURRENT_SCHEMA_VERSION}`);
    }
    return version;
};
const validateFiniteNumberRecord = (value, field) => {
    const record = requireRecord(value, field);
    const result = {};
    for (const [key, item] of Object.entries(record)) {
        if (!key.trim())
            fail(field, 'keys must be non-empty strings');
        result[key] = requireFiniteNumber(item, `${field}.${key}`);
    }
    return result;
};
const asFormulaPolicyNode = (value) => (typeof value === 'object' &&
    value !== null &&
    typeof value.type === 'string' &&
    typeof value.evaluate === 'function'
    ? value
    : null);
const validateFormulaExpression = (expression, variableLabels, field) => {
    let parsed;
    try {
        const candidate = asFormulaPolicyNode(strictMath.parse(expression));
        if (!candidate)
            fail(field, 'parser returned an invalid AST');
        parsed = candidate;
    }
    catch (error) {
        if (error instanceof ProfitTemplateDataValidationError)
            throw error;
        const message = error instanceof Error ? error.message : 'invalid expression';
        fail(field, `has invalid syntax: ${message}`);
    }
    let nodeCount = 0;
    const visit = (node, depth) => {
        nodeCount += 1;
        if (nodeCount > exports.GRAPH_EXECUTION_LIMITS.maxFormulaAstNodes) {
            fail(field, `AST must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxFormulaAstNodes} nodes`);
        }
        if (depth > exports.GRAPH_EXECUTION_LIMITS.maxFormulaAstDepth) {
            fail(field, `AST must not exceed depth ${exports.GRAPH_EXECUTION_LIMITS.maxFormulaAstDepth}`);
        }
        if (node.type === 'ConstantNode') {
            if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
                fail(field, 'constants must be finite numbers');
            }
            return;
        }
        if (node.type === 'SymbolNode') {
            if (typeof node.name !== 'string')
                fail(field, 'symbols must have a valid name');
            if (!variableLabels.has(node.name) &&
                !ALLOWED_FORMULA_CONSTANTS.has(node.name)) {
                fail(field, `symbol "${String(node.name)}" is not allowed`);
            }
            return;
        }
        if (node.type === 'ParenthesisNode') {
            const content = asFormulaPolicyNode(node.content);
            if (!content)
                fail(field, 'parentheses must contain one scalar expression');
            visit(content, depth + 1);
            return;
        }
        if (node.type === 'OperatorNode') {
            if (typeof node.op !== 'string' || !ALLOWED_FORMULA_OPERATORS.has(node.op)) {
                fail(field, `operator "${String(node.op)}" is not allowed`);
            }
            if (!Array.isArray(node.args) || (node.args.length !== 1 && node.args.length !== 2)) {
                fail(field, `operator "${String(node.op)}" must have one or two scalar operands`);
            }
            const operatorArgs = node.args;
            if (operatorArgs.length === 1 && node.op !== '+' && node.op !== '-') {
                fail(field, `unary operator "${node.op}" is not allowed`);
            }
            for (const argument of operatorArgs) {
                const argumentNode = asFormulaPolicyNode(argument);
                if (!argumentNode)
                    fail(field, `operator "${node.op}" contains an invalid operand`);
                visit(argumentNode, depth + 1);
            }
            return;
        }
        if (node.type === 'FunctionNode') {
            const functionNode = asFormulaPolicyNode(node.fn);
            if (!functionNode) {
                fail(field, 'only direct calls to approved scalar functions are allowed');
            }
            const directFunctionNode = functionNode;
            if (directFunctionNode.type !== 'SymbolNode' || typeof directFunctionNode.name !== 'string') {
                fail(field, 'only direct calls to approved scalar functions are allowed');
            }
            const functionName = directFunctionNode.name;
            const policy = ALLOWED_FORMULA_FUNCTIONS[functionName];
            if (!policy)
                fail(field, `function "${String(directFunctionNode.name)}" is not allowed`);
            if (!Array.isArray(node.args))
                fail(field, `function "${functionName}" has invalid arguments`);
            const functionArgs = node.args;
            if (functionArgs.length < policy.minArgs ||
                functionArgs.length > policy.maxArgs ||
                functionArgs.length > exports.GRAPH_EXECUTION_LIMITS.maxFunctionArguments) {
                fail(field, `function "${functionName}" received an unsupported number of arguments`);
            }
            for (const argument of functionArgs) {
                const argumentNode = asFormulaPolicyNode(argument);
                if (!argumentNode)
                    fail(field, `function "${functionName}" contains an invalid argument`);
                visit(argumentNode, depth + 1);
            }
            return;
        }
        fail(field, `AST node "${node.type}" is not allowed`);
    };
    visit(parsed, 1);
    return parsed;
};
const validateParameterNode = (data, path) => {
    const name = requireString(data.name, `${path}.data.name`);
    const rawValueType = data.valueType;
    if (rawValueType !== 'number' && rawValueType !== 'percentage') {
        fail(`${path}.data.valueType`, 'must be number or percentage');
    }
    const valueType = rawValueType;
    const min = requireFiniteNumber(data.min, `${path}.data.min`);
    const max = requireFiniteNumber(data.max, `${path}.data.max`);
    const defaultValue = requireFiniteNumber(data.defaultValue, `${path}.data.defaultValue`);
    if (min > max)
        fail(`${path}.data.min`, 'must not exceed max');
    if (defaultValue < min || defaultValue > max) {
        fail(`${path}.data.defaultValue`, 'must be within min and max');
    }
    return {
        name,
        valueType,
        min,
        max,
        defaultValue,
    };
};
const validateFormulaNode = (data, path) => {
    const name = requireString(data.name, `${path}.data.name`);
    const expression = requireString(data.expression, `${path}.data.expression`);
    if (expression.length > exports.GRAPH_EXECUTION_LIMITS.maxExpressionLength) {
        fail(`${path}.data.expression`, `must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxExpressionLength} characters`);
    }
    const variablesValue = data.variables;
    if (!Array.isArray(variablesValue))
        fail(`${path}.data.variables`, 'must be an array');
    const variables = variablesValue;
    if (variables.length > exports.GRAPH_EXECUTION_LIMITS.maxVariablesPerFormula) {
        fail(`${path}.data.variables`, `must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxVariablesPerFormula} variables`);
    }
    const portIds = new Set();
    const labels = new Set();
    const parsedVariables = variables.map((value, index) => {
        const variable = requireRecord(value, `${path}.data.variables[${index}]`);
        const portId = requireString(variable.portId, `${path}.data.variables[${index}].portId`);
        const label = requireString(variable.label, `${path}.data.variables[${index}].label`);
        if (portIds.has(portId))
            fail(`${path}.data.variables[${index}].portId`, 'must be unique');
        if (labels.has(label))
            fail(`${path}.data.variables[${index}].label`, 'must be unique');
        portIds.add(portId);
        labels.add(label);
        return { portId, label };
    });
    const expressionNode = validateFormulaExpression(expression, labels, `${path}.data.expression`);
    return { name, expression, variables: parsedVariables, expressionNode };
};
const validateOutputNode = (data, path) => ({
    name: requireString(data.name, `${path}.data.name`),
});
const topologicalOrder = (nodes, edges) => {
    const inDegree = new Map(nodes.map(node => [node.id, 0]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));
    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        outgoing.get(edge.source)?.push(edge.target);
    }
    const queue = nodes.filter(node => inDegree.get(node.id) === 0).map(node => node.id);
    const order = [];
    for (let index = 0; index < queue.length; index += 1) {
        const nodeId = queue[index];
        order.push(nodeId);
        for (const targetId of outgoing.get(nodeId) || []) {
            const nextDegree = (inDegree.get(targetId) || 0) - 1;
            inDegree.set(targetId, nextDegree);
            if (nextDegree === 0)
                queue.push(targetId);
        }
    }
    return order;
};
const validateGraphSnapshot = (value, graphTemplateId) => {
    const snapshot = requireRecord(value, 'graphTemplateSnapshot');
    const snapshotId = requireString(snapshot.id, 'graphTemplateSnapshot.id');
    if (snapshotId !== graphTemplateId) {
        fail('graphTemplateSnapshot.id', 'must match graphTemplateId');
    }
    requireString(snapshot.name, 'graphTemplateSnapshot.name');
    requireString(snapshot.createdAt, 'graphTemplateSnapshot.createdAt');
    requireString(snapshot.updatedAt, 'graphTemplateSnapshot.updatedAt');
    validateOptionalString(snapshot.type, 'graphTemplateSnapshot.type');
    validateOptionalString(snapshot.country, 'graphTemplateSnapshot.country');
    validateOptionalString(snapshot.platform, 'graphTemplateSnapshot.platform');
    validateOptionalString(snapshot.productId, 'graphTemplateSnapshot.productId');
    const snapshotNodesValue = snapshot.nodes;
    const snapshotEdgesValue = snapshot.edges;
    if (!Array.isArray(snapshotNodesValue))
        fail('graphTemplateSnapshot.nodes', 'must be an array');
    if (!Array.isArray(snapshotEdgesValue))
        fail('graphTemplateSnapshot.edges', 'must be an array');
    const snapshotNodes = snapshotNodesValue;
    const snapshotEdges = snapshotEdgesValue;
    if (snapshotNodes.length > exports.GRAPH_EXECUTION_LIMITS.maxNodes) {
        fail('graphTemplateSnapshot.nodes', `must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxNodes} nodes`);
    }
    if (snapshotEdges.length > exports.GRAPH_EXECUTION_LIMITS.maxEdges) {
        fail('graphTemplateSnapshot.edges', `must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxEdges} edges`);
    }
    const nodeIds = new Set();
    let totalVariables = 0;
    const nodes = snapshotNodes.map((value, index) => {
        const path = `graphTemplateSnapshot.nodes[${index}]`;
        const node = requireRecord(value, path);
        const id = requireString(node.id, `${path}.id`);
        if (nodeIds.has(id))
            fail('graphTemplateSnapshot.nodes', `duplicate node id ${id}`);
        nodeIds.add(id);
        const rawType = requireString(node.type, `${path}.type`);
        if (rawType !== 'parameter' && rawType !== 'formula' && rawType !== 'output') {
            fail(`${path}.type`, 'must be parameter, formula, or output');
        }
        const type = rawType;
        const position = requireRecord(node.position, `${path}.position`);
        requireFiniteNumber(position.x, `${path}.position.x`);
        requireFiniteNumber(position.y, `${path}.position.y`);
        const data = requireRecord(node.data, `${path}.data`);
        if (type === 'parameter') {
            return { id, type, data: validateParameterNode(data, path), path };
        }
        if (type === 'formula') {
            const formulaData = validateFormulaNode(data, path);
            totalVariables += formulaData.variables.length;
            return { id, type, data: formulaData, path };
        }
        return { id, type, data: validateOutputNode(data, path), path };
    });
    if (totalVariables > exports.GRAPH_EXECUTION_LIMITS.maxTotalVariables) {
        fail('graphTemplateSnapshot.nodes', `formula variables must not exceed ${exports.GRAPH_EXECUTION_LIMITS.maxTotalVariables} in total`);
    }
    const edgeIds = new Set();
    const incomingByTarget = new Map(nodes.map(node => [node.id, []]));
    const edges = snapshotEdges.map((value, index) => {
        const path = `graphTemplateSnapshot.edges[${index}]`;
        const edge = requireRecord(value, path);
        const id = requireString(edge.id, `${path}.id`);
        if (edgeIds.has(id))
            fail('graphTemplateSnapshot.edges', `duplicate edge id ${id}`);
        edgeIds.add(id);
        const source = requireString(edge.source, `${path}.source`);
        const target = requireString(edge.target, `${path}.target`);
        if (!nodeIds.has(source))
            fail(`${path}.source`, 'must reference an existing node');
        if (!nodeIds.has(target))
            fail(`${path}.target`, 'must reference an existing node');
        validateOptionalString(edge.sourceHandle, `${path}.sourceHandle`);
        validateOptionalString(edge.targetHandle, `${path}.targetHandle`);
        if (typeof edge.sourceHandle === 'string' && !edge.sourceHandle.trim()) {
            fail(`${path}.sourceHandle`, 'must be a non-empty string when provided');
        }
        if (typeof edge.targetHandle === 'string' && !edge.targetHandle.trim()) {
            fail(`${path}.targetHandle`, 'must be a non-empty string when provided');
        }
        const validated = {
            id,
            source,
            target,
            ...(typeof edge.targetHandle === 'string' ? { targetHandle: edge.targetHandle } : {}),
        };
        incomingByTarget.get(target)?.push(validated);
        return validated;
    });
    const sortedNodeIds = topologicalOrder(nodes, edges);
    if (sortedNodeIds.length !== nodes.length) {
        fail('graphTemplateSnapshot.edges', 'must not contain a dependency cycle');
    }
    const parameterNodes = nodes.filter(node => node.type === 'parameter');
    const outputNodes = nodes.filter(node => node.type === 'output');
    if (outputNodes.length === 0) {
        fail('graphTemplateSnapshot.nodes', 'must contain at least one output node');
    }
    for (const node of nodes) {
        const incoming = incomingByTarget.get(node.id) || [];
        if (node.type === 'parameter' && incoming.length > 0) {
            fail(node.path, 'parameter nodes must not have incoming edges');
        }
        if (node.type === 'formula') {
            const formulaData = node.data;
            const declaredPorts = new Set(formulaData.variables.map(variable => variable.portId));
            for (let index = 0; index < formulaData.variables.length; index += 1) {
                const variable = formulaData.variables[index];
                const matches = incoming.filter(edge => edge.targetHandle === variable.portId);
                if (matches.length !== 1) {
                    fail(`${node.path}.data.variables[${index}]`, 'must have exactly one matching incoming edge');
                }
            }
            const undeclared = incoming.find(edge => !edge.targetHandle || !declaredPorts.has(edge.targetHandle));
            if (undeclared) {
                fail(`graphTemplateSnapshot.edges.${undeclared.id}`, 'targets an undeclared formula variable');
            }
        }
        if (node.type === 'output' && incoming.length !== 1) {
            fail(node.path, 'output must have exactly one incoming edge');
        }
    }
    return {
        nodes,
        nodeById: new Map(nodes.map(node => [node.id, node])),
        incomingByTarget,
        sortedNodeIds,
        parameterNodes,
        outputNodes,
    };
};
const validateRuntimeRecordKeys = (record, nodes, field) => {
    const expectedIds = new Set(nodes.map(node => node.id));
    for (const node of nodes) {
        if (!Object.prototype.hasOwnProperty.call(record, node.id)) {
            fail(`${field}.${node.id}`, 'is required');
        }
    }
    for (const key of Object.keys(record)) {
        if (!expectedIds.has(key))
            fail(`${field}.${key}`, 'does not match a graph node');
    }
};
const evaluateValidatedGraph = (graph, graphInputValues) => {
    const values = new Map();
    for (const nodeId of graph.sortedNodeIds) {
        const node = graph.nodeById.get(nodeId);
        if (node.type === 'parameter') {
            const data = node.data;
            const input = graphInputValues[node.id];
            if (input < data.min || input > data.max) {
                fail(`graphInputValues.${node.id}`, `must be within ${data.min} and ${data.max}`);
            }
            values.set(node.id, data.valueType === 'percentage' ? input / 100 : input);
            continue;
        }
        const incoming = graph.incomingByTarget.get(node.id) || [];
        if (node.type === 'formula') {
            const data = node.data;
            const scope = {};
            for (const variable of data.variables) {
                const edge = incoming.find(item => item.targetHandle === variable.portId);
                const value = values.get(edge.source);
                if (typeof value !== 'number' || !Number.isFinite(value)) {
                    fail(node.path, `depends on unavailable result from ${edge.source}`);
                }
                scope[variable.label] = value;
            }
            try {
                const result = data.expressionNode.evaluate(scope);
                if (typeof result !== 'number' || !Number.isFinite(result)) {
                    fail(`${node.path}.data.expression`, 'must evaluate to a finite number');
                }
                values.set(node.id, result);
            }
            catch (error) {
                if (error instanceof ProfitTemplateDataValidationError)
                    throw error;
                const message = error instanceof Error ? error.message : 'formula evaluation failed';
                fail(`${node.path}.data.expression`, `cannot execute: ${message}`);
            }
            continue;
        }
        const sourceValue = values.get(incoming[0].source);
        if (typeof sourceValue !== 'number' || !Number.isFinite(sourceValue)) {
            fail(node.path, 'must resolve to a finite upstream value');
        }
        values.set(node.id, sourceValue);
    }
    return values;
};
const outputsMatch = (persisted, computed) => {
    const tolerance = 1e-10 * Math.max(1, Math.abs(persisted), Math.abs(computed));
    return Math.abs(persisted - computed) <= tolerance;
};
const validateGraphData = (data) => {
    const schemaVersion = requireFiniteNumber(data.schemaVersion, 'schemaVersion');
    if (!Number.isInteger(schemaVersion) || !SUPPORTED_GRAPH_SCHEMA_VERSIONS.has(schemaVersion)) {
        fail('schemaVersion', 'is not supported for graph templates');
    }
    const graphTemplateId = requireString(data.graphTemplateId, 'graphTemplateId');
    const graph = validateGraphSnapshot(data.graphTemplateSnapshot, graphTemplateId);
    const graphInputValues = validateFiniteNumberRecord(data.graphInputValues, 'graphInputValues');
    const graphOutputValues = validateFiniteNumberRecord(data.graphOutputValues, 'graphOutputValues');
    validateRuntimeRecordKeys(graphInputValues, graph.parameterNodes, 'graphInputValues');
    validateRuntimeRecordKeys(graphOutputValues, graph.outputNodes, 'graphOutputValues');
    const values = evaluateValidatedGraph(graph, graphInputValues);
    for (const output of graph.outputNodes) {
        const computed = values.get(output.id);
        if (!outputsMatch(graphOutputValues[output.id], computed)) {
            fail(`graphOutputValues.${output.id}`, 'must match the executable graph result');
        }
    }
    if (data.kind !== 'graph') {
        fail('kind', 'must be graph when graph fields are present');
    }
};
const isGraphClaim = (data) => (data.kind === 'graph' ||
    GRAPH_KEYS.some(key => Object.prototype.hasOwnProperty.call(data, key)));
const validateInvalidCompatibilityData = (data) => {
    if (data.compatibilityEnvelope !== true) {
        fail('compatibilityEnvelope', 'must be true for explicit invalid compatibility data');
    }
    const version = requireFiniteNumber(data.schemaVersion, 'schemaVersion');
    if (!Number.isInteger(version) || version <= 0) {
        fail('schemaVersion', 'must be a positive integer for invalid compatibility data');
    }
    requireRecord(data.rawData, 'rawData');
    if (GRAPH_KEYS.some(key => Object.prototype.hasOwnProperty.call(data, key))) {
        fail('kind', 'invalid compatibility data must use only the rawData envelope');
    }
};
const validateExchangeRateSnapshot = (data) => {
    const hasRate = Object.prototype.hasOwnProperty.call(data, 'exchangeRate');
    const hasTimestamp = Object.prototype.hasOwnProperty.call(data, 'exchangeRateAt');
    if (!hasRate && !hasTimestamp)
        return;
    if (!hasRate)
        fail('exchangeRate', 'is required when exchangeRateAt is provided');
    if (!hasTimestamp)
        fail('exchangeRateAt', 'is required when exchangeRate is provided');
    const rate = requireFiniteNumber(data.exchangeRate, 'exchangeRate');
    if (rate < MIN_SAFE_PROFIT_EXCHANGE_RATE || rate > Number.MAX_SAFE_INTEGER) {
        fail('exchangeRate', 'must be within the supported finite conversion range');
    }
    const timestamp = requireString(data.exchangeRateAt, 'exchangeRateAt');
    const parsedTimestamp = Date.parse(timestamp);
    if (!Number.isFinite(parsedTimestamp) || new Date(parsedTimestamp).toISOString() !== timestamp) {
        fail('exchangeRateAt', 'must be a canonical ISO timestamp');
    }
};
const validateStandardData = (data) => {
    if (data.schemaVersion !== undefined) {
        validateCurrentSchemaVersion(data.schemaVersion);
    }
    else if (data.kind === 'standard') {
        fail('schemaVersion', `is required for current standard templates`);
    }
    validateExchangeRateSnapshot(data);
};
const validateTemplateData = (value, allowInvalid) => {
    const data = requireRecord(value, 'data');
    if (data.kind === 'invalid') {
        if (!allowInvalid)
            fail('kind', 'invalid compatibility data cannot be saved as a shared template');
        validateInvalidCompatibilityData(data);
        return data;
    }
    if (isGraphClaim(data)) {
        validateGraphData(data);
        return data;
    }
    if (data.kind !== undefined && data.kind !== 'standard') {
        fail('kind', 'must be standard, graph, or explicit invalid compatibility data');
    }
    validateStandardData(data);
    return data;
};
const validateSharedProfitTemplateData = (value) => validateTemplateData(value, false);
exports.validateSharedProfitTemplateData = validateSharedProfitTemplateData;
const validateProductProfitTemplateData = (value) => validateTemplateData(value, true);
exports.validateProductProfitTemplateData = validateProductProfitTemplateData;
