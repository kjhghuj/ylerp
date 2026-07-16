import {
    cloneProductTemplateData,
    cloneTemplateValue,
    isGraphProductTemplateData,
    normalizeProductTemplateData,
    normalizeStoredProductTemplateData,
    toStandardNodeData,
} from '../productTemplateImport';
import {
    DEFAULT_NODE_DATA,
    DEFAULT_SITE_INPUTS,
    CURRENCY_TO_COUNTRY,
    normalizeCurrencyCode,
    type CurrencyCode,
    type NodeData,
    type PlatformNode,
    type ProductTemplateData,
    type SiteLevelInputs,
} from './types';

const PROFIT_CURRENCIES: CurrencyCode[] = ['MYR', 'SGD', 'PHP', 'THB', 'IDR'];
const nodeDataKeys = Object.keys(DEFAULT_NODE_DATA) as (keyof NodeData)[];
const graphRuntimeKeys = [
    'graphTemplateId',
    'graphTemplateSnapshot',
    'graphInputValues',
    'graphOutputValues',
] as const;

const emptyProfitNodes = (): Record<string, PlatformNode[]> => Object.fromEntries(
    PROFIT_CURRENCIES.map(currency => [currency, []]),
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasOwn = (value: object, key: PropertyKey): boolean => (
    Object.prototype.hasOwnProperty.call(value, key)
);

const normalizeStoredCurrencyLabel = (
    stored: unknown,
    fallback = '',
): string => {
    const explicit = typeof stored === 'string' ? stored.trim().toUpperCase() : '';
    if (explicit) return normalizeCurrencyCode(explicit) || explicit;
    const explicitFallback = fallback.trim().toUpperCase();
    return explicitFallback
        ? normalizeCurrencyCode(explicitFallback) || explicitFallback
        : '';
};

export const normalizeStoredProfitSiteCurrency = (stored: unknown): string => (
    normalizeStoredCurrencyLabel(stored, 'MYR')
);

const mergeMissingRecordFields = (
    primary: Record<string, unknown>,
    fallback: Record<string, unknown>,
): Record<string, unknown> => {
    const merged = cloneTemplateValue(primary);
    for (const [key, value] of Object.entries(fallback)) {
        if (!hasOwn(merged, key)) {
            merged[key] = cloneTemplateValue(value);
        }
    }
    return merged;
};

interface StoredNodeCandidate {
    raw: Record<string, unknown>;
    sourceKey: string;
    sourceIndex: number;
    sourcePriority: number;
}

const compareSourceKeys = (left: string, right: string): number => (
    left < right ? -1 : left > right ? 1 : 0
);

const getCurrencySourcePriority = (rawKey: string, currency: string): number => {
    const trimmed = rawKey.trim();
    const upper = trimmed.toUpperCase();
    const country = CURRENCY_TO_COUNTRY[currency as CurrencyCode];
    if (trimmed === currency) return 0;
    if (upper === currency) return 1;
    if (country && trimmed === country) return 2;
    if (country && upper === country) return 3;
    return 4;
};

const orderNodeCandidates = (candidates: StoredNodeCandidate[]): StoredNodeCandidate[] => (
    [...candidates].sort(
        (left, right) => left.sourcePriority - right.sourcePriority ||
            compareSourceKeys(left.sourceKey, right.sourceKey) ||
            left.sourceIndex - right.sourceIndex,
    )
);

const getCompleteGraphSource = (raw: Record<string, unknown>): ProductTemplateData | undefined => {
    const hasPersistedData = hasOwn(raw, 'persistedData');
    const persistedKind = isRecord(raw.persistedData) ? raw.persistedData.kind : undefined;
    if (hasPersistedData && persistedKind !== 'graph') return undefined;

    const rawData = isRecord(raw.data) ? raw.data : {};
    const legacyBoundaryData = withRuntimeGraphFields(rawData, raw);
    if (
        persistedKind === 'graph' ||
        (!hasPersistedData && (
            graphRuntimeKeys.some(key => hasOwn(raw, key)) ||
            graphRuntimeKeys.some(key => hasOwn(rawData, key))
        ))
    ) {
        const runtimeData = normalizeProductTemplateData(legacyBoundaryData);
        if (isGraphProductTemplateData(runtimeData)) return runtimeData;
    }
    if (persistedKind !== 'graph') return undefined;
    const persistedData = normalizeStoredProductTemplateData(raw.persistedData, legacyBoundaryData);
    return isGraphProductTemplateData(persistedData) ? persistedData : undefined;
};

const candidateHasGraphIntent = (raw: Record<string, unknown>): boolean => {
    if (hasOwn(raw, 'persistedData')) {
        return isRecord(raw.persistedData) && raw.persistedData.kind === 'graph';
    }
    const rawData = isRecord(raw.data) ? raw.data : {};
    return graphRuntimeKeys.some(key => hasOwn(raw, key)) ||
        graphRuntimeKeys.some(key => hasOwn(rawData, key));
};

const mergeCandidateMetadata = (
    ordered: StoredNodeCandidate[],
): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    for (const candidate of ordered) {
        for (const [key, value] of Object.entries(candidate.raw)) {
            if (
                key === 'data' ||
                key === 'persistedData' ||
                graphRuntimeKeys.includes(key as typeof graphRuntimeKeys[number])
            ) {
                continue;
            }
            if (!hasOwn(merged, key)) {
                merged[key] = cloneTemplateValue(value);
            }
        }
    }
    return merged;
};

const mergeCandidateNodeData = (
    ordered: StoredNodeCandidate[],
): Record<string, unknown> | undefined => {
    let merged: Record<string, unknown> | undefined;
    for (const candidate of ordered) {
        if (!isRecord(candidate.raw.data)) continue;
        const nonGraphData = Object.fromEntries(
            Object.entries(candidate.raw.data)
                .filter(([key]) => !graphRuntimeKeys.includes(key as typeof graphRuntimeKeys[number])),
        );
        merged = merged
            ? mergeMissingRecordFields(merged, nonGraphData)
            : cloneTemplateValue(nonGraphData);
    }
    return merged;
};

const mergeCandidateGroup = (candidates: StoredNodeCandidate[]): Record<string, unknown> | undefined => {
    const ordered = orderNodeCandidates(candidates);
    const highestPriority = ordered[0];
    if (!highestPriority) return undefined;

    const merged = mergeCandidateMetadata(ordered);
    const mergedData = mergeCandidateNodeData(ordered);
    if (mergedData) merged.data = mergedData;

    if (!candidateHasGraphIntent(highestPriority.raw)) {
        const persistedAuthority = ordered.find(candidate => (
            hasOwn(candidate.raw, 'persistedData') &&
            !candidateHasGraphIntent(candidate.raw)
        ));
        if (persistedAuthority) {
            merged.persistedData = cloneTemplateValue(persistedAuthority.raw.persistedData);
        }
        return merged;
    }

    const graphAuthority = ordered.find(candidate => getCompleteGraphSource(candidate.raw));
    if (!graphAuthority) {
        if (hasOwn(highestPriority.raw, 'persistedData')) {
            merged.persistedData = cloneTemplateValue(highestPriority.raw.persistedData);
        } else if (isRecord(highestPriority.raw.data)) {
            // A partial legacy graph is invalid, not standard. Preserve the
            // authoritative flat payload exactly so a future version can recover it.
            merged.data = cloneTemplateValue(highestPriority.raw.data);
        }
        for (const key of graphRuntimeKeys) {
            if (hasOwn(highestPriority.raw, key)) {
                merged[key] = cloneTemplateValue(highestPriority.raw[key]);
            }
        }
        return merged;
    }

    const graphData = getCompleteGraphSource(graphAuthority.raw);
    if (!graphData || !isGraphProductTemplateData(graphData)) return merged;
    if (hasOwn(graphAuthority.raw, 'persistedData')) {
        merged.persistedData = cloneTemplateValue(graphAuthority.raw.persistedData);
    }
    merged.graphTemplateId = graphData.graphTemplateId;
    merged.graphTemplateSnapshot = cloneTemplateValue(graphData.graphTemplateSnapshot);
    merged.graphInputValues = cloneTemplateValue(graphData.graphInputValues);
    merged.graphOutputValues = cloneTemplateValue(graphData.graphOutputValues);
    return merged;
};

const withRuntimeGraphFields = (
    nodeData: Record<string, unknown>,
    value: Record<string, unknown>,
): Record<string, unknown> => {
    const boundaryData = cloneTemplateValue(nodeData);
    for (const key of graphRuntimeKeys) {
        if (hasOwn(value, key)) {
            boundaryData[key] = cloneTemplateValue(value[key]);
        }
    }
    return boundaryData;
};

const reconcileRuntimeState = (
    persistedData: ProductTemplateData,
    value: Record<string, unknown>,
    rawData: Record<string, unknown>,
    hasRuntimeData: boolean,
): ProductTemplateData => {
    if (persistedData.kind === 'invalid') {
        return cloneProductTemplateData(persistedData);
    }

    const persistedNodeData = toStandardNodeData(persistedData);
    const currentNodeData = { ...persistedNodeData };
    if (hasRuntimeData) {
        const normalizedRuntimeData = toStandardNodeData(rawData);
        for (const key of nodeDataKeys) {
            if (hasOwn(rawData, key)) {
                currentNodeData[key] = normalizedRuntimeData[key];
            }
        }
    }
    const rawBoundary = normalizeProductTemplateData(rawData);
    const runtimeExtraData = rawBoundary.kind === 'invalid' ? {} : rawBoundary.extraData;
    const extraData = {
        ...cloneTemplateValue(persistedData.extraData),
        ...cloneTemplateValue(runtimeExtraData),
    };

    if (persistedData.kind === 'graph') {
        const graphBoundary: Record<string, unknown> = {
            ...cloneTemplateValue(extraData),
            ...cloneTemplateValue(currentNodeData),
            kind: 'graph',
            schemaVersion: persistedData.schemaVersion,
            graphTemplateId: hasOwn(value, 'graphTemplateId')
                ? cloneTemplateValue(value.graphTemplateId)
                : persistedData.graphTemplateId,
            graphTemplateSnapshot: hasOwn(value, 'graphTemplateSnapshot')
                ? cloneTemplateValue(value.graphTemplateSnapshot)
                : cloneTemplateValue(persistedData.graphTemplateSnapshot),
            graphInputValues: hasOwn(value, 'graphInputValues')
                ? cloneTemplateValue(value.graphInputValues)
                : cloneTemplateValue(persistedData.graphInputValues),
            graphOutputValues: hasOwn(value, 'graphOutputValues')
                ? cloneTemplateValue(value.graphOutputValues)
                : cloneTemplateValue(persistedData.graphOutputValues),
        };
        const normalizedGraph = normalizeProductTemplateData(graphBoundary);
        if (isGraphProductTemplateData(normalizedGraph)) return normalizedGraph;
        return {
            kind: 'graph',
            schemaVersion: persistedData.schemaVersion,
            nodeData: cloneTemplateValue(currentNodeData),
            extraData: cloneTemplateValue(extraData),
            graphTemplateId: persistedData.graphTemplateId,
            graphTemplateSnapshot: cloneTemplateValue(persistedData.graphTemplateSnapshot),
            graphInputValues: cloneTemplateValue(persistedData.graphInputValues),
            graphOutputValues: cloneTemplateValue(persistedData.graphOutputValues),
        };
    }

    return {
        kind: 'standard',
        schemaVersion: persistedData.schemaVersion,
        nodeData: cloneTemplateValue(currentNodeData),
        extraData: cloneTemplateValue(extraData),
    };
};

const applyPersistedGraphFields = (
    node: PlatformNode,
    persistedData: ProductTemplateData,
): PlatformNode => {
    if (isGraphProductTemplateData(persistedData)) {
        node.graphTemplateId = persistedData.graphTemplateId;
        node.graphTemplateSnapshot = cloneTemplateValue(persistedData.graphTemplateSnapshot);
        node.graphInputValues = cloneTemplateValue(persistedData.graphInputValues);
        node.graphOutputValues = cloneTemplateValue(persistedData.graphOutputValues);
    } else {
        delete node.graphTemplateId;
        delete node.graphTemplateSnapshot;
        delete node.graphInputValues;
        delete node.graphOutputValues;
    }
    return node;
};

const normalizeStoredNode = (
    value: Record<string, unknown>,
    currency: string,
): PlatformNode | undefined => {
    if (typeof value.id !== 'string' || typeof value.platform !== 'string') {
        return undefined;
    }
    const hasRuntimeData = isRecord(value.data);
    const rawData = hasRuntimeData ? value.data as Record<string, unknown> : {};
    const legacyBoundaryData = withRuntimeGraphFields(rawData, value);
    const storedPersistedData = normalizeStoredProductTemplateData(
        value.persistedData,
        legacyBoundaryData,
    );
    const persistedData = reconcileRuntimeState(
        storedPersistedData,
        value,
        rawData,
        hasRuntimeData,
    );
    const runtimeData = persistedData.kind === 'invalid' && hasRuntimeData
        ? toStandardNodeData(rawData)
        : toStandardNodeData(persistedData);
    const normalized: PlatformNode = {
        ...cloneTemplateValue(value),
        id: value.id,
        platform: value.platform as PlatformNode['platform'],
        currency,
        data: runtimeData,
        persistedData: cloneProductTemplateData(persistedData),
    };
    return applyPersistedGraphFields(normalized, persistedData);
};

export const normalizeStoredProfitNodes = (
    stored: unknown,
    fallbackCurrency: string,
): Record<string, PlatformNode[]> => {
    const result = emptyProfitNodes();
    const canonicalFallback = normalizeStoredCurrencyLabel(fallbackCurrency);
    const buckets: [string, unknown][] = Array.isArray(stored)
        ? [['', stored]]
        : isRecord(stored) ? Object.entries(stored) : [];
    const grouped = new Map<string, Map<string, StoredNodeCandidate[]>>();

    for (const [rawCurrency, rawNodes] of buckets) {
        if (!Array.isArray(rawNodes)) continue;
        for (const [sourceIndex, rawNode] of rawNodes.entries()) {
            if (!isRecord(rawNode) || typeof rawNode.id !== 'string') continue;
            const rawNodeCurrency = typeof rawNode.currency === 'string' ? rawNode.currency : '';
            const bucketCurrency = normalizeStoredCurrencyLabel(rawCurrency, canonicalFallback);
            const currency = normalizeStoredCurrencyLabel(rawNodeCurrency, bucketCurrency);
            if (!currency) continue;
            if (!result[currency]) result[currency] = [];
            const rawAuthorityKey = rawCurrency || rawNodeCurrency;
            const currencyGroup = grouped.get(currency) ?? new Map<string, StoredNodeCandidate[]>();
            const nodeGroup = currencyGroup.get(rawNode.id) ?? [];
            nodeGroup.push({
                raw: rawNode,
                sourceKey: rawAuthorityKey.trim(),
                sourceIndex,
                sourcePriority: getCurrencySourcePriority(rawAuthorityKey, currency),
            });
            currencyGroup.set(rawNode.id, nodeGroup);
            grouped.set(currency, currencyGroup);
        }
    }

    for (const [currency, currencyGroup] of grouped.entries()) {
        for (const candidates of currencyGroup.values()) {
            const mergedRaw = mergeCandidateGroup(candidates);
            if (!mergedRaw) continue;
            const normalizedNode = normalizeStoredNode(mergedRaw, currency);
            if (normalizedNode) result[currency].push(normalizedNode);
        }
    }
    return cloneTemplateValue(result);
};

interface StoredSiteCandidate {
    raw: Record<string, unknown>;
    sourceKey: string;
    sourcePriority: number;
}

const combineSiteCandidates = (candidates: StoredSiteCandidate[]): Record<string, unknown> | undefined => {
    const ordered = [...candidates].sort(
        (left, right) => left.sourcePriority - right.sourcePriority ||
            compareSourceKeys(left.sourceKey, right.sourceKey),
    );
    return ordered.reduce<Record<string, unknown> | undefined>(
        (merged, candidate) => merged
            ? mergeMissingRecordFields(merged, candidate.raw)
            : cloneTemplateValue(candidate.raw),
        undefined,
    );
};

export const normalizeStoredProfitSiteInputs = (stored: unknown): Record<string, SiteLevelInputs> => {
    const result: Record<string, SiteLevelInputs> = Object.fromEntries(
        PROFIT_CURRENCIES.map(currency => [currency, { ...DEFAULT_SITE_INPUTS }]),
    );
    if (!isRecord(stored)) return result;
    const grouped = new Map<string, StoredSiteCandidate[]>();
    for (const [rawCurrency, rawInputs] of Object.entries(stored)) {
        const currency = normalizeStoredCurrencyLabel(rawCurrency);
        if (!currency || !isRecord(rawInputs)) continue;
        if (!result[currency]) result[currency] = { ...DEFAULT_SITE_INPUTS };
        const candidates = grouped.get(currency) ?? [];
        candidates.push({
            raw: rawInputs,
            sourceKey: rawCurrency.trim(),
            sourcePriority: getCurrencySourcePriority(rawCurrency, currency),
        });
        grouped.set(currency, candidates);
    }

    for (const [currency, candidates] of grouped.entries()) {
        const merged = combineSiteCandidates(candidates);
        if (!merged) continue;

        const next = { ...DEFAULT_SITE_INPUTS };
        for (const field of Object.keys(DEFAULT_SITE_INPUTS) as (keyof SiteLevelInputs)[]) {
            if (!hasOwn(merged, field)) continue;
            const candidate = merged[field];
            if (field === 'sellerCouponType') {
                if (candidate === 'fixed' || candidate === 'percent') {
                    next.sellerCouponType = candidate;
                }
                continue;
            }
            if (
                (typeof candidate === 'number' && Number.isFinite(candidate)) ||
                (typeof candidate === 'string' && candidate.trim() !== '' && Number.isFinite(Number(candidate)))
            ) {
                Object.assign(next, { [field]: typeof candidate === 'number' ? candidate : Number(candidate) });
            }
        }
        result[currency] = next;
    }
    return cloneTemplateValue(result);
};
