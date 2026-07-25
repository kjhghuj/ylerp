import type { PrismaClient } from '@prisma/client';
import { createDashboardSnapshotLoader } from '../dashboardSnapshotLoader';
import type { YcOpenPlatformClient } from '../ycOpenPlatformClient';

describe('dashboard snapshot loading and caching', () => {
  it('uses the latest strict 30-day import and deduplicates concurrent snapshot work', async () => {
    const db = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { sku: 'ERP-1', name: 'Product', country: 'MY', sites: ['MY'], siteData: null },
        ]),
      },
      warehouseMapping: {
        findMany: jest.fn().mockResolvedValue([
          { sku: 'ERP-1', thirdPartyWarehouseId: 'YC-1', type: 'third' },
        ]),
      },
      restockSalesImport: {
        findFirst: jest.fn().mockResolvedValue({
          statisticsDays: 30,
          items: [{ id: 'sale-1', targetSku: 'ERP-1', validSales: 30, dismissedAt: null }],
        }),
      },
    } as unknown as PrismaClient;
    const ycClient = {
      cacheScope: 'credential-scope',
      isConfigured: jest.fn().mockReturnValue(true),
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: 'WH-1', name: 'Kuala Lumpur', siteCode: 'MY' },
      ]),
      listProductInventory: jest.fn().mockResolvedValue([
        { warehouseCode: 'WH-1', customerSku: 'YC-1', customerSkuName: 'Vendor Name', available: 10 },
      ]),
      listProducts: jest.fn(),
      listStockAge: jest.fn().mockResolvedValue([{
        warehouseCode: 'WH-1',
        customerSku: 'YC-1',
        stockAgeQuantity: 10,
        stockAgeDay: 83,
        stockAgeVolume: 0.5,
        calculateDate: '2026-07-22',
        shelveDescription: '采购入库',
      }]),
      listInboundOrders: jest.fn(),
      listInboundReceiptHistory: jest.fn().mockResolvedValue([
        {
          warehouseCode: 'WH-1',
          customerSku: 'YC-1',
          productSku: null,
          receivedAt: '2026-05-01T00:00:00.000Z',
          quantity: 10,
        },
      ]),
    } as unknown as YcOpenPlatformClient;
    const values = new Map<string, string>();
    const cache = {
      get: jest.fn(async (key: string) => values.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const loader = createDashboardSnapshotLoader({
      db,
      cache,
      ycClient,
      now: () => new Date('2026-07-23T00:00:00.000Z'),
    });

    const [first, concurrent] = await Promise.all([loader.load('user-1'), loader.load('user-1')]);
    const cached = await loader.load('user-1');

    expect(first).toEqual(concurrent);
    expect(cached).toEqual(first);
    expect(first.restockRows).toEqual([
      expect.objectContaining({ sku: 'ERP-1', quantity: 10, availableDays: 10, suggestedQty: 20 }),
    ]);
    expect(first.agingRows).toEqual([
      expect.objectContaining({
        sku: 'ERP-1',
        warehouse: 'Kuala Lumpur',
        dailyStorageFee: 2,
        totalStorageFee: 91,
        storageFeeStatus: 'ready',
        storageFeeCalculatedAt: '2026-07-22',
      }),
    ]);
    expect(db.restockSalesImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', site: 'MY', statisticsDays: 30 },
      orderBy: { createdAt: 'desc' },
    }));
    expect(ycClient.listProductInventory).toHaveBeenCalledTimes(1);
    expect(ycClient.listInboundReceiptHistory).toHaveBeenCalledTimes(1);
    expect(ycClient.listStockAge).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      'dashboard:warehouse:v2:user-1:credential-scope',
      expect.any(String),
      'EX',
      300,
    );
    expect(cache.set).toHaveBeenCalledWith(
      'dashboard:receipts:user-1:credential-scope:WH-1',
      expect.any(String),
      'EX',
      3600,
    );
    expect(cache.set).toHaveBeenCalledWith(
      'dashboard:stock-age:user-1:credential-scope:WH-1',
      expect.any(String),
      'EX',
      3600,
    );
  });

  it('keeps aging rows available when the stock-age endpoint fails', async () => {
    const db = {
      product: { findMany: jest.fn().mockResolvedValue([
        { sku: 'ERP-1', name: 'Product', country: 'MY', sites: ['MY'], siteData: null },
      ]) },
      warehouseMapping: { findMany: jest.fn().mockResolvedValue([]) },
      restockSalesImport: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const ycClient = {
      cacheScope: 'scope',
      isConfigured: () => true,
      listCustomerWarehouses: jest.fn().mockResolvedValue([
        { code: 'WH-1', name: 'Warehouse', siteCode: 'MY' },
      ]),
      listProducts: jest.fn(),
      listProductInventory: jest.fn().mockResolvedValue([
        { warehouseCode: 'WH-1', customerSku: 'ERP-1', available: 2 },
      ]),
      listStockAge: jest.fn().mockRejectedValue(new Error('remote unavailable')),
      listInboundOrders: jest.fn(),
      listInboundReceiptHistory: jest.fn().mockResolvedValue([{
        warehouseCode: 'WH-1',
        customerSku: 'ERP-1',
        productSku: null,
        receivedAt: '2026-05-01T00:00:00.000Z',
        quantity: 2,
      }]),
    } as unknown as YcOpenPlatformClient;
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const loader = createDashboardSnapshotLoader({
      db,
      cache,
      ycClient,
      now: () => new Date('2026-07-23T00:00:00.000Z'),
    });

    const snapshot = await loader.load('user-1');

    expect(snapshot.agingRows).toEqual([expect.objectContaining({
      sku: 'ERP-1',
      dailyStorageFee: null,
      totalStorageFee: null,
      storageFeeStatus: 'unavailable',
    })]);
    expect(snapshot.warnings.unavailableSites).toEqual([]);
  });
});
