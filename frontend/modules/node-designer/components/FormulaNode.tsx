import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const FormulaNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name : null;
  const expression = typeof d.expression === 'string' ? d.expression : null;
  const error = typeof d.error === 'string' ? d.error : null;
  const variables = Array.isArray(d.variables)
    ? (d.variables as { portId: string; label: string }[])
    : null;
  const computedValue = typeof d.computedValue === 'number' ? d.computedValue : undefined;

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[160px] shadow-sm transition-shadow ${
        selected ? 'border-blue-400 shadow-md' : error ? 'border-red-400' : 'border-violet-300'
      }`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {variables?.length ? variables.map((v, i) => (
        <Handle
          key={v.portId}
          type="target"
          position={Position.Left}
          id={v.portId}
          style={{ top: `${((i + 1) / (variables.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
        />
      )) : (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
      />
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {name || '公式'}
      </div>
      <div className="text-[11px] mt-1 font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
        {expression || '(empty)'}
      </div>
      {error ? (
        <div className="text-xs text-red-500 mt-0.5">{error}</div>
      ) : computedValue !== undefined ? (
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          = {Number(computedValue.toFixed(4))}
        </div>
      ) : null}
    </div>
  );
};

export default memo(FormulaNode);
