import { create, all, type SymbolNode } from 'mathjs';

const math = create(all, {});

export function evaluateExpression(expression: string, variables: Record<string, number>): number {
  try {
    const result = math.evaluate(expression, variables);
    if (typeof result !== 'number') {
      throw new Error('Expression must evaluate to a number');
    }
    if (!isFinite(result)) {
      throw new Error('Division by zero');
    }
    return result;
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'Division by zero') throw e;
      throw new Error(`Formula error: ${e.message}`);
    }
    throw new Error('Formula error');
  }
}

export function validateExpression(
  expression: string,
  variableNames: string[]
): string {
  if (!expression.trim()) return '公式不能为空';
  try {
    const node = math.parse(expression);
    const symbolNames = node
      .filter((n) => n.type === 'SymbolNode')
      .map((n) => (n as SymbolNode).name);
    const unknown = symbolNames.filter((s) => !variableNames.includes(s));
    if (unknown.length > 0) {
      return `未知变量: ${unknown.join(', ')}`;
    }
    return '';
  } catch (e) {
    if (e instanceof Error) {
      return `语法错误: ${e.message}`;
    }
    return '公式无效';
  }
}

interface EdgeLike {
  source: string;
  target: string;
  targetHandle?: string;
}

export function hasCycle(edges: EdgeLike[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source) || [];
    list.push(e.target);
    adj.set(e.source, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    visiting.add(node);
    for (const neighbor of adj.get(node) || []) {
      if (visiting.has(neighbor)) return true;
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  return false;
}

export interface EvalNode {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

export interface EvalResult {
  values: Map<string, number>;
  errors: Map<string, string>;
}

export function evaluateGraph(
  nodes: EvalNode[],
  edges: EdgeLike[]
): EvalResult {
  const values = new Map<string, number>();
  const errors = new Map<string, string>();
  const sorted = topologicalSort(nodes, edges);

  const varMap = new Map<string, string>();
  for (const e of edges) {
    if (e.targetHandle) {
      varMap.set(e.targetHandle, e.source);
    }
  }

  for (const id of sorted) {
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;

    if (node.type === 'parameter') {
      const d = node.data;
      const valueType = typeof d.valueType === 'string' ? d.valueType : 'number';
      const defaultValue = typeof d.defaultValue === 'number' ? d.defaultValue : 0;
      const min = typeof d.min === 'number' ? d.min : 0;
      const max = typeof d.max === 'number' ? d.max : 100;
      let val = Math.min(Math.max(defaultValue, min), max);
      if (valueType === 'percentage') {
        val = val / 100;
      }
      values.set(id, val);
    } else if (node.type === 'formula') {
      const d = node.data;
      const expression = typeof d.expression === 'string' ? d.expression : '';
      const variables = Array.isArray(d.variables)
        ? (d.variables as { portId: string; label: string }[])
        : [];

      if (!expression.trim()) {
        values.set(id, 0);
        continue;
      }

      const vars: Record<string, number> = {};
      for (const v of variables) {
        const sourceId = varMap.get(v.portId);
        const srcVal = sourceId ? values.get(sourceId) : undefined;
        if (sourceId && srcVal === undefined && errors.has(sourceId)) {
          errors.set(id, '输入节点计算错误');
          break;
        }
        vars[v.label] = srcVal ?? 0;
      }

      if (errors.has(id)) continue;

      try {
        const result = evaluateExpression(expression, vars);
        values.set(id, result);
      } catch (e) {
        errors.set(id, e instanceof Error ? e.message : '公式计算错误');
      }
    } else if (node.type === 'output') {
      const sourceEdge = edges.find((e) => e.target === id);
      if (sourceEdge) {
        const sourceVal = values.get(sourceEdge.source);
        if (sourceVal !== undefined) {
          values.set(id, sourceVal);
        } else if (errors.has(sourceEdge.source)) {
          errors.set(id, '输入节点计算错误');
        }
      }
    }
  }

  return { values, errors };
}

export function topologicalSort(
  nodes: { id: string }[],
  edges: EdgeLike[]
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    const list = adj.get(e.source) || [];
    list.push(e.target);
    adj.set(e.source, list);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adj.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
