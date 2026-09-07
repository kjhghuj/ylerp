"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const glmConfig_1 = require("../services/glm/glmConfig");
const glmClient_1 = require("../services/glm/glmClient");
const prompts_1 = require("../services/glm/prompts");
const activityLogger_1 = require("../services/activityLogger");
const usageEvents_1 = require("../services/usageEvents");
const productAnalysisAggregation_1 = require("../services/productAnalysisAggregation");
const productAnalysisPotential_1 = require("../services/productAnalysisPotential");
const router = (0, express_1.Router)();
const MAX_UPLOAD_JSON_LENGTH = 20 * 1024 * 1024; // 20MB
const MAX_CHAT_HISTORY_MESSAGES = 8;
const SITES = ['PH', 'MY', 'SG', 'ID', 'TH'];
const SITE_CURRENCY = { PH: 'PHP', MY: 'MYR', SG: 'SGD', ID: 'IDR', TH: 'THB' };
const SHEET_ORDER = ['hot', 'new', 'uncompetitive', 'competitive'];
function errorResponse(error, res) {
    if (error instanceof glmConfig_1.GlmApiError) {
        res.status(error.status_code).json({ detail: error.detail });
    }
    else {
        res.status(500).json({ detail: String(error) });
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isValidDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}
function parseDateUtc(date) {
    return new Date(`${date}T00:00:00.000Z`);
}
function dateString(date) {
    return date.toISOString().slice(0, 10);
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
/** 校验区间参数并归一化（from ≤ to），默认区间由调用方决定 */
function parseRange(query) {
    const from = query.from;
    const to = query.to;
    if (!isValidDateString(from) || !isValidDateString(to))
        return null;
    if (from > to)
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
/** 拉取区间内的日行（includeDetailFields 时附带 extra/variations） */
async function fetchRangeRows(shopId, from, to, options = {}) {
    const uploads = await index_1.prisma.productAnalysisDailyUpload.findMany({
        where: { shopId, date: { gte: parseDateUtc(from), lte: parseDateUtc(to) } },
        select: { id: true, date: true },
        orderBy: { date: 'asc' },
    });
    if (uploads.length === 0)
        return { uploads, rows: [] };
    const select = {
        ...ITEM_SELECT_BASE,
        ...Object.fromEntries(productAnalysisAggregation_1.SUMMABLE_FIELDS.map((field) => [field, true])),
    };
    if (options.includeDetailFields) {
        select.extra = true;
        select.variations = true;
    }
    const where = { uploadId: { in: uploads.map((upload) => upload.id) } };
    if (options.itemId)
        where.itemId = options.itemId;
    // 动态 select 使 prisma 类型退化为 never，转松类型后按 DailyItemRow 消费
    const rawRows = (await index_1.prisma.productDailyItem.findMany({ where, select }));
    const rows = rawRows.map((raw) => ({ ...raw, date: dateString(raw.upload.date) }));
    return { uploads, rows };
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
            const shop = await index_1.prisma.productAnalysisShop.create({
                data: {
                    name,
                    site,
                    currency: SITE_CURRENCY[site] ?? 'MYR',
                    userId: req.user.id,
                },
                select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
            });
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
            data.site = site;
            data.currency = SITE_CURRENCY[site] ?? 'MYR';
        }
        try {
            const updated = await index_1.prisma.productAnalysisShop.update({
                where: { id: shop.id },
                data,
                select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
            });
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
        const result = await index_1.prisma.productAnalysisShop.deleteMany({
            where: { id: String(req.params.id ?? ''), userId: req.user.id },
        });
        if (result.count === 0)
            return res.status(404).json({ detail: 'Shop not found' });
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
        const rows = (0, productAnalysisAggregation_1.mapParsedSheetItemsToDailyRows)(payload.sheets);
        if (rows.length === 0) {
            return res.status(400).json({ detail: 'Report contains no product items' });
        }
        const currency = typeof payload.currency === 'string' && payload.currency ? payload.currency : shop.currency;
        const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
        const uploadDate = parseDateUtc(date);
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
        const result = await index_1.prisma.productAnalysisDailyUpload.deleteMany({
            where: { shopId: shop.id, date: parseDateUtc(date) },
        });
        if (result.count === 0)
            return res.status(404).json({ detail: 'Day not found' });
        return res.json({ ok: true });
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
            return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
        const { uploads, rows } = await fetchRangeRows(shop.id, range.from, range.to);
        const aggregated = (0, productAnalysisAggregation_1.aggregateItems)(rows);
        const bySheet = new Map();
        for (const item of aggregated) {
            const list = bySheet.get(item.sheetKey) ?? [];
            list.push(item);
            bySheet.set(item.sheetKey, list);
        }
        const sheets = [...bySheet.entries()]
            .sort((a, b) => {
            const rank = (key) => SHEET_ORDER.indexOf(key);
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
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
router.get('/shops/:id/potential', async (req, res) => {
    try {
        const shop = await findOwnedShop(String(req.params.id ?? ''), req.user.id);
        if (!shop)
            return res.status(404).json({ detail: 'Shop not found' });
        const range = parseRange(req.query);
        if (!range)
            return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
        const { rows } = await fetchRangeRows(shop.id, range.from, range.to);
        const byItem = new Map();
        for (const row of rows) {
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
        const items = (0, productAnalysisPotential_1.rankPotentialItems)([...byItem.values()]);
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
            return res.status(400).json({ detail: 'from/to 需为合法的 YYYY-MM-DD 且 from ≤ to' });
        const itemId = String(req.params.itemId ?? '');
        if (!itemId)
            return res.status(400).json({ detail: 'Missing required field: itemId' });
        const { rows } = await fetchRangeRows(shop.id, range.from, range.to, {
            includeDetailFields: true,
            itemId,
        });
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
        // 默认区间：以最新上传日为锚点的近 7 天
        const to = isValidDateString(body?.to) ? body.to : dateString(latest.date);
        const from = isValidDateString(body?.from) ? body.from : addDays(to, -6);
        if (from > to) {
            return res.status(400).json({ detail: 'from 不能晚于 to' });
        }
        const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : null;
        let context;
        let mode;
        if (itemId) {
            const { uploads, rows } = await fetchRangeRows(shop.id, from, to, { includeDetailFields: true, itemId });
            if (rows.length === 0) {
                return res.status(404).json({ detail: 'Item not found in this shop' });
            }
            const detail = (0, productAnalysisAggregation_1.buildItemDetail)(rows);
            context = (0, prompts_1.serializeAggregatedItem)(detail.item, detail.series, detail.variations);
            mode = 'item';
            const systemPrompt = [
                (0, prompts_1.buildShopAnalysisSystemPrompt)({
                    shopName: shop.name,
                    site: shop.site,
                    currency: shop.currency,
                    from,
                    to,
                    days: uploads.length,
                    mode,
                }),
                '===== 分析数据 =====',
                context || '（该区间无可用数据）',
            ].join('\n\n');
            const result = await (0, glmClient_1.glmChat)([{ role: 'system', content: systemPrompt }, ...history]);
            await (0, activityLogger_1.logActivity)(req.user.id, 'product_analysis_chat', 'product-analysis', {
                shopId,
                itemId,
                mode,
                from,
                to,
            });
            return res.json(result);
        }
        const { uploads, rows } = await fetchRangeRows(shop.id, from, to);
        const aggregated = (0, productAnalysisAggregation_1.aggregateItems)(rows);
        const bySheet = new Map();
        for (const item of aggregated) {
            const list = bySheet.get(item.sheetKey) ?? [];
            list.push(item);
            bySheet.set(item.sheetKey, list);
        }
        context = (0, prompts_1.serializeAggregatedOverview)([...bySheet.entries()].map(([sheetKey, items]) => ({
            sheetKey,
            items: items,
        })));
        mode = 'overview';
        const systemPrompt = [
            (0, prompts_1.buildShopAnalysisSystemPrompt)({
                shopName: shop.name,
                site: shop.site,
                currency: shop.currency,
                from,
                to,
                days: uploads.length,
                mode,
            }),
            '===== 分析数据 =====',
            context || '（该区间无可用数据）',
        ].join('\n\n');
        const result = await (0, glmClient_1.glmChat)([{ role: 'system', content: systemPrompt }, ...history]);
        await (0, activityLogger_1.logActivity)(req.user.id, 'product_analysis_chat', 'product-analysis', {
            shopId,
            mode,
            from,
            to,
        });
        return res.json(result);
    }
    catch (error) {
        return errorResponse(error, res);
    }
});
exports.default = router;
