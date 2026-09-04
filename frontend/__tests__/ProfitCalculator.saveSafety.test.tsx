import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreProvider, useStore } from '../StoreContext';
import { ProfitCalculator } from '../modules/ProfitCalculator';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';
import { calculateProfit } from '../modules/profit/calculateProfit';
import type { ProductCalcData } from '../types';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  showToast: vi.fn(),
}));
vi.mock('../src/api', () => ({ default: mocks.api }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rates: { MYR: 0.65, SGD: 4.8 }, isLoading: false, isStale: false, lastUpdated: '2026-09-04' }),
}));

const productA: ProductCalcData = {
  id: 'product-A', name: 'Product A', sku: 'SKU-A', country: 'MY', sites: ['MY'],
  cost: 10, productWeight: 100, supplierTaxPoint: 0, supplierInvoice: 'no',
};
let store: ReturnType<typeof useStore>;
const Probe = () => { store = useStore(); return null; };

async function mount(editingId: string | null = productA.id) {
  localStorage.setItem('yl-profit-global-inputs', JSON.stringify({
    name: productA.name, sku: productA.sku, purchaseCost: 10, productWeight: 100,
    supplierTaxPoint: 0, supplierInvoice: 'no', vatRate: 1, corporateIncomeTaxRate: 5,
  }));
  if (editingId) localStorage.setItem('yl-profit-editing-product-id', editingId);
  const view = render(<StoreProvider><Probe /><ProfitCalculator /></StoreProvider>);
  await waitFor(() => expect(store.loading).toBe(false));
  return view;
}

function changeIdentity(name = 'Product B', sku = 'SKU-B') {
  fireEvent.change(document.querySelector('input[name="name"]')!, { target: { value: name } });
  fireEvent.change(document.querySelector('input[name="sku"]')!, { target: { value: sku } });
}
const update = () => fireEvent.click(screen.getByRole('button', { name: '更新当前商品' }));
const create = () => fireEvent.click(screen.getByRole('button', { name: '存入商品库' }));
const copy = () => fireEvent.click(screen.getByRole('button', { name: '另存为新商品' }));

describe('ProfitCalculator product save safety with the real store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.api.get.mockImplementation(async (url: string) => ({
      data: url === '/products' ? [productA] : [],
    }));
    mocks.api.post.mockImplementation(async (_url: string, request) => ({
      data: { product: { ...request.product, id: 'product-B' }, productTemplates: [] },
    }));
    mocks.api.put.mockImplementation(async (_url: string, request) => ({
      data: { product: { ...productA, ...request.product }, productTemplates: [] },
    }));
  });
  afterEach(cleanup);

  it('applies reverse pricing only to the current site in either currency mode, then saves via the existing API', async () => {
    await mount();
    const node = { id: 'reference', name: 'Reference', currency: 'MYR', platform: 'shopee' as const, data: { ...DEFAULT_NODE_DATA } };
    act(() => {
      store.setProfitNodes({ MYR: [node, { ...node, id: 'other', name: 'Other', data: { ...DEFAULT_NODE_DATA, platformCommissionRate: 40 } }] });
      store.setProfitSiteInputsMap({ MYR: { ...DEFAULT_SITE_INPUTS, totalRevenue: 20 }, SGD: { ...DEFAULT_SITE_INPUTS, totalRevenue: 80 } });
    });
    fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
    fireEvent.click(screen.getByRole('button', { name: '20%' }));
    fireEvent.change(screen.getByLabelText('基准计算节点'), { target: { value: 'reference' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '应用此售价' })).toBeEnabled());
    expect(screen.getByText('定价基准')).toBeInTheDocument();
    const suggestion = screen.getByTestId('suggested-revenue').textContent;
    expect(store.profitSiteInputsMap.MYR.totalRevenue).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: '关闭定价弹窗' }));
    fireEvent.click(screen.getByRole('button', { name: '切换本土货币计算' }));
    fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '应用此售价' })).toBeEnabled());
    expect(screen.getByTestId('suggested-revenue')).toHaveTextContent(suggestion!);
    fireEvent.click(screen.getByRole('button', { name: '应用此售价' }));
    const revenue = store.profitSiteInputsMap.MYR.totalRevenue;
    expect(calculateProfit(node.data, store.profitGlobalInputs, store.profitSiteInputsMap.MYR, 0.65, 'MYR').margin).toBeGreaterThanOrEqual(20);
    expect(store.profitSiteInputsMap.SGD.totalRevenue).toBe(80);
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith('已更新当前站点总收入');
    update();
    await waitFor(() => expect(mocks.api.put).toHaveBeenCalledTimes(1));
    expect(mocks.api.put.mock.calls[0][1].sitePatch.siteData.MY.totalRevenue).toBe(revenue);
  });

  it('clears target-pricing preferences when resetting or importing a product', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
    fireEvent.click(screen.getByRole('button', { name: '25%' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭定价弹窗' }));
    fireEvent.click(screen.getByTitle('重置'));
    expect(screen.queryByLabelText('目标收入利润率')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '30%' }));
    act(() => store.setCalculatorImport(productA));
    await waitFor(() => expect(screen.queryByLabelText('目标收入利润率')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('');
  });

  it('requires a decision when A is changed to B, and cancel does not write', async () => {
    await mount();
    changeIdentity();
    update();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('SKU-A');
    expect(dialog).toHaveTextContent('SKU-B');
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.products).toEqual([productA]);
  });

  it('also protects a name-only change', async () => {
    await mount();
    changeIdentity('Product B', 'SKU-A');
    update();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('creates B from the decision dialog and preserves A', async () => {
    await mount();
    changeIdentity();
    update();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '另存为新商品' }));
    await waitFor(() => expect(store.products).toHaveLength(2));
    expect(store.products[0]).toEqual(productA);
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).toHaveBeenCalledWith('/products/with-templates', expect.objectContaining({
      product: expect.objectContaining({ name: 'Product B', sku: 'SKU-B' }),
    }));
    expect(store.profitEditingProductId).toBe('product-B');
  });

  it('updates A only after explicitly confirming the identity change', async () => {
    await mount();
    changeIdentity();
    update();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '确认修改原商品' }));
    await waitFor(() => expect(mocks.api.put).toHaveBeenCalledTimes(1));
    expect(mocks.api.put).toHaveBeenCalledWith('/products/product-A/with-templates', expect.objectContaining({
      product: expect.objectContaining({ name: 'Product B', sku: 'SKU-B' }),
    }));
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('reset clears the persisted editing ID and saves B as a new product', async () => {
    await mount();
    fireEvent.click(screen.getByTitle('重置'));
    expect(store.profitEditingProductId).toBeNull();
    expect(localStorage.getItem('yl-profit-editing-product-id')).toBeNull();
    changeIdentity();
    create();
    await waitFor(() => expect(store.products).toHaveLength(2));
    expect(store.products[0]).toEqual(productA);
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('never silently updates an existing SKU from a new form', async () => {
    await mount(null);
    create();
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('SKU'), 'error'));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('rejects another product SKU during update and during save as new', async () => {
    mocks.api.get.mockImplementation(async (url: string) => ({
      data: url === '/products' ? [productA, { ...productA, id: 'existing-B', sku: 'SKU-B' }] : [],
    }));
    await mount();
    changeIdentity();
    update();
    copy();
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('SKU'), 'error');
  });

  it('blocks stale editing IDs instead of silently creating a record', async () => {
    await mount('deleted-product');
    changeIdentity();
    update();
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('重新载入'), 'error');
  });

  it('saves cost changes directly and retains the saved identity for further updates', async () => {
    await mount();
    act(() => store.setProfitGlobalInputs(previous => ({ ...previous, purchaseCost: 25 })));
    update();
    await waitFor(() => expect(store.products[0].cost).toBe(25));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.profitEditingProductId).toBe(productA.id);
    changeIdentity();
    update();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.api.put).toHaveBeenCalledTimes(1);
  });

  it('creates A, then saves changed B separately without overwriting the newly saved A', async () => {
    mocks.api.get.mockResolvedValue({ data: [] });
    mocks.api.post.mockImplementation(async (_url: string, request) => ({ data: {
      product: { ...request.product, id: request.product.sku === 'SKU-A' ? 'product-A' : 'product-B' },
      productTemplates: [],
    } }));
    await mount(null);
    create();
    await waitFor(() => expect(store.profitEditingProductId).toBe('product-A'));
    changeIdentity();
    update();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '另存为新商品' }));
    await waitFor(() => expect(store.products).toHaveLength(2));
    expect(store.products.map(product => [product.id, product.name, product.sku])).toEqual([
      ['product-A', 'Product A', 'SKU-A'], ['product-B', 'Product B', 'SKU-B'],
    ]);
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('clears the previous editing identity when importing a product without an ID', async () => {
    await mount();
    act(() => store.setCalculatorImport({ ...productA, id: '', name: 'New import', sku: 'SKU-NEW' }));
    await waitFor(() => expect(store.profitEditingProductId).toBeNull());
    expect(localStorage.getItem('yl-profit-editing-product-id')).toBeNull();
    create();
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(1));
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('closes an outdated decision when a different product is loaded', async () => {
    await mount();
    changeIdentity();
    update();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    act(() => store.setCalculatorImport(productA));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('supports keyboard cancellation and restores focus to the update button', async () => {
    await mount();
    changeIdentity();
    const button = screen.getByRole('button', { name: '更新当前商品' });
    button.focus();
    update();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(mocks.api.put).not.toHaveBeenCalled();
  });

  it('does not reuse old product template links when saving a copy', async () => {
    await mount();
    act(() => store.setProfitNodes({ MYR: [{
      id: 'node-A', productId: productA.id, productTemplateLinkId: 'link-A',
      templateId: 'legacy-link-A', name: 'Shopee', platform: 'shopee', currency: 'MYR',
      data: { ...DEFAULT_NODE_DATA },
    }] }));
    changeIdentity();
    copy();
    await waitFor(() => expect(store.profitEditingProductId).toBe('product-B'));
    expect(mocks.api.get).not.toHaveBeenCalledWith('/products/product-A/templates');
    const mutations = mocks.api.post.mock.calls[0][1].templateMutations;
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ operation: 'create', templateId: null });
    expect(mutations[0]).not.toHaveProperty('linkId');
    expect(store.profitNodes.MYR[0]).not.toHaveProperty('productTemplateLinkId');
    expect(store.profitNodes.MYR[0]).not.toHaveProperty('productId');
    expect(store.profitNodes.MYR[0]).not.toHaveProperty('templateId');
    expect(store.products[0]).toEqual(productA);
  });

  it('keeps shared templates and targets only B template links on subsequent saves', async () => {
    const linkB = {
      id: 'link-B', productId: 'product-B', templateId: 'shared-template', name: 'Shopee',
      platform: 'shopee', country: 'MYR',
      data: { kind: 'standard', schemaVersion: 2, nodeData: {}, extraData: {} },
    };
    mocks.api.get.mockImplementation(async (url: string) => ({ data:
      url === '/products' ? [productA]
        : url === '/templates?type=profit' ? [{ id: 'shared-template', name: 'Shared', country: 'MYR', data: {} }]
          : url === '/products/product-B/templates' ? [linkB] : [],
    }));
    mocks.api.post.mockImplementation(async (_url: string, request) => ({ data: {
      product: { ...request.product, id: 'product-B' }, productTemplates: [linkB],
    } }));
    mocks.api.put.mockImplementation(async (_url: string, request) => ({ data: {
      product: { ...request.product, id: 'product-B' }, productTemplates: [linkB],
    } }));
    await mount();
    const node = {
      id: 'node-A', productId: productA.id, productTemplateLinkId: 'link-A',
      templateId: 'shared-template', name: 'Shopee', platform: 'shopee' as const, currency: 'MYR',
      data: { ...DEFAULT_NODE_DATA },
    };
    act(() => store.setProfitNodes({ MYR: [node], SGD: [{ ...node, id: 'node-SG', currency: 'SGD' }] }));
    changeIdentity();
    copy();
    await waitFor(() => expect(store.profitEditingProductId).toBe('product-B'));
    expect(mocks.api.post.mock.calls[0][1].templateMutations[0]).toMatchObject({
      operation: 'create', templateId: 'shared-template',
    });
    expect(store.profitNodes.SGD[0]).not.toHaveProperty('productTemplateLinkId');
    expect(store.profitNodes.SGD[0]).not.toHaveProperty('productId');
    expect(store.profitNodes.SGD[0].templateId).toBe('shared-template');
    act(() => store.setProfitGlobalInputs(previous => ({ ...previous, purchaseCost: 20 })));
    update();
    await waitFor(() => expect(mocks.api.put).toHaveBeenCalledTimes(1));
    expect(mocks.api.put).toHaveBeenCalledWith('/products/product-B/with-templates', expect.objectContaining({
      templateMutations: [expect.objectContaining({ operation: 'update', linkId: 'link-B', templateId: 'shared-template' })],
    }));
    expect(mocks.api.get).not.toHaveBeenCalledWith('/products/product-A/templates');
    expect(store.products[0]).toEqual(productA);
  });

  it('preserves form and editing identity on failure, and permits retry', async () => {
    mocks.api.post.mockRejectedValueOnce(new Error('offline'));
    await mount();
    changeIdentity();
    copy();
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('商品保存失败', 'error'));
    expect(store.profitEditingProductId).toBe(productA.id);
    expect(store.profitGlobalInputs.sku).toBe('SKU-B');
    copy();
    await waitFor(() => expect(store.products).toHaveLength(2));
    expect(mocks.api.post).toHaveBeenCalledTimes(2);
  });

  it('shows a conflict without falling back to update when the server rejects a duplicate SKU', async () => {
    mocks.api.post.mockRejectedValueOnce({ response: { status: 409 } });
    await mount();
    changeIdentity();
    copy();
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('保存冲突'), 'error'));
    expect(mocks.api.put).not.toHaveBeenCalled();
    expect(store.profitGlobalInputs.sku).toBe('SKU-B');
    expect(store.products).toEqual([productA]);
  });

  it('preserves a different product imported while an older save is in flight', async () => {
    let finish!: (value: unknown) => void;
    mocks.api.post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await mount();
    changeIdentity();
    copy();
    act(() => store.setCalculatorImport({ ...productA, id: 'product-C', name: 'Product C', sku: 'SKU-C' }));
    await waitFor(() => expect(store.profitEditingProductId).toBe('product-C'));
    await act(async () => finish({ data: {
      product: { ...productA, id: 'product-B', name: 'Product B', sku: 'SKU-B' }, productTemplates: [],
    } }));
    expect(store.profitEditingProductId).toBe('product-C');
    expect(store.profitGlobalInputs.sku).toBe('SKU-C');
    expect(store.profitNodes.MYR).toHaveLength(1);
  });

  it('prevents repeated submissions and does not rebind a reset form after an old request finishes', async () => {
    let finish!: (value: unknown) => void;
    mocks.api.post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await mount();
    changeIdentity();
    copy();
    copy();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('重置'));
    await act(async () => finish({ data: {
      product: { ...productA, id: 'product-B', name: 'Product B', sku: 'SKU-B' }, productTemplates: [],
    } }));
    expect(store.profitEditingProductId).toBeNull();
    expect(store.profitGlobalInputs.name).toBe('');
    expect(store.products).toHaveLength(2);
  });
});
