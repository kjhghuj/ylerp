import {
  rankPotentialItems,
  MIN_TOTAL_VISITORS,
  type PotentialCandidate,
  type PotentialDailyRow,
} from '../../services/productAnalysisPotential';

function makeCandidate(overrides: Partial<PotentialCandidate> & { itemId: string }): PotentialCandidate {
  return {
    itemName: `Item ${overrides.itemId}`,
    sheetKey: 'hot',
    status: 'Normal',
    daily: [],
    ...overrides,
  };
}

function days(count: number, build: (index: number) => Partial<PotentialDailyRow> & { ordersOrdered: number; visitors: number }): PotentialDailyRow[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    clicks: 0,
    impressions: 0,
    cartVisitors: 0,
    ...build(index),
  }));
}

describe('rankPotentialItems', () => {
  test('excludes banned/deleted and low-traffic items', () => {
    const results = rankPotentialItems([
      makeCandidate({ itemId: 'banned', status: 'Banned', daily: days(6, () => ({ ordersOrdered: 10, visitors: 200 })) }),
      makeCandidate({ itemId: 'low-traffic', daily: days(6, () => ({ ordersOrdered: 10, visitors: 5 })) }),
      makeCandidate({ itemId: 'ok', daily: days(6, () => ({ ordersOrdered: 1, visitors: 100 })) }),
    ]);
    expect(results.map((item) => item.itemId)).toEqual(['ok']);
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
    // flat 无明显增长信号 → 兜底理由
    expect(results[1].reasons.length).toBeGreaterThan(0);
  });

  test('computes growth as 100% when previous half is zero', () => {
    const [result] = rankPotentialItems([
      makeCandidate({
        itemId: 'new-hot',
        daily: days(6, (index) => ({ ordersOrdered: index < 3 ? 0 : 5, visitors: 100 })),
      }),
    ]);
    expect(result.metrics.growthPercent).toBe(100);
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

  test('threshold constant matches spec', () => {
    expect(MIN_TOTAL_VISITORS).toBe(50);
  });
});
