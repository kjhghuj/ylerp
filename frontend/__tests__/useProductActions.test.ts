import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';

const {
    mockStoreReturn, mockShowToast, mockApiPost, mockApiDelete,
} = vi.hoisted(() => {
    const storeReturn: any = {
        addProduct: vi.fn(),
        updateProduct: vi.fn(),
        products: [],
        strings: {
            profit: {
                actions: { saved: '已保存至商品库', updated: '商品库已更新' },
                templates: { saved: '模版已保存' },
            },
        },
        profitGlobalInputs: {
            name: '测试商品', sku: 'SKU-001', totalRevenue: 100, purchaseCost: 50,
            productWeight: 500, firstWeight: 50, supplierTaxPoint: 0,
            supplierInvoice: 'no', sellerCouponType: 'fixed', sellerCoupon: 0,
            sellerCouponPlatformRatio: 0, adROI: 15, vatRate: 6,
            corporateIncomeTaxRate: 10, platformInfrastructureFee: 0,
        },
        setProfitGlobalInputs: vi.fn((fn) => {
            if (typeof fn === 'function') {
                storeReturn.profitGlobalInputs = fn(storeReturn.profitGlobalInputs);
            } else {
                storeReturn.profitGlobalInputs = fn;
            }
        }),
        profitSiteCountry: 'MYR',
        setProfitSiteCountry: vi.fn(),
        profitNodes: {
            MYR: [{
                id: 'node-1', platform: 'shopee', country: 'MYR', name: 'Test Node',
                data: {
                    baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
                    platformCommissionRate: 8, transactionFeeRate: 2,
                    platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                    warehouseOperationFee: 0, lastMileFee: 0,
                },
            }],
        },
        setProfitNodes: vi.fn((fn) => {
            if (typeof fn === 'function') {
                storeReturn.profitNodes = fn(storeReturn.profitNodes);
            } else {
                storeReturn.profitNodes = fn;
            }
        }),
        profitEditingProductId: null,
        setProfitEditingProductId: vi.fn(),
    };
    return {
        mockStoreReturn: storeReturn,
        mockShowToast: vi.fn(),
        mockApiPost: vi.fn(),
        mockApiDelete: vi.fn(),
    };
});

vi.mock('../StoreContext', () => ({
    useStore: () => mockStoreReturn,
}));

vi.mock('../src/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: [] }),
        post: mockApiPost,
        delete: mockApiDelete,
    },
}));

vi.mock('../components/Toast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

import { useProductActions } from '../modules/profit/useProductActions';

describe('useProductActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStoreReturn.profitEditingProductId = null;
        mockStoreReturn.profitNodes = {
            MYR: [{
                id: 'node-1', platform: 'shopee', country: 'MYR', name: 'Test Node',
                data: {
                    baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
                    platformCommissionRate: 8, transactionFeeRate: 2,
                    platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                    warehouseOperationFee: 0, lastMileFee: 0,
                },
            }],
        };
        mockStoreReturn.profitGlobalInputs = {
            name: '测试商品', sku: 'SKU-001', totalRevenue: 100, purchaseCost: 50,
            productWeight: 500, firstWeight: 50, supplierTaxPoint: 0,
            supplierInvoice: 'no', sellerCouponType: 'fixed', sellerCoupon: 0,
            sellerCouponPlatformRatio: 0, adROI: 15, vatRate: 6,
            corporateIncomeTaxRate: 10, platformInfrastructureFee: 0,
        };
        mockStoreReturn.addProduct.mockResolvedValue({ id: 'new-1', name: '测试商品' });
        mockApiPost.mockResolvedValue({ data: { id: 'tpl-1' } });
    });

    it('should return nodes for current site country', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        expect(result.current.nodes).toHaveLength(1);
        expect(result.current.nodes[0].id).toBe('node-1');
    });

    it('should update global inputs on handleGlobalChange', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        act(() => {
            result.current.handleGlobalChange({
                target: { name: 'totalRevenue', value: '200' }
            } as React.ChangeEvent<HTMLInputElement>);
        });
        expect(mockStoreReturn.setProfitGlobalInputs).toHaveBeenCalled();
    });

    it('should update node data on handleUpdateNode', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        act(() => {
            result.current.handleUpdateNode('node-1', { baseShippingFee: 99 });
        });
        expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        const updaterFn = mockStoreReturn.setProfitNodes.mock.calls[0][0];
        const resultNodes = updaterFn(mockStoreReturn.profitNodes);
        expect(resultNodes.MYR[0].data.baseShippingFee).toBe(99);
    });

    it('should delete node on handleDeleteNode', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        act(() => {
            result.current.handleDeleteNode('node-1');
        });
        expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        const updaterFn = mockStoreReturn.setProfitNodes.mock.calls[0][0];
        const resultNodes = updaterFn(mockStoreReturn.profitNodes);
        expect(resultNodes.MYR).toHaveLength(0);
    });

    it('should add node from template on handleAddNodeFromTemplate', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        act(() => {
            result.current.handleAddNodeFromTemplate({
                id: 'tpl-x', name: 'My Template', country: 'MYR', platform: 'lazada', data: { baseShippingFee: 50 },
            });
        });
        expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        const calls = mockStoreReturn.setProfitNodes.mock.calls;
        const firstUpdaterFn = calls[0][0];
        const freshState = {
            MYR: [{
                id: 'node-1', platform: 'shopee', country: 'MYR', name: 'Test Node',
                data: {
                    baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
                    platformCommissionRate: 8, transactionFeeRate: 2,
                    platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                    warehouseOperationFee: 0, lastMileFee: 0,
                },
            }],
        };
        const resultNodes = firstUpdaterFn(freshState);
        expect(resultNodes.MYR).toHaveLength(2);
        expect(resultNodes.MYR[1].templateId).toBe('tpl-x');
        expect(resultNodes.MYR[1].data.baseShippingFee).toBe(50);
    });

    it('should add blank node on handleAddBlankNode', () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        act(() => {
            result.current.handleAddBlankNode('lazada');
        });
        expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        const calls = mockStoreReturn.setProfitNodes.mock.calls;
        const firstUpdaterFn = calls[0][0];
        const freshState = {
            MYR: [{
                id: 'node-1', platform: 'shopee', country: 'MYR', name: 'Test Node',
                data: {
                    baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
                    platformCommissionRate: 8, transactionFeeRate: 2,
                    platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                    warehouseOperationFee: 0, lastMileFee: 0,
                },
            }],
        };
        const resultNodes = firstUpdaterFn(freshState);
        expect(resultNodes.MYR).toHaveLength(2);
        expect(resultNodes.MYR[1].platform).toBe('lazada');
        expect(resultNodes.MYR[1].country).toBe('MYR');
    });

    it('should validate name and sku before save', async () => {
        mockStoreReturn.profitGlobalInputs.name = '';
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockShowToast).toHaveBeenCalledWith('Please enter Name and SKU', 'error');
        expect(mockStoreReturn.addProduct).not.toHaveBeenCalled();
    });

    it('should call addProduct for new product', async () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockStoreReturn.addProduct).toHaveBeenCalled();
        const callArg = mockStoreReturn.addProduct.mock.calls[0][0];
        expect(callArg.name).toBe('测试商品');
        expect(callArg.sku).toBe('SKU-001');
        expect(callArg.country).toBe('MY');
    });

    it('should call updateProduct for existing product', async () => {
        mockStoreReturn.profitEditingProductId = 'existing-1';
        mockStoreReturn.products = [{ id: 'existing-1', sites: ['MY'] }];
        mockStoreReturn.updateProduct.mockResolvedValue({ id: 'existing-1' });

        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockStoreReturn.updateProduct).toHaveBeenCalled();
        expect(mockStoreReturn.setProfitEditingProductId).toHaveBeenCalledWith(null);
    });

    it('should show saved toast for new product', async () => {
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockShowToast).toHaveBeenCalledWith('已保存至商品库');
    });

    it('should show updated toast for existing product', async () => {
        mockStoreReturn.profitEditingProductId = 'existing-1';
        mockStoreReturn.products = [{ id: 'existing-1', sites: ['MY'] }];
        mockStoreReturn.updateProduct.mockResolvedValue({ id: 'existing-1' });

        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockShowToast).toHaveBeenCalledWith('商品库已更新');
    });

    it('should show error when addProduct returns no ID', async () => {
        mockStoreReturn.addProduct.mockResolvedValue({});
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockShowToast).toHaveBeenCalledWith('Failed to save product: no ID returned', 'error');
    });

    it('should show error when addProduct fails', async () => {
        mockStoreReturn.addProduct.mockRejectedValue(new Error('Network'));
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        expect(mockShowToast).toHaveBeenCalledWith('Failed to save product', 'error');
    });

    it('should save templates for each node after product save', async () => {
        mockApiPost.mockResolvedValue({ data: { id: 'tpl-new' } });
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        await waitFor(() => {
            expect(mockApiPost).toHaveBeenCalledWith('/templates', expect.objectContaining({
                productId: 'new-1',
                type: 'profit',
            }));
        });
    });

    it('should skip duplicate templates when saving nodes', async () => {
        const existingTemplates = [{
            id: 'tpl-exist', name: 'Test Node', platform: 'shopee',
            country: 'MYR', productId: 'new-1', data: {},
        }];
        mockStoreReturn.addProduct.mockResolvedValue({ id: 'new-1' });
        const { result } = renderHook(() => useProductActions(existingTemplates, vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        await waitFor(() => {
            expect(mockStoreReturn.addProduct).toHaveBeenCalled();
        });
        expect(mockApiPost).not.toHaveBeenCalledWith('/templates', expect.objectContaining({
            productId: 'new-1',
        }));
    });

    it('should save template via handleSaveTemplate', async () => {
        const setAllTemplates = vi.fn();
        const { result } = renderHook(() => useProductActions([], setAllTemplates, {}, false));
        await act(async () => {
            await result.current.handleSaveTemplate('node-1', 'My Template');
        });
        expect(mockApiPost).toHaveBeenCalledWith('/templates', expect.objectContaining({
            name: 'My Template',
            type: 'profit',
        }));
        expect(mockShowToast).toHaveBeenCalledWith('模版已保存');
    });

    it('should handle save template error', async () => {
        mockApiPost.mockRejectedValue(new Error('Fail'));
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveTemplate('node-1', 'Template');
        });
        expect(mockShowToast).toHaveBeenCalledWith('Failed to save template to database.', 'error');
    });

    it('should delete template via handleDeleteTemplate', async () => {
        const setAllTemplates = vi.fn();
        const { result } = renderHook(() => useProductActions([{ id: 'tpl-1', name: 'T' }], setAllTemplates, {}, false));
        const mockEvent = { stopPropagation: vi.fn() } as any;
        await act(async () => {
            await result.current.handleDeleteTemplate('tpl-1', mockEvent);
        });
        expect(mockEvent.stopPropagation).toHaveBeenCalled();
        expect(mockApiDelete).toHaveBeenCalledWith('/templates/tpl-1');
        expect(setAllTemplates).toHaveBeenCalled();
    });

    it('should collect sites from all non-empty node arrays', async () => {
        mockStoreReturn.profitNodes = {
            MYR: [{ id: 'n1', platform: 'shopee', country: 'MYR', data: {} }],
            SGD: [{ id: 'n2', platform: 'shopee', country: 'SGD', data: {} }],
            PHP: [],
        };
        mockStoreReturn.addProduct.mockResolvedValue({ id: 'new-multi' });
        const { result } = renderHook(() => useProductActions([], vi.fn(), {}, false));
        await act(async () => {
            await result.current.handleSaveProduct();
        });
        const callArg = mockStoreReturn.addProduct.mock.calls[0][0];
        expect(callArg.sites).toContain('MY');
        expect(callArg.sites).toContain('SG');
        expect(callArg.sites).not.toContain('PH');
    });
});
