import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { PlatformType } from '../../platformConfig';
import type { PlatformNode } from './types';
import { createDefaultInputValues, evaluateNodeGraphProfitTemplate, getNodeGraphInputNodes } from './nodeGraphProfitAdapter';

interface GraphTemplateCardProps {
    node: PlatformNode;
    onUpdateInputs: (id: string, inputValues: Record<string, number>, outputValues: Record<string, number>) => void;
    onDelete: (id: string) => void;
}

export const GraphTemplateCard: React.FC<GraphTemplateCardProps> = ({ node, onUpdateInputs, onDelete }) => {
    const template = node.graphTemplateSnapshot;
    const inputValues = useMemo(() => {
        if (!template) return {};
        return { ...createDefaultInputValues(template), ...(node.graphInputValues || {}) };
    }, [template, node.graphInputValues]);

    const result = useMemo(() => {
        if (!template) return null;
        return evaluateNodeGraphProfitTemplate(template, inputValues);
    }, [template, inputValues]);

    if (!template || !result) return null;

    const inputs = getNodeGraphInputNodes(template);
    const platform = (template.platform || node.platform || 'other') as PlatformType;

    const handleInputChange = (inputId: string, value: number) => {
        const nextInputs = { ...inputValues, [inputId]: value };
        const nextResult = evaluateNodeGraphProfitTemplate(template, nextInputs);
        onUpdateInputs(
            node.id,
            nextInputs,
            Object.fromEntries(nextResult.outputs.map(output => [output.id, output.value])),
        );
    };

    return (
        <div className="min-w-[340px] w-[340px] border-2 border-emerald-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden shrink-0 snap-center">
            <div className="bg-emerald-50/70 px-4 py-3 flex items-center justify-between border-b border-emerald-100">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-emerald-600">
                            节点模板
                        </span>
                        <span className="text-sm font-black text-slate-800">{template.country || node.currency}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{platform}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-bold mt-1 bg-white/70 px-1.5 py-0.5 rounded border border-emerald-100 inline-block">
                        {template.name}
                    </div>
                </div>
                <button onClick={() => onDelete(node.id)} className="p-2 -mr-2 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                </button>
            </div>

            <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    {inputs.map(input => (
                        <label key={input.id} className="block">
                            <span className="block text-xs font-bold text-slate-500 mb-0.5 truncate">{input.name}</span>
                            <input
                                type="number"
                                value={inputValues[input.id] ?? input.defaultValue}
                                onChange={(e) => handleInputChange(input.id, Number(e.target.value) || 0)}
                                className="w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            />
                        </label>
                    ))}
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                    {result.outputs.map(output => (
                        <div key={output.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                            <span className="text-xs font-bold text-slate-500">{output.name}</span>
                            <span className="text-lg font-black text-emerald-600">{Number(output.value.toFixed(4))}</span>
                        </div>
                    ))}
                    {result.outputs.length === 0 && (
                        <div className="text-xs text-slate-400 text-center py-3">暂无输出节点</div>
                    )}
                </div>
            </div>
        </div>
    );
};
