import { describe, it, expect } from 'vitest';
import { genId, DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';

describe('profit/types', () => {
    it('should generate unique IDs', () => {
        const id1 = genId();
        const id2 = genId();
        expect(id1).toBeTruthy();
        expect(id2).toBeTruthy();
        expect(id1).not.toBe(id2);
    });

    it('should generate string IDs', () => {
        const id = genId();
        expect(typeof id).toBe('string');
    });

    it('should have all required fields in DEFAULT_NODE_DATA', () => {
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

    it('should have all required fields in DEFAULT_SITE_INPUTS', () => {
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('totalRevenue');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCoupon');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCouponType');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('sellerCouponPlatformRatio');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('platformInfrastructureFee');
        expect(DEFAULT_SITE_INPUTS).toHaveProperty('adROI');
    });

    it('should have numeric values in DEFAULT_NODE_DATA', () => {
        for (const [key, value] of Object.entries(DEFAULT_NODE_DATA)) {
            expect(typeof value).toBe('number');
        }
    });

    it('should have correct types in DEFAULT_SITE_INPUTS', () => {
        expect(typeof DEFAULT_SITE_INPUTS.totalRevenue).toBe('number');
        expect(typeof DEFAULT_SITE_INPUTS.sellerCoupon).toBe('number');
        expect(typeof DEFAULT_SITE_INPUTS.sellerCouponType).toBe('string');
        expect(typeof DEFAULT_SITE_INPUTS.sellerCouponPlatformRatio).toBe('number');
        expect(typeof DEFAULT_SITE_INPUTS.platformInfrastructureFee).toBe('number');
        expect(typeof DEFAULT_SITE_INPUTS.adROI).toBe('number');
    });
});
