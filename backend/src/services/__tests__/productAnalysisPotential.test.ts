import {
  rankPotentialItems,
  MIN_CTR_PERCENT,
  MIN_CLICKS,
  MIN_CART_RATE_PERCENT,
  type PotentialCandidate,
  type PotentialDailyRow,
} from '../../services/productAnalysisPotential';

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
