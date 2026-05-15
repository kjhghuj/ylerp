import { create, all } from 'mathjs';

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
      .map((n) => (n as any).name);
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
