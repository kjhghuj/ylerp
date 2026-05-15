# 节点设计 (Node Designer) 实现计划

> **For agentic workers:** 使用 superpowers:executing-plans 按任务逐步实现此计划。步骤使用 `- [ ]` checkbox 语法进行跟踪。

**目标:** 实现 ComfyUI 风格的可视化节点计算画布模块，支持参数节点和公式节点两种类型，节点可拖动连线，保存为模板供利润计算引用。

**架构:** React Flow (@xyflow/react) 作为画布引擎，mathjs 作为公式执行引擎，Prisma + Express 作为后端持久化。模块独立在 `frontend/modules/node-designer/` 目录下，通过 App.tsx + Sidebar.tsx 注册为同级模块。

**技术栈:** React 18, TypeScript (strict), @xyflow/react v12+, mathjs, Tailwind CSS, Prisma, PostgreSQL

---

## 文件结构预览

```
frontend/modules/node-designer/
├── NodeDesigner.tsx            # 主入口
├── components/
│   ├── Canvas.tsx              # ReactFlow 包装
│   ├── ParameterNode.tsx       # 参数节点渲染
│   ├── FormulaNode.tsx         # 公式节点渲染
│   ├── NodeEditorPanel.tsx     # 右侧编辑面板
│   ├── FormulaBuilder.tsx      # 公式编辑器
│   └── Toolbar.tsx             # 顶部工具栏
├── types.ts                    # 类型定义
├── formulaEngine.ts            # 公式解析引擎
├── useNodeGraph.ts             # 状态管理 hook
└── utils.ts                    # 辅助函数

backend/
├── prisma/schema.prisma        # 新增 NodeGraphTemplate 模型
├── prisma/migrations/          # 自动生成
├── src/routes/nodeGraphRoutes.ts  # REST API
└── src/index.ts                # 注册路由
```

---

### Task 1: 安装依赖

**文件:**
- 修改: `frontend/package.json`

- [ ] **Step 1: 安装 @xyflow/react 和 mathjs**

```bash
cd frontend && npm install @xyflow/react mathjs
```

- [ ] **Step 2: 验证安装**

```bash
cd frontend && node -e "require('@xyflow/react'); require('mathjs'); console.log('OK')"
```

预期输出: `OK`

- [ ] **Step 3: 提交**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: install @xyflow/react and mathjs"
```

---

### Task 2: 创建类型定义

**文件:**
- 创建: `frontend/modules/node-designer/types.ts`

- [ ] **Step 1: 写入类型定义**

```typescript
import type { Node, Edge } from '@xyflow/react';

export type NodeValueType = 'number' | 'percentage';

export interface ParameterNodeData {
  name: string;
  valueType: NodeValueType;
  min: number;
  max: number;
  defaultValue: number;
}

export interface FormulaNodeData {
  name: string;
  expression: string;
  variables: { portId: string; label: string }[];
  error?: string;
}

export type DesignerNodeData = ParameterNodeData | FormulaNodeData;
export type DesignerNode = Node<DesignerNodeData>;
export type DesignerEdge = Edge;

export interface NodeGraphTemplate {
  id: string;
  name: string;
  productId?: string;
  nodes: DesignerNode[];
  edges: DesignerEdge[];
  createdAt: string;
  updatedAt: string;
}

export const genId = () => {
  try { return crypto.randomUUID(); } catch {
    return 'nd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
};
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/types.ts
git commit -m "feat(node-designer): add type definitions"
```

---

### Task 3: 创建公式引擎

**文件:**
- 创建: `frontend/modules/node-designer/formulaEngine.ts`
- 创建: `frontend/__tests__/node-designer/formulaEngine.test.ts`

- [ ] **Step 1: 写入测试**

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateExpression, validateExpression, hasCycle } from '../../modules/node-designer/formulaEngine';

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
});
```

- [ ] **Step 2: 运行测试 — 预期全部 FAIL（文件不存在）**

```bash
cd frontend && npx vitest run __tests__/node-designer/formulaEngine.test.ts
```

- [ ] **Step 3: 实现公式引擎**

```typescript
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
      .filter((n) => n.isSymbolNode)
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
```

- [ ] **Step 4: 运行测试 — 预期全部 PASS**

```bash
cd frontend && npx vitest run __tests__/node-designer/formulaEngine.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add frontend/modules/node-designer/formulaEngine.ts frontend/__tests__/node-designer/formulaEngine.test.ts
git commit -m "feat(node-designer): add formula engine with cycle detection"
```

---

### Task 4: 创建参数节点组件

**文件:**
- 创建: `frontend/modules/node-designer/components/ParameterNode.tsx`

- [ ] **Step 1: 实现参数节点**

```typescript
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ParameterNodeData } from '../types';

const ParameterNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as ParameterNodeData;

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[160px] shadow-sm transition-shadow ${
        selected ? 'border-blue-400 shadow-md' : 'border-emerald-300'
      }`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-white"
      />
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {d.name || '参数'}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
        {d.valueType === 'percentage' ? '百分比' : '数值'}
        {' · '}
        {d.defaultValue ?? 0}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
        [{d.min}, {d.max}]
      </div>
    </div>
  );
};

export default memo(ParameterNode);
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/components/ParameterNode.tsx
git commit -m "feat(node-designer): add ParameterNode component"
```

---

### Task 5: 创建公式节点组件

**文件:**
- 创建: `frontend/modules/node-designer/components/FormulaNode.tsx`

- [ ] **Step 1: 实现公式节点**

```typescript
import React, { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FormulaNodeData } from '../types';
import { evaluateExpression } from '../formulaEngine';

const FormulaNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as FormulaNodeData;

  const result = useMemo(() => {
    if (!d.expression) return null;
    const vars: Record<string, number> = {};
    try {
      const val = evaluateExpression(d.expression, vars);
      return Number(val.toFixed(4));
    } catch {
      return null;
    }
  }, [d.expression]);

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[160px] shadow-sm transition-shadow ${
        selected ? 'border-blue-400 shadow-md' : d.error ? 'border-red-400' : 'border-violet-300'
      }`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {d.variables?.map((v, i) => (
        <Handle
          key={v.portId}
          type="target"
          position={Position.Left}
          id={v.portId}
          style={{ top: `${((i + 1) / (d.variables.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
        />
      )) || (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
      />
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {d.name || '公式'}
      </div>
      <div className="text-[11px] mt-1 font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
        {d.expression || '(empty)'}
      </div>
      {d.error ? (
        <div className="text-xs text-red-500 mt-0.5">{d.error}</div>
      ) : result !== null ? (
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          = {result}
        </div>
      ) : null}
    </div>
  );
};

export default memo(FormulaNode);
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/components/FormulaNode.tsx
git commit -m "feat(node-designer): add FormulaNode component"
```

---

### Task 6: 创建公式编辑器组件

**文件:**
- 创建: `frontend/modules/node-designer/components/FormulaBuilder.tsx`

- [ ] **Step 1: 实现公式编辑器**

```typescript
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { validateExpression } from '../formulaEngine';
import { genId } from '../types';

interface Variable {
  portId: string;
  label: string;
}

interface FormulaBuilderProps {
  expression: string;
  variables: Variable[];
  onExpressionChange: (expr: string) => void;
  onVariablesChange: (vars: Variable[]) => void;
}

const OPERATORS = ['+', '-', '×', '÷', '%', '(', ')'];

export const FormulaBuilder: React.FC<FormulaBuilderProps> = ({
  expression,
  variables,
  onExpressionChange,
  onVariablesChange,
}) => {
  const [mode, setMode] = useState<'visual' | 'free'>('visual');
  const validationError = validateExpression(
    expression,
    variables.map((v) => v.label)
  );

  const insertToken = (token: string) => {
    onExpressionChange(expression + token);
  };

  const addVariable = () => {
    const label = `v${variables.length + 1}`;
    onVariablesChange([...variables, { portId: genId(), label }]);
  };

  const removeVariable = (portId: string) => {
    onVariablesChange(variables.filter((v) => v.portId !== portId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('visual')}
          className={`text-xs px-2 py-1 rounded ${mode === 'visual' ? 'bg-blue-100 text-blue-700' : ''}`}
        >
          可视化
        </button>
        <button
          onClick={() => setMode('free')}
          className={`text-xs px-2 py-1 rounded ${mode === 'free' ? 'bg-blue-100 text-blue-700' : ''}`}
        >
          自由表达式
        </button>
      </div>

      {mode === 'visual' && (
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <button
              key={v.portId}
              onClick={() => insertToken(v.label)}
              className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
            >
              {v.label}
            </button>
          ))}
          {OPERATORS.map((op) => (
            <button
              key={op}
              onClick={() => insertToken(op === '×' ? '*' : op === '÷' ? '/' : op)}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {op}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={expression}
        onChange={(e) => onExpressionChange(e.target.value)}
        placeholder="e.g. (a * b) / (1 - c)"
        className="w-full text-sm font-mono px-3 py-2 rounded-lg border resize-none"
        rows={3}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
        }}
      />

      {validationError && (
        <div className="text-xs text-red-500">{validationError}</div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            变量（对应左侧输入端口）
          </span>
          <button
            onClick={addVariable}
            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            <Plus size={12} /> 添加
          </button>
        </div>
        {variables.map((v) => (
          <div key={v.portId} className="flex items-center gap-2">
            <input
              value={v.label}
              onChange={(e) => {
                const updated = variables.map((x) =>
                  x.portId === v.portId ? { ...x, label: e.target.value } : x
                );
                onVariablesChange(updated);
              }}
              className="flex-1 text-xs px-2 py-1 rounded border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              placeholder="变量名 (e.g. a, b, c)"
            />
            <button
              onClick={() => removeVariable(v.portId)}
              className="text-red-400 hover:text-red-600"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/components/FormulaBuilder.tsx
git commit -m "feat(node-designer): add FormulaBuilder component"
```

---

### Task 7: 创建节点编辑面板

**文件:**
- 创建: `frontend/modules/node-designer/components/NodeEditorPanel.tsx`

- [ ] **Step 1: 实现编辑面板**

```typescript
import React from 'react';
import { X } from 'lucide-react';
import type { DesignerNode } from '../types';
import { FormulaBuilder } from './FormulaBuilder';

interface NodeEditorPanelProps {
  node: DesignerNode | null;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({ node, onUpdate, onClose }) => {
  if (!node) return null;

  const isFormula = node.type === 'formula';
  const data = node.data as any;

  return (
    <div
      className="w-80 h-full border-l overflow-y-auto p-4 space-y-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          编辑节点
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-black/5">
          <X size={16} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>节点名称</span>
        <input
          value={data.name || ''}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
      </label>

      {!isFormula && (
        <>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>类型</span>
            <select
              value={data.valueType || 'number'}
              onChange={(e) => onUpdate(node.id, { valueType: e.target.value })}
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="number">数字</option>
              <option value="percentage">百分比</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>最小值</span>
              <input
                type="number"
                value={data.min ?? 0}
                onChange={(e) => onUpdate(node.id, { min: Number(e.target.value) })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>最大值</span>
              <input
                type="number"
                value={data.max ?? 0}
                onChange={(e) => onUpdate(node.id, { max: Number(e.target.value) })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>默认值</span>
            <input
              type="number"
              value={data.defaultValue ?? 0}
              onChange={(e) => onUpdate(node.id, { defaultValue: Number(e.target.value) })}
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </label>
        </>
      )}

      {isFormula && (
        <div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>公式</span>
          <div className="mt-1">
            <FormulaBuilder
              expression={data.expression || ''}
              variables={data.variables || []}
              onExpressionChange={(expr) => onUpdate(node.id, { expression: expr })}
              onVariablesChange={(vars) => onUpdate(node.id, { variables: vars })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/components/NodeEditorPanel.tsx
git commit -m "feat(node-designer): add NodeEditorPanel component"
```

---

### Task 8: 创建工具栏组件

**文件:**
- 创建: `frontend/modules/node-designer/components/Toolbar.tsx`

- [ ] **Step 1: 实现工具栏**

```typescript
import React, { useState } from 'react';
import { Plus, Save, FolderOpen, Trash2 } from 'lucide-react';
import { genId } from '../types';

interface ToolbarProps {
  onAddParameterNode: () => void;
  onAddFormulaNode: () => void;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onClear: () => void;
  templates: { id: string; name: string }[];
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddParameterNode,
  onAddFormulaNode,
  onSave,
  onLoad,
  onClear,
  templates,
}) => {
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b z-10"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
    >
      <button
        onClick={onAddParameterNode}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Plus size={14} /> 添加参数节点
      </button>

      <button
        onClick={onAddFormulaNode}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Plus size={14} /> 添加公式节点
      </button>

      <div className="w-px h-6" style={{ backgroundColor: 'var(--border-default)' }} />

      <div className="relative">
        <button
          onClick={() => { setShowSave(!showSave); setShowLoad(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Save size={14} /> 保存模板
        </button>
        {showSave && (
          <div
            className="absolute top-full mt-1 left-0 p-3 rounded-lg border shadow-lg z-20 flex gap-2"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="模板名称"
              className="text-sm px-2 py-1 rounded border flex-1"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={() => { onSave(saveName); setSaveName(''); setShowSave(false); }}
              disabled={!saveName.trim()}
              className="text-xs px-3 py-1 rounded bg-blue-500 text-white disabled:opacity-50"
            >
              保存
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => { setShowLoad(!showLoad); setShowSave(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <FolderOpen size={14} /> 加载模板
        </button>
        {showLoad && templates.length > 0 && (
          <div
            className="absolute top-full mt-1 left-0 p-2 rounded-lg border shadow-lg z-20 max-h-48 overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => { onLoad(t.id); setShowLoad(false); }}
                className="block w-full text-left text-sm px-3 py-2 rounded hover:bg-black/5"
                style={{ color: 'var(--text-primary)' }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {showLoad && templates.length === 0 && (
          <div
            className="absolute top-full mt-1 left-0 p-3 rounded-lg border shadow-lg z-20"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>暂无已保存模板</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} /> 清空画布
      </button>
    </div>
  );
};
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/components/Toolbar.tsx
git commit -m "feat(node-designer): add Toolbar component"
```

---

### Task 9: 创建状态管理 hook

**文件:**
- 创建: `frontend/modules/node-designer/useNodeGraph.ts`

- [ ] **Step 1: 实现 useNodeGraph hook**

```typescript
import { useCallback, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { DesignerNode, DesignerEdge, ParameterNodeData, FormulaNodeData } from './types';
import { hasCycle } from './formulaEngine';
import { genId } from './types';
import api from '../../src/api';

const DEFAULT_PARAM_DATA: ParameterNodeData = {
  name: '参数',
  valueType: 'number',
  min: 0,
  max: 100,
  defaultValue: 0,
};

const DEFAULT_FORMULA_DATA: FormulaNodeData = {
  name: '公式',
  expression: '',
  variables: [],
};

export function useNodeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignerNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DesignerEdge>([]);
  const [selectedNode, setSelectedNode] = useState<DesignerNode | null>(null);

  const addParameterNode = useCallback(() => {
    const id = genId();
    const newNode: DesignerNode = {
      id,
      type: 'parameter',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { ...DEFAULT_PARAM_DATA, name: `参数 ${nodes.length + 1}` },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  const addFormulaNode = useCallback(() => {
    const id = genId();
    const newNode: DesignerNode = {
      id,
      type: 'formula',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { ...DEFAULT_FORMULA_DATA, name: `公式 ${nodes.length + 1}` },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        id: '',
        source: connection.source,
        sourceHandle: connection.sourceHandle || undefined,
        target: connection.target,
        targetHandle: connection.targetHandle || undefined,
      };
      const wouldCycle = hasCycle([
        ...edges.map((e) => ({ source: e.source, target: e.target })),
        newEdge,
      ]);
      if (wouldCycle) {
        alert('不能创建循环依赖');
        return;
      }
      setEdges((eds) => addEdge(connection, eds));
    },
    [edges, setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: DesignerNode) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = useCallback(
    (id: string, data: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
    },
    [setNodes]
  );

  const saveTemplate = useCallback(
    async (name: string) => {
      await api.post('/node-graphs', { name, nodes, edges });
    },
    [nodes, edges]
  );

  const loadTemplate = useCallback(
    async (id: string) => {
      const res = await api.get(`/node-graphs/${id}`);
      const template = res.data;
      setNodes(template.nodes);
      setEdges(template.edges);
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const loadTemplates = useCallback(async (): Promise<{ id: string; name: string }[]> => {
    const res = await api.get('/node-graphs');
    return res.data;
  }, []);

  const clear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  return {
    nodes,
    edges,
    selectedNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
    addParameterNode,
    addFormulaNode,
    updateNodeData,
    setSelectedNode,
    saveTemplate,
    loadTemplate,
    loadTemplates,
    clear,
  };
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/modules/node-designer/useNodeGraph.ts
git commit -m "feat(node-designer): add useNodeGraph state hook"
```

---

### Task 10: 创建画布和主组件

**文件:**
- 创建: `frontend/modules/node-designer/components/Canvas.tsx`
- 创建: `frontend/modules/node-designer/NodeDesigner.tsx`

- [ ] **Step 1: 实现 Canvas 组件**

```typescript
import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ParameterNode from './ParameterNode';
import FormulaNode from './FormulaNode';
import { useNodeGraph } from '../useNodeGraph';

const nodeTypes: NodeTypes = {
  parameter: ParameterNode,
  formula: FormulaNode,
};

export const Canvas: React.FC = () => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
  } = useNodeGraph();

  return (
    <div className="flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        snapToGrid
        snapGrid={[16, 16]}
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border-light)"
        />
        <Controls
          className="!rounded-lg !shadow-sm !border !border-[var(--border-default)]"
          style={{ backgroundColor: 'var(--bg-card)' }}
        />
        <MiniMap
          className="!rounded-lg !shadow-sm !border !border-[var(--border-default)]"
          style={{ backgroundColor: 'var(--bg-card)' }}
          nodeColor={(node) =>
            node.type === 'parameter' ? '#6ee7b7' : '#c4b5fd'
          }
        />
      </ReactFlow>
    </div>
  );
};
```

- [ ] **Step 2: 实现 NodeDesigner 主入口**

```typescript
import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { NodeEditorPanel } from './components/NodeEditorPanel';
import { useNodeGraph } from './useNodeGraph';

const NodeDesignerInner: React.FC = () => {
  const {
    selectedNode,
    addParameterNode,
    addFormulaNode,
    updateNodeData,
    setSelectedNode,
    saveTemplate,
    loadTemplate,
    loadTemplates,
    clear,
  } = useNodeGraph();

  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadTemplates().then(setTemplates).catch(() => {});
  }, []);

  const handleSave = async (name: string) => {
    await saveTemplate(name);
    const list = await loadTemplates();
    setTemplates(list);
  };

  const handleLoad = async (id: string) => {
    await loadTemplate(id);
  };

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        onAddParameterNode={addParameterNode}
        onAddFormulaNode={addFormulaNode}
        onSave={handleSave}
        onLoad={handleLoad}
        onClear={clear}
        templates={templates}
      />
      <div className="flex-1 flex overflow-hidden">
        <Canvas />
        {selectedNode && (
          <NodeEditorPanel
            node={selectedNode}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
};

export const NodeDesigner: React.FC = () => (
  <ReactFlowProvider>
    <NodeDesignerInner />
  </ReactFlowProvider>
);
```

- [ ] **Step 3: 提交**

```bash
git add frontend/modules/node-designer/components/Canvas.tsx frontend/modules/node-designer/NodeDesigner.tsx
git commit -m "feat(node-designer): add Canvas and main NodeDesigner entry"
```

---

### Task 11: 注册模块到项目

**文件:**
- 修改: `frontend/types.ts:85-87`
- 修改: `frontend/App.tsx:16,53,75,92-93`
- 修改: `frontend/components/Sidebar.tsx:2,30`
- 修改: `frontend/locales/zh.ts:9-21`
- 修改: `frontend/locales/en.ts` (对应 sidebar)

- [ ] **Step 1: 修改 types.ts**

在 `AppState` 的 `currentView` 联合类型末尾添加 `| 'node-designer'`：
`frontend/types.ts:86` — 在 `'usage-stats'` 后添加 `| 'node-designer'`

- [ ] **Step 2: 修改 App.tsx**

(a) 在 import 区域（第16行附近）添加:
```typescript
import { NodeDesigner } from './modules/node-designer/NodeDesigner';
```

(b) 在 `moduleViews` 数组（第53行）末尾添加 `'node-designer'`

(c) 在 switch/case（第75行附近）添加:
```typescript
case 'node-designer': return <NodeDesigner />;
```

(d) 在 `getHeaderTitle`（第92行附近）添加:
```typescript
case 'node-designer': return strings.sidebar.nodeDesigner || '节点设计';
```

- [ ] **Step 3: 修改 Sidebar.tsx**

(a) 在 lucide-react import 中添加 `GitBranch`（第2行）

(b) 在 `allMenuItems` 数组中，`schedule` 项之后添加:
```typescript
{ id: 'node-designer', label: strings.sidebar.nodeDesigner || '节点设计', icon: GitBranch },
```

- [ ] **Step 4: 修改 i18n 文件**

在 `zh.ts` sidebar 对象中添加:
```typescript
nodeDesigner: '节点设计',
```

在 `en.ts` sidebar 对象中添加:
```typescript
nodeDesigner: 'Node Designer',
```

- [ ] **Step 5: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

预期: 无新增错误

- [ ] **Step 6: 提交**

```bash
git add frontend/types.ts frontend/App.tsx frontend/components/Sidebar.tsx frontend/locales/zh.ts frontend/locales/en.ts
git commit -m "feat(node-designer): register module in App, Sidebar, types, and i18n"
```

---

### Task 12: 创建后端 API

**文件:**
- 修改: `backend/prisma/schema.prisma`
- 创建: `backend/src/routes/nodeGraphRoutes.ts`
- 修改: `backend/src/index.ts`

- [ ] **Step 1: 添加 Prisma 模型**

在 `schema.prisma` User 模型后添加:
```prisma
model NodeGraphTemplate {
  id        String   @id @default(uuid())
  name      String
  nodes     Json
  edges     Json
  productId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  user      User     @relation(fields: [userId], references: [id])
}
```

同时在 User 模型的字段列表末尾添加:
```prisma
nodeGraphTemplates NodeGraphTemplate[]
```

- [ ] **Step 2: 运行迁移**

```bash
cd backend && npx prisma migrate dev --name add_node_graph_template
```

- [ ] **Step 3: 创建 API 路由**

写入 `backend/src/routes/nodeGraphRoutes.ts`:
```typescript
import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const templates = await prisma.nodeGraphTemplate.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const template = await prisma.nodeGraphTemplate.findFirst({
      where: { id: req.params.id },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, nodes, edges, productId } = req.body;
    const template = await prisma.nodeGraphTemplate.create({
      data: { name, nodes, edges, productId, userId },
    });
    res.status(201).json(template);
  } catch {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nodes, edges, productId } = req.body;
    const template = await prisma.nodeGraphTemplate.update({
      where: { id: req.params.id },
      data: { name, nodes, edges, productId },
    });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.nodeGraphTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
```

- [ ] **Step 4: 在 index.ts 注册路由**

在 import 区域添加:
```typescript
import nodeGraphRoutes from './routes/nodeGraphRoutes';
```

在路由注册区域（其他 `app.use` 之后）添加:
```typescript
app.use('/api/node-graphs', authenticate, nodeGraphRoutes);
```

- [ ] **Step 5: 验证 API**

```bash
cd backend && npx tsx src/index.ts &
sleep 3
TOKEN=$(curl -s -X POST http://localhost:4002/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
# 测试列表
curl -s http://localhost:4002/api/node-graphs -H "Authorization: Bearer $TOKEN"
# 预期: []
```

- [ ] **Step 6: 提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/routes/nodeGraphRoutes.ts backend/src/index.ts
git commit -m "feat(node-designer): add backend API and database model"
```
