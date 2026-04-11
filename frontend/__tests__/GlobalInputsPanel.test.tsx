import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GlobalInputsPanel } from '../modules/profit/GlobalInputsPanel';

const mockT = {
    inputs: {
        name: '商品名称', sku: 'SKU', totalRevenue: '总收入', cost: '成本',
        weight: '重量', supplierInvoice: '发票', invoiceYes: '是', invoiceNo: '否',
        supplierTax: '供应商税点', sellerCoupon: '卖家优惠券',
        couponFixed: '固定', couponPercent: '比例',
        couponPlatformRatio: '平台出资比例', adRoi: '广告ROI',
        vat: '增值税', corpTax: '企业所得税', infraFee: '基础设施费',
    },
    matrix: {
        globalBase: '全局参数', globalBaseDesc: 'PARAMS',
        switchToLocal: '切换本土货币', switchToCNY: '切换人民币',
        sites: { MYR: '马来西亚', SGD: '新加坡', PHP: '菲律宾', THB: '泰国', IDR: '印尼' },
    },
};

const defaultGlobalInputs = {
    name: '测试商品', sku: 'SKU-001', totalRevenue: 100, purchaseCost: 50,
    productWeight: 500, supplierInvoice: 'no', supplierTaxPoint: 0,
    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
    adROI: 15, vatRate: 6, corporateIncomeTaxRate: 5, platformInfrastructureFee: 0,
};

describe('GlobalInputsPanel', () => {
    const mockOnGlobalChange = vi.fn();
    const mockOnSetGlobalInputs = vi.fn();
    const mockOnSetUseLocalCurrency = vi.fn();
    const mockOnSetSiteCountry = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render global inputs panel title', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText('全局参数')).toBeInTheDocument();
    });

    it('should display switchToLocal button when useLocalCurrency is false', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText('切换本土货币')).toBeInTheDocument();
    });

    it('should display switchToCNY button when useLocalCurrency is true', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={true}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText('切换人民币')).toBeInTheDocument();
    });

    it('should call onSetUseLocalCurrency when currency toggle is clicked', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        fireEvent.click(screen.getByText('切换本土货币'));
        expect(mockOnSetUseLocalCurrency).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should call onSetSiteCountry when site is changed', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65, SGD: 0.19 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        const select = screen.getByDisplayValue(/马来西亚/);
        fireEvent.change(select, { target: { value: 'SGD' } });
        expect(mockOnSetSiteCountry).toHaveBeenCalledWith('SGD');
    });

    it('should show seller coupon fixed/percent buttons', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText('固定')).toBeInTheDocument();
        expect(screen.getByText('比例')).toBeInTheDocument();
    });

    it('should call onSetGlobalInputs when coupon type buttons are clicked', () => {
        render(
            <GlobalInputsPanel
                globalInputs={defaultGlobalInputs}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        fireEvent.click(screen.getByText('比例'));
        expect(mockOnSetGlobalInputs).toHaveBeenCalled();
        const updaterFn = mockOnSetGlobalInputs.mock.calls[0][0];
        const result = updaterFn(defaultGlobalInputs);
        expect(result.sellerCouponType).toBe('percent');
    });

    it('should show local currency equivalent for fixed coupon', () => {
        const inputsWithCoupon = { ...defaultGlobalInputs, sellerCoupon: 10, sellerCouponType: 'fixed' };
        render(
            <GlobalInputsPanel
                globalInputs={inputsWithCoupon}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText(/6\.50/)).toBeInTheDocument();
        const allMyr = screen.getAllByText(/MYR/);
        expect(allMyr.length).toBeGreaterThanOrEqual(1);
    });

    it('should show CNY equivalent when in local currency mode for fixed coupon', () => {
        const inputsWithCoupon = { ...defaultGlobalInputs, sellerCoupon: 10, sellerCouponType: 'fixed' };
        render(
            <GlobalInputsPanel
                globalInputs={inputsWithCoupon}
                siteCountry="MYR"
                useLocalCurrency={true}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.getByText(/10\.00 CNY/)).toBeInTheDocument();
    });

    it('should not show coupon conversion for percent type', () => {
        const inputsWithPercentCoupon = { ...defaultGlobalInputs, sellerCoupon: 5, sellerCouponType: 'percent' };
        render(
            <GlobalInputsPanel
                globalInputs={inputsWithPercentCoupon}
                siteCountry="MYR"
                useLocalCurrency={false}
                rates={{ MYR: 0.65 }}
                onGlobalChange={mockOnGlobalChange}
                onSetGlobalInputs={mockOnSetGlobalInputs}
                onSetUseLocalCurrency={mockOnSetUseLocalCurrency}
                onSetSiteCountry={mockOnSetSiteCountry}
                t={mockT}
            />
        );
        expect(screen.queryByText(/3\.25/)).not.toBeInTheDocument();
    });
});
