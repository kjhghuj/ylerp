import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreProvider } from '../StoreContext';
import { ProductList } from '../modules/ProductList';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  showToast: vi.fn(),
}));
vi.mock('../src/api', () => ({ default: mocks.api }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { role: 'owner', permissions: [] } }) }));
vi.mock('../hooks/useExchangeRates', () => ({ useExchangeRates: () => ({ rates: { MYR: 2 } }) }));

const product = {
  id: 'delete-me', name: 'Delete safety product', sku: 'DELETE-SAFE', country: 'MY', sites: ['MY'],
  cost: 10, productWeight: 100, supplierInvoice: 'no', supplierTaxPoint: 0, totalRevenue: 30,
};

describe('Product deletion with the real store', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem('yl-product-list-active-tab', 'MY');
    mocks.api.get.mockImplementation(async (url: string) => ({
      data: url === '/products' ? [product] : url === '/restock-v2/stock-snapshot' ? { remoteFetched: true, items: [] } : [],
    }));
  });

  it('retains the product and confirmation on failure, then allows a deliberate retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.api.delete.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });
    render(<StoreProvider><ProductList onNavigate={vi.fn()} /></StoreProvider>);
    const trigger = await screen.findByRole('button', { name: '删除 Delete safety product' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('操作失败，请重试', 'error'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Delete safety product');
    expect(mocks.api.delete).toHaveBeenCalledTimes(1);

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.api.delete).toHaveBeenCalledTimes(2));
    expect(mocks.api.delete).toHaveBeenLastCalledWith('/products/delete-me?site=MY');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '删除 Delete safety product' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('商品列表操作')).toHaveFocus());
  });
});
