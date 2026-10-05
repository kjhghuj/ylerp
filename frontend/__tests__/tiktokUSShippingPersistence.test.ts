import { describe, expect, it } from 'vitest';
import { calculateProfit } from '../modules/profit/calculateProfit';
import { createTiktokNode, getProfitCalculationContext } from '../modules/profit/tiktokFeePolicy';
import { createTemplatePlatformNode } from '../modules/profit/platformNodeFactory';
import { normalizeStoredProfitNodes } from '../modules/profit/profitPersistence';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
import { quoteTiktokUSShipping } from '../modules/profit/tiktokUSShipping';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type PlatformNode } from '../modules/profit/types';

const globalInputs = { name: 'US parcel', sku: 'US-1', purchaseCost: 10, productWeight: 100,
  supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 };
const siteInputs = { ...DEFAULT_SITE_INPUTS, totalRevenue: 200, adROI: 0 };
const profit = (node: PlatformNode) => calculateProfit(node.data, globalInputs, siteInputs, 0.14, 'USD',
  getProfitCalculationContext(node.platform, node.persistedData));

describe('US shipping JSON persistence', () => {
  it.each([1, 2, 3, 4])('preserves segmented local delivery mode %s, its quote and profit through save and reload', localMode => {
    const node = createTiktokNode('USD', 'US parcel');
    node.data = { ...node.data, shippingCalculationMode: 3, usHeadFreightFee: 2.455,
      usHeadFreightRatePerKg: 6.123, usHeadFreightConfigured: 1, usLocalDeliveryMode: localMode,
      lastMileFee: 4.205, usDestinationRegion: 1, usPackageLengthCm: 10,
      usPackageWidthCm: 5, usPackageHeightCm: 5, usShippingDate: 20261005,
      buyerShippingFee: 1, shippingSubsidy: 0.5, manualShippingFee: 99,
      baseShippingFee: 99, extraShippingFee: 99, crossBorderFee: 99 };
    const payload = JSON.parse(JSON.stringify(serializePlatformNodeTemplateData(node)));
    const imported = createTemplatePlatformNode({ country: 'US', name: node.name ?? 'US', platform: 'tiktok', data: payload }, 'USD');
    const localStoragePayload = JSON.parse(JSON.stringify({ US: [imported] }));
    const reloaded = normalizeStoredProfitNodes(localStoragePayload, 'USD').USD[0];

    expect(serializePlatformNodeTemplateData(reloaded)).toEqual(payload);
    expect(quoteTiktokUSShipping(reloaded.data, globalInputs.productWeight)).toEqual(
      quoteTiktokUSShipping(node.data, globalInputs.productWeight),
    );
    expect(profit(reloaded)).toEqual(profit(node));
    expect(profit(reloaded).actualShippingFee).toBeCloseTo(
      quoteTiktokUSShipping(node.data, globalInputs.productWeight).totalFeeLocal / 0.14,
    );
  });

  it('keeps a USD manual total and dormant segmented settings through mode changes and reload', () => {
    const node = createTiktokNode('USD', 'US manual');
    node.data = { ...node.data, shippingCalculationMode: 2, manualShippingFee: 7.25,
      usHeadFreightFee: 9, usHeadFreightRatePerKg: 20, usHeadFreightConfigured: 1,
      usLocalDeliveryMode: 4, usPackageLengthCm: 20, usPackageWidthCm: 15,
      usPackageHeightCm: 10, usShippingDate: 20261004, lastMileFee: 40 };
    const before = profit(node);
    const payload = JSON.parse(JSON.stringify(serializePlatformNodeTemplateData(node)));
    const loaded = createTemplatePlatformNode({ country: 'USD', name: 'US manual', platform: 'tiktok', data: payload }, 'USD');
    expect(profit(loaded)).toEqual(before);
    expect(profit(loaded).actualShippingFee).toBeCloseTo(7.25 / 0.14);
    expect(loaded.data).toMatchObject({ usHeadFreightFee: 9, usHeadFreightRatePerKg: 20,
      usLocalDeliveryMode: 4, usPackageHeightCm: 10, lastMileFee: 40 });
    loaded.data.shippingCalculationMode = 3;
    expect(profit(loaded).actualShippingFee).toBeCloseTo(11 / 0.14);
    loaded.data.shippingCalculationMode = 2;
    expect(profit(loaded)).toEqual(before);
  });

  it('does not switch legacy USD templates to segmented shipping or add new costs on reload', () => {
    const legacyData = { platformCommissionRate: 6, baseShippingFee: 5, extraShippingFee: 0.5,
      crossBorderFee: 2, lastMileFee: 1, baseWeight: 50, manualShippingFee: 99 };
    const legacy = createTemplatePlatformNode({ country: 'US', name: 'Old US', platform: 'tiktok', data: legacyData }, 'USD');
    expect(legacy.data.shippingCalculationMode).toBe(0);
    expect(legacy.data.usHeadFreightConfigured).toBe(DEFAULT_NODE_DATA.usHeadFreightConfigured);
    const before = profit(legacy);
    const saved = serializePlatformNodeTemplateData(legacy);
    const loaded = createTemplatePlatformNode({ country: 'USD', name: 'Old US', platform: 'tiktok', data: JSON.parse(JSON.stringify(saved)) }, 'USD');
    expect(profit(loaded)).toEqual(before);
    expect(getProfitCalculationContext(loaded.platform, loaded.persistedData).tiktokFeePolicy).toBeUndefined();
  });
});
