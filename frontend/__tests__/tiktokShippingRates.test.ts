import { describe, expect, it } from 'vitest';
import { getTiktokShippingRate, quoteTiktokCrossBorderShipping, TIKTOK_SHIPPING_SOURCE_REVISION } from '../modules/profit/tiktokShippingRates';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { createTiktokNode, getProfitCalculationContext, upgradeTiktokNode } from '../modules/profit/tiktokFeePolicy';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type CurrencyCode, type PlatformNode } from '../modules/profit/types';
import { validateTiktokShippingWeight } from '../modules/profit/profitInputNormalization';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';

const global = { purchaseCost: 10, productWeight: 300, supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const site = { ...DEFAULT_SITE_INPUTS, totalRevenue: 100, adROI: 0 };

describe('official mainland Standard TikTok shipping rate card', () => {
  it.each([
    ['SGD', 300, 4.88], ['MYR', 300, 3.42], ['THB', 300, 12], ['PHP', 300, 138.5],
    ['SGD', 1121, 17.33], ['MYR', 1121, 13.38], ['THB', 1121, 45.2], ['PHP', 1121, 512],
  ] as const)('quotes official %s %ig at %s in local currency', (currency, weight, amount) => {
    const quote = quoteTiktokCrossBorderShipping(currency, weight);
    expect(quote.crossBorderFeeLocal).toBe(amount);
    expect(quote.billableWeightGrams).toBe(weight === 1121 ? 1130 : 300);
    expect(quote.rate.sourceRevision).toBe('2026-09-24');
    expect(quote.rate.sourceUrl).toContain('seller.tiktokglobalshop.com/university/');
  });

  it.each(['SGD', 'MYR', 'THB', 'PHP'])('charges the minimum weight and rounds each %s extra step upwards', currency => {
    const rate = getTiktokShippingRate(currency)!;
    expect(quoteTiktokCrossBorderShipping(currency, 0.1)).toMatchObject({
      crossBorderFeeLocal: rate.firstWeightFeeLocal, billableWeightGrams: rate.firstWeightGrams,
    });
    expect(quoteTiktokCrossBorderShipping(currency, rate.firstWeightGrams).crossBorderFeeLocal).toBe(rate.firstWeightFeeLocal);
    const extra = quoteTiktokCrossBorderShipping(currency, rate.firstWeightGrams + 0.1);
    expect(extra.crossBorderFeeLocal).toBeCloseTo(rate.firstWeightFeeLocal + rate.additionalWeightFeeLocal);
    expect(extra.billableWeightGrams).toBe(rate.firstWeightGrams + 10);
    expect(quoteTiktokCrossBorderShipping(currency, rate.maxWeightGrams).billableWeightGrams).toBe(rate.maxWeightGrams);
    expect(() => quoteTiktokCrossBorderShipping(currency, rate.maxWeightGrams + 0.1)).toThrow('exceeds');
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid weight %s without quoting free shipping', weight => {
    expect(() => quoteTiktokCrossBorderShipping('MYR', weight)).toThrow();
  });

  it('rejects unverified countries and pins the current card rather than a future update', () => {
    expect(getTiktokShippingRate('IDR')).toBeUndefined();
    expect(getTiktokShippingRate('__proto__')).toBeUndefined();
    expect(() => quoteTiktokCrossBorderShipping('IDR', 300)).toThrow();
    expect(TIKTOK_SHIPPING_SOURCE_REVISION).toBe('2026-09-24');
    expect(getTiktokShippingRate('MYR')?.effectiveFrom).toBe('2026-09-07');
  });

  it('adds actual last mile before deducting buyer shipping and subsidies, and converts only after local rounding', () => {
    const node = createTiktokNode('MYR', 'TK');
    expect(node.data.shippingCalculationMode).toBe(1);
    node.data = { ...node.data, baseShippingFee: 99, crossBorderFee: 99, extraShippingFee: 99,
      lastMileFee: 5.127, buyerShippingFee: 5, shippingSubsidy: 0.5 };
    const context = getProfitCalculationContext(node.platform, node.persistedData);
    const result = calculateProfit(node.data, global, site, 0.65, 'MYR', context);
    expect(result.actualShippingFee).toBeCloseTo((3.42 + 5.13) / 0.65, 10);
    expect(result.shippingFee).toBeCloseTo(3.05 / 0.65, 10);
    const payload = serializePlatformNodeTemplateData(node);
    const loaded = createTemplatePlatformNode({ name: 'TK', platform: 'tiktok', country: 'MYR', data: payload }, 'MYR');
    expect(loaded.data.shippingCalculationMode).toBe(1);
    expect(calculateProfit(loaded.data, global, site, 0.65, 'MYR', getProfitCalculationContext(loaded.platform, loaded.persistedData))).toEqual(result);
  });

  it('retains old template rates on upgrade and allows an explicit automatic choice without requiring a fee upgrade', () => {
    const legacy: PlatformNode = { id: 'old', platform: 'tiktok', currency: 'MYR', data: { ...DEFAULT_NODE_DATA, baseShippingFee: 5, extraShippingFee: 1 } };
    const old = calculateProfit(legacy.data, global, site, 1, 'MYR', { platform: 'tiktok' });
    expect(old.shippingFee).toBe(30);
    const upgraded = upgradeTiktokNode(legacy, site, 1);
    expect(upgraded.data.shippingCalculationMode).toBe(0);
    expect(calculateProfit(upgraded.data, global, site, 1, 'MYR', getProfitCalculationContext('tiktok', upgraded.persistedData)).actualShippingFee).toBe(30);
    const automatic = calculateProfit({ ...legacy.data, shippingCalculationMode: 1, lastMileFee: 2 }, global, site, 0.65, 'MYR', { platform: 'tiktok' });
    expect(automatic.shippingFee).toBeCloseTo(5.42 / 0.65, 10);
    expect(automatic.actualShippingFee).toBe(automatic.shippingFee);
  });

  it('does not apply TK official or manual modes to other platforms', () => {
    const data = { ...DEFAULT_NODE_DATA, shippingCalculationMode: 1, baseShippingFee: 5 };
    expect(calculateProfit(data, global, site, 1, 'MYR', { platform: 'shopee' }).shippingFee).toBe(5);
    expect(createTiktokNode('IDR', 'TK').data.shippingCalculationMode).toBe(2);
  });

  it.each(['SGD', 'MYR', 'THB', 'PHP'] as CurrencyCode[])('reports %s automatic weight limits before profit preview or target pricing', currency => {
    const data = createTiktokNode(currency, 'TK').data;
    expect(validateTiktokShippingWeight('tiktok', data, 0, currency)).toEqual([{ field: 'productWeight', code: 'required' }]);
    const max = getTiktokShippingRate(currency)!.maxWeightGrams;
    expect(validateTiktokShippingWeight('tiktok', data, max + 1, currency)).toEqual([{ field: 'productWeight', code: 'max', max }]);
    expect(validateTiktokShippingWeight('tiktok', data, max, currency)).toEqual([]);
    expect(validateTiktokShippingWeight('tiktok', { ...data, shippingCalculationMode: 2 }, 0, currency)).toEqual([]);
    expect(() => calculateProfit(data, { ...global, productWeight: 0 }, site, 1, currency, { platform: 'tiktok' })).toThrow();
  });
});
