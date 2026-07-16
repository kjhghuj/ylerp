export const DEFAULT_PRODUCT_TAX_RATES = Object.freeze({
  vatRate: 1,
  corporateIncomeTaxRate: 5,
});

export type ProductTaxRateField = keyof typeof DEFAULT_PRODUCT_TAX_RATES;

export class ProductTaxRateValidationError extends Error {
  constructor(public readonly field: ProductTaxRateField) {
    super(`Invalid product tax rate: ${field}`);
    this.name = 'ProductTaxRateValidationError';
  }
}

const hasOwn = (value: object, key: PropertyKey): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const COMMON_ASCII_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
const FINITE_DECIMAL_PATTERN =
  /^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][+-]?[0-9]+)?$/;

const trimCommonAsciiWhitespace = (value: string): string => (
  value.replace(COMMON_ASCII_WHITESPACE, '')
);

export const parseFiniteDecimalTaxRate = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value === 0 ? 0 : value;
  }
  if (typeof value !== 'string') return undefined;

  const normalized = trimCommonAsciiWhitespace(value);
  if (!normalized || !FINITE_DECIMAL_PATTERN.test(normalized)) return undefined;

  const significand = normalized.toLowerCase().split('e', 1)[0];
  if (!/[1-9]/.test(significand)) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
};

export const parseOptionalProductTaxRates = (
  source: Record<string, unknown>,
): Partial<Record<ProductTaxRateField, number>> => {
  const result: Partial<Record<ProductTaxRateField, number>> = {};
  for (const field of Object.keys(DEFAULT_PRODUCT_TAX_RATES) as ProductTaxRateField[]) {
    if (!hasOwn(source, field)) continue;
    const parsed = parseFiniteDecimalTaxRate(source[field]);
    if (parsed === undefined) throw new ProductTaxRateValidationError(field);
    result[field] = parsed;
  }
  return result;
};

export interface ProductTaxBackfillProduct {
  id: string;
  country?: string | null;
  sites?: string[] | null;
  vatRate?: number | null;
  corporateIncomeTaxRate?: number | null;
}

export interface ProductTaxBackfillTemplate {
  id: string;
  country: string;
  data: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  SG: 'SGD',
  MY: 'MYR',
  PH: 'PHP',
  TH: 'THB',
  ID: 'IDR',
  CN: 'CNY',
};

const normalizeSite = (value: string | null | undefined): string => {
  const normalized = value
    ? trimCommonAsciiWhitespace(value).toUpperCase()
    : '';
  return COUNTRY_TO_CURRENCY[normalized] || normalized;
};

const toTimestamp = (value: string | Date): number => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const templateSitePriority = (
  product: ProductTaxBackfillProduct,
  template: ProductTaxBackfillTemplate,
): number => {
  const templateSite = normalizeSite(template.country);
  if (templateSite && templateSite === normalizeSite(product.country)) return 0;
  const productSites = product.sites || [];
  return productSites.some(site => normalizeSite(site) === templateSite) ? 1 : 2;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readTemplateTaxRate = (
  template: ProductTaxBackfillTemplate,
  field: ProductTaxRateField,
): number | undefined => (
  isRecord(template.data) ? parseFiniteDecimalTaxRate(template.data[field]) : undefined
);

export const resolveProductTaxRateBackfill = (
  product: ProductTaxBackfillProduct,
  templates: ProductTaxBackfillTemplate[],
): Record<ProductTaxRateField, number> => {
  const ordered = [...templates].sort((left, right) => (
    templateSitePriority(product, left) - templateSitePriority(product, right) ||
    toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt) ||
    toTimestamp(right.createdAt) - toTimestamp(left.createdAt) ||
    left.id.localeCompare(right.id)
  ));

  const resolveField = (field: ProductTaxRateField): number => {
    const canonical = product[field];
    if (canonical !== undefined && canonical !== null) return canonical;
    for (const template of ordered) {
      const candidate = readTemplateTaxRate(template, field);
      if (candidate !== undefined) return candidate;
    }
    return DEFAULT_PRODUCT_TAX_RATES[field];
  };

  return {
    vatRate: resolveField('vatRate'),
    corporateIncomeTaxRate: resolveField('corporateIncomeTaxRate'),
  };
};
