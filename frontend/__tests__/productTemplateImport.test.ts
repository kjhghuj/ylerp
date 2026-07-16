import { describe, expect, it, vi } from 'vitest';
import {
  isGraphProductTemplateData,
  loadProductTemplateImportNodes,
  matchesActiveSite,
  normalizeProductTemplateData,
  toProductTemplateImportNode,
  toStandardNodeData,
} from '../modules/productTemplateImport';
import { groupImportedPlatformNodes, toImportedPlatformNode } from '../modules/profit/importCompatibility';
import { normalizeCurrencyCode } from '../modules/profit/types';
import type { NodeGraphTemplate } from '../modules/node-designer/types';

describe('loadProductTemplateImportNodes', () => {
  it('loads every template saved for the active product and site', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'link-1',
            templateId: 'shared-1',
            productId: 'product-1',
            name: 'Shopee MY',
            country: 'MYR',
            platform: 'shopee',
            data: { platformCommissionRate: '6', baseShippingFee: 1.5 },
          },
          {
            id: 'link-2',
            templateId: 'shared-2',
            productId: 'product-1',
            name: 'Lazada MY',
            country: 'MY',
            platform: 'lazada',
            data: { platformCommissionRate: 4, firstWeight: '50' },
          },
          {
            id: 'link-sg',
            templateId: 'shared-sg',
            productId: 'product-1',
            name: 'Shopee SG',
            country: 'SGD',
            platform: 'shopee',
            data: { platformCommissionRate: 3 },
          },
        ],
      }),
    };

    const nodes = await loadProductTemplateImportNodes(api, 'product-1', 'MY');

    expect(api.get).toHaveBeenCalledWith('/products/product-1/templates');
    expect(nodes).toHaveLength(2);
    expect(nodes).toEqual([
      expect.objectContaining({
        id: 'link-1',
        productTemplateLinkId: 'link-1',
        templateId: 'shared-1',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: expect.objectContaining({
          kind: 'standard',
          nodeData: expect.objectContaining({ platformCommissionRate: 6, baseShippingFee: 1.5 }),
        }),
      }),
      expect.objectContaining({
        id: 'link-2',
        productTemplateLinkId: 'link-2',
        templateId: 'shared-2',
        name: 'Lazada MY',
        country: 'MYR',
        platform: 'lazada',
        data: expect.objectContaining({
          kind: 'standard',
          nodeData: expect.objectContaining({ platformCommissionRate: 4, firstWeight: 50 }),
        }),
      }),
    ]);
  });

  it('preserves graph template data while normalizing standard numeric fields', () => {
    const graphTemplateSnapshot: NodeGraphTemplate = {
      id: 'graph-1',
      name: 'MY graph',
      type: 'profit',
      country: 'MY',
      platform: 'shopee',
      nodes: [],
      edges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const graphInputValues = { price: 99.5 };
    const graphOutputValues = { netProfit: 12.34 };

    const node = toProductTemplateImportNode({
      id: 'link-graph',
      name: 'Graph template',
      country: 'MY',
      platform: 'shopee',
      data: {
        firstWeight: '0',
        platformCommissionRate: '6',
        graphTemplateId: 'graph-1',
        graphTemplateSnapshot,
        graphInputValues,
        graphOutputValues,
      },
    });

    expect(node.country).toBe('MYR');
    expect(node.data.kind).toBe('graph');
    if (node.data.kind !== 'graph') throw new Error('expected graph data');
    expect(node.data.nodeData.firstWeight).toBe(0);
    expect(node.data.nodeData.platformCommissionRate).toBe(6);
    expect(node.data.graphTemplateId).toBe('graph-1');
    expect(node.data.graphTemplateSnapshot).toEqual(graphTemplateSnapshot);
    expect(node.data.graphInputValues).toEqual(graphInputValues);
    expect(node.data.graphOutputValues).toEqual(graphOutputValues);
  });

  it('rebuilds graph fields on the imported platform node and groups legacy country codes by currency', () => {
    const imported = toProductTemplateImportNode({
      id: 'link-graph',
      name: 'Graph template',
      country: 'MY',
      platform: 'shopee',
      data: {
        graphTemplateId: 'graph-1',
        graphTemplateSnapshot: {
          id: 'graph-1',
          name: 'MY graph',
          country: 'MY',
          platform: 'shopee',
          nodes: [],
          edges: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        graphInputValues: { price: 99.5 },
        graphOutputValues: { netProfit: 12.34 },
      },
    });

    const platformNode = toImportedPlatformNode(imported, 'SGD', 'runtime-node');
    const grouped = groupImportedPlatformNodes([platformNode]);

    expect(platformNode).toEqual(expect.objectContaining({
      id: 'runtime-node',
      currency: 'MYR',
      graphTemplateId: 'graph-1',
      graphInputValues: { price: 99.5 },
      graphOutputValues: { netProfit: 12.34 },
    }));
    expect(platformNode.graphTemplateSnapshot?.id).toBe('graph-1');
    expect(grouped).toEqual({ MYR: [platformNode] });
  });

  it.each([
    ['MY', 'MYR'],
    ['SG', 'SGD'],
    ['PH', 'PHP'],
    ['TH', 'THB'],
    ['ID', 'IDR'],
    ['MYR', 'MYR'],
  ])('treats %s and %s as the same site', (siteCode, currencyCode) => {
    expect(matchesActiveSite(siteCode, currencyCode)).toBe(true);
    expect(matchesActiveSite(currencyCode, siteCode)).toBe(true);
  });

  it('preserves an explicit zero first weight when rebuilding standard profit data', () => {
    expect(toStandardNodeData({ firstWeight: 0 }).firstWeight).toBe(0);
    expect(toStandardNodeData({ firstWeight: '0' }).firstWeight).toBe(0);
  });

  it.each([
    [{}, 50],
    [{ firstWeight: undefined }, 50],
    [{ firstWeight: '' }, 50],
    [{ firstWeight: 'not-a-number' }, 50],
    [{ firstWeight: 0 }, 0],
    [{ firstWeight: '0' }, 0],
  ])('normalizes firstWeight in %o to %s', (data, expected) => {
    expect(toStandardNodeData(data).firstWeight).toBe(expected);
  });

  it('does not silently default empty or unknown currency values to MYR', () => {
    expect(normalizeCurrencyCode(undefined)).toBe('');
    expect(normalizeCurrencyCode('  ')).toBe('');
    expect(normalizeCurrencyCode('future-code')).toBe('');
    expect(normalizeCurrencyCode(undefined, 'SGD')).toBe('SGD');
    expect(normalizeCurrencyCode('future-code', 'SG')).toBe('SGD');
  });

  it('never matches an empty template country to an active site', () => {
    expect(matchesActiveSite('', 'MY')).toBe(false);
    expect(matchesActiveSite('   ', 'MYR')).toBe(false);
    expect(matchesActiveSite('', '')).toBe(false);
  });

  it('round-trips unknown future fields while normalizing known numeric fields', () => {
    const source = {
      baseShippingFee: '12.5',
      futureScalar: 'keep-me',
      futureNested: {
        enabled: true,
        rules: [{ field: 'netProfit', operator: 'gt', value: 0 }],
      },
    };

    const normalized = normalizeProductTemplateData(source);

    expect(normalized).toEqual(expect.objectContaining({
      kind: 'standard',
      schemaVersion: 2,
      nodeData: expect.objectContaining({ baseShippingFee: 12.5 }),
      extraData: expect.objectContaining({
        futureScalar: 'keep-me',
        futureNested: source.futureNested,
      }),
    }));
  });

  it('preserves a complex graph snapshot deeply and classifies it as graph data', () => {
    const graphTemplateSnapshot: NodeGraphTemplate = {
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
        {
          id: 'formula-profit',
          type: 'formula',
          position: { x: 200, y: 20 },
          data: {
            name: 'Profit',
            expression: 'price - fee',
            variables: [
              { portId: 'price', label: 'Price' },
              { portId: 'fee', label: 'Fee' },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'edge-price-profit',
          source: 'input-price',
          sourceHandle: 'value',
          target: 'formula-profit',
          targetHandle: 'price',
          data: { futureEdgeFlag: true },
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const source = {
      graphTemplateId: 'graph-complex',
      graphTemplateSnapshot,
      graphInputValues: { price: 88, fee: 4 },
      graphOutputValues: { profit: 84 },
      futureGraphOption: { rounding: 'bankers' },
    };

    const normalized = normalizeProductTemplateData(source);

    expect(isGraphProductTemplateData(normalized)).toBe(true);
    expect(normalized).toEqual(expect.objectContaining({
      kind: 'graph',
      schemaVersion: 2,
      graphTemplateSnapshot,
      extraData: expect.objectContaining({ futureGraphOption: source.futureGraphOption }),
    }));
  });

  it('keeps malformed partial graph fields without rebuilding a graph platform node', () => {
    const normalized = normalizeProductTemplateData({
      graphTemplateId: 'half-graph',
      graphInputValues: { price: 50 },
      futureRecoveryHint: 'retain',
    });

    expect(normalized).toEqual(expect.objectContaining({
      kind: 'invalid',
      rawData: expect.objectContaining({
        graphTemplateId: 'half-graph',
        graphInputValues: { price: 50 },
        futureRecoveryHint: 'retain',
      }),
    }));
    expect(isGraphProductTemplateData(normalized)).toBe(false);

    const platformNode = toImportedPlatformNode({
      name: 'Half graph',
      country: 'MY',
      platform: 'shopee',
      data: normalized,
    }, 'SGD', 'half-node');

    expect(platformNode.graphTemplateId).toBeUndefined();
    expect(platformNode.graphTemplateSnapshot).toBeUndefined();
    expect(platformNode.graphInputValues).toBeUndefined();
    expect(platformNode.graphOutputValues).toBeUndefined();
  });
});
