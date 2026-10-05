import { describe, expect, it } from 'vitest';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { createTiktokNode, getProfitCalculationContext, upgradeTiktokNode } from '../modules/profit/tiktokFeePolicy';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type CurrencyCode, type PlatformNode } from '../modules/profit/types';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';
import { normalizeStoredProfitNodes } from '../modules/profit/profitPersistence';
import { solveTargetProfitPrice } from '../modules/profit/targetProfitPricing';
import { aggregatePrimaryProfitTemplates } from '../modules/profit/dashboardProfit';

const global = { name: 'Test', sku: 'TK-1', purchaseCost: 10, productWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const site = { ...DEFAULT_SITE_INPUTS, totalRevenue: 100, adROI: 0 };
const calculate = (node: PlatformNode, inputs = site, rate = 1) => calculateProfit(node.data, global, inputs, rate, node.currency as CurrencyCode, getProfitCalculationContext(node.platform, node.persistedData));

describe('TikTok cross-border profit', () => {
  it('creates a US template with manual category commission and logistics without SEA fees', () => {
    const node = createTiktokNode('USD', 'US TK');
    expect(node.data).toMatchObject({ shippingCalculationMode: 2, manualShippingFee: 0, platformCommissionRate: 0,
      transactionFeeRate: 0, affiliateCommissionRate: 0, tiktokOrderFee: 0, growthServiceFeeRate: 0, shippingServiceFeeRate: 0, campaignServiceFeeRate: 0 });
    expect(getProfitCalculationContext(node.platform, node.persistedData).tiktokFeePolicy).toEqual({ version: 1, presetId: 'USD', verifiedAt: '2026-10-04' });
  });

  it('matches the US referral example after excluding collected tax from the entered price', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = { ...node.data, platformCommissionRate: 6, platformCoupon: 5 };
    // Official example: customer payment 102 + platform discount 5 - tax 2.
    // The calculator accepts the 105 product price before discounts, excluding tax.
    const result = calculate(node, { ...site, totalRevenue: 105 });
    expect(result.buyerPaidRevenue).toBe(100);
    expect(result.commissionBase).toBe(105);
    expect(result.commission).toBe(6.3);
    expect(result.transactionFee).toBe(0);
    expect(result.orderFee).toBe(0);
  });

  it('uses US referral and affiliate bases with co-funded coupons and manual net logistics', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = { ...node.data, platformCommissionRate: 6, affiliateCommissionRate: 10,
      platformCoupon: 10, buyerShippingFee: 6, shippingSubsidy: 2, manualShippingFee: 25 };
    const result = calculate(node, { ...site, sellerCoupon: 20, sellerCouponPlatformRatio: 50 });
    expect(result.buyerPaidRevenue).toBe(70);
    expect(result.commissionBase).toBe(96);
    expect(result.commission).toBe(5.76);
    expect(result.affiliateCommissionBase).toBe(90);
    expect(result.affiliateCommission).toBe(9);
    expect(result.shippingFee).toBe(17);
    expect(result.finalRevenueCNY).toBe(48.24);
  });

  it('rounds US fees in dollars and preserves the US policy through save and reload', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = { ...node.data, platformCommissionRate: 6, affiliateCommissionRate: 10, buyerShippingFee: 2.13, manualShippingFee: 3.75 };
    const inputs = { ...site, sellerCoupon: 5, sellerCouponPlatformRatio: 50 };
    const result = calculate(node, inputs, 0.14);
    expect(result.commission).toBeCloseTo(0.95 / 0.14);
    expect(result.affiliateCommission).toBeCloseTo(1.37 / 0.14);
    const payload = serializePlatformNodeTemplateData(node);
    const imported = createTemplatePlatformNode({ name: 'US', country: 'US', platform: 'tiktok', data: payload }, 'USD');
    const stored = normalizeStoredProfitNodes({ US: [imported] }, 'USD').USD[0];
    expect(serializePlatformNodeTemplateData(stored)).toEqual(payload);
    expect(calculate(stored, inputs, 0.14)).toEqual(result);
  });

  it('keeps US target pricing and dashboard profit consistent with the card calculation', () => {
    const node = createTiktokNode('USD', 'US');
    node.data = { ...node.data, platformCommissionRate: 6, affiliateCommissionRate: 10, buyerShippingFee: 2, manualShippingFee: 5 };
    const priced = solveTargetProfitPrice({ targetMargin: '25', currency: 'USD', exchangeRate: 0.14, node, globalInputs: global, siteInputs: site });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const pricedSite = { ...site, totalRevenue: priced.totalRevenue };
    expect(priced.profit).toEqual(calculate(node, pricedSite, 0.14));
    const dashboard = aggregatePrimaryProfitTemplates([{ id: 'us-link', productId: 'us-product', name: 'US TK', country: 'USD', platform: 'tiktok', isPrimary: true,
      data: { ...serializePlatformNodeTemplateData(node), exchangeRate: 0.14, exchangeRateAt: '2026-10-04T00:00:00.000Z' },
      product: { id: 'us-product', name: 'US', sku: 'US-1', country: 'US', sites: ['US'], cost: global.purchaseCost,
        productWeight: global.productWeight, supplierTaxPoint: 0, supplierInvoice: 'yes', vatRate: 0, corporateIncomeTaxRate: 0, siteData: { US: pricedSite } } }], {});
    expect(dashboard.rows[0]?.netProfitCNY).toBe(priced.profit.finalRevenueCNY);
    expect(dashboard.rows[0]?.marginPercent).toBe(priced.profit.margin);
  });

  it('uses a manually entered logistics total without adding weight or last-mile charges again', () => {
    const node = createTiktokNode('MYR', 'TK');
    node.data = { ...node.data, shippingCalculationMode: 2, manualShippingFee: 25.5, baseShippingFee: 100, extraShippingFee: 100, crossBorderFee: 100, lastMileFee: 100, buyerShippingFee: 3, shippingSubsidy: 2 };
    const result = calculate(node, site, 2);
    expect(result.actualShippingFee).toBe(12.75);
    expect(result.shippingFee).toBe(10.25);
    const serialized = serializePlatformNodeTemplateData(node);
    const loaded = createTemplatePlatformNode({ country: 'MYR', name: 'Manual', platform: 'tiktok', data: serialized }, 'MYR');
    expect(calculate(loaded, site, 2)).toEqual(result);
  });

  it('applies the manual choice to historical TK templates while leaving other platforms unchanged', () => {
    const data = { ...DEFAULT_NODE_DATA, shippingCalculationMode: 2, manualShippingFee: 20, baseShippingFee: 5 };
    expect(calculateProfit(data, global, site, 1, 'MYR', { platform: 'tiktok' }).shippingFee).toBe(20);
    expect(calculateProfit(data, global, site, 1, 'MYR', { platform: 'shopee' }).shippingFee).toBe(5);
  });
  it('seeds current country presets and leaves category commission manual', () => {
    const my = createTiktokNode('MYR', 'MY');
    expect(my.data).toMatchObject({ transactionFeeRate: 3.78, tiktokOrderFee: 0.54, affiliateCommissionRate: 0, campaignServiceFeeRate: 0, platformCommissionRate: 0 });
    expect(createTiktokNode('PHP', 'PH').data).toMatchObject({ transactionFeeRate: 2.24, tiktokOrderFee: 5, growthServiceFeeRate: 1.5, shippingServiceFeeRate: 5.5, shippingServiceFeeCap: 100 });
    expect(createTiktokNode('THB', 'TH').data).toMatchObject({ transactionFeeRate: 3.21, tiktokOrderFee: 1.07, growthServiceFeeRate: 8.03, growthServiceFeeCap: 199 });
    expect(createTiktokNode('SGD', 'SG').data.transactionFeeRate).toBe(3.27);
    expect(getProfitCalculationContext('tiktok', createTiktokNode('IDR', 'ID').persistedData).tiktokFeePolicy).toMatchObject({ presetId: 'manual', verifiedAt: null });
  });

  it.each([['MYR', 100, 38.18], ['PHP', 50, 22.62]] as const)('matches the %s official transaction example', (currency, coupon, fee) => {
    const node = createTiktokNode(currency, currency);
    node.data.platformCoupon = coupon;
    node.data.buyerShippingFee = 60;
    const result = calculate(node, { ...site, totalRevenue: 1000, sellerCoupon: 50 });
    expect(result.transactionFee).toBe(fee);
    expect(result.transactionFeeBase).toBe(1010);
  });

  it('separates co-funded revenue from affiliate buyer-paid product revenue and tax', () => {
    const node = createTiktokNode('MYR', 'TK');
    node.data = { ...node.data, platformCommissionRate: 10, affiliateCommissionRate: 10, affiliateProductTax: 5, platformCoupon: 10, buyerShippingFee: 6 };
    const result = calculate(node, { ...site, sellerCoupon: 20, sellerCouponPlatformRatio: 50 });
    expect(result.commission).toBe(9);
    expect(result.transactionFeeBase).toBe(96);
    expect(result.affiliateCommissionBase).toBe(65);
    expect(result.affiliateCommission).toBe(6.5);
  });

  it('caps each service in local currency before conversion and includes fees only once', () => {
    const node = createTiktokNode('PHP', 'TK');
    node.data = { ...node.data, growthServiceFeeRate: 0, campaignServiceFeeRate: 10, campaignServiceFeeCap: 30, mdvServiceFeeRate: 90 };
    const result = calculate(node, { ...site, totalRevenue: 1000, platformInfrastructureFee: 99 }, 2);
    expect(result.shippingServiceFee).toBe(50);
    expect(result.campaignServiceFee).toBe(15);
    expect(result.orderFee).toBe(2.5);
    expect(result.serviceFee).toBe(67.5);
    expect(result.platformFee).toBeCloseTo(result.commission + result.transactionFee + result.serviceFee + result.affiliateCommission);
  });

  it('rounds TK extra weight upwards and allows shipping subsidy income', () => {
    const node = createTiktokNode('MYR', 'TK');
    node.data = { ...node.data, shippingCalculationMode: 0, baseShippingFee: 5, extraShippingFee: 1, lastMileFee: 2, buyerShippingFee: 6, shippingSubsidy: 5 };
    const result = calculateProfit(node.data, { ...global, productWeight: 61 }, site, 1, 'MYR', getProfitCalculationContext(node.platform, node.persistedData));
    expect(result.actualShippingFee).toBe(9);
    expect(result.shippingFee).toBe(-2);
  });

  it('settles fees and discount bases locally before converting at a fractional exchange rate', () => {
    const node = createTiktokNode('MYR', 'TK');
    node.data = { ...node.data, platformCommissionRate: 13.7, affiliateCommissionRate: 8.8, buyerShippingFee: 2.13, affiliateProductTax: 1.27, platformCoupon: 3.16 };
    const rate = 0.65;
    const result = calculate(node, { ...site, totalRevenue: 99.99, sellerCoupon: 3.17, sellerCouponPlatformRatio: 33 }, rate);
    // 64.99 MYR price, 2.06 MYR coupon, seller funds 1.38 MYR.
    expect(result.commissionBase).toBeCloseTo(63.61 / rate);
    expect(result.commission).toBeCloseTo(8.71 / rate);
    expect(result.transactionFee).toBeCloseTo(2.48 / rate);
    expect(result.affiliateCommissionBase).toBeCloseTo(58.5 / rate);
    expect(result.affiliateCommission).toBeCloseTo(5.15 / rate);
    expect(result.orderFee).toBeCloseTo(0.54 / rate);
    expect(result.serviceFee).toBeCloseTo(0.54 / rate, 10);
    expect(result.platformFee).toBeCloseTo((8.71 + 2.48 + 5.15 + 0.54) / rate, 10);
  });

  it('applies the Thai growth and Singapore BXP caps in local currency', () => {
    const th = createTiktokNode('THB', 'TK');
    expect(calculate(th, { ...site, totalRevenue: 2000 }, 5).growthServiceFee).toBe(39.8);
    const sg = createTiktokNode('SGD', 'TK');
    sg.data = { ...sg.data, campaignServiceFeeRate: 6.54, campaignServiceFeeCap: 30 };
    expect(calculate(sg, { ...site, totalRevenue: 2000 }, 0.2).campaignServiceFee).toBeCloseTo(130.8);
    expect(calculate(sg, { ...site, totalRevenue: 3000 }, 0.2).campaignServiceFee).toBe(150);
  });

  it('preserves legacy behavior until upgrading and migrates existing fixed fees', () => {
    const legacy: PlatformNode = { id: 'old', platform: 'tiktok', currency: 'MYR', data: { ...DEFAULT_NODE_DATA, platformCommissionRate: 7, transactionFeeRate: 2, extraShippingFee: 1 } };
    expect(calculate(legacy).transactionFee).toBe(2);
    const upgraded = upgradeTiktokNode(legacy, { ...site, platformInfrastructureFee: 3 }, 2);
    expect(upgraded.data).toMatchObject({ platformCommissionRate: 7, transactionFeeRate: 2, extraShippingFee: 1, tiktokOrderFee: 6 });
    expect(legacy.persistedData).toBeUndefined();
    expect(calculate(upgraded, { ...site, platformInfrastructureFee: 3 }, 2).orderFee).toBe(3);
  });

  it('retains policy metadata and all fees through API and local storage round trips', () => {
    const node = createTiktokNode('THB', 'TK');
    node.data.affiliateCommissionRate = 12;
    const payload = serializePlatformNodeTemplateData(node);
    expect(getProfitCalculationContext('tiktok', payload)).toEqual(getProfitCalculationContext(node.platform, node.persistedData));
    const imported = createTemplatePlatformNode({ name: 'TK', country: 'THB', platform: 'tiktok', data: payload }, 'THB');
    const stored = normalizeStoredProfitNodes({ THB: [imported] }, 'THB').THB[0];
    expect(serializePlatformNodeTemplateData(stored)).toEqual(payload);
    expect(calculate(stored)).toEqual(calculate(node));
  });

  it('fails closed for unsupported or malformed TK policy versions', () => {
    expect(() => getProfitCalculationContext('tiktok', { tiktokFeePolicy: { version: 2 } })).toThrow();
    expect(() => getProfitCalculationContext('tiktok', { tiktokFeePolicy: null })).toThrow();
    expect(getProfitCalculationContext('shopee', { tiktokFeePolicy: { version: 2 } }).tiktokFeePolicy).toBeUndefined();
  });

  it('uses the same TK costs for target pricing and dashboard aggregation', () => {
    const node = createTiktokNode('MYR', 'TK');
    node.data = { ...node.data, affiliateCommissionRate: 10, platformCommissionRate: 8, buyerShippingFee: 3, baseShippingFee: 6 };
    const priced = solveTargetProfitPrice({ targetMargin: '25', currency: 'MYR', exchangeRate: 1, node, globalInputs: global, siteInputs: site });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const pricedSite = { ...site, totalRevenue: priced.totalRevenue };
    expect(priced.profit).toEqual(calculate(node, pricedSite));
    expect(priced.profit.margin).toBeGreaterThanOrEqual(25);
    const dashboard = aggregatePrimaryProfitTemplates([{ id: 'link', productId: 'product', name: 'TK', country: 'MYR', platform: 'tiktok', isPrimary: true, data: { ...serializePlatformNodeTemplateData(node), exchangeRate: 1, exchangeRateAt: '2026-10-04T00:00:00.000Z' }, product: { id: 'product', name: 'Test', sku: 'TK-1', country: 'MY', sites: ['MY'], cost: global.purchaseCost, productWeight: global.productWeight, supplierTaxPoint: 0, supplierInvoice: 'yes', vatRate: 0, corporateIncomeTaxRate: 0, siteData: { MY: pricedSite } } }], {});
    expect(dashboard.rows[0]?.netProfitCNY).toBe(priced.profit.finalRevenueCNY);
    expect(dashboard.rows[0]?.marginPercent).toBe(priced.profit.margin);
  });

  it('rejects automatic target pricing with missing weight before evaluating candidate prices', () => {
    const node = createTiktokNode('MYR', 'TK');
    const result = solveTargetProfitPrice({ targetMargin: '25', currency: 'MYR', exchangeRate: 1, node, globalInputs: { ...global, productWeight: 0 }, siteInputs: site });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_inputs', evaluations: 0, errors: [{ field: 'productWeight', code: 'required' }] });
  });

  it('keeps dashboard margins consistent at fractional exchange rates and discount amounts', () => {
    const node = createTiktokNode('MYR', 'TK');
    const inputs = { ...site, totalRevenue: 99.99, sellerCoupon: 3.17, sellerCouponPlatformRatio: 33 };
    const profit = calculate(node, inputs, 0.65);
    const dashboard = aggregatePrimaryProfitTemplates([{ id: 'fx', productId: 'product', name: 'TK', country: 'MYR', platform: 'tiktok', isPrimary: true,
      data: { ...serializePlatformNodeTemplateData(node), exchangeRate: 0.65, exchangeRateAt: '2026-10-04T00:00:00.000Z' },
      product: { id: 'product', name: 'Test', sku: 'TK-1', country: 'MY', sites: ['MY'], cost: global.purchaseCost, productWeight: global.productWeight, supplierTaxPoint: 0, supplierInvoice: 'yes', vatRate: 0, corporateIncomeTaxRate: 0, siteData: { MY: inputs } } }], {});
    expect(dashboard.rows[0]?.netProfitCNY).toBe(profit.finalRevenueCNY);
    expect(dashboard.rows[0]?.marginPercent).toBe(profit.margin);
  });
});
