import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../StoreContext';
import api from '../../src/api';
import { ProductCalcData } from '../../types';
import { PlatformType } from '../../platformConfig';
import { genId, DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, ProfitTemplate, ProductProfitTemplate, PlatformNode, SiteLevelInputs, CURRENCY_TO_COUNTRY, type CurrencyCode, type NodeData } from './types';
import { useToast } from '../../components/Toast';
import type { NodeGraphTemplate } from './nodeGraphTypes';

import {
    createDefaultInputValues,
    evaluateNodeGraphProfitTemplate,
    formatNodeGraphEvaluationError,
} from './nodeGraphProfitAdapter';
import { createGraphPlatformNode, createTemplatePlatformNode } from './platformNodeFactory';
import { buildPlatformNodeTemplatePayload } from './templateDataSerializer';
import type { GraphNodeRuntimeValidationState } from './GraphTemplateCard';
import {
    hasRuntimeGraphClaim,
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
    type AtomicProductTemplateSaveResponse,
} from './productTemplateAtomic';
import { detachProductTemplateLinks } from './productTemplateSync';
import {
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    normalizeStandardNodesForSave,
    parseCanonicalProfitNumber,
    validateCouponRevenueBudget,
    type ProfitInputError,
} from './profitInputNormalization';
import {
    createExchangeRateSnapshot,
    type ExchangeRateSnapshot,
} from './exchangeRateSnapshot';

export interface ProductIdentityConfirmation {
    version: number;
    productId: string;
    originalName: string;
    originalSku: string;
    name: string;
    sku: string;
}

export const useProductActions = (
    allTemplates: ProfitTemplate[],
    setAllTemplates: React.Dispatch<React.SetStateAction<ProfitTemplate[]>>,
    rates: Record<string, number>,
    siteInputsMap: Record<string, SiteLevelInputs>,
    setSiteInputsMap: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
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
    const [draftInputErrors, setDraftInputErrors] = useState<ProfitInputError[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const [identityConfirmation, setIdentityConfirmation] = useState<ProductIdentityConfirmation | null>(null);
    const editingProduct = products.find(product => product.id === editingProductId) || null;
    // A completed request must not restore a form that was reset, edited or replaced.
    const siteInputsKey = JSON.stringify(siteInputsMap);
    const draftRef = useRef({ globalInputs, profitNodes, editingProductId, siteCountry, siteInputsKey, version: 0 });
    const previousDraft = draftRef.current;
    if (previousDraft.globalInputs !== globalInputs || previousDraft.profitNodes !== profitNodes
        || previousDraft.editingProductId !== editingProductId || previousDraft.siteCountry !== siteCountry
        || previousDraft.siteInputsKey !== siteInputsKey) {
        draftRef.current = { globalInputs, profitNodes, editingProductId, siteCountry, siteInputsKey,
            version: previousDraft.version + 1 };
    }
    useEffect(() => () => { draftRef.current.version += 1; }, []);
    const pendingIdentityConfirmation = identityConfirmation?.version === draftRef.current.version
        ? identityConfirmation : null;
    const clearInputError = useCallback((field: string) => {
        setInputErrors(previous => previous.filter(error => error.field !== field));
    }, []);
    const handleNodeInputValidationChange = useCallback((
        id: string,
        error: ProfitInputError | null,
    ) => {
        const field = `nodes.${id}.${error?.field ?? 'platformCouponRate'}`;
        setDraftInputErrors(previous => {
            const withoutField = previous.filter(candidate => candidate.field !== field);
            if (!error) {
                return withoutField.length === previous.length ? previous : withoutField;
            }
            const qualifiedError = { ...error, field };
            const existing = previous.find(candidate => candidate.field === field);
            if (
                existing
                && existing.code === qualifiedError.code
                && existing.min === qualifiedError.min
                && existing.max === qualifiedError.max
            ) {
                return previous;
            }
            return [...withoutField, qualifiedError];
        });
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

    const handleReset = () => {
        draftRef.current.version += 1;
        setEditingProductId(null);
        setIdentityConfirmation(null);
        setInputErrors([]);
        setDraftInputErrors([]);
        setGraphNodeValidation({});
        setGlobalInputs(previous => ({ ...previous, name: '', sku: '', purchaseCost: 0, productWeight: 0 }));
        setSiteInputsMap(Object.fromEntries(
            ['MYR', 'SGD', 'PHP', 'THB', 'IDR'].map(currency => [currency, { ...DEFAULT_SITE_INPUTS }]),
        ));
        setProfitNodes(previous => Object.fromEntries(Object.keys(previous).map(currency => [currency, []])));
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
        setInputErrors(previous => previous.filter(
            error => !error.field.startsWith(`nodes.${id}.`),
        ));
        setDraftInputErrors(previous => previous.filter(
            error => !error.field.startsWith(`nodes.${id}.`),
        ));
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

    const blockSaveWithInputErrors = (
        errors: ProfitInputError[],
        draftNodeId?: string,
    ): boolean => {
        const errorsByField = new Map<string, ProfitInputError>();
        const relevantDraftErrors = draftNodeId
            ? draftInputErrors.filter(error => error.field.startsWith(`nodes.${draftNodeId}.`))
            : draftInputErrors;
        for (const error of [...relevantDraftErrors, ...errors]) {
            errorsByField.set(error.field, error);
        }
        const mergedErrors = [...errorsByField.values()];
        if (mergedErrors.length === 0) return false;
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
            blockSaveWithInputErrors(normalized.errors, node.id);
            return;
        }
        const vatRate = parseCanonicalProfitNumber(globalInputs.vatRate, { field: 'vatRate' });
        const corporateIncomeTaxRate = parseCanonicalProfitNumber(globalInputs.corporateIncomeTaxRate, {
            field: 'corporateIncomeTaxRate',
        });
        const taxErrors: ProfitInputError[] = [];
        if (vatRate.ok === false) taxErrors.push(vatRate.error);
        if (corporateIncomeTaxRate.ok === false) taxErrors.push(corporateIncomeTaxRate.error);
        const normalizedNode = normalized.value[0];
        const isGraphNode = hasRuntimeGraphClaim(normalizedNode);
        const normalizedSite = normalizeSiteInputs(
            (siteInputsMap[normalizedNode.currency] || DEFAULT_SITE_INPUTS) as unknown as Record<string, unknown>,
        );
        const couponBudgetErrors = normalizedSite.ok && !isGraphNode
            ? validateCouponRevenueBudget(
                normalizedNode.data,
                normalizedSite.value,
                rates[normalizedNode.currency],
            ).map(error => ({
                ...error,
                field: `nodes.${normalizedNode.id}.${error.field}`,
            }))
            : [];
        const templateValidationErrors = [
            ...taxErrors,
            ...(!isGraphNode && normalizedSite.ok === false ? normalizedSite.errors : []),
            ...couponBudgetErrors,
        ];
        if (blockSaveWithInputErrors(templateValidationErrors, node.id)) return;
        setInputErrors([]);
        setNodes(previous => previous.map(candidate => (
            candidate.id === node.id ? normalizedNode : candidate
        )));
        let exchangeRateSnapshot: ExchangeRateSnapshot | undefined;
        if (!isGraphNode) {
            try {
                exchangeRateSnapshot = createExchangeRateSnapshot(rates[normalizedNode.currency]);
            } catch {
                showToast(t.errors.rateFetchFailed, 'error');
                return;
            }
        }
        try {
            const response = await api.post('/templates', buildPlatformNodeTemplatePayload(
                normalizedNode,
                templateName,
                {
                    vatRate: vatRate.ok ? vatRate.value : 0,
                    corporateIncomeTaxRate: corporateIncomeTaxRate.ok ? corporateIncomeTaxRate.value : 0,
                },
                undefined,
                exchangeRateSnapshot,
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

    const executeProductSave = async (
        mode: 'create' | 'update',
        confirmation?: ProductIdentityConfirmation,
    ) => {
        const saveVersion = draftRef.current.version;
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
        if (normalizedSite.ok && normalizedNodes.ok) {
            for (const node of normalizedNodes.value) {
                if (node.persistedData?.kind === 'invalid' || hasRuntimeGraphClaim(node)) continue;
                validationErrors.push(...validateCouponRevenueBudget(
                    node.data,
                    normalizedSite.value,
                    rates[node.currency],
                ).map(error => ({
                    ...error,
                    field: `nodes.${node.id}.${error.field}`,
                })));
            }
        }
        if (blockSaveWithInputErrors(validationErrors)) return;
        if (normalizedGlobal.ok === false || normalizedSite.ok === false || normalizedNodes.ok === false) return;
        const preparedNodes = mode === 'create'
            ? normalizedNodes.value.map(node => detachProductTemplateLinks(node, allTemplates))
            : normalizedNodes.value;
        const normalizedGlobalInputs = normalizedGlobal.value;
        const siteSpecificData = normalizedSite.value;
        setInputErrors([]);

        const existingProduct = mode === 'update' ? editingProduct : null;
        if (mode === 'update' && !existingProduct) {
            showToast(t.errors.editingProductMissing, 'error');
            return;
        }
        if (products.some(product => product.sku.trim() === normalizedGlobalInputs.sku
            && product.id !== existingProduct?.id)) {
            showToast(t.errors.duplicateSku, 'error');
            return;
        }
        if (existingProduct && (existingProduct.name.trim() !== normalizedGlobalInputs.name
            || existingProduct.sku.trim() !== normalizedGlobalInputs.sku)) {
            const expectedConfirmation: ProductIdentityConfirmation = {
                version: saveVersion, productId: existingProduct.id,
                originalName: existingProduct.name, originalSku: existingProduct.sku,
                name: normalizedGlobalInputs.name, sku: normalizedGlobalInputs.sku,
            };
            if (!confirmation || Object.entries(expectedConfirmation).some(
                ([key, value]) => confirmation[key as keyof ProductIdentityConfirmation] !== value,
            )) {
                setIdentityConfirmation(expectedConfirmation);
                return;
            }
        }
        setIdentityConfirmation(null);

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
        const exchangeRateSnapshots: Record<string, ExchangeRateSnapshot> = {};
        try {
            const capturedAt = new Date();
            const standardCurrencies = new Set(
                preparedNodes
                    .filter(node => (
                        node.persistedData?.kind !== 'invalid' && !hasRuntimeGraphClaim(node)
                    ))
                    .map(node => node.currency),
            );
            for (const currency of standardCurrencies) {
                exchangeRateSnapshots[currency] = createExchangeRateSnapshot(
                    rates[currency],
                    capturedAt,
                );
            }
        } catch {
            showToast(t.errors.rateFetchFailed, 'error');
            return;
        }
        let templateMutations: ReturnType<typeof buildProductTemplateMutations>;
        let ensureDefaultTemplate: ReturnType<typeof buildDefaultProductTemplatePayload> | undefined;
        try {
            templateMutations = buildProductTemplateMutations(
                preparedNodes,
                existingLinks,
                allTemplates,
                taxOverrides,
                exchangeRateSnapshots,
            );
            ensureDefaultTemplate = preparedNodes.length === 0
                ? buildDefaultProductTemplatePayload(
                    normalizedGlobalInputs.name || t.templates.defaultTemplate,
                    siteCountry,
                    taxOverrides,
                    exchangeRateSnapshots[siteCountry],
                )
                : undefined;
        } catch {
            showToast(t.errors.templateSaveFailed, 'error');
            return;
        }

        let saved: AtomicProductTemplateSaveResponse;
        try {
            if (existingProduct) {
                const request: AtomicProductTemplateUpdateRequest = {
                    product: buildAtomicProductUpdateData(productData),
                    templateMutations,
                    sitePatch: buildAtomicProductSitePatch(countryCode, siteSpecificData),
                    ...(ensureDefaultTemplate ? { ensureDefaultTemplate } : {}),
                };
                saved = await saveProductWithTemplates(request, existingProduct.id);
            } else {
                const request: AtomicProductTemplateCreateRequest = {
                    product: productData,
                    templateMutations,
                    ...(ensureDefaultTemplate ? { ensureDefaultTemplate } : {}),
                };
                saved = await saveProductWithTemplates(request);
            }
        } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            showToast(status === 409 ? t.errors.productSaveConflict : t.errors.saveFailed, 'error');
            return;
        }

        if (draftRef.current.version === saveVersion) {
            setGlobalInputs(normalizedGlobalInputs);
            setProfitNodes(previous => {
                const next = mode === 'create'
                    ? Object.fromEntries(Object.entries(previous).map(([currency, nodeList]) => [
                        currency, nodeList.map(node => detachProductTemplateLinks(node, allTemplates)),
                    ]))
                    : { ...previous };
                return { ...next, [siteCountry]: preparedNodes };
            });
            setEditingProductId(saved.product.id);
        }
        showToast(isUpdate ? t.actions.updated : t.actions.saved);
    };

    const saveProduct = async (mode: 'create' | 'update', confirmation?: ProductIdentityConfirmation) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setIsSaving(true);
        try {
            await executeProductSave(mode, confirmation);
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };
    const handleSaveProduct = () => saveProduct(editingProductId ? 'update' : 'create');
    const handleSaveAsNew = () => saveProduct('create');
    const handleConfirmIdentityUpdate = () => pendingIdentityConfirmation
        ? saveProduct('update', pendingIdentityConfirmation) : Promise.resolve();
    const handleCancelIdentityUpdate = () => setIdentityConfirmation(null);

    return {
        nodes,
        inputErrors: [...inputErrors, ...draftInputErrors],
        nodeDraftErrors: draftInputErrors,
        clearInputError,
        handleGlobalChange,
        handleUpdateNode,
        handleDeleteNode,
        handleAddNodeFromTemplate,
        handleAddNodeFromGraphTemplate,
        handleAddBlankNode,
        handleUpdateGraphNodeInputs,
        handleGraphNodeValidationChange,
        handleNodeInputValidationChange,
        handleSaveTemplate,
        handleDeleteTemplate,
        handleSaveProduct,
        handleSaveAsNew,
        handleConfirmIdentityUpdate,
        handleCancelIdentityUpdate,
        handleReset,
        editingProduct,
        pendingIdentityConfirmation,
        isSaving,
    };
};
