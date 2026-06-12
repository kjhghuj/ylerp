import { describe, expect, it, vi } from 'vitest';
import { loadProductTemplateImportNodes } from '../modules/productTemplateImport';

describe('loadProductTemplateImportNodes', () => {
  it('loads every template saved for the active product and site', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'link-1',
            templateId: 'shared-1',
            productId: 'product-1',
            name: 'Shopee MY',
            country: 'MYR',
            platform: 'shopee',
            data: { platformCommissionRate: '6', baseShippingFee: 1.5 },
          },
          {
            id: 'link-2',
            templateId: 'shared-2',
            productId: 'product-1',
            name: 'Lazada MY',
            country: 'MY',
            platform: 'lazada',
            data: { platformCommissionRate: 4, firstWeight: '50' },
          },
          {
            id: 'link-sg',
            templateId: 'shared-sg',
            productId: 'product-1',
            name: 'Shopee SG',
            country: 'SGD',
            platform: 'shopee',
            data: { platformCommissionRate: 3 },
          },
        ],
      }),
    };

    const nodes = await loadProductTemplateImportNodes(api, 'product-1', 'MY');

    expect(api.get).toHaveBeenCalledWith('/products/product-1/templates');
    expect(nodes).toHaveLength(2);
    expect(nodes).toEqual([
      expect.objectContaining({
        id: 'link-1',
        productTemplateLinkId: 'link-1',
        templateId: 'shared-1',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: expect.objectContaining({ platformCommissionRate: 6, baseShippingFee: 1.5 }),
      }),
      expect.objectContaining({
        id: 'link-2',
        productTemplateLinkId: 'link-2',
        templateId: 'shared-2',
        name: 'Lazada MY',
        country: 'MY',
        platform: 'lazada',
        data: expect.objectContaining({ platformCommissionRate: 4, firstWeight: 50 }),
      }),
    ]);
  });
});
