import {
  buildShopAnalysisSystemPrompt,
  serializeAggregatedItem,
  serializeAggregatedOverview,
  MAX_PROMPT_CONTEXT_CHARS,
} from '../prompts';

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: '10001',
    itemName: 'Silent Wireless Keyboard LT820',
    days: 7,
    salesOrdered: 12422.42,
    salesConfirmed: 11861.86,
    impressions: 167670,
    clicks: 11825,
    ctr: 7.05,
    cvrConfirmed: 1.32,
    ordersOrdered: 163,
    visitors: 4918,
    cartUnits: 1171,
    bounceRate: null,
    variations: [
      { variationName: 'Black', unitsOrdered: 15, unitsConfirmed: 15, buyersOrdered: 14, cartUnits: 75 },
      { variationName: 'White', unitsOrdered: 30, unitsConfirmed: 28, buyersOrdered: 25, cartUnits: 50 },
    ],
    ...overrides,
  };
}

describe('buildShopAnalysisSystemPrompt', () => {
  test('embeds shop, site, range, days and aggregation semantics', () => {
    const prompt = buildShopAnalysisSystemPrompt({
      shopName: 'MY 主店',
      site: 'MY',
      currency: 'MYR',
      from: '2026-08-31',
      to: '2026-09-06',
      days: 7,
      mode: 'overview',
    });
    expect(prompt).toContain('MY 主店');
    expect(prompt).toContain('2026-08-31 至 2026-09-06');
    expect(prompt).toContain('MYR');
    expect(prompt).toContain('整店区间汇总数据');
    expect(prompt).toContain('区间求和');
    expect(prompt).toContain('订单÷访客');
  });

  test('item mode targets a single product with trend', () => {
    const prompt = buildShopAnalysisSystemPrompt({
      shopName: 'S',
      site: 'PH',
      currency: 'PHP',
      from: '2026-08-31',
      to: '2026-09-06',
      days: 7,
      mode: 'item',
    });
    expect(prompt).toContain('单个商品（含日趋势与全部变体）');
  });
});

describe('serializeAggregatedItem', () => {
  test('serializes metrics, daily trend and variations', () => {
    const text = serializeAggregatedItem(
      makeItem(),
      [
        { date: '2026-09-05', ordersOrdered: 20, visitors: 700, cvrConfirmed: 2.85 },
        { date: '2026-09-06', ordersOrdered: 25, visitors: 800, cvrConfirmed: null },
      ],
      makeItem().variations
    );
    expect(text).toContain('商品编号: 10001');
    expect(text).toContain('覆盖天数: 7');
    expect(text).toContain('2026-09-05: 20 | 700 | 2.85');
    expect(text).toContain('2026-09-06: 25 | 800 | —');
    expect(text).toContain('变体明细');
    expect(text).toContain('Black');
  });

  test('truncates beyond the context limit', () => {
    // 商品名与变体名都会被截短，用超长日趋势触发上下文截断
    const series = Array.from({ length: 1000 }, (_, index) => ({
      date: `day-${index}`,
      ordersOrdered: index,
      visitors: index * 10,
      cvrConfirmed: 1.23,
    }));
    const text = serializeAggregatedItem(makeItem(), series, []);
    expect(text.length).toBeLessThanOrEqual(MAX_PROMPT_CONTEXT_CHARS + 50);
    expect(text).toContain('数据过长已截断');
  });
});

describe('serializeAggregatedOverview', () => {
  test('summarizes sheets and lists top items by sales', () => {
    const items = [
      makeItem({ itemId: '1', salesOrdered: 100 }),
      makeItem({ itemId: '2', salesOrdered: 500, itemName: 'Top Seller' }),
    ];
    const text = serializeAggregatedOverview([{ sheetKey: 'hot', items }]);
    expect(text).toContain('【类别 hot】商品数 2');
    expect(text).toContain('总销售额(已下) 600.00');
    expect(text).toContain('Top Seller');
    // 销售额降序：Top Seller 排第一
    expect(text.indexOf('Top Seller')).toBeLessThan(text.indexOf('Silent Wireless Keyboard'));
  });

  test('returns empty string for empty sheets', () => {
    expect(serializeAggregatedOverview([{ sheetKey: 'hot', items: [] }])).toBe('');
  });
});
