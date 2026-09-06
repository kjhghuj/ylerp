import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductList } from '../modules/product-analysis/components/ProductList';
import type { ParentProduct } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({
  useStore: () => ({ language: 'zh' }),
}));

function makeItem(overrides: Partial<ParentProduct> & { itemId: string }): ParentProduct {
  return {
    itemName: 'LT820 Keyboard',
    salesOrdered: null,
    salesConfirmed: null,
    impressions: null,
    clicks: null,
    ctr: null,
    cvrOrdered: null,
    cvrConfirmed: null,
    ordersOrdered: null,
    ordersConfirmed: null,
    unitsOrdered: null,
    unitsConfirmed: null,
    buyersOrdered: null,
    buyersConfirmed: null,
    cvrVisitorsOrdered: null,
    cvrVisitorsConfirmed: null,
    aovOrdered: null,
    aovConfirmed: null,
    uniqueImpressions: null,
    uniqueClicks: null,
    visitors: null,
    pageViews: null,
    bounceVisitors: null,
    bounceRate: null,
    searchClicks: null,
    likes: null,
    cartVisitors: null,
    cartUnits: null,
    cartRate: null,
    repeatOrderRate: null,
    repurchaseRateConfirmed: null,
    avgReorderDays: null,
    avgRepurchaseDays: null,
    variations: [],
    ...overrides,
  };
}

const ITEMS = [
  makeItem({ itemId: '1', itemName: 'Keyboard', status: 'Normal', salesOrdered: 100.5, variations: [{}, {}] }),
  makeItem({ itemId: '2', itemName: 'Mouse', salesOrdered: 50, visitors: 80 }),
  makeItem({ itemId: '3', itemName: 'Cable', salesOrdered: 10 }),
];

const PROPS = {
  currency: 'MYR',
  visibleCount: 48,
  sortKey: 'salesOrdered' as const,
  sortDirection: 'desc' as const,
  onSortChange: vi.fn(),
  onSelect: vi.fn(),
  onLoadMore: vi.fn(),
};

function countRows(container: HTMLElement): number {
  return container.querySelectorAll('tbody tr').length;
}

describe('ProductList', () => {
  it('renders one clickable row per item with load-more hidden when all visible', () => {
    const { container } = render(<ProductList {...PROPS} items={ITEMS} />);
    expect(countRows(container)).toBe(3);
    expect(screen.queryByRole('button', { name: /加载更多/ })).toBeNull();
  });

  it('truncates rows to visibleCount and shows remaining count on load-more', () => {
    const many = Array.from({ length: 60 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    const { container } = render(<ProductList {...PROPS} items={many} visibleCount={48} />);
    expect(countRows(container)).toBe(48);
    expect(screen.getByRole('button', { name: /加载更多（12）/ })).toBeTruthy();
  });

  it('calls onSelect with the clicked item and supports Enter on focused row', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProductList {...PROPS} items={ITEMS} />);
    const secondRow = container.querySelectorAll('tbody tr')[1] as HTMLElement;
    secondRow.focus();
    await user.keyboard('{Enter}');
    expect(PROPS.onSelect).toHaveBeenCalledWith(ITEMS[1]);
    await user.click(container.querySelectorAll('tbody tr')[0]);
    expect(PROPS.onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('calls onSortChange when a sortable header is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductList {...PROPS} items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: /销售额/ }));
    expect(PROPS.onSortChange).toHaveBeenCalledWith('salesOrdered');
    await user.click(screen.getByRole('button', { name: /访客/ }));
    expect(PROPS.onSortChange).toHaveBeenCalledWith('visitors');
  });

  it('shows empty state when no items', () => {
    render(<ProductList {...PROPS} items={[]} />);
    expect(screen.getByText('没有匹配的商品')).toBeTruthy();
  });
});
