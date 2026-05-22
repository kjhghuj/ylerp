import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryTable } from '../modules/restock/components/InventoryTable';
import { InventoryItem } from '../types';

const deleteInventoryItem = vi.fn();
const updateInventoryItem = vi.fn();
const addRestockRecord = vi.fn();
const showToast = vi.fn();

const inventory: InventoryItem[] = [
  {
    id: 'item-1',
    name: 'Test Product',
    sku: 'SKU-001',
    currentStock: 20,
    stockOfficial: 12,
    stockThirdParty: 8,
    inTransit: 0,
    dailySales: 10,
    leadTime: 7,
    replenishCycle: 30,
    costPerUnit: 5,
  },
];

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    inventory,
    updateInventoryItem,
    deleteInventoryItem,
    addRestockRecord,
  }),
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

const t = {
  detailsTitle: '补货详情',
  table: {
    product: '商品',
    stockOfficial: '官方仓',
    stockThirdParty: '第三方仓',
    transit: '在途',
    sales: '日销',
    coverage: '覆盖天数',
    restockQty: '建议补货',
    action: '操作',
    days: '天',
  },
  empty: {
    text: '暂无库存数据',
  },
};

describe('InventoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteInventoryItem.mockResolvedValue(undefined);
  });

  it('clears restock details by deleting current inventory rows', async () => {
    render(<InventoryTable targetDate="2026-06-22" leadTime={7} t={t} />);

    expect(screen.getByDisplayValue('Test Product')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清空补货详情' }));

    expect(screen.queryByDisplayValue('Test Product')).not.toBeInTheDocument();
    expect(screen.getByText('补货详情已清空')).toBeInTheDocument();
    expect(deleteInventoryItem).toHaveBeenCalledWith('item-1');
    expect(showToast).toHaveBeenCalledWith('补货详情已清空', 'success');
  });
});
