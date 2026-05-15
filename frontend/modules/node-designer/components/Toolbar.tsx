import React, { useState } from 'react';
import { Plus, Save, FolderOpen, Trash2 } from 'lucide-react';

interface ToolbarProps {
  onAddParameterNode: () => void;
  onAddFormulaNode: () => void;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onClear: () => void;
  templates: { id: string; name: string }[];
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddParameterNode,
  onAddFormulaNode,
  onSave,
  onLoad,
  onClear,
  templates,
}) => {
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b z-10"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
    >
      <button
        onClick={onAddParameterNode}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Plus size={14} /> 添加参数节点
      </button>

      <button
        onClick={onAddFormulaNode}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Plus size={14} /> 添加公式节点
      </button>

      <div className="w-px h-6" style={{ backgroundColor: 'var(--border-default)' }} />

      <div className="relative">
        <button
          onClick={() => { setShowSave(!showSave); setShowLoad(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Save size={14} /> 保存模板
        </button>
        {showSave && (
          <div
            className="absolute top-full mt-1 left-0 p-3 rounded-lg border shadow-lg z-20 flex gap-2"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="模板名称"
              className="text-sm px-2 py-1 rounded border flex-1"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={() => { onSave(saveName); setSaveName(''); setShowSave(false); }}
              disabled={!saveName.trim()}
              className="text-xs px-3 py-1 rounded bg-blue-500 text-white disabled:opacity-50"
            >
              保存
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => { setShowLoad(!showLoad); setShowSave(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <FolderOpen size={14} /> 加载模板
        </button>
        {showLoad && templates.length > 0 && (
          <div
            className="absolute top-full mt-1 left-0 p-2 rounded-lg border shadow-lg z-20 max-h-48 overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => { onLoad(t.id); setShowLoad(false); }}
                className="block w-full text-left text-sm px-3 py-2 rounded hover:bg-black/5"
                style={{ color: 'var(--text-primary)' }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {showLoad && templates.length === 0 && (
          <div
            className="absolute top-full mt-1 left-0 p-3 rounded-lg border shadow-lg z-20"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>暂无已保存模板</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} /> 清空画布
      </button>
    </div>
  );
};
