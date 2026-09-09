import { Request, Response } from 'express';
import type { YcOpenPlatformClient } from '../../services/ycOpenPlatformClient';

jest.mock('../../index', () => ({
  prisma: {
    usageEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
    productAnalysisShop: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    productAnalysisDailyUpload: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    productDailyItem: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    inventoryItem: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    warehouseMapping: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    externalSkuMapping: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    restockSkuRule: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
  safeRedis: {
    del: jest.fn(),
  },
}));

import { createRestockV3Router } from '../restockV3Routes';
import { prisma, safeRedis } from '../../index';

const mockShopFindFirst = prisma.productAnalysisShop.findFirst as jest.Mock;
const mockShopFindMany = prisma.productAnalysisShop.findMany as jest.Mock;
const mockUploadFindMany = prisma.productAnalysisDailyUpload.findMany as jest.Mock;
const mockUploadGroupBy = prisma.productAnalysisDailyUpload.groupBy as jest.Mock;
const mockItemFindMany = prisma.productDailyItem.findMany as jest.Mock;
const mockProductFindMany = prisma.product.findMany as jest.Mock;
const mockInventoryFindMany = prisma.inventoryItem.findMany as jest.Mock;
const mockInventoryCreate = prisma.inventoryItem.create as jest.Mock;
const mockWarehouseMappingFindMany = prisma.warehouseMapping.findMany as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockExternalMappingFindMany = prisma.externalSkuMapping.findMany as jest.Mock;
const mockExternalMappingUpsert = prisma.externalSkuMapping.upsert as jest.Mock;
const mockRestockSkuRuleFindMany = prisma.restockSkuRule.findMany as jest.Mock;
const mockRestockSkuRuleUpsert = prisma.restockSkuRule.upsert as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;
const mockSafeRedisDel = safeRedis.del as jest.Mock;

function getRouteHandlers(router: ReturnType<typeof createRestockV3Router>, path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method} ${path}`);
  return layer.route.stack.map((entry: any) => entry.handle);
}

function getHandler(router: ReturnType<typeof createRestockV3Router>, path: string, method: string = 'get') {
  const handlers = getRouteHandlers(router, path, method);
  return handlers[handlers.length - 1];
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function makeYcClient(overrides: Partial<Record<'isConfigured' | 'listCustomerWarehouses' | 'listProductInventory' | 'listInboundOrders', () => any>> = {}) {
  return {
    isConfigured: overrides.isConfigured ?? (() => true),
    listCustomerWarehouses: overrides.listCustomerWarehouses
      ?? (() => Promise.resolve([{ code: 'WH-MY', siteCode: 'MY', name: 'MY 仓' }])),
    listProductInventory: overrides.listProductInventory
      ?? (() => Promise.resolve([
        { warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', customerSkuName: 'A', available: 10, inventory: 10, occupy: 0, unshipped: 0 },
      ])),
    listInboundOrders: overrides.listInboundOrders ?? (() => Promise.resolve([])),
  } as unknown as YcOpenPlatformClient;
}

const SHOP = {
  id: 'shop-1',
  name: '马来3C店',
  site: 'MY',
  platform: 'shopee',
  currency: 'MYR',
  userId: 'u1',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const INVENTORY_LOCAL_A = {
  id: 'inv-1',
  name: 'A 本地',
  sku: 'LOCAL-A',
  currentStock: 0,
  stockOfficial: 0,
  stockThirdParty: 0,
  inTransit: 0,
  dailySales: 0,
  leadTime: 25,
  replenishCycle: 30,
  costPerUnit: 2.5,
  userId: 'u1',
};

/** 两天上传：SKU-A 合计 7 件（3+4），SKU-B 合计 2 件 */
const UPLOADS = [
  { id: 'up-1', date: new Date('2026-09-01T00:00:00Z') },
  { id: 'up-2', date: new Date('2026-09-02T00:00:00Z') },
];
const DAILY_ITEMS = [
  {
    uploadId: 'up-1', itemId: '1001', itemName: '键盘', unitsOrdered: 5,
    variations: [
      { variationSku: 'SKU-A', variationName: '黑色', unitsOrdered: 3 },
      { variationSku: 'SKU-B', variationName: '白色', unitsOrdered: 2 },
    ],
  },
  {
    uploadId: 'up-2', itemId: '1001', itemName: '键盘', unitsOrdered: 4,
    variations: [{ variationSku: 'SKU-A', variationName: '黑色', unitsOrdered: 4 }],
  },
];

function seedSalesData() {
  mockShopFindFirst.mockResolvedValue(SHOP);
  mockUploadFindMany.mockResolvedValue(UPLOADS);
  mockItemFindMany.mockResolvedValue(DAILY_ITEMS);
  mockExternalMappingFindMany.mockResolvedValue([
    { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
  ]);
  mockInventoryFindMany.mockResolvedValue([{ sku: 'LOCAL-A' }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation((callback: any) => callback(prisma));
  mockSafeRedisDel.mockResolvedValue(undefined as never);
});

describe('GET /shops', () => {
  it('returns product analysis shops with day count and latest upload date', async () => {
    mockShopFindMany.mockResolvedValue([{ ...SHOP }]);
    mockUploadGroupBy.mockResolvedValue([
      { shopId: 'shop-1', _count: { _all: 9 }, _max: { date: new Date('2026-09-06T00:00:00Z') } },
    ]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops')(
      { user: { id: 'u1', role: 'owner' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'shop-1', site: 'MY', dayCount: 9, latestUploadDate: '2026-09-06' }),
    ]);
  });
});

describe('GET /shops/:id/sales', () => {
  it('aggregates variation units, applies stored mapping and exact-self fallback, reports pending', async () => {
    seedSalesData();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops/:id/sales')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.shop.site).toBe('MY');
    expect(payload.shopObservedDays).toBe(2);
    expect(payload.pendingCount).toBe(1);
    const skuA = payload.rows.find((r: any) => r.externalSku === 'SKU-A');
    expect(skuA.units).toBe(7);
    expect(skuA.observedDays).toBe(2);
    expect(skuA.targetSku).toBe('LOCAL-A');
    expect(skuA.mappingStatus).toBe('mapped');
    const skuB = payload.rows.find((r: any) => r.externalSku === 'SKU-B');
    expect(skuB.units).toBe(2);
    expect(skuB.targetSku).toBeNull();
    expect(skuB.mappingStatus).toBe('pending');
  });

  it('treats an external SKU that itself is an owned inventory SKU as mapped without persisting', async () => {
    seedSalesData();
    mockExternalMappingFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'SKU-B' }]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops/:id/sales')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.pendingCount).toBe(1); // 仅 SKU-A 待映射
    expect(mockExternalMappingUpsert).not.toHaveBeenCalled();
  });

  it('rejects when the range has no uploads', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindMany.mockResolvedValue([]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops/:id/sales')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'shop-1' }, query: { from: '2026-08-01', to: '2026-08-02' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for another user shop', async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops/:id/sales')(
      { user: { id: 'u2', role: 'owner' }, params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PUT /mapping', () => {
  it('persists mapping with the shop site and back-fills inventory for product-only targets', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'OTHER' }]);
    mockProductFindMany.mockResolvedValue([{ sku: 'PROD-X', name: 'X 商品', cost: 5 }]);
    mockInventoryCreate.mockResolvedValue({ id: 'inv-new' });
    mockExternalMappingUpsert.mockResolvedValue({});
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', targetSku: 'PROD-X' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockInventoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sku: 'PROD-X', name: 'X 商品' }),
    }));
    expect(mockExternalMappingUpsert).toHaveBeenCalledWith({
      where: { userId_site_externalSku: { userId: 'u1', site: 'MY', externalSku: 'SKU-B' } },
      create: { userId: 'u1', site: 'MY', externalSku: 'SKU-B', targetSku: 'PROD-X' },
      update: { targetSku: 'PROD-X' },
    });
    expect(res.json).toHaveBeenCalledWith({ externalSku: 'SKU-B', targetSku: 'PROD-X', site: 'MY' });
  });

  it('rejects unknown target SKU with 400', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'OTHER' }]);
    mockProductFindMany.mockResolvedValue([]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', targetSku: 'NOPE' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /recommendations', () => {
  const BASE_BODY = {
    shopId: 'shop-1',
    from: '2026-09-01',
    to: '2026-09-02',
    planningDate: '2026-09-09',
    targetDate: '2026-12-08',
    leadTimeDays: 25,
    safetyDays: 30,
    growthPercent: 0,
  };

  function seedRecommendations(overrides: { rules?: any[]; mappings?: any[] } = {}) {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindMany.mockResolvedValue(UPLOADS);
    mockItemFindMany.mockResolvedValue(DAILY_ITEMS);
    mockExternalMappingFindMany.mockResolvedValue(overrides.mappings ?? [
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
    ]);
    // resolveSalesMappings（select sku）与主查询（全量）各一次
    mockInventoryFindMany
      .mockResolvedValueOnce([{ sku: 'LOCAL-A' }])
      .mockResolvedValue([INVENTORY_LOCAL_A]);
    mockProductFindMany.mockResolvedValue([{ id: 'prod-1', sku: 'LOCAL-A', name: 'A 商品', cost: 2.5, sites: ['MY'], country: 'MY' }]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockRestockSkuRuleFindMany.mockResolvedValue(overrides.rules ?? []);
  }

  it('builds a plan with dailySales = units / observed upload days', async () => {
    seedRecommendations();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.metadata).toEqual(expect.objectContaining({
      shopId: 'shop-1',
      statisticsDays: 2,
      observedDays: 2,
      pendingCount: 1,
    }));
    expect(payload.integration).toEqual(expect.objectContaining({
      ycConfigured: true,
      warehouseCodes: ['WH-MY'],
      stockSource: 'yc',
    }));
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item).toBeDefined();
    expect(item.dailySales).toBe(3.5); // 7 件 / 2 天
    // arrivalStock = max(0, 10 - 3.5*25) = 0；coverage 65 天 + safety 30 天
    expect(item.suggestedQty).toBe(Math.ceil(3.5 * 65 + 3.5 * 30));
    expect(item.availableStock).toBe(10);
  });

  it('honours explicit statisticsDays override', async () => {
    seedRecommendations();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, statisticsDays: 7 } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.metadata.statisticsDays).toBe(7);
    expect(payload.metadata.statisticsDaysOverridden).toBe(true);
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item.dailySales).toBeCloseTo(1, 5); // 7 件 / 7 天
  });

  it('applies SKU rules saved for the shop site', async () => {
    seedRecommendations({ rules: [{ userId: 'u1', site: 'MY', sku: 'LOCAL-A', leadTimeDays: 10, safetyDays: null, growthPercent: null }] });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    const item = res.json.mock.calls[0][0].items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item.leadTimeDays).toBe(10);
    expect(item.arrivalDate).toBe('2026-09-19');
  });

  it('returns 503 when YC credentials are not configured', async () => {
    seedRecommendations();
    const router = createRestockV3Router({ ycClient: makeYcClient({ isConfigured: () => false }) });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 400 for invalid parameters', async () => {
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, targetDate: '2026-09-10' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('excludes oversized SKUs beyond the YC query limit', async () => {
    const longSku = 'L'.repeat(51);
    seedRecommendations();
    mockInventoryFindMany.mockReset();
    mockInventoryFindMany
      .mockResolvedValueOnce([{ sku: longSku }])
      .mockResolvedValue([{ ...INVENTORY_LOCAL_A, sku: longSku }]);
    mockProductFindMany.mockResolvedValue([]);
    mockExternalMappingFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: longSku },
    ]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.metadata.excludedOversizedSkus).toEqual([longSku]);
    expect(payload.items).toHaveLength(0);
  });
});

describe('permissions', () => {
  it('denies non-owner without restock-v3 permission', async () => {
    mockUserFindUnique.mockResolvedValue({ isActive: true, permissions: ['restock-v2.view'] });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const [permissionHandler] = getRouteHandlers(router, '/shops');
    const res = makeRes();
    const next = jest.fn();
    await permissionHandler({ user: { id: 'u1', role: 'user' } } as unknown as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows module-level restock-v3 permission for view endpoints', async () => {
    mockUserFindUnique.mockResolvedValue({ isActive: true, permissions: ['restock-v3'] });
    mockShopFindMany.mockResolvedValue([]);
    mockUploadGroupBy.mockResolvedValue([]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/shops')(
      { user: { id: 'u1', role: 'user' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('denies view-only permission on refresh endpoints', async () => {
    mockUserFindUnique.mockResolvedValue({ isActive: true, permissions: ['restock-v3.view'] });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const [permissionHandler] = getRouteHandlers(router, '/mapping', 'put');
    const res = makeRes();
    const next = jest.fn();
    await permissionHandler({ user: { id: 'u1', role: 'user' }, body: {} } as unknown as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('GET/PUT /sku-rules', () => {
  it('lists rules for the shop site', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockRestockSkuRuleFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', sku: 'LOCAL-A', leadTimeDays: 10, safetyDays: null, growthPercent: null },
    ]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/sku-rules')(
      { user: { id: 'u1', role: 'owner' }, query: { shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.json).toHaveBeenCalledWith({
      site: 'MY',
      rules: [expect.objectContaining({ sku: 'LOCAL-A', leadTimeDays: 10 })],
    });
  });

  it('upserts a rule scoped to the shop site', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'LOCAL-A' }]);
    mockRestockSkuRuleUpsert.mockResolvedValue({ sku: 'LOCAL-A', leadTimeDays: 12 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/sku-rules/:sku', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        params: { sku: 'LOCAL-A' },
        body: { shopId: 'shop-1', leadTimeDays: 12 },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockRestockSkuRuleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_site_sku: { userId: 'u1', site: 'MY', sku: 'LOCAL-A' } },
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ leadTimeDays: 12 }));
  });
});
