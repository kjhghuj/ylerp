import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { validateExpression } from '../formulaEngine';
import { genId } from '../types';

interface Variable {
  portId: string;
  label: string;
}

interface FormulaBuilderProps {
  expression: string;
  variables: Variable[];
  onExpressionChange: (expr: string) => void;
  onVariablesChange: (vars: Variable[]) => void;
}

const OPERATORS = ['+', '-', '×', '÷', '%', '(', ')'];

export const FormulaBuilder: React.FC<FormulaBuilderProps> = ({
  expression,
  variables,
  onExpressionChange,
  onVariablesChange,
}) => {
  const [mode, setMode] = useState<'visual' | 'free'>('free');
  const validationError = validateExpression(
    expression,
    variables.map((v) => v.label)
  );

  const insertToken = (token: string) => {
    onExpressionChange(expression + token);
  };

  const addVariable = () => {
    const label = `v${variables.length + 1}`;
    onVariablesChange([...variables, { portId: genId(), label }]);
  };

  const removeVariable = (portId: string) => {
    onVariablesChange(variables.filter((v) => v.portId !== portId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('visual')}
          className={`text-xs px-2 py-1 rounded ${mode === 'visual' ? 'bg-blue-100 text-blue-700' : ''}`}
          style={mode !== 'visual' ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' } : {}}
        >
          可视化
        </button>
        <button
          onClick={() => setMode('free')}
          className={`text-xs px-2 py-1 rounded ${mode === 'free' ? 'bg-blue-100 text-blue-700' : ''}`}
          style={mode !== 'free' ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' } : {}}
        >
          自由表达式
        </button>
      </div>

      {mode === 'visual' && (
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <button
              key={v.portId}
              onClick={() => insertToken(v.label)}
              className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
            >
              {v.label}
            </button>
          ))}
          {OPERATORS.map((op) => (
            <button
              key={op}
              onClick={() => insertToken(op === '×' ? '*' : op === '÷' ? '/' : op)}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {op}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={expression}
        onChange={(e) => onExpressionChange(e.target.value)}
        placeholder="e.g. (a * b) / (1 - c)"
        className="w-full text-sm font-mono px-3 py-2 rounded-lg border resize-none"
        rows={3}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
        }}
      />

      {validationError && (
        <div className="text-xs text-red-500">{validationError}</div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            变量（对应左侧输入端口）
          </span>
          <button
            onClick={addVariable}
            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            <Plus size={12} /> 添加
          </button>
        </div>
        {variables.map((v) => (
          <div key={v.portId} className="flex items-center gap-2">
            <input
              value={v.label}
              onChange={(e) => {
                const updated = variables.map((x) =>
                  x.portId === v.portId ? { ...x, label: e.target.value } : x
                );
                onVariablesChange(updated);
              }}
              className="flex-1 text-xs px-2 py-1 rounded border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              placeholder="变量名"
            />
            <button
              onClick={() => removeVariable(v.portId)}
              className="text-red-400 hover:text-red-600"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
