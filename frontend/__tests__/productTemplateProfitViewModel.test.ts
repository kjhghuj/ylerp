import { describe, expect, it, vi } from 'vitest';
import { createProductTemplateProfitViewModel } from '../modules/productTemplateProfitViewModel';
import type { GraphProductTemplateData, InvalidProductTemplateData, StandardProductTemplateData } from '../modules/profit/types';
import type { NodeGraphTemplate } from '../modules/profit/nodeGraphTypes';

const graphSnapshot: NodeGraphTemplate = {
  id: 'graph-1',
  name: 'Named outputs',
  createdAt: '',
  updatedAt: '',
  nodes: [
    {
      id: 'input',
      type: 'parameter',
      position: { x: 0, y: 0 },
      data: { name: 'Input', valueType: 'number', min: 0, max: 1000, defaultValue: 1 },
    },
    {
      id: 'out',
      type: 'output',
      position: { x: 0, y: 0 },
      data: { name: 'Business-specific output' },
    },
  ],
  edges: [{ id: 'edge', source: 'input', target: 'out' }],
};

describe('product template profit view model', () => {
  it('executes standard templates through the standard calculator', () => {
    const standard: StandardProductTemplateData = {
      kind: 'standard',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
    };
    const calculateStandard = vi.fn(() => ({ finalRevenueCNY: 12 }));

    expect(createProductTemplateProfitViewModel(standard, calculateStandard)).toEqual({
      kind: 'standard',
      result: { finalRevenueCNY: 12 },
    });
    expect(calculateStandard).toHaveBeenCalledWith(standard);
  });

  it('re-evaluates graph inputs and never calls the standard calculator', () => {
    const graph: GraphProductTemplateData = {
      kind: 'graph',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: { input: 0 },
      graphOutputValues: { out: 999 },
    };
    const calculateStandard = vi.fn();

    const result = createProductTemplateProfitViewModel(graph, calculateStandard);

    expect(calculateStandard).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'graph',
      outputs: [{ id: 'out', name: 'Business-specific output', value: 0 }],
    });
  });

  it('returns a graph error instead of cached outputs when strict execution fails', () => {
    const graph: GraphProductTemplateData = {
      kind: 'graph',
      schemaVersion: 2,
      nodeData: {},
      extraData: {},
      graphTemplateId: graphSnapshot.id,
      graphTemplateSnapshot: graphSnapshot,
      graphInputValues: {},
      graphOutputValues: { out: 999 },
    };

    const result = createProductTemplateProfitViewModel(graph, vi.fn());

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('expected graph error');
    expect(result.templateKind).toBe('graph');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing_input',
        context: expect.objectContaining({ name: 'Input' }),
      }),
    ]));
  });

  it('reports invalid compatibility templates without executing them', () => {
    const invalid: InvalidProductTemplateData = {
      kind: 'invalid',
      schemaVersion: 99,
      rawData: { future: true },
    };
    const calculateStandard = vi.fn();

    expect(createProductTemplateProfitViewModel(invalid, calculateStandard)).toEqual({
      kind: 'error',
      templateKind: 'invalid',
      errors: [{ code: 'invalid_compatibility', context: {} }],
    });
    expect(calculateStandard).not.toHaveBeenCalled();
  });
});
