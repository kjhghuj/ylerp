/** 利润节点图模板的共享类型。
 *  原属 node-designer 模块（依赖 @xyflow/react），模块删除后内联 flow 节点/边的最小结构形状，
 *  与后端 NodeGraphTemplate.data JSON 存储的字段保持兼容。 */

export type NodeValueType = 'number' | 'percentage';

export interface ParameterNodeData extends Record<string, unknown> {
  name: string;
  valueType: NodeValueType;
  min: number;
  max: number;
  defaultValue: number;
}

export interface FormulaNodeData extends Record<string, unknown> {
  name: string;
  expression: string;
  variables: { portId: string; label: string }[];
  error?: string;
}

export interface OutputNodeData extends Record<string, unknown> {
  name: string;
  metricKey?: 'netProfitCNY';
}

export type DesignerNodeData = ParameterNodeData | FormulaNodeData | OutputNodeData;

/** @xyflow/react Node 的最小结构形状（含透传的任意额外字段） */
export interface DesignerNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: DesignerNodeData;
  [key: string]: unknown;
}

/** @xyflow/react Edge 的最小结构形状（含透传的任意额外字段） */
export interface DesignerEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [key: string]: unknown;
}

export interface NodeGraphTemplate {
  id: string;
  name: string;
  type?: string;
  country?: string | null;
  platform?: string | null;
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
