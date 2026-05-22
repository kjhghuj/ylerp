import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { NodeEditorPanel } from './components/NodeEditorPanel';
import { useNodeGraph } from './useNodeGraph';

const NodeDesignerInner: React.FC = () => {
  const graph = useNodeGraph();
  const {
    selectedNode,
    updateNodeData,
    setSelectedNode,
    saveTemplate,
    loadTemplate,
    loadTemplates,
    deleteTemplate,
  } = graph;

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

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    const list = await loadTemplates();
    setTemplates(list);
  };

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        onAddParameterNode={graph.addParameterNode}
        onAddFormulaNode={graph.addFormulaNode}
        onAddOutputNode={graph.addOutputNode}
        onSave={handleSave}
        onLoad={handleLoad}
        onDeleteTemplate={handleDelete}
        onClear={graph.clear}
        templates={templates}
      />
      <div className="flex-1 flex overflow-hidden">
        <Canvas
          nodes={graph.nodes}
          edges={graph.edges}
          onNodesChange={graph.onNodesChange}
          onEdgesChange={graph.onEdgesChange}
          onConnect={graph.onConnect}
          onNodesDelete={graph.onNodesDelete}
          onNodeClick={graph.onNodeClick}
          onPaneClick={graph.onPaneClick}
        />
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
