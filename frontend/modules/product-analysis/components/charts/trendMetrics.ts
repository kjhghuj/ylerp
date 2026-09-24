import type { DailySeriesPoint, DailyTrendMetricKey } from '../../types';

export type TrendGroupKey = 'sales' | 'traffic' | 'orders' | 'cart' | 'conversion' | 'repurchase';
export interface TrendGroup {
  key: TrendGroupKey;
  metrics: DailyTrendMetricKey[];
  defaults: DailyTrendMetricKey[];
}
export const TREND_GROUPS: TrendGroup[] = [
  { key: 'sales', metrics: ['salesOrdered', 'salesConfirmed', 'aovOrdered', 'aovConfirmed'], defaults: ['salesOrdered', 'salesConfirmed'] },
  { key: 'traffic', metrics: ['impressions', 'clicks', 'uniqueImpressions', 'uniqueClicks', 'visitors', 'pageViews', 'bounceVisitors', 'searchClicks', 'likes'], defaults: ['impressions', 'clicks', 'visitors'] },
  { key: 'orders', metrics: ['ordersOrdered', 'ordersConfirmed', 'unitsOrdered', 'unitsConfirmed', 'buyersOrdered', 'buyersConfirmed'], defaults: ['ordersOrdered', 'ordersConfirmed', 'unitsOrdered'] },
  { key: 'cart', metrics: ['cartVisitors', 'cartUnits'], defaults: ['cartVisitors', 'cartUnits'] },
  { key: 'conversion', metrics: ['ctr', 'cvrOrdered', 'cvrConfirmed', 'cartRate', 'bounceRate'], defaults: ['ctr', 'cvrOrdered', 'cvrConfirmed', 'cartRate', 'bounceRate'] },
  { key: 'repurchase', metrics: ['repeatOrderRate', 'repurchaseRateConfirmed', 'avgReorderDays', 'avgRepurchaseDays'], defaults: ['repeatOrderRate', 'repurchaseRateConfirmed'] },
];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#64748b'];
/** 主题未注入（独立渲染/测试）时的默认色阶 = 默认紫主题的派生色阶 */
export const metricColor = (group: TrendGroup, key: string, series?: string[]) =>
  (series ?? COLORS)[group.metrics.indexOf(key as DailyTrendMetricKey) % (series ?? COLORS).length];
export const isRightAxis = (key: string) => key.startsWith('aov') || key === 'avgReorderDays' || key === 'avgRepurchaseDays';
export const isMoneyMetric = (key: string) => key.startsWith('sales') || key.startsWith('aov');
export const isDayMetric = (key: string) => key === 'avgReorderDays' || key === 'avgRepurchaseDays';
export const isRateMetric = (key: string) => ['ctr', 'cvrOrdered', 'cvrConfirmed', 'cartRate', 'bounceRate', 'repeatOrderRate', 'repurchaseRateConfirmed'].includes(key);

/** Missing calendar dates break paths, but stay null rather than fabricating observations. */
export function fillTrendDateGaps(series: DailySeriesPoint[]): DailySeriesPoint[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const byDate = new Map(sorted.map((point) => [point.date, point]));
  const start = Date.parse(`${sorted[0].date}T00:00:00Z`);
  const end = Date.parse(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 366 * 86400000) return sorted;
  const result: DailySeriesPoint[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    result.push(byDate.get(date) ?? { date, visitors: null, clicks: null, ordersOrdered: null, ordersConfirmed: null, unitsOrdered: null, cvrConfirmed: null });
  }
  return result;
}
