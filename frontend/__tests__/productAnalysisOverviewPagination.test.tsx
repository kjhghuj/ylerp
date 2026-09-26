import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstablishedTrendCard, NewPotentialCard } from '../modules/product-analysis/components/OverviewInsights';
import { overviewPageSize } from '../modules/product-analysis/utils/overviewPageSize';
import type { EstablishedTrendsResponse, PotentialItem } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));

const potentialItems = Array.from({ length: 14 }, (_, index) => ({
  rank: index + 1,
  itemId: `new-${index + 1}`,
  itemName: `新品 ${index + 1}`,
  score: 90 - index,
  metrics: { ordersOrdered: index + 1 },
})) as PotentialItem[];

const trends: EstablishedTrendsResponse = {
  from: '2026-09-01', to: '2026-09-06', windowDays: 3,
  items: Array.from({ length: 12 }, (_, index) => ({
    itemId: `old-${index + 1}`, itemName: `老品 ${index + 1}`,
    previousDailyOrders: 5, recentDailyOrders: 4, changePercent: -20,
    previousObservedDays: 2, recentObservedDays: 2,
    dailyOrders: [{ date: '2026-09-01', orders: 5 }, { date: '2026-09-06', orders: 4 }],
  })),
};

describe('overview rankings pagination', () => {
  it('fits the number of rows to the actual card height', () => {
    expect(overviewPageSize(200)).toBe(1);
    expect(overviewPageSize(280)).toBe(3);
    expect(overviewPageSize(430)).toBe(7);
    expect(overviewPageSize(850)).toBe(16);
  });

  it('shows more than five rows and pages the two lists independently', () => {
    const onNewSelect = vi.fn();
    const onOldSelect = vi.fn();
    render(<>
      <NewPotentialCard state={{ status: 'success', data: potentialItems }} pageSize={6} onRetry={() => undefined} onMore={() => undefined} onSelect={onNewSelect} />
      <EstablishedTrendCard state={{ status: 'success', data: trends }} pageSize={6} onRetry={() => undefined} onSelect={onOldSelect} />
    </>);
    const newCard = screen.getByRole('region', { name: '新品潜力榜' });
    const oldCard = screen.getByRole('region', { name: '老商品趋势监控' });
    expect(within(newCard).getAllByRole('button')).toHaveLength(9); // 查看全部 + 6 行 + 前后页
    expect(within(oldCard).getAllByRole('button')).toHaveLength(8); // 6 行 + 前后页
    expect(within(newCard).getByText('新品 6')).toBeTruthy();
    expect(within(newCard).queryByText('新品 7')).toBeNull();
    fireEvent.click(within(newCard).getByRole('button', { name: '新品潜力榜下一页' }));
    expect(within(newCard).getByText('新品 7')).toBeTruthy();
    expect(within(newCard).queryByText('新品 1')).toBeNull();
    expect(within(oldCard).getByText('老品 1')).toBeTruthy();
    fireEvent.click(within(oldCard).getByRole('button', { name: '老商品趋势监控下一页' }));
    expect(within(oldCard).getByText('老品 7')).toBeTruthy();
    fireEvent.click(within(newCard).getByText('新品 7'));
    expect(onNewSelect).toHaveBeenCalledWith(potentialItems[6]);
    expect(onOldSelect).not.toHaveBeenCalled();
  });

  it('clamps the page when the available row count changes', () => {
    const props = { pageSize: 6, onRetry: () => undefined, onMore: () => undefined, onSelect: () => undefined };
    const { rerender } = render(<NewPotentialCard {...props} state={{ status: 'success', data: potentialItems }} />);
    const card = screen.getByRole('region', { name: '新品潜力榜' });
    fireEvent.click(within(card).getByRole('button', { name: '新品潜力榜下一页' }));
    fireEvent.click(within(card).getByRole('button', { name: '新品潜力榜下一页' }));
    expect(within(card).getByText('新品 14')).toBeTruthy();
    rerender(<NewPotentialCard {...props} state={{ status: 'success', data: potentialItems.slice(0, 8) }} />);
    expect(within(card).getByText('新品 1')).toBeTruthy();
  });
});
