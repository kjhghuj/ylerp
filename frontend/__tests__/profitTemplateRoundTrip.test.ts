import { describe, expect, it } from 'vitest';
import type { NodeGraphTemplate } from '../modules/profit/nodeGraphTypes';
import {
  normalizeProductTemplateData,
  normalizeStoredProductTemplateData,
  toProductTemplateImportNode,
} from '../modules/productTemplateImport';
import {
  buildImportedProfitNodes,
  resolveImportCurrency,
  selectImportedSiteData,
  toImportedPlatformNode,
} from '../modules/profit/importCompatibility';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';
import {
  buildPlatformNodeTemplatePayload,
  serializePlatformNodeTemplateData,
} from '../modules/profit/templateDataSerializer';
import type {
  GraphProductTemplateData,
  ProductTemplateData,
  StandardProductTemplateData,
} from '../modules/profit/types';

const graphSnapshot: NodeGraphTemplate = {
  id: 'graph-complex',
  name: 'Complex graph',
  type: 'profit',
  country: 'SG',
  platform: 'shopee',
  nodes: [
    {
      id: 'input-price',
      type: 'parameter',
      position: { x: 10, y: 20 },
      data: {
        name: 'Price',
        valueType: 'number',
        min: 0,
        max: 999,
        defaultValue: 88,
        futureMetadata: { unit: 'SGD' },
      },
    },
  ],
  edges: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const roundTrip = (source: Record<string, unknown>) => {
  const imported = toProductTemplateImportNode({
    id: 'link-1',
    name: 'Imported',
    country: 'SG',
    platform: 'shopee',
    data: source,
  });
  const runtime = toImportedPlatformNode(imported, 'MYR', 'runtime-1');
  return { imported, runtime, saved: serializePlatformNodeTemplateData(runtime) };
};

describe('product template runtime round trip', () => {
  it('round-trips the flat shared-template API body back through the shared factory', () => {
    const original = toImportedPlatformNode({
      name: 'Shared standard',
      country: 'SG',
      platform: 'shopee',
      data: normalizeProductTemplateData({
        baseShippingFee: 7,
        firstWeight: 0,
        futureOption: { enabled: true },
      }),
    }, 'SGD', 'original');
    const postBody = buildPlatformNodeTemplatePayload(original, 'Shared standard');
    const apiResponse = { id: 'shared-1', ...postBody };

    const reopened = createTemplatePlatformNode(apiResponse, 'MYR', 'reopened');

    expect(reopened).toEqual(expect.objectContaining({
      templateId: 'shared-1',
      currency: 'SGD',
      data: expect.objectContaining({ baseShippingFee: 7, firstWeight: 0 }),
      persistedData: expect.objectContaining({
        kind: 'standard',
        extraData: { futureOption: { enabled: true } },
      }),
    }));
    expect(serializePlatformNodeTemplateData(reopened)).toEqual(postBody.data);
  });

  it('round-trips a flat shared graph body back into graph runtime state', () => {
    const original = toImportedPlatformNode({
      name: 'Shared graph',
      country: 'SG',
      platform: 'shopee',
      data: normalizeProductTemplateData({
        graphTemplateId: graphSnapshot.id,
        graphTemplateSnapshot: graphSnapshot,
        graphInputValues: { price: 88 },
        graphOutputValues: { profit: 84 },
        futureGraphOption: { rounding: 'bankers' },
      }),
    }, 'SGD', 'original-graph');
    const postBody = buildPlatformNodeTemplatePayload(original, 'Shared graph');
    const apiResponse = { id: 'shared-graph-1', ...postBody };

    const reopened = createTemplatePlatformNode(apiResponse, 'MYR', 'reopened-graph');

    expect(reopened).toEqual(expect.objectContaining({
      templateId: 'shared-graph-1',
      currency: 'SGD',
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: { price: 88 },
      graphOutputValues: { profit: 84 },
      persistedData: expect.objectContaining({
        kind: 'graph',
        extraData: { futureGraphOption: { rounding: 'bankers' } },
      }),
    }));
    expect(serializePlatformNodeTemplateData(reopened)).toEqual(postBody.data);
  });

  it('round-trips the actual product-template body through an unchanged API response', () => {
    const original = toImportedPlatformNode({
      name: 'Product standard',
      country: 'MY',
      platform: 'lazada',
      data: normalizeProductTemplateData({
        baseShippingFee: 4,
        firstWeight: 0,
        futureProductOption: ['keep'],
      }),
    }, 'MYR', 'product-original');
    const productBody = buildPlatformNodeTemplatePayload(
      original,
      'Product standard',
      {},
      'shared-source',
    );
    const apiResponse = {
      id: 'product-link-1',
      productId: 'product-1',
      ...productBody,
    };

    const imported = toProductTemplateImportNode(apiResponse);
    const reopened = toImportedPlatformNode(imported, 'SGD', 'product-reopened');

    expect(reopened).toEqual(expect.objectContaining({
      productTemplateLinkId: 'product-link-1',
      templateId: 'shared-source',
      currency: 'MYR',
      data: expect.objectContaining({ baseShippingFee: 4, firstWeight: 0 }),
    }));
    expect(serializePlatformNodeTemplateData(reopened)).toEqual(productBody.data);
  });

  it('uses an explicit stored boundary for internal canonical payloads', () => {
    const flat = {
      kind: 'standard',
      schemaVersion: 2,
      firstWeight: 0,
      future: false,
    };
    const canonical = {
      kind: 'standard',
      schemaVersion: 2,
      nodeData: { firstWeight: 0 },
      extraData: { future: false },
    };

    expect(normalizeProductTemplateData(flat)).toEqual(canonical);
    expect(normalizeStoredProductTemplateData(canonical, {})).toEqual(canonical);
  });

  it.each(['shared', 'product'])(
    'round-trips flat %s API fields named nodeData and extraData without treating them as canonical',
    (boundary) => {
      const flatApiData = {
        kind: 'standard',
        schemaVersion: 2,
        baseShippingFee: 8,
        firstWeight: 0,
        nodeData: { futureNodeShape: ['keep'] },
        extraData: { futureExtraShape: { enabled: false } },
      };
      const imported = toProductTemplateImportNode({
        id: boundary === 'product' ? 'product-link-collision' : 'shared-link-collision',
        templateId: boundary === 'product' ? 'shared-source' : undefined,
        productId: boundary === 'product' ? 'product-1' : undefined,
        name: `${boundary} collision`,
        country: 'MY',
        platform: 'shopee',
        data: flatApiData,
      });
      const runtime = toImportedPlatformNode(imported, 'SGD', `${boundary}-runtime`);
      const firstSave = buildPlatformNodeTemplatePayload(
        runtime,
        `${boundary} collision`,
        {},
        boundary === 'product' ? 'shared-source' : undefined,
      );
      const unchangedApiResponse = {
        id: boundary === 'product' ? 'product-link-collision' : 'shared-template-collision',
        ...(boundary === 'product' ? { productId: 'product-1' } : {}),
        ...firstSave,
      };
      const reopened = boundary === 'product'
        ? toImportedPlatformNode(
          toProductTemplateImportNode(unchangedApiResponse),
          'SGD',
          `${boundary}-reopened`,
        )
        : createTemplatePlatformNode(unchangedApiResponse, 'SGD', `${boundary}-reopened`);

      expect(reopened.data).toEqual(expect.objectContaining({
        baseShippingFee: 8,
        firstWeight: 0,
      }));
      expect(reopened.persistedData).toEqual(expect.objectContaining({
        kind: 'standard',
        extraData: {
          nodeData: { futureNodeShape: ['keep'] },
          extraData: { futureExtraShape: { enabled: false } },
        },
      }));
      expect(serializePlatformNodeTemplateData(reopened)).toEqual(firstSave.data);
    },
  );

  it('preserves unknown standard fields through API -> runtime -> save', () => {
    const source = {
      baseShippingFee: '12.5',
      firstWeight: '0',
      futureScalar: 'keep-me',
      futureNested: { enabled: true, rules: [{ op: 'gt', value: 0 }] },
    };

    const { imported, runtime, saved } = roundTrip(source);

    expect(imported.data).toEqual({
      kind: 'standard',
      schemaVersion: 2,
      nodeData: { baseShippingFee: 12.5, firstWeight: 0 },
      extraData: {
        futureScalar: 'keep-me',
        futureNested: source.futureNested,
      },
    });
    expect(runtime.data.firstWeight).toBe(0);
    expect(saved).toEqual(expect.objectContaining({
      kind: 'standard',
      schemaVersion: 2,
      baseShippingFee: 12.5,
      firstWeight: 0,
      futureScalar: 'keep-me',
      futureNested: source.futureNested,
    }));
    expect(saved).not.toHaveProperty('nodeData');
    expect(saved).not.toHaveProperty('extraData');
  });

  it('preserves a complex graph snapshot and future graph fields through runtime save', () => {
    const source = {
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: { price: 88 },
      graphOutputValues: { profit: 84 },
      futureGraphOption: { rounding: 'bankers' },
    };

    const { imported, runtime, saved } = roundTrip(source);

    expect(imported.data.kind).toBe('graph');
    expect(runtime.graphTemplateSnapshot).toEqual(graphSnapshot);
    expect(saved).toEqual(expect.objectContaining({
      kind: 'graph',
      schemaVersion: 2,
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: { price: 88 },
      graphOutputValues: { profit: 84 },
      futureGraphOption: source.futureGraphOption,
    }));
  });

  it('accepts only finite numeric strings in graph input/output records and converts them', () => {
    const normalized = normalizeProductTemplateData({
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: { price: '88.5' },
      graphOutputValues: { profit: '-4.25' },
    });

    expect(normalized.kind).toBe('graph');
    if (normalized.kind !== 'graph') throw new Error('expected graph');
    expect(normalized.graphInputValues).toEqual({ price: 88.5 });
    expect(normalized.graphOutputValues).toEqual({ profit: -4.25 });
  });

  it('preserves malformed graph raw data but does not rebuild graph runtime fields', () => {
    const source = {
      graphTemplateId: 'half-graph',
      graphInputValues: { price: 50 },
      futureRecoveryHint: { owner: 'ops' },
    };

    const { imported, runtime, saved } = roundTrip(source);

    expect(imported.data).toEqual({
      kind: 'invalid',
      schemaVersion: 2,
      rawData: source,
    });
    expect(runtime.graphTemplateId).toBeUndefined();
    expect(runtime.graphTemplateSnapshot).toBeUndefined();
    expect(saved).toEqual(source);
  });

  it.each([
    [{ ...graphSnapshot, id: 'other-id' }, { price: 1 }, { profit: 1 }],
    [{ ...graphSnapshot, nodes: [{ id: 123 }] }, { price: 1 }, { profit: 1 }],
    [{ ...graphSnapshot, edges: [{ id: 'e', source: 1, target: 'out' }] }, { price: 1 }, { profit: 1 }],
    [graphSnapshot, { price: 'not-a-number' }, { profit: 1 }],
    [graphSnapshot, { price: Number.NaN }, { profit: 1 }],
    [graphSnapshot, { price: false }, { profit: 1 }],
    [graphSnapshot, { price: [] }, { profit: 1 }],
    [graphSnapshot, { price: {} }, { profit: 1 }],
    [graphSnapshot, { price: null }, { profit: 1 }],
    [graphSnapshot, { price: '   ' }, { profit: 1 }],
    [graphSnapshot, { price: 'Infinity' }, { profit: 1 }],
    [graphSnapshot, { price: 1 }, false],
    [graphSnapshot, { price: 1 }, []],
  ])('rejects invalid graph structure or numeric records without coercing it into a graph', (snapshot, inputs, outputs) => {
    const normalized = normalizeProductTemplateData({
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: snapshot,
      graphInputValues: inputs,
      graphOutputValues: outputs,
    });

    expect(normalized.kind).toBe('invalid');
  });

  it.each([
    [{ ...graphSnapshot, name: '' }],
    [{ ...graphSnapshot, createdAt: undefined }],
    [{
      ...graphSnapshot,
      nodes: [{
        ...graphSnapshot.nodes[0],
        data: { ...graphSnapshot.nodes[0].data, min: Number.POSITIVE_INFINITY },
      }],
    }],
    [{
      ...graphSnapshot,
      nodes: [{
        ...graphSnapshot.nodes[0],
        data: { ...graphSnapshot.nodes[0].data, valueType: 'money' },
      }],
    }],
    [{
      ...graphSnapshot,
      nodes: [{
        id: 'formula',
        type: 'formula',
        position: { x: 0, y: 0 },
        data: { name: 'Formula', expression: 'price', variables: [{ portId: '', label: 'price' }] },
      }],
    }],
    [{
      ...graphSnapshot,
      nodes: [{
        id: 'output',
        type: 'output',
        position: { x: 0, y: 0 },
        data: {},
      }],
    }],
  ])('rejects graph snapshots missing execution-required structure', (snapshot) => {
    const normalized = normalizeProductTemplateData({
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: snapshot,
      graphInputValues: {},
      graphOutputValues: {},
    });

    expect(normalized.kind).toBe('invalid');
  });

  it('routes unknown future schema versions to invalid raw data without v2 defaults', () => {
    const source = {
      schemaVersion: 99,
      baseShippingFee: '12.5',
      futurePayload: { mode: 'v99' },
    };

    const normalized = normalizeProductTemplateData(source);

    expect(normalized).toEqual({
      kind: 'invalid',
      schemaVersion: 99,
      rawData: source,
    });
    expect(serializePlatformNodeTemplateData(toImportedPlatformNode({
      name: 'Future',
      country: 'SG',
      platform: 'shopee',
      data: normalized,
    }, 'SGD', 'future-node'))).toEqual(source);
  });

  it('preserves an unknown future canonical schema as exact invalid raw data', () => {
    const source = {
      kind: 'standard',
      schemaVersion: 99,
      nodeData: { firstWeight: 'future-format' },
      extraData: { future: false },
    };

    expect(normalizeProductTemplateData(source)).toEqual({
      kind: 'invalid',
      schemaVersion: 99,
      rawData: source,
    });
  });

  it('keeps invalid raw values byte-for-value in shape during ordinary runtime edits', () => {
    const source = {
      kind: 'future-kind',
      schemaVersion: 99,
      firstWeight: 'broken-value',
      graphInputValues: { price: false },
      recovery: { fields: [undefined, Number.NaN, Number.POSITIVE_INFINITY] },
    };
    const imported = toProductTemplateImportNode({
      id: 'invalid-link',
      name: 'Invalid',
      country: 'MY',
      platform: 'shopee',
      data: source,
    });
    source.recovery.fields[0] = 777;
    expect(imported.data.kind).toBe('invalid');
    if (imported.data.kind !== 'invalid') throw new Error('expected invalid');
    expect(imported.data.rawData).toEqual({
      kind: 'future-kind',
      schemaVersion: 99,
      firstWeight: 'broken-value',
      graphInputValues: { price: false },
      recovery: { fields: [undefined, Number.NaN, Number.POSITIVE_INFINITY] },
    });
    const runtime = toImportedPlatformNode(imported, 'MYR', 'invalid-node');
    runtime.data.firstWeight = 999;

    const saved = serializePlatformNodeTemplateData(runtime, { baseShippingFee: 123 });

    expect(saved).toEqual(imported.data.rawData);
    expect(saved).not.toHaveProperty('baseShippingFee');
  });

  it('deep-clones standard, graph, runtime, and serialized persistence boundaries', () => {
    const standardNested = { rules: [{ threshold: 1 }] };
    const standardSource = { baseShippingFee: 2, futureNested: standardNested };
    const standard = normalizeProductTemplateData(standardSource);
    standardNested.rules[0].threshold = 99;
    expect(standard.kind).toBe('standard');
    if (standard.kind !== 'standard') throw new Error('expected standard');
    expect(standard.extraData.futureNested).toEqual({ rules: [{ threshold: 1 }] });

    const sourceSnapshot = structuredClone(graphSnapshot);
    const sourceInputs = { price: 88 };
    const sourceOutputs = { profit: 84 };
    const graph = normalizeProductTemplateData({
      graphTemplateId: sourceSnapshot.id,
      graphTemplateSnapshot: sourceSnapshot,
      graphInputValues: sourceInputs,
      graphOutputValues: sourceOutputs,
      futureGraph: { nested: { enabled: true } },
    });
    expect(graph.kind).toBe('graph');
    if (graph.kind !== 'graph') throw new Error('expected graph');

    sourceSnapshot.nodes[0].data.name = 'mutated source';
    sourceInputs.price = 1;
    expect(graph.graphTemplateSnapshot.nodes[0].data.name).toBe('Price');
    expect(graph.graphInputValues.price).toBe(88);

    const runtime = toImportedPlatformNode({
      name: 'Graph',
      country: 'SG',
      platform: 'shopee',
      data: graph,
    }, 'SGD', 'graph-runtime');
    runtime.graphTemplateSnapshot!.nodes[0].data.name = 'mutated runtime';
    runtime.graphInputValues!.price = 2;
    expect(graph.graphTemplateSnapshot.nodes[0].data.name).toBe('Price');
    expect(graph.graphInputValues.price).toBe(88);

    const saved = serializePlatformNodeTemplateData(runtime);
    const savedSnapshot = saved.graphTemplateSnapshot as NodeGraphTemplate;
    const savedInputs = saved.graphInputValues as Record<string, number>;
    savedSnapshot.nodes[0].data.name = 'mutated saved';
    savedInputs.price = 3;
    expect(runtime.graphTemplateSnapshot!.nodes[0].data.name).toBe('mutated runtime');
    expect(runtime.graphInputValues!.price).toBe(2);
  });

  it('rejects a persisted standard discriminant mixed with complete graph fields', () => {
    const normalized = normalizeProductTemplateData({
      kind: 'standard',
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: {},
      graphOutputValues: {},
    });

    expect(normalized.kind).toBe('invalid');
  });

  it('requires an explicit current-site fallback for import currency resolution', () => {
    expect(resolveImportCurrency('MY', 'SGD')).toBe('MYR');
    expect(resolveImportCurrency('', 'SG')).toBe('SGD');
    expect(() => resolveImportCurrency('future', 'TH')).toThrow(/unsupported/i);
    expect(() => resolveImportCurrency('', 'VN')).toThrow(/unsupported/i);
    expect(resolveImportCurrency('', '')).toBe('');
  });

  it('treats an external invalid/rawData-shaped object as flat raw invalid data', () => {
    const external = {
      kind: 'invalid',
      schemaVersion: 2,
      rawData: { collision: 'user-field' },
      firstWeight: 'broken',
      future: { keep: true },
    };

    const normalized = normalizeProductTemplateData(external);

    expect(normalized).toEqual({
      kind: 'invalid',
      schemaVersion: 2,
      rawData: external,
    });
    expect(serializePlatformNodeTemplateData(toImportedPlatformNode({
      name: 'Collision',
      country: 'MY',
      platform: 'shopee',
      data: normalized,
    }, 'MYR', 'collision-node'))).toEqual(external);
    expect(normalizeStoredProductTemplateData(normalized, {})).toEqual(normalized);
  });

  it('rejects a non-empty unsupported template site instead of relabeling it to the current site', () => {
    const imported = toProductTemplateImportNode({
      id: 'link-unsupported-site',
      name: 'Unsupported',
      country: 'VN',
      platform: 'shopee',
      data: { firstWeight: 0 },
    });

    expect(() => toImportedPlatformNode(imported, 'MYR', 'unsupported-node')).toThrow(/unsupported/i);
    expect(() => createTemplatePlatformNode({
      id: 'shared-unsupported-site',
      name: 'Unsupported shared',
      country: 'VN',
      platform: 'shopee',
      data: { firstWeight: 0 },
    }, 'MYR', 'unsupported-shared-node')).toThrow(/unsupported/i);
  });

  it('uses the current site explicitly in the real import-node construction flow', () => {
    const imported = toProductTemplateImportNode({
      id: 'link-site-fallback',
      name: 'No site template',
      country: '',
      platform: 'shopee',
      data: { firstWeight: '0' },
    });

    const result = buildImportedProfitNodes(
      [imported],
      '',
      'SG',
      'Fallback node',
      () => 'runtime-fallback',
    );

    expect(result.currency).toBe('SGD');
    expect(result.nodes[0]).toEqual(expect.objectContaining({
      id: 'runtime-fallback',
      currency: 'SGD',
      data: expect.objectContaining({ firstWeight: 0 }),
    }));
    expect(result.groupedNodes.SGD).toEqual(result.nodes);
  });

  it('does not match unknown site keys when the target currency is empty', () => {
    expect(selectImportedSiteData({
      'future-site': { totalRevenue: 99 },
    }, '')).toBeUndefined();
    expect(selectImportedSiteData({
      'future-site': { totalRevenue: 99 },
    }, 'future-target')).toBeUndefined();
  });
});

describe('ProductTemplateData type boundaries', () => {
  it('does not permit standard/graph payload variants to mix', () => {
    const standard: StandardProductTemplateData = {
      kind: 'standard',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
    };
    const graph: GraphProductTemplateData = {
      kind: 'graph',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: {},
      graphOutputValues: {},
    };
    expect(standard.kind).toBe('standard');
    expect(graph.kind).toBe('graph');

    // @ts-expect-error Graph fields are forbidden on the standard variant.
    const invalidStandard: ProductTemplateData = {
      kind: 'standard',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
      graphTemplateId: 'mixed',
    };
    expect(invalidStandard.kind).toBe('standard');
  });
});
