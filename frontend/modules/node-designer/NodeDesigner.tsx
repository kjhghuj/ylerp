import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { NodeEditorPanel } from './components/NodeEditorPanel';
import { useNodeGraph } from './useNodeGraph';
import { PlatformType } from '../../platformConfig';

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

  const [templateCountry, setTemplateCountry] = useState('MYR');
  const [templatePlatform, setTemplatePlatform] = useState<PlatformType>('shopee');
  const [templates, setTemplates] = useState<{ id: string; name: string; country?: string; platform?: string; type?: string }[]>([]);

  useEffect(() => {
    loadTemplates({ type: 'profit', country: templateCountry }).then(setTemplates).catch(() => {});
  }, [loadTemplates, templateCountry]);

  const handleSave = async (name: string) => {
    await saveTemplate(name, { type: 'profit', country: templateCountry, platform: templatePlatform });
    const list = await loadTemplates({ type: 'profit', country: templateCountry });
    setTemplates(list);
  };

  const handleLoad = async (id: string) => {
    await loadTemplate(id);
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    const list = await loadTemplates({ type: 'profit', country: templateCountry });
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
        country={templateCountry}
        platform={templatePlatform}
        onCountryChange={setTemplateCountry}
        onPlatformChange={setTemplatePlatform}
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
          onEdgeDoubleClick={graph.onEdgeDoubleClick}
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
