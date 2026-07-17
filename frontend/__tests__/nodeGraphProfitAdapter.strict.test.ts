import { describe, expect, it } from 'vitest';
import {
  evaluateNodeGraphProfitTemplate,
  GRAPH_EXECUTION_LIMITS,
} from '../modules/profit/nodeGraphProfitAdapter';
import type { NodeGraphTemplate } from '../modules/node-designer/types';
import executableFixture from '../../test-fixtures/profit-graph-executable.json';
import formulaPolicyFixture from '../../test-fixtures/profit-graph-formula-policy.json';

const template: NodeGraphTemplate = {
  id: 'graph-1',
  name: 'Strict graph',
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
      data: { name: 'Price', valueType: 'number', min: 0, max: 9999, defaultValue: 100 },
    },
    {
      id: 'rate',
      type: 'parameter',
      position: { x: 0, y: 0 },
      data: { name: 'Rate', valueType: 'percentage', min: 0, max: 100, defaultValue: 6 },
    },
    {
      id: 'commission',
      type: 'formula',
      position: { x: 0, y: 0 },
      data: {
        name: 'Commission',
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
      data: { name: 'Named commission output' },
    },
  ],
  edges: [
    { id: 'e1', source: 'price', target: 'commission', targetHandle: 'price_in' },
    { id: 'e2', source: 'rate', target: 'commission', targetHandle: 'rate_in' },
    { id: 'e3', source: 'commission', target: 'out' },
  ],
};

describe('strict node graph profit adapter', () => {
  it('accepts the shared frontend/backend executable graph fixture', () => {
    const graph = executableFixture.graphTemplateSnapshot as NodeGraphTemplate;
    const result = evaluateNodeGraphProfitTemplate(graph, executableFixture.graphInputValues);

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('expected shared contract fixture to execute');
    expect(result.outputs).toEqual([
      { id: 'out', name: 'Commission', value: 6 },
    ]);
  });

  it('evaluates a graph and preserves a legitimate zero input', () => {
    const result = evaluateNodeGraphProfitTemplate(template, { price: 0, rate: 8 });

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('expected successful graph evaluation');
    expect(result.inputValues).toEqual({ price: 0, rate: 8 });
    expect(result.outputs).toEqual([
      { id: 'out', name: 'Named commission output', value: 0 },
    ]);
  });

  it.each([
    ['missing', { rate: 8 }, 'missing_input'],
    ['NaN', { price: Number.NaN, rate: 8 }, 'non_finite_input'],
    ['Infinity', { price: Number.POSITIVE_INFINITY, rate: 8 }, 'non_finite_input'],
  ])('reports %s inputs instead of substituting zero', (_label, inputs, code) => {
    const result = evaluateNodeGraphProfitTemplate(template, inputs);

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  it('reports an unknown variable binding', () => {
    const invalidTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? {
          ...node,
          data: {
            ...node.data,
            variables: [
              { portId: 'price_in', label: 'price' },
              { portId: 'unbound', label: 'rate' },
            ],
          },
        }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(invalidTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_binding', nodeId: 'commission' }),
    ]));
  });

  it('rejects symbols that are neither declared bindings nor supported mathjs names', () => {
    const invalidTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? { ...node, data: { ...node.data, expression: 'price * rate + missing' } }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(invalidTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected unknown formula symbol to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'formula_error',
        nodeId: 'commission',
        message: expect.stringContaining('missing'),
      }),
    ]));
  });

  it('allows supported mathjs functions and finite constants', () => {
    const supportedTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? {
          ...node,
          data: {
            ...node.data,
            expression: 'round(sqrt(price) * rate + pi - pi, 4)',
          },
        }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(supportedTemplate, { price: 100, rate: 8 });

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('expected supported formula names to execute');
    expect(result.outputs[0].value).toBe(0.8);
  });

  it.each(formulaPolicyFixture.allowed)(
    'allows the shared scalar formula policy expression $expression',
    ({ expression, expected }) => {
      const allowedTemplate: NodeGraphTemplate = {
        ...template,
        nodes: template.nodes.map(node => node.id === 'commission'
          ? { ...node, data: { ...node.data, expression } }
          : node),
      };

      const result = evaluateNodeGraphProfitTemplate(allowedTemplate, { price: 100, rate: 6 });

      expect(result.ok).toBe(true);
      if (result.ok === false) throw new Error('expected allowed scalar formula to execute');
      expect(result.outputs[0].value).toBeCloseTo(expected, 10);
    },
  );

  it.each(formulaPolicyFixture.rejected)(
    'rejects non-scalar or stateful formula syntax before execution: %s',
    expression => {
      const rejectedTemplate: NodeGraphTemplate = {
        ...template,
        nodes: template.nodes.map(node => node.id === 'commission'
          ? { ...node, data: { ...node.data, expression } }
          : node),
      };

      const result = evaluateNodeGraphProfitTemplate(rejectedTemplate, { price: 100, rate: 6 });

      expect(result.ok).toBe(false);
      if (result.ok !== false) throw new Error('expected unsafe formula to be rejected');
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'formula_error',
          nodeId: 'commission',
        }),
      ]));
    },
  );

  it.each([
    ['function argument count', `max(${Array.from({ length: 9 }, () => 'price').join(',')})`],
    ['AST depth', `${'('.repeat(34)}price${')'.repeat(34)}`],
  ])('rejects formulas above the %s complexity limit', (_label, expression) => {
    const rejectedTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? { ...node, data: { ...node.data, expression } }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(rejectedTemplate, { price: 100, rate: 6 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected complex formula to be rejected');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'formula_error', nodeId: 'commission' }),
    ]));
  });

  it.each([
    ['an extra input key', { price: 100, rate: 6, unexpected: 1 }],
    ['a blank input key', { price: 100, rate: 6, ' ': 1 }],
  ])('rejects %s to match the backend input contract', (_label, inputs) => {
    const result = evaluateNodeGraphProfitTemplate(template, inputs);

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected strict input keys to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'graph_structure' }),
    ]));
  });

  it.each([
    ['blank node name', {
      ...template,
      nodes: template.nodes.map(node => node.id === 'price'
        ? { ...node, data: { ...node.data, name: ' ' } }
        : node),
    }],
    ['an incoming parameter edge', {
      ...template,
      edges: [
        ...template.edges,
        { id: 'parameter-in', source: 'commission', target: 'price' },
      ],
    }],
  ])('rejects %s before formula execution', (_label, invalidTemplate) => {
    const result = evaluateNodeGraphProfitTemplate(
      invalidTemplate as NodeGraphTemplate,
      { price: 100, rate: 6 },
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected strict graph structure to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'graph_structure' }),
    ]));
  });

  it('reports formula syntax/runtime failures and downstream dependency errors', () => {
    const invalidTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? { ...node, data: { ...node.data, expression: 'price +' } }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(invalidTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'formula_error', nodeId: 'commission' }),
      expect.objectContaining({ code: 'dependency_error', nodeId: 'out' }),
    ]));
  });

  it('reports cycles that cannot be topologically evaluated', () => {
    const cyclicTemplate: NodeGraphTemplate = {
      ...template,
      edges: [
        ...template.edges,
        { id: 'cycle', source: 'commission', target: 'commission', targetHandle: 'price_in' },
      ],
    };

    const result = evaluateNodeGraphProfitTemplate(cyclicTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'cycle' }),
    ]));
  });

  it.each([
    ['duplicate node id', {
      ...template,
      nodes: [...template.nodes, { ...template.nodes[0] }],
    }, 'duplicate node'],
    ['duplicate edge id', {
      ...template,
      edges: [...template.edges, { ...template.edges[0], source: 'rate' }],
    }, 'duplicate edge'],
    ['missing edge source', {
      ...template,
      edges: template.edges.map((edge, index) => index === 0 ? { ...edge, source: 'missing' } : edge),
    }, 'existing node'],
  ])('rejects %s before execution', (_label, invalidTemplate, message) => {
    const result = evaluateNodeGraphProfitTemplate(
      invalidTemplate as NodeGraphTemplate,
      { price: 200, rate: 8 },
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected invalid graph structure to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'graph_structure',
        message: expect.stringContaining(message),
      }),
    ]));
  });

  it('rejects graphs above the executable node limit without traversing them', () => {
    const oversizedTemplate: NodeGraphTemplate = {
      ...template,
      nodes: Array.from({ length: GRAPH_EXECUTION_LIMITS.maxNodes + 1 }, (_, index) => ({
        id: `input-${index}`,
        type: 'parameter' as const,
        position: { x: 0, y: index },
        data: {
          name: `Input ${index}`,
          valueType: 'number' as const,
          min: 0,
          max: 1,
          defaultValue: 0,
        },
      })),
      edges: [],
    };

    const result = evaluateNodeGraphProfitTemplate(oversizedTemplate, {});

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected oversized graph to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'graph_structure',
        message: expect.stringContaining(String(GRAPH_EXECUTION_LIMITS.maxNodes)),
      }),
    ]));
  });

  it('reports missing output connections', () => {
    const missingOutputTemplate: NodeGraphTemplate = {
      ...template,
      edges: template.edges.filter(edge => edge.target !== 'out'),
    };

    const result = evaluateNodeGraphProfitTemplate(missingOutputTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_output', nodeId: 'out' }),
    ]));
  });

  it('reports non-finite formula results as non-finite outputs', () => {
    const nonFiniteTemplate: NodeGraphTemplate = {
      ...template,
      nodes: template.nodes.map(node => node.id === 'commission'
        ? { ...node, data: { ...node.data, expression: '10 ^ 1000' } }
        : node),
    };

    const result = evaluateNodeGraphProfitTemplate(nonFiniteTemplate, { price: 200, rate: 8 });

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('expected graph evaluation to fail');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'non_finite_output', nodeId: 'commission' }),
    ]));
  });
});
