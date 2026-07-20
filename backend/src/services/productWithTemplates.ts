import { Prisma, PrismaClient, Product } from '@prisma/client';
import {
  parseOptionalProductTaxRates,
  ProductTaxRateValidationError,
} from './productTaxRates';
import {
  ProfitTemplateDataValidationError,
  validateProductProfitTemplateData,
} from './profitTemplateData';

type JsonRecord = Record<string, unknown>;

const COUNTRY_TO_CURRENCY: Readonly<Record<string, string>> = Object.freeze({
  SG: 'SGD',
  MY: 'MYR',
  PH: 'PHP',
  TH: 'THB',
  ID: 'IDR',
  CN: 'CNY',
});
const SUPPORTED_PRODUCT_TEMPLATE_CURRENCIES = new Set(Object.values(COUNTRY_TO_CURRENCY));

export const PRODUCT_WITH_TEMPLATES_LIMITS = Object.freeze({
  maxRequestBytes: 2 * 1024 * 1024,
  maxTemplateMutations: 50,
  maxProductSites: 100,
  maxSitePatchSites: 1,
  maxJsonDepth: 32,
  maxJsonNodes: 10_000,
  maxJsonStringLength: 65_536,
  maxNameLength: 512,
  maxIdentifierLength: 256,
  maxCountryLength: 64,
  maxPlatformLength: 128,
  maxEnumLength: 32,
});

export const INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE =
  'INVALID_PRODUCT_WITH_TEMPLATES_REQUEST';

const PRODUCT_FIELDS = new Set([
  'name',
  'sku',
  'country',
  'cost',
  'productWeight',
  'supplierTaxPoint',
  'supplierInvoice',
  'vatRate',
  'corporateIncomeTaxRate',
  'sellerCouponType',
  'sellerCoupon',
  'sellerCouponPlatformRatio',
  'adROI',
  'totalRevenue',
  'platformInfrastructureFee',
  'sites',
  'siteData',
]);

const SITE_PATCH_FIELDS = new Set(['sites', 'siteData']);

export class ProductWithTemplatesError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'ProductWithTemplatesError';
  }
}

interface ParsedTemplatePayload {
  templateId: string | null;
  name: string;
  country: string;
  platform: string | null;
  data: Prisma.InputJsonObject;
}

interface ParsedCreateMutation extends ParsedTemplatePayload {
  operation: 'create';
}

interface ParsedUpdateMutation extends ParsedTemplatePayload {
  operation: 'update';
  linkId: string;
}

export type ParsedTemplateMutation = ParsedCreateMutation | ParsedUpdateMutation;

export type ProductWithTemplatesMode = 'create' | 'update';

interface ParsedSitePatch {
  sites: string[];
  siteData: JsonRecord;
}

export interface ParsedProductWithTemplatesRequest {
  product: Record<string, unknown>;
  sitePatch?: ParsedSitePatch;
  templateMutations: ParsedTemplateMutation[];
  ensureDefaultTemplate?: ParsedTemplatePayload;
}

export interface SaveProductWithTemplatesOptions {
  prisma: Pick<PrismaClient, '$transaction'>;
  userId: string;
  productId?: string;
  request: ParsedProductWithTemplatesRequest;
}

const badRequest = (message: string): never => {
  throw new ProductWithTemplatesError(400, message);
};

const budgetExceeded = (): never => {
  throw new ProductWithTemplatesError(400, 'Invalid product with templates request');
};

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const requireRecord = (value: unknown, field: string): JsonRecord => {
  if (!isRecord(value)) badRequest(`${field} must be an object`);
  return value as JsonRecord;
};

const requireNonEmptyString = (
  value: unknown,
  field: string,
  maxLength: number = PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength,
): string => {
  if (typeof value !== 'string' || !value.trim()) {
    badRequest(`${field} must be a non-empty string`);
  }
  if ((value as string).length > maxLength) budgetExceeded();
  return value as string;
};

const serializedStringBytes = (value: string): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return budgetExceeded();
  }
};

interface JsonBudgetChecks {
  structure: boolean;
  bytes: boolean;
}

const validateJsonBudget = (
  value: unknown,
  checks: JsonBudgetChecks,
): void => {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();

  const addBytes = (count: number): void => {
    if (!checks.bytes) return;
    bytes += count;
    if (bytes > PRODUCT_WITH_TEMPLATES_LIMITS.maxRequestBytes) budgetExceeded();
  };

  const visit = (current: unknown, depth: number): void => {
    nodes += 1;
    if (
      checks.structure && (
        nodes > PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonNodes ||
        depth > PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonDepth
      )
    ) {
      budgetExceeded();
    }

    if (current === null) {
      addBytes(4);
      return;
    }
    if (typeof current === 'string') {
      if (
        checks.structure &&
        current.length > PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonStringLength
      ) budgetExceeded();
      addBytes(serializedStringBytes(current));
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) budgetExceeded();
      addBytes(String(current).length);
      return;
    }
    if (typeof current === 'boolean') {
      addBytes(current ? 4 : 5);
      return;
    }
    if (typeof current !== 'object') budgetExceeded();
    if (ancestors.has(current as object)) budgetExceeded();
    ancestors.add(current as object);

    if (Array.isArray(current)) {
      addBytes(2 + Math.max(0, current.length - 1));
      for (const item of current) visit(item, depth + 1);
      ancestors.delete(current);
      return;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) budgetExceeded();
    const entries = Object.entries(current as JsonRecord);
    addBytes(2 + Math.max(0, entries.length - 1));
    for (const [key, item] of entries) {
      if (
        checks.structure &&
        key.length > PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonStringLength
      ) budgetExceeded();
      addBytes(serializedStringBytes(key) + 1);
      visit(item, depth + 1);
    }
    ancestors.delete(current as object);
  };

  visit(value, 0);
};

const validateAtomicRequestBudget = (value: unknown): void => {
  validateJsonBudget(value, { structure: true, bytes: true });
};

const requireFiniteNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    badRequest(`${field} must be a finite number`);
  }
  return value as number;
};

const hasOwn = (value: object, key: PropertyKey): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const validateSites = (
  value: unknown,
  field: string,
  maxSites: number,
): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    badRequest(`${field} must be a non-empty array of non-empty strings`);
  }
  const sites = value as unknown[];
  if (sites.length > maxSites) budgetExceeded();
  if (sites.some(site => typeof site !== 'string' || !site.trim())) {
    badRequest(`${field} must be a non-empty array of non-empty strings`);
  }
  if (sites.some(site => (
    (site as string).length > PRODUCT_WITH_TEMPLATES_LIMITS.maxCountryLength
  ))) budgetExceeded();
  if (new Set(sites as string[]).size !== sites.length) {
    badRequest(`${field} must not contain duplicate sites`);
  }
  return sites as string[];
};

const validateSiteData = (value: unknown, field: string): JsonRecord => {
  if (!isRecord(value)) badRequest(`${field} must be an object`);
  return value as JsonRecord;
};

const parseSitePatch = (value: unknown): ParsedSitePatch => {
  const source = requireRecord(value, 'sitePatch');
  for (const key of Object.keys(source)) {
    if (!SITE_PATCH_FIELDS.has(key)) badRequest(`sitePatch.${key} is not supported`);
  }
  const sites = validateSites(
    source.sites,
    'sitePatch.sites',
    PRODUCT_WITH_TEMPLATES_LIMITS.maxSitePatchSites,
  );
  const siteData = validateSiteData(source.siteData, 'sitePatch.siteData');
  if (Object.values(siteData).some(siteValue => !isRecord(siteValue))) {
    badRequest('sitePatch.siteData values must be objects');
  }
  const siteKeys = Object.keys(siteData);
  if (
    siteKeys.length !== sites.length ||
    siteKeys.some(site => !sites.includes(site))
  ) {
    badRequest('sitePatch.siteData keys must exactly match sitePatch.sites');
  }
  return { sites, siteData };
};

const validateFinalProductState = (value: JsonRecord): void => {
  if (!Array.isArray(value.sites)) budgetExceeded();
  validateSites(
    value.sites,
    'product.sites',
    PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites,
  );
  if (!isRecord(value.siteData)) budgetExceeded();
  validateJsonBudget(value.siteData, { structure: true, bytes: false });
  validateJsonBudget(value, { structure: false, bytes: true });
};

const validateProduct = (value: unknown): Record<string, unknown> => {
  const source = requireRecord(value, 'product');
  for (const key of Object.keys(source)) {
    if (!PRODUCT_FIELDS.has(key)) badRequest(`product.${key} is not supported`);
  }

  const result: Record<string, unknown> = {
    name: requireNonEmptyString(
      source.name,
      'product.name',
      PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength,
    ),
    sku: requireNonEmptyString(
      source.sku,
      'product.sku',
      PRODUCT_WITH_TEMPLATES_LIMITS.maxIdentifierLength,
    ),
    cost: requireFiniteNumber(source.cost, 'product.cost'),
    productWeight: requireFiniteNumber(source.productWeight, 'product.productWeight'),
    supplierTaxPoint: requireFiniteNumber(source.supplierTaxPoint, 'product.supplierTaxPoint'),
    supplierInvoice: requireNonEmptyString(
      source.supplierInvoice,
      'product.supplierInvoice',
      PRODUCT_WITH_TEMPLATES_LIMITS.maxEnumLength,
    ),
  };

  if (source.country !== undefined) {
    if (
      source.country !== null &&
      typeof source.country !== 'string'
    ) {
      badRequest('product.country must be a string or null');
    }
    if (
      typeof source.country === 'string' &&
      source.country.length > PRODUCT_WITH_TEMPLATES_LIMITS.maxCountryLength
    ) budgetExceeded();
    result.country = source.country;
  }

  const optionalNumbers = [
    'sellerCoupon',
    'sellerCouponPlatformRatio',
    'adROI',
    'totalRevenue',
    'platformInfrastructureFee',
  ];
  for (const field of optionalNumbers) {
    if (source[field] !== undefined) {
      result[field] = requireFiniteNumber(source[field], `product.${field}`);
    }
  }

  if (source.sellerCouponType !== undefined) {
    result.sellerCouponType = requireNonEmptyString(
      source.sellerCouponType,
      'product.sellerCouponType',
      PRODUCT_WITH_TEMPLATES_LIMITS.maxEnumLength,
    );
  }

  if (source.sites !== undefined) {
    result.sites = validateSites(
      source.sites,
      'product.sites',
      PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites,
    );
  }

  if (source.siteData !== undefined) {
    result.siteData = validateSiteData(source.siteData, 'product.siteData');
  }

  Object.assign(result, parseOptionalProductTaxRates(source));
  return result;
};

const parseTemplateId = (source: JsonRecord, field: string): string | null => {
  if (!hasOwn(source, 'templateId')) {
    badRequest(`${field}.templateId must be explicitly provided`);
  }
  if (source.templateId === null) return null;
  return requireNonEmptyString(
    source.templateId,
    `${field}.templateId`,
    PRODUCT_WITH_TEMPLATES_LIMITS.maxIdentifierLength,
  );
};

const parsePlatform = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return requireNonEmptyString(value, field, PRODUCT_WITH_TEMPLATES_LIMITS.maxPlatformLength);
};

export const canonicalizeProductTemplateCountry = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  return COUNTRY_TO_CURRENCY[normalized] || normalized;
};

export const parseProductTemplateCountry = (
  value: unknown,
  field: string,
): string => {
  const country = canonicalizeProductTemplateCountry(requireNonEmptyString(
    value,
    field,
    PRODUCT_WITH_TEMPLATES_LIMITS.maxCountryLength,
  ));
  if (!SUPPORTED_PRODUCT_TEMPLATE_CURRENCIES.has(country)) {
    badRequest(`${field} must be a supported profit site`);
  }
  return country;
};

const parseTemplatePayload = (
  source: JsonRecord,
  field: string,
): ParsedTemplatePayload => {
  if (source.type !== undefined && source.type !== 'profit') {
    badRequest(`${field}.type must be profit when provided`);
  }
  return {
    templateId: parseTemplateId(source, field),
    name: requireNonEmptyString(
      source.name,
      `${field}.name`,
      PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength,
    ),
    country: parseProductTemplateCountry(source.country, `${field}.country`),
    platform: parsePlatform(source.platform, `${field}.platform`),
    data: validateProductProfitTemplateData(source.data),
  };
};

const parseMutation = (value: unknown, index: number): ParsedTemplateMutation => {
  const field = `templateMutations[${index}]`;
  const source = requireRecord(value, field);
  if (source.operation !== 'create' && source.operation !== 'update') {
    badRequest(`${field}.operation must be create or update`);
  }
  const payload = parseTemplatePayload(source, field);
  if (source.operation === 'create') {
    if (hasOwn(source, 'linkId')) badRequest(`${field}.linkId is forbidden for create`);
    return { operation: 'create', ...payload };
  }
  return {
    operation: 'update',
    linkId: requireNonEmptyString(
      source.linkId,
      `${field}.linkId`,
      PRODUCT_WITH_TEMPLATES_LIMITS.maxIdentifierLength,
    ),
    ...payload,
  };
};

const parseEnsureDefault = (value: unknown): ParsedTemplatePayload | undefined => {
  if (value === undefined || value === null) return undefined;
  const source = requireRecord(value, 'ensureDefaultTemplate');
  if (source.operation !== undefined || source.linkId !== undefined) {
    badRequest('ensureDefaultTemplate must not contain operation or linkId');
  }
  return parseTemplatePayload(source, 'ensureDefaultTemplate');
};

const identityOf = (template: Pick<ParsedTemplatePayload, 'name' | 'country' | 'platform'>): string => (
  [
    template.name.trim().toLowerCase(),
    canonicalizeProductTemplateCountry(template.country),
    (template.platform || '').trim().toLowerCase(),
  ].join('\u0000')
);

const assertNoBatchDuplicates = (mutations: ParsedTemplateMutation[]): void => {
  const identityOperations = new Map<string, ParsedTemplateMutation['operation']>();
  const linkIds = new Set<string>();
  for (const mutation of mutations) {
    const identity = identityOf(mutation);
    const previousOperation = identityOperations.get(identity);
    if (
      previousOperation === 'create' ||
      (previousOperation !== undefined && mutation.operation === 'create')
    ) {
      badRequest('templateMutations contain a duplicate identity');
    }
    identityOperations.set(identity, mutation.operation);
    if (mutation.operation === 'update') {
      if (linkIds.has(mutation.linkId)) badRequest('templateMutations contain a duplicate linkId');
      linkIds.add(mutation.linkId);
    }
  }
};

export const parseProductWithTemplatesRequest = (
  value: unknown,
  mode: ProductWithTemplatesMode,
): ParsedProductWithTemplatesRequest => {
  validateAtomicRequestBudget(value);
  const body = requireRecord(value, 'body');
  const rawProduct = requireRecord(body.product, 'product');
  let sitePatch: ParsedSitePatch | undefined;
  if (mode === 'create') {
    if (hasOwn(body, 'sitePatch')) badRequest('sitePatch is forbidden for create');
    if (!hasOwn(rawProduct, 'sites') || !hasOwn(rawProduct, 'siteData')) {
      badRequest('product.sites and product.siteData are required for create');
    }
  } else {
    if (hasOwn(rawProduct, 'sites') || hasOwn(rawProduct, 'siteData')) {
      badRequest('product.sites and product.siteData are forbidden for update');
    }
    if (!hasOwn(body, 'sitePatch')) badRequest('sitePatch is required for update');
    sitePatch = parseSitePatch(body.sitePatch);
  }
  const rawTemplateMutations = body.templateMutations;
  if (!Array.isArray(rawTemplateMutations)) {
    badRequest('templateMutations must be an array');
  }
  const templateMutationValues = rawTemplateMutations as unknown[];
  if (
    templateMutationValues.length > PRODUCT_WITH_TEMPLATES_LIMITS.maxTemplateMutations
  ) budgetExceeded();
  const templateMutations = templateMutationValues.map(parseMutation);
  const ensureDefaultTemplate = parseEnsureDefault(body.ensureDefaultTemplate);
  if (templateMutations.length > 0 && ensureDefaultTemplate) {
    badRequest('templateMutations and ensureDefaultTemplate are mutually exclusive');
  }
  assertNoBatchDuplicates(templateMutations);
  return {
    product: validateProduct(rawProduct),
    ...(sitePatch ? { sitePatch } : {}),
    templateMutations,
    ...(ensureDefaultTemplate ? { ensureDefaultTemplate } : {}),
  };
};

const hasPrismaCode = (error: unknown, code: string): boolean => (
  typeof error === 'object' && error !== null &&
  (error as { code?: unknown }).code === code
);

interface ExistingLinkIdentity {
  id: string;
  name: string;
  country: string;
  platform: string | null;
}

type IdentityOwner = string | symbol;

const addIdentityOwner = (
  ownersByIdentity: Map<string, Set<IdentityOwner>>,
  identity: string,
  owner: IdentityOwner,
): void => {
  const owners = ownersByIdentity.get(identity) || new Set<IdentityOwner>();
  owners.add(owner);
  ownersByIdentity.set(identity, owners);
};

const ownerSetsEqual = (
  left: Set<IdentityOwner> | undefined,
  right: Set<IdentityOwner>,
): boolean => (
  !!left && left.size === right.size && Array.from(left).every(owner => right.has(owner))
);

const assertFinalTemplateIdentities = (
  existingLinks: ExistingLinkIdentity[],
  mutations: ParsedTemplateMutation[],
): void => {
  const linksById = new Map(existingLinks.map(link => [link.id, link]));
  const updatesByLinkId = new Map<string, ParsedUpdateMutation>();
  for (const mutation of mutations) {
    if (mutation.operation !== 'update') continue;
    if (!linksById.has(mutation.linkId)) {
      throw new ProductWithTemplatesError(409, 'Product template conflict');
    }
    updatesByLinkId.set(mutation.linkId, mutation);
  }

  const initialOwners = new Map<string, Set<IdentityOwner>>();
  const finalOwners = new Map<string, Set<IdentityOwner>>();
  for (const link of existingLinks) {
    addIdentityOwner(initialOwners, identityOf(link), link.id);
    addIdentityOwner(finalOwners, identityOf(updatesByLinkId.get(link.id) || link), link.id);
  }
  mutations.forEach((mutation, index) => {
    if (mutation.operation === 'create') {
      addIdentityOwner(finalOwners, identityOf(mutation), Symbol(`create:${index}`));
    }
  });

  for (const [identity, owners] of finalOwners) {
    if (owners.size <= 1) continue;
    if (ownerSetsEqual(initialOwners.get(identity), owners)) continue;
    throw new ProductWithTemplatesError(409, 'Product template conflict');
  }
};

const assertSharedTemplatesOwned = async (
  tx: Prisma.TransactionClient,
  userId: string,
  request: ParsedProductWithTemplatesRequest,
): Promise<void> => {
  const ids = Array.from(new Set([
    ...request.templateMutations.map(mutation => mutation.templateId),
    request.ensureDefaultTemplate?.templateId,
  ].filter((id): id is string => typeof id === 'string')));
  if (ids.length === 0) return;
  const owned = await tx.profitTemplate.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new ProductWithTemplatesError(404, 'Template not found');
  }
};

const executeTransaction = async (
  tx: Prisma.TransactionClient,
  options: Omit<SaveProductWithTemplatesOptions, 'prisma'>,
) => {
  const { userId, productId, request } = options;
  let existingLinks: ExistingLinkIdentity[];
  let product: Product;
  if (productId) {
    const existingProduct = await tx.product.findFirst({ where: { id: productId, userId } });
    if (!existingProduct) throw new ProductWithTemplatesError(404, 'Product not found');
    const sitePatch = request.sitePatch;
    if (!sitePatch) {
      throw new ProductWithTemplatesError(400, 'sitePatch is required for update');
    }

    const existingSites = Array.isArray(existingProduct.sites)
      ? existingProduct.sites.filter((site): site is string => typeof site === 'string')
      : [];
    const sites = Array.from(new Set([...existingSites, ...sitePatch.sites]));
    const existingSiteData = isRecord(existingProduct.siteData)
      ? existingProduct.siteData
      : {};
    const siteData = {
      ...existingSiteData,
      ...sitePatch.siteData,
    };
    const productUpdateData: JsonRecord = {
      ...request.product,
      sites,
      siteData,
    };
    validateFinalProductState(productUpdateData);

    await assertSharedTemplatesOwned(tx, userId, request);
    existingLinks = await tx.productProfitTemplate.findMany({
      where: { productId },
      select: { id: true, name: true, country: true, platform: true },
    });
    assertFinalTemplateIdentities(existingLinks, request.templateMutations);
    product = await tx.product.update({
      where: { id: productId },
      data: productUpdateData as Prisma.ProductUncheckedUpdateInput,
    });
  } else {
    await assertSharedTemplatesOwned(tx, userId, request);
    product = await tx.product.create({
      data: { ...request.product, userId } as Prisma.ProductUncheckedCreateInput,
    });
    existingLinks = await tx.productProfitTemplate.findMany({
      where: { productId: product.id },
      select: { id: true, name: true, country: true, platform: true },
    });
    assertFinalTemplateIdentities(existingLinks, request.templateMutations);
  }

  for (const mutation of request.templateMutations) {
    if (mutation.operation === 'create') {
      await tx.productProfitTemplate.create({
        data: {
          productId: product.id,
          templateId: mutation.templateId,
          name: mutation.name,
          country: mutation.country,
          platform: mutation.platform,
          data: mutation.data,
        },
      });
      continue;
    }

    await tx.productProfitTemplate.update({
      where: { id: mutation.linkId },
      data: {
        templateId: mutation.templateId,
        name: mutation.name,
        country: mutation.country,
        platform: mutation.platform,
        data: mutation.data,
      },
    });
  }

  const ensure = request.ensureDefaultTemplate;
  const existingIdentities = new Set(existingLinks.map(link => identityOf(link)));
  if (ensure && !existingIdentities.has(identityOf(ensure))) {
    await tx.productProfitTemplate.create({
      data: {
        productId: product.id,
        templateId: ensure.templateId,
        name: ensure.name,
        country: ensure.country,
        platform: ensure.platform,
        data: ensure.data,
      },
    });
  }

  const productTemplates = await tx.productProfitTemplate.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'desc' },
  });
  return { product, productTemplates };
};

export const saveProductWithTemplates = async (
  options: SaveProductWithTemplatesOptions,
) => {
  const transactionOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  } as const;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await options.prisma.$transaction(
        tx => executeTransaction(tx, options),
        transactionOptions,
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2034')) {
        if (attempt < 2) continue;
        throw new ProductWithTemplatesError(409, 'Concurrent product update conflict');
      }
      throw error;
    }
  }
  throw new ProductWithTemplatesError(409, 'Concurrent product update conflict');
};

export const isProductWithTemplatesPrismaConflict = (error: unknown): boolean => (
  hasPrismaCode(error, 'P2002') || hasPrismaCode(error, 'P2034')
);

export const isProductWithTemplatesValidationError = (error: unknown): boolean => (
  error instanceof ProductTaxRateValidationError ||
  error instanceof ProfitTemplateDataValidationError
);
