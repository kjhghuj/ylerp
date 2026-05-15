import { describe, it, expect } from 'vitest';
import { evaluateExpression, validateExpression, hasCycle, topologicalSort } from '../../modules/node-designer/formulaEngine';

describe('evaluateExpression', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateExpression('a + b', { a: 10, b: 20 })).toBe(30);
  });

  it('evaluates with parentheses and precedence', () => {
    expect(evaluateExpression('(a + b) * c', { a: 10, b: 20, c: 2 })).toBe(60);
  });

  it('evaluates percentage expressions', () => {
    expect(evaluateExpression('a * (1 - b / 100)', { a: 100, b: 15 })).toBe(85);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('a / b', { a: 10, b: 0 })).toThrow('Division by zero');
  });

  it('evaluates negative numbers', () => {
    expect(evaluateExpression('a - b', { a: 5, b: 10 })).toBe(-5);
  });
});

describe('validateExpression', () => {
  it('returns empty string for valid expression', () => {
    expect(validateExpression('a * (b + c)', ['a', 'b', 'c'])).toBe('');
  });

  it('returns error for unknown variable', () => {
    expect(validateExpression('a + x', ['a', 'b'])).toContain('x');
  });

  it('returns error for syntax error', () => {
    expect(validateExpression('a +* b', ['a', 'b'])).not.toBe('');
  });

  it('returns error for empty expression', () => {
    expect(validateExpression('', ['a'])).toBe('公式不能为空');
  });
});

describe('hasCycle', () => {
  it('detects no cycle in linear graph', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];
    expect(hasCycle(edges)).toBe(false);
  });

  it('detects cycle in triangle graph', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'A' },
    ];
    expect(hasCycle(edges)).toBe(true);
  });

  it('detects self-loop', () => {
    const edges = [{ source: 'A', target: 'A' }];
    expect(hasCycle(edges)).toBe(true);
  });

  it('returns false for empty edges', () => {
    expect(hasCycle([])).toBe(false);
  });
});

describe('topologicalSort', () => {
  it('sorts linear graph', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];
    expect(topologicalSort(nodes, edges)).toEqual(['A', 'B', 'C']);
  });
});
