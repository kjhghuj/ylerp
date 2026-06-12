import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import type { DesignerEdge, DesignerNode } from '../types';

const EditableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}) => {
  const { setEdges } = useReactFlow<DesignerNode, DesignerEdge>();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const deleteEdge = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={28}
        className={
          selected
            ? 'node-designer-edge node-designer-edge-selected'
            : 'node-designer-edge'
        }
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label="删除连接"
          title="删除连接"
          className={`node-designer-edge-action ${
            selected ? 'node-designer-edge-action-visible' : ''
          }`}
          onClick={deleteEdge}
          onContextMenu={deleteEdge}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          x
        </button>
      </EdgeLabelRenderer>
    </>
  );
};

export default memo(EditableEdge);
