/**
 * 补货V3 planner 策略回归测试：missingStockPolicy / inboundEtaPolicy / simulateDaily。
 * 目标契约：V3 传入 policies 时按新口径计算；不传 policies 时保持 V2 旧行为不变
 * （旧行为由 restockPlanner.test.ts 锁定）。
 */
import { buildRestockPlan } from '../restockPlanner';

const V3_POLICIES = {
  missingStockPolicy: 'unknown' as const,
  inboundEtaPolicy: 'strict' as const,
  simulateDaily: true,
  quantityMode: 'simulation' as const,
};

const product = (sku: string, cost: number | null = 12) => ({
  id: `product-${sku}`,
  name: `商品 ${sku}`,
  sku,
  country: 'MY',
  sites: ['MY'],
  cost,
});

const inventory = (sku: string, dailySales: number) => ({
  id: `inventory-${sku}`,
  name: `商品 ${sku}`,
  sku,
  currentStock: 0,
  stockOfficial: 0,
  stockThirdParty: 0,
  inTransit: 0,
  dailySales,
  leadTime: 25,
  replenishCycle: 30,
  costPerUnit: 11,
});

describe('missingStockPolicy=unknown：元仓无库存行 ≠ 零库存', () => {
  it('未返回库存行的 SKU 进入 no_stock_data 状态，不输出可执行建议', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: { missingStockPolicy: 'unknown' },
      products: [product('HAS-ROW'), product('NO-ROW')],
      inventoryItems: [inventory('HAS-ROW', 5), inventory('NO-ROW', 5)],
      remoteStockRows: [{ customerSku: 'HAS-ROW', siteCode: 'MY', available: 10 }],
    });
    const hasRow = plan.items.find(item => item.sku === 'HAS-ROW')!;
    const noRow = plan.items.find(item => item.sku === 'NO-ROW')!;
    expect(hasRow.stockSource).toBe('yc');
    expect(hasRow.availableStock).toBe(10);
    expect(hasRow.status).not.toBe('no_stock_data');
    expect(noRow.stockSource).toBe('missing');
    expect(noRow.status).toBe('no_stock_data');
    expect(noRow.suggestedQty).toBe(0);
    expect(noRow.reviewReason).toBeTruthy();
    expect(plan.summary.noStockDataCount).toBe(1);
    // 总量不把未知库存当成 0 混入可执行建议统计
    expect(plan.summary.restockCount).toBe(
      plan.items.filter(item => item.suggestedQty > 0 && item.status !== 'no_stock_data').length,
    );
  });

  it('available=0 的已返回行是确认零库存，正常计算而不是 no_stock_data', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: { missingStockPolicy: 'unknown' },
      products: [product('ZERO')],
      inventoryItems: [inventory('ZERO', 4)],
      remoteStockRows: [{ customerSku: 'ZERO', siteCode: 'MY', available: 0 }],
    });
    const item = plan.items[0];
    expect(item.stockSource).toBe('yc');
    expect(item.availableStock).toBe(0);
    expect(item.status).not.toBe('no_stock_data');
    expect(item.suggestedQty).toBe(Math.ceil(4 * 20 + 4 * 5 - 0)); // 覆盖 20 天（09-11→10-01）
  });

  it('默认策略（不传 policies）保持旧行为：缺行按 0 计算，可执行建议照常输出', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      products: [product('NO-ROW')],
      inventoryItems: [inventory('NO-ROW', 5)],
      remoteStockRows: [],
    });
    expect(plan.items[0].status).not.toBe('no_stock_data');
    expect(plan.items[0].suggestedQty).toBeGreaterThan(0);
  });
});

describe('inboundEtaPolicy=strict：在途分类', () => {
  const basePlan = (policies?: any, estimatedArrivalDate?: string | null) => buildRestockPlan({
    site: 'MY',
    planningDate: '2026-09-01',
    targetDate: '2026-10-01',
    leadTimeDays: 10,
    safetyDays: 5,
    policies,
    products: [product('SKU-1')],
    inventoryItems: [inventory('SKU-1', 1)],
    remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
    inboundOrders: [{
      warehouseOrderNo: 'ORD-1',
      status: 2,
      estimatedArrivalDate: estimatedArrivalDate === undefined ? undefined : estimatedArrivalDate,
      details: [{ customerSku: 'SKU-1', quantity: 50, shiftNum: 0 }],
    }],
  });

  it('无 ETA：不计入确定供应，单独归入 inTransitNoEta 并给出警告', () => {
    const item = basePlan(V3_POLICIES, null).items[0];
    expect(item.inTransitNoEta).toBe(50);
    expect(item.inTransitBeforeArrival).toBe(0);
    expect(item.inTransitDuringCoverage).toBe(0);
    expect(item.warnings.join(' ')).toMatch(/ETA/i);
  });

  it('ETA 早于计划日（逾期未入库）：不计入确定供应，归入 inTransitOverdue', () => {
    const item = basePlan(V3_POLICIES, '2026-08-01').items[0];
    expect(item.inTransitOverdue).toBe(50);
    expect(item.inTransitBeforeArrival).toBe(0);
  });

  it('ETA 在计划日与到仓日之间：计入 beforeArrival；在覆盖期内：计入 duringCoverage', () => {
    const before = basePlan(V3_POLICIES, '2026-09-05').items[0];
    expect(before.inTransitBeforeArrival).toBe(50);
    const during = basePlan(V3_POLICIES, '2026-09-20').items[0];
    expect(during.inTransitDuringCoverage).toBe(50);
    expect(during.inTransitBeforeArrival).toBe(0);
  });

  it('ETA 晚于目标日：不计入，归入 inTransitAfterCoverage', () => {
    const item = basePlan(V3_POLICIES, '2026-11-01').items[0];
    expect(item.inTransitAfterCoverage).toBe(50);
    expect(item.inTransitBeforeArrival).toBe(0);
    expect(item.inTransitDuringCoverage).toBe(0);
  });

  it('默认策略（不传 policies）保持旧行为：无 ETA 计入到仓前库存', () => {
    const item = basePlan(undefined, null).items[0];
    expect(item.inTransitBeforeArrival).toBe(50);
    expect(item.inTransitNoEta ?? 0).toBe(0);
  });

  it('重复入库单（同单号重复出现）与重复明细只计一次', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 1)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      inboundOrders: [
        {
          warehouseOrderNo: 'ORD-DUP', customerWarehouseOrderNo: 'C-1', status: 2,
          estimatedArrivalDate: '2026-09-05',
          details: [{ customerSku: 'SKU-1', quantity: 50, shiftNum: 0 }],
        },
        {
          warehouseOrderNo: 'ORD-DUP', customerWarehouseOrderNo: 'C-1', status: 2,
          estimatedArrivalDate: '2026-09-05',
          details: [{ customerSku: 'SKU-1', quantity: 50, shiftNum: 0 }],
        },
      ],
    });
    expect(plan.items[0].inTransitBeforeArrival).toBe(50);
  });

  it('在途明细分类输出可追溯（单号、剩余量、ETA、类别）', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 1)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      inboundOrders: [
        { warehouseOrderNo: 'ORD-A', status: 2, estimatedArrivalDate: '2026-09-05', details: [{ customerSku: 'SKU-1', quantity: 30, shiftNum: 5 }] },
        { warehouseOrderNo: 'ORD-B', status: 2, estimatedArrivalDate: '2026-11-05', details: [{ customerSku: 'SKU-1', quantity: 70, shiftNum: 0 }] },
      ],
    });
    const breakdown = plan.items[0].inboundBreakdown;
    expect(breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ orderNumber: 'ORD-A', remaining: 25, category: 'beforeArrival' }),
      expect.objectContaining({ orderNumber: 'ORD-B', remaining: 70, category: 'afterCoverage' }),
    ]));
  });
});

describe('simulateDaily：逐日库存模拟', () => {
  it('识别区间中途断货：stockoutDate 与到仓前缺口，缺口不并入常规建议量', () => {
    // 日销 5，可用 40 → 第 9 天（2026-09-09）耗尽；提前期 10 天到仓 2026-09-11
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 5)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 40 }],
    });
    const item = plan.items[0];
    expect(item.stockoutDate).toBe('2026-09-09');
    // 到仓前缺口 = 09-09、09-10 两天未满足需求（各5件，共10件）—— 丢失销量假设
    expect(item.gapBeforeArrival).toBe(10);
    // 常规建议量不受缺口影响：max(0, 5*20 + 5*5 - 0 - 0) = 125（覆盖 09-11→10-01 共 20 天）
    expect(item.suggestedQty).toBe(125);
    expect(item.status).toBe('critical');
  });

  it('晚到在途覆盖中途断货场景：在途 ETA 晚于断货日时缺口如实呈现', () => {
    // 日销 5，可用 30 → 09-07 断货；在途 100 件 ETA 09-09（在到仓日 09-11 之前）到货补上
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 5)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 30 }],
      inboundOrders: [{
        warehouseOrderNo: 'ORD-LATE', status: 2, estimatedArrivalDate: '2026-09-09',
        details: [{ customerSku: 'SKU-1', quantity: 100, shiftNum: 0 }],
      }],
    });
    const item = plan.items[0];
    expect(item.stockoutDate).toBe('2026-09-07');
    // 09-07、09-08 两天各缺 5 件（09-09 在途到货当天可用）
    expect(item.gapBeforeArrival).toBe(10);
    // simulation 模式：基线轨迹 09-09 到货 100 后，09-09..09-28 恰好覆盖（100−5×19=5→0），
    // [到仓日 09-11, 目标日) 内缺口 = 09-29、09-30 各 5 = 10；基线期末 E0=0，
    // 安全目标 25 → 建议量 = 10 + 25 = 35
    //（旧公式 45 因 arrivalStock=80 提前抵扣了晚到 100 件已被 09-09..09-28 需求消耗的部分）
    expect(item.suggestedQty).toBe(35);
  });

  it('无断货时 stockoutDate 为空且状态按建议量判定', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 5)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 500 }],
    });
    const item = plan.items[0];
    expect(item.stockoutDate).toBeNull();
    expect(item.gapBeforeArrival).toBe(0);
    expect(item.status).toBe('healthy');
  });

  it('逐日模拟序列包含日期、期初、到货、需求与期末库存', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-09-05',
      leadTimeDays: 2, // 到仓日 09-03（targetDate 必须晚于到仓日）
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 2)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 3 }],
      inboundOrders: [{
        warehouseOrderNo: 'ORD-A', status: 2, estimatedArrivalDate: '2026-09-03',
        details: [{ customerSku: 'SKU-1', quantity: 6, shiftNum: 0 }],
      }],
    });
    const sim = plan.items[0].stockSim;
    expect(sim).toBeDefined();
    // 模拟区间 = planningDate..targetDate 前一日（与覆盖期需求公式口径一致）
    expect(sim!.length).toBe(4);
    expect(sim![0]).toEqual(expect.objectContaining({ date: '2026-09-01', arrivals: 0, demand: 2, endStock: 1 }));
    // 09-02 期初 1 件 < 需求 2：断货日，未满足 1 件，期末归零（丢失销量假设）
    expect(sim![1]).toEqual(expect.objectContaining({ date: '2026-09-02', stockout: true, endStock: 0 }));
    // 建议量 8 件在到仓日 09-03 入库：arrivals = 6（在途）+ 8（建议）= 14
    expect(sim![2]).toEqual(expect.objectContaining({ date: '2026-09-03', arrivals: 14, endStock: 12 }));
    // 不补货基线轨迹：09-03 只有在途 6 件到货
    const baseline = plan.items[0].baselineStockSim;
    expect(baseline![2]).toEqual(expect.objectContaining({ date: '2026-09-03', arrivals: 6, endStock: 4 }));
  });
});

describe('成本未知与逐仓明细', () => {
  it('product.cost 为 null 且无有效成本时不显示为零成本：estimatedCost 置空并标记 costUnknown', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1', null)],
      inventoryItems: [{ ...inventory('SKU-1', 4), costPerUnit: Number.NaN }],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
    });
    const item = plan.items[0];
    expect(item.costUnknown).toBe(true);
    expect(item.estimatedCost).toBeNull();
    expect(plan.summary.estimatedCostKnownSkus).toBe(0);
  });

  it('多仓库存返回逐仓明细，总量为各仓之和', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-01',
      targetDate: '2026-10-01',
      leadTimeDays: 10,
      safetyDays: 5,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 4)],
      remoteStockRows: [
        { customerSku: 'SKU-1', siteCode: 'MY', warehouseCode: 'WH-A', warehouseName: 'A仓', available: 7 },
        { customerSku: 'SKU-1', siteCode: 'MY', warehouseCode: 'WH-B', warehouseName: 'B仓', available: 3 },
      ],
    });
    const item = plan.items[0];
    expect(item.availableStock).toBe(10);
    expect(item.stockByWarehouse).toEqual([
      expect.objectContaining({ warehouseCode: 'WH-A', available: 7 }),
      expect.objectContaining({ warehouseCode: 'WH-B', available: 3 }),
    ]);
  });
});
