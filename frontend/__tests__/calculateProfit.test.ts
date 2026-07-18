import { describe, it, expect } from 'vitest';
import { calculateProfit, calculateLastMileFee } from '../modules/profit/calculateProfit';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';

const defaultData = { ...DEFAULT_NODE_DATA };
const defaultGlobal = {
    purchaseCost: 50, productWeight: 100,
    supplierTaxPoint: 0, supplierInvoice: 'no' as const,
    vatRate: 0, corporateIncomeTaxRate: 0,
};
const defaultSiteInputs = { ...DEFAULT_SITE_INPUTS, totalRevenue: 100 };

describe('calculateProfit', () => {
    describe('phase 7 approved business rules', () => {
        it('calculates buyer payment from the gross coupon amounts regardless of funding split', () => {
            const result = calculateProfit(
                { ...defaultData, platformCoupon: 5 },
                { ...defaultGlobal, supplierInvoice: 'yes', purchaseCost: 500, supplierTaxPoint: 13, corporateIncomeTaxRate: 10 },
                {
                    ...defaultSiteInputs,
                    totalRevenue: 100,
                    sellerCoupon: 20,
                    sellerCouponType: 'fixed',
                    sellerCouponPlatformRatio: 75,
                    adROI: 0,
                },
                1,
                'MYR',
            );

            expect(result.grossSellerCoupon).toBe(20);
            expect(result.sellerCouponSellerContribution).toBe(5);
            expect(result.sellerCouponPlatformContribution).toBe(15);
            expect(result.buyerPaidRevenue).toBe(75);
            expect(result.corporateIncomeTax).toBe(7.5);
            expect(result.costTaxAmount).toBe(65);
            expect(result.totalTax).toBe(7.5);
        });

        it('never creates negative corporate income tax when coupons exceed buyer revenue', () => {
            const result = calculateProfit(
                { ...defaultData, platformCoupon: 10 },
                { ...defaultGlobal, corporateIncomeTaxRate: 10 },
                {
                    ...defaultSiteInputs,
                    totalRevenue: 10,
                    sellerCoupon: 20,
                    sellerCouponType: 'fixed',
                    adROI: 0,
                },
                1,
                'MYR',
            );

            expect(result.buyerPaidRevenue).toBe(0);
            expect(result.corporateIncomeTax).toBe(0);
        });

        it('does not let a platform-funded coupon change seller profit or advertising cost', () => {
            const withoutCoupon = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, adROI: 4 },
                1,
                'MYR',
            );
            const withCoupon = calculateProfit(
                { ...defaultData, platformCoupon: 25 },
                defaultGlobal,
                { ...defaultSiteInputs, adROI: 4 },
                1,
                'MYR',
            );

            expect(withCoupon.platformCouponCNY).toBe(25);
            expect(withCoupon.taxableRevenue).toBe(75);
            expect(withCoupon.adFee).toBe(withoutCoupon.adFee);
            expect(withCoupon.finalRevenueCNY).toBe(withoutCoupon.finalRevenueCNY);
        });

        it('rounds each percentage fee in settlement currency before converting to CNY', () => {
            const result = calculateProfit(
                { ...defaultData, platformCommissionRate: 1 },
                { ...defaultGlobal, purchaseCost: 0 },
                { ...defaultSiteInputs, totalRevenue: 33.33, adROI: 0 },
                8.05,
                'PHP',
            );

            expect(result.commission).toBe(2.68 / 8.05);
            expect(result.finalRevenueCNY).toBe(33);
        });

        it('uses zero decimal settlement rounding for IDR line items', () => {
            const result = calculateProfit(
                { ...defaultData, platformCommissionRate: 1 },
                { ...defaultGlobal, purchaseCost: 0 },
                { ...defaultSiteInputs, totalRevenue: 1.23, adROI: 0 },
                2150,
                'IDR',
            );

            expect(result.commission).toBe(26 / 2150);
            expect(result.finalRevenueCNY).toBe(1.22);
        });

        it('keeps proportional extra-weight billing for a partial 10g unit', () => {
            const result = calculateProfit(
                { ...defaultData, firstWeight: 50, extraShippingFee: 1 },
                { ...defaultGlobal, purchaseCost: 0, productWeight: 51 },
                { ...defaultSiteInputs, totalRevenue: 10, adROI: 0 },
                1,
                'MYR',
            );

            expect(result.shippingFee).toBe(0.1);
        });
    });

    describe('basic calculation', () => {
        it('should return zero profit when all inputs are zero', () => {
            const result = calculateProfit(
                { ...defaultData },
                { ...defaultGlobal, purchaseCost: 0 },
                { ...defaultSiteInputs, totalRevenue: 0 },
                1, 'MYR',
            );
            expect(result.finalRevenueCNY).toBe(0);
            expect(result.commission).toBe(0);
            expect(result.transactionFee).toBe(0);
            expect(result.serviceFee).toBe(0);
            expect(result.shippingFee).toBe(0);
            expect(result.totalTax).toBe(0);
            expect(result.adFee).toBe(0);
            expect(result.damage).toBe(0);
        });

        it('should calculate profit with only revenue and cost', () => {
            const result = calculateProfit(
                { ...defaultData },
                { ...defaultGlobal, purchaseCost: 30 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.totalRevenue).toBe(100);
            expect(result.purchaseCost).toBe(30);
            expect(result.adFee).toBe(6.67);
            expect(result.finalRevenueCNY).toBe(63.33);
        });

        it('should return negative profit when cost exceeds revenue', () => {
            const result = calculateProfit(
                { ...defaultData },
                { ...defaultGlobal, purchaseCost: 200 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.adFee).toBe(6.67);
            expect(result.finalRevenueCNY).toBe(-106.67);
            expect(result.roi).toBeLessThan(0);
            expect(result.margin).toBeLessThan(0);
        });
    });

    describe('commission and transaction fee', () => {
        it('should calculate commission based on revenueAfterSellerCoupon', () => {
            const result = calculateProfit(
                { ...defaultData, platformCommissionRate: 10 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.commission).toBe(10);
        });

        it('should calculate transaction fee based on revenueAfterSellerCoupon', () => {
            const result = calculateProfit(
                { ...defaultData, transactionFeeRate: 5 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.transactionFee).toBe(5);
        });

        it('should reduce commission base when seller coupon is applied', () => {
            const result = calculateProfit(
                { ...defaultData, platformCommissionRate: 10 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 20 },
                1, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(20);
            expect(result.revenueAfterSellerCoupon).toBe(80);
            expect(result.commission).toBe(8);
        });
    });

    describe('seller coupon', () => {
        it('should handle fixed seller coupon', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 10, sellerCouponType: 'fixed' },
                1, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(10);
        });

        it('should handle percentage seller coupon', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 20, sellerCouponType: 'percent' },
                1, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(20);
        });

        it('should apply platform ratio to seller coupon', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 10, sellerCouponPlatformRatio: 50 },
                1, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(5);
        });

        it('should handle percentage coupon with platform ratio', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 20, sellerCouponType: 'percent', sellerCouponPlatformRatio: 25 },
                1, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(15);
        });

        it.each([
            {
                label: 'fixed',
                site: { sellerCoupon: 20, sellerCouponType: 'fixed' as const, sellerCouponPlatformRatio: 25 },
                gross: 20,
                seller: 15,
                platform: 5,
            },
            {
                label: 'percent',
                site: { sellerCoupon: 20, sellerCouponType: 'percent' as const, sellerCouponPlatformRatio: 25 },
                gross: 20,
                seller: 15,
                platform: 5,
            },
        ])('derives $label coupon contributions with the approved buyer-payment tax base', ({ site, gross, seller, platform }) => {
            const result = calculateProfit(
                { ...defaultData, platformCommissionRate: 10, platformCoupon: 2 },
                { ...defaultGlobal, purchaseCost: 30, vatRate: 6, corporateIncomeTaxRate: 10 },
                { ...defaultSiteInputs, totalRevenue: 100, adROI: 10, ...site },
                1, 'MYR',
            );

            expect(result.grossSellerCoupon).toBe(gross);
            expect(result.sellerCouponSellerContribution).toBe(seller);
            expect(result.sellerCouponPlatformContribution).toBe(platform);
            expect(result.actualSellerCoupon).toBe(seller);
            expect(result).toEqual(expect.objectContaining({
                buyerPaidRevenue: 78,
                taxableRevenue: 78,
                revenueAfterSellerCoupon: 85,
                commission: 8.5,
                platformCouponCNY: 2,
                corporateIncomeTax: 7.8,
                totalTax: 12.48,
                adFee: 8,
            }));
            expect(result.vat).toBe(4.68);
            expect(result.finalRevenueCNY).toBe(26.02);
            expect(result.roi).toBeCloseTo(86.73333333333333, 12);
            expect(result.margin).toBeCloseTo(30.611764705882354, 12);
        });
    });

    describe('platform coupon', () => {
        it('should convert platform coupon to CNY using exchange rate', () => {
            const result = calculateProfit(
                { ...defaultData, platformCoupon: 6.5 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0.65, 'MYR',
            );
            expect(result.platformCouponCNY).toBe(10);
        });

        it('should reduce taxable revenue by platform coupon', () => {
            const result = calculateProfit(
                { ...defaultData, platformCoupon: 10 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.taxableRevenue).toBe(90);
        });
    });

    describe('tax calculation', () => {
        it('should calculate VAT based on taxable revenue', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, vatRate: 6 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.vat).toBe(6);
        });

        it('should calculate corporate income tax without invoice', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, supplierInvoice: 'no', corporateIncomeTaxRate: 10 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.corporateIncomeTax).toBe(10);
        });

        it('should calculate corporate income tax from buyer payment even when an invoice exists', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, supplierInvoice: 'yes', purchaseCost: 50, corporateIncomeTaxRate: 10 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.corporateIncomeTax).toBe(10);
        });

        it('should report supplier cost tax separately without adding it to corporate income tax', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, supplierInvoice: 'yes', purchaseCost: 100, supplierTaxPoint: 5, corporateIncomeTaxRate: 10 },
                { ...defaultSiteInputs, totalRevenue: 200 },
                1, 'MYR',
            );
            expect(result.costTaxAmount).toBe(5);
            expect(result.corporateIncomeTax).toBe(20);
            expect(result.totalTax).toBe(20);
        });

        it('does not report supplier cost tax without an invoice', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, supplierInvoice: 'no', purchaseCost: 100, supplierTaxPoint: 5 },
                { ...defaultSiteInputs, totalRevenue: 200, adROI: 0 },
                1,
                'MYR',
            );

            expect(result.costTaxAmount).toBe(0);
        });

        it.each([
            { rate: -20, expected: 0 },
            { rate: 0, expected: 0 },
            { rate: 125, expected: 125 },
        ])('keeps the user-entered corporate rate $rate while flooring only the tax result', ({ rate, expected }) => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, purchaseCost: 0, corporateIncomeTaxRate: rate },
                { ...defaultSiteInputs, totalRevenue: 100, adROI: 0 },
                1,
                'MYR',
            );

            expect(result.corporateIncomeTax).toBe(expected);
        });
    });

    describe('service fees', () => {
        it('should not apply service fees for MYR', () => {
            const result = calculateProfit(
                { ...defaultData, mdvServiceFeeRate: 10, fssServiceFeeRate: 10, ccbServiceFeeRate: 10 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0.65, 'MYR',
            );
            expect(result.serviceFee).toBe(0);
        });

        it('should not apply service fees for SGD', () => {
            const result = calculateProfit(
                { ...defaultData, mdvServiceFeeRate: 10, fssServiceFeeRate: 10, ccbServiceFeeRate: 10 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                4.8, 'SGD',
            );
            expect(result.serviceFee).toBe(0);
        });

        it('should apply service fees for PHP with cap', () => {
            const result = calculateProfit(
                { ...defaultData, mdvServiceFeeRate: 100, fssServiceFeeRate: 100, ccbServiceFeeRate: 100 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                8.05, 'PHP',
            );
            expect(result.serviceFee).toBe(25 + 12.5 + 12.5);
        });

        it('should include platform infrastructure fee in service fee', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, platformInfrastructureFee: 5 },
                1, 'MYR',
            );
            expect(result.serviceFee).toBe(5);
        });
    });

    describe('shipping fees', () => {
        it('should calculate base shipping + cross border fee in CNY', () => {
            const result = calculateProfit(
                { ...defaultData, baseShippingFee: 6.5, crossBorderFee: 0.65 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0.65, 'MYR',
            );
            expect(result.shippingFee).toBe(10 + 1);
        });

        it('should add extra shipping fee when weight exceeds first weight', () => {
            const result = calculateProfit(
                { ...defaultData, baseShippingFee: 0, extraShippingFee: 1, crossBorderFee: 0, firstWeight: 50 },
                { ...defaultGlobal, productWeight: 100 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.shippingFee).toBe(5);
        });

        it('should not add extra shipping fee when weight is within first weight', () => {
            const result = calculateProfit(
                { ...defaultData, baseShippingFee: 5, extraShippingFee: 1, crossBorderFee: 0, firstWeight: 100 },
                { ...defaultGlobal, productWeight: 50 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.shippingFee).toBe(5);
        });

        it('should add last mile fee for SGD', () => {
            const result = calculateProfit(
                { ...defaultData, lastMileFee: 4.8 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                4.8, 'SGD',
            );
            expect(result.shippingFee).toBe(1);
        });
    });

    describe('ad fee and damage', () => {
        it('should calculate ad fee based on taxableRevenue and adROI', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, adROI: 10 },
                1, 'MYR',
            );
            expect(result.adFee).toBe(10);
        });

        it('should return zero ad fee when adROI is 0', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, adROI: 0 },
                1, 'MYR',
            );
            expect(result.adFee).toBe(0);
        });

        it('should calculate damage based on totalRevenue', () => {
            const result = calculateProfit(
                { ...defaultData, damageReturnRate: 5 },
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.damage).toBe(5);
        });
    });

    describe('exchange rate', () => {
        it('should use rate 1 when rateToCNY is 0', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0, 'MYR',
            );
            expect(result.adFee).toBe(6.67);
            expect(result.finalRevenueCNY).toBe(43.33);
        });

        it('should convert final revenue to local currency', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0.65, 'MYR',
            );
            expect(result.finalRevenueLocal).toBe(28.17);
        });
    });

    describe('ROI and margin', () => {
        it('should calculate ROI correctly', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, purchaseCost: 50 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.roi).toBeCloseTo((result.finalRevenueCNY / 50) * 100, 4);
        });

        it('should return 0 ROI when purchase cost is 0', () => {
            const result = calculateProfit(
                defaultData,
                { ...defaultGlobal, purchaseCost: 0 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.roi).toBe(0);
        });

        it('should calculate margin correctly', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                1, 'MYR',
            );
            expect(result.margin).toBeCloseTo((result.finalRevenueCNY / 100) * 100, 4);
        });

        it('should return 0 margin when total revenue is 0', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 0 },
                1, 'MYR',
            );
            expect(result.margin).toBe(0);
        });
    });

    describe('null/undefined handling', () => {
        it('should handle null data', () => {
            const result = calculateProfit(
                null as any,
                defaultGlobal,
                defaultSiteInputs,
                1, 'MYR',
            );
            expect(result.adFee).toBe(6.67);
            expect(result.finalRevenueCNY).toBe(43.33);
        });

        it('should handle null globalInputs', () => {
            const result = calculateProfit(
                defaultData,
                null as any,
                defaultSiteInputs,
                1, 'MYR',
            );
            expect(result.purchaseCost).toBe(0);
        });

        it('should handle null siteInputs', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                null as any,
                1, 'MYR',
            );
            expect(result.totalRevenue).toBe(0);
            expect(result.adFee).toBe(0);
        });
    });

    describe('adROI zero value preservation', () => {
        it('should preserve adROI=0 instead of defaulting to 15', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, adROI: 0 },
                1, 'MYR',
            );
            expect(result.adFee).toBe(0);
        });
    });

    describe('full integration: Shopee MYR', () => {
        it('should calculate correct profit for a typical Shopee MYR scenario', () => {
            const rate = 0.65;
            const result = calculateProfit(
                {
                    ...defaultData,
                    baseShippingFee: 6.5, extraShippingFee: 1.3, crossBorderFee: 0.65,
                    firstWeight: 50,
                    platformCommissionRate: 8, transactionFeeRate: 2,
                    platformCoupon: 1.3, damageReturnRate: 1,
                    mdvServiceFeeRate: 3, fssServiceFeeRate: 2, ccbServiceFeeRate: 1,
                    warehouseOperationFee: 1.3,
                },
                { ...defaultGlobal, purchaseCost: 50, productWeight: 70, vatRate: 6, corporateIncomeTaxRate: 10 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                rate, 'MYR',
            );

            const totalRevenueCNY = 100;
            const actualSellerCouponCNY = 0;
            const platformCouponCNY = 1.3 / rate;

            expect(result.actualSellerCoupon).toBeCloseTo(actualSellerCouponCNY, 4);
            expect(result.platformCouponCNY).toBeCloseTo(platformCouponCNY, 4);
            expect(result.taxableRevenue).toBeCloseTo(totalRevenueCNY - actualSellerCouponCNY - platformCouponCNY, 4);
            expect(result.revenueAfterSellerCoupon).toBeCloseTo(totalRevenueCNY - actualSellerCouponCNY, 4);

            const revenueAfterCouponCNY = totalRevenueCNY - actualSellerCouponCNY;
            expect(result.commission).toBeCloseTo(revenueAfterCouponCNY * 0.08, 4);
            expect(result.transactionFee).toBeCloseTo(revenueAfterCouponCNY * 0.02, 4);

            expect(result.vat).toBeCloseTo(result.taxableRevenue * 0.06, 4);
            expect(result.corporateIncomeTax).toBeCloseTo(result.taxableRevenue * 0.10, 4);

            const baseShippingCNY = 6.5 / rate;
            const crossBorderCNY = 0.65 / rate;
            const extraShippingCNY = 1.3 / rate;
            const extraWeight = 70 - 50;
            const expectedShipping = baseShippingCNY + crossBorderCNY + extraShippingCNY * (extraWeight / 10);
            expect(result.shippingFee).toBeCloseTo(expectedShipping, 4);

            expect(result.adFee).toBeCloseTo(4.33 / rate, 12);
            expect(result.damage).toBeCloseTo(totalRevenueCNY * 0.01, 4);
        });
    });

    describe('full integration: Shopee PHP', () => {
        it('should apply service fees for PHP with caps', () => {
            const rate = 8.05;
            const result = calculateProfit(
                {
                    ...defaultData,
                    platformCommissionRate: 7, transactionFeeRate: 2,
                    mdvServiceFeeRate: 3, fssServiceFeeRate: 2, ccbServiceFeeRate: 1,
                    baseShippingFee: 8.05, crossBorderFee: 0,
                },
                { ...defaultGlobal, purchaseCost: 50, productWeight: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
                { ...defaultSiteInputs, totalRevenue: 100 },
                rate, 'PHP',
            );

            const totalRevenueCNY = 100;
            const revenueAfterCouponCNY = totalRevenueCNY;

            const mdvCapCNY = 25;
            const otherCapCNY = 12.5;
            const expectedMdV = Math.min(revenueAfterCouponCNY * 0.03, mdvCapCNY);
            const expectedFSS = Math.min(revenueAfterCouponCNY * 0.02, otherCapCNY);
            const expectedCCB = Math.min(revenueAfterCouponCNY * 0.01, otherCapCNY);

            expect(result.commission).toBeCloseTo(revenueAfterCouponCNY * 0.07, 4);
            expect(result.transactionFee).toBeCloseTo(revenueAfterCouponCNY * 0.02, 4);
            expect(result.serviceFee).toBeCloseTo(expectedMdV + expectedFSS + expectedCCB, 4);
            expect(result.shippingFee).toBeCloseTo(8.05 / rate, 4);
            expect(result.adFee).toBeCloseTo(53.67 / rate, 12);
        });
    });

    describe('siteInputs are in CNY', () => {
        it('should treat totalRevenue as CNY regardless of exchange rate', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100 },
                0.65, 'MYR',
            );
            expect(result.totalRevenue).toBe(100);
        });

        it('should treat platformInfrastructureFee as CNY regardless of exchange rate', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, platformInfrastructureFee: 10 },
                0.65, 'MYR',
            );
            expect(result.serviceFee).toBe(10);
        });

        it('should treat sellerCoupon as CNY when fixed type', () => {
            const result = calculateProfit(
                defaultData,
                defaultGlobal,
                { ...defaultSiteInputs, totalRevenue: 100, sellerCoupon: 10, sellerCouponType: 'fixed' },
                0.65, 'MYR',
            );
            expect(result.actualSellerCoupon).toBe(10);
        });
    });

    it('rejects a calculation whose final result contains a non-finite number', () => {
        expect(() => calculateProfit(
            { ...defaultData, platformCoupon: Number.MAX_SAFE_INTEGER },
            defaultGlobal,
            defaultSiteInputs,
            Number.MIN_VALUE,
            'MYR',
        )).toThrow(/finite/i);
    });
});

describe('calculateLastMileFee', () => {
    it('should return 2.03 for weight < 1kg', () => {
        expect(calculateLastMileFee(500)).toBe(2.03);
    });

    it('should return 2.87 for weight 1-5kg', () => {
        expect(calculateLastMileFee(3000)).toBe(2.87);
    });

    it('should return 3.38 for weight 5-10kg', () => {
        expect(calculateLastMileFee(7000)).toBe(3.38);
    });

    it('should return 5.42 for weight 10-20kg', () => {
        expect(calculateLastMileFee(15000)).toBe(5.42);
    });

    it('should return 10.00 for weight 20-30kg', () => {
        expect(calculateLastMileFee(25000)).toBe(10.00);
    });

    it('should return 10.00 for weight > 30kg', () => {
        expect(calculateLastMileFee(50000)).toBe(10.00);
    });
});
