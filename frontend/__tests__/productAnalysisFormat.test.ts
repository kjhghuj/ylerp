import {
  buildFunnelStages,
  summarizeSheet,
  compareByMetric,
  matchesSearch,
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

  test('treats missing metrics as 0 without crashing', () => {
    const stages = buildFunnelStages(makeItem({ impressions: null, clicks: null }));
    expect(stages[0].value).toBe(0);
    expect(stages[0].rateFromPrev).toBeNull();
    expect(stages[1].value).toBe(0);
    expect(stages[1].rateFromPrev).toBeNull();
  });
});

describe('summarizeSheet', () => {
  test('sums metrics and computes weighted conversion rate', () => {
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
    expect(summary.weightedCvr).toBeCloseTo(1.5, 6);
  });

  test('weightedCvr is null when no visitors', () => {
    const group: SheetGroup = {
      sheetKey: 'new',
      sheetName: '新上架商品',
      columns: [],
      items: [makeItem({ visitors: null, ordersOrdered: null })],
    };
    expect(summarizeSheet(group).weightedCvr).toBeNull();
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
