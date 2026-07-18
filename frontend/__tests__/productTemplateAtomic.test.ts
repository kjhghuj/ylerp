import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    buildProductTemplateMutations,
    buildDefaultProductTemplatePayload,
    type AtomicProductTemplateCreateRequest,
    type AtomicProductTemplateSaveResponse,
    type AtomicProductTemplateUpdateRequest,
} from '../modules/profit/productTemplateAtomic';
import {
  DEFAULT_NODE_DATA,
  type PlatformNode,
  type ProductProfitTemplate,
  type ProfitTemplate,
} from '../modules/profit/types';
import { createExchangeRateSnapshot } from '../modules/profit/exchangeRateSnapshot';

describe('atomic product/template request construction', () => {
  const taxes = { vatRate: -5, corporateIncomeTaxRate: 125 };

  it('creates every new node without reading or deleting unrelated links', () => {
    const nodes: PlatformNode[] = [{
      id: 'new-node',
      platform: 'lazada',
      currency: 'SGD',
      name: 'Lazada SG',
      data: { ...DEFAULT_NODE_DATA, extraShippingFee: 6 },
      persistedData: {
        kind: 'standard',
        schemaVersion: 2,
        nodeData: { extraShippingFee: 2 },
        extraData: { futureOption: ['keep'] },
      },
    }];

    expect(buildProductTemplateMutations(nodes, [], [], taxes)).toEqual([{
      operation: 'create',
      templateId: null,
      name: 'Lazada SG',
      country: 'SGD',
      platform: 'lazada',
      type: 'profit',
      data: expect.objectContaining({
        kind: 'standard',
        schemaVersion: 2,
        extraShippingFee: 6,
        vatRate: -5,
        corporateIncomeTaxRate: 125,
        futureOption: ['keep'],
      }),
    }]);
  });

  it('attaches the matching save-time exchange-rate snapshot to standard product templates', () => {
    const snapshot = createExchangeRateSnapshot(0.65, new Date('2026-07-18T08:00:00.000Z'));
    const nodes: PlatformNode[] = [{
      id: 'snapshot-node',
      platform: 'shopee',
      currency: 'MYR',
      name: 'MY snapshot',
      data: { ...DEFAULT_NODE_DATA },
    }];

    const [mutation] = buildProductTemplateMutations(
      nodes,
      [],
      [],
      taxes,
      { MYR: snapshot },
    );

    expect(mutation.data).toEqual(expect.objectContaining(snapshot));
  });

  it('updates a matched link, preserves shared-template identity, and omits unmatched links', () => {
    const node: PlatformNode = {
      id: 'node-1',
      productTemplateLinkId: 'link-1',
      templateId: 'shared-1',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Shopee MY',
      data: { ...DEFAULT_NODE_DATA, baseShippingFee: 8 },
    };
    const existingLinks: ProductProfitTemplate[] = [
      {
        id: 'link-1',
        productId: 'product-1',
        templateId: 'shared-1',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
      },
      {
        id: 'unmentioned-link',
        productId: 'product-1',
        templateId: null,
        name: 'Keep me',
        country: 'SGD',
        platform: 'other',
        data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
      },
    ];
    const sharedTemplates: ProfitTemplate[] = [{
      id: 'shared-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee',
      data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
    }];

    expect(buildProductTemplateMutations(
      [node],
      existingLinks,
      sharedTemplates,
      taxes,
    )).toEqual([expect.objectContaining({
      operation: 'update',
      linkId: 'link-1',
      templateId: 'shared-1',
    })]);
  });

  it('rejects two mutations that target the same existing link', () => {
    const existingLink: ProductProfitTemplate = {
      id: 'duplicate-link',
      productId: 'product-1',
      templateId: null,
      name: 'Same',
      country: 'MYR',
      platform: 'shopee',
      data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
    };
    const nodes: PlatformNode[] = ['node-a', 'node-b'].map(id => ({
      id,
      productTemplateLinkId: 'duplicate-link',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Same',
      data: { ...DEFAULT_NODE_DATA },
    }));

    expect(() => buildProductTemplateMutations(nodes, [existingLink], [], taxes))
      .toThrow(/same product-template link/i);
  });

  it('builds the default template with the existing default data and tax semantics', () => {
    expect(buildDefaultProductTemplatePayload('Product', 'MYR', taxes)).toEqual({
      templateId: null,
      name: 'Product',
      country: 'MYR',
      platform: 'other',
      type: 'profit',
      data: expect.objectContaining({
        kind: 'standard',
        schemaVersion: 2,
        vatRate: -5,
        corporateIncomeTaxRate: 125,
      }),
    });
  });

  it('attaches a save-time exchange-rate snapshot to a generated default template', () => {
    const snapshot = createExchangeRateSnapshot(0.65, new Date('2026-07-18T08:00:00.000Z'));

    expect(buildDefaultProductTemplatePayload('Product', 'MYR', taxes, snapshot).data)
      .toEqual(expect.objectContaining(snapshot));
  });

  it('represents aggregate response templates as raw API DTOs', () => {
    const response = {
      product: {
        id: 'product-1',
        name: 'Product',
        sku: 'SKU-1',
        country: 'MY' as const,
        sites: ['MY' as const],
        cost: 10,
        productWeight: 100,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
      },
      productTemplates: [{
        id: 'link-1',
        productId: 'product-1',
        templateId: null,
        name: 'Flat serializer data',
        country: 'MYR',
        platform: 'shopee',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
        data: {
          kind: 'standard',
          schemaVersion: 2,
          firstWeight: 50,
          vatRate: 1,
        },
      }],
    } satisfies AtomicProductTemplateSaveResponse;

    expect(response.productTemplates[0].data).toEqual(expect.objectContaining({
      firstWeight: 50,
    }));
    expectTypeOf<AtomicProductTemplateSaveResponse['productTemplates'][number]['data']>()
      .toEqualTypeOf<unknown>();
  });

  it('requires complete create sites and exactly one update site at compile time', () => {
    const productWithoutSites = {
      name: 'Product',
      sku: 'SKU-1',
      country: 'MY' as const,
      cost: 10,
      productWeight: 100,
      supplierTaxPoint: 0,
      supplierInvoice: 'no' as const,
    };
    const invalidCreate: AtomicProductTemplateCreateRequest = {
      // @ts-expect-error aggregate creates require initial sites and siteData
      product: productWithoutSites,
      templateMutations: [],
    };
    const validCreate: AtomicProductTemplateCreateRequest = {
      product: {
        ...productWithoutSites,
        sites: ['MY'],
        siteData: { MY: { totalRevenue: 1 } },
      },
      templateMutations: [],
    };

    const updateProduct = productWithoutSites;
    const invalidEmptyPatch: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      sitePatch: {
        // @ts-expect-error aggregate updates patch exactly one site
        sites: [],
        // @ts-expect-error an empty patch cannot provide its required matching key
        siteData: {},
      },
    };
    const invalidMultiSitePatch: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      sitePatch: {
        // @ts-expect-error aggregate updates cannot patch multiple sites
        sites: ['MY', 'PH'],
        // @ts-expect-error siteData cannot contain multiple keys either
        siteData: { MY: {}, PH: {} },
      },
    };
    const validUpdate: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      sitePatch: {
        sites: ['MY'],
        siteData: { MY: { totalRevenue: 2 } },
      },
    };
    const invalidMissingSiteData: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      // @ts-expect-error the siteData key must match the tuple site
      sitePatch: { sites: ['MY'], siteData: {} },
    };
    const invalidWrongSiteData: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      // @ts-expect-error PH data cannot accompany a MY-only patch
      sitePatch: { sites: ['MY'], siteData: { PH: {} } },
    };
    const invalidExtraSiteData: AtomicProductTemplateUpdateRequest = {
      product: updateProduct,
      templateMutations: [],
      // @ts-expect-error a single-site patch cannot contain an extra site key
      sitePatch: { sites: ['MY'], siteData: { MY: {}, PH: {} } },
    };

    expect(validCreate.product.sites).toEqual(['MY']);
    expect(validUpdate.sitePatch.sites).toEqual(['MY']);
    void invalidCreate;
    void invalidEmptyPatch;
    void invalidMultiSitePatch;
    void invalidMissingSiteData;
    void invalidWrongSiteData;
    void invalidExtraSiteData;
  });
});
