import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));
class ResizeObserverStub {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 800, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
import { DailyTrendChart } from '../modules/product-analysis/components/charts/DailyTrendChart';
import { ConversionFunnelChart } from '../modules/product-analysis/components/charts/ConversionFunnelChart';
import { OrderStatusCompareChart } from '../modules/product-analysis/components/charts/OrderStatusCompareChart';
import { VariationUnitsChart } from '../modules/product-analysis/components/charts/VariationUnitsChart';
import { ChartStateProvider } from '../modules/product-analysis/components/charts/ChartControls';
import { fillTrendDateGaps } from '../modules/product-analysis/components/charts/trendMetrics';
import { SummaryCards } from '../modules/product-analysis/components/SummaryCards';
import type { DailySeriesPoint, ParentProduct } from '../modules/product-analysis/types';

function point(overrides: Partial<DailySeriesPoint>): DailySeriesPoint {
  return { date: '2026-09-01', ordersOrdered: 10, ordersConfirmed: 8, visitors: 100, clicks: 20, unitsOrdered: 11, cvrConfirmed: 8, salesOrdered: 100, salesConfirmed: 80, ...overrides };
}
const series = [point({}), point({ date: '2026-09-02' }), point({ date: '2026-09-03' })];
function stubGeometry(container: HTMLElement) {
  const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement;
  wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 280, right: 800, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
  Object.defineProperty(wrapper, 'offsetWidth', { value: 800, configurable: true });
  Object.defineProperty(wrapper, 'offsetHeight', { value: 280, configurable: true });
  return wrapper;
}
function hierarchyVisible(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = (node as HTMLElement).style;
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  }
  return true;
}
async function sweep(container: HTMLElement) {
  const wrapper = stubGeometry(container);
  const seen = new Map<string, { text: string; missing: number }>();
  for (const x of [48, 49, 50, 55, ...Array.from({ length: 18 }, (_, i) => 80 + i * 40), 790, 795, 796]) {
    fireEvent.mouseMove(wrapper, { clientX: x, clientY: 100, bubbles: true });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); });
    const tooltip = container.querySelector('[data-testid="trend-tooltip"]');
    if (tooltip && hierarchyVisible(tooltip)) {
      expect(tooltip).toBeVisible();
      seen.set(tooltip.querySelector('p')!.textContent!, { text: tooltip.textContent!, missing: tooltip.querySelectorAll('[data-missing="true"]').length });
    }
  }
  return seen;
}

describe('daily trend groups and selection', () => {
  it('starts with two sales areas, toggles series, supports all-hidden and reset', () => {
    const { container } = render(<DailyTrendChart series={series} currency="MYR" />);
    expect(screen.getByRole('button', { name: '销售' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('.recharts-area')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '销售额(已下)' }));
    expect(container.querySelectorAll('.recharts-area')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '销售额(已确认)' }));
    expect(screen.getByRole('status')).toHaveTextContent('请点击图例');
    fireEvent.click(screen.getByRole('button', { name: '全部显示' }));
    expect(screen.getByRole('button', { name: '客单价(已下)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    expect(screen.getByRole('button', { name: '客单价(已下)' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('keeps group-specific selections and date range across groups and tab unmounts', () => {
    function Harness() {
      const [shown, setShown] = useState(true);
      return <ChartStateProvider><button onClick={() => setShown(!shown)}>switch tab</button>{shown && <DailyTrendChart series={series} />}</ChartStateProvider>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '流量' }));
    fireEvent.click(screen.getByRole('button', { name: '展示量' }));
    fireEvent.change(screen.getByLabelText('显示开始日期'), { target: { value: '2026-09-02' } });
    fireEvent.click(screen.getByRole('button', { name: '订单' }));
    expect(screen.getByLabelText('显示开始日期')).toHaveValue('2026-09-02');
    fireEvent.click(screen.getByRole('button', { name: '流量' }));
    expect(screen.getByRole('button', { name: '展示量' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByText('switch tab'));
    fireEvent.click(screen.getByText('switch tab'));
    expect(screen.getByRole('button', { name: '流量' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '展示量' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('显示开始日期')).toHaveValue('2026-09-02');
  });
  it('draws one day instead of returning the old insufficient-data message', () => {
    const { container } = render(<DailyTrendChart series={[point({})]} />);
    expect(container.querySelector('.recharts-area')).toBeTruthy();
    expect(container.querySelector('.recharts-brush')).toBeNull();
  });
  it('inserts null-only calendar gaps and preserves true zeros', () => {
    const data = fillTrendDateGaps([point({ date: '2026-09-01', visitors: 0 }), point({ date: '2026-09-03' })]);
    expect(data.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(data[0].visitors).toBe(0);
    expect(data[1].visitors).toBeNull();
    expect(data[1].salesOrdered).toBeUndefined();
  });
  it('breaks the traffic line on missing observations but includes real zeros', () => {
    const { container, rerender } = render(<DailyTrendChart series={[point({ visitors: 10 }), point({ date: '2026-09-02', visitors: null }), point({ date: '2026-09-03', visitors: 8 })]} />);
    fireEvent.click(screen.getByRole('button', { name: '流量' }));
    const visitorPath = () => container.querySelector('path.recharts-curve[stroke="#432B8E"]')?.getAttribute('d') ?? '';
    expect(visitorPath().split('M').length - 1).toBeGreaterThanOrEqual(2);
    rerender(<DailyTrendChart series={[point({ visitors: 10 }), point({ date: '2026-09-02', visitors: 0 }), point({ date: '2026-09-03', visitors: 8 })]} />);
    expect(visitorPath().split('M').length - 1).toBe(1);
  });
  it('explains an empty selected range and restores the plotted data when the range changes', async () => {
    const dated = [
      point({ salesOrdered: 10, salesConfirmed: 8 }),
      point({ date: '2026-09-02', salesOrdered: null, salesConfirmed: null }),
      point({ date: '2026-09-03', salesOrdered: 30, salesConfirmed: 24 }),
    ];
    const { container } = render(<DailyTrendChart series={dated} />);
    const firstTravellerX = () => Number(container.querySelector('.pa-trend-brush .recharts-brush-traveller rect')?.getAttribute('x'));
    const initialTravellerX = firstTravellerX();
    fireEvent.change(screen.getByLabelText('显示开始日期'), { target: { value: '2026-09-02' } });
    expect(firstTravellerX()).toBeGreaterThan(initialTravellerX);
    fireEvent.change(screen.getByLabelText('显示结束日期'), { target: { value: '2026-09-02' } });
    expect(within(container.querySelector('.pa-trend-canvas') as HTMLElement).getByRole('status')).toHaveTextContent('无数据');
    expect([...((await sweep(container)).keys())]).toEqual(['2026-09-02']);
    fireEvent.change(screen.getByLabelText('显示结束日期'), { target: { value: '2026-09-03' } });
    expect(container.querySelector('.pa-trend-canvas [role="status"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '销售额(已下)' }));
    expect(screen.getByLabelText('显示开始日期')).toHaveValue('2026-09-02');
    expect(screen.getByLabelText('显示结束日期')).toHaveValue('2026-09-03');
    expect(container.querySelector('.pa-trend-canvas [role="status"]')).toBeNull();
  });
  it('does not label a real zero as missing', () => {
    const { container } = render(<DailyTrendChart series={[point({ salesOrdered: 0, salesConfirmed: null })]} />);
    expect(container.querySelector('.pa-trend-canvas [role="status"]')).toBeNull();
  });
});

describe('trend tooltip actual visibility and missing data', () => {
  it('shows missing versus zero, and excludes hidden series from tooltip', async () => {
    const { container } = render(<DailyTrendChart currency="MYR" series={[
      point({ salesOrdered: 10, salesConfirmed: 8 }),
      point({ date: '2026-09-02', salesOrdered: null, salesConfirmed: 8 }),
      point({ date: '2026-09-03', salesOrdered: null, salesConfirmed: null }),
      point({ date: '2026-09-04', salesOrdered: 0, salesConfirmed: 0 }),
    ]} />);
    const seen = await sweep(container);
    expect(seen.get('2026-09-02')?.missing).toBe(1);
    expect(seen.get('2026-09-03')?.missing).toBe(2);
    expect(seen.get('2026-09-04')?.text).toContain('MYR 0.00');
    expect(seen.get('2026-09-04')?.missing).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '销售额(已确认)' }));
    const hidden = await sweep(container);
    expect([...hidden.values()].every((entry) => !entry.text.includes('销售额(已确认)'))).toBe(true);
  });
  it('old responses with no new fields still show visible no-data tooltips', async () => {
    const { container } = render(<DailyTrendChart series={[point({ salesOrdered: undefined, salesConfirmed: undefined }), point({ date: '2026-09-02', salesOrdered: undefined, salesConfirmed: undefined })]} />);
    const seen = await sweep(container);
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen.values()].every((entry) => entry.missing === 2)).toBe(true);
  });
  it('distinguishes matching month/day in different years', async () => {
    const { container } = render(<DailyTrendChart currency="MYR" series={[point({ date: '2025-09-09', salesOrdered: 1 }), point({ date: '2026-09-09', salesOrdered: 99 })]} />);
    const seen = await sweep(container);
    expect(seen.get('2025-09-09')?.text).toContain('MYR 1.00');
    expect(seen.get('2026-09-09')?.text).toContain('MYR 99.00');
  });
  it('hides tooltip after pointer exit', async () => {
    const { container } = render(<DailyTrendChart series={series} />);
    const wrapper = stubGeometry(container);
    fireEvent.mouseMove(wrapper, { clientX: 400, clientY: 100 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeVisible();
    fireEvent.mouseLeave(wrapper);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
    const tooltip = container.querySelector('[data-testid="trend-tooltip"]');
    expect(!tooltip || !hierarchyVisible(tooltip)).toBe(true);
  });
});

const mixedItem = { itemId: '1', itemName: 'X', impressions: 1000, clicks: null, visitors: 300, cartUnits: 0, ordersOrdered: 5 } as unknown as ParentProduct;
describe('real funnel stages and interaction', () => {
  it('renders trapezoids in business order and keeps missing/zero labels', () => {
    const { container } = render(<ConversionFunnelChart item={mixedItem} />);
    expect(container.querySelector('.recharts-funnel-trapezoid')).toBeTruthy();
    expect(container.querySelector('.recharts-bar')).toBeNull();
    const rows = [...container.querySelectorAll('.pa-funnel-row')];
    expect(rows.map((row) => row.firstChild?.textContent)).toEqual(['● 曝光 · 1,000', '● 点击 · —', '● 访客 · 300', '● 加购件数 · 0', '● 订单 · 5']);
    fireEvent.mouseEnter(rows[1]);
    expect(screen.getByTestId('funnel-tooltip')).toBeVisible();
    expect(screen.getByTestId('funnel-tooltip')).toHaveTextContent('无数据');
    expect(screen.getByTestId('funnel-tooltip')).not.toHaveTextContent('%');
    fireEvent.mouseLeave(rows[1]);
    fireEvent.focus(rows[3]);
    expect(screen.getByTestId('funnel-tooltip')).toHaveTextContent('0');
  });
  it('stage hiding never recomputes adjacent conversion rates', () => {
    const { container } = render(<ConversionFunnelChart item={{ ...mixedItem, clicks: 500 }} />);
    fireEvent.click(screen.getByRole('button', { name: '点击' }));
    const row = [...container.querySelectorAll('.pa-funnel-row')].find((node) => node.textContent?.includes('访客'))!;
    expect(row).toHaveTextContent('60.00%');
    expect(container.querySelectorAll('.pa-funnel-row')).toHaveLength(4);
  });
  it('all missing stages remain focusable with no-data tooltips', () => {
    const { container } = render(<ConversionFunnelChart item={{ ...mixedItem, impressions: null, clicks: null, visitors: null, cartUnits: null, ordersOrdered: null }} />);
    expect(screen.getByRole('status')).toHaveTextContent('无数据');
    for (const row of container.querySelectorAll('.pa-funnel-row')) {
      fireEvent.focus(row);
      expect(screen.getByTestId('funnel-tooltip')).toBeVisible();
      expect(screen.getByTestId('funnel-tooltip')).toHaveTextContent('无数据');
      fireEvent.blur(row);
    }
  });
  it('keeps real zero labels when there is no positive funnel shape', () => {
    const { container } = render(<ConversionFunnelChart item={{ ...mixedItem, impressions: 0, clicks: 0, visitors: 0, cartUnits: 0, ordersOrdered: 0 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('均为 0 或无数据');
    expect(container.querySelectorAll('.pa-funnel-row')).toHaveLength(5);
    expect(container.querySelector('.pa-funnel-row')).toHaveTextContent('曝光 · 0');
  });
});

describe('comparison legends', () => {
  it('toggles series in both comparison charts', () => {
    const { container } = render(<><OrderStatusCompareChart item={mixedItem} /><VariationUnitsChart variations={[{ variationName: 'test', unitsOrdered: 0 }]} /></>);
    const cards = container.querySelectorAll('section');
    for (const card of cards) {
      const buttons = within(card).getAllByRole('button', { pressed: true });
      buttons.forEach((button) => fireEvent.click(button));
      expect(within(card).getByRole('status')).toHaveTextContent('请点击图例');
      fireEvent.click(within(card).getByRole('button', { name: '恢复默认' }));
      expect(within(card).queryByRole('status')).toBeNull();
    }
  });
  it('distinguishes a selected missing series from a real zero in the variation chart', () => {
    const { container } = render(<VariationUnitsChart variations={[{ variationName: '规格 A', unitsOrdered: null, unitsConfirmed: 0 }]} />);
    expect(container.querySelector('.pa-comparison-canvas [role="status"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '件数(已确认)' }));
    expect(within(container.querySelector('.pa-comparison-canvas') as HTMLElement).getByRole('status')).toHaveTextContent('无数据');
    fireEvent.click(screen.getByRole('button', { name: '件数(已确认)' }));
    expect(container.querySelector('.pa-comparison-canvas [role="status"]')).toBeNull();
  });
});

describe('SummaryCards weighted CVR', () => {
  const summary = { itemCount: 1, totalSalesOrdered: 100, totalSalesConfirmed: 90, totalOrders: 10, totalVisitors: 200, totalClicks: 30 };
  it('uses backend pairwise rate and distinguishes no data from zero', () => {
    const { container, rerender } = render(<SummaryCards summary={summary} currency="MYR" weightedCvr={10} />);
    expect(container.textContent).toContain('10.00%');
    expect(container.querySelector('[title*="同日有效"]')).toBeTruthy();
    rerender(<SummaryCards summary={summary} currency="MYR" weightedCvr={null} />);
    expect(container.textContent).toContain('—');
    rerender(<SummaryCards summary={summary} currency="MYR" weightedCvr={0} />);
    expect(container.textContent).toContain('0.00%');
  });
});
