import {
  rankPotentialItems,
  buildGrowthWindows,
  MIN_CTR_PERCENT,
  MIN_CLICKS,
  MIN_CART_RATE_PERCENT,
  type PotentialCandidate,
  type PotentialDailyRow,
} from '../../services/productAnalysisPotential';
import { aggregateItems } from '../../services/productAnalysisAggregation';

function makeCandidate(overrides: Partial<PotentialCandidate> & { itemId: string }): PotentialCandidate {
  return {
    itemName: `Item ${overrides.itemId}`,
    sheetKey: 'new',
    status: 'Normal',
    daily: [],
    ...overrides,
  };
}

/** 默认满足全部入围阈值：ctr = clicks/impressions = 10%，加购率 = cartVisitors/visitors = 5% */
function days(count: number, build: (index: number) => Partial<PotentialDailyRow> & { ordersOrdered: number; visitors: number }): PotentialDailyRow[] {
  return Array.from({ length: count }, (_, index) => {
    const built = build(index);
    return {
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      clicks: 10,
      impressions: 100,
      ...built,
      cartVisitors: built.cartVisitors ?? Math.round(built.visitors * 0.05),
    };
  });
}

describe('rankPotentialItems', () => {
  test('keeps items meeting all thresholds', () => {
    const results = rankPotentialItems([
      makeCandidate({ itemId: 'ok', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
    ]);
    expect(results.map((item) => item.itemId)).toEqual(['ok']);
    expect(results[0].reasons.length).toBeGreaterThan(0);
  });

  test('excludes banned/deleted items', () => {
    const results = rankPotentialItems([
      makeCandidate({ itemId: 'banned', status: 'Banned', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
      makeCandidate({ itemId: 'deleted', status: 'Deleted', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
    ]);
    expect(results).toHaveLength(0);
  });

  test('excludes items below CTR / clicks / cart-rate thresholds', () => {
    const results = rankPotentialItems([
      // ctr = 2/100 = 2% ≤ 4%
      makeCandidate({ itemId: 'low-ctr', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100, clicks: 2, impressions: 100 })) }),
      // 总点击 = 5 ≤ 5（ctr = 5/50 = 10% 仍达标，专测点击数阈值）
      makeCandidate({ itemId: 'low-clicks', daily: days(6, (index) => ({ ordersOrdered: 2, visitors: 100, clicks: index < 5 ? 1 : 0, impressions: index < 5 ? 10 : 0 })) }),
      // 加购率 = 0/100 = 0% ≤ 1%
      makeCandidate({ itemId: 'low-cart', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100, cartVisitors: 0 })) }),
    ]);
    expect(results).toHaveLength(0);
  });

  test('ranks growing items higher and attaches reasons', () => {
    const results = rankPotentialItems([
      makeCandidate({
        itemId: 'growing',
        daily: days(8, (index) => ({
          ordersOrdered: index < 4 ? 1 : 8,
          visitors: index < 4 ? 100 : 120,
        })),
      }),
      makeCandidate({
        itemId: 'flat',
        daily: days(8, () => ({ ordersOrdered: 5, visitors: 110 })),
      }),
    ]);
    expect(results[0].itemId).toBe('growing');
    expect(results[0].rank).toBe(1);
    expect(results[0].reasons.some((reason) => reason.includes('环比'))).toBe(true);
    expect(results[0].metrics.growthPercent).toBeGreaterThan(0);
    // flat 无明显增长信号 → 仍有兜底理由
    expect(results[1].reasons.length).toBeGreaterThan(0);
  });

  test('caps output at limit with sequential ranks', () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      makeCandidate({
        itemId: `item-${index}`,
        daily: days(4, () => ({ ordersOrdered: index, visitors: 100 + index * 10 })),
      })
    );
    const results = rankPotentialItems(candidates, { limit: 10 });
    expect(results).toHaveLength(10);
    expect(results.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index - 1].score).toBeGreaterThanOrEqual(results[index].score);
    }
  });

  test('threshold constants match spec', () => {
    expect(MIN_CTR_PERCENT).toBe(4);
    expect(MIN_CLICKS).toBe(5);
    expect(MIN_CART_RATE_PERCENT).toBe(1);
  });
});

describe('growth windows (query-range based)', () => {
  const RANGE_7D = { from: '2026-09-01', to: '2026-09-07' };

  test('builds equal-length calendar windows and drops the earliest day for odd ranges', () => {
    const windows = buildGrowthWindows(RANGE_7D);
    expect(windows.windowDays).toBe(3);
    expect([...windows.previousDays].sort()).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
    expect([...windows.recentDays].sort()).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
  });

  test('no window for single-day ranges', () => {
    const windows = buildGrowthWindows({ from: '2026-09-01', to: '2026-09-01' });
    expect(windows.windowDays).toBe(0);
    expect(windows.previousDays.size).toBe(0);
    expect(windows.recentDays.size).toBe(0);
  });

  test('equal daily orders yield exactly 0% growth (was +33.3% with record-count halving)', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({
          itemId: 'flat',
          daily: days(7, () => ({ ordersOrdered: 10, visitors: 100 })),
        }),
      ],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: RANGE_7D }
    );
    expect(results[0].metrics.growthPercent).toBe(0);
    expect(results[0].metrics.growthStatus).toBe('ok');
    expect(results[0].metrics.growthWindowDays).toBe(3);
  });

  test('the discarded earliest day does not affect growth', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({
          itemId: 'spike-then-flat',
          // 第 1 天 1000 单（被舍弃），其余 10 单/天 → 0%
          daily: days(7, (index) => ({ ordersOrdered: index === 0 ? 1000 : 10, visitors: 100 })),
        }),
      ],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: RANGE_7D }
    );
    expect(results[0].metrics.growthPercent).toBe(0);
  });

  test('missing days are not counted as zero: averages run over covered days only', () => {
    // 8 天区间：前窗 09-01~04、后窗 09-05~08。
    // 前窗缺 1 天（3 天记录、日均 10），后窗缺 2 天（2 天记录、日均 20）→ 日均口径 +100%；
    // 若缺失日被当成 0：30/4=7.5 vs 40/4=10 → +33.3%（回归目标：拒绝该口径）
    const daily: PotentialDailyRow[] = [
      ...days(4, (index) => ({ ordersOrdered: index === 0 ? 0 : 10, visitors: 100 })).slice(1, 4), // 09-02~04
      ...days(8, () => ({ ordersOrdered: 20, visitors: 100 })).slice(4, 6), // 09-05~06
    ];
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'sparse', daily })],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: { from: '2026-09-01', to: '2026-09-08' } }
    );
    expect(results[0].metrics.growthPercent).toBeCloseTo(100, 6);
  });

  test('zero-order previous window with later orders marks new-orders instead of a fake percentage', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({
          itemId: 'rise',
          // 前窗（09-02~04）全部 0 单，后窗（09-05~07）每天 5 单
          daily: days(7, (index) => ({ ordersOrdered: index >= 4 ? 5 : 0, visitors: 100 })),
        }),
      ],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: RANGE_7D }
    );
    expect(results[0].metrics.growthPercent).toBeNull();
    expect(results[0].metrics.growthStatus).toBe('new-orders');
    expect(results[0].reasons.some((reason) => reason.includes('新增订单'))).toBe(true);
    // 无可比增长数据：增长项记 0 分，不产生奖励
    expect(results[0].score).toBeLessThan(100);
  });

  test('items with records in only one window report insufficient data', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({
          itemId: 'late-listed',
          // 仅出现在后窗（09-05~07）
          daily: days(7, (index) => ({ ordersOrdered: 5, visitors: 100 })).slice(4),
        }),
        makeCandidate({
          itemId: 'gone-early',
          // 仅出现在前窗（09-02~04）
          daily: days(7, () => ({ ordersOrdered: 5, visitors: 100 })).slice(1, 4),
        }),
      ],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: RANGE_7D }
    );
    const byId = new Map(results.map((item) => [item.itemId, item.metrics]));
    expect(byId.get('late-listed')!.growthPercent).toBeNull();
    expect(byId.get('late-listed')!.growthStatus).toBe('insufficient');
    expect(byId.get('gone-early')!.growthPercent).toBeNull();
    expect(byId.get('gone-early')!.growthStatus).toBe('insufficient');
  });

  test('all candidates in the same query range share identical windows', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({ itemId: 'full', daily: days(7, () => ({ ordersOrdered: 10, visitors: 100 })) }),
        makeCandidate({ itemId: 'partial', daily: days(7, () => ({ ordersOrdered: 7, visitors: 90 })).slice(3) }),
      ],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: RANGE_7D }
    );
    const windowDays = new Set(results.map((item) => item.metrics.growthWindowDays));
    expect(windowDays).toEqual(new Set([3]));
  });

  test('single-day data produces no growth percentage', () => {
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'one-day', daily: days(1, () => ({ ordersOrdered: 10, visitors: 100 })) })],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: { from: '2026-09-01', to: '2026-09-01' } }
    );
    expect(results[0].metrics.growthPercent).toBeNull();
    expect(results[0].metrics.growthStatus).toBe('insufficient');
    expect(results[0].metrics.growthWindowDays).toBe(0);
  });

  test('cvrOrdered uses ordered orders over visitors', () => {
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'cvr', daily: days(6, () => ({ ordersOrdered: 5, visitors: 100 })) })],
      { minCtrPercent: null, minClicks: null, minCartRatePercent: null, range: { from: '2026-09-01', to: '2026-09-06' } }
    );
    expect(results[0].metrics.cvrOrdered).toBeCloseTo(5, 6);
    expect(results[0].metrics).not.toHaveProperty('cvrConfirmed');
  });
});

describe('missing order metrics keep unknown semantics (null ≠ 0)', () => {
  const RANGE_7D = { from: '2026-09-01', to: '2026-09-07' };
  const RELAXED = { minCtrPercent: null, minClicks: null, minCartRatePercent: null } as const;

  /** 构造窗口内每天可控的行：ordersOrdered 为 undefined 表示缺失指标（null 语义） */
  function rowOf(date: string, overrides: Partial<PotentialDailyRow> = {}): PotentialDailyRow {
    return {
      date,
      ordersOrdered: 10,
      visitors: 100,
      clicks: 10,
      impressions: 200,
      cartVisitors: 10,
      ...overrides,
    };
  }

  test('previous window all-unknown orders is insufficient data, not new-orders', async () => {
    // 回归：路由曾把 null 订单转成 0，前期未知 + 后期 10 单被错标成「新增订单」
    const daily = [
      ...['2026-09-02', '2026-09-03', '2026-09-04'].map((date) => rowOf(date, { ordersOrdered: null })),
      ...['2026-09-05', '2026-09-06', '2026-09-07'].map((date) => rowOf(date, { ordersOrdered: 10 })),
    ];
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'unknown-prev', daily })],
      { ...RELAXED, range: RANGE_7D }
    );
    expect(results[0].metrics.growthStatus).toBe('insufficient');
    expect(results[0].metrics.growthPercent).toBeNull();
    expect(results[0].reasons.some((reason) => reason.includes('新增订单'))).toBe(false);
  });

  test('previous window with genuine zero orders and later orders is new-orders', () => {
    const daily = [
      ...['2026-09-02', '2026-09-03', '2026-09-04'].map((date) => rowOf(date, { ordersOrdered: 0 })),
      ...['2026-09-05', '2026-09-06', '2026-09-07'].map((date) => rowOf(date, { ordersOrdered: 10 })),
    ];
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'zero-prev', daily })],
      { ...RELAXED, range: RANGE_7D }
    );
    expect(results[0].metrics.growthStatus).toBe('new-orders');
    expect(results[0].metrics.growthPercent).toBeNull();
  });

  test('both windows unknown and partially missing metrics', () => {
    const allUnknown = [
      ...['2026-09-02', '2026-09-03', '2026-09-04'].map((date) => rowOf(date, { ordersOrdered: null })),
      ...['2026-09-05', '2026-09-06', '2026-09-07'].map((date) => rowOf(date, { ordersOrdered: null })),
    ];
    const allUnknownResult = rankPotentialItems(
      [makeCandidate({ itemId: 'no-orders', daily: allUnknown })],
      { ...RELAXED, range: RANGE_7D }
    )[0];
    expect(allUnknownResult.metrics.growthStatus).toBe('no-data');
    // 订单合计为 null（未知），不是 0
    expect(allUnknownResult.metrics.ordersOrdered).toBeNull();

    // 部分日期缺失：仅按有效观测日均——前窗有效 2 天（日均 10）vs 后窗 3 天（日均 10）→ 0%
    const partial = [
      rowOf('2026-09-02', { ordersOrdered: null }),
      rowOf('2026-09-03', { ordersOrdered: 10 }),
      rowOf('2026-09-04', { ordersOrdered: 10 }),
      rowOf('2026-09-05', { ordersOrdered: 10 }),
      rowOf('2026-09-06', { ordersOrdered: 10 }),
      rowOf('2026-09-07', { ordersOrdered: 10 }),
    ];
    const partialResult = rankPotentialItems(
      [makeCandidate({ itemId: 'partial', daily: partial })],
      { ...RELAXED, range: RANGE_7D }
    )[0];
    expect(partialResult.metrics.growthStatus).toBe('ok');
    expect(partialResult.metrics.growthPercent).toBe(0);
    // 缺失日不计入订单合计：2×10 + 3×10 = 50（而非 60）
    expect(partialResult.metrics.ordersOrdered).toBe(50);
  });

  test('complete data with equal daily orders still yields 0% and genuine zeros count', () => {
    const daily = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07']
      .map((date) => rowOf(date, { ordersOrdered: 7 }));
    const results = rankPotentialItems(
      [makeCandidate({ itemId: 'equal', daily })],
      { ...RELAXED, range: RANGE_7D }
    );
    expect(results[0].metrics.growthPercent).toBe(0);
    expect(results[0].metrics.ordersOrdered).toBe(42);
  });

  test('pairwise-complete samples for rates: unknown numerator is not shown as 0%', () => {
    // 订单全未知：cvrOrdered = null（成对样本为空），访客合计仍按有效观测统计
    const daily = ['2026-09-01', '2026-09-02'].map((date) => rowOf(date, { ordersOrdered: null }));
    const metrics = rankPotentialItems(
      [makeCandidate({ itemId: 'no-cvr', daily })],
      { ...RELAXED, excludeBannedDeleted: false, range: { from: '2026-09-01', to: '2026-09-02' } }
    )[0].metrics;
    expect(metrics.cvrOrdered).toBeNull();
    expect(metrics.visitors).toBe(200);

    // 部分成对：仅第 1 天订单+访客齐全（10/100），第 2 天订单缺失 → cvr = 10%（分母只算第 1 天访客）
    const partial = [rowOf('2026-09-01'), rowOf('2026-09-02', { ordersOrdered: null, visitors: 400 })];
    const partialMetrics = rankPotentialItems(
      [makeCandidate({ itemId: 'pair', daily: partial })],
      { ...RELAXED, excludeBannedDeleted: false, range: { from: '2026-09-01', to: '2026-09-02' } }
    )[0].metrics;
    expect(partialMetrics.cvrOrdered).toBeCloseTo(10, 6);
    expect(partialMetrics.visitors).toBe(500);
  });

  test('cvrOrdered matches the aggregation service on the same logical data (parity reproduction)', () => {
    // 复现样例：第一天 10 单/100 访客，第二天订单缺失/100 访客 —— 两处同名指标必须一致为 10%
    const daily = [rowOf('2026-09-01', { ordersOrdered: 10 }), rowOf('2026-09-02', { ordersOrdered: null })];
    const potentialMetrics = rankPotentialItems(
      [makeCandidate({ itemId: 'parity', daily })],
      { ...RELAXED, excludeBannedDeleted: false, range: { from: '2026-09-01', to: '2026-09-02' } }
    )[0].metrics;
    const aggregationRows = [
      { itemId: 'parity', itemName: 'Parity', sheetKey: 'new', date: '2026-09-01', ordersOrdered: 10, visitors: 100 },
      { itemId: 'parity', itemName: 'Parity', sheetKey: 'new', date: '2026-09-02', ordersOrdered: null, visitors: 100 },
    ];
    const [aggregated] = aggregateItems(aggregationRows);
    expect(potentialMetrics.cvrOrdered).toBeCloseTo(10, 6);
    expect(aggregated.cvrOrdered).toBeCloseTo(potentialMetrics.cvrOrdered as number, 6);
  });

  test('growth coverage reports observed days per window', () => {
    // 前窗（09-02~04）仅 1 天有有效订单观测，后窗（09-05~07）3 天齐全
    const daily = [
      rowOf('2026-09-02', { ordersOrdered: null }),
      rowOf('2026-09-03', { ordersOrdered: 10 }),
      rowOf('2026-09-04', { ordersOrdered: null }),
      rowOf('2026-09-05', { ordersOrdered: 12 }),
      rowOf('2026-09-06', { ordersOrdered: 12 }),
      rowOf('2026-09-07', { ordersOrdered: 12 }),
    ];
    const metrics = rankPotentialItems(
      [makeCandidate({ itemId: 'coverage', daily })],
      { ...RELAXED, range: RANGE_7D }
    )[0].metrics;
    expect(metrics.growthWindowDays).toBe(3);
    expect(metrics.growthPreviousObservedDays).toBe(1);
    expect(metrics.growthRecentObservedDays).toBe(3);
    // 环比基于有效观测日均：前期 10 vs 后期 12 → +20%
    expect(metrics.growthPercent).toBeCloseTo(20, 6);
    expect(metrics.growthStatus).toBe('ok');
  });

  test('growth coverage is zero for single-day ranges', () => {
    const metrics = rankPotentialItems(
      [makeCandidate({ itemId: 'one', daily: [rowOf('2026-09-01')] })],
      { ...RELAXED, range: { from: '2026-09-01', to: '2026-09-01' } }
    )[0].metrics;
    expect(metrics.growthWindowDays).toBe(0);
    expect(metrics.growthPreviousObservedDays).toBe(0);
    expect(metrics.growthRecentObservedDays).toBe(0);
  });
});

describe('rankPotentialItems with custom filters', () => {
  const standard = () => days(6, () => ({ ordersOrdered: 2, visitors: 100 }));

  test('relaxed thresholds admit items the defaults would exclude', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({ itemId: 'lowCtr', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100, clicks: 2, impressions: 100 })) }),
      ],
      { minCtrPercent: 1 }
    );
    expect(results.map((item) => item.itemId)).toEqual(['lowCtr']);
  });

  test('null disables a condition entirely', () => {
    // 加购率为 0：默认被排除，minCartRatePercent null 时入围
    const noCart = days(6, () => ({ ordersOrdered: 2, visitors: 100, cartVisitors: 0 }));
    expect(rankPotentialItems([makeCandidate({ itemId: 'x', daily: noCart })])).toHaveLength(0);
    expect(
      rankPotentialItems([makeCandidate({ itemId: 'x', daily: noCart })], { minCartRatePercent: null })
    ).toHaveLength(1);
  });

  test('threshold 0 behaves the same as unlimited (not "must be > 0")', () => {
    // 零互动商品：无点击、无加购、无曝光（ctr=null）
    const idle = days(6, () => ({ ordersOrdered: 0, visitors: 20, clicks: 0, impressions: 0, cartVisitors: 0 }));
    expect(
      rankPotentialItems(
        [makeCandidate({ itemId: 'idle', daily: idle })],
        { minCtrPercent: 0, minClicks: 0, minCartRatePercent: 0 }
      )
    ).toHaveLength(1);
    // 正阈值仍然生效：点击数 > 5 把它筛掉
    expect(
      rankPotentialItems(
        [makeCandidate({ itemId: 'idle', daily: idle })],
        { minCtrPercent: 0, minClicks: 5, minCartRatePercent: 0 }
      )
    ).toHaveLength(0);
  });

  test('excludeBannedDeleted=false admits banned items', () => {
    const banned = makeCandidate({ itemId: 'banned', status: 'Banned', daily: standard() });
    expect(rankPotentialItems([banned])).toHaveLength(0);
    expect(rankPotentialItems([banned], { excludeBannedDeleted: false })).toHaveLength(1);
  });

  test('custom limit changes the returned count', () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      makeCandidate({ itemId: `item-${index}`, daily: standard() })
    );
    expect(rankPotentialItems(candidates, { limit: 3 })).toHaveLength(3);
    expect(rankPotentialItems(candidates, { limit: 20 })).toHaveLength(15);
  });

  test('all conditions null ranks everything without thresholds', () => {
    const results = rankPotentialItems(
      [
        makeCandidate({ itemId: 'weak', daily: days(6, () => ({ ordersOrdered: 1, visitors: 50, clicks: 1, impressions: 100, cartVisitors: 0 })) }),
        makeCandidate({ itemId: 'banned', status: 'Banned', daily: standard() }),
      ],
      {
        minCtrPercent: null,
        minClicks: null,
        minCartRatePercent: null,
        excludeBannedDeleted: false,
      }
    );
    expect(results).toHaveLength(2);
    // 无信号商品仍有兜底理由
    expect(results.every((item) => item.reasons.length > 0)).toBe(true);
  });
});
