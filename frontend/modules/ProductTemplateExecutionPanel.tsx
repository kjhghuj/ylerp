import React from 'react';
import type { ProductTemplateProfitViewModel } from './productTemplateProfitViewModel';
import {
    formatNodeGraphEvaluationError,
    type NodeGraphEvaluationErrorCode,
    type NodeGraphEvaluationErrorLabels,
} from './profit/nodeGraphProfitAdapter';

interface ProductTemplateExecutionLabels {
    graphOutputsTitle: string;
    graphOutputsDisclaimer: string;
    invalidCompatibility: string;
    graphErrors: NodeGraphEvaluationErrorLabels;
}

interface ProductTemplateExecutionPanelProps {
    viewModel: ProductTemplateProfitViewModel<unknown>;
    labels: ProductTemplateExecutionLabels;
}

export const ProductTemplateExecutionPanel: React.FC<ProductTemplateExecutionPanelProps> = ({
    viewModel,
    labels,
}) => {
    if (viewModel.kind === 'standard') return null;
    if (viewModel.kind === 'error') {
        return (
            <div
                role="alert"
                className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700"
            >
                {viewModel.errors.map((error, index) => (
                    <div key={`${error.code}-${index}`}>
                        {error.code === 'invalid_compatibility'
                            ? labels.invalidCompatibility
                            : formatNodeGraphEvaluationError({
                                code: error.code as NodeGraphEvaluationErrorCode,
                                context: error.context,
                                message: error.message || error.code,
                            }, labels.graphErrors)}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="mb-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                {labels.graphOutputsTitle}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {viewModel.outputs.map(output => (
                    <div
                        key={output.id}
                        className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100"
                    >
                        <div>
                            <div className="text-sm font-bold text-slate-700">{output.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{output.id}</div>
                        </div>
                        <div className="text-lg font-black text-emerald-700">
                            {Number(output.value.toFixed(4))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
                {labels.graphOutputsDisclaimer}
            </div>
        </div>
    );
};
