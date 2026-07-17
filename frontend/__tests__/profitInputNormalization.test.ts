import { describe, expect, it } from 'vitest';
import {
  MAX_STANDARD_PROFIT_INPUT_ABS,
  normalizeHistoricalSiteInputs,
  normalizeProfitGlobalInputs,
  normalizeSiteInputs,
  normalizeStandardNodeData,
  parseCanonicalProfitNumber,
} from '../modules/profit/profitInputNormalization';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';

describe('profit input normalization', () => {
  it.each([
    [0, 0],
    [-2.5, -2.5],
    ['0', 0],
    [' 12.50 ', 12.5],
    ['1e2', 100],
  ])('accepts canonical finite value %s', (raw, expected) => {
    expect(parseCanonicalProfitNumber(raw, { field: 'value' })).toEqual({
      ok: true,
      value: expected,
    });
  });

  it.each(['', '   ', 'abc', 'Infinity', '0x10', Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-canonical interactive value %s instead of silently coercing to zero',
    (raw) => {
      const result = parseCanonicalProfitNumber(raw, { field: 'value' });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.error.field).toBe('value');
    },
  );

  it('rejects trailing junk and values beyond the shared safe-integer magnitude limit', () => {
    expect(parseCanonicalProfitNumber('12abc', { field: 'value' }).ok).toBe(false);
    expect(parseCanonicalProfitNumber(MAX_STANDARD_PROFIT_INPUT_ABS + 1, { field: 'value' })).toEqual({
      ok: false,
      error: { field: 'value', code: 'max', max: MAX_STANDARD_PROFIT_INPUT_ABS },
    });
    expect(parseCanonicalProfitNumber(-(MAX_STANDARD_PROFIT_INPUT_ABS + 1), { field: 'tax' })).toEqual({
      ok: false,
      error: { field: 'tax', code: 'min', min: -MAX_STANDARD_PROFIT_INPUT_ABS },
    });
  });

  it('reports explicit field bounds before the generic safe-range bound', () => {
    expect(parseCanonicalProfitNumber(-(MAX_STANDARD_PROFIT_INPUT_ABS + 1), {
      field: 'cost',
      min: 0,
    })).toEqual({
      ok: false,
      error: { field: 'cost', code: 'min', min: 0 },
    });
    expect(parseCanonicalProfitNumber(MAX_STANDARD_PROFIT_INPUT_ABS + 1, {
      field: 'couponRatio',
      max: 100,
    })).toEqual({
      ok: false,
      error: { field: 'couponRatio', code: 'max', max: 100 },
    });
  });

  it('uses an explicit nullish default while preserving explicit zero', () => {
    expect(parseCanonicalProfitNumber(undefined, { field: 'adROI', defaultValue: 15 })).toEqual({
      ok: true,
      value: 15,
    });
    expect(parseCanonicalProfitNumber(null, { field: 'adROI', defaultValue: 15 })).toEqual({
      ok: true,
      value: 15,
    });
    expect(parseCanonicalProfitNumber(0, { field: 'adROI', defaultValue: 15 })).toEqual({
      ok: true,
      value: 0,
    });
  });

  it('accepts negative finite tax fields but rejects negative cost and weight', () => {
    expect(normalizeProfitGlobalInputs({
      name: 'Product',
      sku: 'SKU',
      purchaseCost: '10.5',
      productWeight: 0,
      supplierTaxPoint: '-3',
      supplierInvoice: 'no',
      vatRate: -5,
      corporateIncomeTaxRate: '-8.5',
    })).toEqual({
      ok: true,
      value: {
        name: 'Product',
        sku: 'SKU',
        purchaseCost: 10.5,
        productWeight: 0,
        supplierTaxPoint: -3,
        supplierInvoice: 'no',
        vatRate: -5,
        corporateIncomeTaxRate: -8.5,
      },
    });

    const negative = normalizeProfitGlobalInputs({
      name: 'Product',
      sku: 'SKU',
      purchaseCost: -1,
      productWeight: -2,
      supplierTaxPoint: 0,
      supplierInvoice: 'yes',
      vatRate: 0,
      corporateIncomeTaxRate: 0,
    });
    expect(negative.ok).toBe(false);
    if (negative.ok === false) {
      expect(negative.errors.map(error => error.field)).toEqual(
        expect.arrayContaining(['purchaseCost', 'productWeight']),
      );
    }
  });

  it('trims required identity fields, defaults only a missing invoice enum, and rejects explicit invalid enum values', () => {
    const normalized = normalizeProfitGlobalInputs({
      name: '  Product  ',
      sku: '  SKU-1  ',
      purchaseCost: 10,
      productWeight: 0,
      supplierTaxPoint: 0,
      vatRate: -5,
      corporateIncomeTaxRate: 5,
    });
    expect(normalized).toEqual({
      ok: true,
      value: expect.objectContaining({ name: 'Product', sku: 'SKU-1', supplierInvoice: 'no' }),
    });

    const invalid = normalizeProfitGlobalInputs({
      name: '   ',
      sku: '\t',
      purchaseCost: 10,
      productWeight: 0,
      supplierTaxPoint: 0,
      supplierInvoice: 'sometimes',
      vatRate: 1,
      corporateIncomeTaxRate: 5,
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) {
      expect(invalid.errors).toEqual(expect.arrayContaining([
        { field: 'name', code: 'required' },
        { field: 'sku', code: 'required' },
        { field: 'supplierInvoice', code: 'invalid_enum' },
      ]));
    }
  });

  it.each([
    [{ sellerCouponType: 'fixed', sellerCoupon: -0.01 }, 'sellerCoupon'],
    [{ sellerCouponType: 'percent', sellerCoupon: -0.01 }, 'sellerCoupon'],
    [{ sellerCouponType: 'percent', sellerCoupon: 100.01 }, 'sellerCoupon'],
    [{ sellerCouponPlatformRatio: -0.01 }, 'sellerCouponPlatformRatio'],
    [{ sellerCouponPlatformRatio: 100.01 }, 'sellerCouponPlatformRatio'],
    [{ adROI: -0.01 }, 'adROI'],
    [{ totalRevenue: -0.01 }, 'totalRevenue'],
    [{ platformInfrastructureFee: -0.01 }, 'platformInfrastructureFee'],
    [{ sellerCouponType: 'future' }, 'sellerCouponType'],
  ])('rejects site boundary violation in %s', (partial, expectedField) => {
    const result = normalizeSiteInputs({ ...DEFAULT_SITE_INPUTS, ...partial });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.map(error => error.field)).toContain(expectedField);
    }
  });

  it('accepts inclusive coupon, ratio and adROI boundaries', () => {
    const zero = normalizeSiteInputs({
      ...DEFAULT_SITE_INPUTS,
      sellerCouponType: 'percent',
      sellerCoupon: 0,
      sellerCouponPlatformRatio: 0,
      adROI: 0,
    });
    const upper = normalizeSiteInputs({
      ...DEFAULT_SITE_INPUTS,
      sellerCouponType: 'percent',
      sellerCoupon: 100,
      sellerCouponPlatformRatio: 100,
      adROI: '15',
    });
    expect(zero).toEqual({ ok: true, value: expect.objectContaining({ sellerCoupon: 0, sellerCouponPlatformRatio: 0, adROI: 0 }) });
    expect(upper).toEqual({ ok: true, value: expect.objectContaining({ sellerCoupon: 100, sellerCouponPlatformRatio: 100, adROI: 15 }) });
  });

  it('normalizes every standard node numeric string without clamping negative values', () => {
    const rawData = Object.fromEntries(
      Object.entries(DEFAULT_NODE_DATA).map(([key, value]) => [key, String(value)]),
    );
    rawData.extraShippingFee = '-2.5';
    rawData.firstWeight = '0';

    expect(normalizeStandardNodeData(rawData)).toEqual({
      ok: true,
      value: {
        ...DEFAULT_NODE_DATA,
        extraShippingFee: -2.5,
        firstWeight: 0,
      },
    });
  });

  it.each(['', '   ', 'not-a-number', Number.NaN, Number.POSITIVE_INFINITY])(
    'blocks an invalid standard-node firstWeight value %s',
    (firstWeight) => {
      const result = normalizeStandardNodeData({ ...DEFAULT_NODE_DATA, firstWeight });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.errors.map(error => error.field)).toContain('firstWeight');
    },
  );

  it('reads historical site values tolerantly, defaulting missing or invalid adROI to 15 and preserving zero', () => {
    expect(normalizeHistoricalSiteInputs({ adROI: undefined }).adROI).toBe(15);
    expect(normalizeHistoricalSiteInputs({ adROI: 'invalid' }).adROI).toBe(15);
    expect(normalizeHistoricalSiteInputs({ adROI: -1 }).adROI).toBe(15);
    expect(normalizeHistoricalSiteInputs({ adROI: 0 }).adROI).toBe(0);
    expect(normalizeHistoricalSiteInputs({ adROI: '0' }).adROI).toBe(0);
    expect(normalizeHistoricalSiteInputs({ sellerCouponType: 'future' }).sellerCouponType).toBe('fixed');
  });
});
