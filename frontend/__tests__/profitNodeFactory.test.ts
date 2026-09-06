import { describe, expect, it } from 'vitest';
import type { NodeGraphTemplate } from '../modules/profit/nodeGraphTypes';
import {
  createGraphPlatformNode,
  createTemplatePlatformNode,
} from '../modules/profit/platformNodeFactory';
import { DEFAULT_NODE_DATA } from '../modules/profit/types';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';

describe('platformNodeFactory', () => {
  it.each([
    ['MY', 'SGD', 'MYR'],
    ['SG', 'MYR', 'SGD'],
    ['', 'SG', 'SGD'],
  ])('normalizes template currency %s with explicit site fallback %s', (templateCountry, siteCountry, expected) => {
    const node = createTemplatePlatformNode({
      id: 'template-1',
      name: 'Legacy template',
      country: templateCountry,
      platform: 'shopee',
      data: { ...DEFAULT_NODE_DATA, firstWeight: 0 },
    }, siteCountry, 'node-1');

    expect(node.currency).toBe(expected);
    expect(node.data.firstWeight).toBe(0);
  });

  it.each([
    [undefined, 50],
    ['', 50],
    ['   ', 50],
    ['invalid', 50],
    [Number.NaN, 50],
    [0, 0],
    ['0', 0],
  ])('normalizes template firstWeight %s to %s', (firstWeight, expected) => {
    const node = createTemplatePlatformNode({
      id: 'template-weight',
      name: 'Weight template',
      country: 'MY',
      platform: 'shopee',
      data: { ...DEFAULT_NODE_DATA, firstWeight } as typeof DEFAULT_NODE_DATA,
    }, 'SGD', 'node-weight');

    expect(node.data.firstWeight).toBe(expected);
  });

  it.each([
    ['MY', 'SGD', 'MYR'],
    ['SG', 'MYR', 'SGD'],
    [null, 'SG', 'SGD'],
  ])('normalizes graph currency %s with explicit site fallback %s', (graphCountry, siteCountry, expected) => {
    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-1',
      name: 'Legacy graph',
      country: graphCountry,
      platform: 'shopee',
      nodes: [],
      edges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const node = createGraphPlatformNode(
      graphTemplate,
      siteCountry,
      {},
      {},
      'node-graph',
    );

    expect(node.currency).toBe(expected);
    expect(node.graphTemplateId).toBe('graph-1');
  });

  it('rejects unsupported non-empty template and graph sites', () => {
    expect(() => createTemplatePlatformNode({
      id: 'template-unsupported',
      name: 'Unsupported template',
      country: 'invalid-currency',
      platform: 'shopee',
      data: { ...DEFAULT_NODE_DATA },
    }, 'SG', 'unsupported-template-node')).toThrow(/unsupported/i);

    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-unsupported',
      name: 'Unsupported graph',
      country: 'invalid-currency',
      platform: 'shopee',
      nodes: [],
      edges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(() => createGraphPlatformNode(
      graphTemplate,
      'SG',
      {},
      {},
      'unsupported-graph-node',
    )).toThrow(/unsupported/i);
  });

  it('serializes a newly created graph node as graph data', () => {
    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-new',
      name: 'New graph',
      country: 'SG',
      platform: 'shopee',
      nodes: [],
      edges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const node = createGraphPlatformNode(graphTemplate, 'SGD', { price: 10 }, { profit: 2 }, 'new');

    expect(serializePlatformNodeTemplateData(node)).toEqual(expect.objectContaining({
      kind: 'graph',
      graphTemplateId: 'graph-new',
      graphTemplateSnapshot: graphTemplate,
      graphInputValues: { price: 10 },
      graphOutputValues: { profit: 2 },
    }));
  });
});
