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
      deleteMany: jest.fn(),
    },
    restockSkuRule: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    restockShopSkuMapping: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    restockShopRule: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    restockStockPool: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    restockComputeResult: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    restockPlanSnapshot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
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
const mockShopMappingFindMany = prisma.restockShopSkuMapping.findMany as jest.Mock;
const mockShopMappingUpsert = prisma.restockShopSkuMapping.upsert as jest.Mock;
const mockRestockSkuRuleFindMany = prisma.restockSkuRule.findMany as jest.Mock;
const mockRestockSkuRuleUpsert = prisma.restockSkuRule.upsert as jest.Mock;
const mockShopRuleFindMany = prisma.restockShopRule.findMany as jest.Mock;
const mockShopRuleUpsert = prisma.restockShopRule.upsert as jest.Mock;
const mockPoolFindFirst = prisma.restockStockPool.findFirst as jest.Mock;
const mockPlanFindFirst = prisma.restockPlanSnapshot.findFirst as jest.Mock;
const mockPlanFindMany = prisma.restockPlanSnapshot.findMany as jest.Mock;
const mockPlanCreate = prisma.restockPlanSnapshot.create as jest.Mock;
const mockPlanUpdateMany = prisma.restockPlanSnapshot.updateMany as jest.Mock;
const mockPlanFindUnique = prisma.restockPlanSnapshot.findUnique as jest.Mock;
const mockPlanCount = prisma.restockPlanSnapshot.count as jest.Mock;
const mockResultFindFirst = prisma.restockComputeResult.findFirst as jest.Mock;
const mockResultCreate = prisma.restockComputeResult.create as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;
const mockSafeRedisDel = safeRedis.del as jest.Mock;

function getRouteHandlers(router: ReturnType<typeof createRestockV3Router>, path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
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
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock; send: jest.Mock };
}

function makeYcClient(overrides: Partial<Record<'isConfigured' | 'listCustomerWarehouses' | 'listProducts' | 'listProductInventory' | 'listInboundOrders', () => any>> = {}) {
  return {
    isConfigured: overrides.isConfigured ?? (() => true),
    listCustomerWarehouses: overrides.listCustomerWarehouses
      ?? (() => Promise.resolve([{ code: 'WH-MY', siteCode: 'MY', name: 'MY 仓' }])),
    listProducts: overrides.listProducts
      ?? (() => Promise.resolve([
        { customerSku: 'LOCAL-A', customerSkuName: 'A 货品' },
      ])),
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

/** 两天上传：SKU-A 合计 7 件（3+4），SKU-B 合计 2 件；聚合键取规格货号（modelCode） */
const UPLOADS = [
  { id: 'up-1', date: new Date('2026-09-01T00:00:00Z') },
  { id: 'up-2', date: new Date('2026-09-02T00:00:00Z') },
];
const DAILY_ITEMS = [
  {
    uploadId: 'up-1', itemId: '1001', itemName: '键盘', unitsOrdered: 5,
    variations: [
      { variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑色', unitsOrdered: 3 },
      { variationSku: 'SYS-B1', modelCode: 'SKU-B', variationName: '白色', unitsOrdered: 2 },
    ],
  },
  {
    uploadId: 'up-2', itemId: '1001', itemName: '键盘', unitsOrdered: 4,
    variations: [{ variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑色', unitsOrdered: 4 }],
  },
];

function seedSalesData() {
  mockShopFindFirst.mockResolvedValue(SHOP);
  mockUploadFindMany.mockResolvedValue(UPLOADS);
  mockItemFindMany.mockResolvedValue(DAILY_ITEMS);
  mockExternalMappingFindMany.mockResolvedValue([
    { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
  ]);
  mockShopMappingFindMany.mockResolvedValue([]);
  mockInventoryFindMany.mockResolvedValue([{ sku: 'LOCAL-A' }]);
  mockProductFindMany.mockResolvedValue([]);
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
    expect(skuA.matchType).toBe('site-mapping');
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
  it('defaults to shop-scoped mapping persisted per shop (legacy 身份)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'OTHER' }]);
    mockProductFindMany.mockResolvedValue([{ sku: 'PROD-X', name: 'X 商品', cost: 5 }]);
    mockShopMappingUpsert.mockResolvedValue({});
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
    expect(mockShopMappingUpsert).toHaveBeenCalledWith({
      where: { userId_shopId_externalSku_externalSkuType: { userId: 'u1', shopId: 'shop-1', externalSku: 'SKU-B', externalSkuType: 'legacy' } },
      create: { userId: 'u1', shopId: 'shop-1', site: 'MY', externalSku: 'SKU-B', externalSkuType: 'legacy', targetSku: 'PROD-X' },
      update: { targetSku: 'PROD-X' },
    });
    expect(mockExternalMappingUpsert).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ targetSku: 'PROD-X', scope: 'shop' }));
  });

  it('问题二：携带 externalSkuType 时按编号类型身份持久化（同值不同类型互不覆盖）', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'PROD-X' }]);
    mockProductFindMany.mockResolvedValue([]);
    mockShopMappingUpsert.mockResolvedValue({});
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', targetSku: 'PROD-X', externalSkuType: 'variationSku' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockShopMappingUpsert).toHaveBeenCalledWith({
      where: { userId_shopId_externalSku_externalSkuType: { userId: 'u1', shopId: 'shop-1', externalSku: 'SKU-B', externalSkuType: 'variationSku' } },
      create: { userId: 'u1', shopId: 'shop-1', site: 'MY', externalSku: 'SKU-B', externalSkuType: 'variationSku', targetSku: 'PROD-X' },
      update: { targetSku: 'PROD-X' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ externalSkuType: 'variationSku' }));
  });

  it('问题二：非法 externalSkuType 返回 400（不静默当 legacy）', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'PROD-X' }]);
    mockProductFindMany.mockResolvedValue([]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', targetSku: 'PROD-X', externalSkuType: 'bogus' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockShopMappingUpsert).not.toHaveBeenCalled();
  });

  it('scope=site persists into the V2 shared mapping table and back-fills inventory for product-only targets', async () => {
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
        body: { shopId: 'shop-1', externalSku: 'SKU-B', targetSku: 'PROD-X', scope: 'site' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockInventoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sku: 'PROD-X', name: 'X 商品' }),
    }));
    expect(mockExternalMappingUpsert).toHaveBeenCalledWith({
      where: { userId_site_externalSku_externalSkuType: { userId: 'u1', site: 'MY', externalSku: 'SKU-B', externalSkuType: 'legacy' } },
      create: { userId: 'u1', site: 'MY', externalSku: 'SKU-B', externalSkuType: 'legacy', targetSku: 'PROD-X' },
      update: { targetSku: 'PROD-X' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ targetSku: 'PROD-X', scope: 'site' }));
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

describe('DELETE /mapping（编号类型贯通）', () => {
  it('携带 externalSkuType 时只删除该身份的映射', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const deleteMany = prisma.restockShopSkuMapping.deleteMany as jest.Mock;
    deleteMany.mockResolvedValue({ count: 1 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'delete')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', scope: 'shop', externalSkuType: 'variationSku' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', shopId: 'shop-1', externalSku: 'SKU-B', externalSkuType: 'variationSku' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
  });

  it('缺省 externalSkuType 时删除该货号全部类型（恢复继承）', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const deleteMany = prisma.restockShopSkuMapping.deleteMany as jest.Mock;
    deleteMany.mockResolvedValue({ count: 2 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/mapping', 'delete')(
      {
        user: { id: 'u1', role: 'owner' },
        body: { shopId: 'shop-1', externalSku: 'SKU-B', scope: 'shop' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', shopId: 'shop-1', externalSku: 'SKU-B' },
    });
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

  function seedRecommendations(overrides: { rules?: any[]; shopRules?: any[]; mappings?: any[]; shopMappings?: any[] } = {}) {
    mockShopFindMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      return [SHOP].filter(shop => ids.includes(shop.id));
    });
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindMany.mockResolvedValue(UPLOADS);
    mockItemFindMany.mockResolvedValue(DAILY_ITEMS);
    mockExternalMappingFindMany.mockResolvedValue(overrides.mappings ?? [
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
    ]);
    mockShopMappingFindMany.mockResolvedValue(overrides.shopMappings ?? []);
    mockInventoryFindMany.mockResolvedValue([INVENTORY_LOCAL_A]);
    mockProductFindMany.mockResolvedValue([{ id: 'prod-1', sku: 'LOCAL-A', name: 'A 商品', cost: 2.5, sites: ['MY'], country: 'MY' }]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockRestockSkuRuleFindMany.mockResolvedValue(overrides.rules ?? []);
    mockShopRuleFindMany.mockResolvedValue(overrides.shopRules ?? []);
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
      shopIds: [expect.objectContaining({ id: 'shop-1' })],
      statisticsDays: 2,
      shopObservedDays: 2,
    }));
    expect(payload.metadata.salesMetric).toBe('unitsOrdered');
    expect(payload.summary.reviewCount).toBe(1); // SKU-B 待核对
    expect(payload.integration).toEqual(expect.objectContaining({
      ycConfigured: true,
      warehouseCodes: ['WH-MY'],
      stockSource: 'yc',
    }));
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item).toBeDefined();
    expect(item.dailySales).toBe(3.5); // 7 件 / 2 天
    // 到仓 2026-10-04，覆盖 2026-10-04→12-08 = 65 天 + 安全 30 天
    expect(item.suggestedQty).toBe(Math.ceil(3.5 * 65 + 3.5 * 30));
    expect(item.availableStock).toBe(10);
    expect(item.matchType).toBe('site-mapping');
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

  it('applies shop rules over site rules over global defaults (field-level precedence)', async () => {
    seedRecommendations({
      rules: [{ userId: 'u1', site: 'MY', sku: 'LOCAL-A', leadTimeDays: 15, safetyDays: null, growthPercent: null }],
      shopRules: [{ userId: 'u1', shopId: 'shop-1', sku: 'LOCAL-A', leadTimeDays: 10, safetyDays: null, growthPercent: null }],
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    const item = res.json.mock.calls[0][0].items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item.leadTimeDays).toBe(10); // 店铺规则 10 优先于站点规则 15
    expect(item.arrivalDate).toBe('2026-09-19');
    expect(item.ruleSources.leadTimeDays).toBe('sku-rule');
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

  it('excludes oversized SKUs beyond the YC query limit and reports them in review', async () => {
    const longSku = 'L'.repeat(51);
    seedRecommendations({
      mappings: [
        { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: longSku },
      ],
    });
    mockInventoryFindMany.mockResolvedValue([{ ...INVENTORY_LOCAL_A, sku: longSku }]);
    mockProductFindMany.mockResolvedValue([]);
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
    expect(payload.review.some((entry: any) => entry.reasons[0]?.includes('元仓查询长度限制'))).toBe(true);
  });

  it('uses the stock pool warehouse scope when poolId is provided', async () => {
    seedRecommendations();
    mockPoolFindFirst.mockResolvedValue({
      id: 'pool-1', userId: 'u1', name: '主仓池', site: 'MY', warehouseCodes: ['WH-P1', 'WH-P2'],
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, poolId: 'pool-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.metadata.poolName).toBe('主仓池');
    expect(payload.metadata.warehouseScopeSource).toBe('pool');
    expect(new Set(payload.metadata.warehouseCodes)).toEqual(new Set(['WH-P1', 'WH-P2']));
    expect(payload.integration.warnings.join(' ')).not.toContain('未指定库存池');
  });

  it('flags site-default warehouse scope with an explicit warning', async () => {
    seedRecommendations();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.metadata.warehouseScopeSource).toBe('site-default');
    expect(payload.integration.warnings.join(' ')).toContain('未指定库存池');
  });

  it('rejects multi-site shops with 400', async () => {
    seedRecommendations();
    mockShopFindMany.mockResolvedValue([
      SHOP,
      { ...SHOP, id: 'shop-2', site: 'SG' },
    ]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopIds: ['shop-1', 'shop-2'] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('plan snapshots（服务端权威快照契约）', () => {
  /** 存储的计算结果 fixture：保存计划时服务端据此重建快照 */
  const storedPayload = () => ({
    site: 'MY',
    summary: { restockCount: 1, totalSuggestedQty: 100 },
    items: [
      {
        sku: 'LOCAL-A', name: 'A 商品', status: 'warning', executable: true,
        suggestedQty: 100, dailySales: 5, adjustedDailySales: 5, availableStock: 10,
        inTransit: 20, stockByWarehouse: [{ warehouseCode: 'WH-MY', available: 10 }],
        inboundBreakdown: [{ orderNumber: 'O1', remaining: 20, eta: '2026-09-20', category: 'duringCoverage' }],
        stockoutDate: null, baselineStockoutDate: '2026-10-01', gapBeforeArrival: 0, gapAfterArrival: 100, endSafetyGap: 0,
        arrivalDate: '2026-10-04', targetDate: '2026-12-08', leadTimeDays: 25, safetyDays: 30, growthPercent: 0,
        coverageDays: 65, transportDemand: 125, arrivalStock: 0, coverageDemand: 325, safetyStockDemand: 150,
        matchType: 'site-mapping', costUnknown: false, estimatedCost: 250,
        warnings: [], salesSources: [{ shopId: 'shop-1', shopName: '马来3C店', externalSku: 'SKU-A', units: 10, observedDays: 2, denominator: 2, growthPercent: 0 }],
        salesQuality: { status: 'ok', observedDays: 2, shopObservedDays: 2, coverage: 1, executable: true },
        ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' },
      },
      {
        sku: 'LOCAL-B', name: 'B 商品', status: 'no_stock_data', executable: false,
        suggestedQty: 0, dailySales: 3, adjustedDailySales: 3, availableStock: 0, inTransit: 0,
        stockByWarehouse: [], inboundBreakdown: [], stockoutDate: null, baselineStockoutDate: null,
        gapBeforeArrival: 0, gapAfterArrival: 0, endSafetyGap: 0,
        arrivalDate: '2026-10-04', targetDate: '2026-12-08', leadTimeDays: 25, safetyDays: 30, growthPercent: 0,
        coverageDays: 65, transportDemand: 75, arrivalStock: 0, coverageDemand: 195, safetyStockDemand: 90,
        matchType: 'exact-yc', costUnknown: true, estimatedCost: null,
        warnings: [], salesSources: [], salesQuality: { status: 'ok', executable: true },
        ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' },
      },
    ],
    metadata: {
      shopIds: [{ id: 'shop-1', name: '马来3C店', site: 'MY' }],
      from: '2026-09-01', to: '2026-09-02',
      salesMetric: 'unitsOrdered',
      planningDate: '2026-09-09', targetDate: '2026-12-08',
      statisticsDays: 2, statisticsDaysOverridden: false, salesMetricLabel: '已下订单件数',
      poolId: 'pool-1', warehouseCodes: ['WH-MY'], warehouseScopeSource: 'pool',
    },
    snapshot: { fingerprint: 'abc123', algorithmVersion: 'v3.1', salesFetchedAt: '2026-09-09T00:00:00Z', sourceSnapshotId: 'src-1' },
  });

  const seedResult = (overrides: Record<string, unknown> = {}) => {
    mockResultFindFirst.mockResolvedValue({
      id: 'result-1', userId: 'u1',
      fingerprint: 'abc123', sourceSnapshotId: 'src-1',
      payload: storedPayload(),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000),
      ...overrides,
    });
  };

  /** 可确认的计划条目：保存链路只允许 executable=true 的条目进入计划（不可执行条目在保存时被拒） */
  const executablePlanItems = () => storedPayload().items
    .filter(item => item.executable)
    .map(item => ({ ...item, confirmedQty: item.suggestedQty, adjustReason: null }));

  const SAVE_BODY = {
    resultId: 'result-1',
    name: '9月补货',
    idempotencyKey: 'idem-1',
    items: [{ sku: 'LOCAL-A', confirmedQty: 80, adjustReason: '旺季上调' }],
  };

  it('saves a draft plan from a server-side result: provenance copied, summary recomputed for saved items only', async () => {
    seedResult();
    mockPlanCreate.mockResolvedValue({ id: 'plan-1', status: 'draft' });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: SAVE_BODY } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const createArg = mockPlanCreate.mock.calls[0][0];
    const items = createArg.data.items;
    // 服务端快照：来自结果的 provenance 字段被复制（客户端无法伪造）
    expect(items[0].suggestedQty).toBe(100);
    expect(items[0].dailySales).toBe(5);
    expect(items[0].salesSources[0].externalSku).toBe('SKU-A');
    expect(items[0].salesQuality.status).toBe('ok');
    expect(items[0].inboundBreakdown[0].orderNumber).toBe('O1');
    expect(items[0].confirmedQty).toBe(80);
    expect(items[0].adjustReason).toBe('旺季上调');
    // 摘要只按保存项重算（结果里还有不可执行的 LOCAL-B，不计入）
    expect(createArg.data.summary).toEqual(expect.objectContaining({
      savedItemCount: 1,
      totalSuggestedQty: 100,
      totalConfirmedQty: 80,
      suggestedAmount: 250,
      confirmedAmount: 200, // 80 × (250/100)
    }));
    // 店铺/仓库范围来自结果 metadata，不收客户端
    expect(createArg.data.shopIds).toEqual(['shop-1']);
    expect(createArg.data.poolId).toBe('pool-1');
    expect(createArg.data.parameters).toEqual(expect.objectContaining({ scopeConfirmed: true }));
    expect(createArg.data.idempotencyKey).toBe('idem-1');
  });

  it('is idempotent on repeated idempotencyKey (double click / retry)', async () => {
    mockPlanFindUnique.mockResolvedValueOnce({ id: 'plan-exist', status: 'draft' });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: SAVE_BODY } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ plan: { id: 'plan-exist', status: 'draft' }, duplicate: true });
    expect(mockPlanCreate).not.toHaveBeenCalled();
  });

  it('returns 410 when the result is expired or missing', async () => {
    mockResultFindFirst.mockResolvedValue(null);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: SAVE_BODY } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('rejects non-executable items with a per-item reason (cannot bypass with manual quantity)', async () => {
    seedResult();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...SAVE_BODY, items: [{ sku: 'LOCAL-B', confirmedQty: 5, adjustReason: '手工强制' }] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('LOCAL-B');
  });

  it('requires an adjust reason when confirmedQty differs from suggestedQty', async () => {
    seedResult();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...SAVE_BODY, items: [{ sku: 'LOCAL-A', confirmedQty: 50 }] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('调整原因');
  });

  it('rejects non-integer confirmed quantities (1.5 / string numbers)', async () => {
    seedResult();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans', 'post')(
      { user: { id: 'u1', role: 'owner' }, body: { ...SAVE_BODY, items: [{ sku: 'LOCAL-A', confirmedQty: 1.5 }] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('edits a draft with optimistic revision; stale revision gets 409', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 3, name: '9月补货', site: 'MY',
      items: executablePlanItems(), summary: {}, createdAt: new Date(),
    });
    mockPlanUpdateMany.mockResolvedValue({ count: 1 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id', 'put')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 2, edits: [{ sku: 'LOCAL-A', confirmedQty: 90, adjustReason: '修正' }] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('applies a valid draft edit and bumps revision', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 3, name: '9月补货', site: 'MY',
      items: executablePlanItems(), summary: {}, createdAt: new Date(),
    });
    mockPlanUpdateMany.mockResolvedValue({ count: 1 });
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 4,
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id', 'put')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 3, edits: [{ sku: 'LOCAL-A', confirmedQty: 90, adjustReason: '修正' }] } } as unknown as Request,
      res,
      jest.fn(),
    );
    const updateArg = mockPlanUpdateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual(expect.objectContaining({ status: 'draft', revision: 3 }));
    expect(updateArg.data.revision).toBe(4);
    expect(updateArg.data.items[0].confirmedQty).toBe(90);
    // 摘要按新确认量重算
    expect(updateArg.data.summary.totalConfirmedQty).toBe(90);
  });

  it('rejects confirmation when the plan was saved without a confirmed warehouse scope', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
      items: executablePlanItems(),
      summary: { scopeConfirmed: false },
      warehouseCodes: ['WH-MY'], createdAt: new Date(),
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/confirm', 'post')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('库存池');
  });

  it('confirms with warehouse-overlap duplicate detection (not same-site-last-10)', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
      items: executablePlanItems(),
      summary: { scopeConfirmed: true },
      warehouseCodes: ['WH-MY'], poolId: 'pool-1',
      createdAt: new Date('2026-09-09T00:00:00Z'),
    });
    mockPlanFindMany.mockResolvedValue([
      // 仓库重叠 + SKU 交叉 → 提醒
      { id: 'plan-0', name: '上周计划', items: [{ sku: 'LOCAL-A', suggestedQty: 90 }], warehouseCodes: ['WH-MY'], poolId: null, confirmedAt: new Date(), createdAt: new Date() },
      // SKU 交叉但仓库不重叠 → 不提醒
      { id: 'plan-2', name: '其他仓计划', items: [{ sku: 'LOCAL-A', suggestedQty: 10 }], warehouseCodes: ['WH-OTHER'], poolId: null, confirmedAt: new Date(), createdAt: new Date() },
    ]);
    mockPlanUpdateMany.mockResolvedValue({ count: 1 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/confirm', 'post')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.plan.status).toBe('confirmed');
    expect(payload.plan.revision).toBe(2); // 确认成功后 revision 递增
    expect(payload.duplicatePlanWarnings).toHaveLength(1);
    expect(payload.duplicatePlanWarnings[0]).toContain('上周计划');
    expect(payload.duplicatePlanWarnings[0]).toContain('重叠仓库范围');
    // 候选查询按仓库范围预筛（归属 userId 内），不再取最近 N 条后内存过滤
    expect(mockPlanFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'u1',
        status: 'confirmed',
        OR: expect.arrayContaining([expect.objectContaining({ warehouseCodes: { hasSome: ['WH-MY'] } })]),
      }),
    }));
    // 条件更新包含 status + revision，成功后原子递增
    const updateArg = mockPlanUpdateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual(expect.objectContaining({ status: 'draft', revision: 1 }));
    expect(updateArg.data.revision).toBe(2);
  });

  it('问题六：重复安排检查分页遍历——首批全不相关、之后批次才出现相关计划时不漏报', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
      items: executablePlanItems(),
      summary: { scopeConfirmed: true },
      warehouseCodes: ['WH-MY'], poolId: null,
      createdAt: new Date(),
    });
    const relevant = {
      id: 'plan-deep', name: '深处相关计划', items: [{ sku: 'LOCAL-A', suggestedQty: 5 }],
      warehouseCodes: ['WH-MY'], poolId: null, confirmedAt: new Date(), createdAt: new Date(),
    };
    let firstBatch = true;
    mockPlanFindMany.mockImplementation(async (args: any) => {
      if (!firstBatch) return [relevant];
      firstBatch = false;
      // 第一批返回整批（数量=take）完全不相关计划：修复前的"先取50条再筛"会漏掉后续批次
      const take = args.take as number;
      return Array.from({ length: take }, (_, index) => ({
        id: `irrelevant-${index}`,
        name: `无关计划-${index}`,
        items: [{ sku: `OTHER-${index}`, suggestedQty: 1 }],
        warehouseCodes: ['WH-MY'],
        poolId: null,
        confirmedAt: new Date(), createdAt: new Date(),
      }));
    });
    mockPlanUpdateMany.mockResolvedValue({ count: 1 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/confirm', 'post')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockPlanFindMany.mock.calls.length).toBeGreaterThanOrEqual(2); // 确实翻页了
    const payload = res.json.mock.calls[0][0];
    expect(payload.duplicatePlanWarnings.some((warning: string) => warning.includes('深处相关计划'))).toBe(true);
  });

  it('问题六：不同库存池但共享仓库 → 仍按仓库重叠提醒', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
      items: executablePlanItems(),
      summary: { scopeConfirmed: true },
      warehouseCodes: ['WH-A'], poolId: 'pool-1',
      createdAt: new Date(),
    });
    mockPlanFindMany.mockResolvedValue([
      { id: 'plan-p2', name: '另一池共享仓计划', items: [{ sku: 'LOCAL-A', suggestedQty: 9 }], warehouseCodes: ['WH-A', 'WH-B'], poolId: 'pool-2', confirmedAt: new Date(), createdAt: new Date() },
    ]);
    mockPlanUpdateMany.mockResolvedValue({ count: 1 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/confirm', 'post')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.duplicatePlanWarnings).toHaveLength(1);
    expect(payload.duplicatePlanWarnings[0]).toContain('另一池共享仓计划');
  });

  describe('问题三：revision 并发保护贯通', () => {
    it('GET /plans 列表返回 revision', async () => {
      mockPlanCount.mockResolvedValue(1);
      mockPlanFindMany.mockResolvedValue([{ id: 'plan-1', revision: 3 }]);
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans')(
        { user: { id: 'u1', role: 'owner' }, query: {} } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(mockPlanFindMany).toHaveBeenCalledWith(expect.objectContaining({
        select: expect.objectContaining({ revision: true }),
      }));
      expect(res.json.mock.calls[0][0].plans[0].revision).toBe(3);
    });

    it('确认缺失 revision → 400 明确参数错误（不静默跳过校验）', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        items: executablePlanItems(), summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: {} } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('revision');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('确认非法 revision（1.5 / 字符串）→ 400', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        items: executablePlanItems(), summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: '1' } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('旧页面确认新数量：草稿已被并发编辑（revision 3→4），旧 revision 1 确认 → 409 且无状态修改', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'draft', revision: 4, site: 'MY',
        items: executablePlanItems().map(item => ({ ...item, confirmedQty: 90, adjustReason: '并发编辑后的新数量' })),
        summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].error).toContain('重新核对');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('作废缺失 revision → 400；过期 revision → 409 且无状态修改', async () => {
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const missing = makeRes();
      await getHandler(router, '/plans/:id/void', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { voidReason: '采购取消' } } as unknown as Request,
        missing,
        jest.fn(),
      );
      expect(missing.status).toHaveBeenCalledWith(400);

      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'confirmed', revision: 5, site: 'MY',
        items: executablePlanItems(), summary: {}, warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const stale = makeRes();
      await getHandler(router, '/plans/:id/void', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { voidReason: '采购取消', revision: 4 } } as unknown as Request,
        stale,
        jest.fn(),
      );
      expect(stale.status).toHaveBeenCalledWith(409);
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('作废成功：条件更新携带 revision 并递增', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'confirmed', revision: 5, site: 'MY',
        items: executablePlanItems(), summary: {}, warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      mockPlanUpdateMany.mockResolvedValue({ count: 1 });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/void', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { voidReason: '采购取消', revision: 5 } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(mockPlanUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'plan-1', status: { in: ['draft', 'confirmed'] }, revision: 5 }),
        data: expect.objectContaining({ status: 'void', revision: 6 }),
      }));
      expect(res.json).toHaveBeenCalledWith({ voided: true });
    });
  });

  describe('问题四：确认逐项可执行校验', () => {
    it('计划包含不可执行条目（executable=false）→ 400 拒绝确认，无状态修改', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        // 模拟历史数据/绕过保存链路的计划：LOCAL-B 不可执行（库存未知）
        items: [
          ...executablePlanItems(),
          { ...storedPayload().items[1], confirmedQty: 0, adjustReason: null },
        ],
        summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 1 } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('LOCAL-B');
      expect(res.json.mock.calls[0][0].error).toContain('不可执行');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
      expect(mockPlanFindMany).not.toHaveBeenCalled(); // 校验失败不进入重复检查
    });

    it('历史草稿缺完整溯源（无 dailySales）→ 400 提示重新计算', async () => {
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-legacy', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        items: [{ sku: 'LOCAL-A', suggestedQty: 100, confirmedQty: 100 }],
        summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-legacy' }, body: { revision: 1 } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('重新计算');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('空条目计划与缺调整原因的条目均拒绝确认', async () => {
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const empty = makeRes();
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-empty', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        items: [], summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-empty' }, body: { revision: 1 } } as unknown as Request,
        empty,
        jest.fn(),
      );
      expect(empty.status).toHaveBeenCalledWith(400);
      expect(empty.json.mock.calls[0][0].error).toContain('重新计算');

      const noReason = makeRes();
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-noreason', userId: 'u1', status: 'draft', revision: 1, site: 'MY',
        items: executablePlanItems().map(item => ({ ...item, confirmedQty: 80, adjustReason: null })),
        summary: { scopeConfirmed: true },
        warehouseCodes: ['WH-MY'], createdAt: new Date(),
      });
      await getHandler(router, '/plans/:id/confirm', 'post')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-noreason' }, body: { revision: 1 } } as unknown as Request,
        noReason,
        jest.fn(),
      );
      expect(noReason.status).toHaveBeenCalledWith(400);
      expect(noReason.json.mock.calls[0][0].error).toContain('调整原因');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });

    it('编辑草稿后的条目同样走共享校验：编辑引入不一致数量但无原因 → 400', async () => {
      const draftItems = executablePlanItems();
      mockPlanFindFirst.mockResolvedValue({
        id: 'plan-1', userId: 'u1', status: 'draft', revision: 3, name: '9月补货', site: 'MY',
        items: draftItems, summary: {}, createdAt: new Date(),
      });
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/plans/:id', 'put')(
        { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: { revision: 3, edits: [{ sku: 'LOCAL-A', confirmedQty: 50 }] } } as unknown as Request,
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('调整原因');
      expect(mockPlanUpdateMany).not.toHaveBeenCalled();
    });
  });

  it('copies a confirmed plan into a new draft version (history preserved)', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1', userId: 'u1', status: 'confirmed', version: 2, name: '9月补货', site: 'MY',
      shopIds: ['shop-1'], poolId: 'pool-1', warehouseCodes: ['WH-MY'],
      rangeFrom: '2026-09-01', rangeTo: '2026-09-02', salesMetric: 'unitsOrdered',
      parameters: {}, items: storedPayload().items, summary: { scopeConfirmed: true }, snapshotMeta: {},
    });
    mockPlanCreate.mockResolvedValue({ id: 'plan-copy', status: 'draft' });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/copy', 'post')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-1' }, body: {} } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const createArg = mockPlanCreate.mock.calls[0][0];
    expect(createArg.data).toEqual(expect.objectContaining({
      status: 'draft',
      supersedesId: 'plan-1',
      version: 3,
    }));
  });

  it('exports CSV with formula-injection protection and separated suggested/confirmed amounts', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-12345678', name: '=cmd|计划', status: 'confirmed', site: 'MY', shopIds: ['shop-1'],
      poolId: 'pool-1', warehouseCodes: ['WH-MY'], rangeFrom: '2026-09-01', rangeTo: '2026-09-02',
      salesMetric: 'unitsOrdered', revision: 1, version: 1,
      parameters: { planningDate: '2026-09-09', targetDate: '2026-12-08', leadTimeDays: 25, safetyDays: 30, growthPercent: 0 },
      items: [
        { sku: 'LOCAL-A', name: '@注入测试', status: 'warning', dailySales: 5, adjustedDailySales: 5, availableStock: 10, inTransit: 20, stockoutDate: null, suggestedQty: 100, confirmedQty: 80, adjustReason: '旺季上调', costUnknown: false, estimatedCost: 250 },
      ],
      summary: {},
      snapshotMeta: { fingerprint: 'abc', algorithmVersion: 'v3.1', salesFetchedAt: '2026-09-09T00:00:00Z' },
      createdAt: new Date('2026-09-09T00:00:00Z'), confirmedAt: new Date('2026-09-09T01:00:00Z'), voidedAt: null, voidReason: null,
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/export', 'get')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-12345678' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    const csv = res.send.mock.calls[0][0] as string;
    expect(csv).toContain('计划号,plan-12345678');
    // 公式注入：= 与 @ 开头的文本被前缀单引号
    expect(csv).toContain("'=cmd|计划");
    expect(csv).toContain("'@注入测试");
    // 建议金额与确认金额分列；确认金额 = 80 × 2.5 = 200
    expect(csv).toContain('250');
    expect(csv).toContain(',200,');
  });

  it('marks legacy snapshots as incomplete in export instead of faking provenance', async () => {
    mockPlanFindFirst.mockResolvedValueOnce({
      id: 'plan-legacy', name: '旧版计划', status: 'confirmed', site: 'MY', shopIds: ['shop-1'],
      poolId: null, warehouseCodes: ['WH-MY'], rangeFrom: '2026-09-01', rangeTo: '2026-09-02',
      salesMetric: 'unitsOrdered', revision: 1, version: 1,
      parameters: {},
      // 旧格式：只有 sku/数量，没有 dailySales 等 provenance
      items: [{ sku: 'LOCAL-A', suggestedQty: 100, confirmedQty: 80, adjustReason: '' }],
      summary: {},
      snapshotMeta: {},
      createdAt: new Date(), confirmedAt: new Date(), voidedAt: null, voidReason: null,
    });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id/export', 'get')(
      { user: { id: 'u1', role: 'owner' }, params: { id: 'plan-legacy' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const csv = res.send.mock.calls[0][0] as string;
    expect(csv).toContain('历史版本');
  });

  it('supports search and pagination in plan list', async () => {
    mockPlanCount.mockResolvedValue(2);
    mockPlanFindMany.mockResolvedValue([]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans')(
      { user: { id: 'u1', role: 'owner' }, query: { page: '2', pageSize: '10', q: '9月', status: 'draft' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockPlanFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'u1', status: 'draft',
        name: expect.objectContaining({ contains: '9月' }),
      }),
      skip: 10,
      take: 10,
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 2, page: 2, pageSize: 10 }));
  });

  it('isolates plan access per user', async () => {
    mockPlanFindFirst.mockResolvedValueOnce(null);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/plans/:id', 'get')(
      { user: { id: 'u2', role: 'owner' }, params: { id: 'plan-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(404);
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

  it('denies plan writes with view-only permission', async () => {
    mockUserFindUnique.mockResolvedValue({ isActive: true, permissions: ['restock-v3.view'] });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const [permissionHandler] = getRouteHandlers(router, '/plans', 'post');
    const res = makeRes();
    const next = jest.fn();
    await permissionHandler({ user: { id: 'u1', role: 'user' }, body: {} } as unknown as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('GET/PUT /sku-rules', () => {
  it('lists shop and site rules merged with scope labels', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockShopRuleFindMany.mockResolvedValue([
      { userId: 'u1', shopId: 'shop-1', sku: 'LOCAL-A', leadTimeDays: 10, safetyDays: null, growthPercent: null },
    ]);
    mockRestockSkuRuleFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', sku: 'LOCAL-B', leadTimeDays: 5, safetyDays: null, growthPercent: null },
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
      rules: expect.arrayContaining([
        expect.objectContaining({ sku: 'LOCAL-A', leadTimeDays: 10, scope: 'shop' }),
        expect.objectContaining({ sku: 'LOCAL-B', leadTimeDays: 5, scope: 'site' }),
      ]),
    });
  });

  it('upserts shop-scoped rules by default', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'LOCAL-A' }]);
    mockShopRuleUpsert.mockResolvedValue({ sku: 'LOCAL-A', leadTimeDays: 12 });
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
    expect(mockShopRuleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_shopId_sku: { userId: 'u1', shopId: 'shop-1', sku: 'LOCAL-A' } },
    }));
    expect(mockRestockSkuRuleUpsert).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ leadTimeDays: 12 }));
  });

  it('upserts site-scoped rules when scope=site (V2 shared)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockInventoryFindMany.mockResolvedValue([{ sku: 'LOCAL-A' }]);
    mockRestockSkuRuleUpsert.mockResolvedValue({ sku: 'LOCAL-A', leadTimeDays: 12 });
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/sku-rules/:sku', 'put')(
      {
        user: { id: 'u1', role: 'owner' },
        params: { sku: 'LOCAL-A' },
        body: { shopId: 'shop-1', leadTimeDays: 12, scope: 'site' },
      } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(mockRestockSkuRuleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_site_sku: { userId: 'u1', site: 'MY', sku: 'LOCAL-A' } },
    }));
  });
});
