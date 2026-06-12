import React, { useCallback } from 'react';
import { useStore } from '../../StoreContext';
import api from '../../src/api';
import { ProductCalcData } from '../../types';
import { PlatformType } from '../../platformConfig';
import { genId, DEFAULT_NODE_DATA, ProfitTemplate, ProductProfitTemplate, PlatformNode, SiteLevelInputs, CURRENCY_TO_COUNTRY, type CurrencyCode, type NodeData } from './types';
import { useToast } from '../../components/Toast';
import type { NodeGraphTemplate } from '../node-designer/types';

import { safeNumber } from './utils';
import { findExistingProductTemplateLink, resolveTemplateIdForPayload } from './productTemplateSync';
import { createDefaultInputValues, evaluateNodeGraphProfitTemplate } from './nodeGraphProfitAdapter';

export const useProductActions = (
    allTemplates: ProfitTemplate[],
    setAllTemplates: React.Dispatch<React.SetStateAction<ProfitTemplate[]>>,
    rates: Record<string, number>,
    siteInputsMap: Record<string, SiteLevelInputs>,
    setSiteInputsMap: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
) => {
    const {
        addProduct, updateProduct, products,
        profitGlobalInputs: globalInputs,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCurrency: siteCountry,
        setProfitSiteCurrency: setSiteCountry,
        profitNodes,
        setProfitNodes,
        profitEditingProductId: editingProductId,
        setProfitEditingProductId: setEditingProductId,
        strings,
    } = useStore();
    const { showToast } = useToast();
    const t = strings.profit;

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
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, ...partialData } } : n));
    };

    const handleDeleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
    };

    const handleAddNodeFromTemplate = (tpl: ProfitTemplate) => {
        setNodes(prev => [...prev, {
            id: genId(),
            templateId: tpl.id,
            platform: tpl.platform || 'other',
            currency: tpl.country,
            name: tpl.name,
            data: { ...DEFAULT_NODE_DATA, ...tpl.data }
        }]);
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
            setNodes(prev => [...prev, {
                id: genId(),
                graphTemplateId: graphTemplate.id,
                graphTemplateSnapshot: graphTemplate,
                graphInputValues: inputValues,
                graphOutputValues: Object.fromEntries(result.outputs.map(output => [output.id, output.value])),
                platform: (graphTemplate.platform || 'other') as PlatformType,
                currency: graphTemplate.country || siteCountry,
                name: graphTemplate.name,
                data: { ...DEFAULT_NODE_DATA },
            }]);
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

    const handleSaveTemplate = async (nodeId: string, templateName: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        try {
            const response = await api.post('/templates', {
                name: templateName,
                country: node.currency,
                platform: node.platform,
                type: 'profit',
                data: {
                    ...node.data,
                    vatRate: safeNumber(globalInputs.vatRate),
                    corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
                },
            });
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

    const saveOrUpdateProduct = async (
        productData: Omit<ProductCalcData, 'id'>,
        countryCode: string,
        existingProduct: ProductCalcData | null,
    ): Promise<string | null> => {
        if (existingProduct) {
            const existingSites = existingProduct.sites || [];
            const newSites = existingSites.includes(countryCode as ProductCalcData['sites'] extends (infer U)[] ? U : never)
                ? existingSites
                : [...existingSites, countryCode] as NonNullable<ProductCalcData['sites']>;
            const mergedSiteData = {
                ...((existingProduct.siteData as Record<string, unknown>) || {}),
                [countryCode]: productData.siteData?.[countryCode],
            };
            await updateProduct({ ...productData, id: existingProduct.id, sites: newSites, siteData: mergedSiteData });
            return existingProduct.id;
        }
        const saved = await addProduct(productData);
        return saved?.id || null;
    };

    const syncTemplatesForNodes = async (nodeList: PlatformNode[], productId: string): Promise<void> => {
        const response = await api.get(`/products/${productId}/templates`);
        let productTemplates: ProductProfitTemplate[] = response.data || [];

        for (const n of nodeList) {
            try {
                const tplName = n.name || n.platform;
                const templateData = {
                    ...n.data,
                    ...(n.graphTemplateId ? {
                        graphTemplateId: n.graphTemplateId,
                        graphTemplateSnapshot: n.graphTemplateSnapshot,
                        graphInputValues: n.graphInputValues || {},
                        graphOutputValues: n.graphOutputValues || {},
                    } : {}),
                    vatRate: safeNumber(globalInputs.vatRate),
                    corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
                };
                const existingLink = findExistingProductTemplateLink(n, productTemplates);
                const templateId = resolveTemplateIdForPayload(n.templateId, existingLink, allTemplates);
                const payload = {
                    templateId,
                    name: tplName, country: n.currency, platform: n.platform,
                    data: templateData,
                };
                if (existingLink) {
                    const updated = await api.put(`/products/${productId}/templates/${existingLink.id}`, payload);
                    productTemplates = productTemplates.map(t => t.id === existingLink.id ? updated.data : t);
                } else {
                    const created = await api.post(`/products/${productId}/templates`, payload);
                    productTemplates = [...productTemplates, created.data];
                }
            } catch {
                showToast(t.errors.templateSaveFailed, 'error');
            }
        }
    };

    const ensureDefaultTemplate = async (nodeList: PlatformNode[], productId: string): Promise<void> => {
        if (nodeList.length > 0 || !productId) return;
        const defaultName = globalInputs.name || t.templates.defaultTemplate;
        try {
            const response = await api.get(`/products/${productId}/templates`);
            const existingDefault = (response.data || []).find(
                (tpl: ProductProfitTemplate) => tpl.name === defaultName && tpl.platform === 'other' && tpl.country === siteCountry
            );
            if (existingDefault) return;
            await api.post(`/products/${productId}/templates`, {
                name: defaultName,
                country: siteCountry,
                platform: 'other',
                data: {
                    ...DEFAULT_NODE_DATA,
                    vatRate: safeNumber(globalInputs.vatRate),
                    corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
                },
            });
        } catch {
            showToast(t.errors.defaultTemplateSaveFailed, 'error');
        }
    };

    const handleSaveProduct = async () => {
        if (!globalInputs.name || !globalInputs.sku) {
            showToast(t.errors.nameAndSkuRequired, 'error');
            return;
        }

        const countryCode = CURRENCY_TO_COUNTRY[siteCountry as CurrencyCode] || 'MY';
        const siteSpecificData = buildSiteSpecificData(siteCountry);

        const productData: Omit<ProductCalcData, 'id'> = {
            name: globalInputs.name,
            sku: globalInputs.sku,
            country: countryCode as ProductCalcData['country'],
            sites: [countryCode] as NonNullable<ProductCalcData['sites']>,
            cost: safeNumber(globalInputs.purchaseCost),
            productWeight: safeNumber(globalInputs.productWeight),
            supplierTaxPoint: safeNumber(globalInputs.supplierTaxPoint),
            supplierInvoice: globalInputs.supplierInvoice,
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

        let savedProductId: string | null = null;
        try {
            savedProductId = await saveOrUpdateProduct(productData, countryCode, existingProduct);
            if (!savedProductId) {
                showToast(t.errors.noIdReturned, 'error');
                return;
            }
        } catch {
            showToast(t.errors.saveFailed, 'error');
            return;
        }

        await syncTemplatesForNodes(nodes, savedProductId);
        await ensureDefaultTemplate(nodes, savedProductId);

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
        handleSaveTemplate,
        handleDeleteTemplate,
        handleSaveProduct,
    };
};
