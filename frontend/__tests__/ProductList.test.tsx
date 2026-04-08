import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockProducts = [
  {
    id: 'p1', name: '商品A', sku: 'SKU001', country: 'MY',
    totalRevenue: 100, cost: 50, productWeight: 200, firstWeight: 50,
    baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
    sellerCoupon: 5, sellerCouponType: 'fixed', sellerCouponPlatformRatio: 0,
    platformCoupon: 0, platformCouponRate: 0, platformCommissionRate: 0.1,
    transactionFeeRate: 0.02, damageReturnRate: 0.01, adROI: 3,
    vatRate: 0.06, corporateIncomeTaxRate: 0.1, supplierTaxPoint: 0,
    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
    platformInfrastructureFee: 0, warehouseOperationFee: 0,
    supplierInvoice: 'no', shipping: 0, fees: 0, marketing: 0, taxes: 0,
    profit: 35, margin: 0.35, costMargin: 0.7,
  },
  {
    id: 'p2', name: '商品B', sku: 'SKU002', country: 'SG',
    totalRevenue: 80, cost: 40, productWeight: 150, firstWeight: 50,
    baseShippingFee: 8, extraShippingFee: 1.5, crossBorderFee: 0.5,
    sellerCoupon: 3, sellerCouponType: 'percent', sellerCouponPlatformRatio: 50,
    platformCoupon: 2, platformCouponRate: 0.05, platformCommissionRate: 0.08,
    transactionFeeRate: 0.02, damageReturnRate: 0.02, adROI: 4,
    vatRate: 0.07, corporateIncomeTaxRate: 0.1, supplierTaxPoint: 0.13,
    mdvServiceFeeRate: 0.01, fssServiceFeeRate: 0.02, ccbServiceFeeRate: 0.01,
    platformInfrastructureFee: 1, warehouseOperationFee: 2,
    supplierInvoice: 'yes', shipping: 0, fees: 0, marketing: 0, taxes: 0,
    profit: 20, margin: 0.25, costMargin: 0.5,
  },
];

const mockStrings = {
  productList: {
    title: '商品明细',
    searchPlaceholder: '搜索商品名称或SKU...',
    exportExcel: '导出Excel',
    table: {
      name: '名称', sku: 'SKU', price: '售价', cost: '成本',
      weight: '重量', sellerCoupon: '卖家券', commission: '佣金',
      adROI: '广告ROI', baseShipping: '首重运费', action: '操作',
      platformCommission: '佣金', transactionFee: '交易费',
      vatRate: '增值税', corpTaxRate: '企业所得税',
      invoice: '发票', invoiceYes: '已开票', invoiceNo: '未开票',
      crossBorder: '跨境费', infraFee: '基础设施费', warehouseFee: '仓储费',
    },
    tabs: { ph: '菲律宾', my: '马来西亚', sg: '新加坡', id: '印尼', th: '泰国' },
    pagination: { showing: '显示', to: '至', of: '共', items: '条' },
    modals: {
      detailTitle: '商品详情',
      importCalculator: '导入至利润计算器',
      tabProduct: '商品数据',
      noTemplates: '暂无关联模版',
      noTemplatesHint: '在利润计算器中保存商品时，会自动创建关联模版',
    },
    detail: {
      baseInfo: '基本信息', priceCost: '售价与成本', coupon: '优惠券',
      platformRates: '平台费率', taxAd: '税务与广告', fees: '费用',
      serviceRates: '服务费率', name: '名称', sku: 'SKU', country: '站点',
      price: '售价', cost: '成本', weight: '重量', firstWeight: '首重',
      sellerCoupon: '卖家优惠券', couponType: '优惠券类型', percentType: '比例',
      fixedType: '固定', couponPlatformRatio: '平台出资比例',
      platformCoupon: '平台优惠券', platformCouponRate: '平台优惠券比例',
      commission: '佣金率', transactionFee: '交易费率', damageReturn: '货损退货率',
      invoice: '供应商发票', invoiceYes: '已开票', invoiceNo: '未开票',
      taxPoint: '税点', vatRate: '增值税率', corpTaxRate: '企业所得税率',
      adROI: '广告ROI', baseShipping: '首重运费', extraShipping: '续重运费',
      crossBorder: '跨境费', infraFee: '平台基础设施费', warehouseFee: '仓储操作费',
      mdvFee: 'MDV服务费率', fssFee: 'FSS服务费率', ccbFee: 'CCB服务费率',
    },
  },
};

const mockDeleteProduct = vi.fn();
const mockSetCalculatorImport = vi.fn();
const mockOnNavigate = vi.fn();

const { mockApiGet, mockUseStore } = vi.hoisted(() => {
  const mockApiGet = vi.fn();
  const mockUseStore = () => ({
    products: mockProducts,
    deleteProduct: mockDeleteProduct,
    setCalculatorImport: mockSetCalculatorImport,
    strings: mockStrings,
  });
  return { mockApiGet, mockUseStore };
});

vi.mock('../StoreContext', () => ({
  useStore: mockUseStore,
}));

vi.mock('../src/api', () => ({
  default: { get: mockApiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

import { ProductList } from '../modules/ProductList';

describe('ProductList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: [] });
  });

  it('should render title and search input', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    expect(screen.getByText('商品明细')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索商品名称或SKU...')).toBeInTheDocument();
  });

  it('should render country tabs', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    expect(screen.getByText('菲律宾')).toBeInTheDocument();
    expect(screen.getByText('马来西亚')).toBeInTheDocument();
    expect(screen.getByText('新加坡')).toBeInTheDocument();
    expect(screen.getByText('印尼')).toBeInTheDocument();
    expect(screen.getByText('泰国')).toBeInTheDocument();
  });

  it('should show MY products by default', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.queryByText('商品B')).not.toBeInTheDocument();
  });

  it('should filter products by country tab', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getByText('新加坡'));
    expect(screen.getByText('商品B')).toBeInTheDocument();
    expect(screen.queryByText('商品A')).not.toBeInTheDocument();
  });

  it('should filter products by search term', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    const input = screen.getByPlaceholderText('搜索商品名称或SKU...');
    fireEvent.change(input, { target: { value: 'SKU001' } });
    expect(screen.getByText('商品A')).toBeInTheDocument();
  });

  it('should show no results when search does not match', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    const input = screen.getByPlaceholderText('搜索商品名称或SKU...');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.getByText('No products found.')).toBeInTheDocument();
  });

  it('should open detail modal on double click', async () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    const row = screen.getByText('商品A').closest('tr');
    fireEvent.doubleClick(row!);

    await waitFor(() => {
      expect(screen.getByText('导入至利润计算器')).toBeInTheDocument();
    });
  });

  it('should open detail modal on view button click', async () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    const viewButtons = screen.getAllByTitle('View');
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('商品数据')).toBeInTheDocument();
    });
  });

  it('should fetch linked templates when modal opens', async () => {
    const mockTemplates = [
      { id: 't1', name: 'Shopee模版', country: 'MYR', platform: 'shopee', data: { baseShippingFee: 10 }, createdAt: '2026-04-08' },
    ];
    mockApiGet.mockResolvedValue({ data: mockTemplates });

    render(<ProductList onNavigate={mockOnNavigate} />);
    const viewButtons = screen.getAllByTitle('View');
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/templates?type=profit&productId=p1');
    });

    await waitFor(() => {
      expect(screen.getByText('Shopee模版')).toBeInTheDocument();
    });
  });

  it('should show product data sections in modal', async () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getAllByTitle('View')[0]);

    await waitFor(() => {
      expect(screen.getByText('基本信息')).toBeInTheDocument();
      expect(screen.getByText('售价与成本')).toBeInTheDocument();
      expect(screen.getByText('平台费率')).toBeInTheDocument();
    });
  });

  it('should call setCalculatorImport and navigate on import button click', async () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getAllByTitle('View')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('导入至利润计算器').length).toBeGreaterThan(0);
    });

    const importButtons = screen.getAllByText('导入至利润计算器');
    fireEvent.click(importButtons[0]);

    expect(mockSetCalculatorImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: '商品A' })
    );
    expect(mockOnNavigate).toHaveBeenCalledWith('profit');
  });

  it('should call deleteProduct when delete is confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductList onNavigate={mockOnNavigate} />);

    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this product?');
    expect(mockDeleteProduct).toHaveBeenCalledWith('p1');
  });

  it('should not delete when confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProductList onNavigate={mockOnNavigate} />);

    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(mockDeleteProduct).not.toHaveBeenCalled();
  });

  it('should call quick import on arrow button click', () => {
    render(<ProductList onNavigate={mockOnNavigate} />);

    const importButtons = screen.getAllByTitle('Import to Calculator');
    fireEvent.click(importButtons[0]);

    expect(mockSetCalculatorImport).toHaveBeenCalledWith(mockProducts[0]);
    expect(mockOnNavigate).toHaveBeenCalledWith('profit');
  });

  it('should display product SKU and country in detail modal', async () => {
    render(<ProductList onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getAllByTitle('View')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('SKU001').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('MY').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should switch to template tab when template tab is clicked', async () => {
    const mockTemplates = [
      { id: 't1', name: 'Shopee模版', country: 'MYR', platform: 'shopee', data: { baseShippingFee: 10, platformCommissionRate: 0.08 }, createdAt: '2026-04-08' },
      { id: 't2', name: 'Lazada模版', country: 'MYR', platform: 'lazada', data: { baseShippingFee: 12, platformCommissionRate: 0.06 }, createdAt: '2026-04-08' },
    ];
    mockApiGet.mockResolvedValue({ data: mockTemplates });

    render(<ProductList onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getAllByTitle('View')[0]);

    await waitFor(() => {
      expect(screen.getByText('Shopee模版')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lazada模版'));

    await waitFor(() => {
      expect(screen.getByText('Shopee模版').classList).not.toContain('border-indigo-600');
    });
  });
});
