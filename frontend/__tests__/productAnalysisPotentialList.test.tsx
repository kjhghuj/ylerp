import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PotentialList } from '../modules/product-analysis/components/PotentialList';
import type { PotentialItem } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({
  useStore: () => ({ language: 'zh' }),
}));

const ITEMS: PotentialItem[] = [
  {
    rank: 1,
    itemId: '10001',
    itemName: 'Growing Keyboard',
    sheetKey: 'hot',
    score: 87.5,
    reasons: ['后 3 天日均订单环比 +120%', '加购率 18.0% 高于入围商品平均加购率 6.0%'],
    metrics: {
      ordersOrdered: 42,
      visitors: 1200,
      clicks: 300,
      impressions: 6000,
      cartVisitors: 216,
      ctr: 5,
      cvrOrdered: 3.5,
      cartRate: 18,
      growthPercent: 120,
      growthStatus: 'ok',
      growthWindowDays: 3,
      growthPreviousObservedDays: 3,
      growthRecentObservedDays: 3,
    },
  },
  {
    rank: 2,
    itemId: '10002',
    itemName: 'Improvable Mouse',
    sheetKey: 'new',
    score: 71.2,
    reasons: ['点击率 7.0% 但下单转化率仅 1.2%，详情页/价格有优化空间'],
    metrics: {
      ordersOrdered: 9,
      visitors: 760,
      clicks: 210,
      impressions: 3000,
      cartVisitors: 60,
      ctr: 7,
      cvrOrdered: 1.2,
      cartRate: 7.9,
      growthPercent: null,
      growthStatus: 'insufficient',
      growthWindowDays: 3,
      growthPreviousObservedDays: 2,
      growthRecentObservedDays: 3,
    },
  },
];

describe('PotentialList', () => {
  it('renders ranked items with scores and reason chips', () => {
    render(<PotentialList items={ITEMS} onSelect={vi.fn()} />);
    expect(screen.getByText('Growing Keyboard')).toBeTruthy();
    expect(screen.getByText('Improvable Mouse')).toBeTruthy();
    expect(screen.getByText('87.5')).toBeTruthy();
    expect(screen.getByText(/环比 \+120%/)).toBeTruthy();
    expect(screen.getByText(/转化率仅 1.2%/)).toBeTruthy();
  });

  it('labels the CVR column as ordered-conversion and renders dash for incomputable growth', () => {
    render(<PotentialList items={ITEMS} onSelect={vi.fn()} />);
    // 下单转化率口径（cvrOrdered），区别于详情页的已确认口径；两个条目各渲染一次标签
    expect(screen.getAllByText('下单转化率')).toHaveLength(2);
    // growthStatus insufficient → '—'
    const growthCells = screen.getAllByText('—');
    expect(growthCells.length).toBeGreaterThan(0);
  });

  it('marks new-orders growth (prev window zero) instead of a fake percentage', () => {
    const newOrdersItem: PotentialItem = {
      ...ITEMS[0],
      itemName: 'Fresh Rising Item',
      metrics: { ...ITEMS[0].metrics, growthPercent: null, growthStatus: 'new-orders' },
    };
    render(<PotentialList items={[newOrdersItem]} onSelect={vi.fn()} />);
    expect(screen.getByText('新增订单')).toBeTruthy();
  });

  it('shows growth coverage per window and flags incomplete samples', () => {
    render(<PotentialList items={ITEMS} onSelect={vi.fn()} />);
    // 第一条：前期 3/3、后期 3/3（完整）；第二条：前期 2/3 → 样本不完整标记
    const coverageLines = screen.getAllByText(/环比覆盖/);
    expect(coverageLines).toHaveLength(2);
    expect(coverageLines[0].textContent).toContain('前期 3/3 天');
    expect(coverageLines[0].textContent).toContain('后期 3/3 天');
    expect(coverageLines[1].textContent).toContain('前期 2/3 天');
    expect(screen.getAllByText('样本不完整')).toHaveLength(1);
  });

  it('calls onSelect with the clicked item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PotentialList items={ITEMS} onSelect={onSelect} />);
    await user.click(screen.getByText('Improvable Mouse'));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('shows empty state when no items', () => {
    render(<PotentialList items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/新上架商品」表中暂无符合条件的商品/)).toBeTruthy();
  });
});
