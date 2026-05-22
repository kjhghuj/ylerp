import { describe, test, expect } from 'vitest';
import { evaluateGraph, type EvalNode, type EvalResult } from '../modules/node-designer/formulaEngine';

interface TestEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

function getValue(result: EvalResult, id: string): number | undefined {
  return result.values.get(id);
}

describe('evaluateGraph', () => {
  test('single parameter node returns its default value', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'P1', valueType: 'number', min: 0, max: 100, defaultValue: 42 } },
    ];

    const result = evaluateGraph(nodes, []);

    expect(result.values.get('p1')).toBe(42);
  });

  test('parameter node clamps default value to [min, max]', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'P1', valueType: 'number', min: 0, max: 10, defaultValue: 99 } },
    ];

    const result = evaluateGraph(nodes, []);

    expect(result.values.get('p1')).toBe(10);
  });

  test('single formula node with literal expression evaluates correctly', () => {
    const nodes: EvalNode[] = [
      { id: 'f1', type: 'formula', data: { name: 'F1', expression: '2 + 3 * 4', variables: [] } },
    ];

    const result = evaluateGraph(nodes, []);

    expect(result.values.get('f1')).toBe(14);
  });

  test('parameter feeds into formula via edge — value propagated', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'Price', valueType: 'number', min: 0, max: 1000, defaultValue: 100 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Total',
          expression: 'price * 1.2',
          variables: [{ portId: 'port_a', label: 'price' }],
        },
      },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'port_a' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('f1')).toBe(120);
  });

  test('two parameters feed into formula — both variable values propagated', () => {
    const nodes: EvalNode[] = [
      { id: 'p_a', type: 'parameter', data: { name: 'A', valueType: 'number', min: 0, max: 100, defaultValue: 10 } },
      { id: 'p_b', type: 'parameter', data: { name: 'B', valueType: 'number', min: 0, max: 100, defaultValue: 5 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Sum',
          expression: 'a + b',
          variables: [
            { portId: 'port_1', label: 'a' },
            { portId: 'port_2', label: 'b' },
          ],
        },
      },
    ];
    const edges: TestEdge[] = [
      { source: 'p_a', target: 'f1', targetHandle: 'port_1' },
      { source: 'p_b', target: 'f1', targetHandle: 'port_2' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('f1')).toBe(15);
  });

  test('chain: param → formula1 → formula2', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'Base', valueType: 'number', min: 0, max: 100, defaultValue: 50 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Doubled',
          expression: 'x * 2',
          variables: [{ portId: 'p1_in', label: 'x' }],
        },
      },
      {
        id: 'f2',
        type: 'formula',
        data: {
          name: 'PlusTen',
          expression: 'y + 10',
          variables: [{ portId: 'p2_in', label: 'y' }],
        },
      },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'p1_in' },
      { source: 'f1', target: 'f2', targetHandle: 'p2_in' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('p1')).toBe(50);
    expect(result.values.get('f1')).toBe(100);
    expect(result.values.get('f2')).toBe(110);
  });

  test('percentage type parameter divides by 100', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'Discount', valueType: 'percentage', min: 0, max: 100, defaultValue: 20 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'After Discount',
          expression: '100 * (1 - d)',
          variables: [{ portId: 'port_1', label: 'd' }],
        },
      },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'port_1' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('f1')).toBe(80);
  });

  test('formula without connected variable uses 0 for that variable', () => {
    const nodes: EvalNode[] = [
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Incomplete',
          expression: 'a + b',
          variables: [
            { portId: 'port_a', label: 'a' },
            { portId: 'port_b', label: 'b' },
          ],
        },
      },
    ];
    const result = evaluateGraph(nodes, []);

    expect(result.values.get('f1')).toBe(0);
  });

  test('output node passes through connected source value', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'Input', valueType: 'number', min: 0, max: 100, defaultValue: 77 } },
      { id: 'o1', type: 'output', data: { name: 'Result' } },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'o1' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('o1')).toBe(77);
  });

  test('output node receives formula result through chain', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'Base', valueType: 'number', min: 0, max: 200, defaultValue: 100 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Doubled',
          expression: 'x * 2',
          variables: [{ portId: 'p1_in', label: 'x' }],
        },
      },
      { id: 'o1', type: 'output', data: { name: 'Final' } },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'p1_in' },
      { source: 'f1', target: 'o1' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.get('o1')).toBe(200);
  });

  test('unconnected output node has no value', () => {
    const nodes: EvalNode[] = [
      { id: 'o1', type: 'output', data: { name: 'Orphan' } },
    ];

    const result = evaluateGraph(nodes, []);

    expect(result.values.has('o1')).toBe(false);
  });

  test('formula with division by zero has error', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'A', valueType: 'number', min: 0, max: 100, defaultValue: 0 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Bad',
          expression: '1 / a',
          variables: [{ portId: 'p1_in', label: 'a' }],
        },
      },
    ];
    const edges: TestEdge[] = [{ source: 'p1', target: 'f1', targetHandle: 'p1_in' }];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.has('f1')).toBe(false);
    expect(result.errors.get('f1')).toBeTruthy();
  });

  test('downstream formula gets error when upstream formula failed', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'A', valueType: 'number', min: 0, max: 100, defaultValue: 0 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Bad',
          expression: '1 / a',
          variables: [{ portId: 'p1_in', label: 'a' }],
        },
      },
      {
        id: 'f2',
        type: 'formula',
        data: {
          name: 'Downstream',
          expression: 'x + 1',
          variables: [{ portId: 'p2_in', label: 'x' }],
        },
      },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'p1_in' },
      { source: 'f1', target: 'f2', targetHandle: 'p2_in' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.has('f1')).toBe(false);
    expect(result.errors.get('f1')).toBeTruthy();
    expect(result.errors.get('f2')).toBe('输入节点计算错误');
  });

  test('output node gets error when connected to failed formula', () => {
    const nodes: EvalNode[] = [
      { id: 'p1', type: 'parameter', data: { name: 'A', valueType: 'number', min: 0, max: 100, defaultValue: 0 } },
      {
        id: 'f1',
        type: 'formula',
        data: {
          name: 'Bad',
          expression: '1 / a',
          variables: [{ portId: 'p1_in', label: 'a' }],
        },
      },
      { id: 'o1', type: 'output', data: { name: 'Result' } },
    ];
    const edges: TestEdge[] = [
      { source: 'p1', target: 'f1', targetHandle: 'p1_in' },
      { source: 'f1', target: 'o1' },
    ];

    const result = evaluateGraph(nodes, edges);

    expect(result.values.has('o1')).toBe(false);
    expect(result.errors.get('o1')).toBe('输入节点计算错误');
  });

  test('returns empty map for empty node list', () => {
    const result = evaluateGraph([], []);
    expect(result.values.size).toBe(0);
  });
});
