import { describe, expect, it } from 'vitest';
import type { ProductCalcData } from '../types';
import {
  buildProductDisplayItems,
  summarizeProductDisplayGroup,
  type ProductDisplayGroup,
} from '../modules/product-list/productDisplayGroups';

const product = (id: string, name: string, sku: string, cost: number, revenue: number): ProductCalcData => ({
  id,
  name,
  sku,
  country: 'MY',
  sites: ['MY'],
  cost,
  productWeight: 100,
  supplierInvoice: 'no',
  supplierTaxPoint: 0,
  totalRevenue: revenue,
  siteData: { MY: { totalRevenue: revenue } },
});

const products = [
  product('p1', 'Bottle Black', 'BOT-BLK', 10, 30),
  product('p2', 'Bottle White', 'BOT-WHT', 12, 35),
  product('p3', 'Cup', 'CUP-1', 8, 20),
];

const groups: ProductDisplayGroup[] = [{
  id: 'g1',
  name: 'Insulated Bottle',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
  members: [{ productId: 'p1' }, { productId: 'p2' }],
}];

describe('product display groups', () => {
  it('collapses grouped products and leaves ungrouped products as individual items', () => {
    const result = buildProductDisplayItems(products, groups, '');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ type: 'group', group: { id: 'g1' } });
    expect(result.items[0].products.map(item => item.id)).toEqual(['p1', 'p2']);
    expect(result.items[1]).toMatchObject({ type: 'product', product: { id: 'p3' } });
    expect(result.products).toEqual(products);
  });

  it('shows all members when the group name matches', () => {
    const result = buildProductDisplayItems(products, groups, 'insulated');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].products.map(item => item.id)).toEqual(['p1', 'p2']);
    expect(result.items[0]).toMatchObject({ type: 'group', matchedMemberCount: 2, totalMemberCount: 2 });
  });

  it('shows only matching members when a member name or SKU matches', () => {
    const result = buildProductDisplayItems(products, groups, 'wht');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].products.map(item => item.id)).toEqual(['p2']);
    expect(result.items[0]).toMatchObject({ type: 'group', matchedMemberCount: 1, totalMemberCount: 2 });
    expect(result.products.map(item => item.id)).toEqual(['p2']);
  });

  it('summarizes ranges and only sums matched stock records', () => {
    const stockBySku = new Map([
      ['BOT-BLK', { sku: 'BOT-BLK', available: 4, inventory: 7, occupy: 2, unshipped: 1, warehouseCodes: ['A'] }],
    ]);

    const summary = summarizeProductDisplayGroup(products.slice(0, 2), 'MY', stockBySku, 2);

    expect(summary.cost).toEqual({ min: 10, max: 12 });
    expect(summary.priceCNY).toEqual({ min: 30, max: 35 });
    expect(summary.stock).toMatchObject({ available: 4, inventory: 7, occupy: 2, unshipped: 1 });
    expect(summary.matchedStockCount).toBe(1);
    expect(summary.totalStockCount).toBe(2);
  });

  it('counts a warehouse SKU once when product SKUs differ only by case', () => {
    const variants = [
      product('p1', 'Bottle A', 'bot-blk', 10, 30),
      product('p2', 'Bottle B', ' BOT-BLK ', 12, 35),
    ];
    const stockBySku = new Map([
      ['BOT-BLK', { sku: 'BOT-BLK', available: 4, inventory: 7, occupy: 2, unshipped: 1, warehouseCodes: ['A'] }],
    ]);

    const summary = summarizeProductDisplayGroup(variants, 'MY', stockBySku);

    expect(summary.stock?.available).toBe(4);
    expect(summary.matchedStockCount).toBe(1);
    expect(summary.totalStockCount).toBe(2);
  });
});
