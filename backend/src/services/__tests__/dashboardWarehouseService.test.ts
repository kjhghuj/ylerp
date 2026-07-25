import {
  buildDashboardWarehouseSnapshot,
  calculateStockAgeStorageFee,
  estimateFifoAgeDays,
  paginateDashboardRows,
} from '../dashboardWarehouseService';

const NOW = new Date('2026-07-23T00:00:00.000Z');

describe('dashboard warehouse monitoring rules', () => {
  it.each([
    [30, 0, 0],
    [31, 3, 3],
    [60, 3, 90],
    [61, 4, 94],
    [90, 4, 210],
    [91, 6, 216],
    [180, 6, 750],
    [181, 8, 758],
  ])('calculates storage fees at the %i-day boundary', (stockAgeDay, dailyRate, cumulativeRate) => {
    expect(calculateStockAgeStorageFee([{
      warehouseCode: 'WH-1',
      sku: 'SKU-1',
      quantity: 1,
      stockAgeDay,
      stockAgeVolume: 0.5,
      calculateDate: '2026-07-24',
      shelveDescription: '采购入库',
    }])).toEqual({
      dailyStorageFee: dailyRate * 0.5,
      totalStorageFee: cumulativeRate * 0.5,
      storageFeeStatus: 'ready',
      storageFeeCalculatedAt: '2026-07-24',
    });
  });

  it('aggregates batches but refuses partial fees for missing volume or returns', () => {
    const normalBatch = {
      warehouseCode: 'WH-1',
      sku: 'SKU-1',
      quantity: 1,
      stockAgeDay: 100,
      stockAgeVolume: 0.25,
      calculateDate: '2026-07-24',
      shelveDescription: '采购入库',
    };
    expect(calculateStockAgeStorageFee([
      normalBatch,
      { ...normalBatch, stockAgeDay: 61, stockAgeVolume: 0.5 },
    ])).toEqual(expect.objectContaining({
      dailyStorageFee: 3.5,
      totalStorageFee: 114.5,
      storageFeeStatus: 'ready',
    }));
    expect(calculateStockAgeStorageFee([
      normalBatch,
      { ...normalBatch, stockAgeVolume: null },
    ])).toEqual(expect.objectContaining({
      dailyStorageFee: null,
      totalStorageFee: null,
      storageFeeStatus: 'missing_product_specs',
    }));
    expect(calculateStockAgeStorageFee([
      normalBatch,
      { ...normalBatch, shelveDescription: '退件入库' },
    ])).toEqual(expect.objectContaining({
      dailyStorageFee: null,
      totalStorageFee: null,
      storageFeeStatus: 'return_rule_pending',
    }));
    expect(calculateStockAgeStorageFee([
      { ...normalBatch, calculateDate: 'invalid-date' },
    ])).toEqual({
      dailyStorageFee: null,
      totalStorageFee: null,
      storageFeeStatus: 'unavailable',
      storageFeeCalculatedAt: null,
    });
  });

  it('reconstructs FIFO age from newest receipts and reports incomplete history', () => {
    const receipts = [
      { quantity: 4, receivedAt: '2026-07-13T00:00:00.000Z' },
      { quantity: 3, receivedAt: '2026-05-14T00:00:00.000Z' },
      { quantity: 5, receivedAt: '2026-04-14T00:00:00.000Z' },
    ];

    expect(estimateFifoAgeDays(5, receipts, NOW)).toEqual({ ageDays: 70, complete: true });
    expect(estimateFifoAgeDays(8, receipts, NOW)).toEqual({ ageDays: 100, complete: true });
    expect(estimateFifoAgeDays(13, receipts, NOW)).toEqual({ ageDays: null, complete: false });
    expect(estimateFifoAgeDays(0, receipts, NOW)).toEqual({ ageDays: null, complete: true });
    expect(estimateFifoAgeDays(1, [{ quantity: 1, receivedAt: 'invalid' }], NOW))
      .toEqual({ ageDays: null, complete: false });
  });

  it('uses strict 30-day sales and applies restock and slow-moving boundaries', () => {
    const snapshot = buildDashboardWarehouseSnapshot({
      now: NOW,
      sites: [{ code: 'MY', name: '马来西亚' }],
      stocks: [
        { site: 'MY', warehouseCode: 'WH-1', warehouseName: '吉隆坡仓', sku: 'A', name: 'A', available: 299 },
        { site: 'MY', warehouseCode: 'WH-1', warehouseName: '吉隆坡仓', sku: 'B', name: 'B', available: 300 },
        { site: 'MY', warehouseCode: 'WH-1', warehouseName: '吉隆坡仓', sku: 'C', name: 'C', available: 301 },
        { site: 'MY', warehouseCode: 'WH-1', warehouseName: '吉隆坡仓', sku: 'ZERO', name: 'Zero', available: 8 },
        { site: 'MY', warehouseCode: 'WH-1', warehouseName: '吉隆坡仓', sku: 'MISSING', name: 'Missing', available: 8 },
      ],
      sales: [
        { site: 'MY', sku: 'A', validSales: 300, statisticsDays: 30 },
        { site: 'MY', sku: 'B', validSales: 300, statisticsDays: 30 },
        { site: 'MY', sku: 'C', validSales: 300, statisticsDays: 30 },
        { site: 'MY', sku: 'ZERO', validSales: 0, statisticsDays: 30 },
      ],
      receipts: [
        ...['A', 'B', 'C', 'ZERO', 'MISSING'].map(sku => ({
          warehouseCode: 'WH-1',
          sku,
          quantity: 1000,
          receivedAt: '2026-05-13T00:00:00.000Z',
        })),
      ],
    });

    expect(snapshot.restockRows.map(row => row.sku)).toEqual(['A']);
    expect(snapshot.restockRows[0]).toEqual(expect.objectContaining({
      availableDays: 29.9,
      suggestedQty: 1,
    }));
    expect(snapshot.agingRows.map(row => row.sku)).toEqual(['A', 'B', 'C', 'MISSING', 'ZERO']);
    expect(snapshot.summary.restock.totalQuantity).toBe(1);
    expect(snapshot.summary.slowMoving.totalQuantity).toBe(309);
    expect(snapshot.summary.slowMoving.skuCount).toBe(2);
    expect(snapshot.warnings.missingSalesCount).toBe(1);
  });

  it('excludes incomplete FIFO history and keeps totals equal to the site sums', () => {
    const snapshot = buildDashboardWarehouseSnapshot({
      now: NOW,
      sites: [
        { code: 'MY', name: '马来西亚' },
        { code: 'SG', name: '新加坡' },
      ],
      stocks: [
        { site: 'MY', warehouseCode: 'MY-1', warehouseName: 'MY仓', sku: 'A', name: 'A', available: 5 },
        { site: 'SG', warehouseCode: 'SG-1', warehouseName: 'SG仓', sku: 'B', name: 'B', available: 5 },
        { site: 'SG', warehouseCode: 'SG-1', warehouseName: 'SG仓', sku: 'NO-HISTORY', name: 'N', available: 10 },
      ],
      sales: [
        { site: 'MY', sku: 'A', validSales: 30, statisticsDays: 30 },
        { site: 'SG', sku: 'B', validSales: 60, statisticsDays: 30 },
        { site: 'SG', sku: 'NO-HISTORY', validSales: 30, statisticsDays: 30 },
      ],
      receipts: [
        { warehouseCode: 'MY-1', sku: 'A', quantity: 5, receivedAt: '2026-05-01T00:00:00.000Z' },
        { warehouseCode: 'SG-1', sku: 'B', quantity: 5, receivedAt: '2026-05-01T00:00:00.000Z' },
        { warehouseCode: 'SG-1', sku: 'NO-HISTORY', quantity: 2, receivedAt: '2026-05-01T00:00:00.000Z' },
      ],
    });

    expect(snapshot.agingRows.map(row => row.sku)).toEqual(['A', 'B']);
    expect(snapshot.warnings.incompleteAgeCount).toBe(1);
    expect(snapshot.summary.restock.totalQuantity)
      .toBe(snapshot.summary.restock.bySite.reduce((sum, site) => sum + site.quantity, 0));
    expect(snapshot.summary.slowMoving.totalQuantity)
      .toBe(snapshot.summary.slowMoving.bySite.reduce((sum, site) => sum + site.quantity, 0));
  });

  it('whitelists sort fields and paginates deterministically', () => {
    const rows = [
      { name: 'B', sku: 'B', site: 'SG', warehouse: 'W2', quantity: 2, inboundDays: 80 },
      { name: 'A', sku: 'A', site: 'MY', warehouse: 'W1', quantity: 3, inboundDays: 100 },
      { name: 'C', sku: 'C', site: 'SG', warehouse: 'W3', quantity: 1, inboundDays: 90 },
    ];

    expect(paginateDashboardRows(rows, {
      kind: 'aging',
      sortBy: 'notAllowed',
      sortDir: 'asc',
      page: 1,
      pageSize: 2,
    })).toEqual(expect.objectContaining({
      page: 1,
      pageSize: 2,
      total: 3,
      sortBy: 'inboundDays',
      sortDir: 'desc',
      items: [expect.objectContaining({ sku: 'A' }), expect.objectContaining({ sku: 'C' })],
    }));

    expect(paginateDashboardRows(rows, {
      kind: 'aging',
      sortBy: 'quantity',
      sortDir: 'asc',
      page: 2,
      pageSize: 2,
    }).items).toEqual([expect.objectContaining({ sku: 'A' })]);

    expect(paginateDashboardRows(rows, {
      kind: 'aging',
      sortBy: 'site',
      sortDir: 'asc',
      page: 1,
      pageSize: 3,
    })).toEqual(expect.objectContaining({
      sortBy: 'site',
      items: [
        expect.objectContaining({ site: 'MY' }),
        expect.objectContaining({ sku: 'B', site: 'SG' }),
        expect.objectContaining({ sku: 'C', site: 'SG' }),
      ],
    }));

    const feeRows = [
      { name: 'Missing', sku: 'M', dailyStorageFee: null },
      { name: 'High', sku: 'H', dailyStorageFee: 2 },
      { name: 'Low', sku: 'L', dailyStorageFee: 1 },
    ];
    expect(paginateDashboardRows(feeRows, {
      kind: 'aging',
      sortBy: 'dailyStorageFee',
      sortDir: 'desc',
      page: 1,
      pageSize: 10,
    }).items.map(row => row.sku)).toEqual(['H', 'L', 'M']);
  });
});
