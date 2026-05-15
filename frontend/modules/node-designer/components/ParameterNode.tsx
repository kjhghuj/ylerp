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
