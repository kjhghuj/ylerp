import type { AggregatedItem } from '../types';

export interface RankedProduct {
  /** 概览排名（1 起）：图表与排行榜共用 */
  rank: number;
  item: AggregatedItem;
  salesOrdered: number | null;
  salesConfirmed: number | null;
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function bySalesOrderedDesc(a: AggregatedItem, b: AggregatedItem): number {
  return (finite(b.salesOrdered) ?? -Infinity) - (finite(a.salesOrdered) ?? -Infinity);
}

/** 概览共用选择：过滤「已下单与已确认销售额均缺失」的商品，按销售额（已下）降序取 Top n。
 *  商品销售对比图与商品排行榜必须共用同一份结果与排序，两处排名逐条对应。 */
export function selectTopProductsBySales(items: AggregatedItem[], n: number): RankedProduct[] {
  return [...items]
    .filter((item) => finite(item.salesOrdered) !== null || finite(item.salesConfirmed) !== null)
    .sort(bySalesOrderedDesc)
    .slice(0, n)
    .map((item, index) => ({
      rank: index + 1,
      item,
      salesOrdered: finite(item.salesOrdered),
      salesConfirmed: finite(item.salesConfirmed),
    }));
}
