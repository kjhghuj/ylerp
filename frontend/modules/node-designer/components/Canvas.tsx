import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ParameterNode from './ParameterNode';
import FormulaNode from './FormulaNode';
import OutputNode from './OutputNode';
import type { DesignerNode, DesignerEdge } from '../types';

const nodeTypes: NodeTypes = {
  parameter: ParameterNode,
  formula: FormulaNode,
  output: OutputNode,
};

interface CanvasProps {
  nodes: DesignerNode[];
  edges: DesignerEdge[];
  onNodesChange: OnNodesChange<DesignerNode>;
  onEdgesChange: OnEdgesChange<DesignerEdge>;
  onConnect: OnConnect;
  onNodesDelete: (deleted: DesignerNode[]) => void;
  onNodeClick: (event: React.MouseEvent, node: DesignerNode) => void;
  onPaneClick: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodesDelete,
  onNodeClick,
  onPaneClick,
}) => (
  <div className="flex-1">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={onNodesDelete}
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
