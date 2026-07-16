import { describe, expect, it } from 'vitest';
import {
  normalizeStoredProfitNodes,
  normalizeStoredProfitSiteInputs,
  normalizeStoredProfitSiteCurrency,
} from '../modules/profit/profitPersistence';
import { DEFAULT_SITE_INPUTS } from '../modules/profit/types';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import type { NodeGraphTemplate } from '../modules/node-designer/types';

const reloadGraph: NodeGraphTemplate = {
  id: 'reload-graph',
  name: 'Reload graph',
  country: 'MYR',
  platform: 'shopee',
  nodes: [],
  edges: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('profit local-storage compatibility', () => {
  it.each([
    ['MY', 'MYR'],
    ['SG', 'SGD'],
    ['MYR', 'MYR'],
    ['future', 'FUTURE'],
    [null, 'MYR'],
  ])('migrates stored site %s to %s', (stored, expected) => {
    expect(normalizeStoredProfitSiteCurrency(stored)).toBe(expected);
  });

  it('migrates legacy country-keyed node buckets and node currencies', () => {
    const stored = {
      MY: [{ id: 'my', platform: 'other', currency: 'MY', data: {} }],
      SG: [{ id: 'sg', platform: 'other', currency: 'SG', data: {} }],
    };

    const normalized = normalizeStoredProfitNodes(stored, 'MYR');

    expect(normalized.MYR[0]).toEqual(expect.objectContaining({ id: 'my', currency: 'MYR' }));
    expect(normalized.SGD[0]).toEqual(expect.objectContaining({ id: 'sg', currency: 'SGD' }));
  });

  it('migrates legacy country-keyed site input buckets without losing values', () => {
    const myInputs = { totalRevenue: 12, sellerCoupon: 1 };
    const sgInputs = { totalRevenue: 34, adROI: 8 };

    const normalized = normalizeStoredProfitSiteInputs({ MY: myInputs, SG: sgInputs });

    expect(normalized.MYR).toEqual(expect.objectContaining(myInputs));
    expect(normalized.SGD).toEqual(expect.objectContaining(sgInputs));
  });

  it('routes legacy arrays by each node currency and uses only the explicit fallback', () => {
    const normalized = normalizeStoredProfitNodes([
      { id: 'sg', platform: 'shopee', currency: 'SG', data: { baseShippingFee: 3 } },
      { id: 'fallback', platform: 'other', data: { baseShippingFee: 4 } },
    ], 'TH');

    expect(normalized.SGD.map(node => node.id)).toEqual(['sg']);
    expect(normalized.THB.map(node => node.id)).toEqual(['fallback']);
    expect(normalized.MYR).toEqual([]);
  });

  it('preserves unknown legacy node data as persisted extra data with deep-copy isolation', () => {
    const futureNested = { rules: [{ op: 'gt', value: 1 }] };
    const stored = {
      SG: [{
        id: 'sg',
        platform: 'shopee',
        currency: 'SG',
        data: { baseShippingFee: '3.5', futureNested },
      }],
    };

    const normalized = normalizeStoredProfitNodes(stored, 'MYR');
    futureNested.rules[0].value = 99;

    expect(normalized.SGD[0].data.baseShippingFee).toBe(3.5);
    expect(normalized.SGD[0].persistedData).toEqual(expect.objectContaining({
      kind: 'standard',
      schemaVersion: 2,
      nodeData: expect.objectContaining({ baseShippingFee: 3.5 }),
      extraData: { futureNested: { rules: [{ op: 'gt', value: 1 }] } },
    }));
  });

  it('merges alias node buckets by id without losing non-default or future fields', () => {
    const normalized = normalizeStoredProfitNodes({
      MY: [{
        id: 'same',
        platform: 'shopee',
        currency: 'MY',
        name: 'Country alias',
        data: {
          baseShippingFee: 7,
          extraShippingFee: 0,
          futureA: { enabled: true },
        },
      }],
      MYR: [{
        id: 'same',
        platform: 'shopee',
        currency: 'MYR',
        data: {
          baseShippingFee: 0,
          extraShippingFee: 3,
          futureB: 'keep',
        },
      }],
    }, 'SGD');

    expect(normalized.MYR).toHaveLength(1);
    expect(normalized.MYR[0]).toEqual(expect.objectContaining({
      id: 'same',
      currency: 'MYR',
      name: 'Country alias',
      data: expect.objectContaining({
        baseShippingFee: 0,
        extraShippingFee: 3,
      }),
    }));
    expect(normalized.MYR[0].persistedData).toEqual(expect.objectContaining({
      kind: 'standard',
      extraData: {
        futureA: { enabled: true },
        futureB: 'keep',
      },
    }));
  });

  it('merges country/currency site input buckets field-by-field and is idempotent', () => {
    const normalized = normalizeStoredProfitSiteInputs({
      MY: { totalRevenue: 100, sellerCoupon: 2 },
      MYR: { totalRevenue: 0, adROI: 9, platformInfrastructureFee: 4 },
      SG: { totalRevenue: 50 },
      SGD: { sellerCouponPlatformRatio: 30 },
    });

    expect(normalized.MYR).toEqual({
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 0,
      sellerCoupon: 2,
      adROI: 9,
      platformInfrastructureFee: 4,
    });
    expect(normalized.SGD).toEqual({
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 50,
      sellerCouponPlatformRatio: 30,
    });
    expect(normalizeStoredProfitSiteInputs(normalized)).toEqual(normalized);
  });

  it('is idempotent for canonical migrated nodes', () => {
    const once = normalizeStoredProfitNodes({
      SG: [{
        id: 'sg',
        platform: 'shopee',
        currency: 'SG',
        data: { firstWeight: 0, future: { enabled: true } },
      }],
    }, 'MYR');

    expect(normalizeStoredProfitNodes(once, 'MYR')).toEqual(once);
  });

  it('preserves an unknown canonical persisted schema as invalid raw data', () => {
    const futurePersistedData = {
      kind: 'standard',
      schemaVersion: 99,
      nodeData: { baseShippingFee: 'future-number-format' },
      extraData: { future: { enabled: true } },
    };

    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'future',
        platform: 'other',
        currency: 'MYR',
        data: {},
        persistedData: futurePersistedData,
      }],
    }, 'MYR');

    expect(normalized.MYR[0].persistedData).toEqual({
      kind: 'invalid',
      schemaVersion: 99,
      rawData: futurePersistedData,
    });
    expect(normalizeStoredProfitNodes(normalized, 'MYR')).toEqual(normalized);
  });

  it('keeps canonical standard authoritative when extraData collides with graph field names', () => {
    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'standard-graph-collision',
        platform: 'shopee',
        currency: 'MYR',
        data: { baseShippingFee: 3 },
        persistedData: {
          kind: 'standard',
          schemaVersion: 2,
          nodeData: { baseShippingFee: 3 },
          extraData: {
            graphTemplateId: 'user-metadata-only',
            graphTemplateSnapshot: { not: 'a graph' },
          },
        },
      }],
      MY: [{
        id: 'standard-graph-collision',
        platform: 'shopee',
        currency: 'MY',
        data: { aliasUnknown: true },
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: reloadGraph,
        graphInputValues: { price: 1 },
        graphOutputValues: { profit: 2 },
      }],
    }, 'SGD').MYR[0];

    expect(normalized.persistedData).toEqual(expect.objectContaining({
      kind: 'standard',
      extraData: {
        graphTemplateId: 'user-metadata-only',
        graphTemplateSnapshot: { not: 'a graph' },
        aliasUnknown: true,
      },
    }));
    expect(normalized).not.toHaveProperty('graphTemplateId');
    expect(normalized).not.toHaveProperty('graphTemplateSnapshot');
    expect(normalized).not.toHaveProperty('graphInputValues');
    expect(normalized).not.toHaveProperty('graphOutputValues');
  });

  it('keeps canonical invalid authoritative when rawData contains graph-shaped recovery fields', () => {
    const invalidRaw = {
      kind: 'future',
      schemaVersion: 99,
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: reloadGraph,
      graphInputValues: { price: 7 },
      graphOutputValues: { profit: 8 },
      recovery: { preserve: true },
    };
    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'invalid-graph-collision',
        platform: 'shopee',
        currency: 'MYR',
        productTemplateLinkId: 'link-invalid',
        data: { firstWeight: 50 },
        persistedData: {
          kind: 'invalid',
          schemaVersion: 99,
          rawData: invalidRaw,
        },
      }],
      MY: [{
        id: 'invalid-graph-collision',
        platform: 'shopee',
        currency: 'MY',
        templateId: 'shared-alias',
        data: { aliasUnknown: true },
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: reloadGraph,
        graphInputValues: { price: 1 },
        graphOutputValues: { profit: 2 },
      }],
    }, 'SGD').MYR[0];

    expect(normalized).toEqual(expect.objectContaining({
      productTemplateLinkId: 'link-invalid',
      templateId: 'shared-alias',
      persistedData: {
        kind: 'invalid',
        schemaVersion: 99,
        rawData: invalidRaw,
      },
    }));
    expect(normalized).not.toHaveProperty('graphTemplateId');
    expect(normalized).not.toHaveProperty('graphTemplateSnapshot');
    expect(normalized).not.toHaveProperty('graphInputValues');
    expect(normalized).not.toHaveProperty('graphOutputValues');
    expect(normalizeStoredProfitNodes({ MYR: [normalized] }, 'SGD').MYR[0]).toEqual(normalized);
  });

  it('uses latest top-level standard edits after reload while preserving persisted extras', () => {
    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'edited',
        platform: 'shopee',
        currency: 'MYR',
        data: { baseShippingFee: 9, firstWeight: 0 },
        persistedData: {
          kind: 'standard',
          schemaVersion: 2,
          nodeData: { baseShippingFee: 3, firstWeight: 50 },
          extraData: { future: { keep: true } },
        },
      }],
    }, 'MYR');

    expect(normalized.MYR[0].data).toEqual(expect.objectContaining({
      baseShippingFee: 9,
      firstWeight: 0,
    }));
    expect(serializePlatformNodeTemplateData(normalized.MYR[0])).toEqual(expect.objectContaining({
      baseShippingFee: 9,
      firstWeight: 0,
      future: { keep: true },
    }));
  });

  it('uses latest top-level graph runtime edits after reload without losing graph extras', () => {
    const latestSnapshot = { ...reloadGraph, name: 'Latest graph' };
    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'edited-graph',
        platform: 'shopee',
        currency: 'MYR',
        data: { baseShippingFee: 11 },
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: latestSnapshot,
        graphInputValues: { price: 22 },
        graphOutputValues: { profit: 8 },
        persistedData: {
          kind: 'graph',
          schemaVersion: 2,
          nodeData: { baseShippingFee: 3 },
          extraData: { futureGraph: 'keep' },
          graphTemplateId: reloadGraph.id,
          graphTemplateSnapshot: reloadGraph,
          graphInputValues: { price: 1 },
          graphOutputValues: { profit: 2 },
        },
      }],
    }, 'MYR');

    expect(normalized.MYR[0]).toEqual(expect.objectContaining({
      graphTemplateSnapshot: latestSnapshot,
      graphInputValues: { price: 22 },
      graphOutputValues: { profit: 8 },
      data: expect.objectContaining({ baseShippingFee: 11 }),
    }));
    expect(serializePlatformNodeTemplateData(normalized.MYR[0])).toEqual(expect.objectContaining({
      futureGraph: 'keep',
      baseShippingFee: 11,
      graphTemplateSnapshot: latestSnapshot,
      graphInputValues: { price: 22 },
      graphOutputValues: { profit: 8 },
    }));
  });

  it('keeps invalid persisted raw data exact across reload despite top-level defaults', () => {
    const rawData = {
      kind: 'future',
      schemaVersion: 99,
      firstWeight: 'broken',
      future: { recover: true },
    };
    const normalized = normalizeStoredProfitNodes({
      MYR: [{
        id: 'invalid',
        platform: 'other',
        currency: 'MYR',
        data: { firstWeight: 50, baseShippingFee: 0 },
        persistedData: {
          kind: 'invalid',
          schemaVersion: 99,
          rawData,
        },
      }],
    }, 'MYR');

    expect(normalized.MYR[0].persistedData).toEqual({
      kind: 'invalid',
      schemaVersion: 99,
      rawData,
    });
    expect(serializePlatformNodeTemplateData(normalized.MYR[0])).toEqual(rawData);
  });

  it('lets canonical node fields win by property presence independent of bucket order', () => {
    const alias = {
      id: 'same',
      platform: 'shopee',
      currency: 'MY',
      name: 'alias-name',
      futureFlag: true,
      futureText: 'alias',
      data: { baseShippingFee: 7, firstWeight: 50, futureData: 'alias' },
    };
    const canonical = {
      id: 'same',
      platform: 'shopee',
      currency: 'MYR',
      name: '',
      futureFlag: false,
      futureText: '',
      data: { baseShippingFee: 0, firstWeight: 0, futureData: '' },
    };

    const aliasFirst = normalizeStoredProfitNodes({ MY: [alias], MYR: [canonical] }, 'SGD');
    const canonicalFirst = normalizeStoredProfitNodes({ MYR: [canonical], MY: [alias] }, 'SGD');

    expect(aliasFirst).toEqual(canonicalFirst);
    expect(aliasFirst.MYR[0]).toEqual(expect.objectContaining({
      name: '',
      futureFlag: false,
      futureText: '',
      data: expect.objectContaining({
        baseShippingFee: 0,
        firstWeight: 0,
      }),
    }));
    expect(aliasFirst.MYR[0].persistedData).toEqual(expect.objectContaining({
      extraData: { futureData: '' },
    }));
  });

  it('keeps the canonical graph payload whole when duplicate ids exist in an alias bucket', () => {
    const aliasGraph = { ...reloadGraph, name: 'Alias graph' };
    const canonicalGraph = { ...reloadGraph, name: 'Canonical graph' };
    const normalized = normalizeStoredProfitNodes({
      MY: [{
        id: 'graph-duplicate',
        platform: 'shopee',
        currency: 'MY',
        data: {},
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: aliasGraph,
        graphInputValues: { price: 1 },
        graphOutputValues: { profit: 2 },
      }],
      MYR: [{
        id: 'graph-duplicate',
        platform: 'shopee',
        currency: 'MYR',
        data: {},
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: canonicalGraph,
        graphInputValues: { price: 0 },
        graphOutputValues: { profit: 0 },
      }],
    }, 'MYR');

    expect(normalized.MYR[0]).toEqual(expect.objectContaining({
      graphTemplateSnapshot: canonicalGraph,
      graphInputValues: { price: 0 },
      graphOutputValues: { profit: 0 },
    }));
  });

  it('lets canonical site-input properties win even when they equal defaults', () => {
    const aliasFirst = normalizeStoredProfitSiteInputs({
      MY: { totalRevenue: 100, sellerCoupon: 3 },
      MYR: { totalRevenue: 0, sellerCoupon: 0 },
    });
    const canonicalFirst = normalizeStoredProfitSiteInputs({
      MYR: { totalRevenue: 0, sellerCoupon: 0 },
      MY: { totalRevenue: 100, sellerCoupon: 3 },
    });

    expect(aliasFirst).toEqual(canonicalFirst);
    expect(aliasFirst.MYR.totalRevenue).toBe(0);
    expect(aliasFirst.MYR.sellerCoupon).toBe(0);
  });

  it.each([
    [
      { MYR: { totalRevenue: 1 }, myr: { totalRevenue: 2 }, MY: { totalRevenue: 3 }, my: { totalRevenue: 4 } },
      1,
    ],
    [
      { myr: { totalRevenue: 2 }, MY: { totalRevenue: 3 }, my: { totalRevenue: 4 } },
      2,
    ],
    [
      { MY: { totalRevenue: 3 }, my: { totalRevenue: 4 } },
      3,
    ],
    [
      { my: { totalRevenue: 4 } },
      4,
    ],
  ])('uses deterministic site bucket priority for %o', (stored, expected) => {
    const reversed = Object.fromEntries(Object.entries(stored).reverse());

    expect(normalizeStoredProfitSiteInputs(stored).MYR.totalRevenue).toBe(expected);
    expect(normalizeStoredProfitSiteInputs(reversed).MYR.totalRevenue).toBe(expected);
  });

  it.each([
    [
      { MYR: [{ id: 'priority', platform: 'other', currency: 'MYR', data: { baseShippingFee: 1 } }],
        myr: [{ id: 'priority', platform: 'other', currency: 'myr', data: { baseShippingFee: 2 } }],
        MY: [{ id: 'priority', platform: 'other', currency: 'MY', data: { baseShippingFee: 3 } }],
        my: [{ id: 'priority', platform: 'other', currency: 'my', data: { baseShippingFee: 4 } }] },
      1,
    ],
    [
      { myr: [{ id: 'priority', platform: 'other', currency: 'myr', data: { baseShippingFee: 2 } }],
        MY: [{ id: 'priority', platform: 'other', currency: 'MY', data: { baseShippingFee: 3 } }],
        my: [{ id: 'priority', platform: 'other', currency: 'my', data: { baseShippingFee: 4 } }] },
      2,
    ],
    [
      { MY: [{ id: 'priority', platform: 'other', currency: 'MY', data: { baseShippingFee: 3 } }],
        my: [{ id: 'priority', platform: 'other', currency: 'my', data: { baseShippingFee: 4 } }] },
      3,
    ],
    [
      { my: [{ id: 'priority', platform: 'other', currency: 'my', data: { baseShippingFee: 4 } }] },
      4,
    ],
  ])('uses deterministic node bucket priority for %o', (stored, expected) => {
    const reversed = Object.fromEntries(Object.entries(stored).reverse());

    expect(normalizeStoredProfitNodes(stored, 'SGD').MYR[0].data.baseShippingFee).toBe(expected);
    expect(normalizeStoredProfitNodes(reversed, 'SGD').MYR[0].data.baseShippingFee).toBe(expected);
  });

  it('applies the same deterministic priority to SG aliases and preserves false/empty/zero', () => {
    const canonical = {
      id: 'sg-priority',
      platform: 'other',
      currency: 'SGD',
      name: '',
      futureFlag: false,
      data: { baseShippingFee: 0, firstWeight: 0, futureText: '' },
    };
    const stored = {
      sg: [{ ...canonical, currency: 'sg', name: 'lower', futureFlag: true, data: { baseShippingFee: 4 } }],
      SG: [{ ...canonical, currency: 'SG', name: 'alias', futureFlag: true, data: { baseShippingFee: 3 } }],
      sgd: [{ ...canonical, currency: 'sgd', name: 'lower-canonical', futureFlag: true, data: { baseShippingFee: 2 } }],
      SGD: [canonical],
    };

    const normalized = normalizeStoredProfitNodes(stored, 'MYR').SGD[0];

    expect(normalized).toEqual(expect.objectContaining({
      name: '',
      futureFlag: false,
      data: expect.objectContaining({ baseShippingFee: 0, firstWeight: 0 }),
    }));
    expect(normalized.persistedData).toEqual(expect.objectContaining({
      extraData: expect.objectContaining({ futureText: '' }),
    }));
  });

  it('keeps graph snapshot/input/output/data/extras from one complete authoritative source', () => {
    const aliasGraph = { ...reloadGraph, name: 'Alias complete' };
    const canonicalGraph = { ...reloadGraph, name: 'Canonical complete' };
    const alias = {
      id: 'whole-graph',
      platform: 'shopee',
      currency: 'MY',
      data: { baseShippingFee: 7, aliasExtra: 'alias' },
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: aliasGraph,
      graphInputValues: { price: 7 },
      graphOutputValues: { profit: 7 },
    };
    const canonical = {
      id: 'whole-graph',
      platform: 'shopee',
      currency: 'MYR',
      data: { baseShippingFee: 0, canonicalExtra: 'canonical' },
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: canonicalGraph,
      graphInputValues: { price: 0 },
      graphOutputValues: { profit: 0 },
    };

    for (const stored of [
      { MY: [alias], MYR: [canonical] },
      { MYR: [canonical], MY: [alias] },
    ]) {
      const normalized = normalizeStoredProfitNodes(stored, 'SGD').MYR[0];
      expect(normalized).toEqual(expect.objectContaining({
        data: expect.objectContaining({ baseShippingFee: 0 }),
        graphTemplateSnapshot: canonicalGraph,
        graphInputValues: { price: 0 },
        graphOutputValues: { profit: 0 },
      }));
      expect(normalized.persistedData).toEqual(expect.objectContaining({
        kind: 'graph',
        extraData: {
          canonicalExtra: 'canonical',
          aliasExtra: 'alias',
        },
      }));
    }
  });

  it('keeps a lone nested partial legacy graph as exact invalid raw data and is idempotent', () => {
    const partialRaw = {
      baseShippingFee: '3.5',
      graphTemplateId: 'partial-only',
      graphInputValues: { price: 7 },
      futureRecoveryHint: {
        owner: 'ops',
        fields: ['graphTemplateSnapshot', 'graphOutputValues'],
      },
    };
    const once = normalizeStoredProfitNodes({
      MYR: [{
        id: 'lone-partial-graph',
        platform: 'shopee',
        currency: 'MYR',
        data: partialRaw,
      }],
    }, 'SGD');
    const node = once.MYR[0];

    expect(node.persistedData).toEqual({
      kind: 'invalid',
      schemaVersion: 2,
      rawData: partialRaw,
    });
    expect(node).not.toHaveProperty('graphTemplateId');
    expect(node).not.toHaveProperty('graphTemplateSnapshot');
    expect(node).not.toHaveProperty('graphInputValues');
    expect(node).not.toHaveProperty('graphOutputValues');
    expect(serializePlatformNodeTemplateData(node)).toEqual(partialRaw);
    expect(normalizeStoredProfitNodes(once, 'SGD')).toEqual(once);
  });

  it('keeps the highest-priority partial legacy graph raw data independent of bucket order', () => {
    const canonicalPartial = {
      id: 'duplicate-partial-only',
      platform: 'shopee',
      currency: 'MYR',
      productTemplateLinkId: 'link-canonical',
      data: {
        graphTemplateId: 'canonical-partial',
        graphOutputValues: { profit: 0 },
        canonicalUnknown: { preserve: true },
      },
    };
    const aliasPartial = {
      id: 'duplicate-partial-only',
      platform: 'shopee',
      currency: 'MY',
      templateId: 'shared-alias',
      data: {
        graphTemplateId: 'alias-partial',
        graphInputValues: { price: 9 },
        aliasUnknown: true,
      },
    };

    const canonicalFirst = normalizeStoredProfitNodes({
      MYR: [canonicalPartial],
      MY: [aliasPartial],
    }, 'SGD');
    const aliasFirst = normalizeStoredProfitNodes({
      MY: [aliasPartial],
      MYR: [canonicalPartial],
    }, 'SGD');
    const node = canonicalFirst.MYR[0];

    expect(canonicalFirst).toEqual(aliasFirst);
    expect(node).toEqual(expect.objectContaining({
      productTemplateLinkId: 'link-canonical',
      templateId: 'shared-alias',
      persistedData: {
        kind: 'invalid',
        schemaVersion: 2,
        rawData: canonicalPartial.data,
      },
    }));
    expect(serializePlatformNodeTemplateData(node)).toEqual(canonicalPartial.data);
    expect(normalizeStoredProfitNodes(canonicalFirst, 'MYR')).toEqual(canonicalFirst);
  });

  it('uses an alias complete graph when the canonical bucket only has partial graph state', () => {
    const aliasGraph = { ...reloadGraph, name: 'Alias complete' };
    const canonicalPartial = {
      id: 'partial-canonical',
      platform: 'shopee',
      currency: 'MYR',
      data: { baseShippingFee: 0, canonicalOnly: true },
      graphTemplateId: reloadGraph.id,
    };
    const aliasComplete = {
      id: 'partial-canonical',
      platform: 'shopee',
      currency: 'MY',
      data: { baseShippingFee: 9, aliasOnly: true },
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: aliasGraph,
      graphInputValues: { price: 9 },
      graphOutputValues: { profit: 9 },
    };

    for (const stored of [
      { MYR: [canonicalPartial], MY: [aliasComplete] },
      { MY: [aliasComplete], MYR: [canonicalPartial] },
    ]) {
      const normalized = normalizeStoredProfitNodes(stored, 'SGD').MYR[0];
      expect(normalized).toEqual(expect.objectContaining({
        data: expect.objectContaining({ baseShippingFee: 0 }),
        graphTemplateSnapshot: aliasGraph,
        graphInputValues: { price: 9 },
        graphOutputValues: { profit: 9 },
      }));
      expect(normalized.persistedData).toEqual(expect.objectContaining({
        kind: 'graph',
        extraData: {
          canonicalOnly: true,
          aliasOnly: true,
        },
      }));
    }
  });

  it('does not revive a lower-priority graph when the canonical candidate is authoritative standard', () => {
    const aliasGraph = { ...reloadGraph, name: 'Stale alias graph' };
    const canonicalStandard = {
      id: 'standard-wins',
      platform: 'shopee',
      currency: 'MYR',
      productTemplateLinkId: 'link-canonical',
      name: 'Canonical standard',
      futureTopLevel: { owner: 'canonical' },
      data: { baseShippingFee: 0, canonicalOnly: true },
    };
    const aliasCompleteGraph = {
      id: 'standard-wins',
      platform: 'shopee',
      currency: 'MY',
      templateId: 'shared-stale',
      data: { baseShippingFee: 9, aliasOnly: true },
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: aliasGraph,
      graphInputValues: { price: 9 },
      graphOutputValues: { profit: 9 },
    };

    const normalized = normalizeStoredProfitNodes({
      MY: [aliasCompleteGraph],
      MYR: [canonicalStandard],
    }, 'SGD').MYR[0];

    expect(normalized).toEqual(expect.objectContaining({
      productTemplateLinkId: 'link-canonical',
      templateId: 'shared-stale',
      name: 'Canonical standard',
      futureTopLevel: { owner: 'canonical' },
      data: expect.objectContaining({ baseShippingFee: 0 }),
    }));
    expect(normalized.persistedData).toEqual(expect.objectContaining({
      kind: 'standard',
      extraData: {
        canonicalOnly: true,
        aliasOnly: true,
      },
    }));
    expect(normalized).not.toHaveProperty('graphTemplateId');
    expect(normalized).not.toHaveProperty('graphTemplateSnapshot');
    expect(normalized).not.toHaveProperty('graphInputValues');
    expect(normalized).not.toHaveProperty('graphOutputValues');
  });

  it('restores one lower complete graph tuple while retaining higher-priority identity and metadata', () => {
    const aliasGraph = { ...reloadGraph, name: 'Recoverable graph' };
    const canonicalPartial = {
      id: 'recover-graph',
      platform: 'shopee',
      currency: 'MYR',
      productTemplateLinkId: 'link-canonical',
      templateId: null,
      productId: 'product-canonical',
      name: '',
      futureTopLevel: false,
      data: {
        baseShippingFee: 0,
        graphTemplateId: reloadGraph.id,
        canonicalUnknown: { keep: true },
      },
    };
    const aliasComplete = {
      id: 'recover-graph',
      platform: 'shopee',
      currency: 'MY',
      productTemplateLinkId: 'link-alias',
      templateId: 'shared-alias',
      productId: 'product-alias',
      name: 'Alias name',
      futureTopLevel: true,
      lowerOnlyMetadata: 'fill-missing',
      data: {
        baseShippingFee: 9,
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: aliasGraph,
        graphInputValues: { price: 9 },
        graphOutputValues: { profit: 9 },
        aliasUnknown: ['keep'],
      },
    };

    const normalized = normalizeStoredProfitNodes({
      MY: [aliasComplete],
      MYR: [canonicalPartial],
    }, 'SGD').MYR[0];

    expect(normalized).toEqual(expect.objectContaining({
      productTemplateLinkId: 'link-canonical',
      templateId: null,
      productId: 'product-canonical',
      name: '',
      futureTopLevel: false,
      lowerOnlyMetadata: 'fill-missing',
      graphTemplateId: reloadGraph.id,
      graphTemplateSnapshot: aliasGraph,
      graphInputValues: { price: 9 },
      graphOutputValues: { profit: 9 },
      data: expect.objectContaining({ baseShippingFee: 0 }),
    }));
    expect(normalized.persistedData).toEqual(expect.objectContaining({
      kind: 'graph',
      extraData: {
        canonicalUnknown: { keep: true },
        aliasUnknown: ['keep'],
      },
    }));
  });

  it('keeps the higher complete graph tuple and only fills missing metadata from lower candidates', () => {
    const canonicalGraph = { ...reloadGraph, name: 'Canonical complete' };
    const aliasGraph = { ...reloadGraph, name: 'Alias complete' };
    const canonical = {
      id: 'both-complete',
      platform: 'shopee',
      currency: 'MYR',
      productTemplateLinkId: 'link-canonical',
      name: '',
      data: {
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: canonicalGraph,
        graphInputValues: { price: 0 },
        graphOutputValues: { profit: 0 },
        canonicalUnknown: 0,
      },
    };
    const alias = {
      id: 'both-complete',
      platform: 'shopee',
      currency: 'MY',
      productTemplateLinkId: 'link-alias',
      templateId: 'shared-alias',
      name: 'Alias name',
      data: {
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: aliasGraph,
        graphInputValues: { price: 9 },
        graphOutputValues: { profit: 9 },
        aliasUnknown: 9,
      },
    };

    const normalized = normalizeStoredProfitNodes({
      MY: [alias],
      MYR: [canonical],
    }, 'SGD').MYR[0];

    expect(normalized).toEqual(expect.objectContaining({
      productTemplateLinkId: 'link-canonical',
      templateId: 'shared-alias',
      name: '',
      graphTemplateSnapshot: canonicalGraph,
      graphInputValues: { price: 0 },
      graphOutputValues: { profit: 0 },
      data: expect.objectContaining({ baseShippingFee: 0 }),
    }));
  });

  it('is order-independent and idempotent after duplicate graph reconciliation', () => {
    const graph = { ...reloadGraph, name: 'Idempotent graph' };
    const canonicalPartial = {
      id: 'idempotent-duplicate',
      platform: 'shopee',
      currency: 'MYR',
      productTemplateLinkId: 'link-1',
      data: { graphTemplateId: reloadGraph.id, canonicalUnknown: true },
    };
    const aliasComplete = {
      id: 'idempotent-duplicate',
      platform: 'shopee',
      currency: 'MY',
      data: {
        graphTemplateId: reloadGraph.id,
        graphTemplateSnapshot: graph,
        graphInputValues: { price: 1 },
        graphOutputValues: { profit: 2 },
        aliasUnknown: true,
      },
    };

    const first = normalizeStoredProfitNodes({
      MYR: [canonicalPartial],
      MY: [aliasComplete],
    }, 'SGD');
    const reversed = normalizeStoredProfitNodes({
      MY: [aliasComplete],
      MYR: [canonicalPartial],
    }, 'SGD');

    expect(first).toEqual(reversed);
    expect(normalizeStoredProfitNodes(first, 'SGD')).toEqual(first);
  });

  it('preserves an unknown non-empty bucket and node currency instead of falling back', () => {
    const normalized = normalizeStoredProfitNodes({
      vn: [{
        id: 'vn-node',
        platform: 'other',
        currency: 'vn',
        data: { baseShippingFee: 2 },
      }],
    }, 'MYR');

    expect(normalized.VN).toHaveLength(1);
    expect(normalized.VN[0]).toEqual(expect.objectContaining({
      id: 'vn-node',
      currency: 'VN',
      data: expect.objectContaining({ baseShippingFee: 2 }),
    }));
    expect(normalized.MYR).toEqual([]);
  });

  it('uses an unknown non-empty bucket for a blank node currency and remains idempotent', () => {
    const once = normalizeStoredProfitNodes({
      future: [{
        id: 'future-node',
        platform: 'other',
        currency: '   ',
        data: { firstWeight: 0 },
      }],
    }, 'SGD');

    expect(once.FUTURE).toHaveLength(1);
    expect(once.FUTURE[0]).toEqual(expect.objectContaining({
      id: 'future-node',
      currency: 'FUTURE',
      data: expect.objectContaining({ firstWeight: 0 }),
    }));
    expect(once.SGD).toEqual([]);
    expect(normalizeStoredProfitNodes(once, 'MYR')).toEqual(once);
  });

  it('preserves unknown local-storage site-input buckets', () => {
    const normalized = normalizeStoredProfitSiteInputs({
      vn: { totalRevenue: '12.5', adROI: 7 },
    });

    expect(normalized.VN).toEqual({
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 12.5,
      adROI: 7,
    });
    expect(normalizeStoredProfitSiteInputs(normalized)).toEqual(normalized);
  });

  it('restores finite numeric strings in local-storage site inputs and rejects blanks or invalid values', () => {
    const normalized = normalizeStoredProfitSiteInputs({
      MYR: {
        totalRevenue: '123.45',
        sellerCoupon: '0',
        sellerCouponPlatformRatio: ' ',
        platformInfrastructureFee: 'not-a-number',
        adROI: '-2.5',
      },
    });

    expect(normalized.MYR).toEqual({
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 123.45,
      sellerCoupon: 0,
      adROI: -2.5,
    });
  });
});
