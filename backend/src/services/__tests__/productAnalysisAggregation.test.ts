import {
  aggregateItems,
  buildDailySeries,
  buildItemDetail,
  mapParsedSheetItemsToDailyRows,
  mergeVariations,
  pairwiseRatio,
  summarizeSheetEffective,
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
    // 客单价成对口径：第二天 salesOrdered 缺失 → 仅第一天的 (200, 2) 成对样本 = 100（不再是 200/6 的总量相除）
    expect(item.aovOrdered).toBeCloseTo(100, 6);
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

describe('pairwise effective-sample rates (same-name metric parity)', () => {
  test('reproduction: orders 10/100 then null/100 yields cvrOrdered 10%, not 5%', () => {
    // 回归：聚合曾把分子分母分别求和后相除（(10+0)/(100+100)=5%），与新品榜成对口径（10%）不一致
    const rows = [
      makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, visitors: 100 }),
      makeRow({ itemId: '1', date: '2026-09-02', ordersOrdered: null, visitors: 100 }),
    ];
    const [item] = aggregateItems(rows);
    expect(item.cvrOrdered).toBeCloseTo(10, 6);
    expect(item.cvrVisitorsOrdered).toBeCloseTo(10, 6);
    // 总量仍按各自有效观测求和：订单 10（仅第一天），访客 200 —— 不得用总量互除重算比率
    expect(item.ordersOrdered).toBe(10);
    expect(item.visitors).toBe(200);

    // 详情走同一 buildAggregate 口径
    const detail = buildItemDetail(rows);
    expect(detail.item.cvrOrdered).toBeCloseTo(10, 6);
  });

  test('ordered and confirmed CVRs use their own pairwise samples without mixing', () => {
    const rows = [
      makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, ordersConfirmed: 4, visitors: 100 }),
      makeRow({ itemId: '1', date: '2026-09-02', ordersOrdered: null, ordersConfirmed: 6, visitors: 100 }),
    ];
    const [item] = aggregateItems(rows);
    // 下单口径只算第一天的成对样本；确认口径两天都成对
    expect(item.cvrOrdered).toBeCloseTo(10, 6);
    expect(item.cvrConfirmed).toBeCloseTo(5, 6);
  });

  test('pairwiseRatio handles missing numerator/denominator, legal zeros and zero denominators', () => {
    const rows = (overrides: Record<string, unknown>[]) =>
      overrides.map((override, index) => ({ date: `2026-09-0${index + 1}`, ...override }));
    // 分子缺失（全部行 ordersOrdered 缺失）→ null，不是 0%
    expect(pairwiseRatio(rows([{ ordersOrdered: null, visitors: 100 }]), 'ordersOrdered', 'visitors')).toBeNull();
    // 分母缺失 → null
    expect(pairwiseRatio(rows([{ ordersOrdered: 10, visitors: null }]), 'ordersOrdered', 'visitors')).toBeNull();
    // 两者缺失 → null
    expect(pairwiseRatio(rows([{ ordersOrdered: null, visitors: null }]), 'ordersOrdered', 'visitors')).toBeNull();
    // 合法零分子 → 0%（不是 null）
    expect(pairwiseRatio(rows([{ ordersOrdered: 0, visitors: 100 }]), 'ordersOrdered', 'visitors')).toBe(0);
    // 分母合计为 0 → null
    expect(pairwiseRatio(rows([{ ordersOrdered: 5, visitors: 0 }]), 'ordersOrdered', 'visitors')).toBeNull();
    // 缺失行不计入：10/100 + 缺失行 → 10%
    expect(
      pairwiseRatio(rows([{ ordersOrdered: 10, visitors: 100 }, { ordersOrdered: null, visitors: 400 }]), 'ordersOrdered', 'visitors')
    ).toBeCloseTo(0.1, 6);
  });

  test('complete data keeps the original results', () => {
    const rows = [
      makeRow({ itemId: '1', date: '2026-09-01', visitors: 100, clicks: 20, impressions: 400, ordersOrdered: 2, salesOrdered: 200, cartVisitors: 3, bounceVisitors: 10 }),
      makeRow({ itemId: '1', date: '2026-09-02', visitors: 150, clicks: 30, impressions: 600, ordersOrdered: 4, salesOrdered: 400, cartVisitors: 6, bounceVisitors: 15 }),
    ];
    const [item] = aggregateItems(rows);
    expect(item.ctr).toBeCloseTo(5, 6);
    expect(item.cvrOrdered).toBeCloseTo(2.4, 6);
    expect(item.cartRate).toBeCloseTo(3.6, 6);
    expect(item.bounceRate).toBeCloseTo(10, 6); // (10+15)/(100+150)
    expect(item.aovOrdered).toBeCloseTo(600 / 6, 6);
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

  test('preserves missing metrics as null instead of converting to zero', () => {
    // 回归：buildDailySeries 曾把缺失订单/访客转成 0，趋势图把未知画成零
    const series = buildDailySeries([
      makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, visitors: 100, ordersConfirmed: 2 }),
      makeRow({ itemId: '1', date: '2026-09-02', ordersOrdered: null, visitors: 100, ordersConfirmed: null }),
      makeRow({ itemId: '1', date: '2026-09-03', ordersOrdered: 0, visitors: 100, ordersConfirmed: 0 }),
    ]);
    expect(series[0].ordersOrdered).toBe(10);
    expect(series[1].ordersOrdered).toBeNull();
    expect(series[2].ordersOrdered).toBe(0); // 真实 0 保留
    // 订单或访客缺失 → 当日转化率 null（不是 0%）；真实 0 订单 + 有效访客 → 0%
    expect(series[0].cvrConfirmed).toBeCloseTo(2, 6);
    expect(series[1].cvrConfirmed).toBeNull();
    expect(series[2].cvrConfirmed).toBe(0);
    // 访客缺失保留 null
    expect(buildDailySeries([makeRow({ itemId: '1', date: '2026-09-01', visitors: null })])[0].visitors).toBeNull();
  });
});

describe('summarizeSheetEffective (summary-card pairwise scope)', () => {
  test('reproduction: single item 10/100 then null/100 yields 10%, not 5%', () => {
    // 回归：汇总卡曾用全部订单总量÷全部访客总量（10/200 = 5%），与商品/新品榜（10%）不一致
    const summary = summarizeSheetEffective([
      makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, visitors: 100 }),
      makeRow({ itemId: '1', date: '2026-09-02', ordersOrdered: null, visitors: 100 }),
    ]);
    expect(summary.weightedCvrNumerator).toBe(10);
    expect(summary.weightedCvrDenominator).toBe(100);
    expect(summary.weightedCvr).toBeCloseTo(10, 6);
  });

  test('cross-item weighting is not a simple average of item percentages', () => {
    // 商品A：2/100=2%；商品B：30/300=10% —— 加权应为 (2+30)/(100+300)=8%，不是 (2%+10%)/2=6%
    const summary = summarizeSheetEffective([
      makeRow({ itemId: 'A', date: '2026-09-01', ordersOrdered: 2, visitors: 100 }),
      makeRow({ itemId: 'B', date: '2026-09-01', ordersOrdered: 30, visitors: 300 }),
    ]);
    expect(summary.weightedCvr).toBeCloseTo(8, 6);
  });

  test('handles missing numerator/denominator, all-missing, real zeros and zero denominators', () => {
    // 分子缺失（订单全 null）→ 无成对样本 → null
    expect(summarizeSheetEffective([makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: null, visitors: 100 })]).weightedCvr).toBeNull();
    // 分母缺失 → null
    expect(summarizeSheetEffective([makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, visitors: null })]).weightedCvr).toBeNull();
    // 全部缺失 → null
    expect(summarizeSheetEffective([makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: null, visitors: null })]).weightedCvr).toBeNull();
    // 真实零订单 → 0%（不是 null）
    const zero = summarizeSheetEffective([makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 0, visitors: 100 })]);
    expect(zero.weightedCvr).toBe(0);
    expect(zero.weightedCvrNumerator).toBe(0);
    // 有效分母合计为 0 → null
    expect(summarizeSheetEffective([makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 5, visitors: 0 })]).weightedCvr).toBeNull();
    // 混合行：只计成对样本（10/100 + 缺失行 → 10%）
    const mixed = summarizeSheetEffective([
      makeRow({ itemId: '1', date: '2026-09-01', ordersOrdered: 10, visitors: 100 }),
      makeRow({ itemId: '1', date: '2026-09-02', ordersOrdered: null, visitors: 400 }),
    ]);
    expect(mixed.weightedCvr).toBeCloseTo(10, 6);
    expect(mixed.weightedCvrDenominator).toBe(100);
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
    // 归属按优先级取一行，但 extra.sheetKeys 保留商品出现过的全部工作表
    expect(rows[0].extra).toMatchObject({ sheetKeys: expect.arrayContaining(['hot', 'competitive']) });
    expect(rows[1].extra).toMatchObject({ sheetKeys: expect.arrayContaining(['hot', 'new']) });
  });

  test('records full sheet membership in extra even for single-sheet items', () => {
    const rows = mapParsedSheetItemsToDailyRows([
      { sheetKey: 'new', items: [{ itemId: '30003', itemName: 'New Only', visitors: 5 }] },
    ]);
    expect(rows[0].sheetKey).toBe('new');
    expect(rows[0].extra).toMatchObject({ sheetKeys: ['new'] });
  });

  test('tolerates null / malformed sheet entries without crashing (was a 500 in sort)', () => {
    // 回归：sheets 含 null 时排序回调读取 sheetKey 抛 TypeError，路由最终 500
    const rows = mapParsedSheetItemsToDailyRows([
      null,
      { sheetKey: 'hot', items: [{ itemId: '10001', itemName: 'Keyboard', visitors: 100 }] },
      { sheetKey: 'new', items: null },
      { items: [{ itemId: '9', itemName: 'No SheetKey' }] },
    ] as unknown as Parameters<typeof mapParsedSheetItemsToDailyRows>[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0].itemId).toBe('10001');
  });
});
