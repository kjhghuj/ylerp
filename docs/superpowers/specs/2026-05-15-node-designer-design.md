# 节点设计 (Node Designer) — 设计规格

## 概述

新增「节点设计」功能模块，与「日程管理」同级，基于 React Flow 的节点式可视化计算画布。用户将利润计算的每个输入字段设计为可拖动节点，节点间通过端口连线建立计算依赖关系，构建完整的计算流程图。

### 核心能力

- 两种节点类型：参数节点（纯数值）、公式节点（带计算表达式）
- 节点可拖动、连线、编辑、删除
- 画布无限缩放/平移（ComfyUI 风格）
- 计算图可保存为模板，供利润计算模块引用

---

## 技术方案

- **画布引擎**: `@xyflow/react` (React Flow v12+)，MIT 协议
- **公式引擎**: `mathjs` (mini build, ~8KB)，支持 `+-*/%()` 及 `min/max/round`
- **样式**: Tailwind CSS，与项目统一

---

## 数据模型

```typescript
interface ParameterNodeData {
  name: string;
  valueType: 'number' | 'percentage';
  min: number;
  max: number;
  defaultValue: number;
}

interface FormulaNodeData {
  name: string;
  expression: string;                 // e.g. "(a * b) / (1 - c)"
  variables: { portId: string; label: string }[];
}

interface NodeGraphTemplate {
  id: string;
  name: string;
  productId?: string;
  nodes: Node<ParameterNodeData | FormulaNodeData>[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
}
```

### 端口规则

| 节点类型 | 左侧输入 | 右侧输出 |
|---------|---------|---------|
| 参数节点 | 0 个 | 1 个（输出常量值） |
| 公式节点 | 动态 N 个（一个变量一个口） | 1 个（输出计算结果） |

---

## 界面布局

```
┌─────────────────────────────────────────────────────┐
│  Toolbar: [添加参数节点] [添加公式节点] [保存模板] [加载] │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│    无限画布           │    属性编辑面板（右侧滑出）       │
│                      │                              │
│   ┌──────┐  ┌──────┐ │    节点名称 / 类型 / 最值      │
│   │ 参数  │──│ 公式  │ │    公式编辑器（可视化+表达式）  │
│   └──────┘  └──┬───┘ │    变量端口映射               │
│                │      │                              │
│           ┌────┴───┐ │                              │
│           │ 利润结果 │ │                              │
│           └────────┘ │                              │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│   Minimap + 缩放控制（右下角）                         │
└─────────────────────────────────────────────────────┘
```

### 交互

- 点击画布空白 → 取消选中，关闭编辑面板
- 点击节点 → 选中，右侧滑出编辑面板
- 拖拽端口 → 拉出连线，松到另一端口完成连接
- 双击节点 → 快速展开编辑面板
- 滚轮 → 缩放 | 空格+拖拽 → 平移
- 点击连线 → 选中后 Delete 删除

---

## 公式引擎

```
evaluateExpression(expression: string, variables: Record<string, number>): number
```

- 用 mathjs 解析并求值，内置语法校验
- 除零/语法错误 → 节点显示错误状态，不阻断其他节点
- 计算触发：任一上游值变化 → 拓扑排序 → 逐级 BFS 重算
- 连线时检测环路，若成环则阻止并提示

---

## 后端接口

新增 `NodeGraphTemplate` 数据库模型及 REST API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/node-graphs` | 获取模板列表 |
| GET | `/api/node-graphs/:id` | 获取模板详情 |
| POST | `/api/node-graphs` | 保存新模板 |
| PUT | `/api/node-graphs/:id` | 更新模板 |
| DELETE | `/api/node-graphs/:id` | 删除模板 |

### 数据库字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (uuid) | 主键 |
| name | String | 模板名称 |
| nodes | Json | 节点数组 |
| edges | Json | 连线数组 |
| productId | String? | 关联产品 |
| userId | String | 创建者 |

---

## 文件结构

```
frontend/modules/node-designer/
├── NodeDesigner.tsx           # 主入口组件
├── components/
│   ├── Canvas.tsx             # ReactFlow 画布
│   ├── ParameterNode.tsx      # 参数节点渲染
│   ├── FormulaNode.tsx        # 公式节点渲染
│   ├── NodeEditorPanel.tsx    # 属性编辑面板（右侧滑出）
│   ├── FormulaBuilder.tsx     # 公式编辑器（可视化拼装 + 自由表达式）
│   └── Toolbar.tsx            # 顶部工具栏
├── types.ts
├── formulaEngine.ts           # 公式解析与计算引擎
├── useNodeGraph.ts            # 画布状态管理 hook
└── utils.ts
```

### 注册点（已有文件修改）

| 文件 | 修改内容 |
|------|----------|
| `App.tsx` | 添加 `node-designer` 视图路由 |
| `Sidebar.tsx` | 添加导航项 |
| `types.ts` | 扩展 `AppState['currentView']` |
| `locales/zh.ts` | 中文文案 |
| `locales/en.ts` | 英文文案 |

---

## 与利润计算模块集成

1. 在 ProfitCalculator 中新增「从节点设计导入」按钮
2. 弹出模板选择器，展示已保存的节点图模板
3. 选定模板后，参数节点值映射到利润计算对应字段
4. 公式节点计算结果作为计算后值填入明细表

---

## 项目注册修改清单

```
App.tsx:
  + import { NodeDesigner } from './modules/node-designer/NodeDesigner'
  + moduleViews 数组添加 'node-designer'
  + switch/case 添加 case 'node-designer': return <NodeDesigner />
  + getHeaderTitle 添加标题

Sidebar.tsx:
  + 添加导航按钮

types.ts:
  + AppState['currentView'] 联合类型添加 'node-designer'

locales/zh.ts:
  + sidebar.nodeDesigner: '节点设计'

locales/en.ts:
  + sidebar.nodeDesigner: 'Node Designer'
```
