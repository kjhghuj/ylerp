import React, { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FormulaNodeData } from '../types';
import { evaluateExpression } from '../formulaEngine';

const FormulaNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as FormulaNodeData;

  const result = useMemo(() => {
    if (!d.expression) return null;
    const vars: Record<string, number> = {};
    try {
      const val = evaluateExpression(d.expression, vars);
      return Number(val.toFixed(4));
    } catch {
      return null;
    }
  }, [d.expression]);

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[160px] shadow-sm transition-shadow ${
        selected ? 'border-blue-400 shadow-md' : d.error ? 'border-red-400' : 'border-violet-300'
      }`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {d.variables?.map((v, i) => (
        <Handle
          key={v.portId}
          type="target"
          position={Position.Left}
          id={v.portId}
          style={{ top: `${((i + 1) / (d.variables.length + 1)) * 100}%` }}
          className="!w-3 !h-3 !bg-violet-400 !border-2 !border-white"
        />
      )) || (
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
        {d.name || '公式'}
      </div>
      <div className="text-[11px] mt-1 font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
        {d.expression || '(empty)'}
      </div>
      {d.error ? (
        <div className="text-xs text-red-500 mt-0.5">{d.error}</div>
      ) : result !== null ? (
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          = {result}
        </div>
      ) : null}
    </div>
  );
};

export default memo(FormulaNode);
