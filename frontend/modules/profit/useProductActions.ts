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

        const sites: ('SG' | 'MY' | 'PH' | 'TH' | 'ID' | 'CN')[] = [];
        Object.entries(profitNodes).forEach(([currency, nodeArray]) => {
            if (nodeArray && (nodeArray as any[]).length > 0) {
                const countryCode = countryMap[currency] || 'MY';
                if (!sites.includes(countryCode)) sites.push(countryCode);
            }
        });

        const node = nodes.length > 0 ? nodes[0] : { country: 'MYR', data: DEFAULT_NODE_DATA };
        const primaryCountry = sites.length > 0 ? sites[0] : 'MY';

        const productData: Omit<ProductCalcData, 'id'> = {
            name: globalInputs.name,
            sku: globalInputs.sku,
            country: primaryCountry,
            sites: sites,
            cost: Number(globalInputs.purchaseCost) || 0,
            productWeight: Number(globalInputs.productWeight) || 0,
            firstWeight: Number(globalInputs.firstWeight) || 50,
            supplierTaxPoint: Number(globalInputs.supplierTaxPoint) || 0,
            supplierInvoice: globalInputs.supplierInvoice,
            sellerCouponType: globalInputs.sellerCouponType || 'fixed',
            sellerCoupon: Number(globalInputs.sellerCoupon) || 0,
            sellerCouponPlatformRatio: Number(globalInputs.sellerCouponPlatformRatio) || 0,
            adROI: Number(globalInputs.adROI) || 0,
            vatRate: Number(globalInputs.vatRate) || 0,
            corporateIncomeTaxRate: Number(globalInputs.corporateIncomeTaxRate) || 0,
            platformInfrastructureFee: Number(globalInputs.platformInfrastructureFee) || 0,
            totalRevenue: Number(globalInputs.totalRevenue) || 0,
            baseShippingFee: Number(node.data.baseShippingFee) || 0,
            extraShippingFee: Number(node.data.extraShippingFee) || 0,
            crossBorderFee: Number(node.data.crossBorderFee) || 0,
            platformCommissionRate: Number(node.data.platformCommissionRate) || 0,
            transactionFeeRate: Number(node.data.transactionFeeRate) || 0,
            platformCoupon: Number(node.data.platformCoupon) || 0,
            platformCouponRate: Number(node.data.platformCouponRate) || 0,
            damageReturnRate: Number(node.data.damageReturnRate) || 0,
            mdvServiceFeeRate: Number(node.data.mdvServiceFeeRate) || 0,
            fssServiceFeeRate: Number(node.data.fssServiceFeeRate) || 0,
            ccbServiceFeeRate: Number(node.data.ccbServiceFeeRate) || 0,
            warehouseOperationFee: Number(node.data.warehouseOperationFee) || 0,
            lastMileFee: Number(node.data.lastMileFee) || 0,
            shipping: 0, fees: 0, marketing: 0, taxes: 0, profit: 0, margin: 0, costMargin: 0
        };

        let savedProductId: string | null = editingProductId;
        const isUpdate = !!editingProductId;

        try {
            if (editingProductId) {
                const existingProduct = products.find(p => p.id === editingProductId);
                const existingSites = existingProduct?.sites || [];
                const newSites = [...new Set([...existingSites, ...sites])];
                await updateProduct({ ...productData, id: editingProductId, sites: newSites });
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
                const isDuplicate = allTemplates.some(
                    t => t.productId === savedProductId && t.name === tplName && t.platform === n.platform
                );
                if (isDuplicate) continue;
                const response = await api.post('/templates', {
                    name: tplName,
                    country: n.country,
                    platform: n.platform,
                    type: 'profit',
                    data: n.data,
                    productId: savedProductId,
                });
                setAllTemplates(prev => [...prev, response.data]);
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
