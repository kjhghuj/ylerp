import type { Page } from '@playwright/test';
import { installFixtures } from './fixtures';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type PlatformNode } from '../modules/profit/types';
import { createTiktokNode } from '../modules/profit/tiktokFeePolicy';

export const standardNodes = (stress = false): PlatformNode[] => ['3PF', '官方仓', '跨境'].map((name, index) => ({
  id: `layout-shopee-${index + 1}`, platform: 'shopee', currency: 'MYR',
  name: stress && index === 1 ? `官方仓超长节点名称用于验证手机和电脑下换行${'长名称'.repeat(9)}_LONG_ASCII_${'SNAPSHOT'.repeat(8)}` : name,
  data: { ...DEFAULT_NODE_DATA, platformCommissionRate: index === 1 ? 15.12 : 18.36,
    transactionFeeRate: 3.78, damageReturnRate: 3, baseShippingFee: 0.39,
    crossBorderFee: index === 2 ? 0 : 1.96, warehouseOperationFee: stress && index === 2 ? 200_000_000 : 2.45 },
}));

export function tiktokNodes(): Record<string, PlatformNode[]> {
  const result: Record<string, PlatformNode[]> = {};
  for (const currency of ['MYR', 'SGD', 'THB', 'PHP', 'USD']) {
    const node = createTiktokNode(currency, currency === 'USD' ? '跨境' : `TikTok ${currency}`);
    node.id = `layout-tiktok-${currency}`;
    node.data = { ...node.data, platformCommissionRate: 6, affiliateCommissionRate: 3,
      shippingCalculationMode: currency === 'USD' ? 3 : 2, manualShippingFee: 5,
      campaignServiceFeeRate: 2.25, campaignServiceFeeCap: 17,
      growthServiceFeeRate: 2.5, growthServiceFeeCap: 199,
      usHeadFreightFee: 10, usHeadFreightRatePerKg: 50, usHeadFreightConfigured: 1,
      usLocalDeliveryMode: 2, usDestinationRegion: 1, usPackageLengthCm: 20,
      usPackageWidthCm: 15, usPackageHeightCm: 10, usShippingDate: 20261026 };
    node.persistedData = { kind: 'standard', schemaVersion: 2, nodeData: { ...node.data },
      extraData: { ...node.persistedData?.extraData } };
    result[currency] = [node];
  }
  return result;
}

export async function installProfitNodes(page: Page, { dark = false, stress = false, tiktok = false, empty = false } = {}) {
  const state = await installFixtures(page, { dark });
  const nodes = empty ? {} : tiktok ? tiktokNodes() : { MYR: standardNodes(stress) };
  const siteInputs = Object.fromEntries(['MYR', 'SGD', 'THB', 'PHP', 'USD'].map(currency => [currency, {
    ...DEFAULT_SITE_INPUTS, totalRevenue: stress ? 99_999_999.99 : 323.4,
  }]));
  await page.addInitScript(({ nodes, siteInputs }) => {
    localStorage.setItem('yl-profit-site-country', 'MYR');
    localStorage.setItem('yl-profit-global-inputs', JSON.stringify({ name: '布局验收商品', sku: 'LAYOUT-001',
      purchaseCost: 138, productWeight: 850, supplierTaxPoint: 0, supplierInvoice: 'no', vatRate: 1, corporateIncomeTaxRate: 5 }));
    localStorage.setItem('yl-profit-nodes', JSON.stringify(nodes));
    localStorage.setItem('yl-profit-site-inputs', JSON.stringify(siteInputs));
  }, { nodes, siteInputs });
  const templateWrites: Record<string, unknown>[] = [];
  await page.route('**/api/templates', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    templateWrites.push(body);
    return route.fulfill({ json: { ...body, id: `fixture-template-${templateWrites.length}` } });
  });
  return { ...state, templateWrites };
}
