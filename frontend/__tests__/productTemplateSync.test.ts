import { describe, expect, it } from 'vitest';
import { findExistingProductTemplateLink, resolveTemplateIdForPayload } from '../modules/profit/productTemplateSync';

describe('product template sync helpers', () => {
  const links = [
    {
      id: 'product-link-1',
      productId: 'product-1',
      templateId: 'shared-template-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee' as const,
      data: {} as any,
    },
  ];
  const sharedTemplates = [
    {
      id: 'shared-template-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee' as const,
      data: {} as any,
    },
  ];

  it('treats a legacy node templateId that points to a product link as the existing link', () => {
    const link = findExistingProductTemplateLink(
      {
        id: 'node-1',
        templateId: 'product-link-1',
        platform: 'shopee',
        currency: 'MYR',
        name: 'Shopee MY',
        data: {} as any,
      },
      links,
    );

    expect(link?.id).toBe('product-link-1');
  });

  it('preserves the shared template id when updating a legacy imported product link', () => {
    const sourceId = resolveTemplateIdForPayload('product-link-1', links[0], sharedTemplates);

    expect(sourceId).toBe('shared-template-1');
  });

  it('drops an unknown template id instead of sending it to the backend as a shared template', () => {
    const sourceId = resolveTemplateIdForPayload('unknown-old-id', undefined, sharedTemplates);

    expect(sourceId).toBeNull();
  });
});
