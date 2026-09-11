/**
 * 补货V3 路由（2026-09 升级）：商品分析店铺（需求源）× 元仓站点仓储（供应源）的补货工作台后端。
 *
 * 升级要点：
 * - 计算单位 = 用户 + 库存池（仓库范围）+ 最终补货 SKU；店铺只是需求来源。
 * - 匹配链（restockV3Matching）：店铺专属映射 → 规格货号与元仓 customerSku 唯一精确匹配
 *   （免本地档案直连）→ 无冲突站点级历史映射（V2 兼容）→ 自身即本地 SKU；其余待核对。
 * - 多平台 SKU / 多店铺指向同一最终补货 SKU 时需求合并为一条建议，来源全部可追溯。
 * - 计算策略（restockPlanner policies）：元仓无库存行 ≠ 零库存（不可执行）；无 ETA / 逾期在途
 *   不计入确定供应；逐日模拟识别中途断货与到仓前缺口。V2 引擎默认行为不变。
 * - 销量口径第一阶段保留 unitsOrdered（已下订单件数），分母默认 = 店铺实际上传天数，
 *   全链路标注分母 / 自然日 / 有效观测日 / 缺失日 / 覆盖率与数据质量状态。
 * - 响应带快照指纹（条件版本）；计划快照支持草稿 → 已确认 → 作废与导出版本一致。
 */

import { createHash } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { prisma, safeRedis } from '../index';
import { withUsageEvent } from '../services/usageEvents';
import { getProductListCacheKey } from '../services/productCache';
import {
  buildRestockPlan,
  RestockPlanValidationError,
  RestockSourceDataError,
  type RestockPlan,
  type RestockPlanItem,
  type RestockProductInput,
  type RestockInventoryInput,
  type RestockSkuRule,
  type RemoteStockRow,
  type RemoteInboundOrder,
} from '../services/restockPlanner';
import { createUserYcOpenPlatformClient, type YcOpenPlatformClient, type YcProduct } from '../services/ycOpenPlatformClient';
import { normalizeRestockSku } from '../services/restockSalesImport';
import { aggregateShopVariantSales, type ShopDailyItemRow, type ShopVariantSalesRow } from '../services/restockShopSales';
import {
  buildMatchChain,
  normalizeExternalSkuType,
  type ExternalSkuType,
  type ResolvedTarget,
  type YcProductIdentity,
} from '../services/restockV3Matching';
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

const ALGORITHM_VERSION = 'v3.1';
const MAX_QUERY_RANGE_DAYS = 366;
const MAX_SHOPS_PER_PLAN = 10;
const SALES_QUALITY_MIN_OBSERVED_DAYS = 3;
const SALES_QUALITY_STALE_DAYS = 7;
const YC_PRODUCTS_TTL_MS = 5 * 60_000;
const MAX_PLAN_ITEMS = 5000;
const MAX_PLAN_NAME_LENGTH = 200;
const MAX_WAREHOUSE_CODES_PER_POOL = 100;

const RESTOCK_V3_POLICIES = {
  missingStockPolicy: 'unknown' as const,
  inboundEtaPolicy: 'strict' as const,
  simulateDaily: true,
  quantityMode: 'simulation' as const,
};

const requireRestockPermission = createRestockPermissionGuard(() => prisma, 'restock-v3');

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

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
    where: { shopId, isActive: true, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
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

// ---------------------------------------------------------------------------
// 元仓货品清单（exact-yc 匹配依据；短 TTL 进程内缓存）
// ---------------------------------------------------------------------------

interface YcProductsCacheEntry {
  at: number;
  fetchedAt: string;
  index: Map<string, YcProductIdentity[]>;
}

const ycProductsCache = new Map<string, YcProductsCacheEntry>();

/**
 * 源数据快照缓存（每用户一条）：同源条件（店铺/区间/仓库范围/映射与规则版本）下，
 * 调整计算参数重算时复用元仓库存与在途，避免每次改参全量拉取；
 * 「刷新源数据」（forceRefresh）绕过缓存强制重取。
 */
interface RestockSourceCacheEntry {
  sourceFingerprint: string;
  at: number;
  fetchedAt: string;
  sourceSnapshotId: string;
  stockRows: RemoteStockRow[];
  inboundOrders: RemoteInboundOrder[];
}

const restockSourceCache = new Map<string, RestockSourceCacheEntry>();
const RESTOCK_SOURCE_CACHE_TTL_MS = 10 * 60_000;
const RESTOCK_SOURCE_CACHE_MAX_ENTRIES = 200;

async function fetchYcProductIndex(
  ycClient: YcOpenPlatformClient,
  userId: string,
): Promise<{ entry: YcProductsCacheEntry | null; warning: string | null }> {
  const cached = ycProductsCache.get(userId);
  if (cached && Date.now() - cached.at < YC_PRODUCTS_TTL_MS) {
    return { entry: cached, warning: null };
  }
  if (typeof ycClient.listProducts !== 'function') {
    return { entry: null, warning: 'YC product list is unavailable; exact-match with YC SKUs is disabled.' };
  }
  try {
    const products = await ycClient.listProducts();
    const index = new Map<string, YcProductIdentity[]>();
    for (const product of products as YcProduct[]) {
      const sku = normalizeRestockSku(product.customerSku ?? '');
      if (!sku) continue;
      const entries = index.get(sku) ?? [];
      entries.push({
        customerSku: String(product.customerSku ?? '').trim(),
        customerSkuName: product.customerSkuName ?? null,
      });
      index.set(sku, entries);
    }
    const entry: YcProductsCacheEntry = { at: Date.now(), fetchedAt: new Date().toISOString(), index };
    ycProductsCache.set(userId, entry);
    return { entry, warning: null };
  } catch (error) {
    logSafeFailure('YC product list lookup failed', error);
    return { entry: null, warning: 'YC product list fetch failed; exact-match with YC SKUs is disabled.' };
  }
}

// ---------------------------------------------------------------------------
// 数据质量（2026-09 第二轮：最差来源合并、stale 锚定计划日、可执行判定）
// ---------------------------------------------------------------------------

export interface SalesQuality {
  status: 'ok' | 'insufficient' | 'stale' | 'zero' | 'no_data';
  observedDays: number;
  shopObservedDays: number;
  missingDays: number;
  coverage: number;
  latestObservedDate: string | null;
  totalUnits: number;
  /** 质量 维度是否可执行：no_data / stale 视为严重不足 → 不可执行；insufficient 为受限估算 */
  executable: boolean;
}

interface QualitySource {
  shopId: string;
  units: number;
  observedDays: number;
  shopObservedDays: number;
  latestObservedDate: string | null;
}

const QUALITY_SEVERITY: Record<SalesQuality['status'], number> = {
  ok: 0,
  zero: 1,
  insufficient: 2,
  stale: 3,
  no_data: 4,
};

function sourceQuality(source: QualitySource, planningDate: string): SalesQuality {
  const staleBefore = parseDateUtc(planningDate).getTime() - SALES_QUALITY_STALE_DAYS * 86_400_000;
  // 过旧锚定计划日（而非区间末日）：最新观测早于「计划日 − 7 天」即视为过旧
  const isStale = source.latestObservedDate === null
    || parseDateUtc(source.latestObservedDate).getTime() < staleBefore;
  const status: SalesQuality['status'] = source.observedDays === 0
    ? 'no_data'
    : source.units === 0
      ? 'zero'
      : isStale
        ? 'stale'
        : source.observedDays < SALES_QUALITY_MIN_OBSERVED_DAYS
          ? 'insufficient'
          : 'ok';
  return {
    status,
    observedDays: source.observedDays,
    shopObservedDays: source.shopObservedDays,
    missingDays: Math.max(0, source.shopObservedDays - source.observedDays),
    coverage: source.shopObservedDays > 0 ? Math.min(1, source.observedDays / source.shopObservedDays) : 0,
    latestObservedDate: source.latestObservedDate,
    totalUnits: source.units,
    executable: status === 'ok' || status === 'zero' || status === 'insufficient',
  };
}

function computeSalesQuality(sources: QualitySource[], planningDate: string): SalesQuality {
  const perSource = sources.map(source => sourceQuality(source, planningDate));
  if (perSource.length === 0) {
    return {
      status: 'no_data',
      observedDays: 0,
      shopObservedDays: 0,
      missingDays: 0,
      coverage: 0,
      latestObservedDate: null,
      totalUnits: 0,
      executable: false,
    };
  }
  // 最差来源决定整体质量：不允许可靠来源掩盖缺失来源（不使用 max 观测天数）
  const worst = perSource.reduce((left, right) =>
    QUALITY_SEVERITY[right.status] > QUALITY_SEVERITY[left.status] ? right : left);
  return {
    ...worst,
    totalUnits: perSource.reduce((sum, quality) => sum + quality.totalUnits, 0),
  };
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

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
          where: { userId, isActive: true },
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

  /** 店铺销量视图：本地聚合 + 本地映射（快，不拉元仓；元仓同码直连在计算时自动完成） */
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
      const [shopMappings, siteMappings, inventoryItems, products] = await Promise.all([
        prisma.restockShopSkuMapping.findMany({ where: { userId, shopId: shop.id } }),
        prisma.externalSkuMapping.findMany({ where: { userId, site: shop.site } }),
        prisma.inventoryItem.findMany({ where: { userId }, select: { sku: true } }),
        prisma.product.findMany({ where: { userId }, select: { sku: true } }),
      ]);
      const ownedLocalSkus = new Set<string>();
      const localSkuNames = new Map<string, string>();
      for (const item of [...inventoryItems, ...products]) {
        const sku = normalizeRestockSku(item.sku);
        if (sku) {
          ownedLocalSkus.add(sku);
          localSkuNames.set(sku, localSkuNames.get(sku) ?? '');
        }
      }
      const { resolved, review } = buildMatchChain({
        shopNames: new Map([[shop.id, shop.name]]),
        rowsByShop: new Map([[shop.id, aggregate.rows]]),
        shopMappings,
        siteMappings,
        ownedLocalSkus,
        localSkuNames,
        ycProducts: new Map(), // 销量视图不拉元仓清单；exact-yc 在计算时完成
      });
      const targetByExternal = new Map<string, { targetSku: string; matchType: string }>();
      for (const entry of resolved.values()) {
        for (const source of entry.sources) {
          targetByExternal.set(`${source.shopId}\0${source.row.externalSku}`, {
            targetSku: entry.targetSku,
            matchType: entry.matchType,
          });
        }
      }
      const reviewByExternal = new Map(review.map(entry => [`${entry.shopId}\0${entry.externalSku}`, entry]));
      const rows = aggregate.rows.map((row) => {
        const matched = targetByExternal.get(`${shop.id}\0${row.externalSku}`) ?? null;
        const reviewEntry = reviewByExternal.get(`${shop.id}\0${row.externalSku}`);
        return {
          ...row,
          targetSku: matched?.targetSku ?? null,
          mappingStatus: matched ? 'mapped' as const : 'pending' as const,
          matchType: matched?.matchType ?? null,
          pendingReasons: reviewEntry?.reasons ?? [],
        };
      });
      return res.json({
        shop: { id: shop.id, name: shop.name, site: shop.site, currency: shop.currency },
        from: range.from,
        to: range.to,
        shopObservedDays: aggregate.shopObservedDays,
        calendarDays: Math.round((parseDateUtc(range.to).getTime() - parseDateUtc(range.from).getTime()) / 86_400_000) + 1,
        observedDates: aggregate.observedDates,
        pendingCount: review.length,
        collisionKeys: aggregate.collisionKeys,
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

  // ---- 映射（默认店铺专属作用域；scope='site' 写入 V2 共享表） ----

  router.put('/mapping', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let shopId: string;
      let externalSku: string;
      let targetSku: string;
      let scope: 'shop' | 'site';
      let externalSkuType: ExternalSkuType;
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        externalSku = normalizeRestockSku(req.body?.externalSku);
        targetSku = normalizeRestockSku(req.body?.targetSku);
        if (!externalSku || !targetSku) throw new Error('Invalid SKU mapping payload');
        scope = req.body?.scope === 'site' ? 'site' : 'shop';
        // 编号类型（人工映射绑定的身份）：仅接受三种编号类型；缺省 = legacy（历史字符串映射）
        externalSkuType = normalizeExternalSkuType(req.body?.externalSkuType);
        if (req.body?.externalSkuType !== undefined && externalSkuType === 'legacy'
          && req.body.externalSkuType !== 'legacy') {
          throw new Error('Invalid externalSkuType');
        }
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

      if (scope === 'site') {
        // 站点级（V2 共享）：保持 V2 行为，必要时回填 InventoryItem；
        // externalSkuType=legacy 的行 V2 可见，typed 行仅 V3 按 身份 使用
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
            where: { userId_site_externalSku_externalSkuType: { userId, site: shop.site, externalSku, externalSkuType } },
            create: { userId, site: shop.site, externalSku, externalSkuType, targetSku: normalizedTargetSku },
            update: { targetSku: normalizedTargetSku },
          });
        });
        if (!matchedInventory) await safeRedis.del(`inventory:${userId}`);
        return res.json({ externalSku, targetSku: normalizedTargetSku, externalSkuType, site: shop.site, scope });
      }

      await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_mapping_save', objectType: 'RestockShopSkuMapping' }, (tx) => tx.restockShopSkuMapping.upsert({
        where: { userId_shopId_externalSku_externalSkuType: { userId, shopId: shop.id, externalSku, externalSkuType } },
        create: { userId, shopId: shop.id, site: shop.site, externalSku, externalSkuType, targetSku: normalizedTargetSku },
        update: { targetSku: normalizedTargetSku },
      }));
      return res.json({ externalSku, targetSku: normalizedTargetSku, externalSkuType, shopId: shop.id, site: shop.site, scope });
    } catch (error) {
      logSafeFailure('Restock V3 SKU mapping failed', error);
      return res.status(500).json({ error: 'Failed to save SKU mapping' });
    }
  });

  router.delete('/mapping', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let shopId: string;
      let externalSku: string;
      let scope: 'shop' | 'site';
      let externalSkuType: ExternalSkuType | null;
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        externalSku = normalizeRestockSku(req.body?.externalSku);
        if (!externalSku) throw new Error('Invalid SKU mapping payload');
        scope = req.body?.scope === 'site' ? 'site' : 'shop';
        // 指定编号类型 = 只删除该身份的映射；缺省 = 删除该货号全部类型（结果页「恢复继承」）
        if (req.body?.externalSkuType !== undefined) {
          externalSkuType = normalizeExternalSkuType(req.body.externalSkuType);
          if (externalSkuType === 'legacy' && req.body.externalSkuType !== 'legacy') {
            throw new Error('Invalid externalSkuType');
          }
        } else {
          externalSkuType = null;
        }
      } catch {
        return res.status(400).json({ error: 'Invalid SKU mapping payload' });
      }
      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      if (scope === 'site') {
        await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_mapping_delete', objectType: 'ExternalSkuMapping' }, (tx) => tx.externalSkuMapping.deleteMany({
          where: { userId, site: shop.site, externalSku, ...(externalSkuType ? { externalSkuType } : {}) },
        }));
      } else {
        await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_mapping_delete', objectType: 'RestockShopSkuMapping' }, (tx) => tx.restockShopSkuMapping.deleteMany({
          where: { userId, shopId: shop.id, externalSku, ...(externalSkuType ? { externalSkuType } : {}) },
        }));
      }
      return res.json({ deleted: true, scope });
    } catch (error) {
      logSafeFailure('Restock V3 SKU mapping delete failed', error);
      return res.status(500).json({ error: 'Failed to delete SKU mapping' });
    }
  });

  // ---- SKU 规则（店铺专属优先；scope='site' 写 V2 共享表） ----

  router.get('/sku-rules', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const shop = await findOwnedShop(
        parseRequiredString(req.query.shopId, 'shopId', MAX_IMPORT_ID_LENGTH),
        req.user!.id,
      );
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const [shopRules, siteRules] = await Promise.all([
        prisma.restockShopRule.findMany({ where: { userId: req.user!.id, shopId: shop.id }, orderBy: { sku: 'asc' } }),
        prisma.restockSkuRule.findMany({ where: { userId: req.user!.id, site: shop.site }, orderBy: { sku: 'asc' } }),
      ]);
      return res.json({
        site: shop.site,
        rules: [
          ...shopRules.map(rule => ({ ...rule, scope: 'shop' as const })),
          ...siteRules.map(rule => ({ ...rule, scope: 'site' as const })),
        ],
      });
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
      let scope: 'shop' | 'site';
      try {
        shopId = parseRequiredString(req.body?.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
        sku = normalizeRestockSku(req.params.sku);
        if (!sku) throw new Error('Invalid sku');
        leadTimeDays = parseNullableBoundedNumber(req.body?.leadTimeDays, 'leadTimeDays', 0, MAX_PLANNING_DAYS, true);
        safetyDays = parseNullableBoundedNumber(req.body?.safetyDays, 'safetyDays', 0, MAX_PLANNING_DAYS, true);
        growthPercent = parseNullableBoundedNumber(req.body?.growthPercent, 'growthPercent', 0, MAX_GROWTH_PERCENT);
        scope = req.body?.scope === 'site' ? 'site' : 'shop';
      } catch {
        return res.status(400).json({ error: 'Invalid SKU rule payload' });
      }
      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      // 放宽：元仓同码直连 SKU 无本地档案也需要规则覆盖，故仅校验编码合法性
      const data = { leadTimeDays, safetyDays, growthPercent };
      const rule = scope === 'site'
        ? await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_rule_save', objectType: 'RestockSkuRule' }, (tx) => tx.restockSkuRule.upsert({
          where: { userId_site_sku: { userId, site: shop.site, sku } },
          create: { userId, site: shop.site, sku, ...data },
          update: data,
        }))
        : await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_rule_save', objectType: 'RestockShopRule' }, (tx) => tx.restockShopRule.upsert({
          where: { userId_shopId_sku: { userId, shopId: shop.id, sku } },
          create: { userId, shopId: shop.id, sku, ...data },
          update: data,
        }));
      return res.json(rule);
    } catch (error) {
      logSafeFailure('Restock V3 SKU rule update failed', error);
      return res.status(500).json({ error: 'Failed to save SKU rule' });
    }
  });

  // ---- 元仓货品清单（待核对候选 / 直连身份） ----

  router.get('/yc-products', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const site = normalizeSite(req.query.site);
      const activeYcClient = await getYcClient(req.user!.id);
      if (!activeYcClient.isConfigured()) {
        return res.status(503).json({ error: 'YC credentials are not configured' });
      }
      const { entry, warning } = await fetchYcProductIndex(activeYcClient, req.user!.id);
      if (!entry) {
        return res.status(503).json({ error: 'YC product list is unavailable', warning });
      }
      // 元仓货品为账户级数据（openPlatform/product/list 无站点维度），
      // 不制造虚假的站点过滤；site 仅作为回显供前端标识当前上下文。
      const products = Array.from(entry.index.values())
        .flat()
        .sort((left, right) => left.customerSku.localeCompare(right.customerSku));
      return res.json({ products, site: site || null, fetchedAt: entry.fetchedAt, warning });
    } catch (error) {
      logSafeFailure('Restock V3 YC product lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch YC products' });
    }
  });

  /** 删除 SKU 规则 = 恢复继承（店铺级删除店铺覆盖；站点级删除 V2 共享覆盖） */
  router.delete('/sku-rules/:sku', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const shopId = parseRequiredString(req.body?.shopId ?? req.query.shopId, 'shopId', MAX_IMPORT_ID_LENGTH);
      const sku = normalizeRestockSku(req.params.sku);
      if (!sku) return res.status(400).json({ error: 'Invalid sku' });
      const scope = (req.body?.scope ?? req.query.scope) === 'site' ? 'site' : 'shop';
      const shop = await findOwnedShop(shopId, userId);
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      const deleted = scope === 'site'
        ? await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_rule_delete', objectType: 'RestockSkuRule' }, (tx) => tx.restockSkuRule.deleteMany({ where: { userId, site: shop.site, sku } }))
        : await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_rule_delete', objectType: 'RestockShopRule' }, (tx) => tx.restockShopRule.deleteMany({ where: { userId, shopId: shop.id, sku } }));
      return res.json({ deleted: deleted.count > 0 });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid')) {
        return res.status(400).json({ error: 'shopId is required' });
      }
      logSafeFailure('Restock V3 SKU rule delete failed', error);
      return res.status(500).json({ error: 'Failed to delete SKU rule' });
    }
  });

  // ---- 元仓真实仓库（库存池管理用；账户级数据） ----

  router.get('/warehouses', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const activeYcClient = await getYcClient(req.user!.id);
      if (!activeYcClient.isConfigured()) {
        return res.status(503).json({ error: 'YC credentials are not configured' });
      }
      try {
        const warehouses = await activeYcClient.listCustomerWarehouses();
        return res.json({
          warehouses: warehouses.map(warehouse => ({
            code: String(warehouse.code ?? '').trim(),
            name: warehouse.name ?? null,
            siteCode: warehouse.siteCode ?? null,
          })).filter(warehouse => warehouse.code),
        });
      } catch (error) {
        logSafeFailure('YC warehouse list failed', error);
        return res.status(503).json({ error: 'YC warehouse list is unavailable' });
      }
    } catch (error) {
      logSafeFailure('Restock V3 warehouse lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch warehouses' });
    }
  });

  // ---- 库存池 ----

  router.get('/pools', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const pools = await prisma.restockStockPool.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ pools });
    } catch (error) {
      logSafeFailure('Restock V3 pool lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch stock pools' });
    }
  });

  router.post('/pools', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      let name: string;
      let site: string;
      let warehouseCodes: string[];
      try {
        name = parseRequiredString(req.body?.name, 'name', 100);
        site = normalizeSite(parseRequiredString(req.body?.site, 'site', MAX_SITE_LENGTH));
        if (!Array.isArray(req.body?.warehouseCodes)) throw new Error('Invalid warehouseCodes');
        warehouseCodes = Array.from(new Set(
          (req.body.warehouseCodes as unknown[])
            .map(code => String(code ?? '').trim())
            .filter(Boolean),
        ));
        if (warehouseCodes.length === 0 || warehouseCodes.length > MAX_WAREHOUSE_CODES_PER_POOL) {
          throw new Error('Invalid warehouseCodes');
        }
        if (warehouseCodes.some(code => code.length > 128)) throw new Error('Invalid warehouseCodes');
      } catch {
        return res.status(400).json({ error: 'Invalid stock pool payload' });
      }
      const pool = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_pool_create', objectType: 'RestockStockPool' }, (tx) => tx.restockStockPool.create({
        data: { userId, name, site, warehouseCodes },
      }));
      return res.status(201).json(pool);
    } catch (error) {
      logSafeFailure('Restock V3 pool create failed', error);
      return res.status(500).json({ error: 'Failed to create stock pool' });
    }
  });

  router.delete('/pools/:id', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const deleted = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_pool_delete', objectType: 'RestockStockPool' }, (tx) => tx.restockStockPool.deleteMany({
        where: { id: String(req.params.id ?? ''), userId: req.user!.id },
      }));
      return res.json({ deleted: deleted.count > 0 });
    } catch (error) {
      logSafeFailure('Restock V3 pool delete failed', error);
      return res.status(500).json({ error: 'Failed to delete stock pool' });
    }
  });

  // ---- 核心计算 ----

  router.post('/recommendations', requireRestockPermission('restock-v3.view'), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      let shopIds: string[];
      let range: { from: string; to: string } | null;
      let planningDate: string;
      let targetDate: string;
      let leadTimeDays: number;
      let safetyDays: number;
      let growthPercent: number;
      let statisticsDaysOverride: number | null;
      let poolId: string | null;
      let explicitWarehouseCodes: string[] | null;
      try {
        const rawShopIds = Array.isArray(req.body?.shopIds)
          ? (req.body.shopIds as unknown[]).map(id => String(id ?? ''))
          : req.body?.shopId !== undefined
            ? [String(req.body.shopId)]
            : [];
        shopIds = Array.from(new Set(rawShopIds.map(id => id.trim()).filter(Boolean)));
        if (shopIds.length === 0 || shopIds.length > MAX_SHOPS_PER_PLAN) throw new Error('Invalid shopIds');
        if (shopIds.some(id => id.length > MAX_IMPORT_ID_LENGTH)) throw new Error('Invalid shopIds');
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
        poolId = typeof req.body?.poolId === 'string' && req.body.poolId.trim() ? req.body.poolId.trim().slice(0, MAX_IMPORT_ID_LENGTH) : null;
        explicitWarehouseCodes = Array.isArray(req.body?.warehouseCodes)
          ? Array.from(new Set((req.body.warehouseCodes as unknown[]).map(code => String(code ?? '').trim()).filter(Boolean)))
          : null;
        const horizonDays = (
          Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${planningDate}T00:00:00.000Z`)
        ) / (24 * 60 * 60 * 1000);
        if (horizonDays <= leadTimeDays || horizonDays > MAX_PLANNING_DAYS) throw new Error('Invalid targetDate');
      } catch {
        return res.status(400).json({ error: 'Invalid restock parameters' });
      }

      const shops = await prisma.productAnalysisShop.findMany({ where: { userId, id: { in: shopIds } } });
      if (shops.length !== shopIds.length) return res.status(404).json({ error: 'Shop not found' });
      const site = normalizeSite(shops[0].site);
      if (shops.some(shop => normalizeSite(shop.site) !== site)) {
        return res.status(400).json({ error: 'All shops must belong to the same site for a shared pool calculation' });
      }

      // ---- 销量聚合（逐店铺） ----
      const perShop = await Promise.all(shopIds.map(async (shopId) => {
        const dailyRows = await fetchShopSalesRows(shopId, range!.from, range!.to);
        const aggregate = aggregateShopVariantSales(dailyRows);
        return { shopId, aggregate };
      }));
      // 共仓完整性：任一选定店铺区间内无上传 → 其需求未知（不等于零需求），阻断整次计算
      const emptyShops = shops.filter(shop => {
        const entry = perShop.find(candidate => candidate.shopId === shop.id);
        return !entry || entry.aggregate.rows.length === 0;
      });
      if (emptyShops.length > 0) {
        return res.status(400).json({
          error: `以下店铺在统计区间内没有有效上传数据，无法确定其需求：${emptyShops.map(shop => shop.name).join('、')}。请调整区间或取消选择这些店铺。`,
        });
      }
      const shopsWithRows = perShop.filter(entry => entry.aggregate.rows.length > 0);
      const shopNames = new Map(shops.map(shop => [shop.id, shop.name]));
      const rowsByShop = new Map(shopsWithRows.map(entry => [entry.shopId, entry.aggregate.rows]));
      const shopObservedDaysByShop = new Map(perShop.map(entry => [entry.shopId, entry.aggregate.shopObservedDays]));

      // ---- 本地档案与映射 ----
      const [inventoryItems, products, warehouseMappings, savedSiteRules, savedShopRules, siteMappings, shopMappings] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { userId } }),
        prisma.product.findMany({ where: { userId } }),
        prisma.warehouseMapping.findMany({ where: { userId } }),
        prisma.restockSkuRule.findMany({ where: { userId, site } }),
        prisma.restockShopRule.findMany({ where: { userId, shopId: { in: shopIds } } }),
        prisma.externalSkuMapping.findMany({ where: { userId, site } }),
        prisma.restockShopSkuMapping.findMany({ where: { userId, shopId: { in: shopIds } } }),
      ]);
      const inventoryBySku = new Map(inventoryItems.map((item) => [normalizeRestockSku(item.sku), item]));
      const productBySku = new Map(products.map((product) => [normalizeRestockSku(product.sku), product]));
      const ownedLocalSkus = new Set<string>([
        ...Array.from(inventoryBySku.keys()),
        ...Array.from(productBySku.keys()),
      ]);
      const localSkuNames = new Map<string, string>();
      for (const [sku, item] of inventoryBySku) localSkuNames.set(sku, item.name);
      for (const [sku, product] of productBySku) localSkuNames.set(sku, product.name || sku);

      // ---- 元仓清单 + 匹配链 ----
      const activeYcClient = await getYcClient(userId);
      if (!activeYcClient.isConfigured()) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }
      const ycProductsResult = await fetchYcProductIndex(activeYcClient, userId);
      const matchChain = buildMatchChain({
        shopNames,
        rowsByShop,
        shopMappings,
        siteMappings,
        ownedLocalSkus,
        localSkuNames,
        ycProducts: ycProductsResult.entry?.index ?? new Map(),
      });

      // ---- 目标分组：超长 SKU 不能查询元仓 → 待核对 ----
      const excludedOversizedSkus: string[] = [];
      const eligibleTargets: ResolvedTarget[] = [];
      const review = [...matchChain.review];
      for (const [targetSku, entry] of matchChain.resolved) {
        if (targetSku.length > YC_STOCK_SKU_MAX_LENGTH) {
          excludedOversizedSkus.push(targetSku);
          review.push({
            shopId: entry.sources[0].shopId,
            shopName: entry.sources[0].shopName,
            identityKey: entry.sources[0].row.identityKey,
            externalSku: entry.sources[0].row.externalSku,
            displaySku: entry.sources[0].row.displaySku,
            skuSource: entry.sources[0].row.skuSource,
            level: entry.sources[0].row.level,
            itemId: entry.sources[0].row.itemId,
            itemName: entry.sources[0].row.itemName,
            variationName: entry.sources[0].row.variationName,
            units: entry.sources.reduce((sum, source) => sum + source.row.units, 0),
            observedDays: Math.max(...entry.sources.map(source => source.row.observedDays)),
            salesStatus: entry.sources[0].row.salesStatus,
            status: 'conflict',
            reasons: [`目标 SKU 超出元仓查询长度限制（>${YC_STOCK_SKU_MAX_LENGTH} 字符）`],
            candidates: [],
          });
          continue;
        }
        eligibleTargets.push(entry);
      }

      // ---- 合并需求（多平台 SKU / 多店铺） ----
      // 规则作用域：店铺规则按 (shopId, sku)；站点规则按 sku。
      // growth 先按各来源店铺规则折算再合并（blended，与选择顺序无关）；
      // leadTime / safety 多来源冲突取最大值（保守），并在结果行 warning 列明。
      const denominatorByShop = new Map<string, number>();
      for (const [shopId, observedDays] of shopObservedDaysByShop) {
        denominatorByShop.set(shopId, statisticsDaysOverride ?? Math.max(1, observedDays));
      }
      const shopRuleByShopSku = new Map<string, typeof savedShopRules[number]>();
      for (const rule of savedShopRules) {
        const skuKey = normalizeRestockSku(rule.sku);
        if (skuKey) shopRuleByShopSku.set(`${rule.shopId}\0${skuKey}`, rule);
      }
      const siteRuleBySku = new Map(savedSiteRules.map(rule => [normalizeRestockSku(rule.sku), rule]));
      const baseDailyByTarget = new Map<string, number>();
      const blendedGrowthByTarget = new Map<string, number>();
      const hasExplicitGrowthByTarget = new Map<string, boolean>();
      const mergedLeadByTarget = new Map<string, number | undefined>();
      const mergedSafetyByTarget = new Map<string, number | undefined>();
      const hasRuleByTarget = new Map<string, boolean>();
      const ruleConflictWarningsByTarget = new Map<string, string[]>();
      for (const entry of eligibleTargets) {
        const targetSku = entry.targetSku;
        const siteRule = siteRuleBySku.get(targetSku);
        const explicitGrowths = new Set<number>();
        const leadCandidates: number[] = [];
        const safetyCandidates: number[] = [];
        const sourceShopIds = Array.from(new Set(entry.sources.map(source => source.shopId))).sort();
        let baseDaily = 0;
        let adjustedDaily = 0;
        let shopLeadSeen = false;
        let shopSafetySeen = false;
        for (const shopId of sourceShopIds) {
          const rule = shopRuleByShopSku.get(`${shopId}\0${targetSku}`);
          if (rule?.growthPercent !== null && rule?.growthPercent !== undefined) explicitGrowths.add(rule.growthPercent);
          if (rule?.leadTimeDays !== null && rule?.leadTimeDays !== undefined) { leadCandidates.push(rule.leadTimeDays); shopLeadSeen = true; }
          if (rule?.safetyDays !== null && rule?.safetyDays !== undefined) { safetyCandidates.push(rule.safetyDays); shopSafetySeen = true; }
        }
        if (siteRule?.growthPercent !== null && siteRule?.growthPercent !== undefined) explicitGrowths.add(siteRule.growthPercent);
        // 店铺规则更具体、优先于站点规则；仅当无任何店铺规则覆盖该字段时回退站点规则。
        // 多店铺店铺规则互相冲突 → 取最大（保守），warning 列明（与选择顺序无关）。
        if (!shopLeadSeen && siteRule?.leadTimeDays !== null && siteRule?.leadTimeDays !== undefined) leadCandidates.push(siteRule.leadTimeDays);
        if (!shopSafetySeen && siteRule?.safetyDays !== null && siteRule?.safetyDays !== undefined) safetyCandidates.push(siteRule.safetyDays);

        for (const source of entry.sources) {
          const denominator = denominatorByShop.get(source.shopId) ?? 1;
          const rule = shopRuleByShopSku.get(`${source.shopId}\0${targetSku}`);
          const sourceGrowth = rule?.growthPercent ?? siteRule?.growthPercent ?? growthPercent;
          baseDaily += source.row.units / denominator;
          adjustedDaily += (source.row.units * (1 + sourceGrowth / 100)) / denominator;
        }
        const blendedGrowth = baseDaily > 0 ? ((adjustedDaily / baseDaily) - 1) * 100 : growthPercent;
        baseDailyByTarget.set(targetSku, baseDaily);
        blendedGrowthByTarget.set(targetSku, blendedGrowth);
        hasExplicitGrowthByTarget.set(targetSku, explicitGrowths.size > 0);

        const leadTime = leadCandidates.length > 0 ? Math.max(...leadCandidates) : undefined;
        const safetyDaysValue = safetyCandidates.length > 0 ? Math.max(...safetyCandidates) : undefined;
        mergedLeadByTarget.set(targetSku, leadTime);
        mergedSafetyByTarget.set(targetSku, safetyDaysValue);
        hasRuleByTarget.set(targetSku, leadCandidates.length > 0 || safetyCandidates.length > 0 || explicitGrowths.size > 0);
        const conflictWarnings: string[] = [];
        const distinctLeads = Array.from(new Set(leadCandidates));
        const distinctSafeties = Array.from(new Set(safetyCandidates));
        if (distinctLeads.length > 1) {
          conflictWarnings.push(`多店铺补货时效规则不一致（${distinctLeads.join('/')} 天），已按最大值计算`);
        }
        if (distinctSafeties.length > 1) {
          conflictWarnings.push(`多店铺安全库存规则不一致（${distinctSafeties.join('/')} 天），已按最大值计算`);
        }
        if (conflictWarnings.length > 0) ruleConflictWarningsByTarget.set(targetSku, conflictWarnings);
      }

      const importedInventoryItems: RestockInventoryInput[] = [];
      const importedProducts: RestockProductInput[] = [];
      const sourceIndexByTarget = new Map<string, ResolvedTarget['sources']>();
      const qualityIndexByTarget = new Map<string, QualitySource[]>();
      for (const entry of eligibleTargets) {
        const dailySales = baseDailyByTarget.get(entry.targetSku) ?? 0;
        const archiveInventory = inventoryBySku.get(entry.targetSku);
        const archiveProduct = productBySku.get(entry.targetSku);
        if (archiveInventory) {
          importedInventoryItems.push({ ...archiveInventory, dailySales });
        } else {
          // 元仓同码直连（无本地档案）：合成库存输入参与计算；成本未知
          importedInventoryItems.push({
            id: `yc:${entry.targetSku}`,
            name: archiveProduct?.name ?? entry.targetSku,
            sku: entry.targetSku,
            currentStock: 0,
            stockOfficial: 0,
            stockThirdParty: 0,
            inTransit: 0,
            dailySales,
            leadTime: 25,
            replenishCycle: 30,
            costPerUnit: Number.NaN,
          });
        }
        importedProducts.push({
          id: archiveProduct?.id || archiveInventory?.id || `yc:${entry.targetSku}`,
          name: archiveProduct?.name || archiveInventory?.name || entry.targetSku,
          sku: entry.targetSku,
          country: site,
          sites: Array.from(new Set([...(archiveProduct?.sites || []), site])),
          cost: archiveProduct ? archiveProduct.cost : null,
          siteData: archiveProduct?.siteData,
        });
        sourceIndexByTarget.set(entry.targetSku, entry.sources);
        qualityIndexByTarget.set(entry.targetSku, entry.sources.map(source => ({
          shopId: source.shopId,
          units: source.row.units,
          observedDays: source.row.observedDays,
          shopObservedDays: shopObservedDaysByShop.get(source.shopId) ?? 0,
          latestObservedDate: source.row.latestObservedDate,
        })));
      }

      // ---- 仓库范围：库存池 > 显式仓库 > 站点默认（提示） ----
      const integrationWarnings: string[] = [...(ycProductsResult.warning ? [ycProductsResult.warning] : [])];
      let poolName: string | null = null;
      let warehouseCodes: string[];
      let warehouseScopeSource: 'pool' | 'explicit' | 'site-default';
      if (poolId) {
        const pool = await prisma.restockStockPool.findFirst({ where: { id: poolId, userId } });
        if (!pool) return res.status(404).json({ error: 'Stock pool not found' });
        if (normalizeSite(pool.site) !== site) {
          return res.status(400).json({ error: 'Stock pool site does not match the shops' });
        }
        poolName = pool.name;
        warehouseCodes = pool.warehouseCodes.filter(Boolean);
        warehouseScopeSource = 'pool';
        if (warehouseCodes.length === 0) {
          return res.status(400).json({ error: 'Stock pool has no warehouse codes' });
        }
      } else if (explicitWarehouseCodes && explicitWarehouseCodes.length > 0) {
        warehouseCodes = explicitWarehouseCodes;
        warehouseScopeSource = 'explicit';
      } else {
        const warehouseResolution = await resolveWarehouseCodesForSite(activeYcClient, site);
        warehouseCodes = warehouseResolution.warehouseCodes;
        warehouseScopeSource = 'site-default';
        integrationWarnings.push('未指定库存池：本次扣减的是站点全部仓库的库存与在途，请确认范围后使用');
        integrationWarnings.push(...warehouseResolution.warnings);
      }
      if (warehouseCodes.length === 0) {
        return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
      }

      // ---- 源条件版本（凭据范围/仓库范围/全量目标 SKU/映射与规则内容；不含计算参数） ----
      const forceRefresh = req.body?.forceRefresh === true;
      const mappingRevision = `${shopMappings.length}:${siteMappings.length}:${
        Math.max(0, ...shopMappings.map(m => m.updatedAt?.getTime?.() ?? 0), ...siteMappings.map(m => m.updatedAt?.getTime?.() ?? 0))
      }`;
      const ruleRevision = `${savedShopRules.length}:${savedSiteRules.length}:${
        Math.max(0, ...savedShopRules.map(r => r.updatedAt?.getTime?.() ?? 0), ...savedSiteRules.map(r => r.updatedAt?.getTime?.() ?? 0))
      }`;
      // WarehouseMapping 内容哈希：同数量但别名内容变化时也必须使缓存失效
      const warehouseMappingContent = warehouseMappings
        .map(mapping => `${normalizeRestockSku(mapping.sku)}>${normalizeRestockSku(mapping.thirdPartyWarehouseId)}:${mapping.type ?? ''}`)
        .sort()
        .join('|');
      // ---- 元仓库存与在途（每个目标只扣一次；同源条件短缓存复用） ----
      const skus = importedInventoryItems.map((item) => item.sku);
      const ycSkuAliases = buildYcSkuAliasMap(warehouseMappings, skus);
      const querySkus = Array.from(
        new Set([...skus, ...Array.from(ycSkuAliases.keys())]),
      ).filter((sku) => sku.length <= YC_STOCK_SKU_MAX_LENGTH).sort();
      const sourceFingerprint = createHash('sha256').update(JSON.stringify({
        cacheScope: activeYcClient.cacheScope ?? 'default',
        shopIds: [...shopIds].sort(),
        from: range!.from,
        to: range!.to,
        poolId,
        warehouseCodes: [...warehouseCodes].sort(),
        warehouseMappingContent,
        mappingRevision,
        ruleRevision,
        querySkus,
      })).digest('hex').slice(0, 32);

      let stockRows: RemoteStockRow[];
      let inboundOrders: RemoteInboundOrder[];
      let stockFetchedAt: string;
      let sourceSnapshotId: string;
      let reusedSourceData: boolean;
      const cachedSource = forceRefresh ? undefined : restockSourceCache.get(userId);
      if (
        cachedSource
        && cachedSource.sourceFingerprint === sourceFingerprint
        && Date.now() - cachedSource.at < RESTOCK_SOURCE_CACHE_TTL_MS
      ) {
        stockRows = cachedSource.stockRows;
        inboundOrders = cachedSource.inboundOrders;
        stockFetchedAt = cachedSource.fetchedAt;
        sourceSnapshotId = cachedSource.sourceSnapshotId;
        reusedSourceData = true;
      } else {
        const fetchStartedAt = new Date();
        const remoteRows = querySkus.length > 0
          ? await fetchRemoteRows(activeYcClient, warehouseCodes, querySkus)
          : { stockRows: [], inboundOrders: [], failures: [] };
        if (remoteRows.failures.length > 0 || !remoteRows.stockRows || !remoteRows.inboundOrders) {
          for (const failure of remoteRows.failures) {
            logSafeFailure(`YC ${failure.source} lookup failed`, failure.error);
          }
          return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
        }
        stockRows = withMappedCustomerSku(remoteRows.stockRows, ycSkuAliases);
        inboundOrders = withMappedInboundCustomerSku(remoteRows.inboundOrders, ycSkuAliases);
        // 真实来源时间 = 拉取开始时刻（不是响应组装时间）
        stockFetchedAt = fetchStartedAt.toISOString();
        reusedSourceData = false;
        // 数据版本：同条件重新拉到不同数据（行集变化）→ 不同快照 ID
        sourceSnapshotId = createHash('sha256').update(JSON.stringify({
          sourceFingerprint,
          fetchedAt: stockFetchedAt,
          stockRows: stockRows.length,
          inboundOrders: inboundOrders.length,
          availableSum: stockRows.reduce((sum, row) => sum + (Number(row.available) || 0), 0),
        })).digest('hex').slice(0, 32);
        restockSourceCache.set(userId, {
          sourceFingerprint,
          at: Date.now(),
          fetchedAt: stockFetchedAt,
          sourceSnapshotId,
          stockRows,
          inboundOrders,
        });
        // 容量上限：淘汰最旧条目，避免进程内无限积累
        while (restockSourceCache.size > RESTOCK_SOURCE_CACHE_MAX_ENTRIES) {
          const oldestKey = restockSourceCache.keys().next().value;
          if (oldestKey === undefined) break;
          restockSourceCache.delete(oldestKey);
        }
      }
      if (forceRefresh) {
        // 刷新源数据：货品身份（元仓清单）缓存一并失效
        ycProductsCache.delete(userId);
      }

      // ---- 规则合并（per-target：店铺规则按来源混合 growth；lead/safety 冲突取最大） ----
      const skuRules: RestockSkuRule[] = [];
      for (const entry of eligibleTargets) {
        const targetSku = entry.targetSku;
        const hasRule = hasRuleByTarget.get(targetSku) ?? false;
        const hasExplicitGrowth = hasExplicitGrowthByTarget.get(targetSku) ?? false;
        const blended = blendedGrowthByTarget.get(targetSku) ?? growthPercent;
        if (!hasRule) continue;
        skuRules.push({
          sku: targetSku,
          leadTimeDays: mergedLeadByTarget.get(targetSku),
          safetyDays: mergedSafetyByTarget.get(targetSku),
          growthPercent: hasExplicitGrowth ? blended : undefined,
        });
      }

      // 真实零销量：有观测但区间件数合计为 0（区别于无销量数据）
      const zeroSalesSkus = eligibleTargets
        .filter(entry => {
          const totalUnits = entry.sources.reduce((sum, source) => sum + source.row.units, 0);
          const observedDays = entry.sources.reduce((sum, source) => sum + source.row.observedDays, 0);
          return totalUnits === 0 && observedDays > 0;
        })
        .map(entry => entry.targetSku);

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
          zeroSalesSkus,
          policies: RESTOCK_V3_POLICIES,
        });
      } catch (error) {
        logSafeFailure('Restock V3 plan rejected', error);
        if (error instanceof RestockPlanValidationError) {
          // 逐项参数错误：消息含字段名、SKU 与允许边界
          return res.status(400).json({ error: error.message });
        }
        if (error instanceof RestockSourceDataError) {
          return res.status(503).json({ error: 'Restock data is temporarily unavailable' });
        }
        return res.status(500).json({ error: 'Failed to build restock recommendations' });
      }

      // ---- 附加来源、质量与可执行状态 ----
      const items: Array<RestockPlanItem & {
        matchType: string;
        executable: boolean;
        salesSources: Array<Record<string, unknown>>;
        salesQuality: SalesQuality;
      }> = plan.items.map((item) => {
        const targetSku = normalizeRestockSku(item.sku);
        const sources = sourceIndexByTarget.get(targetSku) ?? [];
        const targetEntry = eligibleTargets.find(entry => entry.targetSku === targetSku);
        const quality = computeSalesQuality(qualityIndexByTarget.get(targetSku) ?? [], planningDate);
        const warnings = [...item.warnings];
        if (targetEntry?.normalizedCollision) {
          warnings.push('该货号存在归一化碰撞（大小写/空格变体合并），请核对编码是否确属同一货品');
        }
        for (const warning of ruleConflictWarningsByTarget.get(targetSku) ?? []) {
          warnings.push(warning);
        }
        // 最终可执行 = 库存/销量维度（planner）∧ 数据质量维度（最差来源）
        const executable = item.executable && quality.executable;
        return {
          ...item,
          warnings,
          executable,
          matchType: targetEntry?.matchType ?? 'exact-yc',
          salesSources: sources.map(source => {
            const rule = shopRuleByShopSku.get(`${source.shopId}\0${targetSku}`);
            return {
              shopId: source.shopId,
              shopName: source.shopName,
              externalSku: source.row.externalSku,
              identityKey: source.row.identityKey,
              displaySku: source.row.displaySku,
              skuSource: source.row.skuSource,
              level: source.row.level,
              itemId: source.row.itemId,
              itemName: source.row.itemName,
              variationName: source.row.variationName,
              units: source.row.units,
              observedDays: source.row.observedDays,
              latestObservedDate: source.row.latestObservedDate,
              salesStatus: source.row.salesStatus,
              denominator: denominatorByShop.get(source.shopId) ?? null,
              growthPercent: rule?.growthPercent ?? siteRuleBySku.get(targetSku)?.growthPercent ?? growthPercent,
            };
          }),
          salesQuality: quality,
        };
      });

      const singleShop = shopIds.length === 1 ? shops[0] : null;
      const calendarDays = Math.round((parseDateUtc(range!.to).getTime() - parseDateUtc(range!.from).getTime()) / 86_400_000) + 1;
      const nowIso = new Date().toISOString();
      // 完整条件指纹 = 源条件指纹 + 计算参数（参数变化 → 指纹变化 → 旧结果过期）
      const fingerprint = createHash('sha256').update(JSON.stringify({
        v: ALGORITHM_VERSION,
        sourceFingerprint,
        planningDate,
        targetDate,
        leadTimeDays,
        safetyDays,
        growthPercent,
        statisticsDays: statisticsDaysOverride,
      })).digest('hex').slice(0, 32);

      const zeroSalesCount = items.filter(item => item.salesQuality.status === 'zero').length;
      const nonExecutableCount = items.filter(item => !item.executable).length;
      const response = {
        ...plan,
        summary: {
          ...plan.summary,
          zeroSalesCount,
          reviewCount: review.length,
          nonExecutableCount,
        },
        items,
        metadata: {
          shopIds: shops.map(shop => ({ id: shop.id, name: shop.name, site: shop.site })),
          from: range!.from,
          to: range!.to,
          calendarDays,
          shopObservedDays: singleShop ? (shopObservedDaysByShop.get(singleShop.id) ?? 0) : null,
          observedDaysByShop: Array.from(perShop.map(entry =>
            ({ shopId: entry.shopId, observedDays: entry.aggregate.shopObservedDays }))),
          statisticsDays: singleShop ? (statisticsDaysOverride ?? denominatorByShop.get(singleShop.id) ?? null) : null,
          statisticsDaysOverridden: statisticsDaysOverride !== null,
          denominator: singleShop ? (denominatorByShop.get(singleShop.id) ?? null) : null,
          denominatorByShop: Array.from(denominatorByShop.entries()).map(([shopId, days]) => ({ shopId, days })),
          salesMetric: 'unitsOrdered',
          salesMetricLabel: '已下订单件数',
          noSkuVariationCount: perShop.reduce((sum, entry) => sum + entry.aggregate.noSkuVariationCount, 0),
          noSkuVariationUnits: perShop.reduce((sum, entry) => sum + entry.aggregate.noSkuVariationUnits, 0),
          collisionKeys: Array.from(new Set(perShop.flatMap(entry => entry.aggregate.collisionKeys))),
          excludedOversizedSkus,
          poolId,
          poolName,
          warehouseCodes,
          warehouseScopeSource,
        },
        review: review
          .sort((left, right) => right.units - left.units)
          .slice(0, 500),
        snapshot: {
          fingerprint,
          sourceFingerprint,
          sourceSnapshotId,
          salesFetchedAt: nowIso,
          stockFetchedAt,
          ycProductFetchedAt: ycProductsResult.entry?.fetchedAt ?? null,
          mappingRevision,
          ruleRevision,
          algorithmVersion: ALGORITHM_VERSION,
        },
        integration: {
          ycConfigured: true,
          remoteFetched: true,
          reusedSourceData,
          stockSource: stockRows.length > 0 ? ('yc' as const) : ('missing' as const),
          warehouseCodes,
          warnings: integrationWarnings,
        },
      };

      // ---- 服务端结果暂存：resultId 与用户/条件/源数据绑定（保存计划时据此重建不可变快照） ----
      const RESULT_TTL_MS = 2 * 60 * 60_000;
      let resultId: string | null = null;
      try {
        const stored = await prisma.restockComputeResult.create({
          data: {
            userId,
            fingerprint,
            sourceSnapshotId,
            payload: response as unknown as object,
            expiresAt: new Date(Date.now() + RESULT_TTL_MS),
          },
          select: { id: true },
        });
        resultId = stored.id;
        // 概率性清理过期结果（避免专用定时任务）
        if (Math.random() < 0.05) {
          await prisma.restockComputeResult.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        }
      } catch (storeError) {
        logSafeFailure('Restock V3 result store failed', storeError);
      }

      return res.json({ ...response, resultId });
    } catch (error) {
      logSafeFailure('Restock V3 recommendation request failed', error);
      return res.status(500).json({ error: 'Failed to build restock recommendations' });
    }
  });

  // ---- 计划快照（2026-09 第二轮：服务端权威快照，客户端只提交结果 ID 与人工决定） ----
  //
  // 数据流：recommendations 计算后完整结果暂存 RestockComputeResult（resultId，2 小时有效）。
  // 保存计划时客户端只提交 resultId + 所选 SKU + 确认量/调整原因 + 名称 + 幂等键；
  // 服务端校验归属/有效期/可执行/原因规则后，从结果重建完整不可变快照（含销量来源、
  // 逐仓库存、在途明细、质量、计算中间值、匹配依据、规则来源），摘要只按保存项重算，
  // 建议金额与确认金额分列。客户端提交的任何计算依据均不被采信。

  /** 服务端快照逐项结构：全部字段来自 RestockComputeResult，客户端只能改 confirmedQty / adjustReason */
  interface PlanSnapshotItem {
    sku: string;
    name: string;
    suggestedQty: number;
    confirmedQty: number;
    adjustReason: string | null;
    // 计算依据快照（保存时从结果复制，不可被客户端修改）
    dailySales: number;
    adjustedDailySales: number;
    availableStock: number;
    inTransit: number;
    stockByWarehouse: Array<Record<string, unknown>>;
    inboundBreakdown: Array<Record<string, unknown>>;
    stockoutDate: string | null;
    baselineStockoutDate: string | null;
    gapBeforeArrival: number;
    gapAfterArrival: number;
    /** 不补货基线轨迹的期末安全缺口（建议量等式第二项；simulation 模式） */
    baselineEndSafetyGap: number;
    /** 采用建议量后剩余安全缺口（正常为 0；simulation 模式） */
    endSafetyGap: number;
    /** 建议量等式原始和（向上取整前；formula 模式为 null） */
    suggestedQtyRaw: number | null;
    arrivalDate: string;
    targetDate: string;
    leadTimeDays: number;
    safetyDays: number;
    growthPercent: number;
    coverageDays: number;
    transportDemand: number;
    arrivalStock: number;
    coverageDemand: number;
    safetyStockDemand: number;
    matchType: string;
    executable: boolean;
    status: string;
    costUnknown: boolean;
    estimatedCost: number | null;
    warnings: string[];
    salesSources: Array<Record<string, unknown>>;
    salesQuality: Record<string, unknown>;
    ruleSources: Record<string, unknown>;
  }

  interface StoredResultItem {
    sku?: unknown;
    name?: unknown;
    suggestedQty?: unknown;
    confirmedQty?: unknown;
    status?: unknown;
    executable?: unknown;
    dailySales?: unknown;
    adjustedDailySales?: unknown;
    availableStock?: unknown;
    inTransit?: unknown;
    stockByWarehouse?: unknown;
    inboundBreakdown?: unknown;
    stockoutDate?: unknown;
    baselineStockoutDate?: unknown;
    gapBeforeArrival?: unknown;
    gapAfterArrival?: unknown;
    baselineEndSafetyGap?: unknown;
    endSafetyGap?: unknown;
    suggestedQtyRaw?: unknown;
    arrivalDate?: unknown;
    targetDate?: unknown;
    leadTimeDays?: unknown;
    safetyDays?: unknown;
    growthPercent?: unknown;
    coverageDays?: unknown;
    transportDemand?: unknown;
    arrivalStock?: unknown;
    coverageDemand?: unknown;
    safetyStockDemand?: unknown;
    matchType?: unknown;
    costUnknown?: unknown;
    estimatedCost?: unknown;
    warnings?: unknown;
    salesSources?: unknown;
    salesQuality?: unknown;
    ruleSources?: unknown;
  }

  /** 严格非负整数（拒绝 1.5、1e3、字符串数字等），上限 10 亿 */
  const parseStrictQuantity = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000_000) return null;
    return value;
  };

  const parseAdjustReason = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return undefined as unknown as string | null;
    return value.trim().slice(0, 500);
  };

  /** 确认量与建议量不一致时必须携带非空调整原因（保存/编辑/确认共用规则） */
  const adjustReasonMissing = (confirmedQty: number, suggestedQty: number, adjustReason: string | null | undefined) =>
    confirmedQty !== suggestedQty && !(typeof adjustReason === 'string' && adjustReason.trim());

  /**
   * 已存储计划条目的可执行校验（确认/编辑共用；保存走 resolveSnapshotItems 的同规则）。
   * 不信任任何客户端提交的 executable / 质量状态——只读服务端快照里的值。
   */
  const validateStoredItemsForExecution = (items: unknown): string | null => {
    if (!Array.isArray(items) || items.length === 0) {
      return '计划不包含任何条目，无法确认执行。请重新计算并保存计划。';
    }
    const snapshotItems = items as Array<Record<string, unknown>>;
    if (!('dailySales' in snapshotItems[0])) {
      return '该计划为历史版本草稿（缺少完整计算依据快照），无法确认执行。请重新计算并保存新计划后再确认。';
    }
    for (const item of snapshotItems) {
      const sku = String(item.sku ?? '');
      if (item.executable !== true) {
        return `以下商品不可执行（库存未知/无有效销量/数据质量不足），不能确认为可执行计划：${sku}。请重新计算，或另存不含该商品的计划。`;
      }
      const confirmedQty = item.confirmedQty;
      if (typeof confirmedQty !== 'number' || !Number.isInteger(confirmedQty) || confirmedQty < 0 || confirmedQty > 1_000_000_000) {
        return `确认补货量必须是非负整数：${sku}`;
      }
      const suggestedQty = item.suggestedQty;
      if (typeof suggestedQty !== 'number' || !Number.isInteger(suggestedQty) || suggestedQty < 0 || suggestedQty > 1_000_000_000) {
        return `计划数据异常（建议补货量非法）：${sku}。请重新计算并保存计划。`;
      }
      if (adjustReasonMissing(confirmedQty, suggestedQty, item.adjustReason as string | null | undefined)) {
        return `确认补货量与系统建议量不一致时必须填写调整原因：${sku}`;
      }
    }
    return null;
  };

  /** 从结果项构建快照项（数量/原因来自人工，其余全部服务端权威） */
  const buildSnapshotItem = (resultItem: StoredResultItem, confirmedQty: number, adjustReason: string | null): PlanSnapshotItem => ({
    sku: String(resultItem.sku ?? ''),
    name: String(resultItem.name ?? resultItem.sku ?? ''),
    suggestedQty: Number(resultItem.suggestedQty ?? 0),
    confirmedQty,
    adjustReason,
    dailySales: Number(resultItem.dailySales ?? 0),
    adjustedDailySales: Number(resultItem.adjustedDailySales ?? 0),
    availableStock: Number(resultItem.availableStock ?? 0),
    inTransit: Number(resultItem.inTransit ?? 0),
    stockByWarehouse: Array.isArray(resultItem.stockByWarehouse) ? resultItem.stockByWarehouse as Array<Record<string, unknown>> : [],
    inboundBreakdown: Array.isArray(resultItem.inboundBreakdown) ? resultItem.inboundBreakdown as Array<Record<string, unknown>> : [],
    stockoutDate: (resultItem.stockoutDate ?? null) as string | null,
    baselineStockoutDate: (resultItem.baselineStockoutDate ?? null) as string | null,
    gapBeforeArrival: Number(resultItem.gapBeforeArrival ?? 0),
    gapAfterArrival: Number(resultItem.gapAfterArrival ?? 0),
    baselineEndSafetyGap: Number(resultItem.baselineEndSafetyGap ?? 0),
    endSafetyGap: Number(resultItem.endSafetyGap ?? 0),
    suggestedQtyRaw: typeof resultItem.suggestedQtyRaw === 'number' && Number.isFinite(resultItem.suggestedQtyRaw)
      ? resultItem.suggestedQtyRaw
      : null,
    arrivalDate: String(resultItem.arrivalDate ?? ''),
    targetDate: String(resultItem.targetDate ?? ''),
    leadTimeDays: Number(resultItem.leadTimeDays ?? 0),
    safetyDays: Number(resultItem.safetyDays ?? 0),
    growthPercent: Number(resultItem.growthPercent ?? 0),
    coverageDays: Number(resultItem.coverageDays ?? 0),
    transportDemand: Number(resultItem.transportDemand ?? 0),
    arrivalStock: Number(resultItem.arrivalStock ?? 0),
    coverageDemand: Number(resultItem.coverageDemand ?? 0),
    safetyStockDemand: Number(resultItem.safetyStockDemand ?? 0),
    matchType: String(resultItem.matchType ?? ''),
    executable: resultItem.executable === true,
    status: String(resultItem.status ?? ''),
    costUnknown: resultItem.costUnknown === true,
    estimatedCost: (resultItem.estimatedCost ?? null) as number | null,
    warnings: Array.isArray(resultItem.warnings) ? resultItem.warnings.map(String) : [],
    salesSources: Array.isArray(resultItem.salesSources) ? resultItem.salesSources as Array<Record<string, unknown>> : [],
    salesQuality: (resultItem.salesQuality ?? {}) as Record<string, unknown>,
    ruleSources: (resultItem.ruleSources ?? {}) as Record<string, unknown>,
  });

  /** 摘要只针对实际保存的项目重算；建议金额与确认金额分列（成本未知计入 unknownCostSkus） */
  const buildPlanSummary = (items: PlanSnapshotItem[]) => {
    let totalSuggestedQty = 0;
    let totalConfirmedQty = 0;
    let suggestedAmount = 0;
    let confirmedAmount = 0;
    let unknownCostSkus = 0;
    for (const item of items) {
      totalSuggestedQty += item.suggestedQty;
      totalConfirmedQty += item.confirmedQty;
      if (item.costUnknown || item.estimatedCost === null) {
        unknownCostSkus += 1;
      } else {
        const unitCost = item.suggestedQty > 0 ? item.estimatedCost / item.suggestedQty : 0;
        suggestedAmount += item.estimatedCost ?? 0;
        confirmedAmount += item.confirmedQty * unitCost;
      }
    }
    return {
      savedItemCount: items.length,
      totalSuggestedQty,
      totalConfirmedQty,
      suggestedAmount,
      confirmedAmount,
      unknownCostSkus,
      executableCount: items.filter(item => item.executable).length,
    };
  };

  const RESULT_SELECT = {
    id: true, userId: true, fingerprint: true, sourceSnapshotId: true, payload: true, createdAt: true, expiresAt: true,
  };

  const loadActiveResult = async (userId: string, resultId: unknown) => {
    if (typeof resultId !== 'string' || !resultId.trim() || resultId.length > 100) return null;
    const stored = await prisma.restockComputeResult.findFirst({
      where: { id: resultId.trim(), userId, expiresAt: { gt: new Date() } },
      select: RESULT_SELECT,
    });
    return stored;
  };

  /** 校验并规范化保存请求的项目列表（相对结果快照） */
  const resolveSnapshotItems = (
    resultItems: StoredResultItem[],
    rawRequested: unknown,
  ): { items?: PlanSnapshotItem[]; error?: string } => {
    if (!Array.isArray(rawRequested) || rawRequested.length === 0 || rawRequested.length > MAX_PLAN_ITEMS) {
      return { error: 'items 必须是非空数组' };
    }
    const bySku = new Map<string, StoredResultItem>();
    for (const item of resultItems) {
      const sku = normalizeRestockSku(typeof item.sku === 'string' ? item.sku : '');
      if (sku) bySku.set(sku, item);
    }
    const seen = new Set<string>();
    const resolved: PlanSnapshotItem[] = [];
    for (const entry of rawRequested) {
      if (!entry || typeof entry !== 'object') return { error: 'items 含非法条目' };
      const record = entry as Record<string, unknown>;
      const sku = normalizeRestockSku(typeof record.sku === 'string' ? record.sku : '');
      if (!sku || sku.length > 200) return { error: 'items 含非法 SKU' };
      if (seen.has(sku)) return { error: `SKU 重复：${sku}` };
      seen.add(sku);
      const resultItem = bySku.get(sku);
      if (!resultItem) return { error: `SKU 不在本次计算结果中：${sku}` };
      const suggestedQty = parseStrictQuantity(resultItem.suggestedQty);
      if (suggestedQty === null) return { error: `结果数据异常：${sku}` };
      let confirmedQty = suggestedQty;
      if (record.confirmedQty !== undefined && record.confirmedQty !== null) {
        const parsed = parseStrictQuantity(record.confirmedQty);
        if (parsed === null) {
          return { error: `确认补货量必须是非负整数：${sku}` };
        }
        confirmedQty = parsed;
      }
      const adjustReason = parseAdjustReason(record.adjustReason);
      if (adjustReason === (undefined as unknown as string | null)) {
        return { error: `调整原因必须是字符串：${sku}` };
      }
      if (resultItem.executable !== true) {
        return { error: `以下商品当前不可执行（库存未知/无有效销量/数据质量不足），不能保存为可执行计划：${sku}` };
      }
      if (adjustReasonMissing(confirmedQty, suggestedQty, adjustReason)) {
        return { error: `确认补货量与系统建议量不一致时必须填写调整原因：${sku}` };
      }
      resolved.push(buildSnapshotItem(resultItem, confirmedQty, adjustReason && adjustReason.trim() ? adjustReason.trim() : null));
    }
    return { items: resolved };
  };

  const isLegacySnapshot = (items: PlanSnapshotItem[] | Array<Record<string, unknown>>) =>
    items.length > 0 && !('dailySales' in items[0]);

  router.get('/plans', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' && ['draft', 'confirmed', 'void'].includes(req.query.status)
        ? req.query.status
        : undefined;
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
      const where = {
        userId: req.user!.id,
        ...(status ? { status } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      };
      const [total, plans] = await Promise.all([
        prisma.restockPlanSnapshot.count({ where }),
        prisma.restockPlanSnapshot.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, name: true, status: true, site: true, shopIds: true, poolId: true,
            warehouseCodes: true, rangeFrom: true, rangeTo: true, summary: true, supersedesId: true,
            version: true, revision: true, resultId: true,
            createdAt: true, confirmedAt: true, voidedAt: true, voidReason: true,
          },
        }),
      ]);
      return res.json({ plans, total, page, pageSize });
    } catch (error) {
      logSafeFailure('Restock V3 plan list failed', error);
      return res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  router.get('/plans/:id', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const plan = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId: req.user!.id },
      });
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const legacy = isLegacySnapshot((plan.items ?? []) as Array<Record<string, unknown>>);
      return res.json({ plan, legacy });
    } catch (error) {
      logSafeFailure('Restock V3 plan lookup failed', error);
      return res.status(500).json({ error: 'Failed to fetch plan' });
    }
  });

  router.post('/plans', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const idempotencyKey = typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
        ? req.body.idempotencyKey.trim().slice(0, 100)
        : null;
      // 幂等：同 key 重复提交（双击/重试）返回首次结果
      if (idempotencyKey) {
        const existing = await prisma.restockPlanSnapshot.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (existing) {
          return res.json({ plan: existing, duplicate: true });
        }
      }

      const stored = await loadActiveResult(userId, req.body?.resultId);
      if (!stored) {
        return res.status(410).json({ error: '计算结果已过期或不存在，请重新计算后再保存计划' });
      }
      const payload = (stored.payload ?? {}) as Record<string, unknown>;
      const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
      const snapshot = (payload.snapshot ?? {}) as Record<string, unknown>;
      const resultItems = Array.isArray(payload.items) ? payload.items as StoredResultItem[] : [];
      const name = typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
        : `补货计划 ${metadata.from ?? ''}~${metadata.to ?? ''}`;
      const resolvedItems = resolveSnapshotItems(resultItems, req.body?.items);
      if (resolvedItems.error || !resolvedItems.items) {
        return res.status(400).json({ error: resolvedItems.error ?? 'Invalid plan items' });
      }
      const items = resolvedItems.items;

      // 仓库范围确认：整站默认只能作为预览保存草稿，摘要中标注未确认
      const warehouseScopeSource = String(metadata.warehouseScopeSource ?? 'site-default');
      const scopeConfirmed = warehouseScopeSource === 'pool' || warehouseScopeSource === 'explicit';

      // 版本链：body.sourcePlanId 指向被复制的旧计划（必须属于当前用户）
      let supersedesId: string | null = null;
      let version = 1;
      if (typeof req.body?.sourcePlanId === 'string' && req.body.sourcePlanId.trim()) {
        const sourcePlan = await prisma.restockPlanSnapshot.findFirst({
          where: { id: req.body.sourcePlanId.trim(), userId },
          select: { id: true, version: true },
        });
        if (!sourcePlan) return res.status(404).json({ error: 'Source plan not found' });
        supersedesId = sourcePlan.id;
        version = sourcePlan.version + 1;
      }

      const plan = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_plan_save', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.create({
        data: {
          userId,
          name,
          status: 'draft',
          site: String(metadata.shopIds && Array.isArray(metadata.shopIds) && (metadata.shopIds as Array<Record<string, unknown>>)[0]?.site
            ? (metadata.shopIds as Array<Record<string, unknown>>)[0].site
            : payload.site ?? ''),
          shopIds: Array.isArray(metadata.shopIds)
            ? (metadata.shopIds as Array<Record<string, unknown>>).map(shop => String(shop.id ?? '')).filter(Boolean).slice(0, MAX_SHOPS_PER_PLAN)
            : [],
          poolId: (metadata.poolId ?? null) as string | null,
          warehouseCodes: Array.isArray(metadata.warehouseCodes)
            ? (metadata.warehouseCodes as unknown[]).map(String).slice(0, MAX_WAREHOUSE_CODES_PER_POOL)
            : [],
          rangeFrom: String(metadata.from ?? ''),
          rangeTo: String(metadata.to ?? ''),
          salesMetric: String(metadata.salesMetric ?? 'unitsOrdered'),
          parameters: {
            planningDate: metadata.planningDate ?? null,
            targetDate: metadata.targetDate ?? null,
            statisticsDays: metadata.statisticsDays ?? null,
            statisticsDaysOverridden: metadata.statisticsDaysOverridden ?? false,
            salesMetricLabel: metadata.salesMetricLabel ?? null,
            warehouseScopeSource,
            scopeConfirmed,
          },
          items: items as unknown as object,
          summary: { ...buildPlanSummary(items), scopeConfirmed },
          snapshotMeta: {
            ...snapshot,
            resultId: stored.id,
            savedAt: new Date().toISOString(),
          },
          supersedesId,
          version,
          resultId: stored.id,
          idempotencyKey,
        },
      }));
      return res.status(201).json({ plan });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // 并发下幂等键冲突：返回已存在记录
        const existing = await prisma.restockPlanSnapshot.findUnique({
          where: { userId_idempotencyKey: { userId: req.user!.id, idempotencyKey: String(req.body?.idempotencyKey).trim().slice(0, 100) } },
        });
        if (existing) return res.json({ plan: existing, duplicate: true });
      }
      logSafeFailure('Restock V3 plan save failed', error);
      return res.status(500).json({ error: 'Failed to save plan' });
    }
  });

  router.put('/plans/:id', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const existing = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId },
      });
      if (!existing) return res.status(404).json({ error: 'Plan not found' });
      if (existing.status !== 'draft') {
        return res.status(409).json({ error: 'Only draft plans can be edited; confirmed plans must be copied to a new version' });
      }
      // 乐观并发：revision 不匹配说明草稿已被并发确认/修改
      const revision = parseStrictQuantity(req.body?.revision);
      if (revision === null || revision !== existing.revision) {
        return res.status(409).json({ error: `计划已被其他操作更新（当前版本 ${existing.revision}），请刷新后重试` });
      }
      const currentItems = ((existing.items ?? []) as unknown as PlanSnapshotItem[]);
      if (currentItems.length === 0 || !('dailySales' in currentItems[0])) {
        return res.status(409).json({ error: '历史版本草稿不支持编辑（缺少完整快照），请重新计算并保存新计划' });
      }
      const bySku = new Map(currentItems.map(item => [item.sku, item]));
      const rawEdits = req.body?.edits;
      if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
        return res.status(400).json({ error: 'edits 必须是非空数组' });
      }
      const nextItems = currentItems.map(item => ({ ...item }));
      const nextBySku = new Map(nextItems.map(item => [item.sku, item]));
      for (const entry of rawEdits) {
        if (!entry || typeof entry !== 'object') return res.status(400).json({ error: 'edits 含非法条目' });
        const record = entry as Record<string, unknown>;
        const sku = normalizeRestockSku(typeof record.sku === 'string' ? record.sku : '');
        const target = nextBySku.get(sku);
        if (!target) return res.status(400).json({ error: `SKU 不在该计划中：${sku}` });
        if (record.confirmedQty !== undefined) {
          const parsed = parseStrictQuantity(record.confirmedQty);
          if (parsed === null) return res.status(400).json({ error: `确认补货量必须是非负整数：${sku}` });
          target.confirmedQty = parsed;
        }
        if (record.adjustReason !== undefined) {
          const reason = parseAdjustReason(record.adjustReason);
          if (reason === (undefined as unknown as string | null)) return res.status(400).json({ error: `调整原因必须是字符串：${sku}` });
          target.adjustReason = reason && reason.trim() ? reason.trim() : null;
        }
      }
      // 编辑后的完整条目走与保存/确认同一套可执行校验（数量/原因/可执行/快照完整性）
      const validationError = validateStoredItemsForExecution(nextItems);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      const name = typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
        : existing.name;
      const plan = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_plan_update', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.updateMany({
        where: { id: existing.id, userId, status: 'draft', revision: existing.revision },
        data: {
          name,
          items: nextItems as unknown as object,
          summary: { ...buildPlanSummary(nextItems), scopeConfirmed: ((existing.summary ?? {}) as Record<string, unknown>).scopeConfirmed ?? false },
          revision: existing.revision + 1,
        },
      }));
      if (plan.count === 0) {
        return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重试' });
      }
      const updated = await prisma.restockPlanSnapshot.findFirst({ where: { id: existing.id, userId } });
      return res.json({ plan: updated });
    } catch (error) {
      logSafeFailure('Restock V3 plan update failed', error);
      return res.status(500).json({ error: 'Failed to update plan' });
    }
  });

  /**
   * 重复安排候选：在归属权限（userId）内按 仓库范围重叠 / 同库存池 预筛，
   * 游标分页遍历**全部**候选计划——不以任何数量截断（第 N 条相关计划不得静默漏报）。
   * SKU 交集与提醒组装留在内存；提醒不阻断确认（现有产品规则）。
   */
  const DUPLICATE_SCAN_BATCH_SIZE = 200;
  const collectDuplicateCandidates = async (
    userId: string,
    currentWarehouseCodes: string[],
    currentPoolId: string | null,
  ) => {
    const orClauses: Array<Record<string, unknown>> = [];
    if (currentWarehouseCodes.length > 0) {
      orClauses.push({ warehouseCodes: { hasSome: [...currentWarehouseCodes] } });
    }
    if (currentPoolId) {
      orClauses.push({ poolId: currentPoolId });
    }
    if (orClauses.length === 0) return [];
    const where = { userId, status: 'confirmed' as const, OR: orClauses };
    const candidates: Array<{ id: string; name: string; items: unknown; poolId: string | null; warehouseCodes: string[]; confirmedAt: Date | null; createdAt: Date }> = [];
    let cursorId: string | undefined;
    // 游标分页（排序键含唯一 id，稳定不重不漏）；批次为扫描单位而非截断上限
    for (;;) {
      const batch = await prisma.restockPlanSnapshot.findMany({
        where,
        orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
        take: DUPLICATE_SCAN_BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { id: true, name: true, items: true, poolId: true, warehouseCodes: true, confirmedAt: true, createdAt: true },
      });
      candidates.push(...batch);
      if (batch.length < DUPLICATE_SCAN_BATCH_SIZE) break;
      cursorId = batch[batch.length - 1].id;
    }
    return candidates;
  };

  router.post('/plans/:id/confirm', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      // revision 必传（乐观并发）：缺失/非法 = 参数错误；不匹配 = 过期版本
      const revision = parseStrictQuantity(req.body?.revision);
      if (revision === null) {
        return res.status(400).json({ error: 'revision 必填（读取计划时的修订号，非负整数）；请刷新计划列表获取最新版本后重试' });
      }
      const existing = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId },
      });
      if (!existing) return res.status(404).json({ error: 'Plan not found' });
      if (existing.status !== 'draft') {
        return res.status(409).json({ error: `Plan is already ${existing.status}` });
      }
      if (revision !== existing.revision) {
        return res.status(409).json({ error: `计划已被其他操作更新（当前修订 ${existing.revision}，提交的是 ${revision}），请刷新后重新核对再确认` });
      }
      // 逐项可执行校验（与保存/编辑同一套规则；只读服务端快照，不信任客户端提交的 executable/质量状态）
      const itemValidationError = validateStoredItemsForExecution(existing.items);
      if (itemValidationError) {
        return res.status(400).json({ error: itemValidationError });
      }
      // 可执行确认约束：整站默认范围未确认归属，不允许确认为可执行计划
      const summary = (existing.summary ?? {}) as Record<string, unknown>;
      if (summary.scopeConfirmed !== true) {
        return res.status(409).json({
          error: '该计划保存时使用的是整站仓库默认范围（未确认库存归属）。请选择库存池或明确仓库范围后重新计算并保存，再确认计划。',
        });
      }
      // 重复安排提醒：仓库范围重叠 / 同池 + SKU 交集（提醒不阻断；全量分页扫描，不截断）
      const duplicatePlanWarnings: string[] = [];
      try {
        const confirmedPlans = await collectDuplicateCandidates(userId, existing.warehouseCodes || [], existing.poolId);
        const currentSkus = new Set((((existing.items ?? []) as unknown as PlanSnapshotItem[])).map(item => item.sku));
        const currentWh = new Set(existing.warehouseCodes || []);
        for (const other of confirmedPlans) {
          if (other.id === existing.id) continue;
          const otherSkus = (((other.items ?? []) as unknown as PlanSnapshotItem[])).map(item => item.sku);
          const overlap = otherSkus.filter(sku => currentSkus.has(sku));
          if (overlap.length === 0) continue;
          const whOverlap = (other.warehouseCodes || []).some(code => currentWh.has(code));
          const poolOverlap = other.poolId !== null && other.poolId === existing.poolId;
          if (whOverlap || poolOverlap) {
            duplicatePlanWarnings.push(
              `已确认计划「${other.name}」（${dateString(other.confirmedAt ?? other.createdAt)}）在重叠仓库范围内包含 ${overlap.length} 个相同 SKU，请确认没有重复安排`,
            );
          }
        }
      } catch (error) {
        logSafeFailure('Restock V3 duplicate plan check failed', error);
      }
      const confirmedAt = new Date();
      // 条件更新：status 与 revision 都以读取值为准；成功后原子递增 revision
      const updated = await prisma.restockPlanSnapshot.updateMany({
        where: { id: existing.id, userId, status: 'draft', revision: existing.revision },
        data: { status: 'confirmed', confirmedAt, revision: existing.revision + 1 },
      });
      if (updated.count === 0) {
        return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重新核对再确认' });
      }
      return res.json({
        plan: {
          ...existing,
          status: 'confirmed',
          confirmedAt,
          revision: existing.revision + 1,
        },
        duplicatePlanWarnings,
      });
    } catch (error) {
      logSafeFailure('Restock V3 plan confirm failed', error);
      return res.status(500).json({ error: 'Failed to confirm plan' });
    }
  });

  router.post('/plans/:id/void', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      // revision 必传（乐观并发）：缺失/非法 = 参数错误；不匹配 = 过期版本
      const revision = parseStrictQuantity(req.body?.revision);
      if (revision === null) {
        return res.status(400).json({ error: 'revision 必填（读取计划时的修订号，非负整数）；请刷新计划列表获取最新版本后重试' });
      }
      const voidReason = typeof req.body?.voidReason === 'string' && req.body.voidReason.trim()
        ? req.body.voidReason.trim().slice(0, 500)
        : null;
      if (!voidReason) return res.status(400).json({ error: 'voidReason is required' });
      const existing = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId },
      });
      if (!existing) return res.status(404).json({ error: 'Plan not found' });
      if (existing.status === 'void') return res.status(409).json({ error: 'Plan is already void' });
      if (revision !== existing.revision) {
        return res.status(409).json({ error: `计划已被其他操作更新（当前修订 ${existing.revision}，提交的是 ${revision}），请刷新后重新核对再作废` });
      }
      // 条件更新：status 与 revision 都以读取值为准；成功后原子递增 revision
      const updated = await prisma.restockPlanSnapshot.updateMany({
        where: { id: existing.id, userId, status: { in: ['draft', 'confirmed'] }, revision: existing.revision },
        data: { status: 'void', voidedAt: new Date(), voidReason, revision: existing.revision + 1 },
      });
      if (updated.count === 0) return res.status(409).json({ error: '计划已被其他操作更新，请刷新后重试' });
      return res.json({ voided: true });
    } catch (error) {
      logSafeFailure('Restock V3 plan void failed', error);
      return res.status(500).json({ error: 'Failed to void plan' });
    }
  });

  router.post('/plans/:id/copy', requireRestockPermission('restock-v3.refresh'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const source = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId },
      });
      if (!source) return res.status(404).json({ error: 'Plan not found' });
      if (source.status === 'void') return res.status(409).json({ error: '作废计划不能复制，请重新计算保存' });
      const copy = await withUsageEvent(prisma, req, { module: 'restock-v3', action: 'restock_plan_copy', objectType: 'RestockPlanSnapshot' }, (tx) => tx.restockPlanSnapshot.create({
        data: {
          userId,
          name: `${source.name}（新版）`.slice(0, MAX_PLAN_NAME_LENGTH),
          status: 'draft',
          site: source.site,
          shopIds: source.shopIds,
          poolId: source.poolId,
          warehouseCodes: source.warehouseCodes,
          rangeFrom: source.rangeFrom,
          rangeTo: source.rangeTo,
          salesMetric: source.salesMetric,
          parameters: source.parameters ?? {},
          items: source.items ?? {},
          summary: { ...((source.summary ?? {}) as Record<string, unknown>), scopeConfirmed: ((source.summary ?? {}) as Record<string, unknown>).scopeConfirmed ?? false },
          snapshotMeta: source.snapshotMeta ?? {},
          supersedesId: source.id,
          version: source.version + 1,
          resultId: source.resultId,
        },
      }));
      return res.status(201).json({ plan: copy });
    } catch (error) {
      logSafeFailure('Restock V3 plan copy failed', error);
      return res.status(500).json({ error: 'Failed to copy plan' });
    }
  });

  router.get('/plans/:id/export', requireRestockPermission('restock-v3.view'), async (req, res) => {
    try {
      const plan = await prisma.restockPlanSnapshot.findFirst({
        where: { id: String(req.params.id ?? ''), userId: req.user!.id },
      });
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const statusLabels: Record<string, string> = { draft: '草稿', confirmed: '已确认', void: '已作废' };
      const items = (plan.items ?? []) as unknown as Array<Record<string, unknown>>;
      const parameters = (plan.parameters ?? {}) as Record<string, unknown>;
      const meta = (plan.snapshotMeta ?? {}) as Record<string, unknown>;
      const legacy = isLegacySnapshot(items);
      // CSV 公式注入防护：文本字段以 = + - @ 制表/回车开头时前缀单引号，保证表格软件按文本处理
      const csvEscape = (value: unknown, isText = false): string => {
        let text = value === null || value === undefined ? '' : String(value);
        if (isText && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines: string[] = [];
      lines.push(`计划号,${csvEscape(plan.id)}`);
      lines.push(`计划名称,${csvEscape(plan.name, true)}`);
      lines.push(`状态,${csvEscape(statusLabels[plan.status] ?? plan.status)},版本,${csvEscape(plan.version)},修订,${csvEscape(plan.revision)}`);
      lines.push(`站点,${csvEscape(plan.site)},店铺,${csvEscape((plan.shopIds || []).join(' | '))}`);
      lines.push(`统计区间,${csvEscape(plan.rangeFrom)} ~ ${csvEscape(plan.rangeTo)},销量口径,${csvEscape(plan.salesMetric === 'unitsOrdered' ? '已下订单件数' : plan.salesMetric)}`);
      lines.push(`计划日,${csvEscape(parameters.planningDate ?? '')},目标覆盖日,${csvEscape(parameters.targetDate ?? '')}`);
      lines.push(`补货时效(天),${csvEscape(parameters.leadTimeDays ?? '')},安全库存(天),${csvEscape(parameters.safetyDays ?? '')},增长率(%),${csvEscape(parameters.growthPercent ?? '')}`);
      lines.push(`数据获取时间,${csvEscape(meta.salesFetchedAt ?? '')},算法版本,${csvEscape(meta.algorithmVersion ?? '')},条件指纹,${csvEscape(meta.fingerprint ?? '')}`);
      lines.push(`确认时间,${csvEscape(plan.confirmedAt ? plan.confirmedAt.toISOString() : '')},创建时间,${csvEscape(plan.createdAt.toISOString())}`);
      if (legacy) {
        lines.push('注意,历史版本（信息不完整，仅含保存时的 SKU 与数量，无计算依据快照）');
      }
      lines.push('');
      if (legacy) {
        lines.push('SKU,建议补货量,确认补货量,调整原因');
        for (const item of items) {
          lines.push([
            csvEscape(item.sku),
            csvEscape(item.suggestedQty),
            csvEscape(item.confirmedQty ?? ''),
            csvEscape(item.adjustReason ?? '', true),
          ].join(','));
        }
      } else {
        lines.push('SKU,名称,状态,预测日销,可用库存,确定在途,预计断货日,建议补货量,建议金额,确认补货量,确认金额,调整原因');
        for (const item of items) {
          const suggestedQty = Number(item.suggestedQty ?? 0);
          const confirmedQty = Number(item.confirmedQty ?? suggestedQty);
          const suggestedAmount = typeof item.estimatedCost === 'number' ? item.estimatedCost : null;
          const unitCost = suggestedQty > 0 && suggestedAmount !== null ? suggestedAmount / suggestedQty : null;
          lines.push([
            csvEscape(item.sku),
            csvEscape(item.name ?? '', true),
            csvEscape(item.status ?? ''),
            csvEscape(item.adjustedDailySales ?? ''),
            csvEscape(item.availableStock ?? ''),
            csvEscape(item.inTransit ?? ''),
            csvEscape(item.stockoutDate ?? ''),
            csvEscape(suggestedQty),
            csvEscape(item.costUnknown || suggestedAmount === null ? '未知' : suggestedAmount),
            csvEscape(confirmedQty),
            csvEscape(item.costUnknown || unitCost === null ? '未知' : confirmedQty * unitCost),
            csvEscape(item.adjustReason ?? '', true),
          ].join(','));
        }
      }
      const csv = `\uFEFF${lines.join('\r\n')}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="restock-plan-${plan.id.slice(0, 8)}.csv"; filename*=UTF-8''${encodeURIComponent(`补货计划_${plan.name}`)}.csv`);
      return res.send(csv);
    } catch (error) {
      logSafeFailure('Restock V3 plan export failed', error);
      return res.status(500).json({ error: 'Failed to export plan' });
    }
  });
  return router;
};

export default createRestockV3Router();
