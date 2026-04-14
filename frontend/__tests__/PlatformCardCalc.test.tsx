import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { PlatformCard } from '../modules/PlatformCard';

const mockStrings = {
    inputs: {
        lastMileFee: '尾程物流费',
        platformCoupon: '平台优惠券',
        baseShippingFee: '首重运费',
        extraShippingFee: '续重运费',
        crossBorderFee: '跨境费',
        warehouseOperationFee: '仓储操作费',
        mdvServiceFeeRate: 'MDV 服务费率',
        fssServiceFeeRate: 'FSS 服务费率',
        ccbServiceFeeRate: 'CCB 服务费率',
        platformCommissionRate: '佣金率',
        transactionFeeRate: '交易费率',
        damageReturnRate: '货损退货率',
        firstWeight: '首重',
        totalRevenue: '售价',
        cost: '成本',
        platformCouponRate: '平台优惠券比例',
    },
    results: {
        commission: '佣金',
        transFee: '交易手续费',
        serviceFee: '服务费',
        shipping: '运费',
        totalTax: '税费',
        adFee: '广告费',
        damage: '货损',
    },
    matrix: {
        platforms: { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', other: '其他' },
        netProfitCNY: '预估净利润 (CNY)',
        margin: '利润率',
        roi: 'ROI',
        saveTemplate: '保存模版',
        templateName: '模版名称',
    },
};

describe('PlatformCard - Profit Calculation', () => {
    const mockOnUpdate = vi.fn();
    const mockOnDelete = vi.fn();
    const mockOnSaveTemplate = vi.fn();

    const createProps = (overrides: any = {}) => ({
        nodeId: 'node-1',
        platform: 'shopee' as const,
        country: 'MYR',
        nodeName: 'Test',
        data: {
            baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
            platformCommissionRate: 8, transactionFeeRate: 2,
            platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
            mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
            warehouseOperationFee: 0, lastMileFee: 0,
        },
        globalInputs: {
            totalRevenue: 100, purchaseCost: 50, productWeight: 500,
            firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
            sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
            adROI: 15, vatRate: 6, corporateIncomeTaxRate: 10,
            platformInfrastructureFee: 0,
        },
        rateToCNY: 1,
        strings: mockStrings,
        onUpdate: mockOnUpdate,
        onDelete: mockOnDelete,
        onSaveTemplate: mockOnSaveTemplate,
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should calculate positive net profit with valid data', () => {
        render(<PlatformCard {...createProps()} />);
        const label = screen.getByText('预估净利润 (CNY)');
        const container = label.closest('div')?.parentElement;
        expect(container).toBeInTheDocument();
        expect(container?.textContent).toContain('¥');
    });

    it('should display margin percentage', () => {
        render(<PlatformCard {...createProps()} />);
        expect(screen.getByText(/利润率:/)).toBeInTheDocument();
    });

    it('should display ROI percentage', () => {
        render(<PlatformCard {...createProps()} />);
        expect(screen.getByText(/ROI:/)).toBeInTheDocument();
    });

    it('should show green profit color when revenue is positive', () => {
        const props = createProps({
            globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
        });
        render(<PlatformCard {...props} />);
        const profitLabel = screen.getByText('预估净利润 (CNY)');
        const profitContainer = profitLabel.closest('div')?.parentElement;
        expect(profitContainer?.querySelector('.text-emerald-600, [class*="text-emerald-600"]')).toBeTruthy();
    });

    it('should show red profit color when revenue is negative', () => {
        const props = createProps({
            globalInputs: { ...createProps().globalInputs, totalRevenue: 10, purchaseCost: 200 },
            data: { ...createProps().data, platformCommissionRate: 50, transactionFeeRate: 20 },
        });
        render(<PlatformCard {...props} />);
        const profitLabel = screen.getByText('预估净利润 (CNY)');
        const profitContainer = profitLabel.closest('div')?.parentElement;
        expect(profitContainer?.querySelector('[class*="text-rose-600"]')).toBeTruthy();
    });

    it('should calculate shipping fee with extra weight', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                productWeight: 100,
                firstWeight: 50,
            },
            data: {
                ...createProps().data,
                baseShippingFee: 10,
                extraShippingFee: 2,
                crossBorderFee: 1,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should include lastMileFee in shipping for SGD country', async () => {
        const props = createProps({
            country: 'SGD',
            rateToCNY: 0.19,
            data: {
                ...createProps().data,
                firstWeight: 0,
                lastMileFee: 2.03,
                baseShippingFee: 0,
                crossBorderFee: 0,
            },
            globalInputs: {
                ...createProps().globalInputs,
                productWeight: 500,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should handle percentage seller coupon correctly', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                sellerCouponType: 'percent',
                sellerCoupon: 10,
                totalRevenue: 100,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should handle fixed seller coupon correctly', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                sellerCouponType: 'fixed',
                sellerCoupon: 5,
                sellerCouponPlatformRatio: 50,
                totalRevenue: 100,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should handle VAT with supplier invoice (yes)', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                supplierInvoice: 'yes',
                supplierTaxPoint: 6,
                vatRate: 6,
                corporateIncomeTaxRate: 10,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should handle VAT without supplier invoice (no)', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                supplierInvoice: 'no',
                vatRate: 6,
                corporateIncomeTaxRate: 10,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should calculate ad fee based on adROI', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                adROI: 10,
                totalRevenue: 100,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should set ad fee to 0 when adROI is 0', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                adROI: 0,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should calculate damage return correctly', () => {
        const props = createProps({
            data: {
                ...createProps().data,
                damageReturnRate: 5,
            },
            globalInputs: {
                ...createProps().globalInputs,
                totalRevenue: 100,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should include platform infrastructure fee in service fee', () => {
        const props = createProps({
            globalInputs: {
                ...createProps().globalInputs,
                platformInfrastructureFee: 5,
            },
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should handle all zero values gracefully', () => {
        const props = createProps({
            data: {
                baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
                platformCommissionRate: 0, transactionFeeRate: 0,
                platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0,
                mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                warehouseOperationFee: 0, lastMileFee: 0,
            },
            globalInputs: {
                totalRevenue: 0, purchaseCost: 0, productWeight: 0,
                firstWeight: 0, supplierTaxPoint: 0, supplierInvoice: 'no',
                sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                adROI: 0, vatRate: 0, corporateIncomeTaxRate: 0,
                platformInfrastructureFee: 0,
            },
        });
        expect(() => render(<PlatformCard {...props} />)).not.toThrow();
    });

    it('should apply MDV service fee cap (25 CNY)', () => {
        const props = createProps({
            data: {
                ...createProps().data,
                mdvServiceFeeRate: 100,
            },
            globalInputs: {
                ...createProps().globalInputs,
                totalRevenue: 100,
            },
            rateToCNY: 1,
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should apply FSS/CCB service fee cap (12.5 CNY)', () => {
        const props = createProps({
            data: {
                ...createProps().data,
                fssServiceFeeRate: 100,
                ccbServiceFeeRate: 100,
            },
            globalInputs: {
                ...createProps().globalInputs,
                totalRevenue: 100,
            },
            rateToCNY: 1,
        });
        render(<PlatformCard {...props} />);
        expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    });

    it('should render platform name from config', () => {
        render(<PlatformCard {...createProps({ platform: 'lazada' })} />);
        expect(screen.getByText('Lazada')).toBeInTheDocument();
    });

    it('should render TikTok platform correctly', () => {
        render(<PlatformCard {...createProps({ platform: 'tiktok' })} />);
        expect(screen.getByText('TikTok')).toBeInTheDocument();
    });

    it('should render country name correctly for MYR', () => {
        render(<PlatformCard {...createProps({ country: 'MYR' })} />);
        expect(screen.getByText('马来西亚')).toBeInTheDocument();
    });

    it('should render country name correctly for SGD', () => {
        render(<PlatformCard {...createProps({ country: 'SGD' })} />);
        expect(screen.getByText('新加坡')).toBeInTheDocument();
    });

    it('should render node name when provided', () => {
        render(<PlatformCard {...createProps({ nodeName: '自定义节点' })} />);
        expect(screen.getByText('自定义节点')).toBeInTheDocument();
    });

    it('should not render node name when not provided', () => {
        render(<PlatformCard {...createProps({ nodeName: undefined })} />);
        expect(screen.queryByText('Test')).not.toBeInTheDocument();
    });

    describe('node card CNY mode inputs (default)', () => {
        it('should show local equivalent under money fields in CNY mode', () => {
            const props = createProps({
                rateToCNY: 0.65,
                data: {
                    ...createProps().data,
                    baseShippingFee: 6.5,
                },
            });
            render(<PlatformCard {...props} />);
            expect(screen.getByDisplayValue('10.00')).toBeInTheDocument();
            const localTexts = screen.getAllByText(/6\.50/);
            expect(localTexts.length).toBeGreaterThanOrEqual(1);
        });

        it('should update node with localConverted value when CNY input changes', () => {
            const props = createProps({
                rateToCNY: 0.65,
                data: {
                    ...createProps().data,
                    baseShippingFee: 6.5,
                },
            });
            render(<PlatformCard {...props} />);
            const input = screen.getByDisplayValue('10.00');
            fireEvent.change(input, { target: { value: '20' } });
            fireEvent.blur(input);
            expect(mockOnUpdate).toHaveBeenCalledWith('node-1', expect.objectContaining({
                baseShippingFee: expect.closeTo(13, 0.1),
            }));
        });

        it('should show CNY label for money field inputs', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
            });
            render(<PlatformCard {...props} />);
            const labels = screen.getAllByText(/首重运费/);
            expect(labels.length).toBeGreaterThanOrEqual(1);
            expect(labels[0].textContent).toContain('CNY');
        });
    });

    describe('finalRevenueLocal display', () => {
        it('should display local currency profit line when rateToCNY is not 1', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const myrTexts = screen.getAllByText(/MYR/);
            const profitMyr = myrTexts.filter(el => el.textContent?.includes('≈') && el.closest('[class*="text-sm"]'));
            expect(profitMyr.length).toBeGreaterThanOrEqual(1);
        });

        it('should not display local currency profit line when rateToCNY is 1', () => {
            const props = createProps({
                rateToCNY: 1,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const profitDivs = screen.queryAllByText(/≈/).filter(el =>
                el.tagName === 'DIV' && el.textContent?.includes('MYR')
            );
            expect(profitDivs.length).toBe(0);
        });

        it('should not display local currency profit line when rateToCNY is 0', () => {
            const props = createProps({
                rateToCNY: 0,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const profitDivs = screen.queryAllByText(/≈/).filter(el =>
                el.tagName === 'DIV' && el.textContent?.includes('MYR')
            );
            expect(profitDivs.length).toBe(0);
        });

        it('should show emerald color class on parent for positive local profit', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const profitDivs = screen.getAllByText(/≈/).filter(el =>
                el.tagName === 'DIV' && el.textContent?.includes('MYR')
            );
            expect(profitDivs.length).toBeGreaterThanOrEqual(1);
            expect(profitDivs[0].className).toContain('text-emerald-500');
        });

        it('should show rose color class on parent for negative local profit', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 10, purchaseCost: 200 },
                data: { ...createProps().data, platformCommissionRate: 50, transactionFeeRate: 20 },
            });
            render(<PlatformCard {...props} />);
            const profitDivs = screen.getAllByText(/≈/).filter(el =>
                el.tagName === 'DIV' && el.textContent?.includes('MYR')
            );
            expect(profitDivs.length).toBeGreaterThanOrEqual(1);
            expect(profitDivs[0].className).toContain('text-rose-500');
        });
    });

    describe('tooltip local currency breakdown', () => {
        it('should render tooltip container with breakdown items', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            expect(screen.getByText('佣金')).toBeInTheDocument();
            expect(screen.getByText('交易手续费')).toBeInTheDocument();
            expect(screen.getByText('服务费')).toBeInTheDocument();
            expect(screen.getByText('运费')).toBeInTheDocument();
            expect(screen.getByText('税费')).toBeInTheDocument();
            expect(screen.getByText('广告费')).toBeInTheDocument();
            expect(screen.getByText('货损')).toBeInTheDocument();
        });

        it('should show local currency values in tooltip when rateToCNY is not 1', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const tooltip = screen.getByText('佣金').closest('[class*="bg-slate-800"]');
            expect(tooltip).toBeInTheDocument();
            const localTexts = tooltip?.querySelectorAll('[class*="text-[10px]"]');
            expect(localTexts!.length).toBeGreaterThan(0);
            localTexts!.forEach(el => {
                expect(el.textContent).toContain('MYR');
            });
        });

        it('should not show local currency values in tooltip when rateToCNY is 1', () => {
            const props = createProps({
                rateToCNY: 1,
                country: 'MYR',
                globalInputs: { ...createProps().globalInputs, totalRevenue: 200, purchaseCost: 50 },
            });
            render(<PlatformCard {...props} />);
            const tooltip = screen.getByText('佣金').closest('[class*="bg-slate-800"]');
            const localTexts = tooltip?.querySelectorAll('[class*="text-[10px]"]');
            expect(localTexts!.length).toBe(0);
        });
    });

    const getProfitValue = (): number => {
        const profitEl = screen.getByText('预估净利润 (CNY)')
            .closest('div')?.parentElement
            ?.querySelector('[class*="text-4xl"]');
        expect(profitEl).toBeTruthy();
        const text = profitEl?.textContent || '';
        const match = text.match(/¥([\d.-]+)/);
        expect(match).toBeTruthy();
        return parseFloat(match![1]);
    };

    describe('precise calculation with non-1 exchange rate', () => {
        it('should correctly convert local shipping fees to CNY in results', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                data: {
                    ...createProps().data,
                    baseShippingFee: 6.5,
                    crossBorderFee: 0.65,
                    extraShippingFee: 0,
                    platformCoupon: 0,
                    warehouseOperationFee: 0,
                    platformCommissionRate: 8,
                    transactionFeeRate: 2,
                    damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                },
                globalInputs: {
                    totalRevenue: 100, purchaseCost: 50, productWeight: 500,
                    firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
                    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                    adROI: 15, vatRate: 6, corporateIncomeTaxRate: 10,
                    platformInfrastructureFee: 0,
                },
            });
            render(<PlatformCard {...props} />);

            const baseShippingFeeCNY = 6.5 / 0.65;
            const crossBorderFeeCNY = 0.65 / 0.65;
            const shippingFeeCNY = baseShippingFeeCNY + crossBorderFeeCNY;

            const commission = 100 * 0.08;
            const transactionFee = 100 * 0.02;
            const adFee = 100 / 15;
            const damage = 100 * 0.01;
            const platformFee = commission + transactionFee + 0 + adFee + 0 + damage;

            const vat = 100 * 0.06;
            const corpTax = 100 * 0.10;
            const totalTax = vat + corpTax;

            const expectedProfit = 100 - 0 - platformFee - shippingFeeCNY - totalTax - 50;
            expect(getProfitValue()).toBeCloseTo(expectedProfit, 1);
        });

        it('should correctly convert platformCoupon from local to CNY', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                data: {
                    ...createProps().data,
                    baseShippingFee: 0, crossBorderFee: 0, extraShippingFee: 0,
                    platformCoupon: 3.25,
                    warehouseOperationFee: 0,
                    platformCommissionRate: 8, transactionFeeRate: 2, damageReturnRate: 1,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                },
                globalInputs: {
                    totalRevenue: 100, purchaseCost: 50, productWeight: 500,
                    firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
                    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                    adROI: 0, vatRate: 6, corporateIncomeTaxRate: 10,
                    platformInfrastructureFee: 0,
                },
            });
            render(<PlatformCard {...props} />);

            const platformCouponCNY = 3.25 / 0.65;
            const taxableRevenue = 100 - 0 - platformCouponCNY;
            const revenueAfterCoupon = 100 - 0;
            const commission = revenueAfterCoupon * 0.08;
            const transactionFee = revenueAfterCoupon * 0.02;
            const damage = 100 * 0.01;
            const platformFee = commission + transactionFee + 0 + 0 + 0 + damage;
            const vat = taxableRevenue * 0.06;
            const corpTax = taxableRevenue * 0.10;
            const totalTax = vat + corpTax;
            const expectedProfit = 100 - 0 - platformFee - 0 - totalTax - 50;
            expect(getProfitValue()).toBeCloseTo(expectedProfit, 1);
        });

        it('should correctly convert warehouseOperationFee from local to CNY', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                data: {
                    ...createProps().data,
                    baseShippingFee: 0, crossBorderFee: 0, extraShippingFee: 0,
                    platformCoupon: 0,
                    warehouseOperationFee: 1.3,
                    platformCommissionRate: 0, transactionFeeRate: 0, damageReturnRate: 0,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                },
                globalInputs: {
                    totalRevenue: 100, purchaseCost: 50, productWeight: 500,
                    firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
                    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                    adROI: 0, vatRate: 0, corporateIncomeTaxRate: 0,
                    platformInfrastructureFee: 0,
                },
            });
            render(<PlatformCard {...props} />);

            const warehouseCNY = 1.3 / 0.65;
            const expectedProfit = 100 - 0 - warehouseCNY - 0 - 0 - 50;
            expect(getProfitValue()).toBeCloseTo(expectedProfit, 1);
        });

        it('should correctly compute finalRevenueLocal from CNY profit', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                globalInputs: {
                    totalRevenue: 200, purchaseCost: 50, productWeight: 500,
                    firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
                    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                    adROI: 0, vatRate: 0, corporateIncomeTaxRate: 0,
                    platformInfrastructureFee: 0,
                },
                data: {
                    ...createProps().data,
                    baseShippingFee: 0, crossBorderFee: 0, extraShippingFee: 0,
                    platformCoupon: 0, warehouseOperationFee: 0,
                    platformCommissionRate: 0, transactionFeeRate: 0, damageReturnRate: 0,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                },
            });
            render(<PlatformCard {...props} />);
            expect(getProfitValue()).toBeCloseTo(150, 1);

            const myrTexts = screen.getAllByText(/≈/).filter(el =>
                el.tagName === 'DIV' && el.textContent?.includes('MYR')
            );
            expect(myrTexts.length).toBeGreaterThanOrEqual(1);
            const myrMatch = myrTexts[0].textContent?.match(/≈ ([\d.-]+) MYR/);
            expect(myrMatch).toBeTruthy();
            const localProfit = parseFloat(myrMatch![1]);
            expect(localProfit).toBeCloseTo(150 * 0.65, 1);
        });

        it('should correctly handle extra shipping fee conversion with non-1 rate', () => {
            const props = createProps({
                rateToCNY: 0.65,
                country: 'MYR',
                data: {
                    ...createProps().data,
                    baseShippingFee: 6.5,
                    crossBorderFee: 0,
                    extraShippingFee: 0.65,
                    firstWeight: 50,
                    platformCoupon: 0, warehouseOperationFee: 0,
                    platformCommissionRate: 0, transactionFeeRate: 0, damageReturnRate: 0,
                    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
                },
                globalInputs: {
                    totalRevenue: 100, purchaseCost: 50, productWeight: 600,
                    firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
                    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
                    adROI: 0, vatRate: 0, corporateIncomeTaxRate: 0,
                    platformInfrastructureFee: 0,
                },
            });
            render(<PlatformCard {...props} />);

            const baseCNY = 6.5 / 0.65;
            const extraShippingFeeCNY = 0.65 / 0.65;
            const extraWeight = 600 - 50;
            const extraCNY = extraShippingFeeCNY * (extraWeight / 10);
            const totalShippingCNY = baseCNY + extraCNY;

            const expectedProfit = 100 - 0 - 0 - totalShippingCNY - 0 - 50;
            expect(getProfitValue()).toBeCloseTo(expectedProfit, 1);
        });
    });
});
