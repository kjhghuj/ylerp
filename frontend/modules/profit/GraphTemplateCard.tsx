import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { PlatformType } from '../../platformConfig';
import type { PlatformNode } from './types';
import { normalizeCurrencyCode } from './types';
import type { NodeGraphTemplate } from '../node-designer/types';
import {
    createDefaultInputValues,
    evaluateNodeGraphProfitTemplate,
    formatNodeGraphEvaluationError,
    getNodeGraphInputNodes,
    type NodeGraphEvaluationErrorLabels,
} from './nodeGraphProfitAdapter';

interface GraphTemplateCardProps {
    node: PlatformNode;
    onUpdateInputs: (id: string, inputValues: Record<string, number>, outputValues: Record<string, number>) => void;
    onValidationChange: (id: string, state: GraphNodeRuntimeValidationState) => void;
    onDelete: (id: string) => void;
    errorLabels: NodeGraphEvaluationErrorLabels;
}

export interface GraphNodeRuntimeValidationState {
    inputDrafts: Record<string, string>;
    error: string | null;
}

const createInputDrafts = (
    template: NodeGraphTemplate | undefined,
    storedInputValues: Record<string, number> | undefined,
): Record<string, string> => {
    if (!template) return {};
    const defaults = createDefaultInputValues(template);
    return Object.fromEntries(getNodeGraphInputNodes(template).map(input => {
        const hasStoredValue = storedInputValues !== undefined &&
            Object.prototype.hasOwnProperty.call(storedInputValues, input.id);
        const value = hasStoredValue
            ? storedInputValues?.[input.id]
            : (storedInputValues === undefined ? defaults[input.id] : '');
        return [input.id, value === '' || value === undefined ? '' : String(value)];
    }));
};

const parseInputDrafts = (drafts: Record<string, string>): Record<string, unknown> => (
    Object.fromEntries(Object.entries(drafts).map(([id, value]) => [
        id,
        value.trim() === '' ? undefined : Number(value),
    ]))
);

export const GraphTemplateCard: React.FC<GraphTemplateCardProps> = ({
    node,
    onUpdateInputs,
    onValidationChange,
    onDelete,
    errorLabels,
}) => {
    const template = node.graphTemplateSnapshot;
    const storedInputValues = node.graphInputValues;
    const [inputDrafts, setInputDrafts] = useState<Record<string, string>>(
        () => createInputDrafts(template, storedInputValues),
    );

    useEffect(() => {
        setInputDrafts(createInputDrafts(template, storedInputValues));
    }, [storedInputValues, template]);

    const result = useMemo(() => {
        if (!template) return null;
        return evaluateNodeGraphProfitTemplate(template, parseInputDrafts(inputDrafts));
    }, [template, inputDrafts]);

    useEffect(() => {
        if (!result) return;
        onValidationChange(node.id, {
            inputDrafts: { ...inputDrafts },
            error: result.ok === false
                ? result.errors.map(error => formatNodeGraphEvaluationError(error, errorLabels)).join('；')
                : null,
        });
    }, [errorLabels, inputDrafts, node.id, onValidationChange, result]);

    if (!template || !result) return null;

    const inputs = getNodeGraphInputNodes(template);
    const platform = (template.platform || node.platform || 'other') as PlatformType;
    const snapshotCurrency = normalizeCurrencyCode(template.country);
    const runtimeCurrency = normalizeCurrencyCode(node.currency) || node.currency;
    const hasDifferentSnapshotSite = Boolean(
        template.country &&
        snapshotCurrency &&
        runtimeCurrency &&
        snapshotCurrency !== runtimeCurrency,
    );

    const handleInputChange = (inputId: string, value: string) => {
        const nextDrafts = { ...inputDrafts, [inputId]: value };
        setInputDrafts(nextDrafts);
        const nextResult = evaluateNodeGraphProfitTemplate(template, parseInputDrafts(nextDrafts));
        if (nextResult.ok === false) {
            onValidationChange(node.id, {
                inputDrafts: nextDrafts,
                error: nextResult.errors.map(error => (
                    formatNodeGraphEvaluationError(error, errorLabels)
                )).join('；'),
            });
            return;
        }
        onValidationChange(node.id, {
            inputDrafts: nextDrafts,
            error: null,
        });
        onUpdateInputs(
            node.id,
            nextResult.inputValues,
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
                        <span className="text-sm font-black text-slate-800">{runtimeCurrency}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{platform}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-bold mt-1 bg-white/70 px-1.5 py-0.5 rounded border border-emerald-100 inline-block">
                        {template.name}
                    </div>
                    {hasDifferentSnapshotSite && (
                        <div className="text-[10px] text-amber-700 mt-1">
                            原模板站点：{template.country}
                        </div>
                    )}
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
                                value={inputDrafts[input.id] ?? ''}
                                onChange={(event) => handleInputChange(input.id, event.target.value)}
                                aria-invalid={result.ok === false && result.errors.some(error => error.inputId === input.id)}
                                min={input.min}
                                max={input.max}
                                className="w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            />
                        </label>
                    ))}
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                    {result.ok === true ? result.outputs.map(output => (
                        <div key={output.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                            <span className="text-xs font-bold text-slate-500">{output.name}</span>
                            <span className="text-lg font-black text-emerald-600">{Number(output.value.toFixed(4))}</span>
                        </div>
                    )) : (
                        <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2 space-y-1">
                            {result.errors.map((error, index) => (
                                <div key={`${error.code}-${error.nodeId || 'graph'}-${index}`}>
                                    {formatNodeGraphEvaluationError(error, errorLabels)}
                                </div>
                            ))}
                        </div>
                    )}
                    {result.ok === true && result.outputs.length === 0 && (
                        <div className="text-xs text-slate-400 text-center py-3">暂无输出节点</div>
                    )}
                </div>
            </div>
        </div>
    );
};
