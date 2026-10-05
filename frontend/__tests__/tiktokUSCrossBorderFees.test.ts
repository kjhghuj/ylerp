import { describe, expect, it } from 'vitest';
import { applyTiktokUSCrossBorderDefaults, createTiktokNode, getProfitCalculationContext, upgradeTiktokNode } from '../modules/profit/tiktokFeePolicy';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type PlatformNode } from '../modules/profit/types';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';
import { normalizeStoredProfitNodes } from '../modules/profit/profitPersistence';
import { solveTargetProfitPrice } from '../modules/profit/targetProfitPricing';

const globalInputs = { name: 'Cross-border', sku: 'US-CROSS', purchaseCost: 10, productWeight: 500,
  supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const site = { ...DEFAULT_SITE_INPUTS, totalRevenue: 100, adROI: 0, sellerCoupon: 10 };
const calc = (node: PlatformNode, inputs = site, rate = 1) => calculateProfit(node.data, globalInputs, inputs, rate, 'USD', getProfitCalculationContext(node.platform, node.persistedData));

describe('China cross-border US fee preset', () => {
  it('seeds the named cross-border node with one 6% platform fee and no optional programs', () => {
    const node = createTiktokNode('USD', '跨境');
    expect(node.name).toBe('跨境');
    expect(node.data).toMatchObject({ platformCommissionRate: 6, transactionFeeRate: 0, tiktokOrderFee: 0,
      growthServiceFeeRate: 0, shippingServiceFeeRate: 0, campaignServiceFeeRate: 0, affiliateCommissionRate: 0 });
    expect(getProfitCalculationContext(node.platform, node.persistedData).tiktokFeePolicy)
      .toMatchObject({ presetId: 'USD', presetProfile: 'us-cross-border', verifiedAt: '2026-10-04' });
    node.data.buyerShippingFee = 5;
    node.data.platformCoupon = 20;
    expect(calc(node)).toMatchObject({ commissionBase: 95, commission: 5.7, transactionFee: 0, serviceFee: 0, platformFee: 5.7 });
  });

  it('upgrades only the named standard US node and preserves logistics and agreed affiliate fees', () => {
    const original: PlatformNode = { id: 'existing', platform: 'tiktok', currency: 'USD', name: '跨境',
      data: { ...DEFAULT_NODE_DATA, platformCommissionRate: 0, transactionFeeRate: 3.21, tiktokOrderFee: 1.07,
        growthServiceFeeRate: 8.03, shippingServiceFeeRate: 5.5, campaignServiceFeeRate: 4.86,
        shippingCalculationMode: 4, usDirectExtraFee: 2, affiliateCommissionRate: 15, buyerShippingFee: 5, shippingSubsidy: 1, warehouseOperationFee: 2 } };
    const next = applyTiktokUSCrossBorderDefaults(original);
    expect(next.data).toMatchObject({ platformCommissionRate: 6, transactionFeeRate: 0, tiktokOrderFee: 0,
      growthServiceFeeRate: 0, shippingServiceFeeRate: 0, campaignServiceFeeRate: 0,
      shippingCalculationMode: 4, usDirectExtraFee: 2, affiliateCommissionRate: 15, buyerShippingFee: 5, shippingSubsidy: 1, warehouseOperationFee: 2 });
    expect(original.data.transactionFeeRate).toBe(3.21);
    expect(next.id).toBe(original.id);
  });

  it.each([
    { name: '3PF', currency: 'USD', platform: 'tiktok' },
    { name: '跨境', currency: 'MYR', platform: 'tiktok' },
    { name: '跨境', currency: 'USD', platform: 'shopee' },
  ] as const)('retains unrelated node %j', fields => {
    const node: PlatformNode = { id: 'other', ...fields, data: { ...DEFAULT_NODE_DATA } };
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
  });

  it('retains invalid and graph nodes instead of replacing their calculation rules', () => {
    const node = createTiktokNode('USD', 'Other');
    node.name = '跨境';
    node.persistedData = { kind: 'invalid', schemaVersion: 2, rawData: { kind: 'graph', preserved: true } };
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
    node.graphTemplateId = 'graph';
    delete node.persistedData;
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
  });

  it.each(['graphInputValues', 'graphOutputValues', 'graphTemplateId', 'graphTemplateSnapshot'] as const)('does not apply defaults to a partial graph claim: %s', key => {
    const node = { id: 'partial', platform: 'tiktok', currency: 'USD', name: '跨境',
      data: { ...DEFAULT_NODE_DATA }, [key]: undefined } as PlatformNode;
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
  });

  it('skips malformed persisted names without crashing the calculator', () => {
    const stored = { USD: [{ id: 'malformed-name', platform: 'tiktok', currency: 'USD', name: 123,
      data: { ...DEFAULT_NODE_DATA } }] };
    const node = normalizeStoredProfitNodes(stored, 'USD').USD[0];
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
  });

  it('migrates a legacy cross-border site fixed fee once and preserves it through save/reload', () => {
    const legacy: PlatformNode = { id: 'legacy-fixed', name: '跨境', platform: 'tiktok', currency: 'USD', data: { ...DEFAULT_NODE_DATA } };
    const inputs = { ...site, platformInfrastructureFee: 2 };
    const upgraded = upgradeTiktokNode(legacy, inputs, 0.14);
    expect(upgraded.data.tiktokOrderFee).toBe(0.28);
    expect(calc(upgraded, inputs, 0.14).orderFee).toBe(2);
    const loaded = createTemplatePlatformNode({ name: '跨境', country: 'USD', platform: 'tiktok',
      data: JSON.parse(JSON.stringify(serializePlatformNodeTemplateData(upgraded))) }, 'USD');
    expect(applyTiktokUSCrossBorderDefaults(loaded)).toBe(loaded);
    expect(calc(loaded, inputs, 0.14)).toEqual(calc(upgraded, inputs, 0.14));
    expect(legacy.persistedData).toBeUndefined();
  });

  it('keeps edits after the first preset application through JSON and local-state reload', () => {
    const node = createTiktokNode('USD', '跨境');
    node.data.platformCommissionRate = 5;
    node.data.campaignServiceFeeRate = 2;
    node.data.manualShippingFee = 9.45;
    expect(applyTiktokUSCrossBorderDefaults(node)).toBe(node);
    const payload = JSON.parse(JSON.stringify(serializePlatformNodeTemplateData(node)));
    const loaded = createTemplatePlatformNode({ name: '跨境', country: 'US', platform: 'tiktok', data: payload }, 'USD');
    const restored = normalizeStoredProfitNodes({ US: [loaded] }, 'USD').USD[0];
    expect(applyTiktokUSCrossBorderDefaults(restored)).toBe(restored);
    expect(restored.data).toMatchObject({ platformCommissionRate: 5, campaignServiceFeeRate: 2, manualShippingFee: 9.45 });
    expect(calc(restored)).toEqual(calc(node));
  });

  it('matches the official campaign example, ignores platform discounts and charges one fee', () => {
    const node = createTiktokNode('USD', '跨境');
    node.data = { ...node.data, campaignServiceFeeRate: 1, platformCoupon: 20, buyerShippingFee: 5 };
    expect(calc(node)).toMatchObject({ campaignServiceFeeBase: 95, campaignServiceFee: 0.95, serviceFee: 0.95, commission: 5.7 });
    node.data.campaignServiceFeeCap = 0.5;
    expect(calc(node, { ...site, totalRevenue: 1000 }, 0.14).campaignServiceFee).toBeCloseTo(0.5 / 0.14);
  });

  it('keeps target pricing consistent with the shared calculation including campaign buyer shipping', () => {
    const node = createTiktokNode('USD', '跨境');
    node.data = { ...node.data, campaignServiceFeeRate: 1, buyerShippingFee: 5, shippingCalculationMode: 4 };
    const priced = solveTargetProfitPrice({ targetMargin: '25', currency: 'USD', exchangeRate: 0.14, node, globalInputs, siteInputs: site });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.profit).toEqual(calc(node, { ...site, totalRevenue: priced.totalRevenue }, 0.14));
    expect(priced.profit.margin).toBeGreaterThanOrEqual(25);
  });

  it.each(['3pf', 'unsupported', null])('rejects unsupported fee preset profile %s', presetProfile => {
    expect(() => getProfitCalculationContext('tiktok', { tiktokFeePolicy: { version: 1, presetId: 'USD', verifiedAt: '2026-10-04', presetProfile } })).toThrow();
  });
});
