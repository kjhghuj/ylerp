import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAddProduct, mockUpdateProduct, mockApiPost, mockShowToast,
  mockSetProfitEditingProductId, mockStoreReturn,
} = vi.hoisted(() => {
  const storeReturn: any = {
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    products: [
      { id: 'existing-1', name: 'Existing Product', sku: 'SKU001', sites: ['MY'], country: 'MY' },
    ],
    strings: {
      profit: {
        title: '利润计算',
        subtitle: '精准计算单品各项成本与净利',
        inputs: {
          name: '商品名称', sku: 'SKU', totalRevenue: '总收入', cost: '成本',
          weight: '重量', sellerCoupon: '卖家优惠券', couponFixed: '固定',
          couponPercent: '比例', couponPlatformRatio: '平台出资比例',
          platformCoupon: '平台优惠券', platformCouponRate: '平台优惠券比例',
          commission: '佣金', transFee: '手续费', damageRate: '货损率',
          baseShipping: '首重运费', firstWeight: '首重', extraShipping: '续重运费',
          crossBorder: '跨境运费', mdvRate: 'MDV', fssRate: 'FSS', ccbRate: 'CCB',
          infraFee: '基础设施费', adRoi: '广告ROI', vat: '增值税', corpTax: '企业所得税',
          supplierTax: '供应商税点', supplierInvoice: '发票', warehouseFee: '仓储费',
          invoiceYes: '是', invoiceNo: '否',
          platformCommissionRate: '佣金率', transactionFeeRate: '手续费率',
          damageReturnRate: '货损退货率', baseShippingFee: '首重运费',
          extraShippingFee: '续重运费', crossBorderFee: '跨境运费',
          mdvServiceFeeRate: 'MDV服务费率', fssServiceFeeRate: 'FSS服务费率',
          ccbServiceFeeRate: 'CCB服务费率', platformInfrastructureFee: '基础设施费',
          adROI: '广告ROI', vatRate: '增值税率', corporateIncomeTaxRate: '企业所得税率',
          warehouseOperationFee: '仓储费', lastMileFee: '尾程物流费',
        },
        results: {
          commission: '佣金', vat: '增值税', transFee: '手续费', corpTax: '所得税',
          serviceFee: '服务费', shipping: '物流费', platformFee: '平台费',
          totalTax: '税费', adFee: '广告费', warehouse: '仓储费', damage: '货损',
        },
        actions: {
          save: '保存', alert: '请输入产品名称', success: '已保存',
          calculate: '计算', saved: '已保存至商品库', updated: '商品库已更新',
        },
        templates: {
          btn: '模版', title: '模版', save: '保存', placeholder: '名称',
          empty: '暂无', use: '使用', delete: '删除', manage: '管理',
          saved: '已保存', loaded: '已加载',
        },
        matrix: {
          title: '多站点利润计算矩阵', subtitle: 'MATRIX',
          addNode: '添加节点', globalBase: '全局参数', globalBaseDesc: 'PARAMS',
          nodeEmpty: '空', nodeEmptyDesc: '添加节点', useTemplate: '使用模版',
          createBlank: '创建空白', newNode: '添加', templateName: '模版名',
          netProfitCNY: '预估净利润', roi: 'ROI', margin: '利润率',
          saveToLibrary: '存入商品库', updateLibrary: '更新商品库',
          saveTemplate: '保存',
          sites: { MYR: '马来西亚', PHP: '菲律宾', SGD: '新加坡', THB: '泰国', IDR: '印尼' },
          platforms: { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', other: '其他' },
        },
        currency: {
          title: '汇率', select: '币种', refresh: '刷新', rateLabel: '汇率',
          myr: 'MYR', php: 'PHP', sgd: 'SGD', thb: 'THB', idr: 'IDR', cny: 'CNY',
        },
        sections: {
          basic: '基本', coupons: '优惠券', logistics: '物流',
          platform: '平台', service: '服务', tax: '税务',
        },
      },
    },
    calculatorImport: null,
    setCalculatorImport: vi.fn(),
    calculatorImportNodes: [],
    setCalculatorImportNodes: vi.fn(),
    profitGlobalInputs: {
      name: '测试商品', sku: 'SKU-TEST', totalRevenue: 100, purchaseCost: 50, productWeight: 500,
      firstWeight: 50, supplierTaxPoint: 0, supplierInvoice: 'no',
      sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
      adROI: 10, vatRate: 6, corporateIncomeTaxRate: 10, platformInfrastructureFee: 0,
    },
    setProfitGlobalInputs: vi.fn(),
    profitSiteCountry: 'MYR',
    setProfitSiteCountry: vi.fn(),
    profitNodes: {
      MYR: [{
        id: 'node-1', platform: 'shopee', country: 'MYR', name: 'Test Node',
        data: {
          baseShippingFee: 10, extraShippingFee: 2, crossBorderFee: 1,
          platformCommissionRate: 8, transactionFeeRate: 2,
          platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
          mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
          warehouseOperationFee: 0, lastMileFee: 0,
        },
      }],
    },
    setProfitNodes: vi.fn(),
    profitEditingProductId: null,
    setProfitEditingProductId: vi.fn(),
  };
  return {
    mockAddProduct: storeReturn.addProduct,
    mockUpdateProduct: storeReturn.updateProduct,
    mockApiPost: vi.fn(),
    mockShowToast: vi.fn(),
    mockSetProfitEditingProductId: storeReturn.setProfitEditingProductId,
    mockStoreReturn: storeReturn,
  };
});

vi.mock('../StoreContext', () => ({
  useStore: () => mockStoreReturn,
}));

vi.mock('../src/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: mockApiPost,
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../platformConfig', () => ({
  PLATFORMS: {
    shopee: { name: 'Shopee', colors: { bg: 'bg-orange-50', border: 'border-orange-200', gradient: 'from-orange-500 to-red-500' }, fields: { base: ['platformCommissionRate', 'transactionFeeRate', 'damageReturnRate'], shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'], services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'warehouseOperationFee'] } },
    lazada: { name: 'Lazada', colors: { bg: 'bg-blue-50', border: 'border-blue-200', gradient: 'from-blue-500 to-purple-500' }, fields: { base: ['platformCommissionRate', 'transactionFeeRate', 'damageReturnRate'], shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'], services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'warehouseOperationFee'] } },
    tiktok: { name: 'TikTok', colors: { bg: 'bg-slate-50', border: 'border-slate-200', gradient: 'from-slate-600 to-slate-800' }, fields: { base: ['platformCommissionRate', 'transactionFeeRate', 'damageReturnRate'], shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'], services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'warehouseOperationFee'] } },
    other: { name: 'Other', colors: { bg: 'bg-slate-50', border: 'border-slate-200', gradient: 'from-slate-500 to-slate-700' }, fields: { base: ['platformCommissionRate', 'transactionFeeRate', 'damageReturnRate'], shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'], services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'warehouseOperationFee'] } },
  },
  PlatformType: {},
}));

vi.mock('../components/CalcInputs', () => ({
  NumberInput: (props: any) => <input data-testid={`input-${props.name}`} value={props.value || ''} onChange={props.onChange} />,
  TextInput: (props: any) => <input data-testid={`input-${props.name}`} value={props.value || ''} onChange={props.onChange} />,
  SelectInput: (props: any) => <select data-testid={`input-${props.name}`} value={props.value || ''} onChange={props.onChange}>{props.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ProfitCalculator } from '../modules/ProfitCalculator';

describe('ProfitCalculator - Save Product', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddProduct.mockResolvedValue({ id: 'new-product-1', name: 'Test Product' });
    mockUpdateProduct.mockResolvedValue({ id: 'existing-1', name: 'Updated Product' });
    mockApiPost.mockResolvedValue({ data: { id: 'tpl-1', name: 'Template' } });
  });

  it('should render the profit calculator', async () => {
    render(<ProfitCalculator />);
    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });
  });

  it('should show validation error when name is missing', async () => {
    const originalName = mockStoreReturn.profitGlobalInputs.name;
    const originalSku = mockStoreReturn.profitGlobalInputs.sku;
    mockStoreReturn.profitGlobalInputs.name = '';
    mockStoreReturn.profitGlobalInputs.sku = '';

    render(<ProfitCalculator />);
    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('存入商品库');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please enter Name and SKU', 'error');
    });
    expect(mockAddProduct).not.toHaveBeenCalled();

    mockStoreReturn.profitGlobalInputs.name = originalName;
    mockStoreReturn.profitGlobalInputs.sku = originalSku;
  });

  it('should call addProduct for new product with valid data', async () => {
    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('存入商品库');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockAddProduct).toHaveBeenCalled();
    });

    const callArg = mockAddProduct.mock.calls[0][0];
    expect(callArg.name).toBe('测试商品');
    expect(callArg.sku).toBe('SKU-TEST');
    expect(callArg.country).toBe('MY');
    expect(callArg.sites).toEqual(['MY']);
  });

  it('should pass lastMileFee in product data', async () => {
    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockAddProduct).toHaveBeenCalled();
    });

    const callArg = mockAddProduct.mock.calls[0][0];
    expect(callArg).toHaveProperty('lastMileFee');
    expect(callArg).toHaveProperty('baseShippingFee');
    expect(callArg).toHaveProperty('platformCommissionRate');
  });

  it('should reset editingProductId after successful save', async () => {
    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockSetProfitEditingProductId).toHaveBeenCalledWith(null);
    });
  });

  it('should show saved toast for new product', async () => {
    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('已保存至商品库');
    });
  });

  it('should not reset editingProductId when save fails', async () => {
    mockAddProduct.mockRejectedValue(new Error('Network error'));

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save product', 'error');
    });

    expect(mockSetProfitEditingProductId).not.toHaveBeenCalledWith(null);
  });

  it('should not save templates when product save fails', async () => {
    mockAddProduct.mockRejectedValue(new Error('Network error'));

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save product', 'error');
    });

    expect(mockApiPost).not.toHaveBeenCalledWith('/templates', expect.anything());
  });

  it('should save templates after successful product save', async () => {
    mockAddProduct.mockResolvedValue({ id: 'new-1', name: 'Test' });
    mockApiPost.mockResolvedValue({ data: { id: 'tpl-1' } });

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/templates', expect.objectContaining({
        productId: 'new-1',
      }));
    });
  });

  it('should handle addProduct returning no ID', async () => {
    mockAddProduct.mockResolvedValue({});

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save product: no ID returned', 'error');
    });
  });

  it('should not reset editingProductId when addProduct returns no ID', async () => {
    mockAddProduct.mockResolvedValue({});

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(screen.getByText('多站点利润计算矩阵')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('存入商品库'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save product: no ID returned', 'error');
    });

    expect(mockSetProfitEditingProductId).not.toHaveBeenCalledWith(null);
  });
});

describe('ProfitCalculator - Import Nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreReturn.profitSiteCountry = 'MYR';
    mockStoreReturn.profitNodes = { MYR: [] };
    mockStoreReturn.calculatorImport = null;
    mockStoreReturn.calculatorImportNodes = [];
  });

  it('should place SGD nodes under SGD key in profitNodes, not MYR', async () => {
    mockStoreReturn.calculatorImport = {
      id: 'prod-sg-1', name: 'SG Product', sku: 'SKU-SG',
      country: 'SG', totalRevenue: 100, cost: 50,
      productWeight: 500, firstWeight: 50,
      baseShippingFee: 5, extraShippingFee: 1, crossBorderFee: 0,
      platformCommissionRate: 8, transactionFeeRate: 2,
      platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 1,
      mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
      warehouseOperationFee: 0, lastMileFee: 0,
    };
    mockStoreReturn.calculatorImportNodes = [
      { name: 'SG-Shopee', country: 'SGD', platform: 'shopee', data: { baseShippingFee: 10 } },
    ];

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
    });

    const setProfitNodesCalls = mockStoreReturn.setProfitNodes.mock.calls;
    const lastCall = setProfitNodesCalls[setProfitNodesCalls.length - 1];
    const updaterFn = lastCall[0];
    const result = updaterFn({ MYR: [] });

    expect(result).toHaveProperty('SGD');
    expect(result.SGD).toHaveLength(1);
    expect(result.SGD[0].country).toBe('SGD');
    expect(result.SGD[0].data.baseShippingFee).toBe(10);
  });

  it('should group multi-country nodes into separate keys', async () => {
    mockStoreReturn.calculatorImport = {
      id: 'prod-multi', name: 'Multi Product', sku: 'SKU-M',
      country: 'MY', totalRevenue: 100, cost: 50,
      productWeight: 500, firstWeight: 50,
      baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
      platformCommissionRate: 0, transactionFeeRate: 0,
      platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0,
      mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
      warehouseOperationFee: 0, lastMileFee: 0,
    };
    mockStoreReturn.calculatorImportNodes = [
      { name: 'MYR-Shopee', country: 'MYR', platform: 'shopee', data: { baseShippingFee: 10 } },
      { name: 'MYR-Lazada', country: 'MYR', platform: 'lazada', data: { baseShippingFee: 20 } },
      { name: 'SGD-Shopee', country: 'SGD', platform: 'shopee', data: { baseShippingFee: 30 } },
    ];

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
    });

    const lastCall = mockStoreReturn.setProfitNodes.mock.calls[mockStoreReturn.setProfitNodes.mock.calls.length - 1];
    const result = lastCall[0]({});

    expect(result.MYR).toHaveLength(2);
    expect(result.SGD).toHaveLength(1);
    expect(result.SGD[0].data.baseShippingFee).toBe(30);
  });

  it('should set siteCountry to SGD when importing SG product', async () => {
    mockStoreReturn.calculatorImport = {
      id: 'prod-sg-2', name: 'SG Product', sku: 'SKU-SG2',
      country: 'SG', totalRevenue: 100, cost: 50,
      productWeight: 500, firstWeight: 50,
      baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
      platformCommissionRate: 0, transactionFeeRate: 0,
      platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0,
      mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
      warehouseOperationFee: 0, lastMileFee: 0,
    };

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(mockStoreReturn.setProfitSiteCountry).toHaveBeenCalledWith('SGD');
    });
  });

  it('should clear calculatorImportNodes after import', async () => {
    mockStoreReturn.calculatorImport = {
      id: 'prod-sg-3', name: 'SG Product', sku: 'SKU-SG3',
      country: 'SG', totalRevenue: 100, cost: 50,
      productWeight: 500, firstWeight: 50,
      baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
      platformCommissionRate: 0, transactionFeeRate: 0,
      platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0,
      mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
      warehouseOperationFee: 0, lastMileFee: 0,
    };
    mockStoreReturn.calculatorImportNodes = [
      { name: 'SGD-Shopee', country: 'SGD', platform: 'shopee', data: { baseShippingFee: 10 } },
    ];

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(mockStoreReturn.setCalculatorImportNodes).toHaveBeenCalledWith([]);
    });
  });

  it('should create single node under correct currency when no importNodes', async () => {
    mockStoreReturn.calculatorImport = {
      id: 'prod-th-1', name: 'TH Product', sku: 'SKU-TH',
      country: 'TH', totalRevenue: 100, cost: 50,
      productWeight: 500, firstWeight: 50,
      baseShippingFee: 15, extraShippingFee: 3, crossBorderFee: 2,
      platformCommissionRate: 5, transactionFeeRate: 1,
      platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0,
      mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
      warehouseOperationFee: 0, lastMileFee: 0,
    };
    mockStoreReturn.calculatorImportNodes = [];

    render(<ProfitCalculator />);

    await waitFor(() => {
      expect(mockStoreReturn.setProfitNodes).toHaveBeenCalled();
    });

    const lastCall = mockStoreReturn.setProfitNodes.mock.calls[mockStoreReturn.setProfitNodes.mock.calls.length - 1];
    const result = lastCall[0]({});

    expect(result).toHaveProperty('THB');
    expect(result.THB).toHaveLength(1);
    expect(result.THB[0].country).toBe('THB');
    expect(result.THB[0].data.baseShippingFee).toBe(15);
  });
});
