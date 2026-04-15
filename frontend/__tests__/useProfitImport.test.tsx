import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const { mockStoreReturn } = vi.hoisted(() => {
    const storeReturn: any = {
        calculatorImport: null,
        setCalculatorImport: vi.fn(),
        calculatorImportNodes: [],
        setCalculatorImportNodes: vi.fn(),
        setProfitGlobalInputs: vi.fn(),
        setProfitSiteCountry: vi.fn(),
        setProfitNodes: vi.fn(),
        setProfitEditingProductId: vi.fn(),
    };
    return { mockStoreReturn: storeReturn };
});

vi.mock('../StoreContext', () => ({
    useStore: () => mockStoreReturn,
}));

import { useProfitImport } from '../modules/profit/useProfitImport';

const wrapInProvider = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    return Wrapper;
};

describe('useProfitImport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStoreReturn.calculatorImport = null;
        mockStoreReturn.calculatorImportNodes = [];
    });

    it('should not trigger any state updates when calculatorImport is null', () => {
        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });
        expect(mockStoreReturn.setProfitGlobalInputs).not.toHaveBeenCalled();
        expect(mockStoreReturn.setProfitSiteCountry).not.toHaveBeenCalled();
        expect(mockStoreReturn.setProfitNodes).not.toHaveBeenCalled();
    });

    it('should set global inputs from imported product data', async () => {
        mockStoreReturn.calculatorImport = {
            id: 'prod-1', name: '测试商品', sku: 'SKU-001',
            country: 'MY', cost: 100,
            productWeight: 500,
            supplierTaxPoint: 6, supplierInvoice: 'yes',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitGlobalInputs).toHaveBeenCalled();
        });

        const updaterFn = mockStoreReturn.setProfitGlobalInputs.mock.calls[0][0];
        const result = updaterFn({});
        expect(result.name).toBe('测试商品');
        expect(result.sku).toBe('SKU-001');
        expect(result.purchaseCost).toBe(100);
        expect(result.productWeight).toBe(500);
        expect(result.supplierTaxPoint).toBe(6);
        expect(result.supplierInvoice).toBe('yes');
    });

    it('should set editingProductId when import has id', async () => {
        mockStoreReturn.calculatorImport = {
            id: 'prod-edit-1', name: 'Edit', sku: 'SKU-E', country: 'MY',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitEditingProductId).toHaveBeenCalledWith('prod-edit-1');
        });
    });

    it('should map SG country to SGD currency', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'SG', sku: 'S1', country: 'SG',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('SGD');
        });
    });

    it('should map MY country to MYR currency', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'MY', sku: 'M1', country: 'MY',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('MYR');
        });
    });

    it('should map PH country to PHP currency', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'PH', sku: 'P1', country: 'PH',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('PHP');
        });
    });

    it('should map TH country to THB currency', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'TH', sku: 'T1', country: 'TH',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('THB');
        });
    });

    it('should map ID country to IDR currency', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'ID', sku: 'I1', country: 'ID',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('IDR');
        });
    });

    it('should default to MYR when country is not recognized', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'XX', sku: 'X1', country: 'XX',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('MYR');
        });
    });

    it('should create single fallback node when no importNodes provided', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'FB', sku: 'F1', country: 'MY',
            baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
            platformCommissionRate: 5, transactionFeeRate: 2,
            platformCoupon: 3, platformCouponRate: 1, damageReturnRate: 0.5,
            mdvServiceFeeRate: 0.1, fssServiceFeeRate: 0.2, ccbServiceFeeRate: 0.3,
            warehouseOperationFee: 4, lastMileFee: 0,
        };
        mockStoreReturn.calculatorImportNodes = [];

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        });

        const updaterFn = mockStoreReturn.setProfitNodes.mock.calls[0][0];
        const result = updaterFn({});
        expect(result.MYR).toHaveLength(1);
        expect(result.MYR[0].country).toBe('MYR');
        expect(result.MYR[0].platform).toBe('other');
        expect(result.MYR[0].name).toBe('导入数据');
        expect(result.MYR[0].data.baseShippingFee).toBe(10);
        expect(result.MYR[0].data.extraShippingFee).toBe(2);
    });

    it('should use importNodes when provided and group by country', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'Multi', sku: 'M1', country: 'MY',
        };
        mockStoreReturn.calculatorImportNodes = [
            { name: 'MYR-Shopee', country: 'MYR', platform: 'shopee', data: { baseShippingFee: 10 } },
            { name: 'MYR-Lazada', country: 'MYR', platform: 'lazada', data: { baseShippingFee: 20 } },
            { name: 'SGD-Shopee', country: 'SGD', platform: 'shopee', data: { baseShippingFee: 30 } },
        ];

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        });

        const updaterFn = mockStoreReturn.setProfitNodes.mock.calls[0][0];
        const result = updaterFn({});
        expect(result.MYR).toHaveLength(2);
        expect(result.SGD).toHaveLength(1);
        expect(result.SGD[0].data.baseShippingFee).toBe(30);
    });

    it('should clear importNodes after import', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'Clear', sku: 'C1', country: 'MY',
        };
        mockStoreReturn.calculatorImportNodes = [
            { name: 'Node', country: 'MYR', platform: 'shopee', data: {} },
        ];

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setCalculatorImportNodes).toHaveBeenCalledWith([]);
        });
    });

    it('should not clear importNodes when there are none', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'NoNodes', sku: 'N1', country: 'MY',
        };
        mockStoreReturn.calculatorImportNodes = [];

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        });
        expect(mockStoreReturn.setCalculatorImportNodes).not.toHaveBeenCalled();
    });

    it('should clear calculatorImport after processing', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'Clear', sku: 'C1', country: 'MY',
        };

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setCalculatorImport).toHaveBeenCalledWith(null);
        });
    });

    it('should merge DEFAULT_NODE_DATA with importNode data', async () => {
        mockStoreReturn.calculatorImport = {
            id: '1', name: 'Merge', sku: 'M1', country: 'MY',
        };
        mockStoreReturn.calculatorImportNodes = [
            { name: 'Partial', country: 'MYR', platform: 'shopee', data: { baseShippingFee: 99 } },
        ];

        renderHook(() => useProfitImport(), { wrapper: wrapInProvider() });

        await waitFor(() => {
            expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
        });

        const updaterFn = mockStoreReturn.setProfitNodes.mock.calls[0][0];
        const result = updaterFn({});
        expect(result.MYR[0].data.baseShippingFee).toBe(99);
        expect(result.MYR[0].data.crossBorderFee).toBe(0);
        expect(result.MYR[0].data.platformCommissionRate).toBe(0);
    });
});
