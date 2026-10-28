import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPanel } from '../modules/product-analysis/components/CalendarPanel';
import { ShopManager } from '../modules/product-analysis/components/ShopManager';
import { deleteShop } from '../modules/product-analysis/services/productAnalysisApi';
import type { DayMeta, ShopMeta } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));
const showToast = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../modules/product-analysis/services/productAnalysisApi', () => ({
  deleteShop: vi.fn(), createShop: vi.fn(), updateShop: vi.fn(),
  getApiErrorDetail: (error: Error) => error.message,
}));
const day: DayMeta = { date: '2026-09-06', fileName: 'report.xlsx', itemCount: 1, currency: 'MYR', createdAt: '2026-09-06T00:00:00Z' };
const shop: ShopMeta = { id: 'shop-1', name: '确认店铺', site: 'MY', currency: 'MYR', platform: 'shopee', dayCount: 1, latestUploadDate: day.date, createdAt: day.createdAt, updatedAt: day.createdAt };
beforeEach(() => { vi.clearAllMocks(); });

describe('analysis deletion confirmations', () => {
  it('cancels a single day without a request and returns focus to the selected day action', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<CalendarPanel days={[day]} canDelete onDeleteDay={remove} onBatchDelete={vi.fn()} />);
    const opener = screen.getByRole('button', { name: `删除 ${day.date}` });
    await user.click(opener);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(day.date);
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(remove).not.toHaveBeenCalled();
  });

  it('locks pending batch deletion and keeps the exact selected dates for deliberate retry after failure', async () => {
    const user = userEvent.setup();
    let finish!: (result: boolean) => void;
    const remove = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValueOnce(true);
    render(<CalendarPanel days={[day]} canDelete onDeleteDay={vi.fn()} onBatchDelete={remove} />);
    await user.click(screen.getByRole('button', { name: '批量管理' }));
    await user.click(screen.getByRole('button', { name: day.date }));
    await user.click(screen.getByRole('button', { name: '删除所选' }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: '删除' });
    await user.click(confirm);
    expect(remove).toHaveBeenCalledExactlyOnceWith([day.date]);
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.click(confirm);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => { finish(false); });
    expect(confirm).toBeEnabled();
    expect(screen.getByText('已选 1 天')).toBeInTheDocument();
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(remove).toHaveBeenNthCalledWith(2, [day.date]);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除所选' })).toHaveFocus());
  });

  it('closes only the nested confirmation, preserves failed shop deletion, and focuses the name input after successful removal', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    vi.mocked(deleteShop).mockRejectedValueOnce(new Error('删除失败')).mockResolvedValueOnce(undefined);
    function Host() {
      const [shops, setShops] = useState([shop]);
      return <ShopManager shops={shops} onClose={close} onRefresh={async () => { setShops([]); }} />;
    }
    render(<Host />);
    const opener = screen.getByTitle('删除店铺');
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '管理店铺' })).toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    await user.click(opener);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('删除失败', 'error'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(shop.name);
    expect(deleteShop).toHaveBeenCalledExactlyOnceWith(shop.id);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteShop).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(shop.name)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: '店铺名称' })).toHaveFocus());
    expect(close).not.toHaveBeenCalled();
  });
});
