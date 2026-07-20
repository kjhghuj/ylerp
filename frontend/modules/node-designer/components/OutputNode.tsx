import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const OutputNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name : null;
  const computedValue = typeof d.computedValue === 'number' ? d.computedValue : undefined;
  const isNetProfitMetric = d.metricKey === 'netProfitCNY';

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[160px] shadow-sm transition-shadow ${
        selected ? 'border-blue-400 shadow-md' : 'border-amber-300'
      }`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-white"
      />
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {name || '输出'}
      </div>
      {isNetProfitMetric && (
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
          Dashboard · 净利润 CNY
        </div>
      )}
      {computedValue !== undefined ? (
        <div className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
          {Number(computedValue.toFixed(4))}
        </div>
      ) : (
        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          等待输入...
        </div>
      )}
    </div>
  );
};

export default memo(OutputNode);
