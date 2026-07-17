import React, { useCallback, useState } from 'react';
import { useStore } from '../../StoreContext';
import api from '../../src/api';
import { ProductCalcData } from '../../types';
import { PlatformType } from '../../platformConfig';
import { genId, DEFAULT_NODE_DATA, ProfitTemplate, ProductProfitTemplate, PlatformNode, SiteLevelInputs, CURRENCY_TO_COUNTRY, type CurrencyCode, type NodeData } from './types';
import { useToast } from '../../components/Toast';
import type { NodeGraphTemplate } from '../node-designer/types';

import { safeNumber } from './utils';
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
        setGlobalInputs(prev => ({ ...prev, [name]: value }));
    };

    const handleUpdateNode = (id: string, partialData: Partial<NodeData>) => {
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
        setNodes(previous => previous.map(candidate => (
            candidate.id === node.id ? prepared.node : candidate
        )));
        try {
            const response = await api.post('/templates', buildPlatformNodeTemplatePayload(
                prepared.node,
                templateName,
                {
                    vatRate: safeNumber(globalInputs.vatRate),
                    corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
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

    const buildSiteSpecificData = (currency: string): SiteLevelInputs => {
        const current = siteInputsMap[currency] || { totalRevenue: 0, sellerCoupon: 0, sellerCouponType: 'fixed' as const, sellerCouponPlatformRatio: 0, platformInfrastructureFee: 0, adROI: 15 };
        return {
            totalRevenue: safeNumber(current.totalRevenue),
            sellerCoupon: safeNumber(current.sellerCoupon),
            sellerCouponType: current.sellerCouponType || 'fixed',
            sellerCouponPlatformRatio: safeNumber(current.sellerCouponPlatformRatio),
            adROI: current.adROI !== undefined && current.adROI !== null ? safeNumber(current.adROI) : 15,
            platformInfrastructureFee: safeNumber(current.platformInfrastructureFee),
        };
    };

    const findExistingProduct = () => {
        if (editingProductId) {
            return products.find(p => p.id === editingProductId) || null;
        }
        return products.find(p => p.name === globalInputs.name && p.sku === globalInputs.sku) || null;
    };

    const handleSaveProduct = async () => {
        if (!globalInputs.name || !globalInputs.sku) {
            showToast(t.errors.nameAndSkuRequired, 'error');
            return;
        }
        if (blockGraphSaveWhenInvalid(nodes)) return;
        const preparation = prepareGraphNodesForSave(nodes);
        if (preparation.ok === false) {
            showToast(t.errors.graphDraftInvalid, 'error');
            return;
        }
        const preparedNodes = preparation.nodes;
        setNodes(preparedNodes);

        const countryCode: NonNullable<ProductCalcData['country']> =
            CURRENCY_TO_COUNTRY[siteCountry as CurrencyCode] || 'MY';
        const siteSpecificData = buildSiteSpecificData(siteCountry);

        const productData: AtomicProductTemplateCreateRequest['product'] = {
            name: globalInputs.name,
            sku: globalInputs.sku,
            country: countryCode,
            sites: [countryCode],
            cost: safeNumber(globalInputs.purchaseCost),
            productWeight: safeNumber(globalInputs.productWeight),
            supplierTaxPoint: safeNumber(globalInputs.supplierTaxPoint),
            supplierInvoice: globalInputs.supplierInvoice,
            vatRate: safeNumber(globalInputs.vatRate),
            corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
            sellerCouponType: siteSpecificData.sellerCouponType,
            sellerCoupon: siteSpecificData.sellerCoupon,
            sellerCouponPlatformRatio: siteSpecificData.sellerCouponPlatformRatio,
            totalRevenue: siteSpecificData.totalRevenue,
            platformInfrastructureFee: siteSpecificData.platformInfrastructureFee,
            adROI: siteSpecificData.adROI,
            siteData: { [countryCode]: siteSpecificData },
        };

        const existingProduct = findExistingProduct();
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
            vatRate: safeNumber(globalInputs.vatRate),
            corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
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
                    globalInputs.name || t.templates.defaultTemplate,
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
