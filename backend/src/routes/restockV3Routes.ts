/**
 * 补货V3 路由：以商品分析店铺为销量源、元仓（YC）站点仓储为库存源的补货建议。
 * 与 V2 的差异：销量不再来自 Excel 导入，而是直接聚合 ProductDailyItem 区间内
 * 变体级 unitsOrdered（已下订单件数）；SKU 映射复用 ExternalSkuMapping（userId+site 对齐，
 * V2 已建映射自动生效）；计算引擎复用 buildRestockPlan，参数与 SKU 规则口径与 V2 相同。
 * 销量口径：dailySales = 区间件数合计 ÷ statisticsDays（默认区间内实际上传天数）。
 */

import { Router, type Request, type Response } from 'express';
import { prisma, safeRedis } from '../index';
import { withUsageEvent } from '../services/usageEvents';
import { getProductListCacheKey } from '../services/productCache';
import {
  buildRestockPlan,
  RestockPlanValidationError,
  RestockSourceDataError,
  type RestockPlan,
} from '../services/restockPlanner';
import { createUserYcOpenPlatformClient, type YcOpenPlatformClient } from '../services/ycOpenPlatformClient';
import { normalizeRestockSku } from '../services/restockSalesImport';
import { aggregateShopVariantSales, type ShopDailyItemRow, type ShopSalesAggregate } from '../services/restockShopSales';
import {
  buildYcSkuAliasMap,
  createRestockPermissionGuard,
  fetchRemoteRows,
  logSafeFailure,
  MAX_GROWTH_PERCENT,
  MAX_IMPORT_ID_LENGTH,
  MAX_PLANNING_DAYS,
  MAX_SITE_LENGTH,
  MAX_TARGET_SKU_NAME_LENGTH,
  normalizeSite,
  normalizeSku,
  parseBoundedQueryNumber,
  parseDateQuery,
  parseNullableBoundedNumber,
  parseRequiredString,
  resolveWarehouseCodesForSite,
  withMappedCustomerSku,
  withMappedInboundCustomerSku,
  YC_STOCK_SKU_MAX_LENGTH,
} from '../services/restockYcShared';

interface CreateRestockV3RouterDeps {
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

const MAX_QUERY_RANGE_DAYS = 366;

const requireRestockPermission = createRestockPermissionGuard(() => prisma, 'restock-v3');

function parseDateUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 区间校验：from ≤ to 且跨度 ≤ 366 天（与商品分析查询口径一致） */
function parseShopRange(query: Record<string, unknown>): { from: string; to: string } | null {
  try {
    const from = parseDateQuery(query.from, 'from');
    const to = parseDateQuery(query.to, 'to');
    if (!from || !to || from > to) return null;
    const days = Math.round((parseDateUtc(to).getTime() - parseDateUtc(from).getTime()) / 86_400_000) + 1;
    if (days > MAX_QUERY_RANGE_DAYS) return null;
    return { from, to };
  } catch {
    return null;
  }
}

async function findOwnedShop(id: string, userId: string) {
  return prisma.productAnalysisShop.findFirst({ where: { id, userId } });
}

/** 拉取区间行并转 ShopDailyItemRow（date 由上传记录映射，避免逐行 join） */
async function fetchShopSalesRows(shopId: string, from: string, to: string): Promise<ShopDailyItemRow[]> {
  const uploads = await prisma.productAnalysisDailyUpload.findMany({
    where: { shopId, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  });
  if (uploads.length === 0) return [];
  const dateByUploadId = new Map(uploads.map((upload) => [upload.id, dateString(upload.date)]));
  const rawRows = await prisma.productDailyItem.findMany({
    where: { uploadId: { in: uploads.map((upload) => upload.id) } },
    select: { uploadId: true, itemId: true, itemName: true, unitsOrdered: true, variations: true },
  });
  return rawRows.map((raw) => ({
    date: dateByUploadId.get(raw.uploadId) ?? '',
    itemId: raw.itemId,
    itemName: raw.itemName,
    unitsOrdered: raw.unitsOrdered,
    variations: raw.variations,
  }));
}

/** 组装映射视图：存量 ExternalSkuMapping（目标 SKU 仍存在）+ 自身即本地 SKU 的精确回退（不落库） */
async function resolveSalesMappings(
  userId: string,
  site: string,
  aggregate: ShopSalesAggregate,
): Promise<{
  rows: Array<ShopSalesAggregate['rows'][number] & { targetSku: string | null; mappingStatus: 'mapped' | 'pending' }>;
  pendingCount: number;
}> {
  const externalSkus = aggregate.rows.map((row) => row.externalSku);
  const [savedMappings, inventoryItems] = await Promise.all([
    externalSkus.length > 0
      ? prisma.externalSkuMapping.findMany({ where: { userId, site, externalSku: { in: externalSkus } } })
      : Promise.resolve([]),
    prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
  ]);
  const ownedInventorySkus = new Set(inventoryItems.map((item) => normalizeRestockSku(item.sku)));
  const mappingByExternal = new Map<string, string>();
  for (const mapping of savedMappings) {
    const externalSku = normalizeRestockSku(mapping.externalSku);
    const targetSku = normalizeRestockSku(mapping.targetSku);
    if (externalSku && targetSku && ownedInventorySkus.has(targetSku)) {
      mappingByExternal.set(externalSku, targetSku);
    }
  }
  let pendingCount = 0;
  const rows = aggregate.rows.map((row) => {
    const stored = mappingByExternal.get(row.externalSku) ?? null;
    const targetSku = stored ?? (ownedInventorySkus.has(row.externalSku) ? row.externalSku : null);
    if (!targetSku) pendingCount += 1;
    return { ...row, targetSku, mappingStatus: targetSku ? 'mapped' as const : 'pending' as const };
  });
  return { rows, pendingCount };
}

export const createRestockV3Router = ({
  ycClient,
  ycClientFactory,
}: CreateRestockV3RouterDeps = {}) => {
  const router = Router();
  const getYcClient = async (userId: string) => {
    if (ycClient) return ycClient;
    if (ycClientFactory) return ycClientFactory(userId);
    return createUserYcOpenPlatformClient(prisma, userId);
  };

  // ---- 店铺（商品分析） ----

  router.get('/shops', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const [shops, stats] = await Promise.all([
        prisma.productAnalysisShop.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
        }),
        prisma.productAnalysisDailyUpload.groupBy({
          by: ['shopId'],
          where: { userId },
          _count: { _all: true },
          _max: { date: true },
        }),
      ]);
      const statsByShop = new Map(stats.map((stat) => [stat.shopId, stat]));
      res.json(shops.map((shop) => {
        const stat = statsByShop.get(shop.id);
        return {
          ...shop,
          dayCount: stat?._count._all ?? 0,
          latestUploadDate: stat?._max.date ? dateString(stat._max.date) : null,
        };
      }));
    } catch (error) {
      logSafeFailure('Restock V3 shop lookup failed', error);
      res.status(500).json({ error: 'Failed to fetch shops' });
    }
  });

  router.get('/shops/:id/sales', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const shop = await findOwnedShop(String(req.params.id ?? ''), userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const range = parseShopRange(req.query as Record<string, unknown>);
      if (!range) {
        return res.status(400).json({ error: 'from/to must be valid dates (from ≤ to, span ≤ 366 days)' });
      }
      const dailyRows = await fetchShopSalesRows(shop.id, range.from, range.to);
      if (dailyRows.length === 0) {
        return res.status(400).json({ error: 'No product analysis uploads in this date range' });
      }
      const aggregate = aggregateShopVariantSales(dailyRows);
      const { rows, pendingCount } = await resolveSalesMappings(userId, shop.site, aggregate);
      return res.json({
        shop: { id: shop.id, name: shop.name, site: shop.site, currency: shop.currency },
        from: range.from,
        to: range.to,
        shopObservedDays: aggregate.shopObservedDays,
        pendingCount,
        noSkuVariationCount: aggregate.noSkuVariationCount,
        noSkuVariationUnits: aggregate.noSkuVariationUnits,
        rows,
      });
    } catch (error) {
      logSafeFailure('Restock V3 shop sales lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch shop sales' });
    }
  });

  // ---- 目标 SKU（与 V2 同一套本地 SKU 库） ----

  router.get('/target-skus', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const [inventoryItems, products] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { userId }, select: { id: true, sku: true, name: true } }),
        prisma.product.findMany({ where: { userId }, select: { id: true, sku: true, name: true } }),
      ]);
      const unique = new Map<string, { id: string; sku: string; name: string }>();
      [...inventoryItems, ...products].forEach((item) => {
        const sku = normalizeRestockSku(item.sku);
        if (!sku || unique.has(sku)) return;
        unique.set(sku, { id: String(item.id), sku, name: String(item.name || '').trim() || sku });
      });
      const items = Array.from(unique.values()).sort((left, right) => left.sku.localeCompare(right.sku));
      return res.json({ items });
    } catch (error) {
      logSafeFailure('Restock V3 target SKU lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch target SKUs' });
    }
  });

  router.post('/target-skus', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
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
      if ([...products, ...inventoryItems].some((item) => normalizeRestockSku(item.sku) === sku)) {
        return res.status(409).json({ error: 'Target SKU already exists' });
      }

      const inventory = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_target_create', objectType: 'InventoryItem' }, async (tx) => {
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
      logSafeFailure('Restock V3 target SKU create failed', error);
      return res.status(500).json({ error: 'Failed to create target SKU' });
    }
  });

  // ---- 映射（ExternalSkuMapping，站点取自店铺；V2 同站点映射自动生效） ----

  router.put('/mapping', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let shopId: string;
      let externalSku: string;
      let targetSku: string;
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        externalSku = normalizeRestockSku(req.body?.externalSku);
        targetSku = normalizeRestockSku(req.body?.targetSku);
        if (!externalSku || !targetSku) throw new Error('Invalid SKU mapping payload');
      } catch {
        return res.status(400).json({ error: 'Invalid SKU mapping payload' });
      }
      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });

      const [inventoryItems, products] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
        prisma.product.findMany({ where: { userId }, select: { sku: true, name: true, cost: true } }),
      ]);
      const matchedInventory = inventoryItems.find((entry) => normalizeRestockSku(entry.sku) === targetSku);
      const matchedProduct = products.find((entry) => normalizeRestockSku(entry.sku) === targetSku);
      if (!matchedInventory && !matchedProduct) return res.status(400).json({ error: 'Target SKU not found' });
      const normalizedTargetSku = normalizeRestockSku(matchedInventory?.sku || matchedProduct!.sku);

      await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_mapping_save', objectType: 'ExternalSkuMapping' }, async (tx) => {
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
        await tx.externalSkuMapping.upsert({
          where: { userId_site_externalSku: { userId, site: shop.site, externalSku } },
          create: { userId, site: shop.site, externalSku, targetSku: normalizedTargetSku },
          update: { targetSku: normalizedTargetSku },
        });
      });
      if (!matchedInventory) await safeRedis.del(`inventory:${userId}`);
      return res.json({ externalSku, targetSku: normalizedTargetSku, site: shop.site });
    } catch (error) {
      logSafeFailure('Restock V3 SKU mapping failed', error);
      return res.status(500).json({ error: 'Failed to save SKU mapping' });
    }
  });

  // ---- SKU 规则（RestockSkuRule，站点取自店铺） ----

  router.get('/sku-rules', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const shop = await findOwnedShop(
        parseRequiredString(req.query.shopId, 'shopId', MAX_IMPORT_ID_LENGTH),
        req.user!.id,
      );
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const rules = await prisma.restockSkuRule.findMany({
        where: { userId: req.user!.id, site: shop.site },
        orderBy: { sku: 'asc' },
      });
      return res.json({ site: shop.site, rules });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid')) {
        return res.status(400).json({ error: 'shopId is required' });
      }
      logSafeFailure('Restock V3 SKU rule lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch SKU rules' });
    }
  });

  router.put('/sku-rules/:sku', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let shopId: string;
      let sku: string;
      let leadTimeDays: number | null;
      let safetyDays: number | null;
      let growthPercent: number | null;
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        sku = normalizeRestockSku(req.params.sku);
        if (!sku) throw new Error('Invalid sku');
        leadTimeDays = parseNullableBoundedNumber(req.body?.leadTimeDays, 'leadTimeDays', 0, MAX_PLANNING_DAYS, true);
        safetyDays = parseNullableBoundedNumber(req.body?.safetyDays, 'safetyDays', 0, MAX_PLANNING_DAYS, true);
        growthPercent = parseNullableBoundedNumber(req.body?.growthPercent, 'growthPercent', 0, MAX_GROWTH_PERCENT);
      } catch {
        return res.status(400).json({ error: 'Invalid SKU rule payload' });
      }
      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const inventoryItems = await prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } });
      if (!inventoryItems.some((item) => normalizeRestockSku(item.sku) === sku)) {
        return res.status(400).json({ error: 'Inventory SKU not found' });
      }
      const data = { leadTimeDays, safetyDays, growthPercent };
      const rule = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_rule_save', objectType: 'RestockSkuRule' }, (tx) => tx.restockSkuRule.upsert({
        where: { userId_site_sku: { userId, site: shop.site, sku } },
        create: { userId, site: shop.site, sku, ...data },
        update: data,
      }));
      return res.json(rule);
    } catch (error) {
      logSafeFailure('Restock V3 SKU rule update failed', error);
      return res.status(500).json({ error: 'Failed to save SKU rule' });
    }
  });

  // ---- 核心计算 ----

  router.post('/recommendations', requireRestockPermission('restock-v3.view'), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const activeYcClient = await getYcClient(userId);
      let shopId: string;
      let range: { from: string; to: string } | null;
      let planningDate: string;
      let targetDate: string;
      let leadTimeDays: number;
      let safetyDays: number;
      let growthPercent: number;
      let statisticsDaysOverride: number | null;
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        range = parseShopRange(req.body as Record<string, unknown>);
        if (!range) throw new Error('Invalid range');
        planningDate = parseDateQuery(req.body?.planningDate, 'planningDate')
          || new Date().toISOString().slice(0, 10);
        const parsedTargetDate = parseDateQuery(req.body?.targetDate, 'targetDate');
        if (!parsedTargetDate) throw new Error('Invalid targetDate');
        targetDate = parsedTargetDate;
        leadTimeDays = parseBoundedQueryNumber(req.body?.leadTimeDays, 'leadTimeDays', 25, 0, MAX_PLANNING_DAYS, true);
        safetyDays = parseBoundedQueryNumber(req.body?.safetyDays, 'safetyDays', 30, 0, MAX_PLANNING_DAYS, true);
        growthPercent = parseBoundedQueryNumber(req.body?.growthPercent, 'growthPercent', 0, 0, MAX_GROWTH_PERCENT);
        statisticsDaysOverride = parseNullableBoundedNumber(
          req.body?.statisticsDays, 'statisticsDays', 1, MAX_PLANNING_DAYS, true,
        );
        const horizonDays = (
          Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${planningDate}T00:00:00.000Z`)
        ) / (24 * 60 * 60 * 1000);
        if (horizonDays <= leadTimeDays || horizonDays > MAX_PLANNING_DAYS) throw new Error('Invalid targetDate');
      } catch {
        return res.status(400).json({ error: 'Invalid restock parameters' });
      }

      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const site = shop.site;

      const dailyRows = await fetchShopSalesRows(shop.id, range!.from, range!.to);
      if (dailyRows.length === 0) {
        return res.status(400).json({ error: 'No product analysis uploads in this date range' });
      }
      const aggregate = aggregateShopVariantSales(dailyRows);
      const statisticsDays = statisticsDaysOverride ?? aggregate.shopObservedDays;
      if (!statisticsDays || statisticsDays < 1) {
        return res.status(500).json({ error: 'Shop sales contain invalid statistics days' });
      }

      const { rows: mappedRows } = await resolveSalesMappings(userId, site, aggregate);
      const [inventoryItems, products, warehouseMappings, savedRules] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { userId } }),
        prisma.product.findMany({ where: { userId } }),
        prisma.warehouseMapping.findMany({ where: { userId } }),
        prisma.restockSkuRule.findMany({ where: { userId, site } }),
      ]);
      const inventoryBySku = new Map(inventoryItems.map((item) => [normalizeRestockSku(item.sku), item]));
      const productBySku = new Map(products.map((product) => [normalizeRestockSku(product.sku), product]));
      const pendingCount = mappedRows.filter((row) => !row.targetSku).length;
      const inventoryBackedRows = mappedRows.filter(
        (row) => row.targetSku && inventoryBySku.has(row.targetSku),
      );
      const excludedOversizedSkus = inventoryBackedRows
        .filter((row) => row.targetSku!.length > YC_STOCK_SKU_MAX_LENGTH)
        .map((row) => row.targetSku!);
      const validRows = inventoryBackedRows.filter(
        (row) => row.targetSku!.length <= YC_STOCK_SKU_MAX_LENGTH,
      );
      const importedInventoryItems = validRows.map((row) => {
        const inventory = inventoryBySku.get(row.targetSku!)!;
        return { ...inventory, dailySales: row.units / statisticsDays };
      });
      const importedProducts = validRows.map((row) => {
        const inventory = inventoryBySku.get(row.targetSku!)!;
        const product = productBySku.get(row.targetSku!);
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

      if (!activeYcClient.isConfigured()) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const skus = importedInventoryItems.map((item) => item.sku);
      const ycSkuAliases = buildYcSkuAliasMap(warehouseMappings, skus);
      const querySkus = Array.from(
        new Set([...skus, ...Array.from(ycSkuAliases.keys())]),
      ).filter((sku) => sku.length <= YC_STOCK_SKU_MAX_LENGTH);
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
      const eligibleSkus = new Set(validRows.map((row) => row.targetSku!));
      const skuRules = savedRules
        .filter((rule) => eligibleSkus.has(normalizeRestockSku(rule.sku)))
        .map((rule) => ({
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
        logSafeFailure('Restock V3 plan rejected', error);
        if (error instanceof RestockPlanValidationError) {
          return res.status(400).json({ error: 'Invalid restock parameters' });
        }
        if (error instanceof RestockSourceDataError) {
          return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
        }
        return res.status(500).json({ error: 'Failed to build restock recommendations' });
      }

      const response: RestockResponse & { metadata: Record<string, unknown> } = {
        ...plan,
        metadata: {
          shopId: shop.id,
          shopName: shop.name,
          from: range!.from,
          to: range!.to,
          statisticsDays,
          observedDays: aggregate.shopObservedDays,
          statisticsDaysOverridden: statisticsDaysOverride !== null,
          pendingCount,
          excludedMissingInventoryCount: mappedRows.filter(
            (row) => row.targetSku && !inventoryBySku.has(row.targetSku),
          ).length,
          excludedOversizedSkus,
          noSkuVariationCount: aggregate.noSkuVariationCount,
          noSkuVariationUnits: aggregate.noSkuVariationUnits,
        },
        integration: {
          ycConfigured: true,
          remoteFetched: true,
          stockSource: stockRows.length > 0 ? 'yc' : 'missing',
          warehouseCodes,
          warnings: warehouseResolution.warnings,
        },
      };
      return res.json(response);
    } catch (error) {
      logSafeFailure('Restock V3 recommendation request failed', error);
      return res.status(500).json({ error: 'Failed to build restock recommendations' });
    }
  });

  return router;
};

export default createRestockV3Router();
