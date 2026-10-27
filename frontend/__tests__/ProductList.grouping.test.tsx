import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductList } from '../modules/ProductList';
import api from '../src/api';
import { zh } from '../locales/zh';

vi.mock('../src/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('xlsx', () => ({
  writeFile: vi.fn(),
  utils: { json_to_sheet: vi.fn(), book_new: vi.fn(), book_append_sheet: vi.fn() },
}));

const showToast = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../hooks/useExchangeRates', () => ({ useExchangeRates: () => ({ rates: { MYR: 2 } }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { role: 'owner', permissions: [] } }) }));

const setCurrentPage = vi.fn();
const deleteProduct = vi.fn();
const products = [
  { id: 'p1', name: 'Bottle Black', sku: 'BOT-BLK', country: 'MY', sites: ['MY'], cost: 10, productWeight: 100, supplierInvoice: 'no', supplierTaxPoint: 0, totalRevenue: 30 },
  { id: 'p2', name: 'Bottle White', sku: 'BOT-WHT', country: 'MY', sites: ['MY'], cost: 12, productWeight: 120, supplierInvoice: 'no', supplierTaxPoint: 0, totalRevenue: 35 },
  { id: 'p3', name: 'Cup', sku: 'CUP-1', country: 'MY', sites: ['MY'], cost: 8, productWeight: 90, supplierInvoice: 'no', supplierTaxPoint: 0, totalRevenue: 20 },
];
let displayedProducts = products;
let displayedPage = 1;

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    products: displayedProducts,
    refreshProducts: vi.fn(),
    deleteProduct,
    addProduct: vi.fn(),
    setCalculatorImport: vi.fn(),
    setCalculatorImportNodes: vi.fn(),
    productListActiveTab: 'MY',
    setProductListActiveTab: vi.fn(),
    productListCurrentPage: displayedPage,
    setProductListCurrentPage: setCurrentPage,
    strings: zh,
  }),
}));

const groups = [{
  id: 'g1',
  name: 'Insulated Bottle',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
  members: [{ productId: 'p1' }, { productId: 'p2' }],
}];

describe('ProductList grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    displayedProducts = products;
    displayedPage = 1;
    deleteProduct.mockReset();
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/product-display-groups') return Promise.resolve({ data: groups });
      if (url === '/restock-v2/stock-snapshot') {
        return Promise.resolve({
          data: {
            remoteFetched: true,
            items: [
              { sku: 'BOT-BLK', available: 4, inventory: 6, occupy: 1, unshipped: 1, warehouseCodes: ['A'] },
              { sku: 'BOT-WHT', available: 5, inventory: 8, occupy: 2, unshipped: 1, warehouseCodes: ['A'] },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    (api.post as any).mockResolvedValue({ data: groups[0] });
  });

  it('collapses variants, summarizes them, and preserves each SKU action row after expansion', async () => {
    render(<ProductList onNavigate={vi.fn()} />);

    const groupButton = await screen.findByRole('button', { name: 'Insulated Bottle' });
    const groupRow = groupButton.closest('tr')!;
    expect(screen.queryByText('Bottle Black')).not.toBeInTheDocument();
    expect(within(groupRow).getByText('可用 9')).toBeInTheDocument();
    expect(within(groupRow).getByText('10.00～12.00')).toBeInTheDocument();

    fireEvent.click(groupButton);

    expect(screen.getByText('Bottle Black')).toBeInTheDocument();
    expect(screen.getByText('Bottle White')).toBeInTheDocument();
    expect(screen.getByText('Cup')).toBeInTheDocument();
  });

  it('adds a selected ungrouped SKU to an existing group', async () => {
    render(<ProductList onNavigate={vi.fn()} />);
    await screen.findByRole('button', { name: 'Insulated Bottle' });

    fireEvent.click(screen.getByLabelText('归组选中 CUP-1'));
    fireEvent.click(screen.getByRole('button', { name: '归组（1）' }));
    expect(screen.getByRole('dialog', { name: '商品归组' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存归组' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/product-display-groups/g1/members', { productIds: ['p3'] });
    });
  });

  it('allows retrying group loading after the service recovers', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/product-display-groups') {
        const calls = (api.get as any).mock.calls.filter(([path]: [string]) => path === url).length;
        return calls === 1 ? Promise.reject(new Error('temporarily unavailable')) : Promise.resolve({ data: groups });
      }
      return Promise.resolve({ data: { remoteFetched: true, items: [] } });
    });
    render(<ProductList onNavigate={vi.fn()} />);

    expect(await screen.findByRole('button', { name: '重试加载商品组' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '商品视图' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '重试加载商品组' }));

    expect(await screen.findByRole('button', { name: 'Insulated Bottle' })).toBeInTheDocument();
  });

  it('can manage a group whose members have all been removed', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/product-display-groups') return Promise.resolve({ data: [{ ...groups[0], members: [] }] });
      return Promise.resolve({ data: { remoteFetched: true, items: [] } });
    });
    render(<ProductList onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '管理商品组' }));

    expect(screen.getByRole('button', { name: '管理 Insulated Bottle' })).toBeInTheDocument();
  });

  it('lets users collapse a group automatically opened by an SKU search', async () => {
    render(<ProductList onNavigate={vi.fn()} />);
    await screen.findByRole('button', { name: 'Insulated Bottle' });

    fireEvent.change(screen.getByPlaceholderText('搜索商品名称或SKU...'), { target: { value: 'BOT-WHT' } });
    const groupButton = screen.getByRole('button', { name: 'Insulated Bottle' });
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Bottle White')).toBeInTheDocument();

    fireEvent.click(groupButton);

    expect(groupButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Bottle White')).not.toBeInTheDocument();
  });

  it('renders five distinct page numbers near the final page', async () => {
    displayedProducts = [
      ...products,
      ...Array.from({ length: 138 }, (_, index) => ({
        ...products[2],
        id: `extra-${index}`,
        sku: `EXTRA-${index}`,
      })),
    ];
    displayedPage = 7;
    render(<ProductList onNavigate={vi.fn()} />);

    await screen.findByRole('button', { name: '管理商品组' });
    expect(screen.getAllByRole('button', { name: /^[0-9]+$/ }).map(button => button.textContent))
      .toEqual(['3', '4', '5', '6', '7']);
  });

  it('requires an explicit decision before disbanding a group, and cancellation keeps it intact', async () => {
    render(<ProductList onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '管理商品组' }));
    fireEvent.click(screen.getByRole('button', { name: '解散 Insulated Bottle' }));

    const confirmation = screen.getByRole('alertdialog', { name: '解散商品组' });
    expect(confirmation).toHaveTextContent('Insulated Bottle');
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
    expect(api.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '解散 Insulated Bottle' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '确认解散' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/product-display-groups/g1'));
  });

  it('renames a group through a labelled dialog and preserves the entered name on failure', async () => {
    (api.put as any).mockRejectedValue(new Error('offline'));
    render(<ProductList onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '管理商品组' }));
    fireEvent.click(screen.getByRole('button', { name: '重命名 Insulated Bottle' }));

    const dialog = screen.getByRole('dialog', { name: '重命名商品组' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '商品组名称' }), { target: { value: 'Updated bottle' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存名称' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/product-display-groups/g1', { name: 'Updated bottle' }));
    expect(within(dialog).getByRole('textbox', { name: '商品组名称' })).toHaveValue('Updated bottle');
  });

  it('closes grouping with Escape without saving and restores the initiating control', async () => {
    render(<ProductList onNavigate={vi.fn()} />);
    await screen.findByRole('button', { name: 'Insulated Bottle' });
    fireEvent.click(screen.getByLabelText('归组选中 CUP-1'));
    const trigger = screen.getByRole('button', { name: '归组（1）' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog', { name: '商品归组' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns focus to the toolbar after deleting the initiating product row', async () => {
    deleteProduct.mockImplementation(async () => { displayedProducts = products.filter(product => product.id !== 'p3'); });
    render(<ProductList onNavigate={vi.fn()} />);
    await screen.findByRole('button', { name: 'Insulated Bottle' });
    const trigger = screen.getByRole('button', { name: '删除 Cup' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(deleteProduct).toHaveBeenCalledWith('p3', 'MY'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('商品列表操作')).toHaveFocus());
  });

  it('focuses the rename field and returns to the group action when cancelled', async () => {
    render(<ProductList onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '管理商品组' }));
    const trigger = screen.getByRole('button', { name: '重命名 Insulated Bottle' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '重命名商品组' });
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: '商品组名称' })).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(api.put).not.toHaveBeenCalled();
  });

  it('focuses the new-group name and restores the opening control after Escape', async () => {
    (api.get as any).mockImplementation((url: string) => Promise.resolve({
      data: url === '/product-display-groups' ? [] : { remoteFetched: true, items: [] },
    }));
    render(<ProductList onNavigate={vi.fn()} />);
    await screen.findByLabelText('归组选中 BOT-BLK');
    fireEvent.click(screen.getByLabelText('归组选中 BOT-BLK'));
    fireEvent.click(screen.getByLabelText('归组选中 BOT-WHT'));
    const trigger = screen.getByRole('button', { name: '归组（2）' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '商品归组' });
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: '商品组名称' })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(api.post).not.toHaveBeenCalled();
  });
});
