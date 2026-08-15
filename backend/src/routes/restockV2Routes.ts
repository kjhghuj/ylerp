import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma, safeRedis } from '../index';
import { getProductListCacheKey } from '../services/productCache';
import {
  buildRestockPlan,
  RestockPlanValidationError,
  RestockSourceDataError,
  type RemoteInboundOrder,
  type RemoteStockRow,
  type RestockPlan,
} from '../services/restockPlanner';
import {
  createUserYcOpenPlatformClient,
  getYcWarehouseCodesForSite,
  YC_CLIENT_LIMITS,
  YcClientError,
  type YcCustomerWarehouse,
  type YcOpenPlatformClient,
  type YcProductSpecs,
} from '../services/ycOpenPlatformClient';
import {
  SalesImportValidationError,
  aggregateSalesImportRows,
  buildTargetSalesAggregates,
  normalizeRestockSku,
} from '../services/restockSalesImport';

interface CreateRestockV2RouterDeps {
  ycClient?: YcOpenPlatformClient;
  ycClientFactory?: (userId: string) => Promise<YcOpenPlatformClient>;
}

interface RestockResponse extends RestockPlan {
  integration: {
    ycConfigured: boolean;
    remoteFetched: boolean;
    stockSource: 'yc' | 'missing';
    warehouseCodes: string[];
    warnings: string[];
  };
}

interface YcProductSyncItem {
  sku: string;
  name: string;
  warehouseCodes: string[];
  available: number;
  inventory: number;
  occupy: number;
  unshipped: number;
}

interface YcProductDimensions {
  ycLengthCm: number | null;
  ycWidthCm: number | null;
  ycHeightCm: number | null;
  ycVolumeM3: number | null;
}

const SITE_LABELS: Record<string, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
  PH: 'Philippines',
  TH: 'Thailand',
  ID: 'Indonesia',
  CN: 'China',
};

const normalizeSite = (site: unknown) => String(site || '').trim().toUpperCase();

const MAX_PLANNING_DAYS = 3650;
const MAX_GROWTH_PERCENT = 1000;
const MAX_IMPORT_FILE_NAME_LENGTH = 255;
const MAX_SITE_LENGTH = 32;
const MAX_IMPORT_ID_LENGTH = 100;
const MAX_TARGET_SKU_NAME_LENGTH = 500;
const YC_STOCK_SKU_MAX_LENGTH = 50;

const parseOptionalYcSkuSelection = (value: unknown): string[] | null => {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > YC_CLIENT_LIMITS.maxListRows) {
    throw new Error('Invalid YC SKU selection');
  }
  const normalized = value.map(item => {
    if (typeof item !== 'string') throw new Error('Invalid YC SKU selection');
    const sku = normalizeSku(item);
    if (!sku || sku.length > YC_CLIENT_LIMITS.maxIdentifierLength) {
      throw new Error('Invalid YC SKU selection');
    }
    return sku;
  });
  return Array.from(new Set(normalized));
};

const parseBoundedQueryNumber = (
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
): number => {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    throw new Error(`Invalid ${field}`);
  }
  if (typeof value === 'string' && value.trim() === '') throw new Error(`Invalid ${field}`);
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`Invalid ${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid ${field}`);
  }
  return parsed;
};

const parseDateQuery = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
};

const parseRequiredString = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`);
  const parsed = value.trim();
  if (!parsed || parsed.length > maxLength) throw new Error(`Invalid ${field}`);
  return parsed;
};

const parseNullableBoundedNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null => {
  if (value === undefined || value === null) return null;
  return parseBoundedQueryNumber(value, field, minimum, minimum, maximum, integer);
};

const salesImportResponse = (salesImport: any) => {
  const items = Array.isArray(salesImport.items) ? salesImport.items : [];
  const activeItems = items.filter((item: { dismissedAt?: Date | string | null }) => !item.dismissedAt);
  return {
    import: {
      id: salesImport.id,
      site: salesImport.site,
      fileName: salesImport.fileName,
      statisticsDays: salesImport.statisticsDays,
      createdAt: salesImport.createdAt,
      updatedAt: salesImport.updatedAt,
    },
    items: activeItems,
    aggregates: buildTargetSalesAggregates(activeItems),
    pending: activeItems.filter((item: { targetSku?: string | null }) => !normalizeRestockSku(item.targetSku)),
  };
};

const siteSetForProduct = (product: { country?: string | null; sites?: string[] | null; siteData?: unknown }) => {
  const sites = new Set<string>();
  for (const site of product.sites || []) {
    if (site) sites.add(normalizeSite(site));
  }
  if (product.country) sites.add(normalizeSite(product.country));
  if (product.siteData && typeof product.siteData === 'object') {
    for (const site of Object.keys(product.siteData as Record<string, unknown>)) {
      sites.add(normalizeSite(site));
    }
  }
  return sites;
};

const warehouseCodesForSite = (warehouses: YcCustomerWarehouse[], site: string): string[] => {
  const normalizedSite = normalizeSite(site);
  return warehouses
    .filter(warehouse => normalizeSite(warehouse.siteCode) === normalizedSite)
    .map(warehouse => String(warehouse.code || '').trim())
    .filter(Boolean);
};

const mergeWarehouseCodes = (envCodes: string[], remoteCodes: string[]) => {
  return Array.from(new Set([...envCodes, ...remoteCodes].filter(Boolean)));
};

const collectLocalSites = (
  products: Array<{ country?: string | null; sites?: string[] | null; siteData?: unknown }>,
  remoteWarehouses: YcCustomerWarehouse[] = [],
) => {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const site of siteSetForProduct(product)) {
      if (!site) continue;
      counts.set(site, (counts.get(site) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([site, productCount]) => ({
      code: site,
      label: SITE_LABELS[site] || site,
      productCount,
      warehouseCodes: mergeWarehouseCodes(
        getYcWarehouseCodesForSite(site),
        warehouseCodesForSite(remoteWarehouses, site),
      ),
    }));
};

const resolveWarehouseCodesForSite = async (
  ycClient: YcOpenPlatformClient,
  site: string,
): Promise<{ warehouseCodes: string[]; warnings: string[] }> => {
  const envCodes = getYcWarehouseCodesForSite(site);
  if (!ycClient.isConfigured()) return { warehouseCodes: envCodes, warnings: [] };

  try {
    const remoteWarehouses = await ycClient.listCustomerWarehouses();
    return {
      warehouseCodes: mergeWarehouseCodes(envCodes, warehouseCodesForSite(remoteWarehouses, site)),
      warnings: [],
    };
  } catch (error) {
    logSafeFailure('YC warehouse lookup failed', error);
    return {
      warehouseCodes: envCodes,
      warnings: ['YC warehouse fetch failed'],
    };
  }
};

const fetchRemoteRows = async (
  ycClient: YcOpenPlatformClient,
  warehouseCodes: string[],
  skus: string[],
): Promise<{
  stockRows?: RemoteStockRow[];
  inboundOrders?: RemoteInboundOrder[];
  failures: Array<{ source: 'stock' | 'inbound'; error: unknown }>;
}> => {
  const [stockResult, inboundResult] = await Promise.allSettled([
    ycClient.listProductInventory({ warehouseCodes, customerSkus: skus }),
    ycClient.listInboundOrders({ warehouseCodes }),
  ]);
  const failures: Array<{ source: 'stock' | 'inbound'; error: unknown }> = [];
  if (stockResult.status === 'rejected') failures.push({ source: 'stock', error: stockResult.reason });
  if (inboundResult.status === 'rejected') failures.push({ source: 'inbound', error: inboundResult.reason });
  return {
    stockRows: stockResult.status === 'fulfilled' ? stockResult.value : undefined,
    inboundOrders: inboundResult.status === 'fulfilled' ? inboundResult.value : undefined,
    failures,
  };
};

const normalizeSku = (sku: string | null | undefined) => String(sku || '').trim().toUpperCase();

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStockInt = (value: unknown): number => Math.max(0, Math.round(toFiniteNumber(value)));

export const parseYcProductDimensions = (
  specs: YcProductSpecs | null | undefined,
): YcProductDimensions => {
  const dimension = (value: unknown): number | null => {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const ycLengthCm = dimension(specs?.length);
  const ycWidthCm = dimension(specs?.width);
  const ycHeightCm = dimension(specs?.height);
  const ycVolumeM3 = ycLengthCm !== null && ycWidthCm !== null && ycHeightCm !== null
    ? Math.round(((ycLengthCm * ycWidthCm * ycHeightCm) / 1_000_000) * 1_000_000_000) / 1_000_000_000
    : null;
  return { ycLengthCm, ycWidthCm, ycHeightCm, ycVolumeM3 };
};

const toYcStockInt = (value: unknown, field: string, required = false): number => {
  if (value === null || value === undefined) {
    if (!required) return 0;
    throw new RestockSourceDataError(`${field} is required`);
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new RestockSourceDataError(`${field} is invalid`);
  }
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    throw new RestockSourceDataError(`${field} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
    throw new RestockSourceDataError(`${field} is invalid`);
  }
  const rounded = Math.round(parsed);
  if (!Number.isSafeInteger(rounded)) throw new RestockSourceDataError(`${field} is unsafe`);
  return rounded;
};

const safeYcStockAdd = (left: number, right: number, field: string): number => {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new RestockSourceDataError(`${field} is unsafe`);
  return total;
};

const logSafeFailure = (context: string, error: unknown) => {
  if (error instanceof YcClientError) {
    console.warn(context, {
      code: error.code,
      path: error.path,
      httpStatus: error.httpStatus,
    });
    return;
  }
  const safeCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN';
  console.warn(context, { code: safeCode });
};

const hasRestockPermission = (permissions: string[], permission: string): boolean => {
  const moduleKey = permission.split('.')[0];
  return permissions.includes('*') || permissions.includes(permission) || permissions.includes(moduleKey);
};

const requireRestockPermission = (permission: 'restock-v2.view' | 'restock-v2.refresh') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'owner') return next();
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { permissions: true, isActive: true },
      });
      if (!user?.isActive || !hasRestockPermission(user.permissions || [], permission)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    } catch (error) {
      logSafeFailure('Restock permission lookup failed', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

const buildYcSkuAliasMap = (
  warehouseMappings: Array<{ sku: string; thirdPartyWarehouseId?: string | null; type?: string | null }>,
  productSkus: string[],
) => {
  const productSkuSet = new Set(productSkus.map(normalizeSku));
  const aliases = new Map<string, string>();

  for (const mapping of warehouseMappings) {
    const erpSku = String(mapping.sku || '').trim();
    const ycSku = String(mapping.thirdPartyWarehouseId || '').trim();
    if (!erpSku || !ycSku) continue;
    if (mapping.type && mapping.type !== 'third') continue;
    if (normalizeSku(erpSku) === normalizeSku(ycSku)) continue;
    if (!productSkuSet.has(normalizeSku(erpSku))) continue;
    aliases.set(normalizeSku(ycSku), erpSku);
  }

  return aliases;
};

const withMappedCustomerSku = (rows: RemoteStockRow[], aliases: Map<string, string>): RemoteStockRow[] => {
  return rows.map(row => {
    const mappedSku = aliases.get(normalizeSku(row.customerSku));
    return mappedSku ? { ...row, customerSku: mappedSku } : row;
  });
};

const withMappedInboundCustomerSku = (
  orders: RemoteInboundOrder[],
  aliases: Map<string, string>,
): RemoteInboundOrder[] => {
  return orders.map(order => ({
    ...order,
    details: (order.details || []).map(detail => {
      const mappedSku = aliases.get(normalizeSku(detail.customerSku))
        || aliases.get(normalizeSku(detail.productSku));
      return mappedSku ? { ...detail, customerSku: mappedSku } : detail;
    }),
  }));
};

const aggregateYcStockRows = (rows: RemoteStockRow[]): YcProductSyncItem[] => {
  const aggregates = new Map<string, YcProductSyncItem>();

  for (const row of rows) {
    const rawSku = String(row.customerSku || '').trim();
    if (!rawSku) continue;
    const skuKey = normalizeSku(rawSku);
    const existing = aggregates.get(skuKey);
    const warehouseCode = String(row.warehouseCode || '').trim();
    const next = existing || {
      sku: rawSku,
      name: String(row.customerSkuName || rawSku).trim() || rawSku,
      warehouseCodes: [],
      available: 0,
      inventory: 0,
      occupy: 0,
      unshipped: 0,
    };

    if (warehouseCode && !next.warehouseCodes.includes(warehouseCode)) {
      next.warehouseCodes.push(warehouseCode);
    }
    if (!next.name || next.name === next.sku) {
      next.name = String(row.customerSkuName || rawSku).trim() || rawSku;
    }
    next.available = safeYcStockAdd(
      next.available,
      toYcStockInt(row.available, `available for ${skuKey}`, true),
      `available total for ${skuKey}`,
    );
    next.inventory = safeYcStockAdd(
      next.inventory,
      toYcStockInt(row.inventory, `inventory for ${skuKey}`),
      `inventory total for ${skuKey}`,
    );
    next.occupy = safeYcStockAdd(
      next.occupy,
      toYcStockInt(row.occupy, `occupy for ${skuKey}`),
      `occupy total for ${skuKey}`,
    );
    next.unshipped = safeYcStockAdd(
      next.unshipped,
      toYcStockInt(row.unshipped, `unshipped for ${skuKey}`),
      `unshipped total for ${skuKey}`,
    );
    aggregates.set(skuKey, next);
  }

  return Array.from(aggregates.values()).sort((a, b) => a.sku.localeCompare(b.sku));
};

const mergeSiteData = (siteData: unknown, site: string) => {
  const next = siteData && typeof siteData === 'object' && !Array.isArray(siteData)
    ? { ...(siteData as Record<string, unknown>) }
    : {};
  if (!Object.prototype.hasOwnProperty.call(next, site)) {
    next[site] = { totalRevenue: 0 };
  }
  return next;
};

const mappingKey = (sku: string, ycSku: string) => `${normalizeSku(sku)}::${normalizeSku(ycSku)}`;

export const createRestockV2Router = ({
  ycClient,
  ycClientFactory,
}: CreateRestockV2RouterDeps = {}) => {
  const router = Router();
  const getYcClient = async (userId: string) => {
    if (ycClient) return ycClient;
    if (ycClientFactory) return ycClientFactory(userId);
    return createUserYcOpenPlatformClient(prisma, userId);
  };

  router.get('/sites', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      const products = await prisma.product.findMany({ where: { userId } });
      const remoteWarehouses = activeYcClient.isConfigured()
        ? await activeYcClient.listCustomerWarehouses().catch(error => {
          logSafeFailure('YC warehouse lookup failed', error);
          return [];
        })
        : [];
      res.json({
        ycConfigured: activeYcClient.isConfigured(),
        sites: collectLocalSites(products, remoteWarehouses),
      });
    } catch (error) {
      logSafeFailure('Restock site lookup failed', error);
      res.status(500).json({ error: 'Failed to fetch restock sites' });
    }
  });

  router.get('/sync-products/preview', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      const site = normalizeSite(req.query.site);
      if (!site) {
        return res.status(400).json({ error: 'site is required' });
      }
      if (!activeYcClient.isConfigured()) {
        return res.status(400).json({ error: 'YC credentials are not configured' });
      }

      const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
      const warehouseCodes = warehouseResolution.warehouseCodes;
      if (warehouseCodes.length === 0) {
        return res.status(400).json({
          error: `YC warehouse mapping is not configured for ${site}`,
          warnings: warehouseResolution.warnings,
        });
      }

      const [stockRows, products] = await Promise.all([
        activeYcClient.listProductInventory({ warehouseCodes, customerSkus: [] }),
        prisma.product.findMany({ where: { userId } }),
      ]);
      const currentSiteSkus = new Set(
        products
          .filter(product => siteSetForProduct(product).has(site))
          .map(product => normalizeSku(product.sku)),
      );
      const items = aggregateYcStockRows(stockRows).map(item => ({
        ...item,
        alreadyInCurrentSite: currentSiteSkus.has(normalizeSku(item.sku)),
      }));

      return res.json({
        site,
        warehouseCodes,
        warnings: warehouseResolution.warnings,
        items,
      });
    } catch (error) {
      logSafeFailure('YC product sync preview failed', error);
      if (error instanceof RestockSourceDataError) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      return res.status(500).json({ error: 'Failed to preview YC products' });
    }
  });

  router.post('/sync-products', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      const site = normalizeSite(req.body?.site || req.query.site);
      let selectedSkus: string[] | null;
      if (!site) {
        return res.status(400).json({ error: 'site is required' });
      }
      try {
        selectedSkus = parseOptionalYcSkuSelection(req.body?.skus);
      } catch {
        return res.status(400).json({ error: 'Invalid YC SKU selection' });
      }
      if (!activeYcClient.isConfigured()) {
        return res.status(400).json({ error: 'YC credentials are not configured' });
      }

      const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
      const warehouseCodes = warehouseResolution.warehouseCodes;
      if (warehouseCodes.length === 0) {
        return res.status(400).json({
          error: `YC warehouse mapping is not configured for ${site}`,
          warnings: warehouseResolution.warnings,
        });
      }

      const [stockRows, ycProducts] = await Promise.all([
        activeYcClient.listProductInventory({ warehouseCodes, customerSkus: [] }),
        activeYcClient.listProducts ? activeYcClient.listProducts() : Promise.resolve([]),
      ]);
      const dimensionsBySku = new Map(
        ycProducts
          .map(product => [
            normalizeSku(product.customerSku),
            parseYcProductDimensions(product.productSpecs),
          ] as const)
          .filter(([sku]) => Boolean(sku)),
      );
      const specsSyncedAt = new Date();
      const selectedSkuSet = selectedSkus ? new Set(selectedSkus) : null;
      const syncItems = aggregateYcStockRows(
        selectedSkuSet
          ? stockRows.filter(row => selectedSkuSet.has(normalizeSku(row.customerSku)))
          : stockRows,
      );
      if (selectedSkus) {
        const availableSkus = new Set(syncItems.map(item => normalizeSku(item.sku)));
        if (selectedSkus.some(sku => !availableSkus.has(sku))) {
          return res.status(400).json({ error: 'Selected YC products are no longer available' });
        }
      }
      const [products, inventoryItems, warehouseMappings] = await Promise.all([
        prisma.product.findMany({ where: { userId } }),
        prisma.inventoryItem.findMany({ where: { userId } }),
        prisma.warehouseMapping.findMany({ where: { userId } }),
      ]);

      const productBySku = new Map(products.map(product => [normalizeSku(product.sku), product]));
      const inventoryBySku = new Map(inventoryItems.map(item => [normalizeSku(item.sku), item]));
      const thirdMappingKeys = new Set(
        warehouseMappings
          .filter(mapping => mapping.type === 'third' && mapping.thirdPartyWarehouseId)
          .map(mapping => mappingKey(mapping.sku, mapping.thirdPartyWarehouseId || '')),
      );

      let createdProducts = 0;
      let updatedProducts = 0;
      let createdInventoryItems = 0;
      let updatedInventoryItems = 0;
      let createdMappings = 0;

      await prisma.$transaction(async tx => {
        for (const item of syncItems) {
          const skuKey = normalizeSku(item.sku);
          const dimensions = dimensionsBySku.get(skuKey)
            || parseYcProductDimensions(null);
          const existingProduct = productBySku.get(skuKey);
          if (existingProduct) {
          const nextSites = Array.from(new Set([...(existingProduct.sites || []), site]));
          const nextSiteData = mergeSiteData(existingProduct.siteData, site);
          const productUpdates: Record<string, unknown> = {};
          Object.assign(productUpdates, dimensions, { ycSpecsSyncedAt: specsSyncedAt });
          if (!existingProduct.country) productUpdates.country = site;
          if (nextSites.length !== (existingProduct.sites || []).length) productUpdates.sites = nextSites;
          if (JSON.stringify(nextSiteData) !== JSON.stringify(existingProduct.siteData || {})) {
            productUpdates.siteData = nextSiteData;
          }
          if ((!existingProduct.name || normalizeSku(existingProduct.name) === skuKey) && item.name !== item.sku) {
            productUpdates.name = item.name;
          }

          if (Object.keys(productUpdates).length > 0) {
            await tx.product.update({
              where: { id: existingProduct.id },
              data: productUpdates,
            });
            updatedProducts += 1;
          }
          } else {
            const created = await tx.product.create({
            data: {
              name: item.name,
              sku: item.sku,
              country: site,
              sites: [site],
              cost: 0,
              productWeight: 0,
              ...dimensions,
              ycSpecsSyncedAt: specsSyncedAt,
              supplierTaxPoint: 0,
              supplierInvoice: 'no',
              sellerCouponType: 'fixed',
              sellerCoupon: 0,
              sellerCouponPlatformRatio: 0,
              adROI: 15,
              totalRevenue: 0,
              platformInfrastructureFee: 0,
              siteData: { [site]: { totalRevenue: 0 } },
              userId,
            },
          });
          productBySku.set(skuKey, created);
          createdProducts += 1;
        }

          const existingInventory = inventoryBySku.get(skuKey);
          if (existingInventory) {
          const stockOfficial = toStockInt(existingInventory.stockOfficial);
            await tx.inventoryItem.update({
            where: { id: existingInventory.id },
            data: {
              name: existingInventory.name || item.name,
              stockOfficial,
              stockThirdParty: item.available,
              currentStock: stockOfficial + item.available,
              dailySales: toFiniteNumber(existingInventory.dailySales),
              leadTime: Math.max(1, toStockInt(existingInventory.leadTime) || 25),
              replenishCycle: Math.max(1, toStockInt(existingInventory.replenishCycle) || 30),
              costPerUnit: toFiniteNumber(existingInventory.costPerUnit),
            },
          });
          updatedInventoryItems += 1;
          } else {
            const created = await tx.inventoryItem.create({
            data: {
              name: item.name,
              sku: item.sku,
              currentStock: item.available,
              stockOfficial: 0,
              stockThirdParty: item.available,
              inTransit: 0,
              dailySales: 0,
              leadTime: 25,
              replenishCycle: 30,
              costPerUnit: 0,
              userId,
            },
          });
          inventoryBySku.set(skuKey, created);
          createdInventoryItems += 1;
        }

          const key = mappingKey(item.sku, item.sku);
          if (!thirdMappingKeys.has(key)) {
            await tx.warehouseMapping.create({
            data: {
              sku: item.sku,
              type: 'third',
              officialWarehouseId: null,
              thirdPartyWarehouseId: item.sku,
              userId,
            },
          });
            thirdMappingKeys.add(key);
            createdMappings += 1;
          }
        }
      });

      await Promise.all([
        safeRedis.del(getProductListCacheKey(userId)),
        safeRedis.del(`inventory:${userId}`),
        safeRedis.del(`warehouse-mappings:${userId}`),
      ]);

      res.json({
        site,
        warehouseCodes,
        warnings: warehouseResolution.warnings,
        fetchedRows: stockRows.length,
        syncedSkus: syncItems.length,
        createdProducts,
        updatedProducts,
        createdInventoryItems,
        updatedInventoryItems,
        createdMappings,
        samples: syncItems.slice(0, 10),
      });
    } catch (error) {
      logSafeFailure('YC product sync failed', error);
      if (error instanceof RestockSourceDataError) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      res.status(500).json({ error: 'Failed to sync YC products' });
    }
  });

  router.post('/sales-imports', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let site: string;
      let fileName: string;
      let statisticsDays: number;
      let initialItems: ReturnType<typeof aggregateSalesImportRows>;
      try {
        site = normalizeSite(parseRequiredString(req.body?.site, 'site', MAX_SITE_LENGTH));
        fileName = parseRequiredString(req.body?.fileName, 'fileName', MAX_IMPORT_FILE_NAME_LENGTH);
        statisticsDays = parseBoundedQueryNumber(
          req.body?.statisticsDays,
          'statisticsDays',
          30,
          1,
          MAX_PLANNING_DAYS,
          true,
        );
        initialItems = aggregateSalesImportRows(req.body?.rows);
      } catch {
        return res.status(400).json({ error: 'Invalid sales import payload' });
      }

      const externalSkus = Array.from(new Set(
        initialItems.map(item => item.platformSku).filter((sku): sku is string => Boolean(sku)),
      ));
      const [savedMappings, inventoryItems] = await Promise.all([
        externalSkus.length > 0
          ? prisma.externalSkuMapping.findMany({
            where: { userId, site, externalSku: { in: externalSkus } },
          })
          : Promise.resolve([]),
        prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
      ]);
      const ownedInventorySkus = new Set(inventoryItems.map(item => normalizeRestockSku(item.sku)));
      const reusableMappings = new Map<string, string>();
      for (const mapping of savedMappings) {
        const externalSku = normalizeRestockSku(mapping.externalSku);
        const targetSku = normalizeRestockSku(mapping.targetSku);
        if (externalSku && targetSku && ownedInventorySkus.has(targetSku)) {
          reusableMappings.set(externalSku, targetSku);
        }
      }
      const exactFallbackMappings: Array<{ externalSku: string; targetSku: string }> = [];
      for (const externalSku of externalSkus) {
        if (reusableMappings.has(externalSku) || !ownedInventorySkus.has(externalSku)) continue;
        reusableMappings.set(externalSku, externalSku);
        exactFallbackMappings.push({ externalSku, targetSku: externalSku });
      }
      const items = aggregateSalesImportRows(req.body.rows, reusableMappings);
      const created = await prisma.$transaction(async tx => {
        await Promise.all(exactFallbackMappings.map(({ externalSku, targetSku }) =>
          tx.externalSkuMapping.upsert({
            where: { userId_site_externalSku: { userId, site, externalSku } },
            create: { userId, site, externalSku, targetSku },
            update: { targetSku },
          }),
        ));
        return tx.restockSalesImport.create({
          data: {
            userId,
            site,
            fileName,
            statisticsDays,
            items: { create: items },
          },
          include: { items: true },
        });
      });

      return res.status(201).json(salesImportResponse(created));
    } catch (error) {
      logSafeFailure('Restock sales import failed', error);
      return res.status(500).json({ error: 'Failed to import sales data' });
    }
  });

  router.get('/sales-imports/latest', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let site: string;
      try {
        site = normalizeSite(parseRequiredString(req.query.site, 'site', MAX_SITE_LENGTH));
      } catch {
        return res.status(400).json({ error: 'site is required' });
      }
      const salesImport = await prisma.restockSalesImport.findFirst({
        where: { userId, site },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });
      if (!salesImport) return res.status(404).json({ error: 'Sales import not found' });
      return res.json(salesImportResponse(salesImport));
    } catch (error) {
      logSafeFailure('Restock sales import lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch sales import' });
    }
  });

  router.get('/sales-imports/:id', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const id = parseRequiredString(req.params.id, 'id', MAX_IMPORT_ID_LENGTH);
      const salesImport = await prisma.restockSalesImport.findFirst({
        where: { id, userId: req.user!.id },
        include: { items: true },
      });
      if (!salesImport) return res.status(404).json({ error: 'Sales import not found' });
      return res.json(salesImportResponse(salesImport));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid')) {
        return res.status(400).json({ error: 'Invalid sales import id' });
      }
      logSafeFailure('Restock sales import lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch sales import' });
    }
  });

  router.get('/target-skus', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const [inventoryItems, products] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { userId }, select: { id: true, sku: true, name: true },
        }),
        prisma.product.findMany({
          where: { userId }, select: { id: true, sku: true, name: true },
        }),
      ]);
      const unique = new Map<string, { id: string; sku: string; name: string }>();
      [...inventoryItems, ...products].forEach(item => {
        const sku = normalizeRestockSku(item.sku);
        if (!sku || unique.has(sku)) return;
        unique.set(sku, {
          id: String(item.id),
          sku,
          name: String(item.name || '').trim() || sku,
        });
      });
      const items = Array.from(unique.values()).sort((left, right) =>
        left.sku.localeCompare(right.sku),
      );
      return res.json({ items });
    } catch (error) {
      logSafeFailure('Restock target SKU lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch target SKUs' });
    }
  });

  router.post('/target-skus', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let site: string;
      let sku: string;
      let name: string;
      try {
        site = normalizeSite(parseRequiredString(req.body?.site, 'site', MAX_SITE_LENGTH));
        sku = normalizeRestockSku(req.body?.sku);
        if (!sku || sku.length > 200) throw new Error('Invalid sku');
        const suppliedName = req.body?.name;
        if (suppliedName !== undefined && typeof suppliedName !== 'string') throw new Error('Invalid name');
        name = suppliedName?.trim() || sku;
        if (name.length > MAX_TARGET_SKU_NAME_LENGTH) throw new Error('Invalid name');
      } catch {
        return res.status(400).json({ error: 'Invalid target SKU payload' });
      }

      const [products, inventoryItems] = await Promise.all([
        prisma.product.findMany({ where: { userId }, select: { sku: true } }),
        prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
      ]);
      if ([...products, ...inventoryItems].some(item => normalizeRestockSku(item.sku) === sku)) {
        return res.status(409).json({ error: 'Target SKU already exists' });
      }

      const inventory = await prisma.$transaction(async tx => {
        await tx.product.create({
          data: {
            name,
            sku,
            country: site,
            sites: [site],
            cost: 0,
            productWeight: 0,
            supplierTaxPoint: 0,
            supplierInvoice: 'no',
            sellerCouponType: 'fixed',
            sellerCoupon: 0,
            sellerCouponPlatformRatio: 0,
            adROI: 15,
            totalRevenue: 0,
            platformInfrastructureFee: 0,
            siteData: { [site]: { totalRevenue: 0 } },
            userId,
          },
        });
        return tx.inventoryItem.create({
          data: {
            name,
            sku,
            currentStock: 0,
            stockOfficial: 0,
            stockThirdParty: 0,
            inTransit: 0,
            dailySales: 0,
            leadTime: 25,
            replenishCycle: 30,
            costPerUnit: 0,
            userId,
          },
        });
      });
      await Promise.all([
        safeRedis.del(getProductListCacheKey(userId)),
        safeRedis.del(`inventory:${userId}`),
      ]);
      return res.status(201).json(inventory);
    } catch (error) {
      logSafeFailure('Restock target SKU create failed', error);
      return res.status(500).json({ error: 'Failed to create target SKU' });
    }
  });

  router.put(
    '/sales-imports/:importId/items/:itemId/mapping',
    requireRestockPermission('restock-v2.refresh'),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        let importId: string;
        let itemId: string;
        let targetSku: string;
        try {
          importId = parseRequiredString(req.params.importId, 'importId', MAX_IMPORT_ID_LENGTH);
          itemId = parseRequiredString(req.params.itemId, 'itemId', MAX_IMPORT_ID_LENGTH);
          targetSku = normalizeRestockSku(req.body?.targetSku);
          if (!targetSku) throw new Error('Invalid targetSku');
        } catch {
          return res.status(400).json({ error: 'Invalid SKU mapping payload' });
        }

        const salesImport = await prisma.restockSalesImport.findFirst({
          where: { id: importId, userId },
        });
        if (!salesImport) return res.status(404).json({ error: 'Sales import not found' });
        const item = await prisma.restockSalesItem.findFirst({ where: { id: itemId, importId } });
        if (!item) return res.status(404).json({ error: 'Sales import item not found' });

        const [inventoryItems, products] = await Promise.all([
          prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
          prisma.product.findMany({ where: { userId }, select: { sku: true, name: true, cost: true } }),
        ]);
        const matchedInventory = inventoryItems.find(entry => normalizeRestockSku(entry.sku) === targetSku);
        const matchedProduct = products.find(entry => normalizeRestockSku(entry.sku) === targetSku);
        if (!matchedInventory && !matchedProduct) return res.status(400).json({ error: 'Target SKU not found' });
        const normalizedTargetSku = normalizeRestockSku(matchedInventory?.sku || matchedProduct!.sku);
        const externalSku = normalizeRestockSku(item.platformSku);
        const updatedItem = await prisma.$transaction(async tx => {
          if (!matchedInventory) {
            await tx.inventoryItem.create({
              data: {
                name: matchedProduct!.name || matchedProduct!.sku,
                sku: normalizedTargetSku,
                currentStock: 0,
                stockOfficial: 0,
                stockThirdParty: 0,
                inTransit: 0,
                dailySales: 0,
                leadTime: 25,
                replenishCycle: 30,
                costPerUnit: Number.isFinite(matchedProduct!.cost) ? matchedProduct!.cost : 0,
                userId,
              },
            });
          }
          if (externalSku) {
            await tx.externalSkuMapping.upsert({
              where: { userId_site_externalSku: { userId, site: salesImport.site, externalSku } },
              create: { userId, site: salesImport.site, externalSku, targetSku: normalizedTargetSku },
              update: { targetSku: normalizedTargetSku },
            });
          }
          return tx.restockSalesItem.update({
            where: { id: item.id },
            data: { targetSku: normalizedTargetSku },
          });
        });
        if (!matchedInventory) await safeRedis.del(`inventory:${userId}`);
        return res.json(updatedItem);
      } catch (error) {
        logSafeFailure('Restock SKU mapping failed', error);
        return res.status(500).json({ error: 'Failed to save SKU mapping' });
      }
    },
  );

  router.patch(
    '/sales-imports/:importId/items/:itemId/dismissal',
    requireRestockPermission('restock-v2.refresh'),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        let importId: string;
        let itemId: string;
        try {
          importId = parseRequiredString(req.params.importId, 'importId', MAX_IMPORT_ID_LENGTH);
          itemId = parseRequiredString(req.params.itemId, 'itemId', MAX_IMPORT_ID_LENGTH);
          if (req.body?.dismissed !== true) throw new Error('Invalid dismissed');
        } catch {
          return res.status(400).json({ error: 'Invalid sales import dismissal payload' });
        }

        const salesImport = await prisma.restockSalesImport.findFirst({
          where: { id: importId, userId },
        });
        if (!salesImport) return res.status(404).json({ error: 'Sales import not found' });
        const item = await prisma.restockSalesItem.findFirst({ where: { id: itemId, importId } });
        if (!item) return res.status(404).json({ error: 'Sales import item not found' });

        const updatedItem = await prisma.restockSalesItem.update({
          where: { id: item.id },
          data: { dismissedAt: new Date() },
        });
        return res.json(updatedItem);
      } catch (error) {
        logSafeFailure('Restock sales import dismissal failed', error);
        return res.status(500).json({ error: 'Failed to dismiss sales import item' });
      }
    },
  );

  router.get('/sku-rules', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      let site: string;
      try {
        site = normalizeSite(parseRequiredString(req.query.site, 'site', MAX_SITE_LENGTH));
      } catch {
        return res.status(400).json({ error: 'site is required' });
      }
      const rules = await prisma.restockSkuRule.findMany({
        where: { userId: req.user!.id, site },
        orderBy: { sku: 'asc' },
      });
      return res.json({ site, rules });
    } catch (error) {
      logSafeFailure('Restock SKU rule lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch SKU rules' });
    }
  });

  router.put('/sku-rules/:sku', requireRestockPermission('restock-v2.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let site: string;
      let sku: string;
      let leadTimeDays: number | null;
      let safetyDays: number | null;
      let growthPercent: number | null;
      try {
        site = normalizeSite(parseRequiredString(req.body?.site, 'site', MAX_SITE_LENGTH));
        sku = normalizeRestockSku(req.params.sku);
        if (!sku) throw new Error('Invalid sku');
        leadTimeDays = parseNullableBoundedNumber(
          req.body?.leadTimeDays, 'leadTimeDays', 0, MAX_PLANNING_DAYS, true,
        );
        safetyDays = parseNullableBoundedNumber(
          req.body?.safetyDays, 'safetyDays', 0, MAX_PLANNING_DAYS, true,
        );
        growthPercent = parseNullableBoundedNumber(
          req.body?.growthPercent, 'growthPercent', 0, MAX_GROWTH_PERCENT,
        );
      } catch {
        return res.status(400).json({ error: 'Invalid SKU rule payload' });
      }
      const inventoryItems = await prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } });
      if (!inventoryItems.some(item => normalizeRestockSku(item.sku) === sku)) {
        return res.status(400).json({ error: 'Inventory SKU not found' });
      }
      const data = { leadTimeDays, safetyDays, growthPercent };
      const rule = await prisma.restockSkuRule.upsert({
        where: { userId_site_sku: { userId, site, sku } },
        create: { userId, site, sku, ...data },
        update: data,
      });
      return res.json(rule);
    } catch (error) {
      logSafeFailure('Restock SKU rule update failed', error);
      return res.status(500).json({ error: 'Failed to save SKU rule' });
    }
  });

  router.get('/stock-snapshot', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      const site = normalizeSite(req.query.site);
      if (!site) {
        return res.status(400).json({ error: 'site is required' });
      }

      const warnings: string[] = [];
      if (!activeYcClient.isConfigured()) {
        return res.json({
          site,
          remoteFetched: false,
          warehouseCodes: [],
          warnings: ['YC credentials are not configured'],
          items: [],
        });
      }

      const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
      const warehouseCodes = warehouseResolution.warehouseCodes;
      warnings.push(...warehouseResolution.warnings);
      if (warehouseCodes.length === 0) {
        warnings.push(`YC warehouse mapping is not configured for ${site}`);
        return res.json({
          site,
          remoteFetched: false,
          warehouseCodes,
          warnings,
          items: [],
        });
      }

      const [products, warehouseMappings] = await Promise.all([
        prisma.product.findMany({ where: { userId } }),
        prisma.warehouseMapping.findMany({ where: { userId } }),
      ]);
      const siteProducts = products.filter(product => siteSetForProduct(product).has(site));
      const skus = siteProducts.map(product => product.sku).filter(Boolean);
      const ycSkuAliases = buildYcSkuAliasMap(warehouseMappings, skus);
      const querySkus = Array.from(new Set([
        ...skus,
        ...Array.from(ycSkuAliases.keys()),
      ]));
      const stockRows = await activeYcClient.listProductInventory({
        warehouseCodes,
        customerSkus: querySkus,
      });
      const mappedRows = withMappedCustomerSku(stockRows, ycSkuAliases);
      const items = aggregateYcStockRows(mappedRows);

      res.json({
        site,
        remoteFetched: true,
        warehouseCodes,
        warnings,
        items,
      });
    } catch (error) {
      logSafeFailure('YC stock snapshot failed', error);
      if (error instanceof RestockSourceDataError) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      res.status(500).json({ error: 'Failed to fetch YC stock snapshot' });
    }
  });

  router.post('/recommendations', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      let site: string;
      let salesImportId: string;
      let planningDate: string;
      let targetDate: string;
      let leadTimeDays: number;
      let safetyDays: number;
      let growthPercent: number;
      try {
        site = normalizeSite(parseRequiredString(req.body?.site, 'site', MAX_SITE_LENGTH));
        salesImportId = parseRequiredString(req.body?.salesImportId, 'salesImportId', MAX_IMPORT_ID_LENGTH);
        planningDate = parseDateQuery(req.body?.planningDate, 'planningDate')
          || new Date().toISOString().slice(0, 10);
        const parsedTargetDate = parseDateQuery(req.body?.targetDate, 'targetDate');
        if (!parsedTargetDate) throw new Error('Invalid targetDate');
        targetDate = parsedTargetDate;
        leadTimeDays = parseBoundedQueryNumber(
          req.body?.leadTimeDays, 'leadTimeDays', 25, 0, MAX_PLANNING_DAYS, true,
        );
        safetyDays = parseBoundedQueryNumber(
          req.body?.safetyDays, 'safetyDays', 30, 0, MAX_PLANNING_DAYS, true,
        );
        growthPercent = parseBoundedQueryNumber(
          req.body?.growthPercent, 'growthPercent', 0, 0, MAX_GROWTH_PERCENT,
        );
        const horizonDays = (
          Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${planningDate}T00:00:00.000Z`)
        ) / (24 * 60 * 60 * 1000);
        if (horizonDays <= leadTimeDays || horizonDays > MAX_PLANNING_DAYS) throw new Error('Invalid targetDate');
      } catch {
        return res.status(400).json({ error: 'Invalid restock parameters' });
      }

      if (!activeYcClient.isConfigured()) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const salesImport = await prisma.restockSalesImport.findFirst({
        where: { id: salesImportId, userId, site },
        include: { items: true },
      });
      if (!salesImport) return res.status(404).json({ error: 'Sales import not found' });
      if (!Number.isInteger(salesImport.statisticsDays)
        || salesImport.statisticsDays < 1
        || salesImport.statisticsDays > MAX_PLANNING_DAYS) {
        return res.status(500).json({ error: 'Sales import contains invalid statistics days' });
      }

      const activeItems = salesImport.items.filter(item => !item.dismissedAt);
      const salesAggregates = buildTargetSalesAggregates(activeItems);
      const [inventoryItems, products, warehouseMappings, savedRules] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { userId } }),
        prisma.product.findMany({ where: { userId } }),
        prisma.warehouseMapping.findMany({ where: { userId } }),
        prisma.restockSkuRule.findMany({ where: { userId, site } }),
      ]);
      const inventoryBySku = new Map(inventoryItems.map(item => [normalizeRestockSku(item.sku), item]));
      const productBySku = new Map(products.map(product => [normalizeRestockSku(product.sku), product]));
      const inventoryBackedAggregates = salesAggregates.filter(
        aggregate => inventoryBySku.has(aggregate.targetSku),
      );
      const excludedOversizedSkus = inventoryBackedAggregates
        .filter(aggregate => aggregate.targetSku.length > YC_STOCK_SKU_MAX_LENGTH)
        .map(aggregate => aggregate.targetSku);
      const validAggregates = inventoryBackedAggregates.filter(
        aggregate => aggregate.targetSku.length <= YC_STOCK_SKU_MAX_LENGTH,
      );
      const importedInventoryItems = validAggregates.map(aggregate => {
        const inventory = inventoryBySku.get(aggregate.targetSku)!;
        return {
          ...inventory,
          dailySales: aggregate.validSales / salesImport.statisticsDays,
        };
      });
      const importedProducts = validAggregates.map(aggregate => {
        const inventory = inventoryBySku.get(aggregate.targetSku)!;
        const product = productBySku.get(aggregate.targetSku);
        return {
          id: product?.id || inventory.id,
          name: product?.name || inventory.name,
          sku: inventory.sku,
          country: site,
          sites: Array.from(new Set([...(product?.sites || []), site])),
          cost: product?.cost ?? inventory.costPerUnit,
          siteData: product?.siteData,
        };
      });
      const skus = importedInventoryItems.map(item => item.sku);
      const ycSkuAliases = buildYcSkuAliasMap(warehouseMappings, skus);
      const querySkus = Array.from(
        new Set([...skus, ...Array.from(ycSkuAliases.keys())]),
      ).filter(sku => sku.length <= YC_STOCK_SKU_MAX_LENGTH);
      const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
      const warehouseCodes = warehouseResolution.warehouseCodes;
      if (warehouseCodes.length === 0) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }

      const remoteRows = querySkus.length > 0
        ? await fetchRemoteRows(activeYcClient, warehouseCodes, querySkus)
        : { stockRows: [], inboundOrders: [], failures: [] };
      if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
        for (const failure of remoteRows.failures) {
          logSafeFailure(`YC ${failure.source} lookup failed`, failure.error);
        }
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const stockRows = withMappedCustomerSku(remoteRows.stockRows, ycSkuAliases);
      const inboundOrders = withMappedInboundCustomerSku(remoteRows.inboundOrders, ycSkuAliases);
      const eligibleSkus = new Set(validAggregates.map(aggregate => aggregate.targetSku));
      const skuRules = savedRules
        .filter(rule => eligibleSkus.has(normalizeRestockSku(rule.sku)))
        .map(rule => ({
          sku: normalizeRestockSku(rule.sku),
          leadTimeDays: rule.leadTimeDays ?? undefined,
          safetyDays: rule.safetyDays ?? undefined,
          growthPercent: rule.growthPercent ?? undefined,
        }));

      let plan: RestockPlan;
      try {
        plan = buildRestockPlan({
          site,
          products: importedProducts,
          inventoryItems: importedInventoryItems,
          remoteStockRows: stockRows,
          inboundOrders,
          planningDate,
          targetDate,
          leadTimeDays,
          safetyDays,
          growthPercent,
          skuRules,
        });
      } catch (error) {
        logSafeFailure('Imported restock plan rejected', error);
        if (error instanceof RestockPlanValidationError) {
          return res.status(400).json({ error: 'Invalid restock parameters' });
        }
        if (error instanceof RestockSourceDataError || error instanceof SalesImportValidationError) {
          return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
        }
        return res.status(500).json({ error: 'Failed to build restock recommendations' });
      }

      return res.json({
        ...plan,
        metadata: {
          salesImportId: salesImport.id,
          statisticsDays: salesImport.statisticsDays,
          pendingCount: activeItems.filter(item => !normalizeRestockSku(item.targetSku)).length,
          excludedMissingInventoryCount: salesAggregates.length - inventoryBackedAggregates.length,
          excludedOversizedSkus,
        },
        integration: {
          ycConfigured: true,
          remoteFetched: true,
          stockSource: stockRows.length > 0 ? 'yc' : 'missing',
          warehouseCodes,
          warnings: warehouseResolution.warnings,
        },
      });
    } catch (error) {
      logSafeFailure('Imported restock recommendation request failed', error);
      return res.status(500).json({ error: 'Failed to build restock recommendations' });
    }
  });

  router.get('/recommendations', requireRestockPermission('restock-v2.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      const site = normalizeSite(req.query.site);
      if (!site) {
        return res.status(400).json({ error: 'site is required' });
      }

      let planningDate: string;
      let targetDate: string;
      let leadTimeDays: number;
      let safetyDays: number;
      let growthPercent: number;
      try {
        planningDate = parseDateQuery(req.query.planningDate, 'planningDate')
          || new Date().toISOString().slice(0, 10);
        const parsedTargetDate = parseDateQuery(req.query.targetDate, 'targetDate');
        if (!parsedTargetDate) throw new Error('Invalid targetDate');
        targetDate = parsedTargetDate;
        leadTimeDays = parseBoundedQueryNumber(
          req.query.leadTimeDays,
          'leadTimeDays',
          25,
          0,
          MAX_PLANNING_DAYS,
          true,
        );
        safetyDays = parseBoundedQueryNumber(
          req.query.safetyDays,
          'safetyDays',
          30,
          0,
          MAX_PLANNING_DAYS,
          true,
        );
        growthPercent = parseBoundedQueryNumber(
          req.query.growthPercent,
          'growthPercent',
          0,
          0,
          MAX_GROWTH_PERCENT,
        );
        const planningTime = Date.parse(`${planningDate}T00:00:00.000Z`);
        const targetTime = Date.parse(`${targetDate}T00:00:00.000Z`);
        const planningHorizonDays = (targetTime - planningTime) / (24 * 60 * 60 * 1000);
        if (planningHorizonDays <= leadTimeDays || planningHorizonDays > MAX_PLANNING_DAYS) {
          throw new Error('Invalid targetDate');
        }
      } catch {
        return res.status(400).json({ error: 'Invalid restock parameters' });
      }
      const ycConfigured = activeYcClient.isConfigured();
      if (!ycConfigured) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
      const warehouseCodes = warehouseResolution.warehouseCodes;
      if (warehouseCodes.length === 0) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const products = await prisma.product.findMany({ where: { userId } });
      const inventoryItems = await prisma.inventoryItem.findMany({ where: { userId } });
      const warehouseMappings = await prisma.warehouseMapping.findMany({ where: { userId } });
      const warnings: string[] = [...warehouseResolution.warnings];
      const skus = products.map(product => product.sku).filter(Boolean);
      const ycSkuAliases = buildYcSkuAliasMap(warehouseMappings, skus);
      const querySkus = Array.from(new Set([
        ...skus,
        ...Array.from(ycSkuAliases.keys()),
      ]));
      const remoteRows = await fetchRemoteRows(activeYcClient, warehouseCodes, querySkus);
      if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
        for (const failure of remoteRows.failures) {
          logSafeFailure(`YC ${failure.source} lookup failed`, failure.error);
        }
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const stockRows = withMappedCustomerSku(remoteRows.stockRows, ycSkuAliases);
      const inboundOrders = withMappedInboundCustomerSku(remoteRows.inboundOrders, ycSkuAliases);

      let plan: RestockPlan;
      try {
        plan = buildRestockPlan({
          site,
          products,
          inventoryItems,
          remoteStockRows: stockRows,
          inboundOrders,
          planningDate,
          targetDate,
          leadTimeDays,
          safetyDays,
          growthPercent,
        });
      } catch (error) {
        logSafeFailure('Restock plan rejected', error);
        if (error instanceof RestockPlanValidationError) {
          return res.status(400).json({ error: 'Invalid restock parameters' });
        }
        if (error instanceof RestockSourceDataError) {
          return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
        }
        return res.status(500).json({ error: 'Failed to build restock recommendations' });
      }

      const response: RestockResponse = {
        ...plan,
        integration: {
          ycConfigured,
          remoteFetched: true,
          stockSource: stockRows.length > 0 ? 'yc' : 'missing',
          warehouseCodes,
          warnings,
        },
      };

      res.json(response);
    } catch (error) {
      logSafeFailure('Restock recommendation request failed', error);
      res.status(500).json({ error: 'Failed to build restock recommendations' });
    }
  });

  return router;
};

export default createRestockV2Router();
