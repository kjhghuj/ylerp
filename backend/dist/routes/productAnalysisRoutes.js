"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const glmConfig_1 = require("../services/glm/glmConfig");
const glmClient_1 = require("../services/glm/glmClient");
const config_1 = require("../services/chroma/config");
const aiUserConfig_1 = require("../services/aiUserConfig");
const prompts_1 = require("../services/glm/prompts");
const usageEvents_1 = require("../services/usageEvents");
const aiUsage_1 = require("../services/aiUsage");
const productAnalysisAggregation_1 = require("../services/productAnalysisAggregation");
const productAnalysisPotential_1 = require("../services/productAnalysisPotential");
const productAnalysisUpload_1 = require("../services/productAnalysisUpload");
const router = (0, express_1.Router)();
const MAX_UPLOAD_JSON_LENGTH = 20 * 1024 * 1024; // 20MB
const MAX_BATCH_DELETE_DATES = 500;
const MAX_CHAT_HISTORY_MESSAGES = 8;
/** 查询区间上限：界面最长支持 90 天快捷区间 + 自定义区间，一年封顶防止无界拉取 */
const MAX_QUERY_RANGE_DAYS = 366;
/** 新品榜返回数量上限 */
const MAX_POTENTIAL_LIMIT = 100;
const SITES = ['PH', 'MY', 'SG', 'ID', 'TH'];
const SITE_CURRENCY = { PH: 'PHP', MY: 'MYR', SG: 'SGD', ID: 'IDR', TH: 'THB' };
const SHEET_ORDER = ['hot', 'new', 'uncompetitive', 'competitive'];
class ProductAnalysisNotFoundError extends Error {
}
function errorResponse(error, res) {
    if (error instanceof ProductAnalysisNotFoundError) {
        res.status(404).json({ detail: error.message });
    }
    else if (error instanceof glmConfig_1.GlmApiError || error instanceof config_1.ApiError) {
        res.status(error.status_code).json({ detail: error.detail });
    }
    else {
        console.error('Unexpected product analysis error:', error instanceof Error ? (error.stack ?? error.name) : typeof error);
        res.status(500).json({ detail: 'Internal server error' });
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isValidDateString(value) {
    return typeof value === 'string' && (0, productAnalysisUpload_1.isValidCalendarDate)(value);
}
function parseDateUtc(date) {
    return new Date(`${date}T00:00:00.000Z`);
}
function dateString(date) {
    return date.toISOString().slice(0, 10);
}
function daysBetweenInclusive(from, to) {
    return Math.round((parseDateUtc(to).getTime() - parseDateUtc(from).getTime()) / 86_400_000) + 1;
}
function addDays(date, delta) {
    const next = parseDateUtc(date);
    next.setUTCDate(next.getUTCDate() + delta);
    return dateString(next);
}
/** '*' 通配 / 模块级 key（product-analysis）/ 具体 subkey 三级放行，与前端 PermissionTree 语义对齐 */
function hasProductAnalysisPermission(permissions, permission) {
    return (permissions.includes('*')
        || permissions.includes('product-analysis')
        || permissions.includes(permission));
}
/** 与 dashboardRoutes.requireDashboardPermission 同构：owner 直通，其余查库校验 isActive + 权限 */
const requireProductAnalysisPermission = (permission) => (async (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ detail: 'Unauthorized' });
    if (req.user.role === 'owner')
        return next();
    try {
        const user = await index_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { permissions: true, isActive: true },
        });
        if (!user?.isActive || !hasProductAnalysisPermission(user.permissions || [], permission)) {
            return res.status(403).json({ detail: 'Forbidden' });
        }
        return next();
    }
    catch {
        return res.status(500).json({ detail: 'Permission check failed' });
    }
});
function sanitizeChatMessages(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .filter(isRecord)
        .filter((message) => {
        const role = message.role;
        const content = message.content;
        return ((role === 'user' || role === 'assistant') &&
            typeof content === 'string' &&
            content.trim().length > 0);
    })
        .map((message) => ({ role: message.role, content: message.content.trim() }))
        .slice(-MAX_CHAT_HISTORY_MESSAGES);
}
async function findOwnedShop(id, userId) {
    return index_1.prisma.productAnalysisShop.findFirst({ where: { id, userId } });
}
/** 校验区间参数并归一化（from ≤ to 且跨度 ≤ MAX_QUERY_RANGE_DAYS），默认区间由调用方决定 */
function parseRange(query) {
    const from = query.from;
    const to = query.to;
    if (!isValidDateString(from) || !isValidDateString(to))
        return null;
    if (from > to)
        return null;
    if (daysBetweenInclusive(from, to) > MAX_QUERY_RANGE_DAYS)
        return null;
    return { from, to };
}
const ITEM_SELECT_BASE = {
    itemId: true,
    itemName: true,
    sheetKey: true,
    status: true,
    upload: { select: { date: true } },
};
/** 拉取区间内的日行（extra / variations 按需加载：新品榜只读 extra.sheetKeys，无需全量变体） */
async function fetchRangeRows(shopId, from, to, options = {}) {
    const uploads = await index_1.prisma.productAnalysisDailyUpload.findMany({
        where: { shopId, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
        select: { id: true, date: true, currency: true },
        orderBy: { date: 'asc' },
    });
    if (uploads.length === 0)
        return { uploads, rows: [] };
    const select = {
        ...ITEM_SELECT_BASE,
        ...Object.fromEntries(productAnalysisAggregation_1.SUMMABLE_FIELDS.map((field) => [field, true])),
    };
    if (options.includeExtra)
        select.extra = true;
    if (options.includeVariations)
        select.variations = true;
    const where = { uploadId: { in: uploads.map((upload) => upload.id) } };
    if (options.itemId)
        where.itemId = options.itemId;
    // 动态 select 使 prisma 类型退化为 never，转松类型后按 DailyItemRow 消费
    const rawRows = (await index_1.prisma.productDailyItem.findMany({ where, select }));
    const rows = rawRows.map((raw) => ({ ...raw, date: dateString(raw.upload.date) }));
    return { uploads, rows };
}
/** 币种一致性守卫：区间内任一上传币种与店铺币种不一致即视为异常。
 *  金额分析（聚合 / 详情 / AI）统一拦截——不跨币种相加、不做隐式换算、不以店铺币种误标历史数据；
 *  返回可识别错误详情，null 表示一致（含空区间）。 */
function currencyMismatchDetail(shopCurrency, uploads) {
    const mismatched = [...new Set(uploads.filter((upload) => upload.currency !== shopCurrency).map((upload) => upload.currency))];
    if (mismatched.length === 0)
        return null;
    return `区间内存在与店铺币种（${shopCurrency}）不一致的上传数据（${mismatched.join(' / ')}）：金额不可跨币种汇总，已停止金额分析。请在数据日历中排查异常币种的日期`;
}
// ---- 店铺管理 ----
router.post('/shops', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const body = req.body;
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const site = typeof body?.site === 'string' ? body.site : '';
        if (name.length === 0 || name.length > 50) {
            return res.status(400).json({ detail: '店铺名称需为 1-50 个字符' });
        }
        if (!SITES.includes(site)) {
            return res.status(400).json({ detail: `站点必须是 ${SITES.join(' / ')} 之一` });
        }
        try {
            const shop = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_create', objectType: 'ProductAnalysisShop' }, tx => tx.productAnalysisShop.create({
                data: {
                    name,
                    site,
                    currency: SITE_CURRENCY[site] ?? 'MYR',
                    userId: req.user.id,
                },
                select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
            }));
            return res.status(201).json(shop);
        }
        catch (error) {
            if (isRecord(error) && error.code === 'P2002') {
                return res.status(409).json({ detail: '同名店铺已存在' });
            }
            throw error;
        }
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.get('/shops', async (req, res) => {
    try {
        const [shops, stats] = await Promise.all([
            index_1.prisma.productAnalysisShop.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
            }),
            index_1.prisma.productAnalysisDailyUpload.groupBy({
                by: ['shopId'],
                where: { userId: req.user.id },
                _count: { _all: true },
                _max: { date: true },
            }),
        ]);
        const statsByShop = new Map(stats.map((stat) => [stat.shopId, stat]));
        return res.json(shops.map((shop) => {
            const stat = statsByShop.get(shop.id);
            return {
                ...shop,
                dayCount: stat?._count._all ?? 0,
                latestUploadDate: stat?._max.date ? dateString(stat._max.date) : null,
            };
        }));
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.patch('/shops/:id', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const body = req.body;
        const data = {};
        if (body?.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (name.length === 0 || name.length > 50) {
                return res.status(400).json({ detail: '店铺名称需为 1-50 个字符' });
            }
            data.name = name;
        }
        if (body?.site !== undefined) {
            const site = typeof body.site === 'string' ? body.site : '';
            if (!SITES.includes(site)) {
                return res.status(400).json({ detail: `站点必须是 ${SITES.join(' / ')} 之一` });
            }
            const nextCurrency = SITE_CURRENCY[site] ?? 'MYR';
            // 币种防错配：历史金额按原币种存储，换站点改币种标签会让旧数据被误标，不做隐式换算
            if (nextCurrency !== shop.currency) {
                const existingDays = await index_1.prisma.productAnalysisDailyUpload.count({ where: { shopId: shop.id } });
                if (existingDays > 0) {
                    return res.status(400).json({
                        detail: `该店铺已有 ${existingDays} 天历史数据（${shop.currency}），不能改为 ${nextCurrency} 站点；请新建店铺后单独上传`,
                    });
                }
            }
            data.site = site;
            data.currency = nextCurrency;
        }
        try {
            const updated = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_update', objectType: 'ProductAnalysisShop', objectId: shop.id }, tx => tx.productAnalysisShop.update({
                where: { id: shop.id },
                data,
                select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
            }));
            return res.json(updated);
        }
        catch (error) {
            if (isRecord(error) && error.code === 'P2002') {
                return res.status(409).json({ detail: '同名店铺已存在' });
            }
            throw error;
        }
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.delete('/shops/:id', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const shopId = String(req.params.id ?? '');
        await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_shop_delete', objectType: 'ProductAnalysisShop', objectId: shopId }, async (tx) => {
            const result = await tx.productAnalysisShop.deleteMany({ where: { id: shopId, userId: req.user.id } });
            if (result.count === 0)
                throw new ProductAnalysisNotFoundError('Shop not found');
            return result;
        });
        return res.json({ ok: true });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
// ---- 每日上传 ----
router.get('/shops/:id/days', async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const days = await index_1.prisma.productAnalysisDailyUpload.findMany({
            where: { shopId: shop.id },
            orderBy: { date: 'desc' },
            select: { date: true, fileName: true, itemCount: true, currency: true, createdAt: true },
        });
        return res.json(days.map((day) => ({
            date: dateString(day.date),
            fileName: day.fileName,
            itemCount: day.itemCount,
            currency: day.currency,
            createdAt: day.createdAt,
            // 只读排查标记：文件名中可见的、起止不同的日期区间（start≠end）→ 疑似区间报表，不改写数据。
            // 能力边界：仅基于文件名可见日期；文件被改成单日文件名后无法识别其真实内容周期，
            // 周期校验也只能约束文件名与声明日期的一致性，不能证明文件内容一定属于单日。
            suspectedRange: (0, productAnalysisUpload_1.isSuspectedRangeFileName)(day.fileName),
        })));
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.post('/shops/:id/daily-uploads', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const body = req.body;
        const date = body?.date;
        const payload = body?.payload;
        if (!isValidDateString(date)) {
            return res.status(400).json({ detail: 'date 需为真实存在的 YYYY-MM-DD 日期' });
        }
        // 结构校验（Zod）：fileName / sheets / sheetKey / items 类型、长度与数量上限；非法一律 400 而非 500
        const validated = (0, productAnalysisUpload_1.validateDailyUploadPayload)(payload);
        if (!validated.ok) {
            return res.status(400).json({ detail: validated.detail });
        }
        const { fileName, periodStart, periodEnd, currency: reportCurrency, warnings, sheets } = validated.value;
        if (JSON.stringify(body).length > MAX_UPLOAD_JSON_LENGTH) {
            return res.status(400).json({ detail: 'Report payload too large (limit 20MB)' });
        }
        // 周期校验（服务端独立解析文件名，与声明周期、上传 date 三方交叉；多日区间不能因省略/伪造周期字段通过）
        const periodError = (0, productAnalysisUpload_1.validatePeriodMatchesDate)(fileName, { periodStart, periodEnd }, date);
        if (periodError) {
            return res.status(400).json({ detail: periodError });
        }
        // 币种校验：报表识别到币种时必须与店铺一致（不做隐式换算）；未识别（null）以店铺币种入库
        if (reportCurrency !== null && reportCurrency !== shop.currency) {
            return res.status(400).json({
                detail: `报表币种 ${reportCurrency} 与店铺币种 ${shop.currency} 不一致，请确认站点后重传`,
            });
        }
        const currency = shop.currency;
        const uploadDate = parseDateUtc(date);
        const rows = (0, productAnalysisAggregation_1.mapParsedSheetItemsToDailyRows)(sheets);
        if (rows.length === 0) {
            return res.status(400).json({ detail: 'Report contains no product items' });
        }
        const toDailyItemCreate = (row) => {
            const data = {
                itemId: row.itemId,
                itemName: row.itemName,
                sheetKey: row.sheetKey,
                status: row.status ?? null,
                extra: (row.extra ?? undefined),
                variations: (row.variations ?? undefined),
            };
            const loose = row;
            for (const field of productAnalysisAggregation_1.SUMMABLE_FIELDS) {
                const value = loose[field];
                data[field] = typeof value === 'number' && Number.isFinite(value) ? value : null;
            }
            return data;
        };
        // 同日重传整体替换（删除级联清理旧 items）
        await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_upload', objectType: 'ProductAnalysisDailyUpload', affectedCount: rows.length, metadata: { shopId: shop.id, date } }, async (tx) => {
            await tx.productAnalysisDailyUpload.deleteMany({ where: { shopId: shop.id, date: uploadDate } });
            return tx.productAnalysisDailyUpload.create({
                data: {
                    shopId: shop.id,
                    date: uploadDate,
                    fileName,
                    currency,
                    itemCount: rows.length,
                    warnings: warnings,
                    userId: req.user.id,
                    items: { create: rows.map(toDailyItemCreate) },
                },
                select: { date: true, fileName: true, itemCount: true },
            });
        });
        return res.status(201).json({ date, fileName, itemCount: rows.length });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.delete('/shops/:id/daily-uploads/:date', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const date = req.params.date;
        if (!isValidDateString(date)) {
            return res.status(400).json({ detail: 'date 需为 YYYY-MM-DD' });
        }
        await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_delete', objectType: 'ProductAnalysisDailyUpload', metadata: { shopId: shop.id, date } }, async (tx) => {
            const result = await tx.productAnalysisDailyUpload.deleteMany({ where: { shopId: shop.id, date: parseDateUtc(date) } });
            if (result.count === 0)
                throw new ProductAnalysisNotFoundError('Day not found');
            return result;
        });
        return res.json({ ok: true });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.post('/shops/:id/daily-uploads/batch-delete', requireProductAnalysisPermission('product-analysis.upload'), async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const dates = req.body?.dates;
        if (!Array.isArray(dates) || dates.length === 0) {
            return res.status(400).json({ detail: 'dates 需为非空的 YYYY-MM-DD 数组' });
        }
        if (dates.length > MAX_BATCH_DELETE_DATES) {
            return res.status(400).json({ detail: `dates 数量超过上限 ${MAX_BATCH_DELETE_DATES}` });
        }
        if (!dates.every(isValidDateString)) {
            return res.status(400).json({ detail: 'dates 需为非空的 YYYY-MM-DD 数组' });
        }
        const uniqueDates = [...new Set(dates)];
        const result = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'product-analysis', action: 'product_analysis_daily_batch_delete', objectType: 'ProductAnalysisDailyUpload', metadata: { shopId: shop.id, dates: uniqueDates } }, async (tx) => {
            const deleted = await tx.productAnalysisDailyUpload.deleteMany({
                where: { shopId: shop.id, date: { in: uniqueDates.map(parseDateUtc) } },
            });
            if (deleted.count === 0)
                throw new ProductAnalysisNotFoundError('Day not found');
            return deleted;
        });
        return res.json({ ok: true, deletedCount: result.count });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
// ---- 区间聚合 ----
router.get('/shops/:id/agg', async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const range = parseRange(req.query);
        if (!range)
            return res.status(400).json({ detail: `from/to 需为合法的 YYYY-MM-DD、from ≤ to 且跨度不超过 ${MAX_QUERY_RANGE_DAYS} 天` });
        const { uploads, rows } = await fetchRangeRows(shop.id, range.from, range.to);
        // 币种一致性：任一上传币种 ≠ 店铺币种即拒绝金额分析（含全部历史为单一外币的情况）
        const currencyError = currencyMismatchDetail(shop.currency, uploads);
        if (currencyError) {
            return res.status(409).json({ code: 'CURRENCY_MISMATCH', detail: currencyError });
        }
        const aggregated = (0, productAnalysisAggregation_1.aggregateItems)(rows);
        const bySheet = new Map();
        for (const item of aggregated) {
            const list = bySheet.get(item.sheetKey) ?? [];
            list.push(item);
            bySheet.set(item.sheetKey, list);
        }
        // 汇总卡口径：按与前端展示一致的「工作表」范围，对原始日行做订单×访客成对有效样本加权
        // （跨商品为有效订单总和÷对应访客总和；不能平均商品百分比，也不能用不完整的访客总量）
        const sheetKeyByItem = new Map(aggregated.map((item) => [item.itemId, item.sheetKey]));
        const rowsBySheet = new Map();
        for (const row of rows) {
            const key = sheetKeyByItem.get(row.itemId) ?? row.sheetKey;
            const list = rowsBySheet.get(key) ?? [];
            list.push(row);
            rowsBySheet.set(key, list);
        }
        const sheets = [...bySheet.entries()]
            .sort((a, b) => {
            const rank = (key) => SHEET_ORDER.indexOf(key);
            return (rank(a[0]) === -1 ? 99 : rank(a[0])) - (rank(b[0]) === -1 ? 99 : rank(b[0]));
        })
            .map(([sheetKey, items]) => ({
            sheetKey,
            items,
            summary: (0, productAnalysisAggregation_1.summarizeSheetEffective)(rowsBySheet.get(sheetKey) ?? []),
        }));
        // 混合币种只检测并报告（历史数据可能存在多币种），金额不做换算
        const uploadCurrencies = [...new Set(uploads.map((upload) => upload.currency))];
        return res.json({
            from: range.from,
            to: range.to,
            days: uploads.length,
            itemCount: aggregated.length,
            currency: shop.currency,
            uploadCurrencies,
            sheets,
        });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
/** 新商品分析筛选参数：数字或 'none'（不限）；缺省回退服务端默认阈值 */
function parsePotentialFilters(query) {
    const numberOrNull = (key) => {
        const raw = query[key];
        if (raw === undefined || raw === '')
            return undefined;
        if (raw === 'none')
            return null;
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
router.get('/shops/:id/potential', async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const range = parseRange(req.query);
        if (!range)
            return res.status(400).json({ detail: `from/to 需为合法的 YYYY-MM-DD、from ≤ to 且跨度不超过 ${MAX_QUERY_RANGE_DAYS} 天` });
        const filters = parsePotentialFilters(req.query);
        if (filters.limit !== undefined && filters.limit > MAX_POTENTIAL_LIMIT) {
            return res.status(400).json({ detail: `limit 不能超过 ${MAX_POTENTIAL_LIMIT}` });
        }
        // 数据根基：区间内出现在「新上架商品」sheet 的商品。
        // 入库时同商品多 sheet 只保留一行（按优先级归属，避免聚合重复累加），
        // 因此判定需同时看行的归属 sheetKey 与 extra.sheetKeys（商品当天出现过的全部工作表）。
        const inNewSheet = (row) => {
            if (row.sheetKey === 'new')
                return true;
            const sheetKeys = row.extra?.sheetKeys;
            return Array.isArray(sheetKeys) && sheetKeys.includes('new');
        };
        // 新品榜只需要 extra.sheetKeys 与求和列，不加载全量 variations（大字段，纯为详情页服务）
        const { rows } = await fetchRangeRows(shop.id, range.from, range.to, { includeExtra: true });
        const newItemIds = new Set(rows.filter(inNewSheet).map((row) => row.itemId));
        const byItem = new Map();
        for (const row of rows) {
            if (!newItemIds.has(row.itemId))
                continue;
            let candidate = byItem.get(row.itemId);
            if (!candidate) {
                candidate = {
                    itemId: row.itemId,
                    itemName: row.itemName,
                    sheetKey: row.sheetKey,
                    status: row.status ?? null,
                    latestDate: row.date,
                    daily: [],
                };
                byItem.set(row.itemId, candidate);
            }
            else if (row.date > candidate.latestDate) {
                // 名称 / 状态以区间内最新日期为准，不依赖数据库返回顺序（正常→封禁按封禁处理，反之按正常处理）
                candidate.itemName = row.itemName;
                candidate.sheetKey = row.sheetKey;
                candidate.status = row.status ?? null;
                candidate.latestDate = row.date;
            }
            candidate.daily.push({
                date: row.date,
                // null（缺失指标）原样透传：未知订单 ≠ 无订单，增长率按「有效订单观测」口径处理
                ordersOrdered: typeof row.ordersOrdered === 'number' ? row.ordersOrdered : null,
                visitors: typeof row.visitors === 'number' ? row.visitors : null,
                clicks: typeof row.clicks === 'number' ? row.clicks : null,
                impressions: typeof row.impressions === 'number' ? row.impressions : null,
                cartVisitors: typeof row.cartVisitors === 'number' ? row.cartVisitors : null,
            });
        }
        const items = (0, productAnalysisPotential_1.rankPotentialItems)([...byItem.values()], { ...filters, range });
        return res.json({ from: range.from, to: range.to, items });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.get('/shops/:id/items/:itemId', async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const range = parseRange(req.query);
        if (!range)
            return res.status(400).json({ detail: `from/to 需为合法的 YYYY-MM-DD、from ≤ to 且跨度不超过 ${MAX_QUERY_RANGE_DAYS} 天` });
        const itemId = String(req.params.itemId ?? '');
        if (!itemId)
            return res.status(400).json({ detail: 'Missing required field: itemId' });
        const { rows, uploads: detailUploads } = await fetchRangeRows(shop.id, range.from, range.to, {
            includeExtra: true,
            includeVariations: true,
            itemId,
        });
        const currencyError = currencyMismatchDetail(shop.currency, detailUploads);
        if (currencyError) {
            return res.status(409).json({ code: 'CURRENCY_MISMATCH', detail: currencyError });
        }
        if (rows.length === 0)
            return res.status(404).json({ detail: 'Item not found in this shop' });
        const detail = (0, productAnalysisAggregation_1.buildItemDetail)(rows);
        return res.json({
            from: range.from,
            to: range.to,
            currency: shop.currency,
            item: detail.item,
            series: detail.series,
            variations: detail.variations,
            extra: detail.extra,
        });
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
// ---- GLM AI 对话（店铺区间模式，默认近 7 天） ----
router.post('/chat', requireProductAnalysisPermission('product-analysis.aiChat'), async (req, res) => {
    try {
        const body = req.body;
        const shopId = typeof body?.shopId === 'string' ? body.shopId : '';
        if (!shopId) {
            return res.status(400).json({ detail: 'Missing required field: shopId' });
        }
        const history = sanitizeChatMessages(body?.messages);
        if (history.length === 0) {
            return res.status(400).json({ detail: 'Missing required field: messages' });
        }
        const shop = await findOwnedShop(shopId, req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const latest = await index_1.prisma.productAnalysisDailyUpload.findFirst({
            where: { shopId: shop.id },
            orderBy: { date: 'desc' },
            select: { date: true },
        });
        if (!latest) {
            return res.status(400).json({ detail: '该店铺还没有上传过数据' });
        }
        // 区间解析：调用方未提供 from/to 时默认以最新上传日为锚点的近 7 天（兼容路径）；
        // 一旦显式提供则严格校验（成对、真实日历日、from ≤ to、跨度 ≤ 366 天），不完整/非法返回 400 而非静默回退
        const rawFrom = body?.from;
        const rawTo = body?.to;
        let from;
        let to;
        if (rawFrom === undefined && rawTo === undefined) {
            to = dateString(latest.date);
            from = addDays(to, -6);
        }
        else {
            if (typeof rawFrom !== 'string' || typeof rawTo !== 'string' || !isValidDateString(rawFrom) || !isValidDateString(rawTo)) {
                return res.status(400).json({ detail: 'from/to 需成对提供且为真实存在的 YYYY-MM-DD 日期' });
            }
            from = rawFrom;
            to = rawTo;
            if (from > to) {
                return res.status(400).json({ detail: 'from 不能晚于 to' });
            }
            if (daysBetweenInclusive(from, to) > MAX_QUERY_RANGE_DAYS) {
                return res.status(400).json({ detail: `from/to 区间跨度不能超过 ${MAX_QUERY_RANGE_DAYS} 天` });
            }
        }
        const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : null;
        // 个人中心 AI 配置优先，未配置回退环境变量
        const chatConfig = await (0, aiUserConfig_1.resolveChatAiConfig)(req.user.id);
        let systemPrompt;
        let chatMode;
        let payload;
        // 与聚合/新品榜一致的有效样本口径说明，避免 AI 用总量互除重算比率或把缺失当零
        const sampleNote = '注：转化率/点击率/加购率等比率按「成对有效观测」计算（分子分母均有效的日期才计入）；' +
            '订单/访客等总量为有效观测求和；缺失日不计为 0，总量不得用于重算比率。';
        if (itemId) {
            const { uploads, rows } = await fetchRangeRows(shop.id, from, to, { includeExtra: true, includeVariations: true, itemId });
            // 币种一致性：异常时在调用模型供应商前拦截，不产生错误金额结论
            const currencyError = currencyMismatchDetail(shop.currency, uploads);
            if (currencyError) {
                return res.status(409).json({ code: 'CURRENCY_MISMATCH', detail: currencyError });
            }
            if (rows.length === 0) {
                return res.status(404).json({ detail: 'Item not found in this shop' });
            }
            const detail = (0, productAnalysisAggregation_1.buildItemDetail)(rows);
            const context = (0, prompts_1.serializeAggregatedItem)(detail.item, detail.series, detail.variations);
            chatMode = 'product_analysis_chat_item';
            payload = { shopId, itemId, from, to, history };
            systemPrompt = [
                (0, prompts_1.buildShopAnalysisSystemPrompt)({
                    shopName: shop.name,
                    site: shop.site,
                    currency: shop.currency,
                    from,
                    to,
                    days: uploads.length,
                    mode: 'item',
                }),
                '===== 分析数据 =====',
                sampleNote,
                context || '（该区间无可用数据）',
            ].join('\n\n');
        }
        else {
            const { uploads, rows } = await fetchRangeRows(shop.id, from, to);
            // 币种一致性：异常时在调用模型供应商前拦截，不产生错误金额结论
            const currencyError = currencyMismatchDetail(shop.currency, uploads);
            if (currencyError) {
                return res.status(409).json({ code: 'CURRENCY_MISMATCH', detail: currencyError });
            }
            const aggregated = (0, productAnalysisAggregation_1.aggregateItems)(rows);
            const bySheet = new Map();
            for (const item of aggregated) {
                const list = bySheet.get(item.sheetKey) ?? [];
                list.push(item);
                bySheet.set(item.sheetKey, list);
            }
            const context = (0, prompts_1.serializeAggregatedOverview)([...bySheet.entries()].map(([sheetKey, items]) => ({
                sheetKey,
                items: items,
            })));
            chatMode = 'product_analysis_chat_overview';
            payload = { shopId, from, to, history };
            systemPrompt = [
                (0, prompts_1.buildShopAnalysisSystemPrompt)({
                    shopName: shop.name,
                    site: shop.site,
                    currency: shop.currency,
                    from,
                    to,
                    days: uploads.length,
                    mode: 'overview',
                }),
                '===== 分析数据 =====',
                sampleNote,
                context || '（该区间无可用数据）',
            ].join('\n\n');
        }
        const chatMessages = [{ role: 'system', content: systemPrompt }, ...history];
        const aiCallInput = {
            userId: req.user.id,
            actorName: req.user.username,
            requestKey: body.requestKey,
            operationId: body.operationId,
            kind: 'analysis',
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
            const send = (data) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };
            // 推理模型思考期可能数十秒无正文：期间定时发 SSE 注释心跳，防止代理空闲断连
            let sawProviderData = false;
            const heartbeat = setInterval(() => {
                if (!sawProviderData)
                    res.write(': keep-alive\n\n');
            }, 5_000);
            try {
                let emitted = false;
                const { result } = await (0, aiUsage_1.runAiCall)(aiCallInput, () => (0, glmClient_1.glmChatStream)(chatMessages, { config: chatConfig, fastMode: body.deepThinking === false }, (delta) => {
                    sawProviderData = true;
                    emitted = true;
                    send({ delta });
                }, (reasoning) => {
                    sawProviderData = true;
                    send({ reasoning });
                }));
                // 幂等重放（或供应商未产生增量）时把完整内容一次性补发
                if (!emitted && typeof result?.content === 'string' && result.content) {
                    send({ delta: result.content });
                }
                send({ done: true, model: typeof result?.model === 'string' ? result.model : chatConfig.model });
            }
            catch (error) {
                const detail = error instanceof config_1.ApiError || error instanceof glmConfig_1.GlmApiError ? error.detail : 'AI 调用失败';
                send({ error: detail });
            }
            finally {
                clearInterval(heartbeat);
                res.end();
            }
            return;
        }
        const { result } = await (0, aiUsage_1.runAiCall)(aiCallInput, () => (0, glmClient_1.glmChat)(chatMessages, { config: chatConfig }));
        return res.json(result);
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
exports.default = router;
