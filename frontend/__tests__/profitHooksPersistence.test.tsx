import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfitImport } from '../modules/profit/useProfitImport';
import { useProductActions } from '../modules/profit/useProductActions';
import { GraphTemplateCard } from '../modules/profit/GraphTemplateCard';
import { toProductTemplateImportNode } from '../modules/productTemplateImport';
import { DEFAULT_PRODUCT_TAX_RATES } from '../modules/productTaxRates';
import type { NodeGraphTemplate } from '../modules/node-designer/types';
import { prepareGraphNodeForSave } from '../modules/profit/graphNodeSavePreparation';
import { serializePlatformNodeTemplateData } from '../modules/profit/templateDataSerializer';
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
      graphDraftInvalid: 'Fix graph input errors before saving',
      inputValidationFailed: 'Fix invalid profit inputs before saving',
    },
    graphErrors: {
      missing_input: 'Input "{name}" is required',
      non_finite_input: 'Input "{name}" must be a finite number',
      input_out_of_range: 'Input "{name}" must be between {min} and {max}',
      invalid_parameter: 'Input node "{name}" is invalid',
      invalid_binding: 'Formula node "{name}" has invalid bindings',
      formula_error: 'Formula node "{name}" is invalid: {detail}',
      dependency_error: 'Node "{name}" depends on a failed result',
      cycle: 'The node graph contains a dependency cycle',
      graph_structure: 'Invalid node graph: {detail}',
      missing_output: 'Output node "{name}" is not connected correctly',
      non_finite_output: 'Node "{name}" produced a non-finite result',
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
  saveProductWithTemplates: vi.fn(),
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
    { label: 'missing', adROI: undefined, expected: 15 },
    { label: 'explicit zero', adROI: 0, expected: 0 },
    { label: 'numeric-string zero', adROI: '0', expected: 0 },
    { label: 'invalid text', adROI: 'invalid', expected: 15 },
    { label: 'negative historical value', adROI: -1, expected: 15 },
  ])('normalizes $label adROI in the actual history import flow', async ({ adROI, expected }) => {
    const setSiteInputsMap = vi.fn();
    const store = {
      ...baseStore(),
      calculatorImport: {
        id: 'product-ad-roi',
        name: 'Imported Product',
        sku: 'SKU-AD',
        country: 'MY',
        cost: 5,
        productWeight: 20,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: { MY: { adROI } },
      },
    };
    testState.store = store;

    renderHook(() => useProfitImport(
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      setSiteInputsMap,
    ));

    await waitFor(() => expect(setSiteInputsMap).toHaveBeenCalledTimes(1));
    const update = setSiteInputsMap.mock.calls[0][0] as (
      previous: Record<string, SiteLevelInputs>,
    ) => Record<string, SiteLevelInputs>;
    expect(update({ MYR: { ...DEFAULT_SITE_INPUTS } }).MYR.adROI).toBe(expected);
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

  it('trims name and SKU once for validation, lookup, and the saved payload', async () => {
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'trimmed-product' },
      productTemplates: [],
    });
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitGlobalInputs: {
        ...baseStore().profitGlobalInputs,
        name: '  Product  ',
        sku: '  SKU-1  ',
      },
    };
    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({ name: 'Product', sku: 'SKU-1' }),
    }));
  });

  it('rejects whitespace-only name and SKU before persistence', async () => {
    const saveProductWithTemplates = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitGlobalInputs: {
        ...baseStore().profitGlobalInputs,
        name: '   ',
        sku: '\t',
      },
    };
    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Name and SKU required', 'error');
  });

  it('blocks product and shared-template APIs when firstWeight is blank', async () => {
    const node: PlatformNode = {
      id: 'blank-first-weight',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Blank first weight',
      data: { ...DEFAULT_NODE_DATA, firstWeight: '' } as unknown as PlatformNode['data'],
    };
    const saveProductWithTemplates = vi.fn();
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      saveProductWithTemplates,
    };

    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Must not save');
      await result.current.handleSaveProduct();
    });

    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.api.get).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(result.current.inputErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'nodes.blank-first-weight.firstWeight' }),
    ]));
    expect(testState.showToast).toHaveBeenCalledWith(
      'Fix invalid profit inputs before saving',
      'error',
    );
  });

  it('blocks product and shared-template saves when combined coupon deductions exceed revenue', async () => {
    const node: PlatformNode = {
      id: 'coupon-over-revenue',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Coupon over revenue',
      data: { ...DEFAULT_NODE_DATA, platformCoupon: 20 },
    };
    const saveProductWithTemplates = vi.fn();
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      saveProductWithTemplates,
    };
    const siteInputs = {
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 100,
      sellerCouponType: 'fixed' as const,
      sellerCoupon: 95,
      sellerCouponPlatformRatio: 0,
    };
    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), { MYR: 2 }, { MYR: siteInputs }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Must not save');
      await result.current.handleSaveProduct();
    });

    expect(testState.api.post).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(result.current.inputErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'nodes.coupon-over-revenue.platformCoupon',
        code: 'max',
      }),
    ]));
  });

  it('blocks product and shared-template saves while a derived coupon-rate draft is invalid', async () => {
    const node: PlatformNode = {
      id: 'invalid-coupon-rate-draft',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Invalid coupon rate draft',
      data: { ...DEFAULT_NODE_DATA, platformCoupon: 20 },
    };
    const saveProductWithTemplates = vi.fn();
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      saveProductWithTemplates,
    };
    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      { MYR: 2 },
      { MYR: { ...DEFAULT_SITE_INPUTS, totalRevenue: 100 } },
      vi.fn(),
    ));

    act(() => {
      result.current.handleNodeInputValidationChange(node.id, {
        field: 'platformCouponRate',
        code: 'max',
        max: 100,
      });
    });
    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Must not save');
      await result.current.handleSaveProduct();
    });

    expect(testState.api.post).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(result.current.inputErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'nodes.invalid-coupon-rate-draft.platformCouponRate',
        code: 'max',
      }),
    ]));
  });

  it('does not let another node coupon-rate draft block a valid shared-template save', async () => {
    const invalidDraftNode: PlatformNode = {
      id: 'invalid-draft-other-node',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Other invalid draft',
      data: { ...DEFAULT_NODE_DATA },
    };
    const validNode: PlatformNode = {
      id: 'valid-shared-template-node',
      platform: 'lazada',
      currency: 'MYR',
      name: 'Valid shared template',
      data: { ...DEFAULT_NODE_DATA },
    };
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [invalidDraftNode, validNode] },
    };
    testState.api.post.mockResolvedValue({ data: { id: 'saved-valid-node' } });
    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      { MYR: 2 },
      { MYR: { ...DEFAULT_SITE_INPUTS, totalRevenue: 100 } },
      vi.fn(),
    ));

    act(() => {
      result.current.handleNodeInputValidationChange(invalidDraftNode.id, {
        field: 'platformCouponRate',
        code: 'max',
        max: 100,
      });
    });
    await act(async () => {
      await result.current.handleSaveTemplate(validNode.id, 'Valid template');
    });

    expect(testState.api.post).toHaveBeenCalledWith(
      '/templates',
      expect.objectContaining({ name: 'Valid template' }),
    );
  });

  it('recomputes coupon-budget errors after site inputs are corrected instead of keeping stale errors', async () => {
    const node: PlatformNode = {
      id: 'corrected-coupon-budget',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Corrected coupon budget',
      data: { ...DEFAULT_NODE_DATA, platformCoupon: 20 },
    };
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'corrected-product' },
      productTemplates: [],
    });
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      saveProductWithTemplates,
    };
    let currentSiteInputs = {
      ...DEFAULT_SITE_INPUTS,
      totalRevenue: 100,
      sellerCouponType: 'fixed' as const,
      sellerCoupon: 95,
      sellerCouponPlatformRatio: 0,
    };
    const { result, rerender } = renderHook(() => useProductActions(
      [], vi.fn(), { MYR: 2 }, { MYR: currentSiteInputs }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });
    expect(saveProductWithTemplates).not.toHaveBeenCalled();

    currentSiteInputs = { ...currentSiteInputs, totalRevenue: 200 };
    rerender();
    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).toHaveBeenCalledTimes(1);
    expect(result.current.inputErrors).toEqual([]);
  });

  it('normalizes standard-node numeric strings before state and product serialization and preserves zero', async () => {
    const node: PlatformNode = {
      id: 'numeric-node',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Numeric strings',
      data: {
        ...DEFAULT_NODE_DATA,
        firstWeight: '0',
        extraShippingFee: '2.5',
      } as unknown as PlatformNode['data'],
    };
    const saveProductWithTemplates = vi.fn().mockResolvedValue({ product: { id: 'p' }, productTemplates: [] });
    const setProfitNodes = vi.fn();
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
      setProfitNodes,
      saveProductWithTemplates,
    };

    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS, adROI: 0 } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    const stateUpdate = setProfitNodes.mock.calls.find(([update]) => typeof update === 'function')?.[0] as (
      previous: Record<string, PlatformNode[]>,
    ) => Record<string, PlatformNode[]>;
    expect(stateUpdate({ MYR: [node] }).MYR[0].data).toEqual(expect.objectContaining({
      firstWeight: 0,
      extraShippingFee: 2.5,
    }));
    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({
        adROI: 0,
        siteData: { MY: expect.objectContaining({ adROI: 0 }) },
      }),
      templateMutations: [expect.objectContaining({
        data: expect.objectContaining({
          kind: 'standard',
          firstWeight: 0,
          extraShippingFee: 2.5,
        }),
      })],
    }));
  });

  it('creates a product and all node links with one atomic write', async () => {
    const node: PlatformNode = {
      id: 'new-node',
      platform: 'lazada',
      currency: 'SGD',
      name: 'Lazada SG',
      data: { ...DEFAULT_NODE_DATA, extraShippingFee: 6 },
    };
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-new' },
      productTemplates: [{ id: 'link-new' }],
    });
    testState.store = {
      ...baseStore(),
      profitSiteCurrency: 'SGD',
      profitNodes: { SGD: [node] },
      saveProductWithTemplates,
    };

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

    expect(testState.api.get).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).toHaveBeenCalledTimes(1);
    expect(saveProductWithTemplates).toHaveBeenCalledWith({
      product: expect.objectContaining({
        name: 'Product',
        sku: 'SKU-1',
        sites: ['SG'],
        siteData: { SG: expect.objectContaining({ adROI: 15 }) },
      }),
      templateMutations: [expect.objectContaining({
        operation: 'create',
        templateId: null,
        name: 'Lazada SG',
        country: 'SGD',
        platform: 'lazada',
      })],
    });
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.api.put).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Saved product');
  });

  it('loads existing links read-only, then updates the product and matched link atomically', async () => {
    const node: PlatformNode = {
      id: 'existing-node',
      productTemplateLinkId: 'link-1',
      templateId: 'shared-1',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Shopee MY',
      data: { ...DEFAULT_NODE_DATA },
    };
    const existingLink: ProductProfitTemplate = {
      id: 'link-1',
      productId: 'product-1',
      templateId: 'shared-1',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee',
      data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
    };
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-1' },
      productTemplates: [existingLink],
    });
    testState.store = {
      ...baseStore(),
      products: [{
        id: 'product-1',
        name: 'Product',
        sku: 'SKU-1',
        country: 'SG' as const,
        sites: ['SG' as const],
        cost: 9,
        productWeight: 90,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: { SG: { totalRevenue: 9 } },
      }],
      profitEditingProductId: 'product-1',
      profitNodes: { MYR: [node] },
      saveProductWithTemplates,
    };
    testState.api.get.mockResolvedValue({ data: [
      existingLink,
      { ...existingLink, id: 'unmentioned-link', name: 'Do not delete' },
    ] });

    const { result } = renderHook(() => useProductActions(
      [{ id: 'shared-1', name: 'Shopee MY', country: 'MYR', platform: 'shopee', data: {} }],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(testState.api.get).toHaveBeenCalledWith('/products/product-1/templates');
    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      templateMutations: [expect.objectContaining({
        operation: 'update',
        linkId: 'link-1',
        templateId: 'shared-1',
      })],
      sitePatch: {
        sites: ['MY'],
        siteData: { MY: expect.objectContaining({ adROI: 15 }) },
      },
    }), 'product-1');
    const updateRequest = saveProductWithTemplates.mock.calls[0][0];
    expect(updateRequest.product).not.toHaveProperty('sites');
    expect(updateRequest.product).not.toHaveProperty('siteData');
    expect(updateRequest.sitePatch.siteData).not.toHaveProperty('SG');
    expect(updateRequest.templateMutations).toHaveLength(1);
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.api.put).not.toHaveBeenCalled();
  });

  it('builds update site patches only from this save even when local site collections are corrupt', async () => {
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-corrupt-local' },
      productTemplates: [],
    });
    testState.store = {
      ...baseStore(),
      profitSiteCurrency: 'PHP',
      profitEditingProductId: 'product-corrupt-local',
      products: [{
        id: 'product-corrupt-local',
        name: 'Product',
        sku: 'SKU-1',
        country: 'SG' as const,
        sites: 'not-an-array',
        cost: 10,
        productWeight: 100,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        siteData: 'not-an-object',
      } as never],
      profitNodes: { PHP: [] },
      saveProductWithTemplates,
    };

    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { PHP: { ...DEFAULT_SITE_INPUTS, totalRevenue: 33 } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).toHaveBeenCalledTimes(1);
    const [request, productId] = saveProductWithTemplates.mock.calls[0];
    expect(productId).toBe('product-corrupt-local');
    expect(request.product).not.toHaveProperty('sites');
    expect(request.product).not.toHaveProperty('siteData');
    expect(request.sitePatch).toEqual({
      sites: ['PH'],
      siteData: { PH: expect.objectContaining({ totalRevenue: 33 }) },
    });
  });

  it('emits independent site-only patches for concurrent saves based on the same stale product', async () => {
    const staleProduct = {
      id: 'product-concurrent',
      name: 'Product',
      sku: 'SKU-1',
      country: 'SG' as const,
      sites: ['SG' as const],
      cost: 10,
      productWeight: 100,
      supplierTaxPoint: 0,
      supplierInvoice: 'no' as const,
      siteData: { SG: { totalRevenue: 9 } },
    };
    const saveMy = vi.fn().mockResolvedValue({ product: staleProduct, productTemplates: [] });
    testState.store = {
      ...baseStore(),
      products: [staleProduct],
      profitEditingProductId: staleProduct.id,
      profitSiteCurrency: 'MYR',
      profitNodes: { MYR: [] },
      saveProductWithTemplates: saveMy,
    };
    const myHook = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS, totalRevenue: 11 } }, vi.fn(),
    ));

    const savePh = vi.fn().mockResolvedValue({ product: staleProduct, productTemplates: [] });
    testState.store = {
      ...baseStore(),
      products: [staleProduct],
      profitEditingProductId: staleProduct.id,
      profitSiteCurrency: 'PHP',
      profitNodes: { PHP: [] },
      saveProductWithTemplates: savePh,
    };
    const phHook = renderHook(() => useProductActions(
      [], vi.fn(), {}, { PHP: { ...DEFAULT_SITE_INPUTS, totalRevenue: 22 } }, vi.fn(),
    ));

    await act(async () => {
      await myHook.result.current.handleSaveProduct();
      await phHook.result.current.handleSaveProduct();
    });

    expect(saveMy.mock.calls[0][0].sitePatch).toEqual({
      sites: ['MY'],
      siteData: { MY: expect.objectContaining({ totalRevenue: 11 }) },
    });
    expect(savePh.mock.calls[0][0].sitePatch).toEqual({
      sites: ['PH'],
      siteData: { PH: expect.objectContaining({ totalRevenue: 22 }) },
    });
    expect(saveMy.mock.calls[0][0].product).not.toHaveProperty('siteData');
    expect(savePh.mock.calls[0][0].product).not.toHaveProperty('siteData');
  });

  it('skips the link lookup and atomically ensures the default template for an empty node list', async () => {
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-default' },
      productTemplates: [{ id: 'default-link' }],
    });
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitGlobalInputs: {
        ...baseStore().profitGlobalInputs,
        vatRate: -5,
        corporateIncomeTaxRate: 125,
      },
      profitNodes: { MYR: [] },
    };

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

    expect(testState.api.get).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).toHaveBeenCalledWith({
      product: expect.objectContaining({ vatRate: -5, corporateIncomeTaxRate: 125 }),
      templateMutations: [],
      ensureDefaultTemplate: expect.objectContaining({
        templateId: null,
        name: 'Product',
        country: 'MYR',
        platform: 'other',
        type: 'profit',
        data: expect.objectContaining({ vatRate: -5, corporateIncomeTaxRate: 125 }),
      }),
    });
  });

  it('keeps editing state and suppresses success when the atomic write fails', async () => {
    const saveProductWithTemplates = vi.fn().mockRejectedValue(new Error('atomic rollback'));
    const setEditingProductId = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      setProfitEditingProductId: setEditingProductId,
      profitEditingProductId: 'product-1',
      products: [{
        id: 'product-1', name: 'Product', sku: 'SKU-1', country: 'MY', sites: ['MY'],
        cost: 10, productWeight: 100, supplierTaxPoint: 0, supplierInvoice: 'no', siteData: {},
      }],
      profitNodes: { MYR: [] },
    };

    const { result } = renderHook(() => useProductActions(
      [], vi.fn(), {}, { MYR: { ...DEFAULT_SITE_INPUTS } }, vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).toHaveBeenCalledTimes(1);
    expect(setEditingProductId).not.toHaveBeenCalledWith(null);
    expect(testState.showToast).toHaveBeenCalledWith('Save failed', 'error');
    expect(testState.showToast).not.toHaveBeenCalledWith('Saved product');
    expect(testState.showToast).not.toHaveBeenCalledWith('Updated');
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

  it.each([
    ['name', ''],
    ['name', '   '],
    ['name', 42],
    ['createdAt', ''],
    ['createdAt', '   '],
    ['createdAt', 42],
    ['updatedAt', ''],
    ['updatedAt', '   '],
    ['updatedAt', 42],
  ] as const)(
    'blocks product and shared-template saves when graph snapshot %s has invalid value %s',
    async (field, invalidValue) => {
      const graphTemplate = {
        id: `graph-invalid-metadata-${field}`,
        name: 'Graph with validated metadata',
        type: 'profit',
        country: 'MYR',
        platform: 'shopee',
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z',
        nodes: [
          {
            id: 'price',
            type: 'parameter',
            position: { x: 0, y: 0 },
            data: {
              name: 'Price',
              valueType: 'number',
              min: 0,
              max: 1000,
              defaultValue: 6,
            },
          },
          {
            id: 'out',
            type: 'output',
            position: { x: 200, y: 0 },
            data: { name: 'Output' },
          },
        ],
        edges: [{ id: 'edge', source: 'price', target: 'out' }],
      } as NodeGraphTemplate;
      (graphTemplate as unknown as Record<string, unknown>)[field] = invalidValue;

      const node: PlatformNode = {
        id: `node-invalid-metadata-${field}`,
        platform: 'shopee',
        currency: 'MYR',
        name: 'Graph with invalid snapshot metadata',
        data: { ...DEFAULT_NODE_DATA },
        graphTemplateId: graphTemplate.id,
        graphTemplateSnapshot: graphTemplate,
        graphInputValues: { price: 6 },
        graphOutputValues: { out: 6 },
      };
      const saveProductWithTemplates = vi.fn();
      testState.store = {
        ...baseStore(),
        saveProductWithTemplates,
        profitNodes: { MYR: [node] },
      };

      const { result } = renderHook(() => useProductActions(
        [],
        vi.fn(),
        {},
        { MYR: { ...DEFAULT_SITE_INPUTS } },
        vi.fn(),
      ));

      await act(async () => {
        await result.current.handleSaveTemplate(node.id, 'Invalid metadata');
        await result.current.handleSaveProduct();
      });

      expect(prepareGraphNodeForSave(node)).toEqual(expect.objectContaining({ ok: false }));
      expect(saveProductWithTemplates).not.toHaveBeenCalled();
      expect(testState.api.get).not.toHaveBeenCalled();
      expect(testState.api.post).not.toHaveBeenCalled();
      expect(testState.api.put).not.toHaveBeenCalled();
      expect(testState.showToast).toHaveBeenCalledWith(
        'Fix graph input errors before saving',
        'error',
      );
    },
  );

  it('connects GraphTemplateCard draft validation to product save blocking and clears it with a valid zero', async () => {
    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-save-guard',
      name: 'Save guard graph',
      type: 'profit',
      country: 'MYR',
      platform: 'shopee',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      nodes: [
        {
          id: 'price',
          type: 'parameter',
          position: { x: 0, y: 0 },
          data: { name: 'Price', valueType: 'number', min: 0, max: 1000, defaultValue: 100 },
        },
        {
          id: 'out',
          type: 'output',
          position: { x: 200, y: 0 },
          data: { name: 'Output' },
        },
      ],
      edges: [{ id: 'edge', source: 'price', target: 'out' }],
    };
    const graphNode: PlatformNode = {
      id: 'node-save-guard',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Save guard graph',
      data: { ...DEFAULT_NODE_DATA },
      graphTemplateId: graphTemplate.id,
      graphTemplateSnapshot: graphTemplate,
      graphInputValues: { price: 100 },
      graphOutputValues: { out: 100 },
    };
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-graph' },
      productTemplates: [{ id: 'link-graph' }],
    });
    const setProfitNodes = vi.fn((update: Record<string, PlatformNode[]> | ((previous: Record<string, PlatformNode[]>) => Record<string, PlatformNode[]>)) => {
      const current = testState.store as ReturnType<typeof baseStore> & {
        profitNodes: Record<string, PlatformNode[]>;
      };
      const next = typeof update === 'function' ? update(current.profitNodes) : update;
      Object.assign(graphNode, next.MYR[0]);
      current.profitNodes = { ...current.profitNodes, MYR: [graphNode] };
    });
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      setProfitNodes,
      profitNodes: { MYR: [graphNode] },
    };
    const Harness = () => {
      const actions = useProductActions(
        [],
        vi.fn(),
        {},
        { MYR: { ...DEFAULT_SITE_INPUTS } },
        vi.fn(),
      );
      return (
        <>
          <GraphTemplateCard
            node={graphNode}
            onUpdateInputs={actions.handleUpdateGraphNodeInputs}
            onValidationChange={actions.handleGraphNodeValidationChange}
            onDelete={actions.handleDeleteNode}
            errorLabels={strings.profit.graphErrors}
          />
          <button type="button" onClick={() => { void actions.handleSaveProduct(); }}>
            Save product
          </button>
        </>
      );
    };

    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    await waitFor(() => expect(testState.showToast).toHaveBeenCalledWith(
      'Fix graph input errors before saving',
      'error',
    ));
    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(testState.api.get).not.toHaveBeenCalled();
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.showToast).not.toHaveBeenCalledWith('Saved product');
    expect(graphNode.graphInputValues).toEqual({ price: 100 });
    expect(graphNode.graphOutputValues).toEqual({ out: 100 });

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(graphNode.graphInputValues).toEqual({ price: 0 });
    expect(graphNode.graphOutputValues).toEqual({ out: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    await waitFor(() => expect(saveProductWithTemplates).toHaveBeenCalledTimes(1));
    expect(saveProductWithTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateMutations: [expect.objectContaining({
          operation: 'create',
          data: expect.objectContaining({
          kind: 'graph',
          graphInputValues: { price: 0 },
          graphOutputValues: { out: 0 },
          }),
        })],
      }),
    );
    expect(testState.showToast).toHaveBeenCalledWith('Saved product');
  });

  it('recomputes and replaces stale graph outputs before any save payload is built', async () => {
    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-stale-output',
      name: 'Stale output graph',
      type: 'profit',
      country: 'MYR',
      platform: 'shopee',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      nodes: [
        {
          id: 'price',
          type: 'parameter',
          position: { x: 0, y: 0 },
          data: { name: 'Price', valueType: 'number', min: 0, max: 1000, defaultValue: 6 },
        },
        {
          id: 'out',
          type: 'output',
          position: { x: 200, y: 0 },
          data: { name: 'Output' },
        },
      ],
      edges: [{ id: 'edge', source: 'price', target: 'out' }],
    };
    const graphNode: PlatformNode = {
      id: 'node-stale-output',
      platform: 'shopee',
      currency: 'MYR',
      name: graphTemplate.name,
      data: { ...DEFAULT_NODE_DATA },
      graphTemplateId: graphTemplate.id,
      graphTemplateSnapshot: graphTemplate,
      graphInputValues: { price: 6 },
      graphOutputValues: { out: 999 },
    };
    const prepared = prepareGraphNodeForSave(graphNode);
    expect(prepared).toEqual(expect.objectContaining({ ok: true }));
    if (prepared.ok === false) throw new Error('expected graph preparation success');
    expect(prepared.node.graphOutputValues).toEqual({ out: 6 });

    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-stale-output' },
      productTemplates: [{ id: 'link-stale-output' }],
    });
    const setProfitNodes = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      setProfitNodes,
      profitNodes: { MYR: [graphNode] },
    };
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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateMutations: [expect.objectContaining({
          operation: 'create',
          data: expect.objectContaining({
          graphInputValues: { price: 6 },
          graphOutputValues: { out: 6 },
          }),
        })],
      }),
    );
    expect(setProfitNodes).toHaveBeenCalled();
  });

  it('sends recomputed graph outputs when saving a shared template directly', async () => {
    const graphTemplate: NodeGraphTemplate = {
      id: 'graph-stale-shared',
      name: 'Stale shared graph',
      type: 'profit',
      country: 'MYR',
      platform: 'shopee',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      nodes: [
        {
          id: 'price',
          type: 'parameter',
          position: { x: 0, y: 0 },
          data: { name: 'Price', valueType: 'number', min: 0, max: 1000, defaultValue: 6 },
        },
        {
          id: 'out',
          type: 'output',
          position: { x: 200, y: 0 },
          data: { name: 'Output' },
        },
      ],
      edges: [{ id: 'edge', source: 'price', target: 'out' }],
    };
    const node: PlatformNode = {
      id: 'node-stale-shared',
      platform: 'shopee',
      currency: 'MYR',
      name: graphTemplate.name,
      data: { ...DEFAULT_NODE_DATA },
      graphTemplateId: graphTemplate.id,
      graphTemplateSnapshot: graphTemplate,
      graphInputValues: { price: 6 },
      graphOutputValues: { out: 999 },
    };
    testState.store = {
      ...baseStore(),
      profitNodes: { MYR: [node] },
    };
    testState.api.post.mockResolvedValue({ data: { id: 'shared-fresh-output' } });

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Fresh shared');
    });

    expect(testState.api.post).toHaveBeenCalledWith(
      '/templates',
      expect.objectContaining({
        data: expect.objectContaining({
          graphInputValues: { price: 6 },
          graphOutputValues: { out: 6 },
        }),
      }),
    );
  });

  it.each([
    {
      label: 'input-only',
      graphInputValues: { price: 1 },
    },
    {
      label: 'output-only',
      graphOutputValues: { out: 1 },
    },
  ])('blocks a partial runtime graph claim ($label) before product or template APIs', async partial => {
    const node: PlatformNode = {
      id: `partial-${partial.label}`,
      platform: 'shopee',
      currency: 'MYR',
      name: 'Partial graph',
      data: { ...DEFAULT_NODE_DATA },
      ...partial,
    };
    expect(() => serializePlatformNodeTemplateData(node)).toThrow(/all graph fields/);
    const saveProductWithTemplates = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitNodes: { MYR: [node] },
    };

    const { result } = renderHook(() => useProductActions(
      [],
      vi.fn(),
      {},
      { MYR: { ...DEFAULT_SITE_INPUTS } },
      vi.fn(),
    ));

    await act(async () => {
      await result.current.handleSaveTemplate(node.id, 'Partial');
      await result.current.handleSaveProduct();
    });

    expect(saveProductWithTemplates).not.toHaveBeenCalled();
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.api.put).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith(
      'Fix graph input errors before saving',
      'error',
    );
  });

  it('does not report product-save success when the aggregate product/template write fails', async () => {
    const node: PlatformNode = {
      id: 'node-sync-failure',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Sync failure',
      data: { ...DEFAULT_NODE_DATA },
    };
    const saveProductWithTemplates = vi.fn().mockRejectedValue(new Error('atomic save failed'));
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitNodes: { MYR: [node] },
    };
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

    expect(saveProductWithTemplates).toHaveBeenCalledTimes(1);
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.api.put).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Save failed', 'error');
    expect(testState.showToast).not.toHaveBeenCalledWith('Saved product');
  });

  it('does not read default-template state before an aggregate default save', async () => {
    const saveProductWithTemplates = vi.fn().mockRejectedValue(new Error('default atomic failure'));
    const setEditingProductId = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      setProfitEditingProductId: setEditingProductId,
      profitNodes: { MYR: [] },
    };
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

    expect(testState.api.get).not.toHaveBeenCalled();
    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      templateMutations: [],
      ensureDefaultTemplate: expect.objectContaining({ platform: 'other' }),
    }));
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Save failed', 'error');
    expect(testState.showToast).not.toHaveBeenCalledWith('Saved product');
    expect(setEditingProductId).not.toHaveBeenCalledWith(null);
  });

  it('does not report product-save success when the aggregate default-template creation fails', async () => {
    const saveProductWithTemplates = vi.fn().mockRejectedValue(new Error('default create failed'));
    const setEditingProductId = vi.fn();
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      setProfitEditingProductId: setEditingProductId,
      profitNodes: { MYR: [] },
    };
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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      ensureDefaultTemplate: expect.objectContaining({
        name: 'Product',
        country: 'MYR',
        platform: 'other',
      }),
    }));
    expect(testState.api.post).not.toHaveBeenCalled();
    expect(testState.showToast).toHaveBeenCalledWith('Save failed', 'error');
    expect(testState.showToast).not.toHaveBeenCalledWith('Saved product');
    expect(setEditingProductId).not.toHaveBeenCalledWith(null);
  });

  it('saves canonical product tax fields, including negative historical values, before template compatibility copies', async () => {
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-tax-new' },
      productTemplates: [],
    });
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
      profitGlobalInputs: {
        ...baseStore().profitGlobalInputs,
        vatRate: -5,
        corporateIncomeTaxRate: 125,
      },
    };
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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({
        vatRate: -5,
        corporateIncomeTaxRate: 125,
      }),
      ensureDefaultTemplate: expect.objectContaining({
        data: expect.objectContaining({ vatRate: -5, corporateIncomeTaxRate: 125 }),
      }),
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
      platformCoupon: Number.MAX_SAFE_INTEGER,
      future: { nested: true },
    };
    const node: PlatformNode = {
      id: 'node-invalid-sync',
      productTemplateLinkId: 'link-invalid',
      templateId: 'shared-invalid',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Invalid imported node',
      data: {
        ...DEFAULT_NODE_DATA,
        firstWeight: 3,
        platformCoupon: Number.MAX_SAFE_INTEGER,
      },
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
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-1' },
      productTemplates: [existingLink],
    });
    testState.store = {
      ...baseStore(),
      saveProductWithTemplates,
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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateMutations: [expect.objectContaining({
          operation: 'update',
          linkId: 'link-invalid',
        templateId: 'shared-invalid',
        data: {
          kind: 'invalid',
          schemaVersion: 99,
          compatibilityEnvelope: true,
          rawData: invalidRaw,
        },
        })],
      }),
      'product-1',
    );
    expect(testState.api.put).not.toHaveBeenCalled();
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
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-1' },
      productTemplates: [existingLink],
    });
    const store = {
      ...baseStore(),
      saveProductWithTemplates,
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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateMutations: [expect.objectContaining({
        operation: 'update',
        linkId: 'link-1',
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
        })],
      }),
      'product-1',
    );
    expect(testState.api.put).not.toHaveBeenCalled();
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
    const saveProductWithTemplates = vi.fn().mockResolvedValue({
      product: { id: 'product-new' },
      productTemplates: [{ id: 'link-new' }],
    });
    const store = {
      ...baseStore(),
      profitSiteCurrency: 'SGD',
      profitNodes: { SGD: [node] },
      saveProductWithTemplates,
    };
    testState.store = store;
    testState.api.get.mockResolvedValue({ data: [] });

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

    expect(saveProductWithTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateMutations: [expect.objectContaining({
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
          futurePostOption: ['keep'],
        }),
        })],
      }),
    );
    expect(testState.api.post).not.toHaveBeenCalled();
  });
});
