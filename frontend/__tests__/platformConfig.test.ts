import { describe, it, expect } from 'vitest';
import { PLATFORMS, PlatformType } from '../platformConfig';

describe('platformConfig', () => {
    it('should define all platform types', () => {
        expect(PLATFORMS.shopee).toBeDefined();
        expect(PLATFORMS.lazada).toBeDefined();
        expect(PLATFORMS.tiktok).toBeDefined();
        expect(PLATFORMS.other).toBeDefined();
    });

    it('should have correct platform names', () => {
        expect(PLATFORMS.shopee.name).toBe('Shopee');
        expect(PLATFORMS.lazada.name).toBe('Lazada');
        expect(PLATFORMS.tiktok.name).toBe('TikTok Shop');
        expect(PLATFORMS.other.name).toBe('Other');
    });

    it('should have colors for each platform', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].colors).toBeDefined();
            expect(PLATFORMS[key].colors.bg).toBeTruthy();
            expect(PLATFORMS[key].colors.text).toBeTruthy();
            expect(PLATFORMS[key].colors.border).toBeTruthy();
            expect(PLATFORMS[key].colors.gradient).toBeTruthy();
        }
    });

    it('should have field groups for each platform', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].fields).toBeDefined();
            expect(PLATFORMS[key].fields.base).toBeInstanceOf(Array);
            expect(PLATFORMS[key].fields.shipping).toBeInstanceOf(Array);
            expect(PLATFORMS[key].fields.services).toBeInstanceOf(Array);
            expect(PLATFORMS[key].fields.tax).toBeInstanceOf(Array);
        }
    });

    it('should include commission rate in base fields for all platforms', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].fields.base).toContain('platformCommissionRate');
        }
    });

    it('should include shipping fields for all platforms', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].fields.shipping).toContain('firstWeight');
            expect(PLATFORMS[key].fields.shipping).toContain('baseShippingFee');
            expect(PLATFORMS[key].fields.shipping).toContain('extraShippingFee');
            expect(PLATFORMS[key].fields.shipping).toContain('crossBorderFee');
        }
    });

    it('should include MDV/FSS/CCB fields for shopee and other', () => {
        expect(PLATFORMS.shopee.fields.services).toContain('mdvServiceFeeRate');
        expect(PLATFORMS.shopee.fields.services).toContain('fssServiceFeeRate');
        expect(PLATFORMS.shopee.fields.services).toContain('ccbServiceFeeRate');
        expect(PLATFORMS.other.fields.services).toContain('mdvServiceFeeRate');
    });

    it('should NOT include MDV/FSS/CCB fields for lazada and tiktok', () => {
        expect(PLATFORMS.lazada.fields.services).not.toContain('mdvServiceFeeRate');
        expect(PLATFORMS.tiktok.fields.services).not.toContain('mdvServiceFeeRate');
    });

    it('should include warehouse fee for all platforms', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].fields.services).toContain('warehouseOperationFee');
        }
    });

    it('should have platformCoupon and platformCouponRate in base fields', () => {
        for (const key of Object.keys(PLATFORMS) as PlatformType[]) {
            expect(PLATFORMS[key].fields.base).toContain('platformCoupon');
            expect(PLATFORMS[key].fields.base).toContain('platformCouponRate');
        }
    });
});
