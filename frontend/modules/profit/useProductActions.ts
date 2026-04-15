import React, { useState, useCallback } from 'react';
import { useStore } from '../../StoreContext';
import api from '../../src/api';
import { ProductCalcData } from '../../types';
import { genId, DEFAULT_NODE_DATA, ProfitTemplate, PlatformNode } from './types';
import { useToast } from '../../components/Toast';

export const useProductActions = (
    allTemplates: ProfitTemplate[],
    setAllTemplates: React.Dispatch<React.SetStateAction<ProfitTemplate[]>>,
    rates: Record<string, number>,
) => {
    const {
        addProduct, updateProduct, products,
        profitGlobalInputs: globalInputs,
        setProfitGlobalInputs: setGlobalInputs,
        profitSiteCountry: siteCountry,
        setProfitSiteCountry: setSiteCountry,
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

    const handleUpdateNode = (id: string, partialData: any) => {
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
            country: tpl.country,
            name: tpl.name,
            data: { ...DEFAULT_NODE_DATA, ...tpl.data }
        }]);
    };

    const handleAddBlankNode = (selectedPlatform: string) => {
        setNodes(prev => [...prev, {
            id: genId(),
            platform: selectedPlatform as any,
            country: siteCountry,
            name: '未命名节点',
            data: { ...DEFAULT_NODE_DATA }
        }]);
    };

    const handleSaveTemplate = async (nodeId: string, templateName: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        try {
            const response = await api.post('/templates', {
                name: templateName,
                country: node.country,
                platform: node.platform,
                type: 'profit',
                data: node.data
            });
            setAllTemplates(prev => [...prev, response.data]);
            showToast(t.templates.saved);
        } catch (error) {
            console.error('Failed to save template:', error);
            showToast('Failed to save template to database.', 'error');
        }
    };

    const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.delete(`/templates/${id}`);
            setAllTemplates(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            console.error('Failed to delete template:', error);
        }
    };

    const handleSaveProduct = async () => {
        if (!globalInputs.name || !globalInputs.sku) {
            showToast('Please enter Name and SKU', 'error');
            return;
        }

        const countryMap: Record<string, 'SG' | 'MY' | 'PH' | 'TH' | 'ID' | 'CN'> = {
            'SGD': 'SG', 'MYR': 'MY', 'PHP': 'PH', 'THB': 'TH', 'IDR': 'ID',
        };
        const countryCode = countryMap[siteCountry] || 'MY';

        const firstNodeData = nodes.length > 0 ? nodes[0].data : {};

        const productData: Omit<ProductCalcData, 'id'> = {
            name: globalInputs.name,
            sku: globalInputs.sku,
            country: countryCode,
            sites: [countryCode],
            cost: Number(globalInputs.purchaseCost) || 0,
            productWeight: Number(globalInputs.productWeight) || 0,
            supplierTaxPoint: Number(globalInputs.supplierTaxPoint) || 0,
            supplierInvoice: globalInputs.supplierInvoice,
            sellerCoupon: Number(firstNodeData.sellerCoupon) || 0,
            sellerCouponPlatformRatio: Number(firstNodeData.sellerCouponPlatformRatio) || 0,
            sellerCouponType: firstNodeData.sellerCouponType || 'fixed',
            adROI: Number(firstNodeData.adROI) || 15,
        };

        const existingProduct = products.find(
            p => p.name === globalInputs.name && p.sku === globalInputs.sku
        );

        const isUpdate = !!existingProduct;
        let savedProductId: string | null = existingProduct?.id || null;

        try {
            if (isUpdate && existingProduct) {
                const existingSites = existingProduct.sites || [];
                const newSites = existingSites.includes(countryCode)
                    ? existingSites
                    : [...existingSites, countryCode];
                await updateProduct({ ...productData, id: existingProduct.id, sites: newSites });
                savedProductId = existingProduct.id;
            } else {
                const saved = await addProduct(productData);
                savedProductId = saved?.id || null;
                if (!savedProductId) {
                    showToast('Failed to save product: no ID returned', 'error');
                    return;
                }
            }
        } catch (error) {
            console.error('Failed to save product:', error);
            showToast('Failed to save product', 'error');
            return;
        }

        for (const n of nodes) {
            try {
                const tplName = n.name || n.platform;
                const existingTpl = allTemplates.find(
                    t => t.productId === savedProductId && t.name === tplName && t.platform === n.platform
                );
                if (existingTpl) {
                    await api.put(`/templates/${existingTpl.id}`, {
                        name: tplName,
                        country: n.country,
                        platform: n.platform,
                        type: 'profit',
                        data: n.data,
                        productId: savedProductId,
                    });
                    setAllTemplates(prev => prev.map(t =>
                        t.id === existingTpl.id ? { ...t, data: n.data } : t
                    ));
                } else {
                    const response = await api.post('/templates', {
                        name: tplName,
                        country: n.country,
                        platform: n.platform,
                        type: 'profit',
                        data: n.data,
                        productId: savedProductId,
                    });
                    setAllTemplates(prev => [...prev, response.data]);
                }
            } catch (error) {
                console.error('Failed to save linked template:', error);
            }
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
        handleAddBlankNode,
        handleSaveTemplate,
        handleDeleteTemplate,
        handleSaveProduct,
    };
};
