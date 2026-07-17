import {
    DEFAULT_NODE_DATA,
    normalizeCurrencyCode,
    type GraphProductTemplateData,
    type NodeData,
    type ProductTemplateData,
} from './profit/types';
import type { NodeGraphTemplate } from './node-designer/types';
import {
    extractLegacyProductTaxRateCandidate,
    type LegacyProductTaxRateCandidate,
} from './productTaxRates';

export interface LinkedProductTemplate {
    id: string;
    productId?: string;
    templateId?: string | null;
    name: string;
    country: string;
    platform?: string;
    data: Record<string, unknown>;
}

export interface ProductTemplateImportNode {
    id: string;
    productTemplateLinkId: string;
    templateId?: string | null;
    productId?: string;
    name: string;
    country: string;
    platform: string;
    data: ProductTemplateData;
    legacyTaxRateCandidate: LegacyProductTaxRateCandidate;
}

const nodeDataKeys = Object.keys(DEFAULT_NODE_DATA) as (keyof NodeData)[];
const CURRENT_SCHEMA_VERSION = 2;

export const cloneTemplateValue = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map(entry => cloneTemplateValue(entry)) as T;
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, cloneTemplateValue(entry)]),
        ) as T;
    }
    return value;
};

const normalizeNumber = (value: unknown, fallback: number) => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
    if (typeof value !== 'number' && typeof value !== 'string') return fallback;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const isNonEmptyString = (value: unknown): value is string => (
    typeof value === 'string' && value.trim().length > 0
);

const isOptionalString = (value: unknown): boolean => (
    value === undefined || value === null || typeof value === 'string'
);

const isParameterData = (value: Record<string, unknown>): boolean => (
    isNonEmptyString(value.name) &&
    (value.valueType === 'number' || value.valueType === 'percentage') &&
    isFiniteNumber(value.min) &&
    isFiniteNumber(value.max) &&
    value.min <= value.max &&
    isFiniteNumber(value.defaultValue)
);

const isFormulaVariable = (value: unknown): boolean => (
    isRecord(value) &&
    isNonEmptyString(value.portId) &&
    isNonEmptyString(value.label)
);

const isFormulaData = (value: Record<string, unknown>): boolean => (
    isNonEmptyString(value.name) &&
    typeof value.expression === 'string' &&
    Array.isArray(value.variables) &&
    value.variables.every(isFormulaVariable)
);

const isOutputData = (value: Record<string, unknown>): boolean => (
    isNonEmptyString(value.name)
);

const isGraphNode = (value: unknown): boolean => {
    if (
        !isRecord(value) ||
        !isNonEmptyString(value.id) ||
        !isRecord(value.position) ||
        !isFiniteNumber(value.position.x) ||
        !isFiniteNumber(value.position.y) ||
        !isRecord(value.data)
    ) {
        return false;
    }
    if (value.type === 'parameter') return isParameterData(value.data);
    if (value.type === 'formula') return isFormulaData(value.data);
    if (value.type === 'output') return isOutputData(value.data);
    return false;
};

const isGraphEdge = (value: unknown, nodeIds: Set<string>): boolean => (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.source) &&
    isNonEmptyString(value.target) &&
    nodeIds.has(value.source) &&
    nodeIds.has(value.target) &&
    isOptionalString(value.sourceHandle) &&
    isOptionalString(value.targetHandle)
);

const isNodeGraphTemplate = (value: unknown): value is NodeGraphTemplate => {
    if (
        !isRecord(value) ||
        !isNonEmptyString(value.id) ||
        !isNonEmptyString(value.name) ||
        !isNonEmptyString(value.createdAt) ||
        !isNonEmptyString(value.updatedAt) ||
        !isOptionalString(value.type) ||
        !isOptionalString(value.country) ||
        !isOptionalString(value.platform) ||
        !isOptionalString(value.productId) ||
        !Array.isArray(value.nodes) ||
        !value.nodes.every(isGraphNode) ||
        !Array.isArray(value.edges)
    ) {
        return false;
    }
    const nodeIds = new Set(value.nodes.map(node => (node as Record<string, unknown>).id as string));
    if (nodeIds.size !== value.nodes.length) return false;
    const edgeIds = new Set<string>();
    for (const edge of value.edges) {
        if (!isGraphEdge(edge, nodeIds)) return false;
        const edgeId = (edge as Record<string, unknown>).id as string;
        if (edgeIds.has(edgeId)) return false;
        edgeIds.add(edgeId);
    }
    return true;
};

const toNumberRecord = (value: unknown): Record<string, number> | undefined => {
    if (!isRecord(value)) return undefined;
    const entries: [string, number][] = [];
    for (const [key, entry] of Object.entries(value)) {
        if (
            key.trim().length === 0 ||
            (typeof entry !== 'number' && typeof entry !== 'string') ||
            (typeof entry === 'string' && entry.trim() === '')
        ) {
            return undefined;
        }
        const parsed = typeof entry === 'number' ? entry : Number(entry);
        if (!Number.isFinite(parsed)) return undefined;
        entries.push([key, parsed]);
    }
    return Object.fromEntries(entries);
};

export const toStandardNodeData = (
    data: Partial<Record<keyof NodeData, unknown>> | ProductTemplateData,
): NodeData => {
    const normalized = { ...DEFAULT_NODE_DATA };
    const source = 'kind' in data
        ? data.kind === 'invalid' ? data.rawData : data.nodeData
        : data;
    for (const key of nodeDataKeys) {
        if (source && Object.prototype.hasOwnProperty.call(source, key)) {
            normalized[key] = normalizeNumber(source[key], DEFAULT_NODE_DATA[key]);
        }
    }
    return normalized;
};

const GRAPH_FIELD_KEYS = [
    'graphTemplateId',
    'graphTemplateSnapshot',
    'graphInputValues',
    'graphOutputValues',
] as const;

const toPartialNodeData = (data: Record<string, unknown>): Partial<NodeData> => {
    const nodeData: Partial<NodeData> = {};
    for (const key of nodeDataKeys) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            nodeData[key] = normalizeNumber(data[key], DEFAULT_NODE_DATA[key]);
        }
    }
    return nodeData;
};

export const isGraphProductTemplateData = (
    data: ProductTemplateData,
): data is GraphProductTemplateData => (
    data.kind === 'graph' &&
    typeof data.graphTemplateId === 'string' &&
    data.graphTemplateId.length > 0 &&
    isNodeGraphTemplate(data.graphTemplateSnapshot) &&
    data.graphTemplateSnapshot.id === data.graphTemplateId &&
    toNumberRecord(data.graphInputValues) !== undefined &&
    toNumberRecord(data.graphOutputValues) !== undefined
);

export const cloneProductTemplateData = (data: ProductTemplateData): ProductTemplateData => {
    if (data.kind === 'invalid') {
        return {
            kind: 'invalid',
            schemaVersion: data.schemaVersion,
            rawData: cloneTemplateValue(data.rawData),
        };
    }
    if (data.kind === 'graph') {
        return {
            kind: 'graph',
            schemaVersion: data.schemaVersion,
            nodeData: cloneTemplateValue(data.nodeData),
            extraData: cloneTemplateValue(data.extraData),
            graphTemplateId: data.graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(data.graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(data.graphInputValues),
            graphOutputValues: cloneTemplateValue(data.graphOutputValues),
        };
    }
    return {
        kind: 'standard',
        schemaVersion: data.schemaVersion,
        nodeData: cloneTemplateValue(data.nodeData),
        extraData: cloneTemplateValue(data.extraData),
    };
};

const readSchemaVersion = (value: unknown): number | undefined => {
    if (value === undefined) return CURRENT_SCHEMA_VERSION;
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const invalidProductTemplateData = (
    data: Record<string, unknown>,
    schemaVersion: number | undefined,
): ProductTemplateData => ({
    kind: 'invalid',
    schemaVersion: schemaVersion ?? CURRENT_SCHEMA_VERSION,
    rawData: cloneTemplateValue(data),
});

/** Parses the flat API payload. Unknown keys, including nodeData/extraData, stay user data. */
export const normalizeProductTemplateData = (data: Record<string, unknown>): ProductTemplateData => {
    const boundarySchemaVersion = readSchemaVersion(data.schemaVersion);
    if (boundarySchemaVersion !== CURRENT_SCHEMA_VERSION) {
        return invalidProductTemplateData(data, boundarySchemaVersion);
    }
    const schemaVersion = boundarySchemaVersion;

    const nodeData = toPartialNodeData(data);

    const graphInputValues = toNumberRecord(data.graphInputValues);
    const graphOutputValues = toNumberRecord(data.graphOutputValues);
    const hasGraphFields = GRAPH_FIELD_KEYS.some(key => Object.prototype.hasOwnProperty.call(data, key));
    const hasCompleteGraph = (
        typeof data.graphTemplateId === 'string' &&
        data.graphTemplateId.length > 0 &&
        isNodeGraphTemplate(data.graphTemplateSnapshot) &&
        data.graphTemplateSnapshot.id === data.graphTemplateId &&
        graphInputValues !== undefined &&
        graphOutputValues !== undefined
    );
    const sourceKind = data.kind;
    const hasUnknownKind = sourceKind !== undefined &&
        sourceKind !== 'standard' &&
        sourceKind !== 'graph' &&
        sourceKind !== 'invalid';
    const hasKindConflict = sourceKind === 'standard' && hasGraphFields;
    if (
        sourceKind === 'invalid' ||
        hasUnknownKind ||
        hasKindConflict ||
        ((hasGraphFields || sourceKind === 'graph') && !hasCompleteGraph)
    ) {
        return invalidProductTemplateData(data, schemaVersion);
    }

    const excludedKeys = new Set<string>([
        ...nodeDataKeys,
        ...GRAPH_FIELD_KEYS,
        'kind',
        'schemaVersion',
    ]);
    const extraData = Object.fromEntries(
        Object.entries(data)
            .filter(([key]) => !excludedKeys.has(key))
            .map(([key, value]) => [key, cloneTemplateValue(value)]),
    );
    if (hasCompleteGraph) {
        return {
            kind: 'graph',
            schemaVersion,
            nodeData: cloneTemplateValue(nodeData),
            extraData: cloneTemplateValue(extraData),
            graphTemplateId: data.graphTemplateId as string,
            graphTemplateSnapshot: cloneTemplateValue(data.graphTemplateSnapshot as NodeGraphTemplate),
            graphInputValues: cloneTemplateValue(graphInputValues as Record<string, number>),
            graphOutputValues: cloneTemplateValue(graphOutputValues as Record<string, number>),
        };
    }
    return {
        kind: 'standard',
        schemaVersion,
        nodeData: cloneTemplateValue(nodeData),
        extraData: cloneTemplateValue(extraData),
    };
};

const normalizeProductTemplateApiData = (data: Record<string, unknown>): ProductTemplateData => {
    const schemaVersion = readSchemaVersion(data.schemaVersion);
    if (
        data.kind === 'invalid' &&
        data.compatibilityEnvelope === true &&
        schemaVersion !== undefined &&
        isRecord(data.rawData)
    ) {
        return {
            kind: 'invalid',
            schemaVersion,
            rawData: cloneTemplateValue(data.rawData),
        };
    }
    return normalizeProductTemplateData(data);
};

/** Parses the explicitly internal persistedData envelope used only by local storage. */
export const normalizeStoredProductTemplateData = (
    persistedData: unknown,
    legacyNodeData: Record<string, unknown>,
): ProductTemplateData => {
    if (!isRecord(persistedData)) {
        return normalizeProductTemplateData(legacyNodeData);
    }
    if (persistedData.kind === 'invalid' && isRecord(persistedData.rawData)) {
        return {
            kind: 'invalid',
            schemaVersion: readSchemaVersion(persistedData.schemaVersion) ?? CURRENT_SCHEMA_VERSION,
            rawData: cloneTemplateValue(persistedData.rawData),
        };
    }
    const persistedSchemaVersion = readSchemaVersion(persistedData.schemaVersion);
    if (persistedSchemaVersion !== CURRENT_SCHEMA_VERSION) {
        return invalidProductTemplateData(persistedData, persistedSchemaVersion);
    }
    if (persistedData.kind === 'standard') {
        if (
            !isRecord(persistedData.nodeData) ||
            !isRecord(persistedData.extraData) ||
            GRAPH_FIELD_KEYS.some(key => Object.prototype.hasOwnProperty.call(persistedData, key))
        ) {
            return invalidProductTemplateData(persistedData, persistedSchemaVersion);
        }
        return {
            kind: 'standard',
            schemaVersion: persistedSchemaVersion,
            nodeData: cloneTemplateValue(toPartialNodeData(persistedData.nodeData)),
            extraData: cloneTemplateValue(persistedData.extraData),
        };
    }
    if (persistedData.kind === 'graph') {
        const graphInputValues = toNumberRecord(persistedData.graphInputValues);
        const graphOutputValues = toNumberRecord(persistedData.graphOutputValues);
        if (
            !isRecord(persistedData.nodeData) ||
            !isRecord(persistedData.extraData) ||
            typeof persistedData.graphTemplateId !== 'string' ||
            persistedData.graphTemplateId.length === 0 ||
            !isNodeGraphTemplate(persistedData.graphTemplateSnapshot) ||
            persistedData.graphTemplateSnapshot.id !== persistedData.graphTemplateId ||
            graphInputValues === undefined ||
            graphOutputValues === undefined
        ) {
            return invalidProductTemplateData(persistedData, persistedSchemaVersion);
        }
        return {
            kind: 'graph',
            schemaVersion: persistedSchemaVersion,
            nodeData: cloneTemplateValue(toPartialNodeData(persistedData.nodeData)),
            extraData: cloneTemplateValue(persistedData.extraData),
            graphTemplateId: persistedData.graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(persistedData.graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(graphInputValues),
            graphOutputValues: cloneTemplateValue(graphOutputValues),
        };
    }
    return normalizeProductTemplateData(persistedData);
};

export const matchesActiveSite = (templateCountry: string, activeSite: string) => {
    const normalizedTemplateCountry = normalizeCurrencyCode(templateCountry);
    const normalizedActiveSite = normalizeCurrencyCode(activeSite);
    return normalizedTemplateCountry.length > 0 &&
        normalizedActiveSite.length > 0 &&
        normalizedTemplateCountry === normalizedActiveSite;
};

export const toProductTemplateImportNode = (
    tpl: LinkedProductTemplate,
): ProductTemplateImportNode => {
    const rawData = tpl.data || {};
    const node = {
        id: tpl.id,
        productTemplateLinkId: tpl.id,
        templateId: tpl.templateId,
        productId: tpl.productId,
        name: tpl.name,
        country: normalizeCurrencyCode(tpl.country) || tpl.country.trim(),
        platform: tpl.platform || 'other',
        data: normalizeProductTemplateApiData(rawData),
    } as ProductTemplateImportNode;
    Object.defineProperty(node, 'legacyTaxRateCandidate', {
        value: extractLegacyProductTaxRateCandidate(rawData),
        enumerable: false,
        writable: false,
        configurable: false,
    });
    return node;
};

export const filterProductTemplatesForSite = <T extends LinkedProductTemplate>(
    templates: T[],
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
