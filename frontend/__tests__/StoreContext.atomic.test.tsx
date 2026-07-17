import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreProvider, useStore } from '../StoreContext';
import type {
  AtomicProductTemplateCreateRequest,
  AtomicProductTemplateUpdateRequest,
} from '../modules/profit/productTemplateAtomic';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/api', () => ({ default: api }));

const productPayload = {
  name: 'Atomic product',
  sku: 'ATOMIC-1',
  country: 'MY' as const,
  sites: ['MY' as const],
  cost: 10,
  productWeight: 100,
  supplierTaxPoint: 0,
  supplierInvoice: 'no' as const,
  siteData: {},
};

const atomicRequest = {
  product: productPayload,
  templateMutations: [],
} satisfies AtomicProductTemplateCreateRequest;

const { sites: _sites, siteData: _siteData, ...updateProductPayload } = productPayload;
const atomicUpdateRequest = {
  product: updateProductPayload,
  templateMutations: [],
  sitePatch: {
    sites: ['MY' as const],
    siteData: { MY: {} },
  },
} satisfies AtomicProductTemplateUpdateRequest;

const Consumer = () => {
  const { products, saveProductWithTemplates } = useStore();
  return (
    <>
      <output aria-label="products">{
        products.map(product => `${product.id}:${product.name}`).join(',')
      }</output>
      <button
        type="button"
        onClick={() => { void saveProductWithTemplates(atomicRequest).catch(() => undefined); }}
      >
        Create atomically
      </button>
      <button
        type="button"
        onClick={() => {
          void saveProductWithTemplates(atomicUpdateRequest, 'existing').catch(() => undefined);
        }}
      >
        Update atomically
      </button>
    </>
  );
};

describe('StoreContext atomic product/template persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.get.mockResolvedValue({ data: [] });
  });

  it('appends the product only after the aggregate create response succeeds', async () => {
    let resolveRequest!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    render(<StoreProvider><Consumer /></StoreProvider>);
    await waitFor(() => expect(screen.getByLabelText('products')).toHaveTextContent(''));

    fireEvent.click(screen.getByRole('button', { name: 'Create atomically' }));
    expect(api.post).toHaveBeenCalledWith('/products/with-templates', atomicRequest);
    expect(screen.getByLabelText('products')).toHaveTextContent('');

    resolveRequest({
      data: {
        product: { id: 'created', ...productPayload },
        productTemplates: [],
      },
    });
    await waitFor(() => expect(screen.getByLabelText('products')).toHaveTextContent(
      'created:Atomic product',
    ));
  });

  it('replaces an existing product only on success and leaves state untouched on failure', async () => {
    api.get.mockImplementation((url: string) => Promise.resolve({
      data: url === '/products'
        ? [{ id: 'existing', ...productPayload, name: 'Before' }]
        : [],
    }));
    api.put.mockRejectedValueOnce(new Error('rolled back'));
    render(<StoreProvider><Consumer /></StoreProvider>);
    await waitFor(() => expect(screen.getByLabelText('products')).toHaveTextContent('existing:Before'));

    fireEvent.click(screen.getByRole('button', { name: 'Update atomically' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/products/existing/with-templates',
      atomicUpdateRequest,
    ));
    expect(screen.getByLabelText('products')).toHaveTextContent('existing:Before');

    api.put.mockResolvedValueOnce({
      data: {
        product: { id: 'existing', ...productPayload, name: 'After' },
        productTemplates: [],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update atomically' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('products')).toHaveTextContent('existing:After'));
  });
});
