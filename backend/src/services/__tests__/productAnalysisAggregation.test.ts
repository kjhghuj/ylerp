import {
  aggregateItems,
  buildDailySeries,
  buildItemDetail,
  mapParsedSheetItemsToDailyRows,
  mergeVariations,
  SUMMABLE_FIELDS,
  type DailyItemRow,
} from '../../services/productAnalysisAggregation';

function makeRow(overrides: Partial<DailyItemRow> & { itemId: string; date: string }): DailyItemRow {
  return {
    itemName: 'Keyboard',
    sheetKey: 'hot',
    status: 'Normal',
    visitors: null,
    clicks: null,
    impressions: null,
    ordersOrdered: null,
    ordersConfirmed: null,
    salesOrdered: null,
    salesConfirmed: null,
    unitsOrdered: null,
    unitsConfirmed: null,
    buyersOrdered: null,
    buyersConfirmed: null,
    uniqueImpressions: null,
    uniqueClicks: null,
    pageViews: null,
    bounceVisitors: null,
    searchClicks: null,
    likes: null,
    cartVisitors: null,
    cartUnits: null,
    ...overrides,
  };
}

describe('aggregateItems', () => {
  test('sums metrics across days and derives rates with visitor denominators', () => {
    const rows = [
      makeRow({ itemId: '1', date: '2026-09-01', visitors: 100, clicks: 20, impressions: 400, ordersOrdered: 2, salesOrdered: 200 }),
      makeRow({ itemId: '1', date: '2026-09-02', visitors: 150, clicks: 30, impressions: 600, ordersOrdered: 4, salesConfirmed: 560 }),
    ];
    const [item] = aggregateItems(rows);
    expect(item.days).toBe(2);
    expect(item.firstDate).toBe('2026-09-01');
    expect(item.lastDate).toBe('2026-09-02');
    expect(item.visitors).toBe(250);
    expect(item.clicks).toBe(50);
    expect(item.impressions).toBe(1000);
    expect(item.ordersOrdered).toBe(6);
    expect(item.salesOrdered).toBe(200);
    // 率类推导：ctr = 50/1000、访客转化 = 6/250
    expect(item.ctr).toBeCloseTo(5, 6);
    expect(item.cvrVisitorsOrdered).toBeCloseTo(2.4, 6);
    expect(item.cvrOrdered).toBeCloseTo(2.4, 6);
    expect(item.aovOrdered).toBeCloseTo(200 / 6, 6);
    // 区间不可推导字段恒为 null
    expect(item.repeatOrderRate).toBeNull();
    expect(item.avgReorderDays).toBeNull();
  });

  test('missing metric stays null and zero denominators yield null rates', () => {
    const [item] = aggregateItems([makeRow({ itemId: '1', date: '2026-09-01' })]);
    expect(item.visitors).toBeNull();
    expect(item.ctr).toBeNull();
    expect(item.cvrConfirmed).toBeNull();
  });

  test('itemName and status come from the latest day', () => {
    const items = aggregateItems([
      makeRow({ itemId: '1', date: '2026-09-01', itemName: 'Old Name' }),
      makeRow({ itemId: '1', date: '2026-09-03', itemName: 'New Name', status: 'Banned' }),
      makeRow({ itemId: '1', date: '2026-09-02', itemName: 'Mid Name' }),
    ]);
    expect(items[0].itemName).toBe('New Name');
    expect(items[0].status).toBe('Banned');
    expect(items[0].days).toBe(3);
  });
});

describe('buildDailySeries', () => {
  test('sorts by date and computes daily visitor-based cvr', () => {
    const series = buildDailySeries([
      makeRow({ itemId: '1', date: '2026-09-02', ordersConfirmed: 3, visitors: 300 }),
      makeRow({ itemId: '1', date: '2026-09-01', ordersConfirmed: 1, visitors: 0, clicks: 5 }),
    ]);
    expect(series.map((point) => point.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(series[0].cvrConfirmed).toBeNull();
    expect(series[1].cvrConfirmed).toBeCloseTo(1, 6);
    expect(series[0].clicks).toBe(5);
  });
});

describe('mergeVariations', () => {
  test('merges same variation across days and sorts by units desc', () => {
    const rows = [
      makeRow({
        itemId: '1',
        date: '2026-09-01',
        variations: [{ variationSku: 'V1', variationName: 'Black', unitsOrdered: 5 }, { variationSku: 'V2', variationName: 'White', unitsOrdered: 50 }],
      }),
      makeRow({
        itemId: '1',
        date: '2026-09-02',
        variations: [{ variationSku: 'V1', variationName: 'Black', unitsOrdered: 10, cartUnits: 3 }],
      }),
    ];
    const merged = mergeVariations(rows);
    expect(merged).toHaveLength(2);
    // 按合并后的已下件数降序：White(50) 在前，Black(5+10=15) 在后
    expect(merged[0].variationName).toBe('White');
    expect(merged[1].variationName).toBe('Black');
    expect(merged[1].unitsOrdered).toBe(15);
    expect(merged[1].cartUnits).toBe(3);
  });
});

describe('buildItemDetail', () => {
  test('returns item, series, variations and latest extra', () => {
    const detail = buildItemDetail([
      makeRow({ itemId: '1', date: '2026-09-01', extra: { ctr: 5 }, variations: [{ variationName: 'Black', unitsOrdered: 1 }] }),
      makeRow({ itemId: '1', date: '2026-09-02', extra: { ctr: 6, modelId: 'M1' }, visitors: 10 }),
    ]);
    expect(detail.item.days).toBe(2);
    expect(detail.series).toHaveLength(2);
    expect(detail.variations[0].variationName).toBe('Black');
    expect(detail.extra).toEqual({ ctr: 6, modelId: 'M1' });
  });
});

describe('mapParsedSheetItemsToDailyRows', () => {
  test('maps parsed ParentProduct to rows: summable columns + extra + variations', () => {
    const rows = mapParsedSheetItemsToDailyRows([
      {
        sheetKey: 'hot',
        items: [
          {
            itemId: '10001',
            itemName: 'Keyboard',
            status: 'Normal',
            visitors: 100,
            clicks: 10,
            ctr: 7.05,
            repeatOrderRate: 3.2,
            modelId: 'M1',
            variations: [{ variationName: 'Black' }],
          },
          { itemId: '', itemName: 'skipped' },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.itemId).toBe('10001');
    expect(row.sheetKey).toBe('hot');
    expect(row.visitors).toBe(100);
    expect(row.clicks).toBe(10);
    for (const field of SUMMABLE_FIELDS) {
      expect([null, 100, 10]).toContain((row as unknown as Record<string, unknown>)[field] ?? null);
    }
    expect(row.extra).toMatchObject({ ctr: 7.05, repeatOrderRate: 3.2, modelId: 'M1' });
    expect(row.variations).toEqual([{ variationName: 'Black' }]);
  });

  test('deduplicates items appearing in multiple sheets by sheet priority (hot wins)', () => {
    const rows = mapParsedSheetItemsToDailyRows([
      {
        sheetKey: 'competitive',
        items: [{ itemId: '10001', itemName: 'Keyboard', visitors: 50 }],
      },
      {
        sheetKey: 'hot',
        items: [
          { itemId: '10001', itemName: 'Keyboard', visitors: 100 },
          { itemId: '20002', itemName: 'Mouse', visitors: 30 },
        ],
      },
      {
        sheetKey: 'new',
        items: [{ itemId: '20002', itemName: 'Mouse dup', visitors: 1 }],
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sheetKey)).toEqual(['hot', 'hot']);
    expect(rows[0].visitors).toBe(100);
    expect(rows[1].itemId).toBe('20002');
  });
});
