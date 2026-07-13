import { buildRestockPlan } from '../restockPlanner';

const product = {
  id: 'product-1',
  name: 'Fast Seller',
  sku: 'SKU-1',
  country: 'MY',
  sites: ['MY'],
  cost: 12,
  siteData: { MY: { totalRevenue: 39 } },
};

const inventory = {
  id: 'inventory-1',
  name: 'Fast Seller',
  sku: 'SKU-1',
  currentStock: 999,
  stockOfficial: 500,
  stockThirdParty: 499,
  inTransit: 888,
  dailySales: 10,
  leadTime: 20,
  replenishCycle: 30,
  costPerUnit: 11,
};

describe('buildRestockPlan target-date planning', () => {
  it('forecasts arrival stock, covers only arrival-to-target demand, adds safety stock, and uses only active YC inbound', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-10-01',
      leadTimeDays: 31,
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [{
        warehouseCode: '001',
        warehouseName: 'Malaysia 1',
        siteCode: 'MY',
        customerSku: 'SKU-1',
        available: 200,
        inventory: 9999,
        occupy: 0,
        unshipped: 0,
      }],
      inboundOrders: [
        {
          warehouseOrderNo: 'BEFORE',
          status: 2,
          estimatedArrivalDate: '2026-07-20',
          details: [{ customerSku: 'SKU-1', quantity: 100, shiftNum: 50 }],
        },
        {
          warehouseOrderNo: 'DURING',
          status: 3,
          estimatedArrivalDate: '2026-09-01',
          details: [{ customerSku: 'SKU-1', quantity: 40, shiftNum: 10 }],
        },
        {
          warehouseOrderNo: 'UNKNOWN',
          status: 2,
          details: [{ customerSku: 'SKU-1', quantity: 10, shiftNum: 0 }],
        },
        {
          warehouseOrderNo: 'FINISHED',
          status: 4,
          estimatedArrivalDate: '2026-07-10',
          details: [{ customerSku: 'SKU-1', quantity: 500, shiftNum: 0 }],
        },
      ],
      generatedAt: '2026-07-01T00:00:00.000Z',
    });

    const item = plan.items[0];
    expect(item.availableStock).toBe(200);
    expect(item.stockSource).toBe('yc');
    expect(item.adjustedDailySales).toBe(10);
    expect(item.arrivalDate).toBe('2026-08-01');
    expect(item.coverageDays).toBe(61);
    expect(item.transportDemand).toBe(310);
    expect(item.inTransitBeforeArrival).toBe(60);
    expect(item.inTransitDuringCoverage).toBe(30);
    expect(item.inTransit).toBe(90);
    expect(item.arrivalStock).toBe(0);
    expect(item.safetyDays).toBe(30);
    expect(item.safetyStockDemand).toBe(300);
    expect(item.targetCoverDays).toBe(91);
    expect(item.suggestedQty).toBe(880);
    expect(item.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('UNKNOWN'),
      expect.stringContaining('ETA'),
    ]));
  });

  it('applies per-SKU lead time, safety days, and growth percent overrides', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      leadTimeDays: 31,
      safetyDays: 30,
      growthPercent: 0,
      skuRules: [{ sku: ' sku-1 ', leadTimeDays: 30, safetyDays: 5, growthPercent: 10 }],
      products: [product],
      inventoryItems: [{ ...inventory, dailySales: 2 }],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 100 }],
    });

    const item = plan.items[0];
    expect(item.dailySales).toBe(2);
    expect(item.adjustedDailySales).toBeCloseTo(2.2);
    expect(item.growthPercent).toBe(10);
    expect(item.leadTimeDays).toBe(30);
    expect(item.arrivalDate).toBe('2026-07-31');
    expect(item.coverageDays).toBe(32);
    expect(item.safetyDays).toBe(5);
    expect(item.targetCoverDays).toBe(37);
    expect(item.suggestedQty).toBe(48);
  });

  it('rejects missing YC available and never falls back to local inventory when remote rows are omitted', () => {
    expect(() => buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-08-02',
      leadTimeDays: 1,
      safetyDays: 0,
      products: [product],
      inventoryItems: [{ ...inventory, dailySales: 1 }],
      remoteStockRows: [{
        customerSku: 'SKU-1',
        siteCode: 'MY',
        inventory: 1000,
        occupy: 10,
        unshipped: 10,
      }],
    })).toThrow('available');

    const withNoYcMatch = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-08-02',
      leadTimeDays: 1,
      safetyDays: 0,
      products: [product],
      inventoryItems: [inventory],
    });
    expect(withNoYcMatch.items[0].availableStock).toBe(0);
    expect(withNoYcMatch.items[0].stockSource).toBe('missing');
  });

  it('aggregates inbound per SKU instead of falling back globally or using local in-transit stock', () => {
    const secondProduct = { ...product, id: 'product-2', sku: 'SKU-2', name: 'Second' };
    const secondInventory = { ...inventory, id: 'inventory-2', sku: 'SKU-2', name: 'Second', inTransit: 777 };
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-08-10',
      leadTimeDays: 10,
      products: [product, secondProduct],
      inventoryItems: [inventory, secondInventory],
      remoteStockRows: [
        { customerSku: 'SKU-1', siteCode: 'MY', available: 10 },
        { customerSku: 'SKU-2', siteCode: 'MY', available: 10 },
      ],
      inboundOrders: [{
        warehouseOrderNo: 'ONLY-SKU-1',
        status: '2',
        estimatedArrivalDate: '2026-07-05',
        details: [{ customerSku: 'SKU-1', quantity: 12, shiftNum: 2 }],
      }],
    });

    expect(plan.items.find(item => item.sku === 'SKU-1')?.inTransit).toBe(10);
    expect(plan.items.find(item => item.sku === 'SKU-2')?.inTransit).toBe(0);
  });

  it.each([
    [{ planningDate: 'not-a-date', targetDate: '2026-10-01' }, 'planningDate'],
    [{ planningDate: '2026-07-01', targetDate: 'not-a-date' }, 'targetDate'],
    [{ planningDate: '2026-07-01', targetDate: '2026-07-31', leadTimeDays: 30 }, 'after arrivalDate'],
    [{ planningDate: '2026-07-01', targetDate: '2026-10-01', leadTimeDays: -1 }, 'leadTimeDays'],
    [{ planningDate: '2026-07-01', targetDate: '2026-10-01', safetyDays: -1 }, 'safetyDays'],
    [{ planningDate: '2026-07-01', targetDate: '2026-10-01', growthPercent: 1001 }, 'growthPercent'],
    [{ planningDate: '2026-07-01', targetDate: '2036-07-01' }, 'targetDate'],
  ])('rejects invalid planning boundaries: %p', (overrides, message) => {
    expect(() => buildRestockPlan({
      site: 'MY',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [],
      ...overrides,
    })).toThrow(message);
  });

  it('requires targetDate instead of silently falling back to a legacy replenishment cycle', () => {
    expect(() => buildRestockPlan({
      site: 'MY',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      leadTimeDays: 25,
      generatedAt: '2026-07-01T00:00:00.000Z',
    })).toThrow('targetDate');
  });

  it('always returns an integer suggested quantity in target-date mode', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      products: [product],
      inventoryItems: [{ ...inventory, dailySales: 1.25 }],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      leadTimeDays: 25,
      generatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(Number.isInteger(plan.items[0].suggestedQty)).toBe(true);
  });

  it.each([
    [{ customerSku: 'SKU-1', available: '' }, 'available'],
    [{ customerSku: 'SKU-1', available: Number.POSITIVE_INFINITY }, 'available'],
    [{ customerSku: 'SKU-1', available: -1 }, 'available'],
  ])('rejects unsafe third-party inventory values: %p', (remoteRow, message) => {
    expect(() => buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [remoteRow],
    })).toThrow(message);
  });

  it.each([
    [{ quantity: '', shiftNum: 0 }, 'quantity'],
    [{ quantity: 10, shiftNum: -1 }, 'shiftNum'],
    [{ quantity: 10, shiftNum: '' }, 'shiftNum'],
  ])('rejects unsafe inbound numeric values: %p', (detailValues, message) => {
    expect(() => buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [{ customerSku: 'SKU-1', available: 0 }],
      inboundOrders: [{
        warehouseOrderNo: 'BAD-INBOUND',
        status: 2,
        estimatedArrivalDate: '2026-07-20',
        details: [{ customerSku: 'SKU-1', ...detailValues }],
      }],
    })).toThrow(message);
  });

  it('rejects malformed non-empty inbound ETA instead of treating it as missing', () => {
    expect(() => buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [{ customerSku: 'SKU-1', available: 0 }],
      inboundOrders: [{
        warehouseOrderNo: 'BAD-ETA',
        status: 2,
        estimatedArrivalDate: 'tomorrow-ish',
        details: [{ customerSku: 'SKU-1', quantity: 10, shiftNum: 0 }],
      }],
    })).toThrow('estimatedArrivalDate');
  });

  it('rejects unsafe accumulation instead of overflowing stock totals', () => {
    expect(() => buildRestockPlan({
      site: 'MY',
      planningDate: '2026-07-01',
      targetDate: '2026-09-01',
      products: [product],
      inventoryItems: [inventory],
      remoteStockRows: [
        { customerSku: 'SKU-1', available: Number.MAX_SAFE_INTEGER },
        { customerSku: 'SKU-1', available: 1 },
      ],
    })).toThrow('safe');
  });
});
