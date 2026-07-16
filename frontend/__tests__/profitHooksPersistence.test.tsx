import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfitImport } from '../modules/profit/useProfitImport';
import { useProductActions } from '../modules/profit/useProductActions';
import { toProductTemplateImportNode } from '../modules/productTemplateImport';
import { DEFAULT_PRODUCT_TAX_RATES } from '../modules/productTaxRates';
import {
  DEFAULT_NODE_DATA,
  DEFAULT_SITE_INPUTS,
  type PlatformNode,
  type ProductProfitTemplate,
  type SiteLevelInputs,
} from '../modules/profit/types';

const testState = vi.hoisted(() => ({
  store: null as unknown,
  showToast: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../StoreContext', () => ({
  useStore: () => testState.store,
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast: testState.showToast }),
}));

vi.mock('../src/api', () => ({
  default: testState.api,
}));

const strings = {
  profit: {
    templates: {
      importedData: 'Imported',
      unnamedNode: 'Unnamed',
      saved: 'Saved',
      defaultTemplate: 'Default',
    },
    errors: {
      templateSaveFailed: 'Template save failed',
      templateDbFailed: 'Template db failed',
      templateDeleteFailed: 'Template delete failed',
      defaultTemplateSaveFailed: 'Default template failed',
      nameAndSkuRequired: 'Name and SKU required',
      noIdReturned: 'No id',
      saveFailed: 'Save failed',
    },
    actions: {
      updated: 'Updated',
      saved: 'Saved product',
    },
  },
};

const baseStore = () => ({
  calculatorImport: null,
  setCalculatorImport: vi.fn(),
  calculatorImportNodes: [],
  setCalculatorImportNodes: vi.fn(),
  setProfitGlobalInputs: vi.fn(),
  setProfitSiteCurrency: vi.fn(),
  profitSiteCurrency: 'MYR',
  setProfitNodes: vi.fn(),
  setProfitEditingProductId: vi.fn(),
  strings,
  addProduct: vi.fn(),
  updateProduct: vi.fn(),
  products: [],
  profitGlobalInputs: {
    name: 'Product',
    sku: 'SKU-1',
    purchaseCost: 10,
    productWeight: 100,
    supplierTaxPoint: 0,
    supplierInvoice: 'no' as const,
    vatRate: 1,
    corporateIncomeTaxRate: 5,
  },
  profitNodes: {
    MYR: [],
    SGD: [],
    PHP: [],
    THB: [],
    IDR: [],
  },
  setProfitGlobalInputsMap: vi.fn(),
  profitEditingProductId: null,
});

describe('useProfitImport persistence compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      productCountry: '',
      currentCurrency: 'TH',
      siteData: { TH: { totalRevenue: 88, adROI: 7 } },
      expectedCurrency: 'THB',
      expectedRevenue: 88,
    },
    {
      productCountry: 'MYR',
      currentCurrency: 'THB',
      siteData: { MY: { totalRevenue: 66, adROI: 9 } },
      expectedCurrency: 'MYR',
      expectedRevenue: 66,
    },
  ])('uses canonical $expectedCurrency siteData in the actual hook flow', async ({
    productCountry,
    currentCurrency,
    siteData,
    expectedCurrency,
    expectedRevenue,
  }) => {
    const setSiteInputsMap = vi.fn();
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-1',
        name: 'Imported Product',
        sku: 'SKU-I',
        country: productCountry,
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData,
      },
      profitSiteCurrency: currentCurrency,
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS }, THB: { ...DEFAULT_SITE_INPUTS } },
      setSiteInputsMap,
    ));

    await waitFor(() => expect(store.setProfitSiteCurrency).toHaveBeenCalledWith(expectedCurrency));
    expect(setSiteInputsMap).toHaveBeenCalledTimes(1);
    const update = setSiteInputsMap.mock.calls[0][0] as (
      previous: Record<string, SiteLevelInputs>,
    ) => Record<string, SiteLevelInputs>;
    expect(update({} as Record<string, SiteLevelInputs>)[expectedCurrency]).toEqual(
      expect.objectContaining({ totalRevenue: expectedRevenue }),
    );
  });

  it('rejects a non-empty unsupported product site without creating or saving nodes and shows an error', async () => {
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-vn',
        name: 'Unsupported Product',
        sku: 'SKU-VN',
        country: 'VN',
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
      },
      calculatorImportNodes: [{
        id: 'link-vn',
        name: 'VN node',
        country: 'VN',
        platform: 'shopee',
        data: {
          kind: 'standard' as const,
          schemaVersion: 2,
          nodeData: { firstWeight: 0 },
          extraData: {},
        },
      }],
      profitSiteCurrency: 'MYR',
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await waitFor(() => expect(testState.showToast).toHaveBeenCalledWith(
      'Template save failed',
      'error',
    ));
    expect(store.setProfitNodes).not.toHaveBeenCalled();
    expect(store.setProfitSiteCurrency).not.toHaveBeenCalled();
    expect(store.setProfitGlobalInputs).not.toHaveBeenCalled();
    expect(store.setCalculatorImport).toHaveBeenCalledWith(null);
  });

  it.each([
    {
      label: 'canonical zero',
      productTax: { vatRate: 0, corporateIncomeTaxRate: 0 },
      expected: { vatRate: 0, corporateIncomeTaxRate: 0 },
    },
    {
      label: 'canonical negative historical semantics',
      productTax: { vatRate: -5, corporateIncomeTaxRate: 125 },
      expected: { vatRate: -5, corporateIncomeTaxRate: 125 },
    },
    {
      label: 'legacy template fallback',
      productTax: {},
      expected: { vatRate: 6, corporateIncomeTaxRate: 10 },
    },
  ])('loads $label tax rates into the actual calculator import flow', async ({
    productTax,
    expected,
  }) => {
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-tax',
        name: 'Tax Product',
        sku: 'SKU-TAX',
        country: 'MY',
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
        ...productTax,
      },
      calculatorImportNodes: [toProductTemplateImportNode({
        id: 'link-tax',
        productId: 'product-tax',
        name: 'MY tax node',
        country: 'MYR',
        platform: 'shopee',
        data: { vatRate: 6, corporateIncomeTaxRate: 10 },
      })],
      profitSiteCurrency: 'MYR',
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await waitFor(() => expect(store.setProfitGlobalInputs).toHaveBeenCalledTimes(1));
    const update = store.setProfitGlobalInputs.mock.calls[0][0] as (
      previous: ReturnType<typeof baseStore>['profitGlobalInputs'],
    ) => ReturnType<typeof baseStore>['profitGlobalInputs'];
    expect(update(baseStore().profitGlobalInputs)).toEqual(expect.objectContaining(expected));
  });

  it('uses strict raw persisted legacy candidates and skips invalid templates in stable order', async () => {
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-raw-tax',
        name: 'Raw Tax Product',
        sku: 'SKU-RAW-TAX',
        country: 'MY',
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
      },
      calculatorImportNodes: [
        toProductTemplateImportNode({
          id: 'invalid-flat',
          productId: 'product-raw-tax',
          name: 'Invalid flat',
          country: 'MYR',
          platform: 'shopee',
          data: {
            vatRate: '0x10',
            corporateIncomeTaxRate: '',
          },
        }),
        toProductTemplateImportNode({
          id: 'invalid-more',
          productId: 'product-raw-tax',
          name: 'Invalid more',
          country: 'MYR',
          platform: 'shopee',
          data: {
            vatRate: true,
            corporateIncomeTaxRate: '1e-999999',
          },
        }),
        toProductTemplateImportNode({
          id: 'valid-second',
          productId: 'product-raw-tax',
          name: 'Valid historical',
          country: 'MYR',
          platform: 'shopee',
          data: {
            vatRate: '-6',
            corporateIncomeTaxRate: '1.25e2',
          },
        }),
      ],
      profitSiteCurrency: 'MYR',
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await waitFor(() => expect(store.setProfitGlobalInputs).toHaveBeenCalledTimes(1));
    const update = store.setProfitGlobalInputs.mock.calls[0][0] as (
      previous: ReturnType<typeof baseStore>['profitGlobalInputs'],
    ) => ReturnType<typeof baseStore>['profitGlobalInputs'];
    expect(update(baseStore().profitGlobalInputs)).toEqual(expect.objectContaining({
      vatRate: -6,
      corporateIncomeTaxRate: 125,
    }));
  });

  it('uses defaults when all raw persisted legacy tax candidates are invalid', async () => {
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-invalid-tax',
        name: 'Invalid Tax Product',
        sku: 'SKU-INVALID-TAX',
        country: 'MY',
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
      },
      calculatorImportNodes: [
        toProductTemplateImportNode({
          id: 'invalid-only',
          productId: 'product-invalid-tax',
          name: 'Invalid only',
          country: 'MYR',
          platform: 'shopee',
          data: {
            vatRate: '0x10',
            corporateIncomeTaxRate: '1e-999999',
          },
        }),
      ],
      profitSiteCurrency: 'MYR',
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await waitFor(() => expect(store.setProfitGlobalInputs).toHaveBeenCalledTimes(1));
    const update = store.setProfitGlobalInputs.mock.calls[0][0] as (
      previous: ReturnType<typeof baseStore>['profitGlobalInputs'],
    ) => ReturnType<typeof baseStore>['profitGlobalInputs'];
    expect(update(baseStore().profitGlobalInputs)).toEqual(expect.objectContaining(
      DEFAULT_PRODUCT_TAX_RATES,
    ));
  });
});

describe('useProductActions persistence payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects directly saving an invalid imported payload as a shared template', async () => {
    const invalidRaw = {
      kind: 'future-template',
      schemaVersion: 99,
      firstWeight: 'recover-me',
      future: { nested: true },
    };
    const node: PlatformNode = {
      id: 'node-invalid',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Invalid imported node',
      data: { ...DEFAULT_NODE_DATA, firstWeight: 999 },
      persistedData: {
        kind: 'invalid',
        schemaVersion: 99,
        rawData: invalidRaw,
      },
    };
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
    };
    testState.api.post.mockResolvedValue({ data: { id: 'shared-1' } });

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Shared copy');
    });

    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Template save failed', 'error');
  });

  it('saves canonical product tax fields, including negative historical values, before template compatibility copies', async () => {
    const addProduct = vi.fn().mockResolvedValue({ id: 'product-tax-new' });
    testState.store = {
      ...baseStore(),
      addProduct,
      profitGlobalInputs: {
        ...baseStore().profitGlobalInputs,
        vatRate: -5,
        corporateIncomeTaxRate: 125,
      },
    };
    testState.api.get.mockResolvedValue({ data: [] });
    testState.api.post.mockResolvedValue({ data: { id: 'default-link' } });

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(addProduct).toHaveBeenCalledWith(expect.objectContaining({
      vatRate: -5,
      corporateIncomeTaxRate: 125,
    }));
  });

  it('does not update or directly save an invalid compatibility node', async () => {
    const invalidRaw = {
      kind: 'future-template',
      schemaVersion: 99,
      firstWeight: 'recover-me',
    };
    const node: PlatformNode = {
      id: 'node-invalid-readonly',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Invalid imported node',
      data: { ...DEFAULT_NODE_DATA, firstWeight: 3 },
      persistedData: {
        kind: 'invalid',
        schemaVersion: 99,
        rawData: invalidRaw,
      },
    };
    const setProfitNodes = vi.fn();
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      setProfitNodes,
    };

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    act(() => {
      result.current.handleUpdateNode(node.id, { firstWeight: 9 });
    });
    const update = setProfitNodes.mock.calls[0][0] as (
      previous: Record<string, PlatformNode[]>,
    ) => Record<string, PlatformNode[]>;
    expect(update({ MYR: [node] }).MYR[0]).toEqual(node);

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Must reject');
    });
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Template save failed', 'error');
  });

  it('still syncs an invalid compatibility node to its product link without rewriting raw data', async () => {
    const invalidRaw = {
      kind: 'future-template',
      schemaVersion: 99,
      firstWeight: 'recover-me',
      future: { nested: true },
    };
    const node: PlatformNode = {
      id: 'node-invalid-sync',
      productTemplateLinkId: 'link-invalid',
      templateId: 'shared-invalid',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Invalid imported node',
      data: { ...DEFAULT_NODE_DATA, firstWeight: 3 },
      persistedData: {
        kind: 'invalid',
        schemaVersion: 99,
        rawData: invalidRaw,
      },
    };
    const existingLink: ProductProfitTemplate = {
      id: 'link-invalid',
      productId: 'product-1',
      templateId: 'shared-invalid',
      name: 'Invalid imported node',
      country: 'MYR',
      platform: 'shopee',
      data: node.persistedData!,
    };
    testState.store = {
      ...baseStore(),
      products: [{
        id: 'product-1',
        name: 'Product',
        sku: 'SKU-1',
        country: 'MY' as const,
        sites: ['MY' as const],
        cost: 10,
        productWeight: 100,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
      }],
      profitNodes: { MYR: [node] },
      profitEditingProductId: 'product-1',
    };
    testState.api.get.mockResolvedValue({ data: [existingLink] });
    testState.api.put.mockResolvedValue({ data: existingLink });

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(testState.api.put).toHaveBeenCalledWith(
      '/products/product-1/templates/link-invalid',
      expect.objectContaining({
        templateId: 'shared-invalid',
        data: invalidRaw,
      }),
    );
  });

  it('rejects adding an unsupported-site shared template and shows an error', () => {
    const setProfitNodes = vi.fn();
    testState.store = {
      ...baseStore(),
      setProfitNodes,
    };
    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    act(() => {
      result.current.handleAddNodeFromTemplate({
        id: 'shared-vn',
        name: 'VN shared',
        country: 'VN',
        platform: 'shopee',
        data: { firstWeight: 0 },
      });
    });

    expect(setProfitNodes).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Template save failed', 'error');
  });

  it('uses the same serializer for the actual product-template PUT body', async () => {
    const node: PlatformNode = {
      id: 'node-standard',
      productTemplateLinkId: 'link-1',
      templateId: 'shared-1',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Shopee MY',
      data: { ...DEFAULT_NODE_DATA, baseShippingFee: 8 },
      persistedData: {
        kind: 'standard',
        schemaVersion: 2,
        nodeData: { baseShippingFee: 3 },
        extraData: { futureOption: { preserve: true } },
      },
    };
    const existingLink: ProductProfitTemplate = {
      id: 'link-1',
      productId: 'product-1',
      templateId: 'shared-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee',
      data: node.persistedData!,
    };
    const store = {
      ...baseStore(),
      products: [{
        id: 'product-1',
        name: 'Product',
        sku: 'SKU-1',
        country: 'MY' as const,
        sites: ['MY' as const],
        cost: 10,
        productWeight: 100,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: {},
      }],
      profitNodes: { MYR: [node] },
      profitEditingProductId: 'product-1',
    };
    testState.store = store;
    testState.api.get.mockResolvedValue({ data: [existingLink] });
    testState.api.put.mockResolvedValue({ data: existingLink });

    const { result } = renderHook(() => useProductActions(
      [{
        id: 'shared-1',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: { ...DEFAULT_NODE_DATA },
      }],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(testState.api.put).toHaveBeenCalledWith(
      '/products/product-1/templates/link-1',
      expect.objectContaining({
        templateId: 'shared-1',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: expect.objectContaining({
          kind: 'standard',
          schemaVersion: 2,
          baseShippingFee: 8,
          vatRate: 1,
          corporateIncomeTaxRate: 5,
          futureOption: { preserve: true },
        }),
      }),
    );
  });

  it('uses the same serializer for the actual product-template POST body', async () => {
    const node: PlatformNode = {
      id: 'node-new',
      platform: 'lazada',
      currency: 'SGD',
      name: 'Lazada SG',
      data: { ...DEFAULT_NODE_DATA, extraShippingFee: 6 },
      persistedData: {
        kind: 'standard',
        schemaVersion: 2,
        nodeData: { extraShippingFee: 2 },
        extraData: { futurePostOption: ['keep'] },
      },
    };
    const store = {
      ...baseStore(),
      profitSiteCurrency: 'SGD',
      profitNodes: { SGD: [node] },
      addProduct: vi.fn().mockResolvedValue({ id: 'product-new' }),
    };
    testState.store = store;
    testState.api.get.mockResolvedValue({ data: [] });
    testState.api.post.mockResolvedValue({ data: { id: 'link-new' } });

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { SGD: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(testState.api.post).toHaveBeenCalledWith(
      '/products/product-new/templates',
      expect.objectContaining({
        templateId: null,
        name: 'Lazada SG',
        country: 'SGD',
        platform: 'lazada',
        type: 'profit',
        data: expect.objectContaining({
          kind: 'standard',
          schemaVersion: 2,
          extraShippingFee: 6,
          futurePostOption: ['keep'],
        }),
      }),
    );
  });
});
