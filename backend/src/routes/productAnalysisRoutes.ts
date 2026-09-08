import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { GlmApiError } from '../services/glm/glmConfig';
import { glmChat, glmChatStream, GlmChatMessage } from '../services/glm/glmClient';
import { ApiError } from '../services/chroma/config';
import { resolveChatAiConfig } from '../services/aiUserConfig';
import {
  buildShopAnalysisSystemPrompt,
  serializeAggregatedItem,
  serializeAggregatedOverview,
} from '../services/glm/prompts';
import { withUsageEvent } from '../services/usageEvents';
import { runAiCall } from '../services/aiUsage';
import {
  SUMMABLE_FIELDS,
  aggregateItems,
  buildItemDetail,
  mapParsedSheetItemsToDailyRows,
  type DailyItemRow,
} from '../services/productAnalysisAggregation';
import { rankPotentialItems, type PotentialFilterOptions } from '../services/productAnalysisPotential';

const router = Router();

const MAX_UPLOAD_JSON_LENGTH = 20 * 1024 * 1024; // 20MB
const MAX_BATCH_DELETE_DATES = 500;
const MAX_CHAT_HISTORY_MESSAGES = 8;
const SITES = ['PH', 'MY', 'SG', 'ID', 'TH'] as const;
const SITE_CURRENCY: Record<string, string> = { PH: 'PHP', MY: 'MYR', SG: 'SGD', ID: 'IDR', TH: 'THB' };
const SHEET_ORDER = ['hot', 'new', 'uncompetitive', 'competitive'] as const;
class ProductAnalysisNotFoundError extends Error {}

function errorResponse(error: unknown, res: Response): void {
  if (error instanceof ProductAnalysisNotFoundError) {
    res.status(404).json({ detail: error.message });
  } else if (error instanceof GlmApiError || error instanceof ApiError) {
    res.status(error.status_code).json({ detail: error.detail });
  } else {
    console.error('Unexpected product analysis error:', error instanceof Error ? error.name : typeof error);
    res.status(500).json({ detail: 'Internal server error' });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function parseDateUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, delta: number): string {
  const next = parseDateUtc(date);
  next.setUTCDate(next.getUTCDate() + delta);
  return dateString(next);
}

/** '*' 通配 / 模块级 key（product-analysis）/ 具体 subkey 三级放行，与前端 PermissionTree 语义对齐 */
function hasProductAnalysisPermission(permissions: string[], permission: string): boolean {
  return (
    permissions.includes('*')
    || permissions.includes('product-analysis')
    || permissions.includes(permission)
  );
}

type ProductAnalysisPermission = 'product-analysis.upload' | 'product-analysis.aiChat';

/** 与 dashboardRoutes.requireDashboardPermission 同构：owner 直通，其余查库校验 isActive + 权限 */
const requireProductAnalysisPermission = (permission: ProductAnalysisPermission) => (
  async (req: Request, res: Response, next: (err?: unknown) => void) => {
    if (!req.user) return res.status(401).json({ detail: 'Unauthorized' });
    if (req.user.role === 'owner') return next();
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { permissions: true, isActive: true },
      });
      if (!user?.isActive || !hasProductAnalysisPermission(user.permissions || [], permission)) {
        return res.status(403).json({ detail: 'Forbidden' });
      }
      return next();
    } catch {
      return res.status(500).json({ detail: 'Permission check failed' });
    }
  }
);

function sanitizeChatMessages(raw: unknown): GlmChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((message): message is { role: 'user' | 'assistant'; content: string } => {
      const role = message.role;
      const content = message.content;
      return (
        (role === 'user' || role === 'assistant') &&
        typeof content === 'string' &&
        content.trim().length > 0
      );
    })
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .slice(-MAX_CHAT_HISTORY_MESSAGES);
}

async function findOwnedShop(id: string, userId: string) {
  return prisma.productAnalysisShop.findFirst({ where: { id, userId } });
}

/** 校验区间参数并归一化（from ≤ to），默认区间由调用方决定 */
function parseRange(query: Record<string, unknown>): { from: string; to: string } | null {
  const from = query.from;
  const to = query.to;
  if (!isValidDateString(from) || !isValidDateString(to)) return null;
  if (from > to) return null;
  return { from, to };
}

const ITEM_SELECT_BASE = {
  itemId: true,
  itemName: true,
  sheetKey: true,
  status: true,
  upload: { select: { date: true } },
} as const;

/** 拉取区间内的日行（includeDetailFields 时附带 extra/variations） */
async function fetchRangeRows(
  shopId: string,
  from: string,
  to: string,
  options: { includeDetailFields?: boolean; itemId?: string } = {}
) {
  const uploads = await prisma.productAnalysisDailyUpload.findMany({
    where: { shopId, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  });
  if (uploads.length === 0) return { uploads, rows: [] as DailyItemRow[] };
  const select: Record<string, boolean | object> = {
    ...ITEM_SELECT_BASE,
    ...Object.fromEntries(SUMMABLE_FIELDS.map((field) => [field, true])),
  };
  if (options.includeDetailFields) {
    select.extra = true;
    select.variations = true;
  }
  const where: Record<string, unknown> = { uploadId: { in: uploads.map((upload) => upload.id) } };
  if (options.itemId) where.itemId = options.itemId;
  // 动态 select 使 prisma 类型退化为 never，转松类型后按 DailyItemRow 消费
  const rawRows = (await prisma.productDailyItem.findMany({ where, select })) as unknown as Array<
    Record<string, unknown> & { upload: { date: Date } }
  >;
  const rows = rawRows.map(
    (raw): DailyItemRow => ({ ...(raw as unknown as DailyItemRow), date: dateString(raw.upload.date) })
  );
  return { uploads, rows };
}

// ---- 店铺管理 ----

router.post('/shops', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const site = typeof body?.site === 'string' ? body.site : '';
    if (name.length === 0 || name.length > 50) {
      return res.status(400).json({ detail: '店铺名称需为 1-50 个字符' });
    }
    if (!SITES.includes(site as (typeof SITES)[number])) {
      return res.status(400).json({ detail: `站点必须是 ${SITES.join(' / ')} 之一` });
    }
    try {
      const shop = await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_create', objectType: 'ProductAnalysisShop' }, tx => tx.productAnalysisShop.create({
        data: {
          name,
          site,
          currency: SITE_CURRENCY[site] ?? 'MYR',
          userId: req.user!.id,
        },
        select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
      }));
      return res.status(201).json(shop);
    } catch (error) {
      if (isRecord(error) && (error as { code?: string }).code === 'P2002') {
        return res.status(409).json({ detail: '同名店铺已存在' });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.get('/shops', async (req: Request, res: Response) => {
  try {
    const [shops, stats] = await Promise.all([
      prisma.productAnalysisShop.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
      }),
      prisma.productAnalysisDailyUpload.groupBy({
        by: ['shopId'],
        where: { userId: req.user!.id },
        _count: { _all: true },
        _max: { date: true },
      }),
    ]);
    const statsByShop = new Map(stats.map((stat) => [stat.shopId, stat]));
    return res.json(
      shops.map((shop) => {
        const stat = statsByShop.get(shop.id);
        return {
          ...shop,
          dayCount: stat?._count._all ?? 0,
          latestUploadDate: stat?._max.date ? dateString(stat._max.date) : null,
        };
      })
    );
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.patch('/shops/:id', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const body = req.body as Record<string, unknown>;
    const data: { name?: string; site?: string; currency?: string } = {};
    if (body?.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length === 0 || name.length > 50) {
        return res.status(400).json({ detail: '店铺名称需为 1-50 个字符' });
      }
      data.name = name;
    }
    if (body?.site !== undefined) {
      const site = typeof body.site === 'string' ? body.site : '';
      if (!SITES.includes(site as (typeof SITES)[number])) {
        return res.status(400).json({ detail: `站点必须是 ${SITES.join(' / ')} 之一` });
      }
      data.site = site;
      data.currency = SITE_CURRENCY[site] ?? 'MYR';
    }
    try {
      const updated = await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_update', objectType: 'ProductAnalysisShop', objectId: shop.id }, tx => tx.productAnalysisShop.update({
        where: { id: shop.id },
        data,
        select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
      }));
      return res.json(updated);
    } catch (error) {
      if (isRecord(error) && (error as { code?: string }).code === 'P2002') {
        return res.status(409).json({ detail: '同名店铺已存在' });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.delete('/shops/:id', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const shopId = String(req.params.id ?? '');
    await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_delete', objectType: 'ProductAnalysisShop', objectId: shopId }, async tx => {
      const result = await tx.productAnalysisShop.deleteMany({ where: { id: shopId, userId: req.user!.id } });
      if (result.count === 0) throw new ProductAnalysisNotFoundError('Shop not found');
      return result;
    });
    return res.json({ ok: true });
  } catch (error) {
    return errorResponse(error, res);
  }
});

// ---- 每日上传 ----

router.get('/shops/:id/days', async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const days = await prisma.productAnalysisDailyUpload.findMany({
      where: { shopId: shop.id },
      orderBy: { date: 'desc' },
      select: { date: true, fileName: true, itemCount: true, currency: true, createdAt: true },
    });
    return res.json(
      days.map((day) => ({
        date: dateString(day.date),
        fileName: day.fileName,
        itemCount: day.itemCount,
        currency: day.currency,
        createdAt: day.createdAt,
      }))
    );
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.post('/shops/:id/daily-uploads', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const body = req.body as Record<string, unknown>;
    const date = body?.date;
    const payload = body?.payload;
    if (!isValidDateString(date)) {
      return res.status(400).json({ detail: 'date 需为 YYYY-MM-DD' });
    }
    if (!isRecord(payload)) {
      return res.status(400).json({ detail: 'Missing required field: payload' });
    }
    const fileName = typeof payload.fileName === 'string' ? payload.fileName.trim() : '';
    if (!fileName) {
      return res.status(400).json({ detail: 'Missing required field: fileName' });
    }
    if (!Array.isArray(payload.sheets) || payload.sheets.length === 0) {
      return res.status(400).json({ detail: 'Missing required field: sheets' });
    }
    if (JSON.stringify(body).length > MAX_UPLOAD_JSON_LENGTH) {
      return res.status(400).json({ detail: 'Report payload too large (limit 20MB)' });
    }
    const rows = mapParsedSheetItemsToDailyRows(payload.sheets as { sheetKey: string; items: unknown[] }[]);
    if (rows.length === 0) {
      return res.status(400).json({ detail: 'Report contains no product items' });
    }
    const currency = typeof payload.currency === 'string' && payload.currency ? payload.currency : shop.currency;
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const uploadDate = parseDateUtc(date);

    const toDailyItemCreate = (row: DailyItemRow): Prisma.ProductDailyItemUncheckedCreateWithoutUploadInput => {
      const data: Prisma.ProductDailyItemUncheckedCreateWithoutUploadInput = {
        itemId: row.itemId,
        itemName: row.itemName,
        sheetKey: row.sheetKey,
        status: row.status ?? null,
        extra: (row.extra ?? undefined) as Prisma.InputJsonValue | undefined,
        variations: (row.variations ?? undefined) as Prisma.InputJsonValue | undefined,
      };
      const loose = row as unknown as Record<string, unknown>;
      for (const field of SUMMABLE_FIELDS) {
        const value = loose[field];
        data[field] = typeof value === 'number' && Number.isFinite(value) ? value : null;
      }
      return data;
    };

    // 同日重传整体替换（删除级联清理旧 items）
    await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_upload', objectType: 'ProductAnalysisDailyUpload', affectedCount: rows.length, metadata: { shopId: shop.id, date } }, async tx => {
      await tx.productAnalysisDailyUpload.deleteMany({ where: { shopId: shop.id, date: uploadDate } });
      return tx.productAnalysisDailyUpload.create({
        data: {
          shopId: shop.id,
          date: uploadDate,
          fileName,
          currency,
          itemCount: rows.length,
          warnings: warnings as unknown as object,
          userId: req.user!.id,
          items: { create: rows.map(toDailyItemCreate) },
        },
        select: { date: true, fileName: true, itemCount: true },
      });
    });
    return res.status(201).json({ date, fileName, itemCount: rows.length });
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.delete('/shops/:id/daily-uploads/:date', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const date = req.params.date;
    if (!isValidDateString(date)) {
      return res.status(400).json({ detail: 'date 需为 YYYY-MM-DD' });
    }
    await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_delete', objectType: 'ProductAnalysisDailyUpload', metadata: { shopId: shop.id, date } }, async tx => {
      const result = await tx.productAnalysisDailyUpload.deleteMany({ where: { shopId: shop.id, date: parseDateUtc(date) } });
      if (result.count === 0) throw new ProductAnalysisNotFoundError('Day not found');
      return result;
    });
    return res.json({ ok: true });
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.post('/shops/:id/daily-uploads/batch-delete', requireProductAnalysisPermission('product-analysis.upload'), async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const dates = (req.body as Record<string, unknown>)?.dates;
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ detail: 'dates 需为非空的 YYYY-MM-DD 数组' });
    }
    if (dates.length > MAX_BATCH_DELETE_DATES) {
      return res.status(400).json({ detail: `dates 数量超过上限 ${MAX_BATCH_DELETE_DATES}` });
    }
    if (!dates.every(isValidDateString)) {
      return res.status(400).json({ detail: 'dates 需为非空的 YYYY-MM-DD 数组' });
    }
    const uniqueDates = [...new Set(dates as string[])];
    const result = await withUsageEvent(prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_batch_delete', objectType: 'ProductAnalysisDailyUpload', metadata: { shopId: shop.id, dates: uniqueDates } }, async tx => {
      const deleted = await tx.productAnalysisDailyUpload.deleteMany({
        where: { shopId: shop.id, date: { in: uniqueDates.map(parseDateUtc) } },
      });
      if (deleted.count === 0) throw new ProductAnalysisNotFoundError('Day not found');
      return deleted;
    });
    return res.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    return errorResponse(error, res);
  }
});

// ---- 区间聚合 ----

router.get('/shops/:id/agg', async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const range = parseRange(req.query as Record<string, unknown>);
    if (!range) return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
    const { uploads, rows } = await fetchRangeRows(shop.id, range.from, range.to);
    const aggregated = aggregateItems(rows);
    const bySheet = new Map<string, typeof aggregated>();
    for (const item of aggregated) {
      const list = bySheet.get(item.sheetKey) ?? [];
      list.push(item);
      bySheet.set(item.sheetKey, list);
    }
    const sheets = [...bySheet.entries()]
      .sort((a, b) => {
        const rank = (key: string) => SHEET_ORDER.indexOf(key as (typeof SHEET_ORDER)[number]);
        return (rank(a[0]) === -1 ? 99 : rank(a[0])) - (rank(b[0]) === -1 ? 99 : rank(b[0]));
      })
      .map(([sheetKey, items]) => ({ sheetKey, items }));
    return res.json({
      from: range.from,
      to: range.to,
      days: uploads.length,
      itemCount: aggregated.length,
      currency: shop.currency,
      sheets,
    });
  } catch (error) {
    return errorResponse(error, res);
  }
});

/** 新商品分析筛选参数：数字或 'none'（不限）；缺省回退服务端默认阈值 */
function parsePotentialFilters(query: Record<string, unknown>): PotentialFilterOptions {
  const numberOrNull = (key: string): number | null | undefined => {
    const raw = query[key];
    if (raw === undefined || raw === '') return undefined;
    if (raw === 'none') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const excludeRaw = query.excludeBannedDeleted;
  return {
    minCtrPercent: numberOrNull('minCtr'),
    minClicks: numberOrNull('minClicks'),
    minCartRatePercent: numberOrNull('minCartRate'),
    excludeBannedDeleted: excludeRaw === undefined ? undefined : excludeRaw !== '0',
    limit: numberOrNull('limit') ?? undefined,
  };
}

router.get('/shops/:id/potential', async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const range = parseRange(req.query as Record<string, unknown>);
    if (!range) return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
    // 数据根基：区间内出现在「新上架商品」sheet 的商品。
    // 入库时同商品多 sheet 只保留一行（按优先级归属，避免聚合重复累加），
    // 因此判定需同时看行的归属 sheetKey 与 extra.sheetKeys（商品当天出现过的全部工作表）。
    const inNewSheet = (row: DailyItemRow) => {
      if (row.sheetKey === 'new') return true;
      const sheetKeys = (row.extra as { sheetKeys?: unknown } | null)?.sheetKeys;
      return Array.isArray(sheetKeys) && sheetKeys.includes('new');
    };
    const { rows } = await fetchRangeRows(shop.id, range.from, range.to, { includeDetailFields: true });
    const newItemIds = new Set(rows.filter(inNewSheet).map((row) => row.itemId));
    const byItem = new Map<string, {
      itemId: string;
      itemName: string;
      sheetKey: string;
      status?: string | null;
      daily: { date: string; ordersOrdered: number; visitors: number; clicks: number; impressions: number; cartVisitors: number }[];
    }>();
    for (const row of rows) {
      if (!newItemIds.has(row.itemId)) continue;
      let candidate = byItem.get(row.itemId);
      if (!candidate) {
        candidate = {
          itemId: row.itemId,
          itemName: row.itemName,
          sheetKey: row.sheetKey,
          status: row.status ?? null,
          daily: [],
        };
        byItem.set(row.itemId, candidate);
      }
      candidate.daily.push({
        date: row.date,
        ordersOrdered: typeof row.ordersOrdered === 'number' ? row.ordersOrdered : 0,
        visitors: typeof row.visitors === 'number' ? row.visitors : 0,
        clicks: typeof row.clicks === 'number' ? row.clicks : 0,
        impressions: typeof row.impressions === 'number' ? row.impressions : 0,
        cartVisitors: typeof row.cartVisitors === 'number' ? row.cartVisitors : 0,
      });
    }
    const items = rankPotentialItems([...byItem.values()], parsePotentialFilters(req.query as Record<string, unknown>));
    return res.json({ from: range.from, to: range.to, items });
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.get('/shops/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const shop = await findOwnedShop(String(req.params.id ?? ''), req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    const range = parseRange(req.query as Record<string, unknown>);
    if (!range) return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
    const itemId = String(req.params.itemId ?? '');
    if (!itemId) return res.status(400).json({ detail: 'Missing required field: itemId' });
    const { rows } = await fetchRangeRows(shop.id, range.from, range.to, {
      includeDetailFields: true,
      itemId,
    });
    if (rows.length === 0) return res.status(404).json({ detail: 'Item not found in this shop' });
    const detail = buildItemDetail(rows);
    return res.json({
      from: range.from,
      to: range.to,
      currency: shop.currency,
      item: detail.item,
      series: detail.series,
      variations: detail.variations,
      extra: detail.extra,
    });
  } catch (error) {
    return errorResponse(error, res);
  }
});

// ---- GLM AI 对话（店铺区间模式，默认近 7 天） ----

router.post('/chat', requireProductAnalysisPermission('product-analysis.aiChat'), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const shopId = typeof body?.shopId === 'string' ? body.shopId : '';
    if (!shopId) {
      return res.status(400).json({ detail: 'Missing required field: shopId' });
    }
    const history = sanitizeChatMessages(body?.messages);
    if (history.length === 0) {
      return res.status(400).json({ detail: 'Missing required field: messages' });
    }
    const shop = await findOwnedShop(shopId, req.user!.id);
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });

    const latest = await prisma.productAnalysisDailyUpload.findFirst({
      where: { shopId: shop.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!latest) {
      return res.status(400).json({ detail: '该店铺还没有上传过数据' });
    }
    // 默认区间：以最新上传日为锚点的近 7 天
    const to = isValidDateString(body?.to) ? (body.to as string) : dateString(latest.date);
    const from = isValidDateString(body?.from) ? (body.from as string) : addDays(to, -6);
    if (from > to) {
      return res.status(400).json({ detail: 'from 不能晚于 to' });
    }
    const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : null;
    // 个人中心 AI 配置优先，未配置回退环境变量
    const chatConfig = await resolveChatAiConfig(req.user!.id);

    let systemPrompt: string;
    let chatMode: string;
    let payload: Record<string, unknown>;
    if (itemId) {
      const { uploads, rows } = await fetchRangeRows(shop.id, from, to, { includeDetailFields: true, itemId });
      if (rows.length === 0) {
        return res.status(404).json({ detail: 'Item not found in this shop' });
      }
      const detail = buildItemDetail(rows);
      const context = serializeAggregatedItem(
        detail.item as unknown as Record<string, unknown>,
        detail.series,
        detail.variations
      );
      chatMode = 'product_analysis_chat_item';
      payload = { shopId, itemId, from, to, history };
      systemPrompt = [
        buildShopAnalysisSystemPrompt({
          shopName: shop.name,
          site: shop.site,
          currency: shop.currency,
          from,
          to,
          days: uploads.length,
          mode: 'item',
        }),
        '===== 分析数据 =====',
        context || '（该区间无可用数据）',
      ].join('\n\n');
    } else {
      const { uploads, rows } = await fetchRangeRows(shop.id, from, to);
      const aggregated = aggregateItems(rows);
      const bySheet = new Map<string, typeof aggregated>();
      for (const item of aggregated) {
        const list = bySheet.get(item.sheetKey) ?? [];
        list.push(item);
        bySheet.set(item.sheetKey, list);
      }
      const context = serializeAggregatedOverview(
        [...bySheet.entries()].map(([sheetKey, items]) => ({
          sheetKey,
          items: items as unknown as Record<string, unknown>[],
        }))
      );
      chatMode = 'product_analysis_chat_overview';
      payload = { shopId, from, to, history };
      systemPrompt = [
        buildShopAnalysisSystemPrompt({
          shopName: shop.name,
          site: shop.site,
          currency: shop.currency,
          from,
          to,
          days: uploads.length,
          mode: 'overview',
        }),
        '===== 分析数据 =====',
        context || '（该区间无可用数据）',
      ].join('\n\n');
    }

    const chatMessages: GlmChatMessage[] = [{ role: 'system', content: systemPrompt }, ...history];
    const aiCallInput = {
      userId: req.user!.id,
      actorName: req.user!.username,
      requestKey: body.requestKey as string,
      operationId: body.operationId as string,
      kind: 'analysis' as const,
      module: 'product-analysis',
      mode: chatMode,
      model: chatConfig.model,
      allowedModels: [chatConfig.model],
      payload,
    };

    // 流式模式：SSE 逐块推送增量，结束事件带最终模型；错误以事件形式返回
    if (body.stream === true) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      const send = (data: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      // 推理模型思考期可能数十秒无正文：期间定时发 SSE 注释心跳，防止代理空闲断连
      let sawProviderData = false;
      const heartbeat = setInterval(() => {
        if (!sawProviderData) res.write(': keep-alive\n\n');
      }, 5_000);
      try {
        let emitted = false;
        const { result } = await runAiCall(aiCallInput, () =>
          glmChatStream(
            chatMessages,
            { config: chatConfig, fastMode: body.deepThinking === false },
            (delta) => {
              sawProviderData = true;
              emitted = true;
              send({ delta });
            },
            (reasoning) => {
              sawProviderData = true;
              send({ reasoning });
            }
          )
        );
        // 幂等重放（或供应商未产生增量）时把完整内容一次性补发
        if (!emitted && typeof result?.content === 'string' && result.content) {
          send({ delta: result.content });
        }
        send({ done: true, model: typeof result?.model === 'string' ? result.model : chatConfig.model });
      } catch (error) {
        const detail =
          error instanceof ApiError || error instanceof GlmApiError ? error.detail : 'AI 调用失败';
        send({ error: detail });
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
      return;
    }

    const { result } = await runAiCall(aiCallInput, () => glmChat(chatMessages, { config: chatConfig }));
    return res.json(result);
  } catch (error) {
    return errorResponse(error, res);
  }
});

export default router;
