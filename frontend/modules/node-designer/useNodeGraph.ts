import { useCallback, useMemo, useRef, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react';
import type { DesignerNode, DesignerEdge, ParameterNodeData, FormulaNodeData, OutputNodeData } from './types';
import { evaluateGraph, hasCycle } from './formulaEngine';
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

const DEFAULT_OUTPUT_DATA: OutputNodeData = {
  name: '输出',
};

export function useNodeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignerNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DesignerEdge>([]);
  const [selectedNode, setSelectedNode] = useState<DesignerNode | null>(null);
  const nodeCounter = useRef(0);

  const graphResult = useMemo(
    () => evaluateGraph(nodes, edges),
    [nodes, edges]
  );

  const nodesWithValues = useMemo<DesignerNode[]>(
    () =>
      nodes.map((n) => {
        const value = graphResult.values.get(n.id);
        const error = graphResult.errors.get(n.id);
        return {
          ...n,
          data: { ...n.data, computedValue: value, error: error || (n.data as Record<string, unknown>).error },
        };
      }),
    [nodes, graphResult]
  );

  const addParameterNode = useCallback(() => {
    nodeCounter.current += 1;
    const id = genId();
    const newNode: DesignerNode = {
      id,
      type: 'parameter',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { ...DEFAULT_PARAM_DATA, name: `参数 ${nodeCounter.current}` },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const addFormulaNode = useCallback(() => {
    nodeCounter.current += 1;
    const id = genId();
    const newNode: DesignerNode = {
      id,
      type: 'formula',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { ...DEFAULT_FORMULA_DATA, name: `公式 ${nodeCounter.current}` },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const addOutputNode = useCallback(() => {
    nodeCounter.current += 1;
    const id = genId();
    const newNode: DesignerNode = {
      id,
      type: 'output',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { ...DEFAULT_OUTPUT_DATA, name: `输出 ${nodeCounter.current}` },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

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
      setNodes(Array.isArray(template?.nodes) ? template.nodes : []);
      setEdges(Array.isArray(template?.edges) ? template.edges : []);
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const loadTemplates = useCallback(async (): Promise<{ id: string; name: string }[]> => {
    const res = await api.get('/node-graphs');
    return res.data;
  }, []);

  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      await api.delete(`/node-graphs/${id}`);
    },
    []
  );

  const onNodesDelete = useCallback(
    (deleted: DesignerNode[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      setEdges((eds) => eds.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
    },
    [setEdges]
  );

  const clear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  return {
    nodes: nodesWithValues,
    edges,
    selectedNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
    addParameterNode,
    addFormulaNode,
    addOutputNode,
    updateNodeData,
    setSelectedNode,
    onNodesDelete,
    saveTemplate,
    loadTemplate,
    loadTemplates,
    deleteTemplate,
    clear,
  };
}
