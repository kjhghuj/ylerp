import { withUsageEvent } from '../services/usageEvents';
import { Router } from 'express';
import { prisma, safeRedis } from '../infrastructure/runtimeResources';
import { getProductListCacheKey } from '../services/productCache';
import {
  RestockSourceDataError,
  type RemoteStockRow,
} from '../services/restockPlanner';
import {
  createUserYcOpenPlatformClient,
  YC_CLIENT_LIMITS,
  type YcOpenPlatformClient,
  type YcProductSpecs,
} from '../services/ycOpenPlatformClient';
import {
  buildYcSkuAliasMap,
  createRestockPermissionGuard,
  logSafeFailure,
  normalizeSite,
  normalizeSku,
  resolveWarehouseCodesForSite,
  withMappedCustomerSku,
} from '../services/restockYcShared';

interface CreateRestockV2RouterDeps {
  ycClient?: YcOpenPlatformClient;
  ycClientFactory?: (userId: string) => Promise<YcOpenPlatformClient>;
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

const requireRestockPermission = createRestockPermissionGuard(() => prisma, 'restock-v2');

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

      await withUsageEvent(prisma, req, { module: 'restock-v2', action: 'restock_sync', objectType: 'SKU', affectedCount: syncItems.length, metadata: { site } }, async tx => {
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

  return router;
};

export default createRestockV2Router();
