import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { YcProductSyncModal } from '../modules/product-list/YcProductSyncModal';

const labels = {
  title: '同步元仓商品', subtitle: '选择同步到 {site} 的商品', searchPlaceholder: '搜索名称或 SKU',
  productName: '商品名称', selectAll: '全选未同步商品', selectedCount: '已选择 {count} 个商品',
  alreadySynced: '已同步', available: '可用库存', inventory: '总库存', warehouse: '仓库',
  empty: '没有可同步商品', loading: '正在加载商品', cancel: '取消', confirm: '同步所选商品', syncing: '同步中...',
};
const items = [
  { sku: 'NEW', name: '待同步商品', warehouseCodes: ['A'], available: 3, inventory: 4, occupy: 1, unshipped: 0, alreadyInCurrentSite: false },
  { sku: 'OLD', name: '已有商品', warehouseCodes: ['A'], available: 1, inventory: 1, occupy: 0, unshipped: 0, alreadyInCurrentSite: true },
];

describe('YC sync dialog interaction contract', () => {
  it('returns to the opening control after cancelling a dialog that initially focuses search', async () => {
    const Harness = () => {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>打开同步</button>{open && <YcProductSyncModal
        siteName="马来西亚" labels={labels} items={items} loading={false} syncing={false}
        error={null} onClose={() => setOpen(false)} onSync={vi.fn()} />}</>;
    };
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开同步' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    fireEvent.click(screen.getByText(labels.cancel));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses search, filters the table and submits only eligible selected SKUs', async () => {
    const onSync = vi.fn();
    render(<YcProductSyncModal siteName="马来西亚" labels={labels} items={items} loading={false} syncing={false}
      error={null} onClose={vi.fn()} onSync={onSync} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: labels.searchPlaceholder })).toHaveFocus());
    expect(screen.getByRole('checkbox', { name: '选择 OLD' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 NEW' }));
    fireEvent.click(screen.getByRole('button', { name: labels.confirm }));
    expect(onSync).toHaveBeenCalledWith(['NEW']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '不存在' } });
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  it('keeps the dialog open and selection locked during synchronization', () => {
    const onClose = vi.fn();
    render(<YcProductSyncModal siteName="马来西亚" labels={labels} items={items} loading={false} syncing
      error={null} onClose={onClose} onSync={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: labels.selectAll })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '选择 NEW' })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: labels.cancel })) expect(button).toBeDisabled();
  });
});
