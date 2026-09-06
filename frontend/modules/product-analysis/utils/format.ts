/** 商品分析展示层数据加工：漏斗、汇总、排序、格式化（纯函数，无副作用） */
import type { FunnelStage, ParentProduct, SheetGroup } from '../types';

/** 转化漏斗五级：曝光 → 点击 → 访客 → 加购件数 → 订单，附级间转化率（%） */
export function buildFunnelStages(item: ParentProduct): FunnelStage[] {
  const rawStages: { key: FunnelStage['key']; value: number | null }[] = [
    { key: 'impressions', value: item.impressions },
    { key: 'clicks', value: item.clicks },
    { key: 'visitors', value: item.visitors },
    { key: 'cartUnits', value: item.cartUnits },
    { key: 'orders', value: item.ordersOrdered },
  ];
  let prevValue: number | null = null;
  return rawStages.map(({ key, value }) => {
    const safeValue = value ?? 0;
    const rateFromPrev = prevValue !== null && prevValue > 0 ? (safeValue / prevValue) * 100 : null;
    prevValue = safeValue;
    return { key, value: safeValue, rateFromPrev };
  });
}

export interface SheetSummary {
  itemCount: number;
  totalSalesOrdered: number;
  totalSalesConfirmed: number;
  totalOrders: number;
  totalVisitors: number;
  totalClicks: number;
  /** 加权转化率（%）= Σ订单 / Σ访客；访客为 0 时为 null */
  weightedCvr: number | null;
}

function sumMetric(items: ParentProduct[], key: keyof ParentProduct): number {
  return items.reduce((total, item) => {
    const value = item[key];
    return typeof value === 'number' && Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function summarizeSheet(group: SheetGroup): SheetSummary {
  const totalVisitors = sumMetric(group.items, 'visitors');
  const totalOrders = sumMetric(group.items, 'ordersOrdered');
  return {
    itemCount: group.items.length,
    totalSalesOrdered: sumMetric(group.items, 'salesOrdered'),
    totalSalesConfirmed: sumMetric(group.items, 'salesConfirmed'),
    totalOrders,
    totalVisitors,
    totalClicks: sumMetric(group.items, 'clicks'),
    weightedCvr: totalVisitors > 0 ? (totalOrders / totalVisitors) * 100 : null,
  };
}

/** 指标降序比较器：null 缺失排最后，同值按 itemId 稳定排序 */
export function compareByMetric(
  key: keyof ParentProduct
): (a: ParentProduct, b: ParentProduct) => number {
  return (a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    const aNum = typeof aValue === 'number' ? aValue : null;
    const bNum = typeof bValue === 'number' ? bValue : null;
    if (aNum === null && bNum === null) return a.itemId.localeCompare(b.itemId);
    if (aNum === null) return 1;
    if (bNum === null) return -1;
    if (bNum !== aNum) return bNum - aNum;
    return a.itemId.localeCompare(b.itemId);
  };
}

/** 搜索匹配：itemId / itemName / 变体名 包含查询串（大小写不敏感） */
export function matchesSearch(item: ParentProduct, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  if (item.itemId.toLowerCase().includes(query)) return true;
  if (item.itemName.toLowerCase().includes(query)) return true;
  return item.variations.some((variation) =>
    (variation.variationName ?? '').toLowerCase().includes(query)
  );
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${currency} ${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN');
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}
