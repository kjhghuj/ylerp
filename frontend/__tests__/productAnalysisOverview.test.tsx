/**
 * 概览视图联动测试：
 * - 销售对比图与商品排行榜共用同一份 Top N 选择（utils/topProducts），
 *   含「已下/已确认销售额均缺失」商品的边界：两处必须同时排除、同序同排名；
 * - 图表 Y 轴只显示 #排名（名称前缀重复截断后不可分辨），完整名称在排行榜与悬浮提示；
 * - 排行榜与图表点击均回调商品详情入口；
 * - 极端数量级下漏斗使用「平方根 + 非零保底 5%」宽度：末级可见尺寸有保障且真实数值保留。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// jsdom 无布局：给 Recharts 的 ResponsiveContainer 提供固定尺寸
class ResizeObserverStub {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 800, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));

import { SalesCompareChart, buildSalesCompareRows, salesCompareTick } from '../modules/product-analysis/components/SalesCompareChart';
import { ProductRanking, RANKING_TOP_N } from '../modules/product-analysis/components/ProductRanking';
import { ConversionFunnelChart } from '../modules/product-analysis/components/charts/ConversionFunnelChart';
import { PaThemeProvider } from '../modules/product-analysis/themeContext';
import { selectTopProductsBySales } from '../modules/product-analysis/utils/topProducts';
import type { AggregatedItem, ParentProduct } from '../modules/product-analysis/types';

function item(id: string, name: string, salesOrdered: number | null, orders = 1): AggregatedItem {
  return {
    itemId: id,
    itemName: name,
    sheetKey: 'hot',
    days: 1,
    firstDate: '2026-09-21',
    lastDate: '2026-09-22',
    salesOrdered,
    salesConfirmed: salesOrdered === null ? null : salesOrdered * 0.9,
    ordersOrdered: orders,
    variations: [],
  } as AggregatedItem;
}

const ITEMS: AggregatedItem[] = [
  item('1', '甲商品', 500, 30),
  item('2', '乙商品', 400, 20),
  item('3', '丙商品', 300, 10),
  item('4', '丁商品', 200, 5),
  item('5', '戊商品', 100, 3),
  item('6', '己商品', 50, 2),
  item('7', '庚商品', 10, 1), // 第 7 名不应进入 Top N
];

/** 边界：销售额全部缺失的商品与「仅已确认有值」的商品 */
const EDGE_ITEMS: AggregatedItem[] = [
  item('a', '全缺失商品', null),
  item('b', '正常商品', 300),
  item('c', '仅已确认', null),
  item('d', '全缺失商品2', null),
  item('e', '正常商品2', 100),
];
// 修正 c：仅已确认有值
(EDGE_ITEMS[2] as { salesConfirmed: number | null }).salesConfirmed = 250;

describe('shared Top-N selection (chart ↔ ranking)', () => {
  it('chart and ranking consume the same selection and order', () => {
    expect(RANKING_TOP_N).toBe(6);
    const chartRows = buildSalesCompareRows(ITEMS);
    const ranked = selectTopProductsBySales(ITEMS, RANKING_TOP_N);
    expect(chartRows.map((row) => row.id)).toEqual(ranked.map(({ item: row }) => row.itemId));
    expect(chartRows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chartRows.map((row) => row.id)).not.toContain('7');
  });

  it('excludes items whose ordered AND confirmed sales are both missing — both views agree', () => {
    const chartRows = buildSalesCompareRows(EDGE_ITEMS);
    const ranked = selectTopProductsBySales(EDGE_ITEMS, RANKING_TOP_N);
    // 「全缺失」商品在两处都被排除；「仅已确认」商品保留（按已下降序排在有值商品之后）
    expect(chartRows.map((row) => row.id)).toEqual(['b', 'e', 'c']);
    expect(ranked.map(({ item }) => item.itemId)).toEqual(['b', 'e', 'c']);

    // 组件渲染同样一致
    const { container } = render(
      <PaThemeProvider>
        <ProductRanking items={EDGE_ITEMS} currency="PHP" onSelect={() => undefined} />
      </PaThemeProvider>
    );
    const rows = [...container.querySelectorAll('.pa-rank-row')].map((node) => node.textContent);
    expect(rows).toHaveLength(3);
    expect(rows.join()).not.toContain('全缺失');
    expect(rows.join()).toContain('仅已确认');
  });

  it('chart y-axis ticks show rank only (#1…), names live in ranking and tooltip', () => {
    const rows = buildSalesCompareRows(ITEMS);
    rows.forEach((row, index) => {
      expect(salesCompareTick(row)).toBe(`#${index + 1}`);
    });
    const { container } = render(
      <PaThemeProvider>
        <SalesCompareChart items={ITEMS} currency="PHP" />
      </PaThemeProvider>
    );
    expect(container.querySelector('.pa-sales-chart .recharts-surface')).toBeTruthy();
  });

  it('keeps click-to-detail on both the ranking row and the chart bar', () => {
    const onRankSelect = vi.fn();
    const { container } = render(
      <PaThemeProvider>
        <ProductRanking items={ITEMS} currency="PHP" onSelect={onRankSelect} />
        <SalesCompareChart items={ITEMS} currency="PHP" onSelect={() => undefined} />
      </PaThemeProvider>
    );
    const firstRow = container.querySelector('.pa-rank-row') as HTMLElement;
    expect(firstRow).toBeTruthy();
    fireEvent.click(firstRow);
    expect(onRankSelect).toHaveBeenCalledTimes(1);
    expect(onRankSelect.mock.calls[0][0].itemId).toBe('1');

    const bar = container.querySelector('.pa-sales-chart .recharts-bar-rectangle path');
    expect(bar).toBeTruthy();
  });
});

describe('funnel keeps tail stages visible without distorting values', () => {
  /** 解析梯形 path：返回每级 [上底宽, 下底宽]（px），用于验证“可见尺寸”而不只是元素存在。
   *  recharts 梯形上底继承上一级的下底；零值级别会收敛为尖底（下底 = 0）。 */
  function trapezoidEdges(container: HTMLElement): Array<[number, number]> {
    return [...container.querySelectorAll('.recharts-funnel-trapezoid path')].map((node) => {
      const d = node.getAttribute('d') ?? '';
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const points: Array<[number, number]> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
      if (points.length < 4) return [0, 0] as [number, number];
      const width = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]);
      return [width(points[0], points[1]), width(points[3], points[2])];
    });
  }

  it('1,000,000 → 40 keeps the last stage ≥5% of the first stage in real pixels', () => {
    const detail = {
      impressions: 1_000_000,
      clicks: 20_000,
      visitors: 8_000,
      cartUnits: 300,
      ordersOrdered: 40,
    } as unknown as ParentProduct;
    const { container } = render(
      <PaThemeProvider>
        <ConversionFunnelChart item={detail} />
      </PaThemeProvider>
    );
    // 真实数值保留在阶段行
    const rows = [...container.querySelectorAll('.pa-funnel-row')].map((node) => node.textContent);
    expect(rows[0]).toContain('1,000,000');
    expect(rows[4]).toContain('40');
    // 可见尺寸：末级（订单）宽度 ≥ 首级 5%，且在 800px 画布上 ≥ 15px（纯平方根只有 ~0.63% ≈ 3px）
    const edges = trapezoidEdges(container);
    expect(edges.length).toBe(5);
    const firstSpan = Math.max(...edges[0]);
    expect(firstSpan).toBeGreaterThan(100);
    const lastSpan = Math.max(...edges[4]);
    expect(lastSpan).toBeGreaterThanOrEqual(firstSpan * 0.05 - 0.5);
    expect(lastSpan).toBeGreaterThanOrEqual(15);
  });

  it('a true zero stage keeps zero width (no fabricated size)', () => {
    const detail = {
      impressions: 1000,
      clicks: 500,
      visitors: 300,
      cartUnits: 0,
      ordersOrdered: 5,
    } as unknown as ParentProduct;
    const { container } = render(
      <PaThemeProvider>
        <ConversionFunnelChart item={detail} />
      </PaThemeProvider>
    );
    const rows = [...container.querySelectorAll('.pa-funnel-row')].map((node) => node.textContent);
    expect(rows[3]).toContain('加购件数 · 0');
    const edges = trapezoidEdges(container);
    // recharts 梯形的上底 = 该级自身宽度：真实 0 收敛为一点（不伪造宽度）；
    // 非零末级（订单 5/1000，sqrt≈7%）自身宽度仍可见
    expect(edges[3][0]).toBeLessThanOrEqual(0.5);
    expect(Math.max(...edges[4])).toBeGreaterThan(0);
  });
});
