import { describe, expect, it } from 'vitest';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type NodeData } from '../modules/profit/types';
import { GRAMS_PER_OUNCE as OZ, GRAMS_PER_POUND as LB, quoteTiktokUSShipping, formatTiktokUSShippingDate } from '../modules/profit/tiktokUSShipping';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { createTiktokNode, getProfitCalculationContext } from '../modules/profit/tiktokFeePolicy';
import { normalizeStandardNodeData, validateTiktokShippingWeight } from '../modules/profit/profitInputNormalization';
import { solveTargetProfitPrice } from '../modules/profit/targetProfitPricing';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { aggregatePrimaryProfitTemplates } from '../modules/profit/dashboardProfit';

const data = (partial: Partial<NodeData> = {}): NodeData => ({ ...DEFAULT_NODE_DATA,
  shippingCalculationMode: 3, usHeadFreightConfigured: 1, usHeadFreightFee: 1,
  usLocalDeliveryMode: 2, usDestinationRegion: 1,
  usPackageLengthCm: 2.54, usPackageWidthCm: 2.54, usPackageHeightCm: 2.54, ...partial,
});
const global = { name: 'US', sku: 'US-1', purchaseCost: 10, productWeight: 300, supplierTaxPoint: 0,
  supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const site = { ...DEFAULT_SITE_INPUTS, totalRevenue: 150, adROI: 0 };

describe('verified US local LIVE delivery and separately quoted head freight', () => {
  it.each([
    [2, 2 * OZ, 3.69], [3, 2 * OZ, 3.39],
    [2, 6 * OZ, 3.99], [3, 6 * OZ, 3.69],
    [2, 10 * OZ, 4.59], [3, 10 * OZ, 4.29],
    [2, 14 * OZ, 5.09], [3, 14 * OZ, 4.79],
    [2, LB, 7.19], [3, LB, 5.59], [2, 4 * LB, 7.19], [3, 4 * LB, 5.59],
  ])('matches channel %s official LIVE weight %s: %s USD', (mode, weight, fee) => {
    expect(quoteTiktokUSShipping(data({ usLocalDeliveryMode: mode }), weight)).toMatchObject({
      localDeliveryFeeLocal: fee, totalFeeLocal: Math.round((fee + 1) * 100) / 100, isOfficialLocalQuote: true,
      shippingDate: '2026-10-04', sourceUrl: expect.stringContaining('6744662208792321'),
    });
  });

  it.each([[4, 3.99], [8, 4.59], [12, 5.09], [16, 7.19]])('honors the published strict <%s oz boundary', (ounces, fee) => {
    expect(quoteTiktokUSShipping(data(), ounces * OZ).localDeliveryFeeLocal).toBe(fee);
  });

  it('matches the dimensional-weight official example rather than charging actual weight only', () => {
    // Official example: 11 oz, 0.08 cu ft -> Std 15.99 oz, CBT ~14 oz.
    const dims = { usPackageLengthCm: 2.54 * 12, usPackageWidthCm: 2.54 * 12, usPackageHeightCm: 2.54 * 0.96 };
    expect(quoteTiktokUSShipping(data(dims), 11 * OZ).localDeliveryFeeLocal).toBe(5.09);
    expect(quoteTiktokUSShipping(data({ ...dims, usLocalDeliveryMode: 3 }), 11 * OZ).localDeliveryFeeLocal).toBe(4.79);
  });

  it.each([20261004, 20261005, 20270117])('uses the selected Pacific shipping date %s for peak surcharges', date => {
    const peak = date >= 20261005;
    expect(quoteTiktokUSShipping(data({ usShippingDate: date }), 2 * OZ).localDeliveryFeeLocal).toBe(peak ? 3.99 : 3.69);
    expect(quoteTiktokUSShipping(data({ usShippingDate: date }), LB).localDeliveryFeeLocal).toBe(peak ? 7.74 : 7.19);
    expect(quoteTiktokUSShipping(data({ usShippingDate: date, usLocalDeliveryMode: 3 }), LB).localDeliveryFeeLocal).toBe(5.59);
  });

  it.each([0, 20260931, 20261032, 20261301, 20261004.5, Infinity])('rejects invalid shipping date %s', date => {
    expect(() => formatTiktokUSShippingDate(date)).toThrow();
  });

  it.each([20260920, 20270118])('requires verified rates only when using an automatic LIVE quote dated %s', date => {
    expect(() => quoteTiktokUSShipping(data({ usShippingDate: date }), 300)).toThrow('verified LIVE rate');
    expect(normalizeStandardNodeData(data({ usShippingDate: date, shippingCalculationMode: 2 })).ok).toBe(true);
    expect(quoteTiktokUSShipping(data({ usShippingDate: date, usLocalDeliveryMode: 1, lastMileFee: 12 }), 300).totalFeeLocal).toBe(13);
  });

  it('uses the same decimal half-up dollar rounding as the other settlement fees', () => {
    expect(quoteTiktokUSShipping(data({ usHeadFreightFee: 0, usHeadFreightRatePerKg: 16.75, usLocalDeliveryMode: 4 }), 60).headFreightFeeLocal).toBe(1.01);
  });

  it('rejects unsupported destinations, missing packed dimensions and >=5 lb, without inventing a non-LIVE quote', () => {
    expect(() => quoteTiktokUSShipping(data({ usDestinationRegion: 0 }), 300)).toThrow('contiguous');
    expect(() => quoteTiktokUSShipping(data({ usDestinationRegion: 2 }), 300)).toThrow('contiguous');
    expect(() => quoteTiktokUSShipping(data({ usPackageWidthCm: 0 }), 300)).toThrow('dimensions');
    expect(() => quoteTiktokUSShipping(data(), 5 * LB)).toThrow('below 5 lb');
    expect(() => quoteTiktokUSShipping(data({ usPackageLengthCm: 40, usPackageWidthCm: 30, usPackageHeightCm: 20 }), 100)).toThrow('below 5 lb');
    expect(quoteTiktokUSShipping(data({ usLocalDeliveryMode: 1, lastMileFee: 12.5 }), 5 * LB).localDeliveryFeeLocal).toBe(12.5);
  });

  it('requires an explicit head-freight quote and local pricing choice; a confirmed zero is supported', () => {
    expect(() => quoteTiktokUSShipping(data({ usHeadFreightConfigured: 0 }), 300)).toThrow('head-freight');
    expect(() => quoteTiktokUSShipping(data({ usLocalDeliveryMode: 0 }), 300)).toThrow('local delivery');
    expect(quoteTiktokUSShipping(data({ usHeadFreightFee: 0, usLocalDeliveryMode: 4 }), 0).totalFeeLocal).toBe(0);
  });

  it.each([NaN, Infinity, -1])('rejects invalid head-freight amount %s', value => {
    expect(() => quoteTiktokUSShipping(data({ usHeadFreightFee: value }), 300)).toThrow();
    expect(() => quoteTiktokUSShipping(data({ usHeadFreightRatePerKg: value }), 300)).toThrow();
  });

  it('rounds head and local fees in dollars before FX and deducts buyer shipping and subsidy once', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = data({ usHeadFreightFee: 0.125, usHeadFreightRatePerKg: 3.14159,
      buyerShippingFee: 5, shippingSubsidy: 2, baseShippingFee: 99, extraShippingFee: 99,
      crossBorderFee: 99, lastMileFee: 99, manualShippingFee: 99 });
    const quote = quoteTiktokUSShipping(node.data, 300);
    expect(quote).toMatchObject({ headFreightFeeLocal: 1.07, localDeliveryFeeLocal: 4.59, totalFeeLocal: 5.66 });
    const result = calculateProfit(node.data, global, site, 0.14, 'USD', getProfitCalculationContext('tiktok', node.persistedData));
    expect(result.usHeadFreightFee).toBeCloseTo(1.07 / 0.14);
    expect(result.usLocalDeliveryFee).toBeCloseTo(4.59 / 0.14);
    expect(result.actualShippingFee).toBeCloseTo(5.66 / 0.14);
    expect(result.shippingFee).toBeCloseTo(-1.34 / 0.14);
  });

  it('keeps whole-shipment quotes and unrelated platforms unchanged when switching away from split mode', () => {
    const d = data({ shippingCalculationMode: 2, manualShippingFee: 20, lastMileFee: 99 });
    expect(calculateProfit(d, global, site, 1, 'USD', { platform: 'tiktok' }).shippingFee).toBe(20);
    expect(createTiktokNode('USD', 'US').data.shippingCalculationMode).toBe(2);
    expect(calculateProfit(data({ baseShippingFee: 7 }), global, site, 1, 'USD', { platform: 'other' }).shippingFee).toBe(7);
    expect(() => calculateProfit(data(), global, site, 1, 'MYR', { platform: 'tiktok' })).toThrow('USD');
  });

  it('reports invalid configuration consistently before saving or solving a target price', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = data({ usHeadFreightConfigured: 0 });
    const errors = validateTiktokShippingWeight('tiktok', node.data, 300, 'USD');
    expect(errors).toEqual([{ field: 'usHeadFreightConfigured', code: 'required' }]);
    expect(solveTargetProfitPrice({ node, globalInputs: global, siteInputs: site, currency: 'USD', exchangeRate: 0.14, targetMargin: '25' })).toMatchObject({ ok: false, reason: 'invalid_inputs', errors });
    expect(normalizeStandardNodeData({ ...data(), usLocalDeliveryMode: 2.5 })).toMatchObject({ ok: false });
    expect(normalizeStandardNodeData({ ...data(), usShippingDate: 20260931 })).toMatchObject({ ok: false });
  });

  it('produces identical split shipping in target pricing, direct calculation and dashboard aggregation', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = data({ platformCommissionRate: 6, usHeadFreightRatePerKg: 2, buyerShippingFee: 2 });
    const priced = solveTargetProfitPrice({ node, globalInputs: global, siteInputs: site, currency: 'USD', exchangeRate: 0.14, targetMargin: '25' });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const pricedSite = { ...site, totalRevenue: priced.totalRevenue };
    expect(priced.profit).toEqual(calculateProfit(node.data, global, pricedSite, 0.14, 'USD', getProfitCalculationContext('tiktok', node.persistedData)));
    const dashboard = aggregatePrimaryProfitTemplates([{ id: 'link', productId: 'p', name: 'US TK', country: 'USD', platform: 'tiktok', isPrimary: true,
      data: { ...serializePlatformNodeTemplateData(node), exchangeRate: 0.14, exchangeRateAt: '2026-10-04T00:00:00.000Z' },
      product: { id: 'p', name: 'US', sku: 'US-1', country: 'US', sites: ['US'], cost: 10, productWeight: 300, supplierInvoice: 'yes', supplierTaxPoint: 0, vatRate: 0, corporateIncomeTaxRate: 0, siteData: { US: pricedSite } } }], {});
    expect(dashboard.rows[0]?.netProfitCNY).toBe(priced.profit.finalRevenueCNY);
    expect(dashboard.rows[0]?.marginPercent).toBe(priced.profit.margin);
    const invalid = { ...node, data: { ...node.data, usPackageHeightCm: 0 } };
    expect(aggregatePrimaryProfitTemplates([{ id: 'bad', productId: 'p', name: 'bad', country: 'USD', platform: 'tiktok', isPrimary: true,
      data: serializePlatformNodeTemplateData(invalid), product: { id: 'p', name: 'US', sku: 'US-1', country: 'US', sites: ['US'], cost: 10, productWeight: 300, supplierInvoice: 'yes', siteData: { US: site } } }], { USD: 0.14 }).excluded).toContainEqual({ templateId: 'bad', reason: 'invalid_input' });
  });
});
