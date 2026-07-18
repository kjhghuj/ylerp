import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductList } from '../modules/ProductList';
import api from '../src/api';
import { zh } from '../locales/zh';
import {
  MAX_PRODUCT_IMPORT_FILE_BYTES,
  MAX_PRODUCT_IMPORT_RECORDS,
} from '../modules/profit/productSiteViewModel';

const productListState = vi.hoisted(() => ({ rates: { MYR: 1.67 }, activeTab: 'MY' }));

const addProduct = vi.fn();
const showToast = vi.fn();
const calculateProfit = vi.fn((..._args: unknown[]) => ({
  totalRevenue: 100,
  purchaseCost: 10,
  commission: 1,
  transactionFee: 1,
  serviceFee: 1,
  shippingFee: 1,
  adFee: 1,
  totalTax: 1,
  damage: 1,
  finalRevenueCNY: 10,
  finalRevenueLocal: 16.7,
  roi: 100,
  margin: 10,
}));

let products: any[] = [];

vi.mock('../src/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../modules/profit/calculateProfit', () => ({
  calculateProfit: (...args: unknown[]) => calculateProfit(...args),
}));

vi.mock('xlsx', () => ({
  writeFile: vi.fn(),
  utils: {
    json_to_sheet: vi.fn(),
    book_new: vi.fn(),
    book_append_sheet: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rates: productListState.rates }),
}));

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    products,
    deleteProduct: vi.fn(),
    addProduct,
    setCalculatorImport: vi.fn(),
    setCalculatorImportNodes: vi.fn(),
    productListActiveTab: productListState.activeTab,
    setProductListActiveTab: vi.fn(),
    productListCurrentPage: 1,
    setProductListCurrentPage: vi.fn(),
    strings: zh,
  }),
}));

const baseProduct = {
  id: 'product-1',
  name: 'Normalized Product',
  sku: 'SKU-1',
  country: 'MY',
  sites: ['MY'],
  cost: 10,
  productWeight: 100,
  supplierInvoice: 'no',
  supplierTaxPoint: 0,
};

const setApiResponses = (templates: unknown[] = []) => {
  (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/templates')) return Promise.resolve({ data: templates });
    return Promise.resolve({ data: { remoteFetched: false, items: [] } });
  });
};

describe('ProductList site input normalization', () => {
  beforeEach(() => {
    products = [];
    productListState.rates = { MYR: 1.67 };
    productListState.activeTab = 'MY';
    vi.clearAllMocks();
    setApiResponses();
  });

  it('renders numeric strings safely and defaults invalid historical fields without a toFixed crash', () => {
    products = [{
      ...baseProduct,
      siteData: {
        MY: {
          totalRevenue: '100.25',
          platformInfrastructureFee: 'invalid',
        },
      },
    }];

    expect(() => render(<ProductList onNavigate={vi.fn()} />)).not.toThrow();
    const row = screen.getByText('Normalized Product').closest('tr');
    expect(row).toBeTruthy();
    expect(within(row!).getByText('¥100.25')).toBeInTheDocument();
    expect(within(row!).getByText('15')).toBeInTheDocument();
  });

  it('preserves explicit adROI zero and includes legacy products with sites=[] via country fallback', () => {
    products = [{
      ...baseProduct,
      sites: [],
      siteData: { MY: { totalRevenue: '60', adROI: '0' } },
    }];

    render(<ProductList onNavigate={vi.fn()} />);

    const row = screen.getByText('Normalized Product').closest('tr');
    expect(row).toBeTruthy();
    expect(within(row!).getByText('0')).toBeInTheDocument();
  });

  it.each(['MY', 'SG'])(
    'does not show a country-less product with empty sites in the %s tab',
    (activeTab) => {
      productListState.activeTab = activeTab;
      products = [{
        ...baseProduct,
        country: null,
        sites: [],
      }];

      render(<ProductList onNavigate={vi.fn()} />);

      expect(screen.queryByText('Normalized Product')).not.toBeInTheDocument();
    },
  );

  it('uses the same normalized site inputs in product detail and standard profit calculation', async () => {
    products = [{
      ...baseProduct,
      siteData: {
        MY: {
          totalRevenue: '100.25',
          platformInfrastructureFee: '3.5',
          adROI: '0',
        },
      },
    }];
    setApiResponses([{
      id: 'link-1',
      name: 'Standard',
      country: 'MY',
      platform: 'Shopee',
      createdAt: '2026-01-01',
      data: {},
    }]);
    render(<ProductList onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByTitle('View'));
    expect(await screen.findByText('100.25 CNY')).toBeInTheDocument();
    expect(screen.getByText('3.50 CNY')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Standard/ }));

    await waitFor(() => expect(calculateProfit).toHaveBeenCalled());
    expect(calculateProfit.mock.calls.at(-1)?.[2]).toEqual(expect.objectContaining({
      totalRevenue: 100.25,
      platformInfrastructureFee: 3.5,
      adROI: 0,
    }));
  });

  it('derives the platform coupon percentage in product detail instead of showing a stored legacy rate', async () => {
    productListState.rates = { MYR: 2 };
    products = [{
      ...baseProduct,
      siteData: { MY: { totalRevenue: 50 } },
    }];
    setApiResponses([{
      id: 'link-coupon',
      name: 'Coupon template',
      country: 'MY',
      platform: 'Shopee',
      createdAt: '2026-01-01',
      data: {
        kind: 'standard',
        schemaVersion: 2,
        platformCoupon: 20,
        platformCouponRate: 99,
      },
    }]);
    render(<ProductList onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByTitle('View'));
    fireEvent.click(await screen.findByRole('button', { name: /Coupon template/ }));

    const rateLabel = screen.getAllByText(zh.productList.detail.platformCouponRate)
      .find(element => element.tagName === 'SPAN');
    expect(rateLabel?.parentElement).toHaveTextContent('20.00%');
    expect(rateLabel?.parentElement).not.toHaveTextContent('99.00%');
  });

  it('does not render a non-finite local price from a third-party exchange rate', () => {
    products = [{
      ...baseProduct,
      siteData: { MY: { totalRevenue: 100 } },
    }];
    productListState.rates = { MYR: Number.POSITIVE_INFINITY };

    render(<ProductList onNavigate={vi.fn()} />);

    const row = screen.getByText('Normalized Product').closest('tr');
    expect(row).toBeTruthy();
    expect(row).not.toHaveTextContent(/Infinity|NaN/);
  });

  it.each([true, -2, 0, '12abc'])(
    'does not calculate a local price from invalid exchange rate %j',
    (invalidRate) => {
      products = [{
        ...baseProduct,
        siteData: { MY: { totalRevenue: 100 } },
      }];
      productListState.rates = { MYR: invalidRate } as never;

      render(<ProductList onNavigate={vi.fn()} />);

      const row = screen.getByText('Normalized Product').closest('tr');
      expect(row).toBeTruthy();
      expect(row!.querySelectorAll('td')[6]).toHaveTextContent('-');
    },
  );

  it('calculates a local price from a strict positive numeric-string rate', () => {
    products = [{
      ...baseProduct,
      siteData: { MY: { totalRevenue: 100 } },
    }];
    productListState.rates = { MYR: '1.5' } as never;

    render(<ProductList onNavigate={vi.fn()} />);

    const row = screen.getByText('Normalized Product').closest('tr');
    expect(row).toBeTruthy();
    expect(row!.querySelectorAll('td')[6]).toHaveTextContent('150.00');
  });
});

describe('ProductList JSON import normalization', () => {
  beforeEach(() => {
    products = [];
    vi.clearAllMocks();
    setApiResponses();
  });

  const importFile = (file: File) => {
    render(<ProductList onNavigate={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  };
  const importJson = (records: unknown[]) => importFile(
    new File([JSON.stringify(records)], 'products.json', { type: 'application/json' }),
  );

  it('preserves explicit adROI zero and converts canonical numeric strings', async () => {
    importJson([{
      name: 'Imported',
      sku: 'IMP-1',
      country: 'MY',
      cost: '12.5',
      productWeight: '100',
      supplierTaxPoint: '0',
      vatRate: '1',
      corporateIncomeTaxRate: '5',
      sellerCouponType: 'fixed',
      sellerCoupon: '0',
      sellerCouponPlatformRatio: '0',
      adROI: '0',
      totalRevenue: '88.5',
      platformInfrastructureFee: '2',
      siteData: { MY: { adROI: '0', totalRevenue: '90' } },
    }]);

    await waitFor(() => expect(addProduct).toHaveBeenCalledTimes(1));
    expect(addProduct).toHaveBeenCalledWith(expect.objectContaining({
      cost: 12.5,
      adROI: 0,
      totalRevenue: 88.5,
      siteData: { MY: expect.objectContaining({ adROI: 0, totalRevenue: 90 }) },
    }));
  });

  it('prevalidates the entire batch and writes nothing when any record is invalid', async () => {
    importJson([
      {
        name: 'Valid first', sku: 'GOOD-1', country: 'MY', cost: 1, productWeight: 1,
        supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
      },
      {
        name: 'Invalid coupon', sku: 'BAD-1', country: 'MY', cost: 1, productWeight: 1,
        supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
        sellerCouponType: 'percent', sellerCoupon: 101,
      },
    ]);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      zh.productList.errors.importBatchValidationFailed,
      'error',
    ));
    expect(addProduct).not.toHaveBeenCalled();
  });

  it('does not write any record when siteData aliases collide', async () => {
    importJson([
      { name: 'Valid first', sku: 'GOOD-ALIAS', country: 'MY', cost: 1, productWeight: 1, supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
      {
        name: 'Collision', sku: 'BAD-ALIAS', country: 'MY', cost: 1, productWeight: 1,
        supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5,
        siteData: { MY: { totalRevenue: 10 }, MYR: { totalRevenue: 20 } },
      },
    ]);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      zh.productList.errors.importBatchValidationFailed,
      'error',
    ));
    expect(addProduct).not.toHaveBeenCalled();
  });

  it('rejects an oversized file before FileReader reads it', async () => {
    const file = new File(['[]'], 'oversized.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_PRODUCT_IMPORT_FILE_BYTES + 1 });
    const readSpy = vi.spyOn(FileReader.prototype, 'readAsText');

    importFile(file);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      zh.productList.errors.importFileTooLarge,
      'error',
    ));
    expect(readSpy).not.toHaveBeenCalled();
    expect(addProduct).not.toHaveBeenCalled();
  });

  it('rejects a parsed batch beyond the record limit without any write', async () => {
    importJson(Array.from({ length: MAX_PRODUCT_IMPORT_RECORDS + 1 }, (_, index) => ({
      name: `Product ${index}`,
      sku: `SKU-${index}`,
      country: 'MY',
      cost: 1,
      productWeight: 1,
      supplierTaxPoint: 0,
      vatRate: 1,
      corporateIncomeTaxRate: 5,
    })));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      zh.productList.errors.importTooManyRecords,
      'error',
    ));
    expect(addProduct).not.toHaveBeenCalled();
  });

  it('reports the successful count when a sequential API write fails partway', async () => {
    addProduct
      .mockResolvedValueOnce({ data: { id: 'saved-1' } })
      .mockRejectedValueOnce(new Error('network failed'));
    importJson([
      { name: 'First', sku: 'ONE', country: 'MY', cost: 1, productWeight: 1, supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
      { name: 'Second', sku: 'TWO', country: 'MY', cost: 1, productWeight: 1, supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
      { name: 'Third', sku: 'THREE', country: 'MY', cost: 1, productWeight: 1, supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
    ]);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      zh.productList.errors.importPartialFailure.replace('{count}', '1'),
      'error',
    ));
    expect(addProduct).toHaveBeenCalledTimes(2);
  });
});
