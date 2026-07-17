import {
    evaluateNodeGraphProfitTemplate,
    type NodeGraphEvaluationErrorCode,
} from './profit/nodeGraphProfitAdapter';
import type {
    ProductTemplateData,
    StandardProductTemplateData,
} from './profit/types';

export type ProductTemplateProfitViewModel<TStandardResult> =
    | {
        kind: 'standard';
        result: TStandardResult;
    }
    | {
        kind: 'graph';
        outputs: Array<{ id: string; name: string; value: number }>;
    }
    | {
        kind: 'error';
        templateKind: 'graph' | 'invalid';
        errors: Array<{
            code: NodeGraphEvaluationErrorCode | 'invalid_compatibility';
            context: Record<string, string | number>;
            message?: string;
        }>;
    };

export const createProductTemplateProfitViewModel = <TStandardResult>(
    data: ProductTemplateData,
    calculateStandard: (standardData: StandardProductTemplateData) => TStandardResult,
): ProductTemplateProfitViewModel<TStandardResult> => {
    if (data.kind === 'invalid') {
        return {
            kind: 'error',
            templateKind: 'invalid',
            errors: [{ code: 'invalid_compatibility', context: {} }],
        };
    }
    if (data.kind === 'standard') {
        return {
            kind: 'standard',
            result: calculateStandard(data),
        };
    }

    const evaluation = evaluateNodeGraphProfitTemplate(
        data.graphTemplateSnapshot,
        data.graphInputValues,
    );
    if (evaluation.ok === false) {
        return {
            kind: 'error',
            templateKind: 'graph',
            errors: evaluation.errors.map(error => ({
                code: error.code,
                context: { ...error.context },
                message: error.message,
            })),
        };
    }
    return {
        kind: 'graph',
        outputs: evaluation.outputs,
    };
};
