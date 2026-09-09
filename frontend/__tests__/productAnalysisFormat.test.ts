import {
  buildFunnelStages,
  summarizeSheet,
  compareByMetric,
  matchesSearch,
  buildSearchHaystacks,
  filterAndSortItems,
  formatMoney,
  formatCount,
  formatPercent,
} from '../modules/product-analysis/utils/format';
import type { ParentProduct, SheetGroup } from '../modules/product-analysis/types';

function makeItem(overrides: Partial<ParentProduct> = {}): ParentProduct {
  return {
    itemId: '10001',
    itemName: 'LT820 Silent Wireless Keyboard',
    salesOrdered: 12422.42,
    salesConfirmed: 11861.86,
    impressions: 167670,
    clicks: 11825,
    ctr: 7.05,
    cvrOrdered: 1.38,
    cvrConfirmed: 1.32,
    ordersOrdered: 163,
    ordersConfirmed: 156,
    unitsOrdered: 166,
    unitsConfirmed: 159,
    buyersOrdered: 151,
    buyersConfirmed: 147,
    cvrVisitorsOrdered: 3.07,
    cvrVisitorsConfirmed: 2.99,
    aovOrdered: 76.21,
    aovConfirmed: 76.04,
    uniqueImpressions: 51973,
    uniqueClicks: 5870,
    visitors: 4918,
    pageViews: 14060,
    bounceVisitors: 687,
    bounceRate: 13.97,
    searchClicks: 2477,
    likes: 116,
    cartVisitors: 815,
    cartUnits: 1171,
    cartRate: 16.57,
    repeatOrderRate: 7.36,
    repurchaseRateConfirmed: 5.77,
    avgReorderDays: 0,
    avgRepurchaseDays: 1,
    variations: [],
    ...overrides,
  };
}

describe('buildFunnelStages', () => {
  test('builds 5 stages in order with inter-stage rates', () => {
    const stages = buildFunnelStages(makeItem());
    expect(stages.map((stage) => stage.key)).toEqual([
      'impressions', 'clicks', 'visitors', 'cartUnits', 'orders',
    ]);
    expect(stages[0]).toEqual({ key: 'impressions', value: 167670, rateFromPrev: null });
    expect(stages[1].value).toBe(11825);
    expect(stages[1].rateFromPrev).toBeCloseTo((11825 / 167670) * 100, 6);
    expect(stages[4].value).toBe(163);
    expect(stages[4].rateFromPrev).toBeCloseTo((163 / 1171) * 100, 6);
  });

  test('keeps missing metrics as null instead of faking zero', () => {
    // 回归：缺失阶段曾被 value ?? 0 显示为真实零值
    const stages = buildFunnelStages(makeItem({ impressions: null, clicks: null }));
    expect(stages[0].value).toBeNull();
    expect(stages[0].rateFromPrev).toBeNull();
    expect(stages[1].value).toBeNull();
    // 相邻阶段任一缺失 → 不计算转化率（不产生虚假 0%）
    expect(stages[1].rateFromPrev).toBeNull();
    // 后续有效阶段的转化率也不跨缺失阶段计算
    expect(stages[2].rateFromPrev).toBeNull();
    expect(stages[2].value).toBeGreaterThan(0);
  });

  test('non-finite (undefined) stage values are treated as missing, never NaN%', () => {
    // 回归：字段整体缺失（undefined）时曾产出 rateFromPrev = NaN%（真实浏览器发现）
    const item = makeItem({}) as unknown as Record<string, unknown>;
    delete item.cartUnits; // 字段不存在，而非 null
    const stages = buildFunnelStages(item as unknown as ParentProduct);
    const cartStage = stages.find((stage) => stage.key === 'cartUnits')!;
    expect(cartStage.value).toBeNull();
    expect(cartStage.rateFromPrev).toBeNull();
    // 下一阶段（订单）不跨缺失阶段计算转化率
    const orderStage = stages.find((stage) => stage.key === 'orders')!;
    expect(orderStage.rateFromPrev).toBeNull();
    expect(Number.isNaN(orderStage.rateFromPrev as unknown as number)).toBe(false);
  });

  test('real zero vs missing are distinct; zero denominator stage yields no rate', () => {
    // 真实 0 订单 + 上一阶段有效 > 0 → 0%
    const zeroOrderStages = buildFunnelStages(makeItem({ ordersOrdered: 0 }));
    expect(zeroOrderStages[4].value).toBe(0);
    expect(zeroOrderStages[4].rateFromPrev).toBeCloseTo(0, 6);
    // 上一阶段为真实 0（分母无效）→ 不计算下一阶段转化率
    const zeroPrevStages = buildFunnelStages(makeItem({ visitors: 0 }));
    expect(zeroPrevStages[2].value).toBe(0);
    expect(zeroPrevStages[3].rateFromPrev).toBeNull();
    // 全部缺失：不崩溃、全部为 null
    const allMissing = buildFunnelStages(makeItem({
      impressions: null, clicks: null, visitors: null, cartUnits: null, ordersOrdered: null,
    }));
    expect(allMissing.every((stage) => stage.value === null && stage.rateFromPrev === null)).toBe(true);
  });
});

describe('summarizeSheet', () => {
  test('sums totals only; conversion rate is no longer derived from totals', () => {
    const group: SheetGroup = {
      sheetKey: 'hot',
      sheetName: '热销商品',
      columns: [],
      items: [
        makeItem({ salesOrdered: 100, salesConfirmed: 90, ordersOrdered: 10, visitors: 500, clicks: 200 }),
        makeItem({ itemId: '2', salesOrdered: 50, salesConfirmed: 45, ordersOrdered: 5, visitors: 500, clicks: 100 }),
      ],
    };
    const summary = summarizeSheet(group);
    expect(summary.itemCount).toBe(2);
    expect(summary.totalSalesOrdered).toBe(150);
    expect(summary.totalSalesConfirmed).toBe(135);
    expect(summary.totalOrders).toBe(15);
    expect(summary.totalVisitors).toBe(1000);
    expect(summary.totalClicks).toBe(300);
    // 加权转化率改由后端按成对有效样本返回（sheets[].summary），客户端不再从总量重算
    expect(summary).not.toHaveProperty('weightedCvr');
  });
});

describe('compareByMetric', () => {
  test('sorts descending with nulls last and stable itemId tiebreak', () => {
    const items = [
      makeItem({ itemId: 'b', salesOrdered: 100 }),
      makeItem({ itemId: 'c', salesOrdered: null }),
      makeItem({ itemId: 'a', salesOrdered: 300 }),
      makeItem({ itemId: 'd', salesOrdered: null }),
    ];
    const sorted = [...items].sort(compareByMetric('salesOrdered'));
    expect(sorted.map((item) => item.itemId)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('asc direction sorts values ascending while nulls stay last', () => {
    const items = [
      makeItem({ itemId: 'c', salesOrdered: null }),
      makeItem({ itemId: 'b', salesOrdered: 50 }),
      makeItem({ itemId: 'a', salesOrdered: 300 }),
      makeItem({ itemId: 'd', salesOrdered: null }),
    ];
    const sorted = [...items].sort(compareByMetric('salesOrdered', 'asc'));
    expect(sorted.map((item) => item.itemId)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('matchesSearch', () => {
  const item = makeItem({
    variations: [{ variationName: 'Black' }],
  });

  test('matches itemId, name (case-insensitive) and variation name', () => {
    expect(matchesSearch(item, '10001')).toBe(true);
    expect(matchesSearch(item, 'lt820')).toBe(true);
    expect(matchesSearch(item, 'black')).toBe(true);
  });

  test('empty query matches everything; unknown query does not', () => {
    expect(matchesSearch(item, '   ')).toBe(true);
    expect(matchesSearch(item, 'nonexistent')).toBe(false);
  });
});

describe('search haystack index', () => {
  const items = [
    makeItem({ itemId: '1', itemName: 'Alpha Keyboard', variations: [{ variationName: 'Black' }] }),
    makeItem({ itemId: '2', itemName: 'Gaming Mouse', salesOrdered: 99999 }),
  ];
  const haystacks = buildSearchHaystacks(items);

  test('filterAndSortItems matches per-item matchesSearch results', () => {
    for (const query of ['alpha', 'BLACK', 'mouse', '1', 'nope', '   ']) {
      const expected = items.filter((item) => matchesSearch(item, query));
      expect(filterAndSortItems(items, haystacks, query, 'itemId')).toEqual(expected);
    }
  });

  test('filterAndSortItems sorts by metric descending without mutating input', () => {
    const sorted = filterAndSortItems(items, haystacks, '', 'salesOrdered');
    expect(sorted.map((item) => item.itemId)).toEqual(['2', '1']);
    expect(items.map((item) => item.itemId)).toEqual(['1', '2']);
  });

  test('haystack tolerates aggregated items without variations field', () => {
    // 后端聚合端点的商品不携带 variations（详情端点才有），不得因此抛错
    const bare = { ...items[0] } as Partial<ParentProduct>;
    delete bare.variations;
    const item = bare as ParentProduct;
    expect(() => buildSearchHaystacks([item])).not.toThrow();
    expect(matchesSearch(item, 'alpha')).toBe(true);
  });
});

describe('formatters', () => {
  test('formatMoney adds currency with 2 decimals', () => {
    expect(formatMoney(12422.42, 'MYR')).toBe('MYR 12,422.42');
    expect(formatMoney(null, 'MYR')).toBe('—');
  });

  test('formatCount uses thousands separators', () => {
    expect(formatCount(167670)).toBe('167,670');
    expect(formatCount(undefined)).toBe('—');
  });

  test('formatPercent keeps 2 decimals with sign', () => {
    expect(formatPercent(7.05)).toBe('7.05%');
    expect(formatPercent(16.566)).toBe('16.57%');
    expect(formatPercent(null)).toBe('—');
  });
});
