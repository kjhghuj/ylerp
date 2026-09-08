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
  page: 1,
  onPageChange: vi.fn(),
  sortKey: 'salesOrdered' as const,
  sortDirection: 'desc' as const,
  onSortChange: vi.fn(),
  onSelect: vi.fn(),
};

function countRows(container: HTMLElement): number {
  return container.querySelectorAll('tbody tr').length;
}

describe('ProductList', () => {
  it('renders one clickable row per item with pagination disabled when all fit one page', () => {
    const { container } = render(<ProductList {...PROPS} items={ITEMS} />);
    expect(countRows(container)).toBe(3);
    expect(screen.getByText('共 3 条')).toBeTruthy();
    expect((screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows 10 rows per page and paginates forward and backward', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const many = Array.from({ length: 25 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    const first = render(<ProductList {...PROPS} items={many} page={1} onPageChange={onPageChange} />);
    expect(countRows(first.container)).toBe(10);
    expect(first.getByText('共 25 条')).toBeTruthy();

    await user.click(first.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    await user.click(first.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    first.unmount();

    const second = render(<ProductList {...PROPS} items={many} page={2} onPageChange={onPageChange} />);
    expect(countRows(second.container)).toBe(10);
    expect(second.getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page');
    await user.click(second.getByRole('button', { name: '上一页' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    second.unmount();

    const third = render(<ProductList {...PROPS} items={many} page={3} onPageChange={onPageChange} />);
    expect(countRows(third.container)).toBe(5);
    expect((third.getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clamps an out-of-range page to the last page', () => {
    const many = Array.from({ length: 12 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    const { container } = render(<ProductList {...PROPS} items={many} page={9} />);
    expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page');
    expect(countRows(container)).toBe(2);
  });

  it('resizes rows per page and clamps current page when page size changes', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const many = Array.from({ length: 25 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    const { container } = render(
      <ProductList {...PROPS} items={many} page={3} onPageChange={onPageChange} />
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '每页条数' }), '50');
    expect(onPageChange).toHaveBeenCalledWith(1); // 25 条 / 50 条每页 → 收敛到第 1 页
    expect(countRows(container)).toBe(25);
  });

  it('jumps to the entered page and clamps out-of-range input', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const many = Array.from({ length: 25 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    render(<ProductList {...PROPS} items={many} page={1} onPageChange={onPageChange} />);
    const input = screen.getByRole('textbox', { name: '跳转页码' });
    await user.type(input, '2{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(2);
    await user.type(input, '99{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('collapses page buttons with ellipsis that jumps 5 pages forward', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const many = Array.from({ length: 85 }, (_, index) => makeItem({ itemId: `i-${index}` }));
    render(<ProductList {...PROPS} items={many} page={1} onPageChange={onPageChange} />);
    // 9 页 → 1 2 3 4 5 … 9
    expect(screen.getByRole('button', { name: '9' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '向后5页' }));
    expect(onPageChange).toHaveBeenCalledWith(6);
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
