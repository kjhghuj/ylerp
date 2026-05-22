import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const ParameterNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name : null;
  const valueType = d.valueType === 'percentage' ? 'percentage' : 'number';
  const defaultValue = typeof d.defaultValue === 'number' ? d.defaultValue : 0;
  const min = typeof d.min === 'number' ? d.min : 0;
  const max = typeof d.max === 'number' ? d.max : 100;
  const computedValue = typeof d.computedValue === 'number' ? d.computedValue : undefined;

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
        {name || '参数'}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
        {valueType === 'percentage' ? '百分比' : '数值'}
        {' · '}
        {computedValue !== undefined ? computedValue : defaultValue}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
        [{min}, {max}]
      </div>
    </div>
  );
};

export default memo(ParameterNode);
