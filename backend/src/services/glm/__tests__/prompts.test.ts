import {
  buildProductAnalysisSystemPrompt,
  serializeItemForPrompt,
  serializeReportOverview,
  MAX_PROMPT_CONTEXT_CHARS,
} from '../prompts';

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: '10001',
    itemName: 'Silent Wireless Keyboard LT820',
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

function makeReportData(items: Record<string, unknown>[]): unknown {
  return {
    sheets: [
      { sheetKey: 'hot', sheetName: '热销商品', columns: [], items },
    ],
    warnings: [],
  };
}

describe('buildProductAnalysisSystemPrompt', () => {
  test('embeds file name, period, currency and mode', () => {
    const prompt = buildProductAnalysisSystemPrompt({
      fileName: 'parentskudetail.xlsx',
      periodStart: '2026-08-07',
      periodEnd: '2026-09-05',
      currency: 'MYR',
      mode: 'item',
    });
    expect(prompt).toContain('parentskudetail.xlsx');
    expect(prompt).toContain('2026-08-07 至 2026-09-05');
    expect(prompt).toContain('MYR');
    expect(prompt).toContain('单个商品');
  });

  test('falls back to unknown period and report mode wording', () => {
    const prompt = buildProductAnalysisSystemPrompt({
      fileName: 'x.xlsx',
      currency: 'MYR',
      mode: 'report',
    });
    expect(prompt).toContain('未知');
    expect(prompt).toContain('店铺级汇总');
  });
});

describe('serializeItemForPrompt', () => {
  test('serializes non-null metrics with Chinese labels and variations sorted by units', () => {
    const text = serializeItemForPrompt(makeReportData([makeItem()]), 'hot', '10001');
    expect(text).toContain('商品编号: 10001');
    expect(text).toContain('销售额-已下订单: 12422.42');
    expect(text).toContain('点击率%: 7.05');
    expect(text).not.toContain('跳出率%');
    const whiteLine = text.split('\n').find((line) => line.includes('White'));
    const blackLine = text.split('\n').find((line) => line.includes('Black'));
    expect(whiteLine).toBeDefined();
    expect(blackLine).toBeDefined();
    expect(text.indexOf('White')).toBeLessThan(text.indexOf('Black'));
  });

  test('returns empty string when sheet or item is missing', () => {
    const data = makeReportData([makeItem()]);
    expect(serializeItemForPrompt(data, 'unknown-sheet', '10001')).toBe('');
    expect(serializeItemForPrompt(data, 'hot', '99999')).toBe('');
  });

  test('truncates variation list beyond the limit', () => {
    const variations = Array.from({ length: 25 }, (_, i) => ({
      variationName: `变体${i + 1}`,
      unitsOrdered: i,
    }));
    const text = serializeItemForPrompt(
      makeReportData([makeItem({ variations })]),
      'hot',
      '10001'
    );
    expect(text).toContain('仅列出件数前 20 个变体，共 25 个');
  });
});

describe('serializeReportOverview', () => {
  test('summarizes sheet totals and top items', () => {
    const items = [
      makeItem({ itemId: '1', itemName: 'A', salesOrdered: 500 }),
      makeItem({ itemId: '2', itemName: 'B', salesOrdered: 900 }),
    ];
    const text = serializeReportOverview(makeReportData(items));
    expect(text).toContain('【热销商品】商品数 2');
    expect(text).toContain('总销售额(已下) 1400.00');
    expect(text.indexOf('2. 1')).toBeGreaterThan(0);
    expect(text).toContain('销售额 Top 2');
  });

  test('skips sheets without items', () => {
    const text = serializeReportOverview({ sheets: [{ sheetKey: 'new', sheetName: '新上架', items: [] }] });
    expect(text).toBe('');
  });

  test('truncates overly long overview output', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({ itemId: String(i), itemName: `商品${i}`, salesOrdered: 1000 - i })
    );
    const manySheets = {
      sheets: Array.from({ length: 150 }, (_, i) => ({
        sheetKey: `sheet-${i}`,
        sheetName: `分类${i}`,
        items,
      })),
    };
    const text = serializeReportOverview(manySheets);
    expect(text.length).toBeLessThanOrEqual(MAX_PROMPT_CONTEXT_CHARS + 20);
    expect(text).toContain('（数据过长已截断）');
  });
});
