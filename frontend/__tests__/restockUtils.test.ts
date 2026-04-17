import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRestock } from '../modules/restock/utils/restockUtils';
import { InventoryItem } from '../types';

const createItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'test-1',
    name: 'Test Product',
    sku: 'TEST-001',
    currentStock: 100,
    stockOfficial: 80,
    stockThirdParty: 20,
    inTransit: 50,
    dailySales: 10,
    leadTime: 25,
    replenishCycle: 30,
    costPerUnit: 50,
    ...overrides,
});

describe('calculateRestock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-17T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('basic calculation', () => {
        it('should calculate daysCovered correctly', () => {
            const item = createItem({ currentStock: 100, inTransit: 50, dailySales: 10 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.daysCovered).toBe('15.0');
        });

        it('should calculate restockQty based on target date and daily sales', () => {
            const item = createItem({ currentStock: 100, inTransit: 50, dailySales: 10 });
            const result = calculateRestock(item, '2026-05-17', 25);
            const targetDays = 30;
            const targetStock = targetDays * 10;
            const totalStock = 100 + 50;
            const expectedRestock = Math.max(0, Math.ceil(targetStock - totalStock));
            expect(result.restockQty).toBe(expectedRestock);
        });

        it('should calculate restockCost correctly', () => {
            const item = createItem({ currentStock: 0, inTransit: 0, dailySales: 10, costPerUnit: 50 });
            const result = calculateRestock(item, '2026-05-17', 25);
            const targetDays = 30;
            const expectedRestock = targetDays * 10;
            expect(result.restockCost).toBe(expectedRestock * 50);
        });

        it('should return zero restockQty when stock exceeds target', () => {
            const item = createItem({ currentStock: 500, inTransit: 0, dailySales: 10 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.restockQty).toBe(0);
        });
    });

    describe('zero sales handling', () => {
        it('should return Stagnant status when dailySales is 0', () => {
            const item = createItem({ dailySales: 0 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.status).toBe('Stagnant');
            expect(result.restockQty).toBe(0);
            expect(result.restockCost).toBe(0);
        });

        it('should return daysCovered as string "999.0" when dailySales is 0', () => {
            const item = createItem({ dailySales: 0 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.daysCovered).toBe('999.0');
            expect(typeof result.daysCovered).toBe('string');
        });
    });

    describe('status determination', () => {
        it('should return Critical status when daysCovered is less than leadTime', () => {
            const item = createItem({ currentStock: 100, inTransit: 0, dailySales: 10 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.status).toBe('Critical');
        });

        it('should return Healthy status when daysCovered is greater than leadTime', () => {
            const item = createItem({ currentStock: 500, inTransit: 0, dailySales: 10 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.status).toBe('Healthy');
        });
    });

    describe('edge cases', () => {
        it('should handle undefined costPerUnit gracefully', () => {
            const item = createItem({ costPerUnit: undefined as any });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.restockCost).toBe(0);
            expect(Number.isNaN(result.restockCost)).toBe(false);
        });

        it('should handle zero costPerUnit', () => {
            const item = createItem({ costPerUnit: 0 });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(result.restockCost).toBe(0);
        });

        it('should handle undefined currentStock gracefully', () => {
            const item = createItem({ currentStock: undefined as any });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(Number.isNaN(result.restockQty)).toBe(false);
        });

        it('should handle undefined inTransit gracefully', () => {
            const item = createItem({ inTransit: undefined as any });
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(Number.isNaN(result.restockQty)).toBe(false);
        });

        it('should handle target date in the past', () => {
            const item = createItem({ currentStock: 100, inTransit: 0, dailySales: 10 });
            const result = calculateRestock(item, '2026-04-10', 25);
            expect(result.restockQty).toBe(0);
        });

        it('should handle target date equal to today', () => {
            const item = createItem({ currentStock: 100, inTransit: 0, dailySales: 10 });
            const result = calculateRestock(item, '2026-04-17', 25);
            expect(result.restockQty).toBe(0);
        });
    });

    describe('return type consistency', () => {
        it('should always return daysCovered as a string', () => {
            const item1 = createItem({ dailySales: 0 });
            const item2 = createItem({ dailySales: 10 });
            const result1 = calculateRestock(item1, '2026-05-17', 25);
            const result2 = calculateRestock(item2, '2026-05-17', 25);
            expect(typeof result1.daysCovered).toBe('string');
            expect(typeof result2.daysCovered).toBe('string');
        });

        it('should always return restockQty as a number', () => {
            const item = createItem();
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(typeof result.restockQty).toBe('number');
        });

        it('should always return restockCost as a number', () => {
            const item = createItem();
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(typeof result.restockCost).toBe('number');
        });

        it('should always return status as a string', () => {
            const item = createItem();
            const result = calculateRestock(item, '2026-05-17', 25);
            expect(typeof result.status).toBe('string');
        });
    });

    describe('integration scenarios', () => {
        it('should calculate correctly for a typical inventory item', () => {
            const item = createItem({
                currentStock: 200,
                stockOfficial: 150,
                stockThirdParty: 50,
                inTransit: 100,
                dailySales: 15,
                costPerUnit: 30,
            });
            const result = calculateRestock(item, '2026-05-17', 25);
            const totalStock = 200 + 100;
            const daysCovered = totalStock / 15;
            expect(result.daysCovered).toBe(daysCovered.toFixed(1));
            expect(result.status).toBe('Critical');
            expect(result.restockQty).toBe(150);
            expect(result.restockCost).toBe(150 * 30);
        });

        it('should calculate correctly for a low-stock item', () => {
            const item = createItem({
                currentStock: 10,
                stockOfficial: 5,
                stockThirdParty: 5,
                inTransit: 0,
                dailySales: 20,
                costPerUnit: 100,
            });
            const result = calculateRestock(item, '2026-05-17', 25);
            const totalStock = 10 + 0;
            const daysCovered = totalStock / 20;
            expect(result.daysCovered).toBe(daysCovered.toFixed(1));
            expect(result.status).toBe('Critical');
            expect(result.restockQty).toBeGreaterThan(0);
            expect(result.restockCost).toBe(result.restockQty * 100);
        });
    });
});
