import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    usageEvent: { create: jest.fn().mockResolvedValue({}) },
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
  },
  safeRedis: {
    del: jest.fn(),
  },
}));

import { createRestockV2Router, parseYcProductDimensions } from '../restockV2Routes';
import { prisma, safeRedis } from '../../index';

const mockProductFindMany = prisma.product.findMany as jest.Mock;
const mockProductCreate = prisma.product.create as jest.Mock;
const mockProductUpdate = prisma.product.update as jest.Mock;
const mockInventoryFindMany = prisma.inventoryItem.findMany as jest.Mock;
const mockInventoryCreate = prisma.inventoryItem.create as jest.Mock;
const mockInventoryUpdate = prisma.inventoryItem.update as jest.Mock;
const mockWarehouseMappingFindMany = prisma.warehouseMapping.findMany as jest.Mock;
const mockWarehouseMappingCreate = prisma.warehouseMapping.create as jest.Mock;
const mockSafeRedisDel = safeRedis.del as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;

function getHandler(router: ReturnType<typeof createRestockV2Router>, path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('restockV2Routes', () => {
  it('normalizes YC centimeter dimensions and leaves invalid specifications empty', () => {
    expect(parseYcProductDimensions({ length: '10', width: 20, height: 30 })).toEqual({
      ycLengthCm: 10,
      ycWidthCm: 20,
      ycHeightCm: 30,
      ycVolumeM3: 0.006,
    });
    expect(parseYcProductDimensions({ length: 10, width: 0, height: 'bad' })).toEqual({
      ycLengthCm: 10,
      ycWidthCm: null,
      ycHeightCm: null,
      ycVolumeM3: null,
    });
    expect(parseYcProductDimensions(null)).toEqual({
      ycLengthCm: null,
      ycWidthCm: null,
      ycHeightCm: null,
      ycVolumeM3: null,
    });
  });

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
      listProducts: jest.fn().mockResolvedValue([
        {
          customerSku: 'sku-existing',
          productSpecs: { length: 10, width: 20, height: 30 },
        },
        {
          customerSku: 'SKU-NEW',
          productSpecs: { length: 40, width: 50, height: 60 },
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
        ycLengthCm: 10,
        ycWidthCm: 20,
        ycHeightCm: 30,
        ycVolumeM3: 0.006,
        ycSpecsSyncedAt: expect.any(Date),
      }),
    });
    expect(mockProductCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-1',
        name: 'New YC Name',
        sku: 'SKU-NEW',
        country: 'MY',
        sites: ['MY'],
        ycLengthCm: 40,
        ycWidthCm: 50,
        ycHeightCm: 60,
        ycVolumeM3: 0.12,
        ycSpecsSyncedAt: expect.any(Date),
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

  it('previews YC products and marks products already present in the current site', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          customerSku: 'SKU-EXISTING',
          customerSkuName: 'Existing Product',
          available: 5,
          inventory: 8,
        },
        {
          warehouseCode: '001',
          customerSku: 'SKU-NEW',
          customerSkuName: 'New Product',
          available: 12,
          inventory: 12,
        },
      ]),
      listInboundOrders: jest.fn(),
    };
    mockProductFindMany.mockResolvedValueOnce([
      { sku: 'SKU-EXISTING', country: 'MY', sites: ['MY'], siteData: null },
    ]);
    const handler = getHandler(
      createRestockV2Router({ ycClient }),
      '/sync-products/preview',
      'get',
    );
    const req = {
      query: { site: 'MY' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      site: 'MY',
      items: [
        expect.objectContaining({ sku: 'SKU-EXISTING', alreadyInCurrentSite: true }),
        expect.objectContaining({ sku: 'SKU-NEW', alreadyInCurrentSite: false }),
      ],
    }));
  });

  it('syncs only the YC products selected by the user', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: '001', name: 'Malaysia 1', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        {
          warehouseCode: '001',
          customerSku: 'SKU-A',
          customerSkuName: 'Product A',
          available: 5,
          inventory: 8,
        },
        {
          warehouseCode: '001',
          customerSku: 'SKU-B',
          customerSkuName: 'Product B',
          available: 12,
          inventory: 12,
        },
      ]),
      listInboundOrders: jest.fn(),
    };
    mockProductFindMany.mockResolvedValueOnce([]);
    mockInventoryFindMany.mockResolvedValueOnce([]);
    mockWarehouseMappingFindMany.mockResolvedValueOnce([]);
    const handler = getHandler(createRestockV2Router({ ycClient }), '/sync-products', 'post');
    const req = {
      body: { site: 'MY', skus: [' sku-b '] },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(mockProductCreate).toHaveBeenCalledTimes(1);
    expect(mockProductCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sku: 'SKU-B', name: 'Product B' }),
    });
    expect(mockInventoryCreate).toHaveBeenCalledTimes(1);
    expect(mockWarehouseMappingCreate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      syncedSkus: 1,
      createdProducts: 1,
    }));
  });

  it('rejects oversized YC SKU selections before calling the vendor API', async () => {
    const ycClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
    };
    const handler = getHandler(createRestockV2Router({ ycClient }), '/sync-products', 'post');
    const req = {
      body: {
        site: 'MY',
        skus: Array.from({ length: 2001 }, (_, index) => `SKU-${index}`),
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as Partial<Request>;
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid YC SKU selection' });
    expect(ycClient.listProductInventory).not.toHaveBeenCalled();
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
});
