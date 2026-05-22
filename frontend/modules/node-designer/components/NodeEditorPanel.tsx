import React from 'react';
import { X } from 'lucide-react';
import type { DesignerNode, ParameterNodeData, FormulaNodeData, OutputNodeData } from '../types';
import { FormulaBuilder } from './FormulaBuilder';

interface NodeEditorPanelProps {
  node: DesignerNode | null;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({ node, onUpdate, onClose }) => {
  if (!node) return null;

  const isFormula = node.type === 'formula';
  const isOutput = node.type === 'output';
  const name = (node.data as ParameterNodeData).name || (node.data as FormulaNodeData).name || (node.data as OutputNodeData).name || '';

  return (
    <div
      className="w-80 h-full border-l overflow-y-auto p-4 space-y-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          编辑节点
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-black/5">
          <X size={16} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>节点名称</span>
        <input
          value={name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
      </label>

      {!isFormula && !isOutput && (() => {
        const data = node.data as ParameterNodeData;
        return (
          <>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>类型</span>
              <select
                value={data.valueType || 'number'}
                onChange={(e) => onUpdate(node.id, { valueType: e.target.value })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="number">数字</option>
                <option value="percentage">百分比</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>最小值</span>
                <input
                  type="number"
                  value={data.min ?? 0}
                  onChange={(e) => onUpdate(node.id, { min: Number(e.target.value) })}
                  className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>最大值</span>
                <input
                  type="number"
                  value={data.max ?? 0}
                  onChange={(e) => onUpdate(node.id, { max: Number(e.target.value) })}
                  className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>默认值</span>
              <input
                type="number"
                value={data.defaultValue ?? 0}
                onChange={(e) => onUpdate(node.id, { defaultValue: Number(e.target.value) })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
          </>
        );
      })()}

      {isFormula && (() => {
        const data = node.data as FormulaNodeData;
        return (
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>公式</span>
            <div className="mt-1">
              <FormulaBuilder
                expression={data.expression || ''}
                variables={data.variables || []}
                onExpressionChange={(expr) => onUpdate(node.id, { expression: expr })}
                onVariablesChange={(vars) => onUpdate(node.id, { variables: vars })}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
};
