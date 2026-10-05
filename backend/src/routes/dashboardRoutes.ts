import { Router } from 'express';
import { createPermissionGuard } from '../middleware/requestPermissions';
import { parseQueryInteger } from '../utils/queryParams';
import { prisma, safeRedis } from '../infrastructure/runtimeResources';
import {
  createDashboardSnapshotLoader,
  DashboardDataUnavailableError,
  type DashboardSnapshotLoader,
} from '../services/dashboardSnapshotLoader';
import { paginateDashboardRows } from '../services/dashboardWarehouseService';
import {
  createUserYcOpenPlatformClient,
  type YcOpenPlatformClient,
} from '../services/ycOpenPlatformClient';

interface CreateDashboardRouterOptions {
  loader?: DashboardSnapshotLoader;
  ycClientFactory?: (userId: string) => Promise<YcOpenPlatformClient>;
}

const requireDashboardPermission = (permission: 'dashboard.alerts' | 'dashboard.inventoryTable') => (
  createPermissionGuard(() => prisma, [permission])
);

export const createDashboardRouter = (options: CreateDashboardRouterOptions = {}) => {
  const router = Router();
  const defaultLoaders = new Map<string, DashboardSnapshotLoader>();
  const getLoader = async (userId: string) => {
    if (options.loader) return options.loader;
    const ycClient = options.ycClientFactory
      ? await options.ycClientFactory(userId)
      : await createUserYcOpenPlatformClient(prisma, userId);
    const loaderKey = `${userId}:${ycClient.cacheScope || 'default'}`;
    const cachedLoader = defaultLoaders.get(loaderKey);
    if (cachedLoader) return cachedLoader;
    const loader = createDashboardSnapshotLoader({
      db: prisma,
      cache: safeRedis,
      ycClient,
    });
    defaultLoaders.set(loaderKey, loader);
    return loader;
  };

  router.get('/summary', requireDashboardPermission('dashboard.alerts'), async (req, res) => {
    try {
      const snapshot = await (await getLoader(req.user!.id)).load(req.user!.id);
      return res.json({
        generatedAt: snapshot.generatedAt,
        sites: snapshot.sites,
        restock: snapshot.summary.restock,
        slowMoving: snapshot.summary.slowMoving,
        warnings: snapshot.warnings,
      });
    } catch (error) {
      if (error instanceof DashboardDataUnavailableError) {
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
    const page = parseQueryInteger(req.query.page, 1, 1, 100_000);
    const pageSize = parseQueryInteger(req.query.pageSize, 20, 1, 100);
    if (!site || page === null || pageSize === null) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    try {
      const snapshot = await (await getLoader(req.user!.id)).load(req.user!.id);
      if (site !== 'ALL' && !snapshot.sites.some(entry => entry.code === site)) {
        return res.status(400).json({ error: 'Invalid site' });
      }
      const rows = kind === 'aging' ? snapshot.agingRows : snapshot.restockRows;
      const filtered = site === 'ALL' ? rows : rows.filter(row => row.site === site);
      return res.json({
        kind,
        site,
        sites: snapshot.sites,
        ...paginateDashboardRows(filtered, {
          kind,
          sortBy: typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined,
          sortDir: typeof req.query.sortDir === 'string' ? req.query.sortDir : undefined,
          page,
          pageSize,
        }),
        warnings: snapshot.warnings,
        generatedAt: snapshot.generatedAt,
      });
    } catch (error) {
      if (error instanceof DashboardDataUnavailableError) {
        return res.status(503).json({ error: 'Warehouse monitoring data is unavailable' });
      }
      return res.status(500).json({ error: 'Failed to load warehouse monitor' });
    }
  });

  return router;
};

export default createDashboardRouter();
