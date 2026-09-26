import { buildEstablishedTrends } from '../productAnalysisEstablishedTrends';
import type { DailyItemRow } from '../productAnalysisAggregation';

const range = { from: '2026-09-01', to: '2026-09-06' };
function row(itemId: string, date: string, ordersOrdered: number | null, sheetKey = 'hot', sheetKeys: string[] = [sheetKey]): DailyItemRow {
  return { itemId, itemName: itemId, date, ordersOrdered, sheetKey, extra: { sheetKeys } } as DailyItemRow;
}

describe('established product trends', () => {
  it('compares observed daily averages, excludes new products and preserves missing values', () => {
    const result = buildEstablishedTrends([
      row('old', '2026-09-01', 10),
      row('old', '2026-09-02', null),
      row('old', '2026-09-04', 2),
      row('old', '2026-09-05', 4),
      row('new', '2026-09-01', 30, 'hot', ['hot', 'new']),
      row('new', '2026-09-04', 40),
      row('one-sided', '2026-09-01', 10),
    ], range);
    expect(result.windowDays).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemId: 'old', previousDailyOrders: 10, recentDailyOrders: 3,
      changePercent: -70, previousObservedDays: 1, recentObservedDays: 2,
    });
    expect(result.items[0].dailyOrders[1]).toEqual({ date: '2026-09-02', orders: null });
  });

  it('keeps real zero distinct from missing and does not invent infinite growth', () => {
    const result = buildEstablishedTrends([
      row('old', '2026-09-01', 0), row('old', '2026-09-05', 3),
    ], range);
    expect(result.items[0]).toMatchObject({ previousDailyOrders: 0, recentDailyOrders: 3, changePercent: null });
    expect(buildEstablishedTrends([row('old', '2026-09-01', 2)], { from: '2026-09-01', to: '2026-09-01' })).toEqual({ windowDays: 0, items: [] });
  });

  it('monitors established products outside the hot sheet too', () => {
    const result = buildEstablishedTrends([
      row('priced', '2026-09-01', 3, 'competitive'),
      row('priced', '2026-09-06', 2, 'competitive'),
    ], range);
    expect(result.items.map((item) => item.itemId)).toEqual(['priced']);
  });
});
