import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PRODUCT_TAX_RATES,
  ProductTaxRateValidationError,
  parseOptionalProductTaxRates,
  resolveProductTaxRateBackfill,
} from '../productTaxRates';

describe('product tax rate normalization and backfill', () => {
  it.each([
    [6, 6],
    ['6.5', 6.5],
    ['0', 0],
    [0, 0],
    [-5, -5],
    ['-5', -5],
    [101, 101],
    ['+1.2', 1.2],
    ['.5', 0.5],
    ['1.', 1],
    ['1e-3', 0.001],
    [" \t-12.5e+1\r\n", -125],
  ])('accepts valid tax rate %#', (value, expected) => {
    expect(parseOptionalProductTaxRates({ vatRate: value })).toEqual({ vatRate: expected });
  });

  it.each([
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [''],
    [' \t\r\n\f\v'],
    ['not-a-number'],
    ['0x10'],
    ['0b10'],
    ['1e999999'],
    ['1e-999999'],
    [true],
    [null],
  ])('rejects non-decimal or non-finite tax rate %#', value => {
    expect(() => parseOptionalProductTaxRates({ vatRate: value })).toThrow(ProductTaxRateValidationError);
  });

  it('keeps missing fields absent for legacy clients', () => {
    expect(parseOptionalProductTaxRates({})).toEqual({});
  });

  it('uses deterministic site then time ordering independently for each field', () => {
    const result = resolveProductTaxRateBackfill({
      id: 'product-1',
      country: 'MY',
      sites: ['SG', 'MY'],
      vatRate: null,
      corporateIncomeTaxRate: null,
    }, [
      {
        id: 'other-newest',
        country: 'TH',
        updatedAt: '2026-07-20T00:00:00.000Z',
        createdAt: '2026-07-20T00:00:00.000Z',
        data: { vatRate: 200, corporateIncomeTaxRate: -20 },
      },
      {
        id: 'site-newer',
        country: 'SGD',
        updatedAt: '2026-07-19T00:00:00.000Z',
        createdAt: '2026-07-19T00:00:00.000Z',
        data: { vatRate: 9, corporateIncomeTaxRate: 11 },
      },
      {
        id: 'primary-older',
        country: 'MYR',
        updatedAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        data: { vatRate: '0', corporateIncomeTaxRate: 'invalid' },
      },
      {
        id: 'primary-newer',
        country: 'MY',
        updatedAt: '2026-07-02T00:00:00.000Z',
        createdAt: '2026-07-02T00:00:00.000Z',
        data: { vatRate: 'invalid', corporateIncomeTaxRate: '7.5' },
      },
    ]);

    expect(result).toEqual({
      vatRate: 0,
      corporateIncomeTaxRate: 7.5,
    });
  });

  it('uses stable id ordering when site and timestamps tie', () => {
    const result = resolveProductTaxRateBackfill({
      id: 'product-2',
      country: 'SG',
      sites: ['SG'],
      vatRate: null,
      corporateIncomeTaxRate: null,
    }, [
      {
        id: 'b-template',
        country: 'SG',
        updatedAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        data: { vatRate: 8, corporateIncomeTaxRate: 9 },
      },
      {
        id: 'a-template',
        country: 'SGD',
        updatedAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        data: { vatRate: 6, corporateIncomeTaxRate: 7 },
      },
    ]);

    expect(result).toEqual({ vatRate: 6, corporateIncomeTaxRate: 7 });
  });

  it('does not overwrite existing canonical values and defaults missing invalid legacy data', () => {
    const result = resolveProductTaxRateBackfill({
      id: 'product-3',
      country: 'PH',
      sites: ['PH'],
      vatRate: 0,
      corporateIncomeTaxRate: null,
    }, [{
      id: 'invalid-template',
      country: 'PHP',
      updatedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      data: { vatRate: 12, corporateIncomeTaxRate: '0x65' },
    }]);

    expect(result).toEqual({
      vatRate: 0,
      corporateIncomeTaxRate: DEFAULT_PRODUCT_TAX_RATES.corporateIncomeTaxRate,
    });
  });

  it('allows negative and greater-than-100 legacy values while ignoring non-finite decimals', () => {
    const result = resolveProductTaxRateBackfill({
      id: 'product-negative',
      country: 'MY',
      sites: ['MY'],
      vatRate: null,
      corporateIncomeTaxRate: null,
    }, [
      {
        id: 'invalid-newest',
        country: 'MY',
        updatedAt: '2026-07-03T00:00:00.000Z',
        createdAt: '2026-07-03T00:00:00.000Z',
        data: {
          vatRate: '1e999999',
          corporateIncomeTaxRate: '0x10',
        },
      },
      {
        id: 'valid-older',
        country: 'MY',
        updatedAt: '2026-07-02T00:00:00.000Z',
        createdAt: '2026-07-02T00:00:00.000Z',
        data: {
          vatRate: '-5',
          corporateIncomeTaxRate: '1.25e2',
        },
      },
    ]);

    expect(result).toEqual({
      vatRate: -5,
      corporateIncomeTaxRate: 125,
    });
  });

  it('requires non-empty product and template countries before primary-country priority', () => {
    const result = resolveProductTaxRateBackfill({
      id: 'product-sites',
      country: ' \t ',
      sites: [' MY '],
      vatRate: null,
      corporateIncomeTaxRate: null,
    }, [
      {
        id: 'blank-country-newer',
        country: '\r\n',
        updatedAt: '2026-07-03T00:00:00.000Z',
        createdAt: '2026-07-03T00:00:00.000Z',
        data: { vatRate: 99, corporateIncomeTaxRate: 99 },
      },
      {
        id: 'site-country-older',
        country: '\tMYR\n',
        updatedAt: '2026-07-02T00:00:00.000Z',
        createdAt: '2026-07-02T00:00:00.000Z',
        data: { vatRate: -6, corporateIncomeTaxRate: 150 },
      },
    ]);

    expect(result).toEqual({
      vatRate: -6,
      corporateIncomeTaxRate: 150,
    });
  });

  it('ships a PostgreSQL migration with the equivalent safe decimal and ordering contract', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../prisma/migrations/20260716170000_add_product_tax_rates/migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('AND p."vatRate" IS NULL');
    expect(sql).toContain('AND p."corporateIncomeTaxRate" IS NULL');
    expect(sql).toContain('ppt."updatedAt" DESC');
    expect(sql).toContain('ppt."createdAt" DESC');
    expect(sql).toContain('ppt."id" ASC');
    expect(sql).toContain("JSONB_TYPEOF(ppt.\"data\" -> 'vatRate') IN ('number', 'string')");
    expect(sql).toContain('NUMERIC_VALUE_OUT_OF_RANGE');
    expect(sql).toContain("E' \\t\\n\\r\\f'");
    expect(sql).toContain("CHR(11)");
    expect(sql).toContain("^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$");
    expect(sql).toContain('NULLIF');
    expect(sql).not.toContain('BETWEEN 0 AND 100');
    expect(sql).not.toContain('::NUMERIC');
    expect(sql).toContain('ALTER COLUMN "vatRate" SET NOT NULL');
    expect(sql).toContain('ALTER COLUMN "corporateIncomeTaxRate" SET NOT NULL');
  });
});
