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
    reasons: ['后半程销量环比 +120%', '加购率 18.0% 高于店铺均值 6.0%'],
    metrics: {
      ordersOrdered: 42,
      visitors: 1200,
      clicks: 300,
      impressions: 6000,
      cartVisitors: 216,
      ctr: 5,
      cvrConfirmed: 3.5,
      cartRate: 18,
      growthPercent: 120,
    },
  },
  {
    rank: 2,
    itemId: '10002',
    itemName: 'Improvable Mouse',
    sheetKey: 'new',
    score: 71.2,
    reasons: ['点击率 7.0% 但访客转化率仅 1.2%，详情页/价格有优化空间'],
    metrics: {
      ordersOrdered: 9,
      visitors: 760,
      clicks: 210,
      impressions: 3000,
      cartVisitors: 60,
      ctr: 7,
      cvrConfirmed: 1.2,
      cartRate: 7.9,
      growthPercent: null,
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

  it('calls onSelect with the clicked item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PotentialList items={ITEMS} onSelect={onSelect} />);
    await user.click(screen.getByText('Improvable Mouse'));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('shows empty state when no items', () => {
    render(<PotentialList items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/暂无符合条件的潜力商品/)).toBeTruthy();
  });
});
