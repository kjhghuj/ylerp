import { describe, expect, it } from 'vitest';
import { solveTargetProfitPrice } from '../modules/profit/targetProfitPricing';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type CurrencyCode } from '../modules/profit/types';

const input = {
  targetMargin: '20', currency: 'MYR', exchangeRate: 0.65,
  node: { id: 'n', currency: 'MYR', platform: 'shopee' as const, data: {
    ...DEFAULT_NODE_DATA, platformCommissionRate: 8, transactionFeeRate: 3,
    baseShippingFee: 2, platformCoupon: 1, mdvServiceFeeRate: 10,
  } },
  globalInputs: { name: '', sku: '', purchaseCost: 30, productWeight: 100, supplierInvoice: 'no' as const,
    supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
  siteInputs: { ...DEFAULT_SITE_INPUTS, totalRevenue: 0, sellerCoupon: 5 },
};

describe('target profit pricing', () => {
  it.each([
    ['MYR', 0.65], ['SGD', 0.19], ['PHP', 8.1], ['THB', 5], ['IDR', 2100],
  ] as const)('returns a cent-rounded price that really reaches the target in %s', (currency, exchangeRate) => {
    const args = { ...input, currency, exchangeRate, node: { ...input.node, currency } };
    const result = solveTargetProfitPrice(args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actual = calculateProfit(args.node.data, args.globalInputs,
      { ...args.siteInputs, totalRevenue: result.totalRevenue }, exchangeRate, currency);
    expect(actual).toEqual(result.profit);
    expect(actual.margin).toBeGreaterThanOrEqual(20);
    expect(actual.revenueAfterSellerCoupon).toBeGreaterThan(0);
    expect(Number(result.totalRevenue.toFixed(2))).toBe(result.totalRevenue);
    expect(result.evaluations).toBeLessThanOrEqual(256);
    expect(input.siteInputs.totalRevenue).toBe(0);
  });

  it.each(['fixed', 'percent'] as const)('recalculates %s coupons and platform contribution per candidate', sellerCouponType => {
    const args = { ...input, siteInputs: { ...input.siteInputs, sellerCouponType, sellerCoupon: 20,
      sellerCouponPlatformRatio: 50 } };
    const result = solveTargetProfitPrice(args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profit.margin).toBeGreaterThanOrEqual(20);
    expect(result.profit.margin).toBe(result.profit.finalRevenueCNY / result.profit.revenueAfterSellerCoupon * 100);
  });

  it('supports a zero-percent break-even target', () => {
    const result = solveTargetProfitPrice({ ...input, targetMargin: '0' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profit.finalRevenueCNY).toBeGreaterThanOrEqual(0);
  });

  it('crosses service fee caps and corporate tax thresholds using the original calculator', () => {
    const result = solveTargetProfitPrice({ ...input, currency: 'THB', exchangeRate: 5,
      node: { ...input.node, currency: 'THB', data: { ...input.node.data, mdvServiceFeeRate: 80,
        fssServiceFeeRate: 60, ccbServiceFeeRate: 60 } },
      globalInputs: { ...input.globalInputs, purchaseCost: 1000, corporateIncomeTaxRate: 25 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profit.margin).toBeGreaterThanOrEqual(20);
      expect(result.profit.serviceFee).toBe(50);
      expect(result.profit.corporateIncomeTax).toBeGreaterThan(0);
    }
  });

  it.each(['', '-1', '100', '20.001', 'abc', '1e1'])('rejects an invalid target %s', targetMargin => {
    expect(solveTargetProfitPrice({ ...input, targetMargin })).toMatchObject({ ok: false, reason: 'invalid_target' });
  });
  it.each([0, NaN, Infinity, -1])('rejects an invalid exchange rate %s', exchangeRate => {
    expect(solveTargetProfitPrice({ ...input, exchangeRate })).toMatchObject({ ok: false, reason: 'invalid_rate' });
  });
  it('rejects invalid cost instead of silently treating it as zero', () => {
    expect(solveTargetProfitPrice({ ...input, globalInputs: { ...input.globalInputs, purchaseCost: -1 } }))
      .toMatchObject({ ok: false, reason: 'invalid_inputs' });
  });
  it('ignores the previous manual revenue while solving a new one', () => {
    const result = solveTargetProfitPrice({ ...input, siteInputs: { ...input.siteInputs, totalRevenue: NaN } });
    expect(result.ok).toBe(true);
  });
  it.each([
    { node: { ...input.node, data: { ...input.node.data, platformCommissionRate: 100 } } },
    { globalInputs: { ...input.globalInputs, purchaseCost: 2000000 } },
    { siteInputs: { ...input.siteInputs, sellerCoupon: 2000000 } },
    { siteInputs: { ...input.siteInputs, sellerCouponType: 'percent' as const, sellerCoupon: 100 } },
  ])('does not invent a price for an unreachable target %#', overrides => {
    const result = solveTargetProfitPrice({ ...input, ...overrides });
    expect(result).toMatchObject({ ok: false, reason: 'no_result' });
    expect(result.evaluations).toBeLessThanOrEqual(256);
  });
  it('rejects graph and invalid nodes as pricing bases', () => {
    expect(solveTargetProfitPrice({ ...input, node: { ...input.node, graphTemplateId: 'graph' } }))
      .toMatchObject({ ok: false, reason: 'unsupported_node' });
    expect(solveTargetProfitPrice({ ...input, currency: 'UNKNOWN' as CurrencyCode }))
      .toMatchObject({ ok: false, reason: 'unsupported_node' });
  });
});
