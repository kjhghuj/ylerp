import { describe, expect, it } from 'vitest';
import { findExistingProductTemplateLink, resolveTemplateIdForPayload } from '../modules/profit/productTemplateSync';
import { DEFAULT_NODE_DATA } from '../modules/profit/types';

describe('product template sync helpers', () => {
  const links = [
    {
      id: 'product-link-1',
      productId: 'product-1',
      templateId: 'shared-template-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee' as const,
      data: {
        kind: 'standard' as const,
        schemaVersion: 2,
        nodeData: {},
        extraData: {},
      },
    },
  ];
  const sharedTemplates = [
    {
      id: 'shared-template-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee' as const,
      data: {},
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
        data: { ...DEFAULT_NODE_DATA },
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

  it('prefers an exact product link id over an earlier fuzzy match', () => {
    const exact = { ...links[0], id: 'exact-link' };
    const fuzzy = { ...links[0], id: 'fuzzy-link' };
    const link = findExistingProductTemplateLink({
      id: 'node-exact',
      productTemplateLinkId: 'exact-link',
      templateId: 'shared-template-1',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Shopee MY',
      data: { ...DEFAULT_NODE_DATA },
    }, [fuzzy, exact]);

    expect(link?.id).toBe('exact-link');
  });

  it.each([
    ['MY', 'MYR'],
    ['MYR', 'MY'],
    ['SG', 'SGD'],
    ['sgd', 'sg'],
  ])('matches a legacy %s link to a %s runtime node without creating a duplicate', (linkCountry, nodeCurrency) => {
    const link = findExistingProductTemplateLink({
      id: 'node-country-alias',
      templateId: 'shared-template-1',
      platform: 'shopee',
      currency: nodeCurrency,
      name: 'Shopee MY',
      data: { ...DEFAULT_NODE_DATA },
    }, [{
      ...links[0],
      country: linkCountry,
    }]);

    expect(link?.id).toBe('product-link-1');
  });
});
