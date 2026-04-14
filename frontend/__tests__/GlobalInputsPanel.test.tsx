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
        sites: { MYR: '马来西亚', SGD: '新加坡', PHP: '菲律宾', THB: '泰国', IDR: '印尼' },
        switchToLocal: '切换本土货币计算',
        switchToCNY: '切换人民币计算',
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
    const mockOnSetSiteCountry = vi.fn();
    const mockOnRefreshRates = vi.fn();

    const mockOnSetUseLocalCurrency = vi.fn();

    const defaultProps = {
        globalInputs: defaultGlobalInputs,
        siteCountry: 'MYR' as string,
        useLocalCurrency: false,
        rates: { MYR: 0.65 },
        onGlobalChange: mockOnGlobalChange,
        onSetGlobalInputs: mockOnSetGlobalInputs,
        onSetUseLocalCurrency: mockOnSetUseLocalCurrency,
        onSetSiteCountry: mockOnSetSiteCountry,
        t: mockT,
        currentRate: 0.65,
        isLoadingRate: false,
        lastUpdated: null as string | null,
        onRefreshRates: mockOnRefreshRates,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render global inputs panel title', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        expect(screen.getByText('全局参数')).toBeInTheDocument();
    });

    it('should render currency toggle button in CNY mode', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        expect(screen.getByText('切换本土货币计算')).toBeInTheDocument();
    });

    it('should render currency toggle button in local mode', () => {
        render(<GlobalInputsPanel {...defaultProps} useLocalCurrency={true} />);
        expect(screen.getByText('切换人民币计算')).toBeInTheDocument();
    });

    it('should call onSetUseLocalCurrency when toggle is clicked', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        fireEvent.click(screen.getByText('切换本土货币计算'));
        expect(mockOnSetUseLocalCurrency).toHaveBeenCalledWith(expect.any(Function));
        const updaterFn = mockOnSetUseLocalCurrency.mock.calls[0][0];
        expect(updaterFn(false)).toBe(true);
        expect(updaterFn(true)).toBe(false);
    });

    it('should always show CNY labels for money inputs', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        const cnyLabels = screen.getAllByText(/CNY/);
        expect(cnyLabels.length).toBeGreaterThanOrEqual(3);
    });

    it('should call onSetSiteCountry when site is changed', () => {
        render(<GlobalInputsPanel {...defaultProps} rates={{ MYR: 0.65, SGD: 0.19 }} />);
        const select = screen.getByDisplayValue(/马来西亚/);
        fireEvent.change(select, { target: { value: 'SGD' } });
        expect(mockOnSetSiteCountry).toHaveBeenCalledWith('SGD');
    });

    it('should show seller coupon fixed/percent buttons', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        expect(screen.getByText('固定')).toBeInTheDocument();
        expect(screen.getByText('比例')).toBeInTheDocument();
    });

    it('should call onSetGlobalInputs when coupon type buttons are clicked', () => {
        render(<GlobalInputsPanel {...defaultProps} />);
        fireEvent.click(screen.getByText('比例'));
        expect(mockOnSetGlobalInputs).toHaveBeenCalled();
        const updaterFn = mockOnSetGlobalInputs.mock.calls[0][0];
        const result = updaterFn(defaultGlobalInputs);
        expect(result.sellerCouponType).toBe('percent');
    });

    it('should show local currency equivalent for fixed coupon', () => {
        render(<GlobalInputsPanel {...defaultProps} globalInputs={{ ...defaultGlobalInputs, sellerCoupon: 10, sellerCouponType: 'fixed' }} />);
        expect(screen.getByText(/6\.50/)).toBeInTheDocument();
        const allMyr = screen.getAllByText(/MYR/);
        expect(allMyr.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show coupon conversion for percent type', () => {
        render(<GlobalInputsPanel {...defaultProps} globalInputs={{ ...defaultGlobalInputs, sellerCoupon: 5, sellerCouponType: 'percent' }} />);
        expect(screen.queryByText(/3\.25/)).not.toBeInTheDocument();
    });

    it('should display exchange rate badge when currentRate > 0', () => {
        render(<GlobalInputsPanel {...defaultProps} currentRate={0.6523} siteCountry="MYR" />);
        expect(screen.getByText(/0\.6523/)).toBeInTheDocument();
        const myrElements = screen.getAllByText(/MYR/);
        expect(myrElements.length).toBeGreaterThanOrEqual(1);
        const rateBadge = screen.getByText(/1 CNY/);
        expect(rateBadge.textContent).toContain('0.6523');
    });

    it('should not display exchange rate badge when currentRate is 0', () => {
        render(<GlobalInputsPanel {...defaultProps} currentRate={0} />);
        expect(screen.queryByText(/1 CNY/)).not.toBeInTheDocument();
    });

    it('should display lastUpdated time when provided', () => {
        render(<GlobalInputsPanel {...defaultProps} currentRate={0.65} lastUpdated="10:30:45" />);
        expect(screen.getByText('10:30:45')).toBeInTheDocument();
    });

    it('should not display lastUpdated when null', () => {
        render(<GlobalInputsPanel {...defaultProps} currentRate={0.65} lastUpdated={null} />);
        expect(screen.queryByText(/\d{2}:\d{2}:\d{2}/)).not.toBeInTheDocument();
    });

    it('should call onRefreshRates when refresh button is clicked', () => {
        render(<GlobalInputsPanel {...defaultProps} currentRate={0.65} />);
        const buttons = screen.getAllByRole('button');
        const refreshBtn = buttons.find(b => b.querySelector('svg') && b.closest('[class*="emerald"]'));
        expect(refreshBtn).toBeTruthy();
        fireEvent.click(refreshBtn!);
        expect(mockOnRefreshRates).toHaveBeenCalled();
    });
});
