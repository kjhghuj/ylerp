import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    warehouseMapping: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    restockSalesImport: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    restockSalesItem: {
      findFirst: jest.fn(),
      update: jest.fn(),
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

import { createRestockV2Router } from '../restockV2Routes';
import { prisma, safeRedis } from '../../index';

const mockProductFindMany = prisma.product.findMany as jest.Mock;
const mockProductCreate = prisma.product.create as jest.Mock;
const mockProductUpdate = prisma.product.update as jest.Mock;
const mockInventoryFindMany = prisma.inventoryItem.findMany as jest.Mock;
const mockInventoryCreate = prisma.inventoryItem.create as jest.Mock;
const mockInventoryUpdate = prisma.inventoryItem.update as jest.Mock;
const mockWarehouseMappingFindMany = prisma.warehouseMapping.findMany as jest.Mock;
const mockWarehouseMappingCreate = prisma.warehouseMapping.create as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockSafeRedisDel = safeRedis.del as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;
const mockSalesImportCreate = (prisma as any).restockSalesImport.create as jest.Mock;
const mockSalesImportFindFirst = (prisma as any).restockSalesImport.findFirst as jest.Mock;
const mockSalesImportFindMany = (prisma as any).restockSalesImport.findMany as jest.Mock;
const mockSalesItemFindFirst = (prisma as any).restockSalesItem.findFirst as jest.Mock;
const mockSalesItemUpdate = (prisma as any).restockSalesItem.update as jest.Mock;
const mockExternalMappingFindMany = (prisma as any).externalSkuMapping.findMany as jest.Mock;
const mockExternalMappingUpsert = (prisma as any).externalSkuMapping.upsert as jest.Mock;
const mockRestockSkuRuleFindMany = (prisma as any).restockSkuRule.findMany as jest.Mock;
const mockRestockSkuRuleUpsert = (prisma as any).restockSkuRule.upsert as jest.Mock;

function getHandler(router: ReturnType<typeof createRestockV2Router>, path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function getRouteHandlers(router: ReturnType<typeof createRestockV2Router>, path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack.map((entry: any) => entry.handle);
}

describe('restockV2Routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([]);
    mockWarehouseMappingFindMany.mockResolvedValue([]);
    mockProductCreate.mockImplementation(({ data }) => Promise.resolve({ id: `product-${data.sku}`, ...data }));
    mockProductUpdate.mockImplementation(({ data }) => Promise.resolve(data));
    mockInventoryCreate.mockImplementation(({ data }) => Promise.resolve({ id: `inventory-${data.sku}`, ...data }));
    mockInventoryUpdate.mockImplementation(({ data }) => Promise.resolve(data));
    mockWarehouseMappingCreate.mockImplementation(({ data }) => Promise.resolve({ id: `mapping-${data.sku}`, ...data }));
    mockTransaction.mockImplementation((callback: any) => callback(prisma));
  });

  it('returns a non-executable 503 response when YC is not configured', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(false),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');

    const req = {
      query: { site: 'MY', planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: '25' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listProductInventory).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Restock data is temporarily unavailable' });
    expect(mockProductFindMany).not.toHaveBeenCalled();
  });

  it('returns an explicit empty stock snapshot when YC is not configured', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(false),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/stock-snapshot');
    const req = {
      query: { site: 'PH' }, user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      site: 'PH', remoteFetched: false, warehouseCodes: [],
      warnings: ['YC credentials are not configured'], items: [],
    });
    expect(ycClient.listProductInventory).not.toHaveBeenCalled();
  });

  it('discovers enabled YC warehouses for the selected site before fetching recommendations', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
        { code: '021', name: 'Philippines 1', siteCode: 'PH' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'SKU-1',
          available: 12,
        },
      ]),
      listInboundOrders: jest.fn().mockResolvedValue([]),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');

    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'Remote Product',
        sku: 'SKU-1',
        country: 'MY',
        sites: ['MY'],
        cost: 10,
        siteData: { MY: { totalRevenue: 30 } },
      },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: 'inventory-1',
        name: 'Remote Product',
        sku: 'SKU-1',
        currentStock: 99,
        stockOfficial: 99,
        stockThirdParty: 0,
        inTransit: 0,
        dailySales: 2,
        leadTime: 25,
        replenishCycle: 30,
        costPerUnit: 10,
      },
    ]);

    const req = {
      query: { site: 'MY', planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: '25' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listCustomerWarehouses).toHaveBeenCalled();
    expect(ycClient.listProductInventory).toHaveBeenCalledWith({
      warehouseCodes: ['001'],
      customerSkus: ['SKU-1'],
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      integration: expect.objectContaining({
        ycConfigured: true,
        remoteFetched: true,
        stockSource: 'yc',
        warehouseCodes: ['001'],
        warnings: [],
      }),
    }));
  });

  it('uses third-party warehouse mappings to query YC customer SKUs and map stock back to ERP SKUs', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'YC-SKU-1',
          available: 8,
        },
      ]),
      listInboundOrders: jest.fn().mockResolvedValue([]),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');

    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'Mapped Product',
        sku: 'ERP-SKU-1',
        country: 'MY',
        sites: ['MY'],
        cost: 10,
        siteData: { MY: { totalRevenue: 30 } },
      },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: 'inventory-1',
        name: 'Mapped Product',
        sku: 'ERP-SKU-1',
        currentStock: 99,
        stockOfficial: 99,
        stockThirdParty: 0,
        inTransit: 0,
        dailySales: 2,
        leadTime: 25,
        replenishCycle: 30,
        costPerUnit: 10,
      },
    ]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([
      {
        id: 'mapping-1',
        sku: 'ERP-SKU-1',
        thirdPartyWarehouseId: 'YC-SKU-1',
        type: 'third',
      },
    ]);

    const req = {
      query: { site: 'MY', planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: '25' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listProductInventory).toHaveBeenCalledWith({
      warehouseCodes: ['001'],
      customerSkus: ['ERP-SKU-1', 'YC-SKU-1'],
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({
          sku: 'ERP-SKU-1',
          availableStock: 8,
          stockSource: 'yc',
        }),
      ]),
    }));
  });

  it('passes target-date parameters and the same YC SKU alias into stock and inbound calculations', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'YC-SKU-1',
          available: 200,
        },
      ]),
      listInboundOrders: jest.fn().mockResolvedValue([
        {
          warehouseOrderNo: 'IN-1',
          status: 2,
          estimatedArrivalDate: '2026-07-20',
          details: [{ productSku: 'YC-SKU-1', quantity: 50, shiftNum: 0 }],
        },
      ]),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');

    mockProductFindMany.mockResolvedValueOnce([{
      id: 'product-1',
      name: 'Mapped Product',
      sku: 'ERP-SKU-1',
      country: 'MY',
      sites: ['MY'],
      cost: 10,
      siteData: { MY: { totalRevenue: 30 } },
    }]);
    mockInventoryFindMany.mockResolvedValueOnce([{
      id: 'inventory-1',
      name: 'Mapped Product',
      sku: 'ERP-SKU-1',
      currentStock: 999,
      stockOfficial: 999,
      stockThirdParty: 0,
      inTransit: 999,
      dailySales: 10,
      leadTime: 25,
      replenishCycle: 30,
      costPerUnit: 10,
    }]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([{
      id: 'mapping-1',
      sku: 'ERP-SKU-1',
      thirdPartyWarehouseId: 'YC-SKU-1',
      type: 'third',
    }]);

    const req = {
      query: {
        site: 'MY',
        planningDate: '2026-07-01',
        targetDate: '2026-10-01',
        leadTimeDays: '31',
        safetyDays: '30',
        growthPercent: '0',
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        sku: 'ERP-SKU-1',
        planningDate: '2026-07-01',
        arrivalDate: '2026-08-01',
        targetDate: '2026-10-01',
        coverageDays: 61,
        safetyDays: 30,
        growthPercent: 0,
        availableStock: 200,
        inTransitBeforeArrival: 50,
        suggestedQty: 910,
      })],
    }));
  });

  it('returns a generic 400 response for invalid planning parameters', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(false),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');
    const req = {
      query: {
        site: 'MY',
        planningDate: '2026-07-01',
        targetDate: '2026-07-31',
        leadTimeDays: '31',
        safetyDays: '-1',
        growthPercent: '0',
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid restock parameters' });
    expect(mockProductFindMany).not.toHaveBeenCalled();
  });

  it('requires targetDate before querying databases or YC', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');
    const req = {
      query: { site: 'MY', planningDate: '2026-07-01', leadTimeDays: '25' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid restock parameters' });
    expect(mockProductFindMany).not.toHaveBeenCalled();
    expect(ycClient.listCustomerWarehouses).not.toHaveBeenCalled();
  });

  it.each(['stock', 'inbound'] as const)(
    'returns 503 without recommendations when the YC %s source fails independently',
    async failingSource => {
      const ycClient = {
        isConfigured: jest.fn().mockReturnValue(true),
        listCustomerWarehouses: jest.fn().mockResolvedValue([
          { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
        ]),
        listProductInventory: failingSource === 'stock'
          ? jest.fn().mockRejectedValue(new Error('private vendor stock message'))
          : jest.fn().mockResolvedValue([{ customerSku: 'SKU-1', available: 10, siteCode: 'MY' }]),
        listInboundOrders: failingSource === 'inbound'
          ? jest.fn().mockRejectedValue(new Error('private vendor inbound message'))
          : jest.fn().mockResolvedValue([]),
      };
      const router = createRestockV2Router({ ycClient });
      const handler = getHandler(router, '/recommendations');
      mockProductFindMany.mockResolvedValueOnce([{
        id: 'product-1', name: 'Product', sku: 'SKU-1', country: 'MY', sites: ['MY'], cost: 10,
      }]);
      mockInventoryFindMany.mockResolvedValueOnce([{
        id: 'inventory-1', name: 'Product', sku: 'SKU-1', currentStock: 10,
        stockOfficial: 10, stockThirdParty: 0, inTransit: 0, dailySales: 1,
        leadTime: 25, replenishCycle: 30, costPerUnit: 10,
      }]);
      const req = {
        query: { site: 'MY', planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: '25' },
        user: { id: 'owner-1', username: 'owner', role: 'owner' },
      } as Partial<Request>;
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await handler(req as Request, res as Response, jest.fn());

      expect(ycClient.listProductInventory).toHaveBeenCalled();
      expect(ycClient.listInboundOrders).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Restock data is temporarily unavailable' });
      expect(JSON.stringify((res.json as jest.Mock).mock.calls)).not.toContain('private vendor');
      warnSpy.mockRestore();
    },
  );

  it.each([
    ['/sites', 'get', 'restock-v2.view'],
    ['/stock-snapshot', 'get', 'restock-v2.view'],
    ['/recommendations', 'get', 'restock-v2.view'],
    ['/recommendations', 'post', 'restock-v2.view'],
    ['/sync-products', 'post', 'restock-v2.refresh'],
    ['/sales-imports', 'post', 'restock-v2.refresh'],
    ['/sales-imports/latest', 'get', 'restock-v2.view'],
    ['/sales-imports/:importId/items/:itemId/dismissal', 'patch', 'restock-v2.refresh'],
    ['/sku-rules', 'get', 'restock-v2.view'],
    ['/sku-rules/:sku', 'put', 'restock-v2.refresh'],
  ] as const)('returns 403 when %s lacks %s permission', async (path, method, permission) => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const [permissionHandler] = getRouteHandlers(router, path, method);
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'viewer-1', role: 'viewer', isActive: true, permissions: [],
    });
    const req = {
      query: {}, body: {},
      user: { id: 'viewer-1', username: 'viewer', role: 'viewer' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;
    const next = jest.fn();

    await permissionHandler(req as Request, res as Response, next);

    expect(mockUserFindUnique).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
    expect(permission).toMatch(/^restock-v2\./);
  });

  it('ignores identity YC mappings so exact SKU matches are not queried twice', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'Sku-1',
          available: 12,
        },
      ]),
      listInboundOrders: jest.fn().mockResolvedValue([]),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations');

    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'Exact SKU Product',
        sku: 'Sku-1',
        country: 'MY',
        sites: ['MY'],
        cost: 10,
        siteData: { MY: { totalRevenue: 30 } },
      },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: 'inventory-1',
        name: 'Exact SKU Product',
        sku: 'Sku-1',
        currentStock: 99,
        stockOfficial: 99,
        stockThirdParty: 0,
        inTransit: 0,
        dailySales: 2,
        leadTime: 25,
        replenishCycle: 30,
        costPerUnit: 10,
      },
    ]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([
      {
        id: 'mapping-1',
        sku: 'Sku-1',
        thirdPartyWarehouseId: 'sku-1',
        type: 'third',
      },
    ]);

    const req = {
      query: { site: 'MY', planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: '25' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listProductInventory).toHaveBeenCalledWith({
      warehouseCodes: ['001'],
      customerSkus: ['Sku-1'],
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({
          sku: 'Sku-1',
          availableStock: 12,
          stockSource: 'yc',
        }),
      ]),
    }));
  });

  it('returns a site YC stock snapshot for product-list display', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'ERP-SKU-1',
          customerSkuName: 'Exact Product',
          available: 7,
          inventory: 10,
          occupy: 2,
          unshipped: 1,
        },
        {
          warehouseCode: '001',
          warehouseName: 'Malaysia 1',
          siteCode: 'MY',
          customerSku: 'YC-SKU-2',
          customerSkuName: 'Mapped Product',
          available: 12,
          inventory: 13,
          occupy: 1,
          unshipped: 0,
        },
      ]),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/stock-snapshot');

    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'Exact Product',
        sku: 'ERP-SKU-1',
        country: 'MY',
        sites: ['MY'],
      },
      {
        id: 'product-2',
        name: 'Mapped Product',
        sku: 'ERP-SKU-2',
        country: 'MY',
        sites: ['MY'],
      },
    ]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([
      {
        id: 'mapping-1',
        sku: 'ERP-SKU-2',
        thirdPartyWarehouseId: 'YC-SKU-2',
        type: 'third',
      },
    ]);

    const req = {
      query: { site: 'MY' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listProductInventory).toHaveBeenCalledWith({
      warehouseCodes: ['001'],
      customerSkus: ['ERP-SKU-1', 'ERP-SKU-2', 'YC-SKU-2'],
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      site: 'MY',
      remoteFetched: true,
      warehouseCodes: ['001'],
      items: expect.arrayContaining([
        expect.objectContaining({
          sku: 'ERP-SKU-1',
          available: 7,
          inventory: 10,
          occupy: 2,
          unshipped: 1,
          warehouseCodes: ['001'],
        }),
        expect.objectContaining({
          sku: 'ERP-SKU-2',
          available: 12,
          inventory: 13,
          occupy: 1,
          unshipped: 0,
          warehouseCodes: ['001'],
        }),
      ]),
    }));
  });

  it('syncs YC stock products into local product details and inventory records', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          customerSku: 'SKU-EXISTING',
          customerSkuName: 'Existing YC Name',
          available: 5,
          inventory: 8,
          occupy: 2,
          unshipped: 1,
        },
        {
          warehouseCode: '001',
          customerSku: 'SKU-NEW',
          customerSkuName: 'New YC Name',
          available: 12,
          inventory: 12,
        },
      ]),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/sync-products', 'post');

    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'product-existing',
        name: 'Existing Local Name',
        sku: 'SKU-EXISTING',
        country: null,
        sites: [],
        cost: 9,
        siteData: null,
      },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: 'inventory-existing',
        name: 'Existing Local Name',
        sku: 'SKU-EXISTING',
        stockOfficial: 2,
        stockThirdParty: 0,
        currentStock: 2,
        inTransit: 0,
        dailySales: 3,
        leadTime: 20,
        replenishCycle: 30,
        costPerUnit: 9,
      },
    ]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([]);

    const req = {
      body: { site: 'MY' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(ycClient.listProductInventory).toHaveBeenCalledWith({
      warehouseCodes: ['001'],
      customerSkus: [],
    });
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-existing' },
      data: expect.objectContaining({
        country: 'MY',
        sites: ['MY'],
      }),
    });
    expect(mockProductCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-1',
        name: 'New YC Name',
        sku: 'SKU-NEW',
        country: 'MY',
        sites: ['MY'],
      }),
    });
    expect(mockInventoryUpdate).toHaveBeenCalledWith({
      where: { id: 'inventory-existing' },
      data: expect.objectContaining({
        stockOfficial: 2,
        stockThirdParty: 5,
        currentStock: 7,
        dailySales: 3,
      }),
    });
    expect(mockInventoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-1',
        name: 'New YC Name',
        sku: 'SKU-NEW',
        currentStock: 12,
        stockThirdParty: 12,
        dailySales: 0,
      }),
    });
    expect(mockWarehouseMappingCreate).toHaveBeenCalledTimes(2);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockSafeRedisDel).toHaveBeenCalledWith('products:v2:owner-1');
    expect(mockSafeRedisDel).toHaveBeenCalledWith('warehouse-mappings:owner-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      site: 'MY',
      warehouseCodes: ['001'],
      fetchedRows: 2,
      syncedSkus: 2,
      createdProducts: 1,
      updatedProducts: 1,
      createdInventoryItems: 1,
      updatedInventoryItems: 1,
      createdMappings: 2,
    }));
  });

  it('rejects invalid YC stock numbers during sync without writing local data', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([{
        warehouseCode: '001', customerSku: 'SKU-BAD', available: '', inventory: 10,
      }]),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/sync-products', 'post');
    const req = {
      body: { site: 'MY' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Restock data is temporarily unavailable' });
    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(mockInventoryCreate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('imports effective sales with exact normalization, aggregation, reusable mapping, and pending rows', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports', 'post');
    mockExternalMappingFindMany.mockResolvedValueOnce([
      { externalSku: 'FOO-BAR', targetSku: 'ERP-1' },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'ERP-1' }]);
    mockSalesImportCreate.mockImplementationOnce(({ data, include }) => Promise.resolve({
      id: 'import-1',
      ...data,
      items: include?.items ? data.items.create.map((item: any, index: number) => ({ id: `item-${index}`, ...item })) : [],
    }));

    const req = {
      body: {
        site: 'ph',
        fileName: 'sales.xlsx',
        rows: [
          { platformSku: '\tfoo\t-bar ', validSales: 2, title: 'First' },
          { platformSku: 'FOO-BAR', validSales: 3, title: 'Second' },
          { platformSku: '', sourceSku: 'raw-1', validSales: 4, title: 'Unknown' },
        ],
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockExternalMappingFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'owner-1', site: 'PH' }),
    }));
    expect(mockSalesImportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'owner-1',
        site: 'PH',
        fileName: 'sales.xlsx',
        statisticsDays: 30,
        items: {
          create: expect.arrayContaining([
            expect.objectContaining({ platformSku: 'FOO-BAR', validSales: 5, targetSku: 'ERP-1' }),
            expect.objectContaining({ platformSku: null, sourceSku: 'RAW-1', validSales: 4, targetSku: null }),
          ]),
        },
      }),
      include: { items: true },
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      import: expect.objectContaining({ id: 'import-1', statisticsDays: 30 }),
      aggregates: [expect.objectContaining({ targetSku: 'ERP-1', validSales: 5 })],
      pending: [expect.objectContaining({ sourceSku: 'RAW-1' })],
    }));
  });

  it('does not query or reuse an existing source SKU mapping when platform SKU is missing', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports', 'post');
    mockExternalMappingFindMany.mockResolvedValueOnce([
      { externalSku: 'SOURCE-1', targetSku: 'ERP-1' },
    ]);
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'ERP-1' }]);
    mockSalesImportCreate.mockImplementationOnce(({ data }) => Promise.resolve({
      id: 'import-1',
      ...data,
      items: data.items.create.map((item: any, index: number) => ({ id: `item-${index}`, ...item })),
    }));
    const req = {
      body: {
        site: 'PH', fileName: 'sales.xlsx', statisticsDays: 30,
        rows: [{ platformSku: null, sourceSku: ' source-1 ', validSales: 4 }],
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockExternalMappingFindMany).not.toHaveBeenCalled();
    expect(mockSalesImportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ sourceSku: 'SOURCE-1', targetSku: null })] },
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      aggregates: [],
      pending: [expect.objectContaining({ sourceSku: 'SOURCE-1', targetSku: null })],
    }));
  });

  it('creates a fresh active row when the same SKU is re-imported after a prior batch dismissal', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const importHandler = getHandler(router, '/sales-imports', 'post');
    const latestHandler = getHandler(router, '/sales-imports/latest');
    const priorImport = {
      id: 'import-old', userId: 'owner-1', site: 'PH', fileName: 'old.xlsx', statisticsDays: 30,
      createdAt: new Date('2026-06-01T00:00:00.000Z'), updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      items: [{
        id: 'item-old', importId: 'import-old', platformSku: 'REPEAT-SKU', sourceSku: null,
        targetSku: null, validSales: 3, dismissedAt: new Date('2026-06-02T00:00:00.000Z'),
      }],
    };
    let latestImport: any = priorImport;
    mockExternalMappingFindMany.mockResolvedValueOnce([]);
    mockSalesImportCreate.mockImplementationOnce(({ data }) => {
      latestImport = {
        id: 'import-new', ...data,
        createdAt: new Date('2026-07-11T00:00:00.000Z'),
        updatedAt: new Date('2026-07-11T00:00:00.000Z'),
        items: data.items.create.map((item: any, index: number) => ({
          id: `item-new-${index}`, importId: 'import-new', ...item, dismissedAt: item.dismissedAt ?? null,
        })),
      };
      return Promise.resolve(latestImport);
    });
    mockSalesImportFindFirst.mockImplementationOnce(() => Promise.resolve(latestImport));

    const importReq = {
      body: {
        site: 'PH', fileName: 'new.xlsx', statisticsDays: 30,
        rows: [{ platformSku: ' repeat-sku ', validSales: 7, title: 'Fresh row' }],
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const importRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await importHandler(importReq as Request, importRes as Response, jest.fn());

    expect(priorImport.items[0].dismissedAt).toEqual(new Date('2026-06-02T00:00:00.000Z'));
    expect(latestImport.items).toEqual([
      expect.objectContaining({ platformSku: 'REPEAT-SKU', validSales: 7, dismissedAt: null }),
    ]);
    expect(importRes.json).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ platformSku: 'REPEAT-SKU', dismissedAt: null })],
      pending: [expect.objectContaining({ platformSku: 'REPEAT-SKU', dismissedAt: null })],
    }));

    const latestReq = {
      query: { site: 'PH' }, user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const latestRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await latestHandler(latestReq as Request, latestRes as Response, jest.fn());

    expect(latestRes.json).toHaveBeenCalledWith(expect.objectContaining({
      import: expect.objectContaining({ id: 'import-new' }),
      items: [expect.objectContaining({ id: 'item-new-0', dismissedAt: null })],
      pending: [expect.objectContaining({ id: 'item-new-0', dismissedAt: null })],
    }));
  });

  it.each([
    { site: '', fileName: 'sales.xlsx', statisticsDays: 30, rows: [{ platformSku: 'A', validSales: 1 }] },
    { site: 'PH', fileName: 'sales.xlsx', statisticsDays: 0, rows: [{ platformSku: 'A', validSales: 1 }] },
    { site: 'PH', fileName: 'sales.xlsx', statisticsDays: 30, rows: [{ platformSku: 'A', validSales: -1 }] },
    { site: 'PH', fileName: 'x'.repeat(256), statisticsDays: 30, rows: [{ platformSku: 'A', validSales: 1 }] },
  ])('rejects an invalid sales import payload without database writes', async body => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports', 'post');
    const req = { body, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSalesImportCreate).not.toHaveBeenCalled();
  });

  it('returns the latest import for only the authenticated user and selected site', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/latest');
    mockSalesImportFindFirst.mockResolvedValueOnce({
      id: 'import-1', userId: 'owner-1', site: 'PH', fileName: 'sales.xlsx', statisticsDays: 30,
      items: [
        { id: 'item-1', platformSku: 'A', sourceSku: null, targetSku: null, validSales: 2, dismissedAt: null },
        { id: 'item-dismissed', platformSku: 'B', sourceSku: null, targetSku: null, validSales: 9, dismissedAt: new Date('2026-07-11T00:00:00.000Z') },
      ],
    });
    const req = { query: { site: 'ph' }, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner-1', site: 'PH' },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }));
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.items).toEqual([expect.objectContaining({ id: 'item-1' })]);
    expect(body.pending).toEqual([expect.objectContaining({ id: 'item-1' })]);
  });

  it('returns a requested import only from the authenticated user scope', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:id');
    mockSalesImportFindFirst.mockResolvedValueOnce({
      id: 'import-1', userId: 'owner-1', site: 'PH', fileName: 'sales.xlsx', statisticsDays: 30,
      items: [{ id: 'item-1', platformSku: 'A', sourceSku: null, targetSku: 'ERP-1', validSales: 2 }],
    });
    const req = {
      params: { id: 'import-1' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith({
      where: { id: 'import-1', userId: 'owner-1' }, include: { items: true },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      import: expect.objectContaining({ id: 'import-1' }),
      aggregates: [{ targetSku: 'ERP-1', validSales: 2, itemIds: ['item-1'] }],
      pending: [],
    }));
  });

  it('returns 404 when mapping an import outside the authenticated user scope', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/mapping', 'put');
    mockSalesImportFindFirst.mockResolvedValueOnce(null);
    const req = {
      params: { importId: 'another-users-import', itemId: 'item-1' },
      body: { targetSku: 'ERP-1' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'another-users-import', userId: 'owner-1' },
    }));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSalesItemUpdate).not.toHaveBeenCalled();
  });

  it('dismisses an item only within an owned sales-import batch', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/dismissal', 'patch');
    const dismissedAt = new Date('2026-07-11T00:00:00.000Z');
    mockSalesImportFindFirst.mockResolvedValueOnce({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValueOnce({ id: 'item-1', importId: 'import-1', dismissedAt: null });
    mockSalesItemUpdate.mockResolvedValueOnce({ id: 'item-1', importId: 'import-1', dismissedAt });
    const req = {
      params: { importId: 'import-1', itemId: 'item-1' }, body: { dismissed: true },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith({ where: { id: 'import-1', userId: 'owner-1' } });
    expect(mockSalesItemFindFirst).toHaveBeenCalledWith({ where: { id: 'item-1', importId: 'import-1' } });
    expect(mockSalesItemUpdate).toHaveBeenCalledWith({
      where: { id: 'item-1' }, data: { dismissedAt: expect.any(Date) },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1', dismissedAt }));
  });

  it('rejects dismissal for another user\'s sales-import batch without updating an item', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/dismissal', 'patch');
    mockSalesImportFindFirst.mockResolvedValueOnce(null);
    const req = {
      params: { importId: 'other-user-import', itemId: 'item-1' }, body: { dismissed: true },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSalesItemUpdate).not.toHaveBeenCalled();
  });

  it('rejects dismissal when the item does not belong to the specified sales-import batch', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/dismissal', 'patch');
    mockSalesImportFindFirst.mockResolvedValueOnce({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValueOnce(null);
    const req = {
      params: { importId: 'import-1', itemId: 'item-from-another-import' }, body: { dismissed: true },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSalesItemUpdate).not.toHaveBeenCalled();
  });

  it('maps a pending item to an exact owned inventory SKU and stores a reusable mapping', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/mapping', 'put');
    mockSalesImportFindFirst.mockResolvedValueOnce({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValueOnce({
      id: 'item-1', importId: 'import-1', platformSku: 'PLATFORM-1', sourceSku: null, validSales: 5,
    });
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'Erp-1' }]);
    mockSalesItemUpdate.mockResolvedValueOnce({
      id: 'item-1', importId: 'import-1', platformSku: 'PLATFORM-1', targetSku: 'ERP-1', validSales: 5,
    });
    mockExternalMappingUpsert.mockResolvedValueOnce({ externalSku: 'PLATFORM-1', targetSku: 'ERP-1' });
    const req = {
      params: { importId: 'import-1', itemId: 'item-1' },
      body: { targetSku: '\terp-1 ' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockExternalMappingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_site_externalSku: { userId: 'owner-1', site: 'PH', externalSku: 'PLATFORM-1' } },
      create: { userId: 'owner-1', site: 'PH', externalSku: 'PLATFORM-1', targetSku: 'ERP-1' },
    }));
    expect(mockSalesItemUpdate).toHaveBeenCalledWith({
      where: { id: 'item-1' }, data: { targetSku: 'ERP-1' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ targetSku: 'ERP-1' }));
  });

  it('maps an item without platform SKU without storing a reusable source SKU mapping', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/mapping', 'put');
    mockSalesImportFindFirst.mockResolvedValueOnce({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValueOnce({
      id: 'item-1', importId: 'import-1', platformSku: null, sourceSku: 'SOURCE-1', validSales: 5,
    });
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'ERP-1' }]);
    mockSalesItemUpdate.mockResolvedValueOnce({
      id: 'item-1', importId: 'import-1', platformSku: null, sourceSku: 'SOURCE-1', targetSku: 'ERP-1', validSales: 5,
    });
    const req = {
      params: { importId: 'import-1', itemId: 'item-1' }, body: { targetSku: 'ERP-1' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockExternalMappingUpsert).not.toHaveBeenCalled();
    expect(mockSalesItemUpdate).toHaveBeenCalledWith({
      where: { id: 'item-1' }, data: { targetSku: 'ERP-1' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ targetSku: 'ERP-1' }));
  });

  it('rejects mapping to an inventory SKU not owned by the authenticated user', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/mapping', 'put');
    mockSalesImportFindFirst.mockResolvedValueOnce({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValueOnce({
      id: 'item-1', importId: 'import-1', platformSku: 'PLATFORM-1', validSales: 5,
    });
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'OWNED-SKU' }]);
    const req = {
      params: { importId: 'import-1', itemId: 'item-1' }, body: { targetSku: 'OTHER-USERS-SKU' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockInventoryFindMany).toHaveBeenCalledWith({ where: { userId: 'owner-1' }, select: { sku: true } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExternalMappingUpsert).not.toHaveBeenCalled();
    expect(mockSalesItemUpdate).not.toHaveBeenCalled();
  });

  it('upserts and lists per-SKU nullable restock rule overrides in the user/site scope', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const putHandler = getHandler(router, '/sku-rules/:sku', 'put');
    const getHandlerForRules = getHandler(router, '/sku-rules');
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'ERP-1' }]);
    mockRestockSkuRuleUpsert.mockResolvedValueOnce({
      id: 'rule-1', userId: 'owner-1', site: 'PH', sku: 'ERP-1', leadTimeDays: null, safetyDays: 45, growthPercent: 10,
    });
    const putReq = {
      params: { sku: 'erp-1' }, body: { site: 'ph', leadTimeDays: null, safetyDays: 45, growthPercent: 10 },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const putRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await putHandler(putReq as Request, putRes as Response, jest.fn());

    expect(mockRestockSkuRuleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_site_sku: { userId: 'owner-1', site: 'PH', sku: 'ERP-1' } },
      create: expect.objectContaining({ userId: 'owner-1', site: 'PH', sku: 'ERP-1', leadTimeDays: null }),
      update: { leadTimeDays: null, safetyDays: 45, growthPercent: 10 },
    }));

    mockRestockSkuRuleFindMany.mockResolvedValueOnce([{ id: 'rule-1', sku: 'ERP-1' }]);
    const getReq = { query: { site: 'ph' }, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as Partial<Request>;
    const getRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;
    await getHandlerForRules(getReq as Request, getRes as Response, jest.fn());
    expect(mockRestockSkuRuleFindMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1', site: 'PH' }, orderBy: { sku: 'asc' },
    });
  });

  it('rejects out-of-range SKU rule values before any database write', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sku-rules/:sku', 'put');
    const req = {
      params: { sku: 'ERP-1' }, body: { site: 'PH', leadTimeDays: -1, safetyDays: 30, growthPercent: 0 },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRestockSkuRuleUpsert).not.toHaveBeenCalled();
  });

  it('rejects a SKU rule for an inventory SKU not owned by the authenticated user', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/sku-rules/:sku', 'put');
    mockInventoryFindMany.mockResolvedValueOnce([{ sku: 'OWNED-SKU' }]);
    const req = {
      params: { sku: 'OTHER-SKU' }, body: { site: 'PH', leadTimeDays: null, safetyDays: 30, growthPercent: 0 },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Inventory SKU not found' });
    expect(mockRestockSkuRuleUpsert).not.toHaveBeenCalled();
  });

  it('builds POST recommendations from selected mapped effective sales and excludes pending items', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([{ code: '021', name: 'PH', siteCode: 'PH' }]),
      listProductInventory: jest.fn().mockResolvedValue([{ customerSku: 'ERP-1', available: 0, siteCode: 'PH' }]),
      listInboundOrders: jest.fn().mockResolvedValue([]),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations', 'post');
    mockSalesImportFindFirst.mockResolvedValueOnce({
      id: 'import-1', userId: 'owner-1', site: 'PH', statisticsDays: 30,
      items: [
        { id: 'item-1', targetSku: 'ERP-1', validSales: 300 },
        { id: 'item-2', targetSku: null, validSales: 999 },
        { id: 'item-dismissed-mapped', targetSku: 'ERP-1', validSales: 300, dismissedAt: new Date('2026-07-11T00:00:00.000Z') },
        { id: 'item-dismissed-pending', targetSku: null, validSales: 999, dismissedAt: new Date('2026-07-11T00:00:00.000Z') },
      ],
    });
    mockInventoryFindMany.mockResolvedValueOnce([{
      id: 'inventory-1', name: 'ERP 1', sku: 'ERP-1', dailySales: 999, leadTime: 25,
      replenishCycle: 30, costPerUnit: 10, currentStock: 100, stockOfficial: 100,
      stockThirdParty: 0, inTransit: 0,
    }]);
    mockProductFindMany.mockResolvedValueOnce([{
      id: 'product-1', name: 'ERP 1', sku: 'ERP-1', country: 'PH', sites: ['PH'], cost: 10,
    }]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([]);
    mockRestockSkuRuleFindMany.mockResolvedValueOnce([{
      sku: 'ERP-1', leadTimeDays: 31, safetyDays: 30, growthPercent: 0,
    }]);
    const req = {
      body: {
        site: 'PH', salesImportId: 'import-1', planningDate: '2026-07-01', targetDate: '2026-10-01',
        leadTimeDays: 25, safetyDays: 30, growthPercent: 0,
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'import-1', userId: 'owner-1', site: 'PH' }, include: { items: true },
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ sku: 'ERP-1', dailySales: 10, leadTimeDays: 31 })],
      metadata: expect.objectContaining({ salesImportId: 'import-1', statisticsDays: 30, pendingCount: 1 }),
    }));
  });

  it('returns 404 when POST recommendations selects another user\'s sales import', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/recommendations', 'post');
    mockSalesImportFindFirst.mockResolvedValueOnce(null);
    const req = {
      body: {
        site: 'PH', salesImportId: 'other-user-import', planningDate: '2026-07-01',
        targetDate: '2026-10-01', leadTimeDays: 25,
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockSalesImportFindFirst).toHaveBeenCalledWith({
      where: { id: 'other-user-import', userId: 'owner-1', site: 'PH' }, include: { items: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(ycClient.listProductInventory).not.toHaveBeenCalled();
  });

  it('allows an owned product without YC inventory to be mapped by creating a zero-stock local inventory record', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/sales-imports/:importId/items/:itemId/mapping', 'put');
    mockSalesImportFindFirst.mockResolvedValue({ id: 'import-1', userId: 'owner-1', site: 'PH' });
    mockSalesItemFindFirst.mockResolvedValue({ id: 'item-1', importId: 'import-1', platformSku: 'FPG-WHITE' });
    mockInventoryFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([{ id: 'product-1', sku: 'LOCAL-ONLY', name: 'Local only', cost: 12 }]);
    mockSalesItemUpdate.mockImplementation(({ data }) => Promise.resolve({ id: 'item-1', ...data }));

    const req = {
      params: { importId: 'import-1', itemId: 'item-1' },
      body: { targetSku: 'local-only' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockInventoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sku: 'LOCAL-ONLY', stockThirdParty: 0, currentStock: 0 }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ targetSku: 'LOCAL-ONLY' }));
  });

  it('creates a local target SKU for an unmapped sales item without creating a YC warehouse mapping', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const router = createRestockV2Router({ ycClient });
    const handler = getHandler(router, '/target-skus', 'post');
    mockProductFindMany.mockResolvedValue([]);
    mockInventoryFindMany.mockResolvedValue([]);

    const req = {
      body: { site: 'PH', sku: ' manual-new\t', name: 'Manual product' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockProductCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sku: 'MANUAL-NEW', name: 'Manual product', sites: ['PH'], userId: 'owner-1' }),
    }));
    expect(mockInventoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sku: 'MANUAL-NEW', stockThirdParty: 0, currentStock: 0, userId: 'owner-1' }),
    }));
    expect(mockWarehouseMappingCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sku: 'MANUAL-NEW', name: 'Manual product' }));
  });

  it('rejects invalid and duplicate local target SKU creation in the authenticated user scope', async () => {
    const router = createRestockV2Router({ ycClient: { isConfigured: jest.fn().mockReturnValue(false) } as any });
    const handler = getHandler(router, '/target-skus', 'post');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as Partial<Response>;

    await handler({ body: { site: 'PH', sku: '' }, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as Request, res as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    jest.clearAllMocks();
    mockProductFindMany.mockResolvedValue([{ sku: 'EXISTS-1' }]);
    mockInventoryFindMany.mockResolvedValue([]);
    await handler({ body: { site: 'PH', sku: 'exists-1' }, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockInventoryCreate).not.toHaveBeenCalled();
  });
});
