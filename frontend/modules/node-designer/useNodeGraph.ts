import { useCallback, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
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
