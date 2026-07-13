import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductList } from '../modules/ProductList';
import api from '../src/api';

vi.mock('../src/api', () => ({
  default: {
    get: vi.fn(),
  },
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
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rates: { MYR: 1.67, PHP: 0.11, SGD: 5.26, IDR: 0, THB: 0.2 } }),
}));

const mockSetActiveTab = vi.fn();
const mockSetCurrentPage = vi.fn();

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    products: [
      {
        id: 'product-0',
        name: 'Low Stock Product',
        sku: 'ERP-SKU-LOW',
        country: 'MY',
        sites: ['MY'],
        cost: 8,
        productWeight: 210,
        supplierInvoice: 'no',
        supplierTaxPoint: 0,
        totalRevenue: 60,
        adROI: 11,
        siteData: { MY: { totalRevenue: 60, adROI: 11 } },
      },
      {
        id: 'product-1',
        name: 'Exact Product',
        sku: 'ERP-SKU-1',
        country: 'MY',
        sites: ['MY'],
        cost: 12,
        productWeight: 300,
        supplierInvoice: 'no',
        supplierTaxPoint: 0,
        totalRevenue: 100,
        adROI: 15,
        siteData: { MY: { totalRevenue: 100, adROI: 15 } },
      },
      {
        id: 'product-2',
        name: 'No YC Match',
        sku: 'ERP-SKU-NO-STOCK',
        country: 'MY',
        sites: ['MY'],
        cost: 9,
        productWeight: 200,
        supplierInvoice: 'no',
        supplierTaxPoint: 0,
        totalRevenue: 80,
        adROI: 12,
        siteData: { MY: { totalRevenue: 80, adROI: 12 } },
      },
      {
        id: 'product-3',
        name: 'PH Product',
        sku: 'PH-SKU',
        country: 'PH',
        sites: ['PH'],
        cost: 7,
        productWeight: 180,
        supplierInvoice: 'no',
        supplierTaxPoint: 0,
        totalRevenue: 70,
        adROI: 10,
        siteData: { PH: { totalRevenue: 70, adROI: 10 } },
      },
    ],
    deleteProduct: vi.fn(),
    addProduct: vi.fn(),
    setCalculatorImport: vi.fn(),
    setCalculatorImportNodes: vi.fn(),
    productListActiveTab: 'MY',
    setProductListActiveTab: mockSetActiveTab,
    productListCurrentPage: 1,
    setProductListCurrentPage: mockSetCurrentPage,
    strings: {
      profit: {
        matrix: {
          sites: {
            MY: 'Malaysia',
            PH: 'Philippines',
            SG: 'Singapore',
            ID: 'Indonesia',
            TH: 'Thailand',
          },
        },
      },
      productList: {
        title: '商品明细列表',
        searchPlaceholder: '搜索商品名称或SKU...',
        exportExcel: '导出 Excel',
        importJson: '导入 JSON',
        exportJson: '导出 JSON',
        loading: '加载中...',
        noProducts: '暂无商品数据',
        tabs: {
          ph: '菲律宾',
          my: '马来西亚',
          sg: '新加坡',
          id: '印尼',
          th: '泰国',
        },
        table: {
          name: '商品名称',
          sku: 'SKU',
          cost: '成本',
          weight: '重量',
          priceCNY: '价格(CNY)',
          priceLocal: '价格(本土)',
          adROI: '广告ROI',
          action: '操作',
        },
        pagination: {
          showing: '显示',
          to: '至',
          of: '共',
          items: '项',
        },
        modals: {
          tabProduct: '商品',
        },
        errors: {},
      },
    },
  }),
}));

describe('ProductList YC stock column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        site: 'MY',
        remoteFetched: true,
        warehouseCodes: ['001'],
        warnings: [],
        items: [
          {
            sku: 'ERP-SKU-1',
            available: 7,
            inventory: 10,
            occupy: 2,
            unshipped: 1,
            warehouseCodes: ['001'],
          },
          {
            sku: 'ERP-SKU-LOW',
            available: 2,
            inventory: 4,
            occupy: 1,
            unshipped: 1,
            warehouseCodes: ['001'],
          },
        ],
      },
    });
  });

  const productNamesInOrder = () =>
    Array.from(document.querySelectorAll('tbody tr'))
      .map(row => row.querySelector('td')?.textContent?.trim())
      .filter(Boolean);

  it('shows current-site YC warehouse stock in the product table', async () => {
    render(<ProductList onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/restock-v2/stock-snapshot', {
        params: { site: 'MY' },
      });
    });

    expect(screen.getByText('元仓库存')).toBeInTheDocument();

    const matchedRow = screen.getByText('Exact Product').closest('tr');
    expect(matchedRow).toBeTruthy();
    expect(within(matchedRow!).getByText('可用 7')).toBeInTheDocument();
    expect(within(matchedRow!).getByText('库存 10')).toBeInTheDocument();
    expect(within(matchedRow!).getByText('001')).toBeInTheDocument();

    const unmatchedRow = screen.getByText('No YC Match').closest('tr');
    expect(unmatchedRow).toBeTruthy();
    expect(within(unmatchedRow!).getByText('未匹配元仓')).toBeInTheDocument();
  });

  it('sorts products by current-site YC available stock from the column header', async () => {
    render(<ProductList onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('可用 7')).toBeInTheDocument();
    });

    expect(productNamesInOrder()).toEqual([
      'Low Stock Product',
      'Exact Product',
      'No YC Match',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /元仓库存排序/ }));

    expect(productNamesInOrder()).toEqual([
      'Exact Product',
      'Low Stock Product',
      'No YC Match',
    ]);
    expect(screen.getByRole('button', { name: '元仓库存排序：高到低' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '元仓库存排序：高到低' }));

    expect(productNamesInOrder()).toEqual([
      'Low Stock Product',
      'Exact Product',
      'No YC Match',
    ]);
    expect(screen.getByRole('button', { name: '元仓库存排序：低到高' })).toBeInTheDocument();
  });
});
