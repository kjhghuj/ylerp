import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_TAX_RATES,
  extractLegacyProductTaxRateCandidate,
  parseImportedProductTaxRates,
  resolveCanonicalProductTaxRates,
} from '../modules/productTaxRates';

describe('canonical product tax rates', () => {
  const legacyTemplate = extractLegacyProductTaxRateCandidate({
    vatRate: 6,
    corporateIncomeTaxRate: 10,
  });

  it('uses canonical product fields when present, including negative and legal zero', () => {
    expect(resolveCanonicalProductTaxRates({
      vatRate: -5,
      corporateIncomeTaxRate: 0,
    }, [legacyTemplate])).toEqual({
      vatRate: -5,
      corporateIncomeTaxRate: 0,
    });
  });

  it('falls back to negative and greater-than-100 legacy copies only when product fields are missing', () => {
    const historicalTemplate = extractLegacyProductTaxRateCandidate({
      vatRate: '-6',
      corporateIncomeTaxRate: '1.25e2',
    });

    expect(resolveCanonicalProductTaxRates({}, [historicalTemplate])).toEqual({
      vatRate: -6,
      corporateIncomeTaxRate: 125,
    });
  });

  it('uses the first current template containing each legacy field and then safe defaults', () => {
    const first = extractLegacyProductTaxRateCandidate({ corporateIncomeTaxRate: '7.5' });
    const second = extractLegacyProductTaxRateCandidate({ vatRate: '0', corporateIncomeTaxRate: 9 });

    expect(resolveCanonicalProductTaxRates({}, [first, second])).toEqual({
      vatRate: 0,
      corporateIncomeTaxRate: 7.5,
    });
    expect(resolveCanonicalProductTaxRates({}, [])).toEqual(DEFAULT_PRODUCT_TAX_RATES);
  });

  it('does not use template fallback for an explicitly present but invalid canonical field', () => {
    expect(resolveCanonicalProductTaxRates({
      vatRate: Number.NaN,
      corporateIncomeTaxRate: undefined,
    }, [legacyTemplate])).toEqual({
      vatRate: DEFAULT_PRODUCT_TAX_RATES.vatRate,
      corporateIncomeTaxRate: DEFAULT_PRODUCT_TAX_RATES.corporateIncomeTaxRate,
    });
  });

  it('extracts strict raw tax candidates from flat, canonical standard and canonical graph payloads', () => {
    const validRates = {
      vatRate: -6,
      corporateIncomeTaxRate: 125,
    };
    expect(extractLegacyProductTaxRateCandidate({
      vatRate: '-6',
      corporateIncomeTaxRate: '1.25e2',
    })).toEqual(validRates);
    expect(extractLegacyProductTaxRateCandidate({
      kind: 'standard',
      schemaVersion: 2,
      nodeData: {
        vatRate: '-6',
        corporateIncomeTaxRate: '1.25e2',
      },
      extraData: {},
    })).toEqual(validRates);
    expect(extractLegacyProductTaxRateCandidate({
      kind: 'graph',
      schemaVersion: 2,
      nodeData: {
        vatRate: '-6',
        corporateIncomeTaxRate: '1.25e2',
      },
      extraData: {},
      graphTemplateId: 'graph-1',
      graphTemplateSnapshot: {},
      graphInputValues: {},
      graphOutputValues: {},
    })).toEqual(validRates);
  });

  it('skips invalid raw legacy candidates per field and selects the next valid template', () => {
    const candidates = [
      extractLegacyProductTaxRateCandidate({
        vatRate: '0x10',
        corporateIncomeTaxRate: '',
      }),
      extractLegacyProductTaxRateCandidate({
        vatRate: true,
        corporateIncomeTaxRate: '1e-999999',
      }),
      extractLegacyProductTaxRateCandidate({
        vatRate: '-6',
        corporateIncomeTaxRate: '1.25e2',
      }),
    ];

    expect(resolveCanonicalProductTaxRates({}, candidates)).toEqual({
      vatRate: -6,
      corporateIncomeTaxRate: 125,
    });
  });

  it('uses defaults when every raw legacy candidate is invalid', () => {
    const candidates = [
      extractLegacyProductTaxRateCandidate({
        vatRate: '0x10',
        corporateIncomeTaxRate: null,
      }),
      extractLegacyProductTaxRateCandidate({
        vatRate: ' ',
        corporateIncomeTaxRate: false,
      }),
      extractLegacyProductTaxRateCandidate({
        vatRate: '1e999999',
        corporateIncomeTaxRate: '1e-999999',
      }),
    ];

    expect(resolveCanonicalProductTaxRates({}, candidates)).toEqual(DEFAULT_PRODUCT_TAX_RATES);
  });

  it.each([
    [{ vatRate: '0', corporateIncomeTaxRate: 0 }, { vatRate: 0, corporateIncomeTaxRate: 0 }],
    [{ vatRate: '6.5', corporateIncomeTaxRate: '7.5' }, { vatRate: 6.5, corporateIncomeTaxRate: 7.5 }],
    [{ vatRate: ' \t-5e0\r\n', corporateIncomeTaxRate: '1.25e2' }, { vatRate: -5, corporateIncomeTaxRate: 125 }],
    [{ vatRate: '.5', corporateIncomeTaxRate: '+1.2' }, { vatRate: 0.5, corporateIncomeTaxRate: 1.2 }],
  ])('normalizes JSON import tax fields %#', (source, expected) => {
    expect(parseImportedProductTaxRates(source)).toEqual(expected);
  });

  it.each([
    [{ vatRate: '0x10', corporateIncomeTaxRate: '0b10' }],
    [{ vatRate: '1e999999', corporateIncomeTaxRate: '1e-999999' }],
    [{ vatRate: true, corporateIncomeTaxRate: null }],
    [{ vatRate: '', corporateIncomeTaxRate: ' \t\r\n\f\v' }],
  ])('defaults invalid JSON decimal tax fields %#', source => {
    expect(parseImportedProductTaxRates(source)).toEqual(DEFAULT_PRODUCT_TAX_RATES);
  });
});
