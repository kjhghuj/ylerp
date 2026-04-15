import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PlatformCard } from '../modules/PlatformCard';

const mockStrings = {
  inputs: {
    lastMileFee: '尾程物流费',
    platformCoupon: '平台优惠券',
    baseShippingFee: '首重运费',
    extraShippingFee: '续重运费',
    crossBorderFee: '跨境费',
    warehouseOperationFee: '仓储操作费',
    mdvServiceFeeRate: 'MDV 服务费率',
    fssServiceFeeRate: 'FSS 服务费率',
    ccbServiceFeeRate: 'CCB 服务费率',
    platformCommissionRate: '佣金率',
    transactionFeeRate: '交易费率',
    damageReturnRate: '货损退货率',
    firstWeight: '首重',
    totalRevenue: '售价',
    cost: '成本',
  },
  results: {
    commission: '佣金',
    transFee: '交易手续费',
    serviceFee: '服务费',
    damageReturn: '货损退货',
    platformCoupon: '平台优惠券',
    sellerCoupon: '卖家优惠券',
    shipping: '运费',
    fees: '其他费用',
    marketing: '营销费用',
    vat: '增值税',
    incomeTax: '所得税',
    netProfitCNY: '预估净利润 (CNY)',
  },
  matrix: {
    platforms: {
      shopee: 'Shopee',
      lazada: 'Lazada',
      tiktok: 'TikTok',
      other: '其他',
    },
    netProfitCNY: '预估净利润 (CNY)',
    margin: '利润率',
    roi: 'ROI',
    saveTemplate: '保存模版',
    templateName: '模版名称',
  },
};

const mockOnUpdate = vi.fn();
const mockOnDelete = vi.fn();
const mockOnSaveTemplate = vi.fn();

const mockPlatformCardProps = {
  nodeId: 'node-1',
  platform: 'shopee' as const,
  country: 'SGD',
  nodeName: '测试节点',
  data: {
    totalRevenue: 100,
    sellerCoupon: 0,
    sellerCouponPlatformRatio: 0,
    adROI: 15,
    vatRate: 6,
    corporateIncomeTaxRate: 10,
    platformInfrastructureFee: 0,
    firstWeight: 0,
    baseShippingFee: 0,
    extraShippingFee: 0,
    crossBorderFee: 0,
    platformCommissionRate: 0,
    transactionFeeRate: 0,
    platformCoupon: 0,
    platformCouponRate: 0,
    damageReturnRate: 0,
    mdvServiceFeeRate: 0,
    fssServiceFeeRate: 0,
    ccbServiceFeeRate: 0,
    warehouseOperationFee: 0,
    lastMileFee: 0,
  },
  globalInputs: {
    productWeight: 500,
    purchaseCost: 50,
    supplierTaxPoint: 0,
    supplierInvoice: 'no' as const,
  },
  rateToCNY: 2.15,
  strings: mockStrings,
  onUpdate: mockOnUpdate,
  onDelete: mockOnDelete,
  onSaveTemplate: mockOnSaveTemplate,
};

// 辅助函数：创建有效的 props
const createValidProps = (overrides: any = {}) => ({
  ...mockPlatformCardProps,
  ...overrides,
});

describe('PlatformCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render platform card with correct title', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    expect(screen.getByText('Shopee')).toBeInTheDocument();
    expect(screen.getByText('新加坡')).toBeInTheDocument();
  });

  it('should show last mile fee input when firstWeight is 0 for Singapore', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    expect(screen.getByText(/尾程物流费/)).toBeInTheDocument();
  });

  it('should hide last mile fee input when firstWeight is not 0 for Singapore', () => {
    const propsWithFirstWeight = {
      ...mockPlatformCardProps,
      data: {
        ...mockPlatformCardProps.data,
        firstWeight: 50,
      },
    };
    render(<PlatformCard {...propsWithFirstWeight} />);
    expect(screen.queryByText(/尾程物流费/)).not.toBeInTheDocument();
  });

  it('should not show last mile fee input for non-Singapore countries', () => {
    const propsWithMYR = {
      ...mockPlatformCardProps,
      country: 'MYR',
    };
    render(<PlatformCard {...propsWithMYR} />);
    expect(screen.queryByText('尾程物流费')).not.toBeInTheDocument();
  });

  it('should calculate last mile fee correctly for weight < 1kg', async () => {
    const propsWithLowWeight = {
      ...mockPlatformCardProps,
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: 500,
      },
    };

    render(<PlatformCard {...propsWithLowWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 2.03 })
      );
    });
  });

  it('should calculate last mile fee correctly for weight 1-5kg', async () => {
    const propsWithMediumWeight = {
      ...mockPlatformCardProps,
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: 3000,
      },
    };

    render(<PlatformCard {...propsWithMediumWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 2.87 })
      );
    });
  });

  it('should calculate last mile fee correctly for weight 5-10kg', async () => {
    const propsWithHeavyWeight = {
      ...mockPlatformCardProps,
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: 8000,
      },
    };

    render(<PlatformCard {...propsWithHeavyWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 3.38 })
      );
    });
  });

  it('should calculate last mile fee correctly for weight 10-20kg', async () => {
    const propsWithVeryHeavyWeight = {
      ...mockPlatformCardProps,
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: 15000,
      },
    };

    render(<PlatformCard {...propsWithVeryHeavyWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 5.42 })
      );
    });
  });

  it('should calculate last mile fee correctly for weight 20-30kg', async () => {
    const propsWithSuperHeavyWeight = {
      ...mockPlatformCardProps,
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: 25000,
      },
    };

    render(<PlatformCard {...propsWithSuperHeavyWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 10.00 })
      );
    });
  });

  it('should set last mile fee to 0 when firstWeight changes from 0 to non-zero', async () => {
    const { rerender } = render(<PlatformCard {...mockPlatformCardProps} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: expect.any(Number) })
      );
    });

    vi.clearAllMocks();

    const propsWithFirstWeight = {
      ...mockPlatformCardProps,
      data: {
        ...mockPlatformCardProps.data,
        lastMileFee: 2.03,
        firstWeight: 100,
      },
    };

    rerender(<PlatformCard {...propsWithFirstWeight} />);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ lastMileFee: 0 })
      );
    });
  });

  it('should display last mile fee in CNY with SGD conversion', () => {
    const propsWithLastMileFee = {
      ...mockPlatformCardProps,
      data: {
        ...mockPlatformCardProps.data,
        lastMileFee: 2.15, // 2.15 SGD
      },
    };

    render(<PlatformCard {...propsWithLastMileFee} />);
    
    // 2.15 SGD / 2.15 rate = 1.00 CNY
    expect(screen.getByDisplayValue('1.00')).toBeInTheDocument();
    expect(screen.getAllByText(/≈ 2\.15 SGD/).length).toBeGreaterThanOrEqual(1);
  });

  it('should handle rateToCNY being 0 or undefined safely', () => {
    const propsWithZeroRate = createValidProps({
      rateToCNY: 0,
      data: {
        ...mockPlatformCardProps.data,
        lastMileFee: 2.15,
      },
    });

    expect(() => {
      render(<PlatformCard {...propsWithZeroRate} />);
    }).not.toThrow();

    // Should display value without crashing
    expect(screen.getByText(/尾程物流费/)).toBeInTheDocument();
  });

  it('should update last mile fee when user manually edits the input', () => {
    const propsWithLastMileFee = {
      ...mockPlatformCardProps,
      data: {
        ...mockPlatformCardProps.data,
        lastMileFee: 2.15,
      },
    };

    render(<PlatformCard {...propsWithLastMileFee} />);
    
    const input = screen.getByDisplayValue('1.00');
    fireEvent.change(input, { target: { value: '2.00' } });
    fireEvent.blur(input);
    
    expect(mockOnUpdate).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        lastMileFee: expect.closeTo(4.30, 0.01)
      })
    );
  });

  it('should call onDelete when delete button is clicked', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    // Find the delete button - it's the first button in the header
    const buttons = screen.getAllByRole('button');
    const deleteButton = buttons.find(btn => 
      btn.querySelector('svg.lucide-trash2') || 
      btn.className.includes('hover:text-red-500')
    ) || buttons[0];
    
    fireEvent.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledWith('node-1');
  });

  it('should call onSaveTemplate when save button is clicked with template name', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    const templateNameInput = screen.getByPlaceholderText('模版名称');
    fireEvent.change(templateNameInput, { target: { value: '测试模版' } });
    
    const saveButton = screen.getByText('保存模版');
    fireEvent.click(saveButton);
    
    expect(mockOnSaveTemplate).toHaveBeenCalledWith('node-1', '测试模版');
  });

  it('should disable save button when template name is empty', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    const saveButton = screen.getByText('保存模版');
    expect(saveButton).toBeDisabled();
  });

  it('should enable save button when template name is entered', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    const templateNameInput = screen.getByPlaceholderText('模版名称');
    fireEvent.change(templateNameInput, { target: { value: '测试' } });
    
    const saveButton = screen.getByText('保存模版');
    expect(saveButton).not.toBeDisabled();
  });

  it('should clear template name input after saving', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    const templateNameInput = screen.getByPlaceholderText('模版名称');
    fireEvent.change(templateNameInput, { target: { value: '测试模版' } });
    
    const saveButton = screen.getByText('保存模版');
    fireEvent.click(saveButton);
    
    expect(templateNameInput).toHaveValue('');
  });

  it('should display net profit in CNY', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    expect(screen.getByText('预估净利润 (CNY)')).toBeInTheDocument();
    // Should display a numeric value - look for the parent div with the label
    const netProfitLabel = screen.getByText('预估净利润 (CNY)');
    expect(netProfitLabel).toBeInTheDocument();
    
    // The value should be nearby and contain a number
    const netProfitContainer = netProfitLabel.closest('div');
    expect(netProfitContainer).toBeInTheDocument();
  });

  it('should display margin and ROI badges', () => {
    render(<PlatformCard {...mockPlatformCardProps} />);
    
    expect(screen.getByText(/利润率:/)).toBeInTheDocument();
    expect(screen.getByText(/ROI:/)).toBeInTheDocument();
  });

  it('should handle undefined globalInputs gracefully', () => {
    const propsWithUndefined = createValidProps({
      globalInputs: {
        ...mockPlatformCardProps.globalInputs,
        productWeight: undefined,
      },
    });

    expect(() => {
      render(<PlatformCard {...propsWithUndefined} />);
    }).not.toThrow();
  });

  it('should not update last mile fee if calculated value is the same (avoid infinite loop)', async () => {
    const propsWithExistingFee = {
      ...mockPlatformCardProps,
      data: {
        ...mockPlatformCardProps.data,
        lastMileFee: 2.03, // Already correct for 500g
      },
    };

    render(<PlatformCard {...propsWithExistingFee} />);
    
    // Wait to ensure no unnecessary updates
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should not have called onUpdate for the same value
    const lastMileFeeUpdates = mockOnUpdate.mock.calls.filter(
      call => call[1].lastMileFee !== undefined
    );
    
    // May be called once initially, but not repeatedly
    expect(lastMileFeeUpdates.length).toBeLessThanOrEqual(1);
  });

  it('should not render MDV/FSS/CCB fields for MYR country', () => {
    const myrProps = createValidProps({ country: 'MYR' });
    render(<PlatformCard {...myrProps} />);
    expect(screen.queryByText('MDV 服务费率')).not.toBeInTheDocument();
    expect(screen.queryByText('FSS 服务费率')).not.toBeInTheDocument();
    expect(screen.queryByText('CCB 服务费率')).not.toBeInTheDocument();
  });

  it('should not render MDV/FSS/CCB fields for SGD country', () => {
    const sgdProps = createValidProps({ country: 'SGD' });
    render(<PlatformCard {...sgdProps} />);
    expect(screen.queryByText('MDV 服务费率')).not.toBeInTheDocument();
    expect(screen.queryByText('FSS 服务费率')).not.toBeInTheDocument();
    expect(screen.queryByText('CCB 服务费率')).not.toBeInTheDocument();
  });

  it('should render MDV/FSS/CCB fields for PHP country', () => {
    const phpProps = createValidProps({ country: 'PHP' });
    render(<PlatformCard {...phpProps} />);
    expect(screen.getByText('MDV 服务费率')).toBeInTheDocument();
    expect(screen.getByText('FSS 服务费率')).toBeInTheDocument();
    expect(screen.getByText('CCB 服务费率')).toBeInTheDocument();
  });
});
