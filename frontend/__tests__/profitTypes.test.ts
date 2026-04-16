import { describe, it, expect } from 'vitest';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, genId } from '../modules/profit/types';

describe('DEFAULT_NODE_DATA', () => {
    it('should contain all node-level fields', () => {
        expect(DEFAULT_NODE_DATA).toHaveProperty('baseShippingFee');
        expect(DEFAULT_NODE_DATA).toHaveProperty('extraShippingFee');
        expect(DEFAULT_NODE_DATA).toHaveProperty('crossBorderFee');
        expect(DEFAULT_NODE_DATA).toHaveProperty('firstWeight');
        expect(DEFAULT_NODE_DATA).toHaveProperty('platformCommissionRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('transactionFeeRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('platformCoupon');
        expect(DEFAULT_NODE_DATA).toHaveProperty('platformCouponRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('damageReturnRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('mdvServiceFeeRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('fssServiceFeeRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('ccbServiceFeeRate');
        expect(DEFAULT_NODE_DATA).toHaveProperty('warehouseOperationFee');
        expect(DEFAULT_NODE_DATA).toHaveProperty('lastMileFee');
    });

    it('should not contain site-level fields', () => {
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('totalRevenue');
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('sellerCoupon');
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('sellerCouponType');
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('sellerCouponPlatformRatio');
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('platformInfrastructureFee');
        expect(DEFAULT_NODE_DATA).not.toHaveProperty('adROI');
    });

    it('should have numeric defaults', () => {
        expect(DEFAULT_NODE_DATA.firstWeight).toBe(50);
        expect(DEFAULT_NODE_DATA.baseShippingFee).toBe(0);
        expect(DEFAULT_NODE_DATA.platformCommissionRate).toBe(0);
    });
});

describe('DEFAULT_SITE_INPUTS', () => {
    it('should contain all site-level fields', () => {
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('totalRevenue');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCoupon');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCouponType');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCouponPlatformRatio');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('platformInfrastructureFee');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('adROI');
    });

    it('should have correct default values', () => {
        expect(DEFAULT_SITE_INPUTS.totalRevenue).toBe(0);
        expect(DEFAULT_SITE_INPUTS.sellerCoupon).toBe(0);
        expect(DEFAULT_SITE_INPUTS.sellerCouponType).toBe('fixed');
        expect(DEFAULT_SITE_INPUTS.sellerCouponPlatformRatio).toBe(0);
        expect(DEFAULT_SITE_INPUTS.platformInfrastructureFee).toBe(0);
        expect(DEFAULT_SITE_INPUTS.adROI).toBe(15);
    });
});

describe('genId', () => {
    it('should generate unique IDs', () => {
        const id1 = genId();
        const id2 = genId();
        expect(id1).not.toBe(id2);
    });

    it('should return a non-empty string', () => {
        const id = genId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });
});
