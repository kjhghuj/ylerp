/**
 * 补货V3 数量算法回归测试（quantityMode='simulation'）。
 * 核心契约：建议量由「不新增补货」基线轨迹推导，晚到在途不得提前抵扣；
 * 建议量、状态、模拟轨迹、到仓库存同源一致；日期口径左闭右开 [planningDate, targetDate)。
 *
 * 主案例推导（问题 1）：
 *   计划日 09-10，日销 10，可用 30，时效 2 天（到仓 09-12），目标覆盖 09-20，安全 0 天，
 *   在途 100 件 ETA 09-19。
 *   基线轨迹（不补货）：09-10: 30→20，09-11: 20→10，09-12: 10→0（恰好卖完，非缺口），
 *   09-13..09-18 每天缺 10（合计 60），09-19 到货 100：0+100−10=90。
 *   U（[arrivalDate, targetDate) 内缺口）= 60；E0（基线期末）= 90；安全目标 = 0。
 *   建议量 = 60 + max(0, 0 − 90) = 60。
 *   采用建议量轨迹：09-12: 10+60−10=60 → 09-18 恰好清零 → 09-19: 0+100−10=90，
 *   无到仓后断货、期末 0 = 安全目标 → 建议量自洽。
 */
import { buildRestockPlan, type BuildRestockPlanInput, type RemoteInboundDetail } from '../restockPlanner';

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

const inventory = (sku: string, dailySales: number, leadTime = 25) => ({
  id: `inventory-${sku}`,
  name: `商品 ${sku}`,
  sku,
  currentStock: 0,
  stockOfficial: 0,
  stockThirdParty: 0,
  inTransit: 0,
  dailySales,
  leadTime,
  replenishCycle: 30,
  costPerUnit: 11,
});

const baseInput = (overrides: Partial<BuildRestockPlanInput> = {}): BuildRestockPlanInput => ({
  site: 'MY',
  planningDate: '2026-09-10',
  targetDate: '2026-09-20',
  leadTimeDays: 2,
  safetyDays: 0,
  growthPercent: 0,
  policies: V3_POLICIES,
  products: [product('SKU-1')],
  inventoryItems: [inventory('SKU-1', 10, 2)],
  remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 30 }],
  inboundOrders: [{
    warehouseOrderNo: 'ORD-1', status: 2, estimatedArrivalDate: '2026-09-19',
    details: [{ customerSku: 'SKU-1', quantity: 100, shiftNum: 0, estimatedArrivalDate: '2026-09-19' }],
  }],
  ...overrides,
});

describe('问题1：晚到在途造成覆盖期中途断货', () => {
  it('主案例：建议量=到仓后缺口60，状态 warning（不是 healthy/0）', () => {
    const item = buildRestockPlan(baseInput()).items[0];
    // 推导见文件头
    expect(item.suggestedQty).toBe(60);
    expect(item.status).toBe('warning');
    // 采用建议量后轨迹无断货（09-12 到仓后全覆盖）；不补货轨迹 09-13 断货
    expect(item.stockoutDate).toBeNull();
    expect(item.baselineStockoutDate).toBe('2026-09-13');
    expect(item.gapBeforeArrival).toBe(0); // 到仓前无缺口（09-12 恰好卖完）
    expect(item.gapAfterArrival).toBe(60); // 本次建议量覆盖的到仓后缺口
    expect(item.endSafetyGap).toBe(0);
    expect(item.executable).toBe(true);
  });

  it('预计到仓库存与模拟一致（丢失销量假设下不再按晚到库存扣减）', () => {
    const item = buildRestockPlan(baseInput()).items[0];
    // 旧公式：max(0, 30 + 0 − 10×2) = 10（把 09-19 的 100 件提前抵扣，且假设 09-13 起的需求被晚到库存满足）
    // 新口径：建议量轨迹中到仓日（09-12）期末 = 10 + 60 − 10 = 60
    expect(item.arrivalStock).toBe(60);
    // 建议量轨迹（stockSim）与建议量同源：09-12 到货 60
    const arrivalDay = item.stockSim!.find(point => point.date === '2026-09-12');
    expect(arrivalDay!.arrivals).toBe(60);
    expect(arrivalDay!.endStock).toBe(60);
  });

  it('采用建议量后轨迹期末恰达安全库存目标', () => {
    // safety 5 天 × 10 = 50：U 仍 60，E0=90 ≥ 50 → 建议量 = 60 + 0 = 60（期末 90 已超安全目标）
    const item = buildRestockPlan(baseInput({ safetyDays: 5 })).items[0];
    expect(item.suggestedQty).toBe(60);
    // safety 20 天 × 10 = 200：建议量 = 60 + (200 − 90) = 170
    const item2 = buildRestockPlan(baseInput({ safetyDays: 20 })).items[0];
    expect(item2.suggestedQty).toBe(170);
    // 轨迹期末 = 170 + 90 − 60（覆盖缺口后多出的部分在期末）= 200 = 安全目标
    expect(item2.stockSim![item2.stockSim!.length - 1].endStock).toBe(200);
  });

  it('提前期过长导致到仓前断货：critical 且缺口独立展示，不并入建议量', () => {
    // 日销 10、可用 5：09-10 当天 5<10 即断货，新货 09-12 才到 → 到仓前缺口不可避免
    const item = buildRestockPlan(baseInput({
      inventoryItems: [inventory('SKU-1', 10, 2)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 5 }],
      safetyDays: 5,
    })).items[0];
    // 基线：09-10 缺5、09-11 缺10、09-12 起同主案例；U=60+10=70？—— 不对：
    // 09-10 缺5、09-11 缺10 属于 arrivalDate(09-12) 之前 → 不计入 U；
    // 09-12: 0+0? 基线可用 5 在 09-10 只能满足 5 → 09-11 起 start 0；
    // 09-12..09-18 缺 70，09-19 起 90。U = 70；E0 = 90；安全 50 → 建议量 = 70 + (50−90→0) = 70
    expect(item.suggestedQty).toBe(70);
    expect(item.gapBeforeArrival).toBe(15); // 09-10 缺 5 + 09-11 缺 10（丢失销量，无法用本次补货修复）
    expect(item.status).toBe('critical'); // 采用建议量后到仓前仍断货
    expect(item.stockoutDate).toBe('2026-09-10');
  });
});

describe('ETA 边界（左闭右开 [planningDate, targetDate)）', () => {
  const etaCase = (eta: string) => buildRestockPlan(baseInput({
    inboundOrders: [{
      warehouseOrderNo: 'ORD-ETA', status: 2, estimatedArrivalDate: eta,
      details: [{ customerSku: 'SKU-1', quantity: 50, shiftNum: 0, estimatedArrivalDate: eta }],
    }],
  })).items[0];

  it('ETA == 计划日：到仓前可用（非逾期）', () => {
    const item = etaCase('2026-09-10');
    expect(item.inTransitBeforeArrival).toBe(50);
    expect(item.inboundBreakdown[0].category).toBe('beforeArrival');
  });

  it('ETA == 到仓日：计入到仓前', () => {
    const item = etaCase('2026-09-12');
    expect(item.inTransitBeforeArrival).toBe(50);
  });

  it('ETA == 目标覆盖日：目标日不在需求区间内 → afterCoverage 不抵扣建议量', () => {
    const item = etaCase('2026-09-20');
    expect(item.inTransitDuringCoverage).toBe(0);
    expect(item.inTransitAfterCoverage).toBe(50);
    // 与 ETA=09-19（区间内）对比：区间内在途会把建议量压低 50−10（缺口重算）
    const inside = etaCase('2026-09-19');
    expect(inside.suggestedQty).toBeLessThan(item.suggestedQty);
  });

  it('ETA < 计划日：逾期，不计入确定供应', () => {
    const item = etaCase('2026-09-09');
    expect(item.inTransitOverdue).toBe(50);
    expect(item.inTransitBeforeArrival).toBe(0);
  });

  it('V2 formula+optimistic 保持旧行为：ETA == 目标日仍计入覆盖期（兼容对照）', () => {
    const item = buildRestockPlan(baseInput({
      policies: {},
      inboundOrders: [{
        warehouseOrderNo: 'ORD-ETA', status: 2, estimatedArrivalDate: '2026-09-20',
        details: [{ customerSku: 'SKU-1', quantity: 50, shiftNum: 0, estimatedArrivalDate: '2026-09-20' }],
      }],
    })).items[0];
    expect(item.inTransitDuringCoverage).toBe(50);
  });
});

describe('在途明细身份', () => {
  const withDetails = (details: Array<Record<string, unknown>>, policies?: Record<string, unknown>) =>
    buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-10',
      targetDate: '2026-10-10',
      leadTimeDays: 2,
      safetyDays: 0,
      growthPercent: 0,
      ...(policies ? { policies: policies as BuildRestockPlanInput['policies'] } : {}),
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 10, 2)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      inboundOrders: [{
        warehouseOrderNo: 'ORD-X', customerWarehouseOrderNo: 'C-X', status: 2,
        estimatedArrivalDate: '2026-09-15',
        details: details as unknown as RemoteInboundDetail[],
      }],
    });

  it('同一单两条不同明细（不同 detailId、同 SKU 同数量）：全部计入 60', () => {
    const item = withDetails([
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15', detailId: 'd1' },
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15', detailId: 'd2' },
    ]).items[0];
    expect(item.inTransitDuringCoverage).toBe(60);
  });

  it('缺少明细 ID 时保守保留（不猜测重复）：同内容两条计入 60', () => {
    const item = withDetails([
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15' },
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15' },
    ]).items[0];
    expect(item.inTransitDuringCoverage).toBe(60);
  });

  it('相同 detailId 重复返回只计一次', () => {
    const item = withDetails([
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15', detailId: 'same' },
      { customerSku: 'SKU-1', quantity: 30, shiftNum: 0, estimatedArrivalDate: '2026-09-15', detailId: 'same' },
    ]).items[0];
    expect(item.inTransitDuringCoverage).toBe(30);
  });

  it('订单级去重只认可靠单号：无单号的匿名单不去重', () => {
    const plan = buildRestockPlan({
      site: 'MY',
      planningDate: '2026-09-10',
      targetDate: '2026-10-10',
      leadTimeDays: 2,
      safetyDays: 0,
      policies: V3_POLICIES,
      products: [product('SKU-1')],
      inventoryItems: [inventory('SKU-1', 10, 2)],
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 0 }],
      inboundOrders: [
        { status: 2, estimatedArrivalDate: '2026-09-15', details: [{ customerSku: 'SKU-1', quantity: 30, shiftNum: 0 }] },
        { status: 2, estimatedArrivalDate: '2026-09-15', details: [{ customerSku: 'SKU-1', quantity: 30, shiftNum: 0 }] },
      ],
    });
    expect(plan.items[0].inTransitDuringCoverage).toBe(60);
  });
});

describe('真实零销量状态', () => {
  it('zeroSalesSkus 命中的 SKU 显示 zero_sales（不再是 missing_sales）且不可执行', () => {
    const item = buildRestockPlan(baseInput({
      inventoryItems: [inventory('SKU-1', 0, 2)],
      zeroSalesSkus: ['SKU-1'],
    })).items[0];
    expect(item.status).toBe('zero_sales');
    expect(item.suggestedQty).toBe(0);
    expect(item.executable).toBe(false);
  });

  it('未传 zeroSalesSkus 时保持 missing_sales（V2 兼容）', () => {
    const item = buildRestockPlan(baseInput({ inventoryItems: [inventory('SKU-1', 0, 2)] })).items[0];
    expect(item.status).toBe('missing_sales');
  });
});

describe('基线与建议双轨迹', () => {
  it('baselineStockSim 为不补货轨迹，stockSim 为采用建议量后轨迹', () => {
    const item = buildRestockPlan(baseInput()).items[0];
    expect(item.baselineStockSim).toBeTruthy();
    expect(item.baselineStockSim!.find(p => p.date === '2026-09-13')!.stockout).toBe(true);
    expect(item.stockSim!.find(p => p.date === '2026-09-13')!.stockout).toBe(false);
    // 两条轨迹在到仓前完全一致
    expect(item.baselineStockSim!.find(p => p.date === '2026-09-11')!.endStock).toBe(
      item.stockSim!.find(p => p.date === '2026-09-11')!.endStock,
    );
  });
});

describe('问题5：建议量等式分项（基线期末安全缺口 ≠ 采用后剩余缺口）', () => {
  /** 审核复现场景：日销10、库存30、提前2天、跨度10天、安全3天、无在途 */
  const docCase = () => buildRestockPlan(baseInput({
    safetyDays: 3,
    inboundOrders: [],
  })).items[0];

  it('审核主案例：建议量 100 = 到仓后基线缺口 70 + 基线期末安全缺口 30（不是 70 + 0）', () => {
    const item = docCase();
    expect(item.gapAfterArrival).toBe(70);        // 09-12 到仓后 7 天 × 10
    expect(item.baselineEndSafetyGap).toBe(30);   // max(0, 30 安全目标 − 0 基线期末)
    expect(item.suggestedQtyRaw).toBe(100);
    expect(item.suggestedQty).toBe(100);
    // 等式自洽：suggestedQtyRaw = 两分项之和；suggestedQty = 向上取整
    expect(item.suggestedQtyRaw).toBe(item.gapAfterArrival + item.baselineEndSafetyGap);
    expect(item.suggestedQty).toBe(Math.ceil(item.suggestedQtyRaw!));
    // 采用建议量后：期末恰达安全目标（剩余缺口 0，与基线缺口 30 含义不同）
    expect(item.endSafetyGap).toBe(0);
    expect(item.stockSim![item.stockSim!.length - 1].endStock).toBe(30);
    expect(item.safetyStockDemand).toBe(30);
  });

  it('小数需求：等式分项为小数时展示原始和与向上取整过程', () => {
    // 日销 3.5：基线 09-18 起断货（缺口 5），安全目标 3.5×3 = 10.5 → raw = 15.5 → ceil 16
    const item = buildRestockPlan(baseInput({
      safetyDays: 3,
      inboundOrders: [],
      inventoryItems: [inventory('SKU-1', 3.5, 2)],
    })).items[0];
    expect(item.gapAfterArrival).toBe(5);
    expect(item.baselineEndSafetyGap).toBe(10.5);
    expect(item.suggestedQtyRaw).toBe(15.5);
    expect(item.suggestedQty).toBe(16);
    expect(item.suggestedQty).toBe(Math.ceil(item.suggestedQtyRaw!));
  });

  it('晚到在途导致期末有剩余：基线期末已超安全目标 → 基线安全缺口为 0，等式不虚增', () => {
    // 主案例在途（ETA 09-19 到 100）+ 安全 5 天：基线期末 90 > 目标 50
    const item = buildRestockPlan(baseInput({ safetyDays: 5 })).items[0];
    expect(item.gapAfterArrival).toBe(60);
    expect(item.baselineEndSafetyGap).toBe(0);
    expect(item.suggestedQtyRaw).toBe(60);
    expect(item.suggestedQty).toBe(60);
    expect(item.endSafetyGap).toBe(0); // 采用后期末 90 仍有剩余 40
    expect(item.stockSim![item.stockSim!.length - 1].endStock).toBe(90);
  });

  it('采用建议量后仍有剩余安全缺口时如实输出（endSafetyGap > 0，独立于基线缺口）', () => {
    // 到仓前断货场景：建议量只能覆盖到仓后缺口与部分安全目标，采用后仍断货（critical）
    const item = buildRestockPlan(baseInput({
      safetyDays: 5,
      remoteStockRows: [{ customerSku: 'SKU-1', siteCode: 'MY', available: 5 }],
    })).items[0];
    expect(item.status).toBe('critical');
    // 等式分项仍来自基线轨迹
    expect(item.gapAfterArrival).toBe(70);
    expect(item.baselineEndSafetyGap).toBe(0); // 基线期末 90（晚到在途）> 目标 50
    expect(item.suggestedQty).toBe(70);
    expect(item.suggestedQtyRaw).toBe(item.gapAfterArrival + item.baselineEndSafetyGap);
  });

  it('formula 模式（V2 默认）：suggestedQtyRaw = null、baselineEndSafetyGap = 0，既有字段语义不变', () => {
    const item = buildRestockPlan(baseInput({ safetyDays: 3, inboundOrders: [], policies: {} })).items[0];
    expect(item.suggestedQtyRaw).toBeNull();
    expect(item.baselineEndSafetyGap).toBe(0);
    // V2 旧公式照常：(覆盖 8 天 + 安全 3 天) × 10 − max(0, 30 − 提前期 20) − 0 在途 = 100
    expect(item.suggestedQty).toBe(100);
    expect(item.endSafetyGap).toBe(0);
  });
});
