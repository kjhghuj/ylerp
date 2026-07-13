export const MAX_SALES_IMPORT_ROWS = 10_000;
export const MAX_SALES_VALUE = 1_000_000_000;
export const MAX_SKU_LENGTH = 200;
export const MAX_TITLE_LENGTH = 500;
export const MAX_SPEC_LENGTH = 500;
export const MAX_SHOP_LENGTH = 200;

export class SalesImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesImportValidationError';
  }
}

export interface SalesImportRowInput {
  platformSku?: unknown;
  sourceSku?: unknown;
  validSales?: unknown;
  title?: unknown;
  spec?: unknown;
  shop?: unknown;
}

export interface AggregatedSalesImportItem {
  platformSku: string | null;
  sourceSku: string | null;
  validSales: number;
  title: string | null;
  spec: string | null;
  shop: string | null;
  targetSku: string | null;
}

export interface TargetSalesAggregate {
  targetSku: string;
  validSales: number;
  itemIds: string[];
}

export const normalizeRestockSku = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new SalesImportValidationError('SKU must be a string or number');
  }
  return String(value).replace(/\t/g, '').trim().toUpperCase();
};

const readOptionalString = (value: unknown, field: string, maxLength: number): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new SalesImportValidationError(`${field} must be a string or number`);
  }
  const normalized = String(value).trim();
  if (normalized.length > maxLength) throw new SalesImportValidationError(`${field} exceeds ${maxLength} characters`);
  return normalized || null;
};

const readSku = (value: unknown, field: string): string | null => {
  const normalized = normalizeRestockSku(value);
  if (normalized.length > MAX_SKU_LENGTH) {
    throw new SalesImportValidationError(`${field} exceeds ${MAX_SKU_LENGTH} characters`);
  }
  return normalized || null;
};

const readValidSales = (value: unknown): number => {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    throw new SalesImportValidationError('validSales must be a finite non-negative number');
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new SalesImportValidationError('validSales must be a finite non-negative number');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SALES_VALUE) {
    throw new SalesImportValidationError(`validSales must be between 0 and ${MAX_SALES_VALUE}`);
  }
  return parsed;
};

const normalizeReusableMappings = (mappings: ReadonlyMap<string, string>): Map<string, string> => {
  const normalized = new Map<string, string>();
  for (const [externalSku, targetSku] of mappings.entries()) {
    const externalKey = readSku(externalSku, 'externalSku');
    const targetKey = readSku(targetSku, 'targetSku');
    if (externalKey && targetKey) normalized.set(externalKey, targetKey);
  }
  return normalized;
};

export const aggregateSalesImportRows = (
  rows: unknown,
  reusableMappings: ReadonlyMap<string, string> = new Map(),
): AggregatedSalesImportItem[] => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new SalesImportValidationError('rows must contain at least one item');
  }
  if (rows.length > MAX_SALES_IMPORT_ROWS) {
    throw new SalesImportValidationError(`rows exceeds ${MAX_SALES_IMPORT_ROWS}`);
  }

  const mappings = normalizeReusableMappings(reusableMappings);
  const grouped = new Map<string, AggregatedSalesImportItem>();
  const pendingWithoutPlatformSku: AggregatedSalesImportItem[] = [];

  rows.forEach((rawRow, index) => {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
      throw new SalesImportValidationError(`rows[${index}] must be an object`);
    }
    const row = rawRow as SalesImportRowInput;
    const platformSku = readSku(row.platformSku, `rows[${index}].platformSku`);
    const sourceSku = readSku(row.sourceSku, `rows[${index}].sourceSku`);
    const validSales = readValidSales(row.validSales);
    const item: AggregatedSalesImportItem = {
      platformSku,
      sourceSku,
      validSales,
      title: readOptionalString(row.title, `rows[${index}].title`, MAX_TITLE_LENGTH),
      spec: readOptionalString(row.spec, `rows[${index}].spec`, MAX_SPEC_LENGTH),
      shop: readOptionalString(row.shop, `rows[${index}].shop`, MAX_SHOP_LENGTH),
      targetSku: platformSku ? mappings.get(platformSku) || null : null,
    };

    if (!platformSku) {
      pendingWithoutPlatformSku.push(item);
      return;
    }

    const previous = grouped.get(platformSku);
    if (!previous) {
      grouped.set(platformSku, item);
      return;
    }
    const nextSales = previous.validSales + validSales;
    if (!Number.isFinite(nextSales) || nextSales > MAX_SALES_VALUE) {
      throw new SalesImportValidationError(`aggregated validSales for ${platformSku} exceeds ${MAX_SALES_VALUE}`);
    }
    previous.validSales = nextSales;
    previous.sourceSku ||= sourceSku;
    previous.title ||= item.title;
    previous.spec ||= item.spec;
    previous.shop ||= item.shop;
  });

  return [...pendingWithoutPlatformSku, ...grouped.values()];
};

export const buildTargetSalesAggregates = (
  items: Array<{ id: string; targetSku?: string | null; validSales: number }>,
): TargetSalesAggregate[] => {
  const grouped = new Map<string, TargetSalesAggregate>();
  for (const item of items) {
    const targetSku = readSku(item.targetSku, 'targetSku');
    if (!targetSku) continue;
    const validSales = readValidSales(item.validSales);
    const previous = grouped.get(targetSku) || { targetSku, validSales: 0, itemIds: [] };
    const nextSales = previous.validSales + validSales;
    if (!Number.isFinite(nextSales) || nextSales > MAX_SALES_VALUE) {
      throw new SalesImportValidationError(`aggregated validSales for ${targetSku} exceeds ${MAX_SALES_VALUE}`);
    }
    previous.validSales = nextSales;
    previous.itemIds.push(item.id);
    grouped.set(targetSku, previous);
  }
  return Array.from(grouped.values()).sort((a, b) => a.targetSku.localeCompare(b.targetSku));
};
