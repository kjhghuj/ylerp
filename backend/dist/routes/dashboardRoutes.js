"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardRouter = void 0;
const express_1 = require("express");
const index_1 = require("../index");
const dashboardSnapshotLoader_1 = require("../services/dashboardSnapshotLoader");
const dashboardWarehouseService_1 = require("../services/dashboardWarehouseService");
const ycOpenPlatformClient_1 = require("../services/ycOpenPlatformClient");
const hasPermission = (permissions, permission) => (permissions.includes('*')
    || permissions.includes('dashboard')
    || permissions.includes(permission));
const requireDashboardPermission = (permission) => (async (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'owner')
        return next();
    try {
        const user = await index_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { permissions: true, isActive: true },
        });
        if (!user?.isActive || !hasPermission(user.permissions || [], permission)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        return next();
    }
    catch {
        return res.status(500).json({ error: 'Permission check failed' });
    }
});
const parsePositiveInteger = (value, fallback, maximum) => {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        return Number.NaN;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : Number.NaN;
};
const createDashboardRouter = (options = {}) => {
    const router = (0, express_1.Router)();
    const defaultLoaders = new Map();
    const getLoader = async (userId) => {
        if (options.loader)
            return options.loader;
        const ycClient = options.ycClientFactory
            ? await options.ycClientFactory(userId)
            : await (0, ycOpenPlatformClient_1.createUserYcOpenPlatformClient)(index_1.prisma, userId);
        const loaderKey = `${userId}:${ycClient.cacheScope || 'default'}`;
        const cachedLoader = defaultLoaders.get(loaderKey);
        if (cachedLoader)
            return cachedLoader;
        const loader = (0, dashboardSnapshotLoader_1.createDashboardSnapshotLoader)({
            db: index_1.prisma,
            cache: index_1.safeRedis,
            ycClient,
        });
        defaultLoaders.set(loaderKey, loader);
        return loader;
    };
    router.get('/summary', requireDashboardPermission('dashboard.alerts'), async (req, res) => {
        try {
            const snapshot = await (await getLoader(req.user.id)).load(req.user.id);
            return res.json({
                generatedAt: snapshot.generatedAt,
                sites: snapshot.sites,
                restock: snapshot.summary.restock,
                slowMoving: snapshot.summary.slowMoving,
                warnings: snapshot.warnings,
            });
        }
        catch (error) {
            if (error instanceof dashboardSnapshotLoader_1.DashboardDataUnavailableError) {
                return res.status(503).json({ error: 'Warehouse monitoring data is unavailable' });
            }
            return res.status(500).json({ error: 'Failed to load dashboard summary' });
        }
    });
    router.get('/warehouse-monitor', requireDashboardPermission('dashboard.inventoryTable'), async (req, res) => {
        const kind = req.query.kind;
        if (kind !== 'aging' && kind !== 'restock') {
            return res.status(400).json({ error: 'Invalid monitor kind' });
        }
        const site = typeof req.query.site === 'string' ? req.query.site.trim().toUpperCase() : 'ALL';
        const page = parsePositiveInteger(req.query.page, 1, 100_000);
        const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
        if (!site || !Number.isFinite(page) || !Number.isFinite(pageSize)) {
            return res.status(400).json({ error: 'Invalid query parameters' });
        }
        try {
            const snapshot = await (await getLoader(req.user.id)).load(req.user.id);
            if (site !== 'ALL' && !snapshot.sites.some(entry => entry.code === site)) {
                return res.status(400).json({ error: 'Invalid site' });
            }
            const rows = kind === 'aging' ? snapshot.agingRows : snapshot.restockRows;
            const filtered = site === 'ALL' ? rows : rows.filter(row => row.site === site);
            return res.json({
                kind,
                site,
                sites: snapshot.sites,
                ...(0, dashboardWarehouseService_1.paginateDashboardRows)(filtered, {
                    kind,
                    sortBy: typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined,
                    sortDir: typeof req.query.sortDir === 'string' ? req.query.sortDir : undefined,
                    page,
                    pageSize,
                }),
                warnings: snapshot.warnings,
                generatedAt: snapshot.generatedAt,
            });
        }
        catch (error) {
            if (error instanceof dashboardSnapshotLoader_1.DashboardDataUnavailableError) {
                return res.status(503).json({ error: 'Warehouse monitoring data is unavailable' });
            }
            return res.status(500).json({ error: 'Failed to load warehouse monitor' });
        }
    });
    return router;
};
exports.createDashboardRouter = createDashboardRouter;
exports.default = (0, exports.createDashboardRouter)();
