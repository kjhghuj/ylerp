import { describe, expect, it } from 'vitest';
import { quoteTiktokUSDirectShipping } from '../modules/profit/tiktokUSDirectShipping';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { createTiktokNode, getProfitCalculationContext } from '../modules/profit/tiktokFeePolicy';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';
import { normalizeStandardNodeData, validateTiktokShippingWeight } from '../modules/profit/profitInputNormalization';
import { solveTargetProfitPrice } from '../modules/profit/targetProfitPricing';
import { aggregatePrimaryProfitTemplates } from '../modules/profit/dashboardProfit';

const data = { ...DEFAULT_NODE_DATA, shippingCalculationMode: 4 };
const globalInputs = { name: 'US direct parcel', sku: 'DIRECT-1', purchaseCost: 10, productWeight: 500,
  supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const site = { ...DEFAULT_SITE_INPUTS, totalRevenue: 200, adROI: 0 };

describe('US mainland official 4PL direct shipping', () => {
  it.each([
    [1, 50, 3.50], [50, 50, 3.50], [50.1, 51, 3.51], [300, 300, 6],
    [450, 450, 7.50], [451, 451, 9.05], [500, 500, 9.45],
    [1000, 1000, 13.50], [1001, 1001, 13.91], [3000, 3000, 31.50],
    [3001, 3001, 31.51], [30000, 30000, 269.10],
  ])('quotes general cargo at %sg as %sg and USD %s', (weight, billable, fee) => {
    expect(quoteTiktokUSDirectShipping(data, weight)).toMatchObject({ billableWeightGrams: billable, shippingFeeLocal: fee, totalFeeLocal: fee });
  });

  it.each([1, 2])('uses the special/sensitive rates for cargo %s', usDirectCargoType => {
    const cargo = { ...data, usDirectCargoType };
    expect(quoteTiktokUSDirectShipping(cargo, 50).totalFeeLocal).toBe(3.95);
    expect(quoteTiktokUSDirectShipping(cargo, 450).totalFeeLocal).toBe(8.35);
    expect(quoteTiktokUSDirectShipping(cargo, 500).totalFeeLocal).toBe(11.3);
    expect(quoteTiktokUSDirectShipping(cargo, 1000).totalFeeLocal).toBe(16.3);
    expect(quoteTiktokUSDirectShipping(cargo, 1001).totalFeeLocal).toBe(16.51);
    expect(quoteTiktokUSDirectShipping(cargo, 30000).totalFeeLocal).toBe(332.6);
  });

  it('rounds separately entered extras in USD before adding them', () => {
    expect(quoteTiktokUSDirectShipping({ ...data, usDirectExtraFee: 1.005 }, 500))
      .toMatchObject({ shippingFeeLocal: 9.45, extraFeeLocal: 1.01, totalFeeLocal: 10.46 });
  });

  it.each([0, -1, 30000.1, Infinity, NaN])('rejects unsupported weight %s instead of extending the last tier', weight => {
    expect(() => quoteTiktokUSDirectShipping(data, weight)).toThrow();
    expect(validateTiktokShippingWeight('tiktok', data, weight, 'USD')[0].field).toBe('productWeight');
  });

  it.each([-1, 0.5, 3, NaN])('rejects unsupported cargo %s', usDirectCargoType => {
    expect(() => quoteTiktokUSDirectShipping({ ...data, usDirectCargoType }, 500)).toThrow();
    expect(normalizeStandardNodeData({ usDirectCargoType }).ok).toBe(false);
  });

  it.each([-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid extras %s', usDirectExtraFee => {
    expect(() => quoteTiktokUSDirectShipping({ ...data, usDirectExtraFee }, 500)).toThrow();
  });

  it('includes delivery once, subtracts actual buyer shipping/subsidies, and ignores dormant charges and dimensions', () => {
    const node = createTiktokNode('USD', 'US 4PL');
    node.data = { ...node.data, ...data, usDirectExtraFee: 1.005, buyerShippingFee: 5.99, shippingSubsidy: 2,
      baseShippingFee: 99, extraShippingFee: 99, crossBorderFee: 99, lastMileFee: 99,
      usHeadFreightFee: 99, usHeadFreightRatePerKg: 99, manualShippingFee: 99,
      usPackageLengthCm: 100, usPackageWidthCm: 100, usPackageHeightCm: 100 };
    const result = calculateProfit(node.data, globalInputs, site, 0.14, 'USD', getProfitCalculationContext(node.platform, node.persistedData));
    expect(result.actualShippingFee).toBeCloseTo(10.46 / 0.14);
    expect(result.shippingFee).toBeCloseTo(2.47 / 0.14);
    expect(result.usHeadFreightFee).toBeUndefined();
    expect(result.usLocalDeliveryFee).toBeUndefined();
  });

  it('preserves cargo/extras and profit after JSON save/reload and keeps target pricing consistent', () => {
    const node = createTiktokNode('USD', 'US 4PL');
    node.data = { ...node.data, shippingCalculationMode: 4, usDirectCargoType: 2, usDirectExtraFee: 2.25, platformCommissionRate: 6 };
    const payload = JSON.parse(JSON.stringify(serializePlatformNodeTemplateData(node)));
    const loaded = createTemplatePlatformNode({ name: 'US', country: 'US', platform: 'tiktok', data: payload }, 'USD');
    expect(loaded.data).toMatchObject({ shippingCalculationMode: 4, usDirectCargoType: 2, usDirectExtraFee: 2.25 });
    const context = getProfitCalculationContext(node.platform, node.persistedData);
    expect(calculateProfit(loaded.data, globalInputs, site, 0.14, 'USD', context)).toEqual(calculateProfit(node.data, globalInputs, site, 0.14, 'USD', context));
    const priced = solveTargetProfitPrice({ targetMargin: '25', currency: 'USD', exchangeRate: 0.14, node: loaded, globalInputs, siteInputs: site });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const pricedSite = { ...site, totalRevenue: priced.totalRevenue };
    expect(calculateProfit(loaded.data, globalInputs, pricedSite, 0.14, 'USD', context)).toEqual(priced.profit);
    expect(priced.profit.margin).toBeGreaterThanOrEqual(25);
    const dashboard = aggregatePrimaryProfitTemplates([{ id: 'direct-link', productId: 'direct-product', name: 'US 4PL', country: 'USD', platform: 'tiktok', isPrimary: true,
      data: { ...serializePlatformNodeTemplateData(loaded), exchangeRate: 0.14, exchangeRateAt: '2026-10-04T00:00:00.000Z' },
      product: { id: 'direct-product', name: globalInputs.name, sku: globalInputs.sku, country: 'US', sites: ['US'], cost: globalInputs.purchaseCost,
        productWeight: 500, supplierTaxPoint: 0, supplierInvoice: 'yes', vatRate: 0, corporateIncomeTaxRate: 0, siteData: { US: pricedSite } } }], {});
    expect(dashboard.rows[0]?.netProfitCNY).toBe(priced.profit.finalRevenueCNY);
    expect(dashboard.rows[0]?.marginPercent).toBe(priced.profit.margin);
  });

  it('restricts direct-mail automation to USD TikTok and retains other-platform calculations', () => {
    expect(validateTiktokShippingWeight('tiktok', data, 500, 'MYR')).toEqual([{ field: 'shippingCalculationMode', code: 'invalid_enum' }]);
    expect(() => calculateProfit(data, globalInputs, site, 1, 'MYR', { platform: 'tiktok' })).toThrow();
    expect(calculateProfit(data, globalInputs, site, 1, 'USD', { platform: 'shopee' })).toEqual(
      calculateProfit({ ...data, shippingCalculationMode: 0 }, globalInputs, site, 1, 'USD', { platform: 'shopee' }));
  });
});
