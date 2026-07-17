import React, { useCallback, useState } from 'react';
import { useStore } from '../../StoreContext';
import api from '../../src/api';
import { ProductCalcData } from '../../types';
import { PlatformType } from '../../platformConfig';
import { genId, DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, ProfitTemplate, ProductProfitTemplate, PlatformNode, SiteLevelInputs, CURRENCY_TO_COUNTRY, type CurrencyCode, type NodeData } from './types';
import { useToast } from '../../components/Toast';
import type { NodeGraphTemplate } from '../node-designer/types';

import {
    createDefaultInputValues,
    evaluateNodeGraphProfitTemplate,
    formatNodeGraphEvaluationError,
} from './nodeGraphProfitAdapter';
import { createGraphPlatformNode, createTemplatePlatformNode } from './platformNodeFactory';
import { buildPlatformNodeTemplatePayload } from './templateDataSerializer';
import type { GraphNodeRuntimeValidationState } from './GraphTemplateCard';
import {
    prepareGraphNodeForSave,
    prepareGraphNodesForSave,
} from './graphNodeSavePreparation';
import {
    buildDefaultProductTemplatePayload,
    buildAtomicProductSitePatch,
    buildAtomicProductUpdateData,
    buildProductTemplateMutations,
    type AtomicProductTemplateCreateRequest,
    type AtomicProductTemplateUpdateRequest,
} from './productTemplateAtomic';
import {
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    normalizeStandardNodesForSave,
    parseCanonicalProfitNumber,
    type ProfitInputError,
} from './profitInputNormalization';

export const useProductActions = (
    allTemplates: ProfitTemplate[],
    setAllTemplates: React.Dispatch<React.SetStateAction<ProfitTemplate[]>>,
    rates: Record<string, number>,
    siteInputsMap: Record<string, SiteLevelInputs>,
    _setSiteInputsMap: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
) => {
    const {
        saveProductWithTemplates, products,
        profitGlobalInputs: globalInputs,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCurrency: siteCountry,
        profitNodes,
        setProfitNodes,
        profitEditingProductId: editingProductId,
        setProfitEditingProductId: setEditingProductId,
        strings,
    } = useStore();
    const { showToast } = useToast();
    const t = strings.profit;
    const formatGraphErrors = (errors: Parameters<typeof formatNodeGraphEvaluationError>[0][]) => (
        errors.map(error => formatNodeGraphEvaluationError(error, t.graphErrors)).join('；')
    );
    const [graphNodeValidation, setGraphNodeValidation] = useState<
        Record<string, GraphNodeRuntimeValidationState>
    >({});
    const [inputErrors, setInputErrors] = useState<ProfitInputError[]>([]);
    const clearInputError = useCallback((field: string) => {
        setInputErrors(previous => previous.filter(error => error.field !== field));
    }, []);

    const nodes: PlatformNode[] = profitNodes[siteCountry] || [];
    const setNodes = useCallback((newNodes: PlatformNode[] | ((prev: PlatformNode[]) => PlatformNode[])) => {
        setProfitNodes(prev => {
            const currentNodes = prev[siteCountry] || [];
            const resolved = typeof newNodes === 'function'
                ? newNodes(currentNodes as PlatformNode[])
                : newNodes;
            return { ...prev, [siteCountry]: resolved };
        });
    }, [siteCountry, setProfitNodes]);

    const handleGlobalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setInputErrors(previous => previous.filter(error => error.field !== name));
        setGlobalInputs(prev => ({ ...prev, [name]: value }));
    };

    const handleUpdateNode = (id: string, partialData: Partial<NodeData>) => {
        const changedFields = new Set(Object.keys(partialData).map(field => `nodes.${id}.${field}`));
        setInputErrors(previous => previous.filter(error => !changedFields.has(error.field)));
        setNodes(prev => prev.map(n => (
            n.id === id && n.persistedData?.kind !== 'invalid'
                ? { ...n, data: { ...n.data, ...partialData } }
                : n
        )));
    };

    const handleDeleteNode = (id: string) => {
        setGraphNodeValidation(previous => {
            if (!Object.prototype.hasOwnProperty.call(previous, id)) return previous;
            const next = { ...previous };
            delete next[id];
            return next;
        });
        setNodes(prev => prev.filter(n => n.id !== id));
    };

    const handleGraphNodeValidationChange = useCallback((
        id: string,
        state: GraphNodeRuntimeValidationState,
    ) => {
        setGraphNodeValidation(previous => ({
            ...previous,
            [id]: {
                inputDrafts: { ...state.inputDrafts },
                error: state.error,
            },
        }));
    }, []);

    const handleAddNodeFromTemplate = (tpl: ProfitTemplate) => {
        try {
            const node = createTemplatePlatformNode(tpl, siteCountry);
            setNodes(prev => [...prev, node]);
        } catch {
            showToast(t.errors.templateSaveFailed, 'error');
        }
    };

    const handleAddBlankNode = (selectedPlatform: string) => {
        setNodes(prev => [...prev, {
            id: genId(),
            platform: selectedPlatform as PlatformType,
            currency: siteCountry,
            name: t.templates.unnamedNode,
            data: { ...DEFAULT_NODE_DATA }
        }]);
    };

    const handleAddNodeFromGraphTemplate = async (tpl: Pick<NodeGraphTemplate, 'id'>) => {
        try {
            const response = await api.get(`/node-graphs/${tpl.id}`);
            const graphTemplate = response.data as NodeGraphTemplate;
            const inputValues = createDefaultInputValues(graphTemplate);
            const result = evaluateNodeGraphProfitTemplate(graphTemplate, inputValues);
            if (result.ok === false) {
                showToast(formatGraphErrors(result.errors), 'error');
                return;
            }
            const outputValues = Object.fromEntries(result.outputs.map(output => [output.id, output.value]));
            setNodes(prev => [...prev, createGraphPlatformNode(
                graphTemplate,
                siteCountry,
                inputValues,
                outputValues,
            )]);
        } catch {
            showToast(t.errors.templateSaveFailed, 'error');
        }
    };

    const handleUpdateGraphNodeInputs = (id: string, inputValues: Record<string, number>, outputValues: Record<string, number>) => {
        setNodes(prev => prev.map(n => n.id === id ? {
            ...n,
            graphInputValues: inputValues,
            graphOutputValues: outputValues,
        } : n));
    };

    const getGraphNodeSaveError = (node: PlatformNode): string | null => {
        const runtimeState = graphNodeValidation[node.id];
        if (runtimeState?.error) return runtimeState.error;
        const prepared = prepareGraphNodeForSave(node);
        return prepared.ok === false
            ? formatNodeGraphEvaluationError(prepared.error, t.graphErrors)
            : null;
    };

    const blockGraphSaveWhenInvalid = (nodeList: PlatformNode[]): boolean => {
        const error = nodeList
            .map(getGraphNodeSaveError)
            .find((message): message is string => Boolean(message));
        if (!error) return false;
        showToast(t.errors.graphDraftInvalid, 'error');
        return true;
    };

    const blockSaveWithInputErrors = (errors: ProfitInputError[]): boolean => {
        if (errors.length === 0) return false;
        setInputErrors(errors);
        showToast(t.errors.inputValidationFailed, 'error');
        return true;
    };

    const handleSaveTemplate = async (nodeId: string, templateName: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        if (node.persistedData?.kind === 'invalid') {
            showToast(t.errors.templateSaveFailed, 'error');
            return;
        }
        if (blockGraphSaveWhenInvalid([node])) return;
        const prepared = prepareGraphNodeForSave(node);
        if (prepared.ok === false) {
            showToast(t.errors.graphDraftInvalid, 'error');
            return;
        }
        const normalized = normalizeStandardNodesForSave([prepared.node]);
        if (normalized.ok === false) {
            blockSaveWithInputErrors(normalized.errors);
            return;
        }
        const vatRate = parseCanonicalProfitNumber(globalInputs.vatRate, { field: 'vatRate' });
        const corporateIncomeTaxRate = parseCanonicalProfitNumber(globalInputs.corporateIncomeTaxRate, {
            field: 'corporateIncomeTaxRate',
        });
        const taxErrors: ProfitInputError[] = [];
        if (vatRate.ok === false) taxErrors.push(vatRate.error);
        if (corporateIncomeTaxRate.ok === false) taxErrors.push(corporateIncomeTaxRate.error);
        if (blockSaveWithInputErrors(taxErrors)) return;
        const normalizedNode = normalized.value[0];
        setInputErrors([]);
        setNodes(previous => previous.map(candidate => (
            candidate.id === node.id ? normalizedNode : candidate
        )));
        try {
            const response = await api.post('/templates', buildPlatformNodeTemplatePayload(
                normalizedNode,
                templateName,
                {
                    vatRate: vatRate.ok ? vatRate.value : 0,
                    corporateIncomeTaxRate: corporateIncomeTaxRate.ok ? corporateIncomeTaxRate.value : 0,
                },
            ));
            setAllTemplates(prev => [...prev, response.data]);
            showToast(t.templates.saved);
        } catch {
            showToast(t.errors.templateDbFailed, 'error');
        }
    };

    const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.delete(`/templates/${id}`);
            setAllTemplates(prev => prev.filter(t => t.id !== id));
        } catch {
            showToast(t.errors.templateDeleteFailed, 'error');
        }
    };

    const findExistingProduct = (name: string, sku: string) => {
        if (editingProductId) {
            return products.find(p => p.id === editingProductId) || null;
        }
        return products.find(p => p.name.trim() === name && p.sku.trim() === sku) || null;
    };

    const handleSaveProduct = async () => {
        if (!globalInputs.name?.trim() || !globalInputs.sku?.trim()) {
            showToast(t.errors.nameAndSkuRequired, 'error');
            return;
        }
        if (blockGraphSaveWhenInvalid(nodes)) return;
        const preparation = prepareGraphNodesForSave(nodes);
        if (preparation.ok === false) {
            showToast(t.errors.graphDraftInvalid, 'error');
            return;
        }
        const normalizedGlobal = normalizeProfitGlobalInputs(
            globalInputs as unknown as Record<string, unknown>,
        );
        const normalizedSite = normalizeSiteInputs(
            (siteInputsMap[siteCountry] || DEFAULT_SITE_INPUTS) as unknown as Record<string, unknown>,
        );
        const normalizedNodes = normalizeStandardNodesForSave(preparation.nodes);
        const validationErrors = [
            ...(normalizedGlobal.ok === false ? normalizedGlobal.errors : []),
            ...(normalizedSite.ok === false ? normalizedSite.errors : []),
            ...(normalizedNodes.ok === false ? normalizedNodes.errors : []),
        ];
        if (blockSaveWithInputErrors(validationErrors)) return;
        if (normalizedGlobal.ok === false || normalizedSite.ok === false || normalizedNodes.ok === false) return;
        const preparedNodes = normalizedNodes.value;
        const normalizedGlobalInputs = normalizedGlobal.value;
        const siteSpecificData = normalizedSite.value;
        setInputErrors([]);
        setGlobalInputs(normalizedGlobalInputs);
        setNodes(preparedNodes);

        const countryCode: NonNullable<ProductCalcData['country']> =
            CURRENCY_TO_COUNTRY[siteCountry as CurrencyCode] || 'MY';
        const productData: AtomicProductTemplateCreateRequest['product'] = {
            name: normalizedGlobalInputs.name,
            sku: normalizedGlobalInputs.sku,
            country: countryCode,
            sites: [countryCode],
            cost: normalizedGlobalInputs.purchaseCost,
            productWeight: normalizedGlobalInputs.productWeight,
            supplierTaxPoint: normalizedGlobalInputs.supplierTaxPoint,
            supplierInvoice: normalizedGlobalInputs.supplierInvoice,
            vatRate: normalizedGlobalInputs.vatRate,
            corporateIncomeTaxRate: normalizedGlobalInputs.corporateIncomeTaxRate,
            sellerCouponType: siteSpecificData.sellerCouponType,
            sellerCoupon: siteSpecificData.sellerCoupon,
            sellerCouponPlatformRatio: siteSpecificData.sellerCouponPlatformRatio,
            totalRevenue: siteSpecificData.totalRevenue,
            platformInfrastructureFee: siteSpecificData.platformInfrastructureFee,
            adROI: siteSpecificData.adROI,
            siteData: { [countryCode]: siteSpecificData },
        };

        const existingProduct = findExistingProduct(
            normalizedGlobalInputs.name,
            normalizedGlobalInputs.sku,
        );
        const isUpdate = !!existingProduct;
        let existingLinks: ProductProfitTemplate[] = [];
        if (existingProduct && preparedNodes.length > 0) {
            try {
                const response = await api.get(`/products/${existingProduct.id}/templates`);
                existingLinks = Array.isArray(response.data) ? response.data : [];
            } catch {
                showToast(t.errors.templateSaveFailed, 'error');
                return;
            }
        }

        const taxOverrides = {
            vatRate: normalizedGlobalInputs.vatRate,
            corporateIncomeTaxRate: normalizedGlobalInputs.corporateIncomeTaxRate,
        };
        let templateMutations: ReturnType<typeof buildProductTemplateMutations>;
        let ensureDefaultTemplate: ReturnType<typeof buildDefaultProductTemplatePayload> | undefined;
        try {
            templateMutations = buildProductTemplateMutations(
                preparedNodes,
                existingLinks,
                allTemplates,
                taxOverrides,
            );
            ensureDefaultTemplate = preparedNodes.length === 0
                ? buildDefaultProductTemplatePayload(
                    normalizedGlobalInputs.name || t.templates.defaultTemplate,
                    siteCountry,
                    taxOverrides,
                )
                : undefined;
        } catch {
            showToast(t.errors.templateSaveFailed, 'error');
            return;
        }

        try {
            if (existingProduct) {
                const request: AtomicProductTemplateUpdateRequest = {
                    product: buildAtomicProductUpdateData(productData),
                    templateMutations,
                    sitePatch: buildAtomicProductSitePatch(countryCode, siteSpecificData),
                    ...(ensureDefaultTemplate ? { ensureDefaultTemplate } : {}),
                };
                await saveProductWithTemplates(request, existingProduct.id);
            } else {
                const request: AtomicProductTemplateCreateRequest = {
                    product: productData,
                    templateMutations,
                    ...(ensureDefaultTemplate ? { ensureDefaultTemplate } : {}),
                };
                await saveProductWithTemplates(request);
            }
        } catch {
            showToast(t.errors.saveFailed, 'error');
            return;
        }

        setEditingProductId(null);
        showToast(isUpdate ? t.actions.updated : t.actions.saved);
    };

    return {
        nodes,
        inputErrors,
        clearInputError,
        handleGlobalChange,
        handleUpdateNode,
        handleDeleteNode,
        handleAddNodeFromTemplate,
        handleAddNodeFromGraphTemplate,
        handleAddBlankNode,
        handleUpdateGraphNodeInputs,
        handleGraphNodeValidationChange,
        handleSaveTemplate,
        handleDeleteTemplate,
        handleSaveProduct,
    };
};
