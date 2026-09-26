import { buildGrowthWindows } from './productAnalysisPotential';
import type { DailyItemRow } from './productAnalysisAggregation';

export interface EstablishedTrendItem {
  itemId: string;
  itemName: string;
  previousDailyOrders: number;
  recentDailyOrders: number;
  changePercent: number | null;
  previousObservedDays: number;
  recentObservedDays: number;
  dailyOrders: { date: string; orders: number | null }[];
}

/** 区间内未出现在新品表、且前后两段均有订单观测的商品。按两段日均订单比较。 */
export function buildEstablishedTrends(
  rows: DailyItemRow[],
  range: { from: string; to: string },
  limit = 100
): { windowDays: number; items: EstablishedTrendItem[] } {
  const windows = buildGrowthWindows(range);
  if (windows.windowDays === 0) return { windowDays: 0, items: [] };

  const byItem = new Map<string, DailyItemRow[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push(row);
    byItem.set(row.itemId, list);
  }

  const items: (EstablishedTrendItem & { totalOrders: number })[] = [];
  for (const itemRows of byItem.values()) {
    const sheetKeys = itemRows.flatMap((row) => {
      const extraKeys = (row.extra as { sheetKeys?: unknown } | null)?.sheetKeys;
      return [row.sheetKey, ...(Array.isArray(extraKeys) ? extraKeys : [])];
    });
    if (sheetKeys.includes('new')) continue;
    const observed = [...itemRows]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({ date: row.date, orders: typeof row.ordersOrdered === 'number' ? row.ordersOrdered : null }));
    const previous = observed.filter((row) => windows.previousDays.has(row.date) && row.orders !== null);
    const recent = observed.filter((row) => windows.recentDays.has(row.date) && row.orders !== null);
    if (previous.length === 0 || recent.length === 0) continue;
    const previousTotal = previous.reduce((sum, row) => sum + (row.orders ?? 0), 0);
    const recentTotal = recent.reduce((sum, row) => sum + (row.orders ?? 0), 0);
    const previousDailyOrders = previousTotal / previous.length;
    const recentDailyOrders = recentTotal / recent.length;
    const latest = [...itemRows].sort((a, b) => b.date.localeCompare(a.date))[0];
    items.push({
      itemId: latest.itemId,
      itemName: latest.itemName,
      previousDailyOrders,
      recentDailyOrders,
      changePercent: previousDailyOrders === 0 ? null : ((recentDailyOrders - previousDailyOrders) / previousDailyOrders) * 100,
      previousObservedDays: previous.length,
      recentObservedDays: recent.length,
      dailyOrders: observed,
      totalOrders: previousTotal + recentTotal,
    });
  }
  items.sort((a, b) => b.totalOrders - a.totalOrders || a.itemId.localeCompare(b.itemId));
  return {
    windowDays: windows.windowDays,
    items: items.slice(0, limit).map(({ totalOrders: _totalOrders, ...item }) => item),
  };
}
