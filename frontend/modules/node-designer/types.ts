import type { Node, Edge } from '@xyflow/react';

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
}

export type DesignerNodeData = ParameterNodeData | FormulaNodeData | OutputNodeData;
export type DesignerNode = Node<DesignerNodeData>;
export type DesignerEdge = Edge;

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
