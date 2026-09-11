/**
 * 补货V3 升级路由回归测试：多平台SKU合并、两端同码免档案直连、零库存与缺行区分、
 * 店铺隔离映射、共仓需求汇总。锁定 2026-09 升级后的目标契约。
 */
import { Request, Response } from 'express';
import type { YcOpenPlatformClient } from '../../services/ycOpenPlatformClient';

jest.mock('../../index', () => ({
  prisma: {
    usageEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
    productAnalysisShop: { findFirst: jest.fn(), findMany: jest.fn() },
    productAnalysisDailyUpload: { findMany: jest.fn(), groupBy: jest.fn() },
    productDailyItem: { findMany: jest.fn() },
    product: { findMany: jest.fn(), create: jest.fn() },
    inventoryItem: { findMany: jest.fn(), create: jest.fn() },
    warehouseMapping: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    externalSkuMapping: { findMany: jest.fn(), upsert: jest.fn() },
    restockSkuRule: { findMany: jest.fn(), upsert: jest.fn() },
    restockShopSkuMapping: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    restockShopRule: { findMany: jest.fn(), upsert: jest.fn() },
    restockStockPool: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    restockPlanSnapshot: {
      findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(),
    },
  },
  safeRedis: { del: jest.fn() },
}));

import { createRestockV3Router } from '../restockV3Routes';
import { prisma } from '../../index';

const mockShopFindFirst = prisma.productAnalysisShop.findFirst as jest.Mock;
const mockShopFindMany = prisma.productAnalysisShop.findMany as jest.Mock;
const mockUploadFindMany = prisma.productAnalysisDailyUpload.findMany as jest.Mock;
const mockItemFindMany = prisma.productDailyItem.findMany as jest.Mock;
const mockProductFindMany = prisma.product.findMany as jest.Mock;
const mockInventoryFindMany = prisma.inventoryItem.findMany as jest.Mock;
const mockWarehouseMappingFindMany = prisma.warehouseMapping.findMany as jest.Mock;
const mockExternalMappingFindMany = prisma.externalSkuMapping.findMany as jest.Mock;
const mockShopMappingFindMany = prisma.restockShopSkuMapping.findMany as jest.Mock;
const mockRestockSkuRuleFindMany = prisma.restockSkuRule.findMany as jest.Mock;
const mockShopRuleFindMany = prisma.restockShopRule.findMany as jest.Mock;

function getHandler(router: any, path: string, method = 'post') {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function makeYcClient(overrides: Record<string, () => any> = {}) {
  return {
    isConfigured: () => true,
    listCustomerWarehouses: () => Promise.resolve([{ code: 'WH-MY', siteCode: 'MY', name: 'MY仓' }]),
    listProducts: (overrides.listProducts ?? (() => Promise.resolve([
      { customerSku: 'LOCAL-A', customerSkuName: 'A 货品' },
      { customerSku: 'LOCAL-Z', customerSkuName: 'Z 货品' },
      { customerSku: 'DIRECT-1', customerSkuName: '直连货品' },
    ]))) as any,
    listProductInventory: overrides.listProductInventory
      ?? (() => Promise.resolve([
        { warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', available: 10 },
      ])),
    listInboundOrders: overrides.listInboundOrders ?? (() => Promise.resolve([])),
  } as unknown as YcOpenPlatformClient;
}

const SHOP = {
  id: 'shop-1', name: '马来店', site: 'MY', platform: 'shopee', currency: 'MYR', userId: 'u1',
};
const SHOP_2 = {
  id: 'shop-2', name: '马来二店', site: 'MY', platform: 'shopee', currency: 'MYR', userId: 'u1',
};

const UPLOADS = [
  { id: 'up-1', date: new Date('2026-09-01T00:00:00Z') },
  { id: 'up-2', date: new Date('2026-09-02T00:00:00Z') },
];

const inventoryRow = (sku: string, cost = 2.5) => ({
  id: `inv-${sku}`, name: `${sku} 本地`, sku,
  currentStock: 0, stockOfficial: 0, stockThirdParty: 0, inTransit: 0,
  dailySales: 0, leadTime: 25, replenishCycle: 30, costPerUnit: cost, userId: 'u1',
});

function itemsForShop1() {
  return [
    {
      uploadId: 'up-1', itemId: '1001', itemName: '键盘', unitsOrdered: 5,
      variations: [
        { variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑', unitsOrdered: 3 },
        { variationSku: 'SYS-A2', modelCode: 'SKU-A2', variationName: '白', unitsOrdered: 2 },
      ],
    },
    {
      uploadId: 'up-2', itemId: '1001', itemName: '键盘', unitsOrdered: 4,
      variations: [
        { variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑', unitsOrdered: 4 },
        { variationSku: 'SYS-A2', modelCode: 'SKU-A2', variationName: '白', unitsOrdered: 1 },
      ],
    },
  ];
}

const BASE_BODY = {
  from: '2026-09-01',
  to: '2026-09-02',
  planningDate: '2026-09-09',
  targetDate: '2026-12-08',
  leadTimeDays: 25,
  safetyDays: 30,
  growthPercent: 0,
};

function seedShop1(overrides: { mappings?: any[]; shopMappings?: any[] } = {}) {
  mockShopFindFirst.mockImplementation(async ({ where }: any) =>
    where.id === 'shop-1' ? SHOP : where.id === 'shop-2' ? SHOP_2 : null);
  mockShopFindMany.mockImplementation(async ({ where }: any) => {
    const ids: string[] = where.id?.in ?? [];
    return [SHOP, SHOP_2].filter(shop => ids.includes(shop.id));
  });
  mockUploadFindMany.mockResolvedValue(UPLOADS);
  mockItemFindMany.mockResolvedValue(itemsForShop1());
  mockExternalMappingFindMany.mockResolvedValue(overrides.mappings ?? [
    { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
    { userId: 'u1', site: 'MY', externalSku: 'SKU-A2', targetSku: 'LOCAL-A' },
  ]);
  mockShopMappingFindMany.mockResolvedValue(overrides.shopMappings ?? []);
  mockRestockSkuRuleFindMany.mockResolvedValue([]);
  mockShopRuleFindMany.mockResolvedValue([]);
  mockWarehouseMappingFindMany.mockResolvedValue([]);
  mockProductFindMany.mockResolvedValue([]);
  mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma as any).$transaction.mockImplementation((cb: any) => cb(prisma));
});

describe('POST /recommendations 升级契约', () => {
  it('多个平台 SKU 映射同一本地 SKU：需求合并为一条建议，可追溯全部来源', async () => {
    seedShop1();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    const items = payload.items.filter((item: any) => item.sku === 'LOCAL-A');
    expect(items).toHaveLength(1);
    // (3+4) + (2+1) = 10 件 ÷ 2 天 = 5/天
    expect(items[0].dailySales).toBe(5);
    expect(items[0].salesSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalSku: 'SKU-A', units: 7 }),
      expect.objectContaining({ externalSku: 'SKU-A2', units: 3 }),
    ]));
    expect(items[0].matchType).toBe('site-mapping');
  });

  it('两端同码且元仓货品唯一：无本地档案也参与计算，成本未知', async () => {
    seedShop1({
      mappings: [],
      shopMappings: [],
    });
    // 追加一个只在元仓存在的规格货号 DIRECT-1（本地无 Product/InventoryItem）
    mockItemFindMany.mockResolvedValue([
      ...itemsForShop1(),
      {
        uploadId: 'up-1', itemId: '1002', itemName: '直连商品', unitsOrdered: 6,
        variations: [{ variationSku: 'SYS-D1', modelCode: 'DIRECT-1', variationName: '标准', unitsOrdered: 6 }],
      },
      {
        uploadId: 'up-2', itemId: '1002', itemName: '直连商品', unitsOrdered: 0,
        variations: [{ variationSku: 'SYS-D1', modelCode: 'DIRECT-1', variationName: '标准', unitsOrdered: 0 }],
      },
    ]);
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
    mockProductFindMany.mockResolvedValue([]);
    const ycClient = makeYcClient({
      listProductInventory: () => Promise.resolve([
        { warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', available: 10 },
        { warehouseCode: 'WH-MY', customerSku: 'DIRECT-1', available: 4 },
      ]),
    });
    const router = createRestockV3Router({ ycClient });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    const direct = payload.items.find((item: any) => item.sku === 'DIRECT-1');
    expect(direct).toBeDefined();
    expect(direct.matchType).toBe('exact-yc');
    expect(direct.costUnknown).toBe(true);
    expect(direct.estimatedCost).toBeNull();
    expect(direct.dailySales).toBe(3); // 6 件 / 2 天
    expect(direct.availableStock).toBe(4);
  });

  it('元仓返回 available=0 与未返回该货品行严格区分：前者正常计算，后者不可执行', async () => {
    seedShop1({
      mappings: [
        { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
        { userId: 'u1', site: 'MY', externalSku: 'SKU-A2', targetSku: 'LOCAL-Z' },
      ],
    });
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A'), inventoryRow('LOCAL-Z')]);
    const ycClient = makeYcClient({
      listProductInventory: () => Promise.resolve([
        { warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', available: 0 },
      ]), // LOCAL-Z 无行
    });
    const router = createRestockV3Router({ ycClient });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    const zero = payload.items.find((item: any) => item.sku === 'LOCAL-A');
    expect(zero.status).not.toBe('no_stock_data');
    expect(zero.suggestedQty).toBeGreaterThan(0);
    const missing = payload.items.find((item: any) => item.sku === 'LOCAL-Z');
    expect(missing.status).toBe('no_stock_data');
    expect(missing.suggestedQty).toBe(0);
    expect(missing.reviewReason).toBeTruthy();
    // 无未匹配项（两个平台 SKU 均有映射）
    expect(payload.review.length).toBe(0);
  });

  it('店铺专属映射优先于站点级映射', async () => {
    seedShop1({
      mappings: [{ userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' }],
      shopMappings: [
        { userId: 'u1', shopId: 'shop-1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A-SHOP' },
      ],
    });
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A'), inventoryRow('LOCAL-A-SHOP')]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A-SHOP');
    expect(item).toBeDefined();
    expect(item.matchType).toBe('shop-mapping');
    expect(payload.items.find((entry: any) => entry.sku === 'LOCAL-A')).toBeUndefined();
  });

  it('共仓模式：多店铺需求先汇总再一次性扣减库存与在途', async () => {
    mockShopFindFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'shop-1' ? SHOP : where.id === 'shop-2' ? SHOP_2 : null);
    mockShopFindMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      return [SHOP, SHOP_2].filter(shop => ids.includes(shop.id));
    });
    mockUploadFindMany.mockImplementation(async ({ where }: any) =>
      where.shopId === 'shop-1' ? UPLOADS : UPLOADS.map(u => ({ ...u, id: `${u.id}-s2` })));
    mockItemFindMany.mockImplementation(async ({ where }: any) => {
      const ids = where.uploadId.in as string[];
      return ids.some(id => id.endsWith('-s2'))
        ? [{
            uploadId: 'up-1-s2', itemId: '2001', itemName: '二店键盘', unitsOrdered: 3,
            variations: [{ modelCode: 'SKU-A', unitsOrdered: 3 }],
          }, {
            uploadId: 'up-2-s2', itemId: '2001', itemName: '二店键盘', unitsOrdered: 2,
            variations: [{ modelCode: 'SKU-A', unitsOrdered: 2 }],
          }]
        : itemsForShop1();
    });
    mockExternalMappingFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A2', targetSku: 'LOCAL-A' },
    ]);
    mockShopMappingFindMany.mockResolvedValue([]);
    mockRestockSkuRuleFindMany.mockResolvedValue([]);
    mockShopRuleFindMany.mockResolvedValue([]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopIds: ['shop-1', 'shop-2'] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    const items = payload.items.filter((item: any) => item.sku === 'LOCAL-A');
    expect(items).toHaveLength(1);
    // 两店合计 (7 + 3) + (3 + 2) = 15 件 ÷ 2 天
    expect(items[0].dailySales).toBe(7.5);
    expect(items[0].salesSources.length).toBe(3); // shop1/SKU-A + shop1/SKU-A2 + shop2/SKU-A
    expect(items[0].availableStock).toBe(10);     // 库存只扣一次（一份快照）
    expect(payload.metadata.shopIds).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shop-1' }),
      expect.objectContaining({ id: 'shop-2' }),
    ]));
  });

  it('响应包含快照指纹与数据获取时间，口径与分母可追溯', async () => {
    seedShop1();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.snapshot.fingerprint).toMatch(/^[0-9a-f]{16,}$/);
    expect(payload.snapshot.algorithmVersion).toBeTruthy();
    expect(payload.snapshot.salesFetchedAt).toBeTruthy();
    expect(payload.snapshot.stockFetchedAt).toBeTruthy();
    expect(payload.metadata.salesMetric).toBe('unitsOrdered');
    expect(payload.metadata.denominator).toBe(2);
    expect(payload.metadata.calendarDays).toBe(2);
    expect(payload.metadata.shopObservedDays).toBe(2);
  });

  it('同源条件改参数重算复用元仓快照；forceRefresh 强制重取', async () => {
    seedShop1();
    // 用唯一用户 ID 隔离模块级源数据缓存（前序用例可能已为 u1 填充同源缓存）
    const cacheUserId = `u-cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inventoryCalls: number[] = [];
    const ycClient = makeYcClient({
      listProductInventory: () => {
        inventoryCalls.push(1);
        return Promise.resolve([{ warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', available: 10 }]);
      },
    });
    const router = createRestockV3Router({ ycClient });
    const first = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: cacheUserId, role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1' } } as unknown as Request,
      first,
      jest.fn(),
    );
    expect(first.json.mock.calls[0][0].integration.reusedSourceData).toBe(false);
    expect(inventoryCalls.length).toBe(1);

    // 改安全库存重算：源条件不变 → 复用元仓数据，不再拉取
    const second = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: cacheUserId, role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1', safetyDays: 20 } } as unknown as Request,
      second,
      jest.fn(),
    );
    const secondPayload = second.json.mock.calls[0][0];
    expect(secondPayload.integration.reusedSourceData).toBe(true);
    expect(inventoryCalls.length).toBe(1); // 未重复拉取
    expect(secondPayload.snapshot.fingerprint).not.toBe(first.json.mock.calls[0][0].snapshot.fingerprint); // 参数变了 → 指纹变化

    // 刷新源数据：强制重取
    const third = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: cacheUserId, role: 'owner' }, body: { ...BASE_BODY, shopId: 'shop-1', safetyDays: 20, forceRefresh: true } } as unknown as Request,
      third,
      jest.fn(),
    );
    expect(third.json.mock.calls[0][0].integration.reusedSourceData).toBe(false);
    expect(inventoryCalls.length).toBe(2);
  });
});

describe('第二轮缺陷修复契约', () => {
  const BASE = {
    from: '2026-09-01',
    to: '2026-09-02',
    planningDate: '2026-09-09',
    targetDate: '2026-12-08',
    leadTimeDays: 25,
    safetyDays: 30,
    growthPercent: 0,
  };

  function seedSharedShops(rules: any[]) {
    mockShopFindFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'shop-1' ? SHOP : where.id === 'shop-2' ? SHOP_2 : null);
    mockShopFindMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      return [SHOP, SHOP_2].filter(shop => ids.includes(shop.id));
    });
    mockUploadFindMany.mockImplementation(async ({ where }: any) =>
      where.shopId === 'shop-1' ? UPLOADS : UPLOADS.map(u => ({ ...u, id: u.id + '-s2' })));
    mockItemFindMany.mockImplementation(async ({ where }: any) => {
      const ids = where.uploadId.in as string[];
      return ids.some(id => id.endsWith('-s2'))
        ? [{
            uploadId: 'up-1-s2', itemId: '2001', itemName: '二店键盘', unitsOrdered: 3,
            variations: [{ modelCode: 'SKU-A', unitsOrdered: 3 }],
          }, {
            uploadId: 'up-2-s2', itemId: '2001', itemName: '二店键盘', unitsOrdered: 2,
            variations: [{ modelCode: 'SKU-A', unitsOrdered: 2 }],
          }]
        : itemsForShop1();
    });
    mockExternalMappingFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A2', targetSku: 'LOCAL-A' },
    ]);
    mockShopMappingFindMany.mockResolvedValue([]);
    mockRestockSkuRuleFindMany.mockResolvedValue([]);
    mockShopRuleFindMany.mockResolvedValue(rules);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
  }

  it('质量限制执行：观测过旧（最新观测早于计划日7天以上）→ item.executable=false', async () => {
    seedShop1();
    // planningDate 2026-09-20，最新观测 09-02 → 距计划日 18 天 → stale → 不可执行
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE, shopId: 'shop-1', planningDate: '2026-09-20' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item.salesQuality.status).toBe('stale');
    expect(item.executable).toBe(false);
  });

  it('共仓缺店铺数据：400 并列出缺失店铺（需求未知≠零需求）', async () => {
    mockShopFindFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'shop-1' ? SHOP : where.id === 'shop-2' ? SHOP_2 : null);
    mockShopFindMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      return [SHOP, SHOP_2].filter(shop => ids.includes(shop.id));
    });
    // shop-1 有上传，shop-2 无上传
    mockUploadFindMany.mockImplementation(async ({ where }: any) =>
      where.shopId === 'shop-1' ? UPLOADS : []);
    mockItemFindMany.mockResolvedValue(itemsForShop1());
    mockExternalMappingFindMany.mockResolvedValue([
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' },
      { userId: 'u1', site: 'MY', externalSku: 'SKU-A2', targetSku: 'LOCAL-A' },
    ]);
    mockShopMappingFindMany.mockResolvedValue([]);
    mockRestockSkuRuleFindMany.mockResolvedValue([]);
    mockShopRuleFindMany.mockResolvedValue([]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u1', role: 'owner' }, body: { ...BASE, shopIds: ['shop-1', 'shop-2'] } } as unknown as Request,
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('马来二店');
  });

  it('缓存失效：WarehouseMapping 数量不变但内容变化 → 不复用源数据快照', async () => {
    seedShop1();
    const cacheUserId = 'u-map-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const inventoryCalls: number[] = [];
    const ycClient = makeYcClient({
      listProductInventory: () => {
        inventoryCalls.push(1);
        return Promise.resolve([{ warehouseCode: 'WH-MY', customerSku: 'LOCAL-A', available: 10 }]);
      },
    });
    const router = createRestockV3Router({ ycClient });
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    const first = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: cacheUserId, role: 'owner' }, body: { ...BASE, shopId: 'shop-1' } } as unknown as Request,
      first,
      jest.fn(),
    );
    expect(inventoryCalls.length).toBe(1);
    // 同数量（1条）但别名内容变化 → 源指纹变化 → 重新拉取
    mockWarehouseMappingFindMany.mockResolvedValue([
      { sku: 'LOCAL-A', thirdPartyWarehouseId: 'YC-ALIAS-NEW', type: 'third' },
    ]);
    const second = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: cacheUserId, role: 'owner' }, body: { ...BASE, shopId: 'shop-1', safetyDays: 20 } } as unknown as Request,
      second,
      jest.fn(),
    );
    expect(second.json.mock.calls[0][0].integration.reusedSourceData).toBe(false);
    expect(inventoryCalls.length).toBe(2);
  });

  it('/yc-products 带站点参数：元仓货品是账户级数据，返回全部而不是空列表', async () => {
    seedShop1();
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    const layer = (router as any).stack.find((l: any) => l.route?.path === '/yc-products');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(
      { user: { id: 'u1', role: 'owner' }, query: { site: 'MY' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.products.length).toBe(3);
    expect(payload.site).toBe('MY');
  });

  it('冲突映射阻断：元仓同码 A vs 站点映射 A→B → 不再自动采用 B，进入 conflict 待核对', async () => {
    seedShop1({
      mappings: [{ userId: 'u-conf-' + Date.now(), site: 'MY', externalSku: 'SKU-A', targetSku: 'LOCAL-A' }],
    });
    // 元仓有 SKU-A 同码（映射指向 LOCAL-A ≠ SKU-A → 冲突）
    const ycClient = makeYcClient({
      listProducts: () => Promise.resolve([{ customerSku: 'SKU-A', customerSkuName: '元仓同码 A' }]),
    });
    const router = createRestockV3Router({ ycClient });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u-conf-'.concat(String(Date.now())), role: 'owner' }, body: { ...BASE, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    console.error('DEBUG status-called:', res.status.mock.calls, 'review:', JSON.stringify((payload.review ?? []).map((e: any) => ({ k: e.identityKey ?? e.externalSku, s: e.status }))));
    const conflict = (payload.review ?? []).find((entry: any) => entry.externalSku === 'SKU-A');
    expect(conflict).toBeDefined();
    expect(conflict.status).toBe('conflict');
    // LOCAL-A 仍有合法来源（SKU-A2 的站点映射），但 SKU-A 的冲突来源不得混入
    const localA = payload.items.find((item: any) => item.sku === 'LOCAL-A');
    const sourceSkus = localA ? localA.salesSources.map((source: any) => source.externalSku) : [];
    expect(sourceSkus).not.toContain('SKU-A');
  });

  it('多店共仓规则：shopIds 顺序不影响 lead/safety 取值（max 策略）', async () => {
    seedSharedShops([
      { userId: 'u1', shopId: 'shop-1', sku: 'LOCAL-A', leadTimeDays: 12, safetyDays: null, growthPercent: null },
      { userId: 'u1', shopId: 'shop-2', sku: 'LOCAL-A', leadTimeDays: 15, safetyDays: null, growthPercent: null },
    ]);
    const runOrder = async (shopIds: string[]) => {
      const router = createRestockV3Router({ ycClient: makeYcClient() });
      const res = makeRes();
      await getHandler(router, '/recommendations')(
        { user: { id: 'u1', role: 'owner' }, body: { ...BASE, shopIds } } as unknown as Request,
        res,
        jest.fn(),
      );
      const payload = res.json.mock.calls[0][0];
      const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
      return { lead: item.leadTimeDays, arrival: item.arrivalDate, warnings: item.warnings.join('|') };
    };
    const forward = await runOrder(['shop-1', 'shop-2']);
    const backward = await runOrder(['shop-2', 'shop-1']);
    expect(forward.lead).toBe(15);
    expect(backward.lead).toBe(15);
    expect(forward.arrival).toBe(backward.arrival);
    expect(forward.warnings).toContain('不一致');
  });

  it('问题二：同值双编号类型（modelCode=SKU-A 与 variationSku=SKU-A）——typed 店铺映射只作用于选定身份，另一行待核对', async () => {
    mockShopFindFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'shop-1' ? SHOP : null);
    mockShopFindMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      return [SHOP].filter(shop => ids.includes(shop.id));
    });
    mockUploadFindMany.mockResolvedValue(UPLOADS);
    // 一个变体带规格货号 SKU-A（modelCode 行），另一个仅有规格编号 SKU-A（variationSku 行）
    mockItemFindMany.mockResolvedValue([
      {
        uploadId: 'up-1', itemId: '1001', itemName: '键盘', unitsOrdered: 5,
        variations: [
          { variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑', unitsOrdered: 3 },
          { variationSku: 'SKU-A', variationName: '白', unitsOrdered: 2 },
        ],
      },
      {
        uploadId: 'up-2', itemId: '1001', itemName: '键盘', unitsOrdered: 4,
        variations: [
          { variationSku: 'SYS-A1', modelCode: 'SKU-A', variationName: '黑', unitsOrdered: 4 },
          { variationSku: 'SKU-A', variationName: '白', unitsOrdered: 1 },
        ],
      },
    ]);
    mockExternalMappingFindMany.mockResolvedValue([]);
    // 用户在待核对区为 variationSku=SKU-A 的身份保存了映射（externalSkuType=variationSku）
    mockShopMappingFindMany.mockResolvedValue([
      { userId: 'u1', shopId: 'shop-1', site: 'MY', externalSku: 'SKU-A', externalSkuType: 'variationSku', targetSku: 'LOCAL-A' },
    ]);
    mockRestockSkuRuleFindMany.mockResolvedValue([]);
    mockShopRuleFindMany.mockResolvedValue([]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([inventoryRow('LOCAL-A')]);
    const router = createRestockV3Router({ ycClient: makeYcClient() });
    const res = makeRes();
    await getHandler(router, '/recommendations')(
      { user: { id: 'u-typed-' + Date.now(), role: 'owner' }, body: { ...BASE, shopId: 'shop-1' } } as unknown as Request,
      res,
      jest.fn(),
    );
    const payload = res.json.mock.calls[0][0];
    // variationSku 行：typed 映射解除歧义 → confirmed LOCAL-A（仅该身份来源）
    const item = payload.items.find((entry: any) => entry.sku === 'LOCAL-A');
    expect(item).toBeDefined();
    expect(item.matchType).toBe('shop-mapping');
    expect(item.salesSources).toHaveLength(1);
    expect(item.salesSources[0].skuSource).toBe('variationSku');
    // modelCode 行：不被同字符串的 variationSku 映射改写 → 无映射依据进入待核对（而非静默并入 LOCAL-A）
    const modelCodeReview = (payload.review ?? []).find((entry: any) => entry.identityKey === 'modelCode:SKU-A');
    expect(modelCodeReview).toBeDefined();
    expect(modelCodeReview.status).toBe('pending');
  });
});
