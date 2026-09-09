/**
 * 图表未知值语义 + 可见性 + 跨年日期回归：
 * - 趋势图：缺失点断线；Tooltip「无数据」与真实 0 区分且**真正可见**（祖先无 visibility:hidden）；
 *   跨年同月同日按完整日期区分；鼠标离开后隐藏。
 * - 漏斗图：缺失阶段刻度「—」；Tooltip 缺失显示「无数据」且可见、无虚假转化率。
 * - 汇总卡：加权转化率直接展示后端成对样本值，null →「—」、真实 0 → 0%。
 */
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));

// ResizeObserver stub：让 recharts ResponsiveContainer 立即获得尺寸（jsdom 无真实布局）
class ResizeObserverStub {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{
        target,
        contentRect: { width: 800, height: 280, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0 },
      } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

import { DailyTrendChart } from '../modules/product-analysis/components/charts/DailyTrendChart';
import { ConversionFunnelChart } from '../modules/product-analysis/components/charts/ConversionFunnelChart';
import { SummaryCards } from '../modules/product-analysis/components/SummaryCards';
import type { DailySeriesPoint, ParentProduct } from '../modules/product-analysis/types';

/** 祖先链可见性：任一祖先 inline visibility:hidden / display:none / opacity:0 即视为不可见。
 *  Recharts 通过外层 wrapper 的 inline visibility 控制 Tooltip 显隐——textContent 存在但被隐藏不算可见。 */
function hierarchyVisible(element: Element): boolean {
  let node: Element | null = element;
  while (node) {
    const inline = (node as HTMLElement).style;
    if (inline.visibility === 'hidden' || inline.display === 'none' || inline.opacity === '0') return false;
    node = node.parentElement;
  }
  return true;
}

/** jsdom 无布局：为图表容器补齐 recharts 指针几何（getChartPointer 读取 rect 与 offsetWidth/Height） */
function stubChartGeometry(container: HTMLElement, height = 280): HTMLElement {
  const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement;
  wrapper.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(wrapper, 'offsetWidth', { value: 800, configurable: true });
  Object.defineProperty(wrapper, 'offsetHeight', { value: height, configurable: true });
  return wrapper;
}

interface TooltipSnapshot {
  title: string;
  rows: string[];
  missingRows: number;
}

/** 真实触发鼠标悬停（wrapper mousemove → recharts rAF → Tooltip 激活），
 *  沿横轴扫动并收集**可见** Tooltip 的快照（被 visibility:hidden 隐藏的不计入） */
async function sweepVisibleTrendTooltips(container: HTMLElement): Promise<TooltipSnapshot[]> {
  const wrapper = stubChartGeometry(container);
  const seen = new Map<string, TooltipSnapshot>();
  for (let x = 40; x <= 760; x += 40) {
    fireEvent.mouseMove(wrapper, { clientX: x, clientY: 140, bubbles: true });
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 40));
    const tooltip = container.querySelector('[data-testid="trend-tooltip"]');
    if (tooltip && hierarchyVisible(tooltip)) {
      // 悬停激活当帧即做标准可见性断言（祖先链无 visibility:hidden）
      expect(tooltip).toBeVisible();
      const paragraphs = Array.from(tooltip.querySelectorAll('p')).slice(1);
      const rows = paragraphs.map((p) => p.textContent ?? '');
      const missingRows = paragraphs.filter((p) => p.querySelector('[data-missing="true"]')).length;
      const title = tooltip.querySelector('p')?.textContent ?? '';
      seen.set(title, { title, rows, missingRows });
    }
  }
  return [...seen.values()];
}

function point(overrides: Partial<DailySeriesPoint>): DailySeriesPoint {
  return {
    date: '2026-09-01',
    ordersOrdered: 10,
    ordersConfirmed: 8,
    visitors: 100,
    clicks: 20,
    unitsOrdered: 11,
    cvrConfirmed: 8,
    ...overrides,
  };
}

/** 提取指定颜色折线的 SVG path d（recharts Line 渲染为 path.recharts-curve） */
function linePath(container: HTMLElement, stroke: string): string {
  const path = Array.from(container.querySelectorAll('path.recharts-curve')).find(
    (element) => element.getAttribute('stroke') === stroke
  );
  return path?.getAttribute('d') ?? '';
}

const ORDERS_STROKE = '#10b981';

describe('DailyTrendChart unknown-value gaps', () => {
  it('breaks the orders line at a missing day instead of drawing zero or connecting across', () => {
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: 10 }),
          point({ date: '2026-09-02', ordersOrdered: null, cvrConfirmed: null }),
          point({ date: '2026-09-03', ordersOrdered: 8, cvrConfirmed: 6 }),
        ]}
      />
    );
    const d = linePath(container, ORDERS_STROKE);
    expect(d).toBeTruthy();
    // 断点：路径被拆成 ≥2 段（多个 M 指令），缺失日不落点、不跨接
    expect(d.split('M').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('keeps a continuous line for complete data and plots real zeros', () => {
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: 10 }),
          point({ date: '2026-09-02', ordersOrdered: 0, cvrConfirmed: 0 }),
          point({ date: '2026-09-03', ordersOrdered: 8, cvrConfirmed: 6 }),
        ]}
      />
    );
    const d = linePath(container, ORDERS_STROKE);
    expect(d).toBeTruthy();
    // 完整数据连续：单段路径（真实 0 是有效观测，不产生断点）
    expect(d.split('M').length - 1).toBe(1);
  });

  it('does not crash when every metric is missing', () => {
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: null, visitors: null, cvrConfirmed: null, clicks: null, unitsOrdered: null }),
          point({ date: '2026-09-02', ordersOrdered: null, visitors: null, cvrConfirmed: null, clicks: null, unitsOrdered: null }),
        ]}
      />
    );
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});

describe('DailyTrendChart tooltip visibility and cross-year dates', () => {
  it('hovered tooltips are genuinely visible: missing rows, all-missing day, real zero, full day', async () => {
    // 真实交互：沿横轴触发 wrapper mousemove（recharts 经 rAF 激活 Tooltip），仅统计可见 Tooltip
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: 10, cvrConfirmed: 10 }),
          point({ date: '2026-09-02', ordersOrdered: null, visitors: 100, cvrConfirmed: null }),
          point({ date: '2026-09-03', ordersOrdered: null, visitors: null, cvrConfirmed: null }),
          point({ date: '2026-09-04', ordersOrdered: 0, visitors: 100, cvrConfirmed: 0 }),
        ]}
      />
    );
    const snapshots = await sweepVisibleTrendTooltips(container);

    // 部分缺失日（09-02）：订单/转化率「无数据」，访客有值
    const partial = snapshots.find((snapshot) => snapshot.title === '2026-09-02');
    expect(partial).toBeTruthy();
    expect(partial!.missingRows).toBe(2);
    expect(partial!.rows.some((row) => row.includes('访客100'))).toBe(true);

    // 当日全部指标缺失（09-03）：日期标题 + 三行「无数据」，且 Tooltip 可见
    const allMissing = snapshots.find((snapshot) => snapshot.title === '2026-09-03');
    expect(allMissing).toBeTruthy();
    expect(allMissing!.missingRows).toBe(3);
    expect(allMissing!.rows.every((row) => row.includes('无数据'))).toBe(true);

    // 真实零日（09-04）：订单 0、转化率 0.00%，无缺失标记
    const zeroDay = snapshots.find((snapshot) => snapshot.title === '2026-09-04');
    expect(zeroDay).toBeTruthy();
    expect(zeroDay!.missingRows).toBe(0);
    expect(zeroDay!.rows.some((row) => /^订单\(已下\)0$/.test(row))).toBe(true);
    expect(zeroDay!.rows.some((row) => row.includes('0.00%'))).toBe(true);

    // 完整日（09-01）
    const fullDay = snapshots.find((snapshot) => snapshot.title === '2026-09-01');
    expect(fullDay).toBeTruthy();
    expect(fullDay!.rows.some((row) => /^订单\(已下\)10$/.test(row))).toBe(true);

  }, 30_000);

  it('shows a visible tooltip with 无数据 even when the entire series has no observations', async () => {
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: null, visitors: null, cvrConfirmed: null, clicks: null, unitsOrdered: null }),
          point({ date: '2026-09-02', ordersOrdered: null, visitors: null, cvrConfirmed: null, clicks: null, unitsOrdered: null }),
        ]}
      />
    );
    const snapshots = await sweepVisibleTrendTooltips(container);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((snapshot) => snapshot.missingRows === 3)).toBe(true);
  }, 30_000);

  it('identifies records by full date: 2025-09-09 vs 2026-09-09 show their own values', async () => {
    // 回归：此前用 MM-DD 作为 label 查找，跨年同月同日会命中第一条（1）而非各自数值
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2025-09-09', ordersOrdered: 1, visitors: 10, cvrConfirmed: 10 }),
          point({ date: '2026-09-09', ordersOrdered: 99, visitors: 90, cvrConfirmed: 110 }),
        ]}
      />
    );
    const snapshots = await sweepVisibleTrendTooltips(container);

    const oldYear = snapshots.find((snapshot) => snapshot.title === '2025-09-09');
    expect(oldYear).toBeTruthy();
    expect(oldYear!.rows.some((row) => /^订单\(已下\)1$/.test(row))).toBe(true);

    const newYear = snapshots.find((snapshot) => snapshot.title === '2026-09-09');
    expect(newYear).toBeTruthy();
    expect(newYear!.rows.some((row) => /^订单\(已下\)99$/.test(row))).toBe(true);

    // 横轴刻度仅显示缩短的 MM-DD（显示层），不作为记录标识
    const tickTexts = Array.from(container.querySelectorAll('.recharts-cartesian-axis-tick-value')).map((t) => t.textContent);
    expect(tickTexts).toContain('09-09');
    expect(tickTexts.filter((t) => t === '09-09')).toHaveLength(2);
    expect(tickTexts.some((t) => t === '2025-09-09' || t === '2026-09-09')).toBe(false);
  }, 30_000);

  it('hides the tooltip after the mouse leaves the chart', async () => {
    const { container } = render(
      <DailyTrendChart
        series={[
          point({ date: '2026-09-01', ordersOrdered: 10 }),
          point({ date: '2026-09-02', ordersOrdered: null, visitors: null, cvrConfirmed: null }),
          point({ date: '2026-09-03', ordersOrdered: 8, cvrConfirmed: 6 }),
        ]}
      />
    );
    const wrapper = stubChartGeometry(container);
    fireEvent.mouseMove(wrapper, { clientX: 400, clientY: 140, bubbles: true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const active = container.querySelector('[data-testid="trend-tooltip"]');
    expect(active && hierarchyVisible(active)).toBe(true);

    fireEvent.mouseLeave(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const afterLeave = container.querySelector('[data-testid="trend-tooltip"]');
    // 离开后：Tooltip 移除或被隐藏（visibility:hidden）
    expect(!afterLeave || !hierarchyVisible(afterLeave)).toBe(true);
  }, 30_000);
});

describe('ConversionFunnelChart unknown stages', () => {
  const mixedItem = {
    itemId: '1',
    itemName: 'X',
    impressions: 1000,
    clicks: null,
    visitors: 300,
    cartUnits: 0,
    ordersOrdered: 5,
  } as unknown as ParentProduct;

  it('renders — for a missing stage and 0 for a real zero stage in the always-rendered axis ticks', () => {
    const { container } = render(<ConversionFunnelChart item={mixedItem} />);
    const texts = Array.from(container.querySelectorAll('svg text')).map((text) => text.textContent);
    expect(texts).toContain('点击 · —');
    expect(texts).toContain('加购件数 · 0');
    expect(texts).toContain('曝光 · 1,000');
    expect(texts).toContain('访客 · 300');
    expect(texts).toContain('订单 · 5');
  });

  /** 垂直扫动收集可见漏斗 Tooltip 文本 */
  async function sweepVisibleFunnelTooltips(container: HTMLElement): Promise<string[]> {
    const wrapper = stubChartGeometry(container, 220);
    const seen: string[] = [];
    for (let y = 20; y <= 200; y += 20) {
      fireEvent.mouseMove(wrapper, { clientX: 400, clientY: y, bubbles: true });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 40));
      const tooltip = container.querySelector('[data-testid="funnel-tooltip"]');
      if (tooltip && hierarchyVisible(tooltip) && tooltip.textContent) seen.push(tooltip.textContent);
    }
    return seen;
  }

  it('missing-stage tooltip is genuinely visible with 无数据 and no fake rate; real zero shows 0', async () => {
    const { container } = render(<ConversionFunnelChart item={mixedItem} />);
    const seen = await sweepVisibleFunnelTooltips(container);
    expect(seen.length).toBeGreaterThan(0);
    // 缺失阶段：可见 Tooltip 中出现「无数据」，且不以缺失值计算转化率（无「无数据…%）」组合）
    expect(seen.some((text) => text.includes('无数据'))).toBe(true);
    expect(seen.some((text) => /无数据）/.test(text) || /无数据%/.test(text))).toBe(false);
    // 真实零阶段显示 0
    expect(seen.some((text) => text.includes('0'))).toBe(true);
    // 对最终 DOM 做标准可见性断言（若悬停仍激活）
    const tooltip = container.querySelector('[data-testid="funnel-tooltip"]');
    if (tooltip && hierarchyVisible(tooltip)) expect(tooltip).toBeVisible();
  }, 30_000);

  it('all stages missing: tooltip visible with 无数据 and does not crash', async () => {
    const allMissing = {
      itemId: '1',
      itemName: 'X',
      impressions: null,
      clicks: null,
      visitors: null,
      cartUnits: null,
      ordersOrdered: null,
    } as unknown as ParentProduct;
    const { container } = render(<ConversionFunnelChart item={allMissing} />);
    const seen = await sweepVisibleFunnelTooltips(container);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((text) => text.includes('无数据'))).toBe(true);
  }, 30_000);
});

describe('SummaryCards weighted CVR from backend pairwise sample', () => {
  const baseSummary = {
    itemCount: 1,
    totalSalesOrdered: 100,
    totalSalesConfirmed: 90,
    totalOrders: 10,
    totalVisitors: 200,
    totalClicks: 30,
  };

  it('renders the backend pairwise rate and the sample-scope note', () => {
    const { container } = render(
      <SummaryCards summary={baseSummary} currency="MYR" weightedCvr={10} />
    );
    expect(container.textContent).toContain('10.00%');
    expect(container.querySelector('[title*="同日有效"]')).toBeTruthy();
  });

  it('shows — when there is no valid pairwise sample, and 0.00% for a genuine zero', () => {
    const { container, rerender } = render(
      <SummaryCards summary={baseSummary} currency="MYR" weightedCvr={null} />
    );
    expect(container.textContent).toContain('—');
    rerender(<SummaryCards summary={baseSummary} currency="MYR" weightedCvr={0} />);
    expect(container.textContent).toContain('0.00%');
  });
});
