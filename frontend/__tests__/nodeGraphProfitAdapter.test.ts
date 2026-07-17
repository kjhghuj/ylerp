import { describe, expect, it } from 'vitest';
import { evaluateNodeGraphProfitTemplate, getNodeGraphInputNodes } from '../modules/profit/nodeGraphProfitAdapter';
import type { NodeGraphTemplate } from '../modules/node-designer/types';

const template: NodeGraphTemplate = {
  id: 'graph-1',
  name: 'Commission template',
  type: 'profit',
  country: 'MYR',
  platform: 'shopee',
  createdAt: '',
  updatedAt: '',
  nodes: [
    {
      id: 'price',
      type: 'parameter',
      position: { x: 0, y: 0 },
      data: { name: '售价', valueType: 'number', min: 0, max: 9999, defaultValue: 100 },
    },
    {
      id: 'rate',
      type: 'parameter',
      position: { x: 0, y: 0 },
      data: { name: '佣金率', valueType: 'percentage', min: 0, max: 100, defaultValue: 6 },
    },
    {
      id: 'commission',
      type: 'formula',
      position: { x: 0, y: 0 },
      data: {
        name: '佣金',
        expression: 'price * rate',
        variables: [
          { portId: 'price_in', label: 'price' },
          { portId: 'rate_in', label: 'rate' },
        ],
      },
    },
    {
      id: 'out',
      type: 'output',
      position: { x: 0, y: 0 },
      data: { name: '输出佣金' },
    },
  ],
  edges: [
    { id: 'e1', source: 'price', target: 'commission', targetHandle: 'price_in' },
    { id: 'e2', source: 'rate', target: 'commission', targetHandle: 'rate_in' },
    { id: 'e3', source: 'commission', target: 'out' },
  ],
};

describe('node graph profit adapter', () => {
  it('extracts parameter nodes as profit template inputs', () => {
    expect(getNodeGraphInputNodes(template)).toEqual([
      expect.objectContaining({ id: 'price', name: '售价', defaultValue: 100 }),
      expect.objectContaining({ id: 'rate', name: '佣金率', defaultValue: 6 }),
    ]);
  });

  it('evaluates a node graph template with runtime input values', () => {
    const result = evaluateNodeGraphProfitTemplate(template, { price: 200, rate: 8 });

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('expected successful graph evaluation');
    expect(result.inputValues).toEqual({ price: 200, rate: 8 });
    expect(result.outputs).toEqual([
      expect.objectContaining({ id: 'out', name: '输出佣金', value: 16 }),
    ]);
  });
});
