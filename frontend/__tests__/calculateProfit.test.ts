import { describe, it, expect } from 'vitest';
import { calculateProfit, calculateLastMileFee, type ProfitInput, type GlobalInput } from '../modules/profit/calculateProfit';
import { DEFAULT_NODE_DATA } from '../modules/profit/types';

const defaultData: ProfitInput = {
    totalRevenue: 0,
    sellerCoupon: 0,
    sellerCouponPlatformRatio: 0,
    sellerCouponType: 'fixed',
    adROI: 15,
    platformInfrastructureFee: 0,
    baseShippingFee: 0,
    extraShippingFee: 0,
    crossBorderFee: 0,
    firstWeight: 50,
    platformCommissionRate: 0,
    transactionFeeRate: 0,
    platformCoupon: 0,
    platformCouponRate: 0,
    damageReturnRate: 0,
    mdvServiceFeeRate: 0,
    fssServiceFeeRate: 0,
    ccbServiceFeeRate: 0,
    warehouseOperationFee: 0,
    lastMileFee: 0,
};

const defaultGlobal: GlobalInput = {
    purchaseCost: 0,
    productWeight: 0,
    supplierTaxPoint: 0,
    supplierInvoice: 'no',
    vatRate: 1,
    corporateIncomeTaxRate: 5,
};

describe('calculateProfit - basic calculation', () => {
    it('should return zero profit when all inputs are zero', () => {
        const result = calculateProfit(defaultData, defaultGlobal, 1, 'MYR');
        expect(result.finalRevenueCNY).toBe(0);
        expect(result.totalRevenue).toBe(0);
        expect(result.roi).toBe(0);
        expect(result.margin).toBe(0);
    });

    it('should calculate simple profit correctly: revenue=100, cost=50', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.totalRevenue).toBe(100);
        expect(result.purchaseCost).toBe(50);
        expect(result.finalRevenueCNY).toBeLessThan(50);
        expect(result.margin).toBeGreaterThan(0);
        expect(result.roi).toBeGreaterThan(0);
    });

    it('should calculate positive profit for a typical Shopee MY scenario', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                platformCommissionRate: 8,
                transactionFeeRate: 2,
                adROI: 10,
                baseShippingFee: 5,
                crossBorderFee: 1,
                damageReturnRate: 1,
            },
            {
                ...defaultGlobal,
                purchaseCost: 30,
                productWeight: 100,
                vatRate: 0,
                corporateIncomeTaxRate: 0,
            },
            1, 'MYR',
        );

        expect(result.commission).toBeCloseTo(8, 2);
        expect(result.transactionFee).toBeCloseTo(2, 2);
        expect(result.adFee).toBeCloseTo(10, 2);
        expect(result.damage).toBeCloseTo(1, 2);
        expect(result.shippingFee).toBeCloseTo(6, 2);
        expect(result.finalRevenueCNY).toBeCloseTo(100 - 8 - 2 - 10 - 1 - 6 - 0 - 30, 2);
        expect(result.finalRevenueCNY).toBeCloseTo(43, 2);
    });

    it('should calculate negative profit when costs exceed revenue', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 10 },
            { ...defaultGlobal, purchaseCost: 100 },
            1, 'MYR',
        );
        expect(result.finalRevenueCNY).toBeLessThan(0);
        expect(result.roi).toBeLessThan(0);
        expect(result.margin).toBeLessThan(0);
    });
});

describe('calculateProfit - tax calculation', () => {
    it('should calculate VAT correctly', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 6 },
            1, 'MYR',
        );
        expect(result.vat).toBeCloseTo(100 * 0.06, 2);
    });

    it('should calculate corporate income tax WITHOUT invoice', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
            },
            { ...defaultGlobal, purchaseCost: 50, corporateIncomeTaxRate: 10, vatRate: 0, supplierInvoice: 'no' },
            1, 'MYR',
        );
        const expectedTaxableRevenue = 100;
        expect(result.corporateIncomeTax).toBeCloseTo(10 * expectedTaxableRevenue / 100, 2);
    });

    it('should calculate corporate income tax WITH invoice (deduct cost)', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
            },
            { ...defaultGlobal, purchaseCost: 50, supplierInvoice: 'yes', supplierTaxPoint: 6, corporateIncomeTaxRate: 10, vatRate: 0 },
            1, 'MYR',
        );
        const expectedTaxableRevenue = 100;
        const expectedCostTaxAmount = 50 * 0.06;
        const expectedCorpIncomeTax = 0.10 * (expectedTaxableRevenue - 50) + expectedCostTaxAmount;
        expect(result.costTaxAmount).toBeCloseTo(3, 2);
        expect(result.corporateIncomeTax).toBeCloseTo(expectedCorpIncomeTax, 2);
    });

    it('should include costTaxAmount in corporate income tax when invoice=yes', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 200,
            },
            { ...defaultGlobal, purchaseCost: 80, supplierInvoice: 'yes', supplierTaxPoint: 13, corporateIncomeTaxRate: 5, vatRate: 0 },
            1, 'MYR',
        );
        expect(result.costTaxAmount).toBeCloseTo(80 * 0.13, 2);
        expect(result.corporateIncomeTax).toBeCloseTo(0.05 * (200 - 80) + 80 * 0.13, 2);
    });

    it('should sum VAT and corporate income tax into totalTax', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 6, corporateIncomeTaxRate: 10 },
            1, 'MYR',
        );
        expect(result.totalTax).toBeCloseTo(result.vat + result.corporateIncomeTax, 10);
    });
});

describe('calculateProfit - seller coupon', () => {
    it('should handle fixed seller coupon correctly', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, sellerCoupon: 10, sellerCouponType: 'fixed' },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.actualSellerCoupon).toBe(10);
        expect(result.revenueAfterSellerCoupon).toBeCloseTo(90, 2);
    });

    it('should handle percent seller coupon correctly', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, sellerCoupon: 10, sellerCouponType: 'percent' },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.actualSellerCoupon).toBeCloseTo(10, 2);
        expect(result.revenueAfterSellerCoupon).toBeCloseTo(90, 2);
    });

    it('should handle 20% seller coupon', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 200, sellerCoupon: 20, sellerCouponType: 'percent' },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.actualSellerCoupon).toBeCloseTo(40, 2);
        expect(result.revenueAfterSellerCoupon).toBeCloseTo(160, 2);
    });

    it('should deduct platform portion from seller coupon', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, sellerCoupon: 10, sellerCouponPlatformRatio: 50, sellerCouponType: 'fixed' },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.actualSellerCoupon).toBeCloseTo(5, 2);
    });

    it('should deduct 100% platform ratio resulting in zero actual coupon', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, sellerCoupon: 10, sellerCouponPlatformRatio: 100, sellerCouponType: 'fixed' },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.actualSellerCoupon).toBeCloseTo(0, 2);
    });

    it('should compute commission based on revenueAfterSellerCoupon', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                sellerCoupon: 10,
                sellerCouponType: 'fixed',
                platformCommissionRate: 8,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.revenueAfterSellerCoupon).toBeCloseTo(90, 2);
        expect(result.commission).toBeCloseTo(90 * 0.08, 2);
    });
});

describe('calculateProfit - currency conversion', () => {
    it('should convert local currency fees to CNY for MYR (rate=0.65)', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                baseShippingFee: 6.5,
                crossBorderFee: 0.65,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            0.65, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(10 + 1, 2);
    });

    it('should convert platform coupon from local currency to CNY', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, platformCoupon: 6.5 },
            { ...defaultGlobal, purchaseCost: 50 },
            0.65, 'MYR',
        );
        expect(result.platformCouponCNY).toBeCloseTo(10, 2);
    });

    it('should convert extraShippingFee per 10g to CNY', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                firstWeight: 50,
                baseShippingFee: 0,
                extraShippingFee: 6.5,
                crossBorderFee: 0,
            },
            { ...defaultGlobal, purchaseCost: 50, productWeight: 70, vatRate: 0, corporateIncomeTaxRate: 0 },
            0.65, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(10 * (20 / 10), 2);
    });

    it('should convert warehouseOperationFee to CNY', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, warehouseOperationFee: 6.5 },
            { ...defaultGlobal, purchaseCost: 50 },
            0.65, 'MYR',
        );
        expect(result.platformFee).toBeGreaterThanOrEqual(10);
    });

    it('should compute finalRevenueLocal by multiplying CNY result by rate', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 50 },
            0.65, 'MYR',
        );
        expect(result.finalRevenueLocal).toBeCloseTo(result.finalRevenueCNY * 0.65, 10);
    });

    it('should handle rate=1 (CNY base) correctly', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, baseShippingFee: 10 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(10, 2);
    });

    it('should handle rate=0 as rate=1 fallback', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, baseShippingFee: 10 },
            { ...defaultGlobal, purchaseCost: 50 },
            0, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(10, 2);
    });
});

describe('calculateProfit - shipping fee', () => {
    it('should calculate base shipping only when weight <= firstWeight', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                baseShippingFee: 10,
                extraShippingFee: 5,
                crossBorderFee: 2,
                firstWeight: 100,
            },
            { ...defaultGlobal, purchaseCost: 50, productWeight: 80, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(12, 2);
    });

    it('should add extra shipping fee for weight > firstWeight', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                baseShippingFee: 10,
                extraShippingFee: 2,
                crossBorderFee: 1,
                firstWeight: 50,
            },
            { ...defaultGlobal, purchaseCost: 50, productWeight: 70, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(11 + 2 * (20 / 10), 2);
    });

    it('should add lastMileFee for SGD country', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                baseShippingFee: 1.9,
                crossBorderFee: 0,
                lastMileFee: 3,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            0.19, 'SGD',
        );
        const baseShippingCNY = 1.9 / 0.19;
        const expectedLastMileCNY = 3 / 0.19;
        expect(result.shippingFee).toBeCloseTo(baseShippingCNY + expectedLastMileCNY, 2);
    });

    it('should NOT add lastMileFee for non-SGD country', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                baseShippingFee: 6.5,
                crossBorderFee: 0,
                lastMileFee: 3,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            0.65, 'MYR',
        );
        expect(result.shippingFee).toBeCloseTo(6.5 / 0.65, 2);
    });
});

describe('calculateProfit - service fee', () => {
    it('should waive service fees for MYR country', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                mdvServiceFeeRate: 5,
                fssServiceFeeRate: 3,
                ccbServiceFeeRate: 2,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.serviceFee).toBe(0);
    });

    it('should waive service fees for SGD country', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                mdvServiceFeeRate: 5,
                fssServiceFeeRate: 3,
                ccbServiceFeeRate: 2,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            0.19, 'SGD',
        );
        expect(result.serviceFee).toBe(0);
    });

    it('should apply service fees for PHP country with cap', () => {
        const rate = 8.05;
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 100,
                mdvServiceFeeRate: 5,
                fssServiceFeeRate: 3,
                ccbServiceFeeRate: 2,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            rate, 'PHP',
        );
        const totalRevenueCNY = 100 / rate;
        const revenueAfterCouponCNY = totalRevenueCNY;
        const mdvCapCNY = 25;
        const otherCapCNY = 12.5;
        const expectedMdV = Math.min(revenueAfterCouponCNY * 0.05, mdvCapCNY);
        const expectedFSS = Math.min(revenueAfterCouponCNY * 0.03, otherCapCNY);
        const expectedCCB = Math.min(revenueAfterCouponCNY * 0.02, otherCapCNY);
        expect(result.serviceFee).toBeCloseTo(expectedMdV + expectedFSS + expectedCCB, 4);
    });

    it('should apply cap when service fee exceeds cap', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 1000,
                mdvServiceFeeRate: 10,
            },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'PHP',
        );
        const mdvCapCNY = 25;
        const expectedMdV = Math.min(1000 * 0.10, mdvCapCNY);
        expect(expectedMdV).toBe(25);
        expect(result.serviceFee).toBeCloseTo(25, 2);
    });

    it('should include platformInfrastructureFee in serviceFee', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, platformInfrastructureFee: 5 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.serviceFee).toBe(5);
    });
});

describe('calculateProfit - ad fee', () => {
    it('should calculate ad fee as taxableRevenue / adROI', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, adROI: 10 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.adFee).toBeCloseTo(result.taxableRevenue / 10, 4);
    });

    it('should return 0 ad fee when adROI is 0', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, adROI: 0 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.adFee).toBe(0);
    });

    it('should return 0 ad fee when adROI is negative', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, adROI: -5 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.adFee).toBe(0);
    });
});

describe('calculateProfit - damage/return', () => {
    it('should calculate damage based on totalRevenue', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, damageReturnRate: 2 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.damage).toBeCloseTo(2, 2);
    });

    it('should handle 0% damage rate', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, damageReturnRate: 0 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.damage).toBe(0);
    });
});

describe('calculateProfit - ROI and margin', () => {
    it('should calculate ROI as (finalRevenueCNY / purchaseCost) * 100', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.roi).toBeCloseTo((result.finalRevenueCNY / 50) * 100, 4);
    });

    it('should calculate margin as (finalRevenueCNY / totalRevenue) * 100', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 50, vatRate: 0, corporateIncomeTaxRate: 0 },
            1, 'MYR',
        );
        expect(result.margin).toBeCloseTo((result.finalRevenueCNY / 100) * 100, 4);
    });

    it('should return 0 ROI when purchaseCost is 0', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100 },
            { ...defaultGlobal, purchaseCost: 0 },
            1, 'MYR',
        );
        expect(result.roi).toBe(0);
    });

    it('should return 0 margin when totalRevenue is 0', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 0 },
            { ...defaultGlobal, purchaseCost: 50 },
            1, 'MYR',
        );
        expect(result.margin).toBe(0);
    });
});

describe('calculateProfit - final revenue formula', () => {
    it('should equal totalRevenue - actualSellerCoupon - platformFee - shippingFee - totalTax - purchaseCost', () => {
        const result = calculateProfit(
            {
                ...defaultData,
                totalRevenue: 200,
                sellerCoupon: 10,
                sellerCouponType: 'fixed',
                platformCommissionRate: 8,
                transactionFeeRate: 2,
                adROI: 10,
                damageReturnRate: 1,
                baseShippingFee: 10,
                crossBorderFee: 2,
            },
            { ...defaultGlobal, purchaseCost: 80, vatRate: 6, corporateIncomeTaxRate: 10 },
            1, 'MYR',
        );
        const expected =
            result.totalRevenue
            - result.actualSellerCoupon
            - result.platformFee
            - result.shippingFee
            - result.totalTax
            - result.purchaseCost;
        expect(result.finalRevenueCNY).toBeCloseTo(expected, 10);
    });
});

describe('calculateProfit - edge cases', () => {
    it('should handle all string/NaN inputs gracefully', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 'abc' as any, baseShippingFee: 'xyz' as any },
            { ...defaultGlobal, purchaseCost: 'bad' as any },
            1, 'MYR',
        );
        expect(result.totalRevenue).toBe(0);
        expect(result.purchaseCost).toBe(0);
        expect(result.shippingFee).toBe(0);
    });

    it('should handle very large numbers', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 1000000 },
            { ...defaultGlobal, purchaseCost: 500000 },
            1, 'MYR',
        );
        expect(isFinite(result.finalRevenueCNY)).toBe(true);
        expect(isFinite(result.roi)).toBe(true);
    });

    it('should handle extremely small rate', () => {
        const result = calculateProfit(
            { ...defaultData, totalRevenue: 100, baseShippingFee: 10 },
            { ...defaultGlobal, purchaseCost: 50 },
            0.001, 'IDR',
        );
        expect(isFinite(result.finalRevenueCNY)).toBe(true);
        expect(isFinite(result.finalRevenueLocal)).toBe(true);
    });
});

describe('calculateLastMileFee', () => {
    it('should return 2.03 for weight < 1kg', () => {
        expect(calculateLastMileFee(500)).toBe(2.03);
        expect(calculateLastMileFee(0)).toBe(2.03);
        expect(calculateLastMileFee(999)).toBe(2.03);
    });

    it('should return 2.87 for weight 1-5kg', () => {
        expect(calculateLastMileFee(1000)).toBe(2.87);
        expect(calculateLastMileFee(3000)).toBe(2.87);
        expect(calculateLastMileFee(5000)).toBe(2.87);
    });

    it('should return 3.38 for weight 5-10kg', () => {
        expect(calculateLastMileFee(5001)).toBe(3.38);
        expect(calculateLastMileFee(7000)).toBe(3.38);
        expect(calculateLastMileFee(10000)).toBe(3.38);
    });

    it('should return 5.42 for weight 10-20kg', () => {
        expect(calculateLastMileFee(10001)).toBe(5.42);
        expect(calculateLastMileFee(15000)).toBe(5.42);
        expect(calculateLastMileFee(20000)).toBe(5.42);
    });

    it('should return 10.00 for weight 20-30kg', () => {
        expect(calculateLastMileFee(20001)).toBe(10.00);
        expect(calculateLastMileFee(30000)).toBe(10.00);
    });

    it('should return 10.00 for weight > 30kg', () => {
        expect(calculateLastMileFee(50000)).toBe(10.00);
        expect(calculateLastMileFee(100000)).toBe(10.00);
    });
});

describe('calculateProfit - full integration test', () => {
    it('should match hand-calculated result for Shopee MYR', () => {
        const rate = 0.65;
        const data: ProfitInput = {
            totalRevenue: 100,
            sellerCoupon: 5,
            sellerCouponPlatformRatio: 0,
            adROI: 10,
            platformInfrastructureFee: 0,
            baseShippingFee: 6.5,
            extraShippingFee: 1.3,
            crossBorderFee: 0.65,
            firstWeight: 50,
            platformCommissionRate: 8,
            transactionFeeRate: 2,
            platformCoupon: 1.3,
            platformCouponRate: 0,
            damageReturnRate: 1,
            mdvServiceFeeRate: 0,
            fssServiceFeeRate: 0,
            ccbServiceFeeRate: 0,
            warehouseOperationFee: 0,
            lastMileFee: 0,
            sellerCouponType: 'fixed',
        };
        const global: GlobalInput = {
            purchaseCost: 30,
            productWeight: 70,
            supplierTaxPoint: 0,
            supplierInvoice: 'no',
            vatRate: 6,
            corporateIncomeTaxRate: 10,
        };

        const result = calculateProfit(data, global, rate, 'MYR');

        const totalRevenueCNY = 100 / rate;
        const actualSellerCouponCNY = 5 / rate;
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

        expect(result.adFee).toBeCloseTo(result.taxableRevenue / 10, 4);
        expect(result.damage).toBeCloseTo(totalRevenueCNY * 0.01, 4);

        const expectedFinal =
            totalRevenueCNY - actualSellerCouponCNY - platformCouponCNY
            - (result.commission + result.transactionFee + result.serviceFee + result.adFee + 0 + result.damage)
            - result.shippingFee
            - result.totalTax
            - 30;
        expect(result.finalRevenueCNY).toBeCloseTo(expectedFinal, 4);
    });

    it('should produce consistent results for Shopee PH with service fees', () => {
        const rate = 8.05;
        const data: ProfitInput = {
            totalRevenue: 100,
            sellerCoupon: 0,
            sellerCouponPlatformRatio: 0,
            adROI: 15,
            platformInfrastructureFee: 0,
            baseShippingFee: 8.05,
            extraShippingFee: 0,
            crossBorderFee: 0,
            firstWeight: 50,
            platformCommissionRate: 7,
            transactionFeeRate: 2,
            platformCoupon: 0,
            platformCouponRate: 0,
            damageReturnRate: 0,
            mdvServiceFeeRate: 3,
            fssServiceFeeRate: 2,
            ccbServiceFeeRate: 1,
            warehouseOperationFee: 0,
            lastMileFee: 0,
            sellerCouponType: 'fixed',
        };
        const global: GlobalInput = {
            purchaseCost: 30,
            productWeight: 50,
            supplierTaxPoint: 0,
            supplierInvoice: 'no',
            vatRate: 0,
            corporateIncomeTaxRate: 0,
        };

        const result = calculateProfit(data, global, rate, 'PHP');

        const totalRevenueCNY = 100 / rate;
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
        expect(result.adFee).toBeCloseTo(totalRevenueCNY / 15, 4);
        expect(isFinite(result.finalRevenueCNY)).toBe(true);
    });
});
