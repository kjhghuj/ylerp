import {
  rankPotentialItems,
  MAX_LISTED_DAYS,
  MIN_CTR_PERCENT,
  MIN_CLICKS,
  MIN_CART_RATE_PERCENT,
  type PotentialCandidate,
  type PotentialDailyRow,
} from '../../services/productAnalysisPotential';

function makeCandidate(overrides: Partial<PotentialCandidate> & { itemId: string }): PotentialCandidate {
  return {
    itemName: `Item ${overrides.itemId}`,
    sheetKey: 'hot',
    status: 'Normal',
    createdDays: 30,
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
    expect(results[0].reasons[0]).toBe('上架 30 天');
  });

  test('excludes banned/deleted items', () => {
    const results = rankPotentialItems([
      makeCandidate({ itemId: 'banned', status: 'Banned', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
      makeCandidate({ itemId: 'deleted', status: 'Deleted', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
    ]);
    expect(results).toHaveLength(0);
  });

  test('excludes items listed more than 60 days ago', () => {
    const results = rankPotentialItems([
      makeCandidate({ itemId: 'old', createdDays: 61, daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
      makeCandidate({ itemId: 'edge', createdDays: 60, daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
    ]);
    expect(results.map((item) => item.itemId)).toEqual(['edge']);
  });

  test('derives listed days from createdAt when createdDays is missing', () => {
    const results = rankPotentialItems([
      // 区间最后一天 2026-09-06，上架 2026-08-10 → 27 天
      makeCandidate({ itemId: 'from-date', createdDays: null, createdAt: '2026-08-10', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
      makeCandidate({ itemId: 'too-old', createdDays: null, createdAt: '2026-05-01', daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
      makeCandidate({ itemId: 'no-listing-info', createdDays: null, createdAt: null, daily: days(6, () => ({ ordersOrdered: 2, visitors: 100 })) }),
    ]);
    expect(results.map((item) => item.itemId)).toEqual(['from-date']);
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
    // flat 无明显增长信号 → 仍有上榜天数 + 兜底理由
    expect(results[1].reasons.length).toBeGreaterThan(1);
  });

  test('caps output at limit with sequential ranks', () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      makeCandidate({
        itemId: `item-${index}`,
        daily: days(4, () => ({ ordersOrdered: index, visitors: 100 + index * 10 })),
      })
    );
    const results = rankPotentialItems(candidates, 10);
    expect(results).toHaveLength(10);
    expect(results.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index - 1].score).toBeGreaterThanOrEqual(results[index].score);
    }
  });

  test('threshold constants match spec', () => {
    expect(MAX_LISTED_DAYS).toBe(60);
    expect(MIN_CTR_PERCENT).toBe(4);
    expect(MIN_CLICKS).toBe(5);
    expect(MIN_CART_RATE_PERCENT).toBe(1);
  });
});
