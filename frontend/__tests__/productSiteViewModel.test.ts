import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCT_IMPORT_RECORDS,
  MAX_PRODUCT_IMPORT_STRING_LENGTH,
  createProductSiteViewModel,
  normalizeProductSiteMembership,
  normalizeImportedProductBatch,
  normalizeImportedProductRecord,
} from '../modules/profit/productSiteViewModel';

const baseProduct = {
  id: 'product-1',
  name: 'Product',
  sku: 'SKU-1',
  country: 'MY' as const,
  sites: ['MY'] as const,
  cost: 12,
  productWeight: 300,
  supplierInvoice: 'no' as const,
  supplierTaxPoint: 0,
  vatRate: 1,
  corporateIncomeTaxRate: 5,
};

describe('normalizeProductSiteMembership', () => {
  it('does not guess a site when both country and sites are missing', () => {
    expect(normalizeProductSiteMembership({ country: null, sites: [] })).toEqual([]);
  });

  it('falls back to a valid country when sites is empty', () => {
    expect(normalizeProductSiteMembership({ country: 'MY', sites: [] })).toEqual(['MY']);
  });

  it('prefers and deduplicates valid multi-site membership over country', () => {
    expect(normalizeProductSiteMembership({
      country: 'TH',
      sites: ['MYR', 'SG', 'MY', 'invalid'],
    })).toEqual(['MY', 'SG']);
  });
});

describe('createProductSiteViewModel', () => {
  it('normalizes historical numeric strings for display and calculation', () => {
    const viewModel = createProductSiteViewModel({
      ...baseProduct,
      siteData: {
        MY: {
          totalRevenue: '100.25',
          platformInfrastructureFee: '3.5',
          sellerCoupon: '2',
          sellerCouponPlatformRatio: '40',
          adROI: '12',
        },
      },
    } as never, 'MY');

    expect(viewModel.siteInputs).toEqual({
      totalRevenue: 100.25,
      sellerCoupon: 2,
      sellerCouponType: 'fixed',
      sellerCouponPlatformRatio: 40,
      platformInfrastructureFee: 3.5,
      adROI: 12,
    });
    expect(viewModel.globalInputs).toEqual(expect.objectContaining({
      purchaseCost: 12,
      productWeight: 300,
      supplierTaxPoint: 0,
    }));
  });

  it('tolerates invalid historical data, defaults missing adROI to 15, and preserves explicit zero', () => {
    const invalid = createProductSiteViewModel({
      ...baseProduct,
      totalRevenue: 80,
      platformInfrastructureFee: 4,
      siteData: {
        MY: {
          totalRevenue: 'not-a-number',
          platformInfrastructureFee: Number.POSITIVE_INFINITY,
          sellerCouponType: 'future',
        },
      },
    } as never, 'MY');
    const zero = createProductSiteViewModel({
      ...baseProduct,
      adROI: 20,
      siteData: { MY: { adROI: '0' } },
    } as never, 'MY');

    expect(invalid.siteInputs.totalRevenue).toBe(0);
    expect(invalid.siteInputs.platformInfrastructureFee).toBe(0);
    expect(invalid.siteInputs.sellerCouponType).toBe('fixed');
    expect(invalid.siteInputs.adROI).toBe(15);
    expect(zero.siteInputs.adROI).toBe(0);
  });

  it('falls back to country when the persisted sites array is empty', () => {
    expect(createProductSiteViewModel({
      ...baseProduct,
      sites: [],
    }, 'MY').sites).toEqual(['MY']);
  });
});

describe('normalizeImportedProductRecord', () => {
  it('converts canonical numeric strings and preserves explicit adROI zero at both levels', () => {
    const result = normalizeImportedProductRecord({
      name: 'Imported',
      sku: 'IMP-1',
      country: 'MY',
      sites: ['MY'],
      cost: '12.5',
      productWeight: '300',
      supplierInvoice: 'no',
      supplierTaxPoint: '0',
      vatRate: '1',
      corporateIncomeTaxRate: '5',
      sellerCouponType: 'percent',
      sellerCoupon: '10',
      sellerCouponPlatformRatio: '30',
      adROI: '0',
      totalRevenue: '100',
      platformInfrastructureFee: '2.5',
      siteData: {
        MY: {
          sellerCouponType: 'fixed',
          sellerCoupon: '3',
          adROI: '0',
          totalRevenue: '110',
          platformInfrastructureFee: '4',
        },
      },
    }, 'MY');

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.value).toEqual(expect.objectContaining({
      cost: 12.5,
      productWeight: 300,
      adROI: 0,
      totalRevenue: 100,
      platformInfrastructureFee: 2.5,
      siteData: {
        MY: expect.objectContaining({
          sellerCoupon: 3,
          adROI: 0,
          totalRevenue: 110,
          platformInfrastructureFee: 4,
        }),
      },
    }));
  });

  it.each([
    [{ sellerCouponType: 'future' }, 'top-level coupon type'],
    [{ sellerCouponType: 'percent', sellerCoupon: 101 }, 'top-level coupon range'],
    [{ totalRevenue: Number.POSITIVE_INFINITY }, 'top-level non-finite value'],
    [{ siteData: { MY: { sellerCouponType: 'future' } } }, 'site coupon type'],
    [{ siteData: { MY: { sellerCouponType: 'percent', sellerCoupon: -1 } } }, 'site coupon range'],
    [{ siteData: { MY: { platformInfrastructureFee: 'Infinity' } } }, 'site non-finite value'],
  ])('rejects an imported record with invalid %s', (partial, _description) => {
    const result = normalizeImportedProductRecord({
      name: 'Imported',
      sku: 'IMP-INVALID',
      country: 'MY',
      cost: 10,
      productWeight: 100,
      supplierInvoice: 'no',
      supplierTaxPoint: 0,
      vatRate: 1,
      corporateIncomeTaxRate: 5,
      ...partial,
    }, 'MY');

    expect(result.ok).toBe(false);
  });

  it('falls back when country is missing but rejects an explicitly invalid country or invoice enum', () => {
    const missingCountry = normalizeImportedProductRecord({
      name: 'Fallback', sku: 'F-1', cost: 1, productWeight: 1,
      supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
    }, 'SG');
    expect(missingCountry).toEqual({
      ok: true,
      value: expect.objectContaining({ country: 'SG', supplierInvoice: 'no' }),
    });

    for (const partial of [{ country: 'XX' }, { supplierInvoice: 'sometimes' }]) {
      const result = normalizeImportedProductRecord({
        name: 'Invalid enum', sku: 'BAD-ENUM', cost: 1, productWeight: 1,
        supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
        ...partial,
      }, 'MY');
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.errors).toContainEqual(expect.objectContaining({ code: 'invalid_enum' }));
      }
    }
  });

  it('validates an entire import batch before writes and enforces count and critical-string limits', () => {
    const valid = {
      name: 'Imported', sku: 'IMP-1', country: 'MY', cost: 1, productWeight: 1,
      supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
    };
    expect(normalizeImportedProductBatch([valid, { ...valid, sku: 'IMP-2' }], 'MY')).toEqual({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({ sku: 'IMP-1' }),
        expect.objectContaining({ sku: 'IMP-2' }),
      ]),
    });

    const oneInvalid = normalizeImportedProductBatch([
      valid,
      { ...valid, sku: 'BAD', country: 'XX' },
    ], 'MY');
    expect(oneInvalid.ok).toBe(false);

    expect(normalizeImportedProductBatch(
      Array.from({ length: MAX_PRODUCT_IMPORT_RECORDS + 1 }, (_, index) => ({ ...valid, sku: `SKU-${index}` })),
      'MY',
    ).ok).toBe(false);
    expect(normalizeImportedProductBatch([
      { ...valid, name: 'x'.repeat(MAX_PRODUCT_IMPORT_STRING_LENGTH + 1) },
    ], 'MY').ok).toBe(false);
  });

  it('rejects siteData aliases that collide on the same canonical country', () => {
    const record = {
      name: 'Alias collision',
      sku: 'ALIAS-1',
      country: 'MY',
      cost: 1,
      productWeight: 1,
      supplierTaxPoint: 0,
      vatRate: 1,
      corporateIncomeTaxRate: 5,
      siteData: {
        MY: { totalRevenue: 10 },
        MYR: { totalRevenue: 20 },
      },
    };

    const single = normalizeImportedProductRecord(record, 'MY');
    expect(single.ok).toBe(false);
    if (single.ok === false) {
      expect(single.errors).toContainEqual({ field: 'siteData.MYR', code: 'invalid_enum' });
    }
    expect(normalizeImportedProductBatch([
      { ...record, sku: 'VALID-BEFORE', siteData: undefined },
      record,
    ], 'MY').ok).toBe(false);
  });
});
