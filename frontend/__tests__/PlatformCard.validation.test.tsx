import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PlatformCard } from '../modules/PlatformCard';
import { zh } from '../locales/zh';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS } from '../modules/profit/types';

const profitMocks = vi.hoisted(() => ({
  calculateProfit: vi.fn(),
  calculateLastMileFee: vi.fn(() => 2.03),
}));

vi.mock('../modules/profit/calculateProfit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/profit/calculateProfit')>();
  return { ...actual, ...profitMocks };
});

const result = {
  purchaseCost: 10,
  totalRevenue: 100,
  commission: 1,
  transactionFee: 2,
  serviceFee: 3,
  shippingFee: 4,
  platformFee: 5,
  totalTax: 6,
  adFee: 7,
  damage: 8,
  finalRevenueCNY: 50,
  finalRevenueLocal: 100,
  roi: 500,
  margin: 50,
  vat: 1,
  corporateIncomeTax: 5,
  costTaxAmount: 0,
  grossSellerCoupon: 11.11,
  sellerCouponSellerContribution: 22.22,
  sellerCouponPlatformContribution: 33.33,
  actualSellerCoupon: 22.22,
  platformCouponCNY: 44.44,
  taxableRevenue: 60,
  revenueAfterSellerCoupon: 70,
};

const defaultProps = {
  nodeId: 'node-1',
  platform: 'shopee' as const,
  country: 'MYR',
  data: { ...DEFAULT_NODE_DATA },
  globalInputs: {
    name: 'Product', sku: 'SKU-1', purchaseCost: 10, productWeight: 100,
    supplierTaxPoint: 0, supplierInvoice: 'no' as const, vatRate: 1, corporateIncomeTaxRate: 5,
  },
  siteInputs: { ...DEFAULT_SITE_INPUTS, totalRevenue: 100 },
  rateToCNY: 2,
  strings: zh.profit,
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onSaveTemplate: vi.fn(),
};

describe('PlatformCard strict preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profitMocks.calculateProfit.mockReturnValue(result);
  });

  it.each(['', '   ', '12abc'])('hides results and marks firstWeight invalid for %j', (firstWeight) => {
    const { container } = render(<PlatformCard
      {...defaultProps}
      data={{ ...DEFAULT_NODE_DATA, firstWeight } as never}
    />);

    expect(profitMocks.calculateProfit).not.toHaveBeenCalled();
    expect(document.querySelector('input[name="firstWeight"]')).toHaveAttribute('aria-invalid', 'true');
    expect(container).not.toHaveTextContent('¥50.00');
    expect(screen.getByText(zh.profit.errors.inputValidationFailed)).toBeInTheDocument();
  });

  it('normalizes canonical strings before calculation and keeps firstWeight zero valid', () => {
    const { container } = render(<PlatformCard
      {...defaultProps}
      data={{ ...DEFAULT_NODE_DATA, firstWeight: '0', extraShippingFee: '2.5' } as never}
    />);

    expect(profitMocks.calculateProfit).toHaveBeenCalledWith(
      expect.objectContaining({ firstWeight: 0, extraShippingFee: 2.5 }),
      expect.objectContaining({ purchaseCost: 10 }),
      expect.objectContaining({ totalRevenue: 100 }),
      2,
      'MYR',
    );
    expect(document.querySelector('input[name="firstWeight"]')).toHaveAttribute('aria-invalid', 'false');
    expect(container).toHaveTextContent('¥50.00');
  });

  it('does not require product identity fields for a numeric-only preview', () => {
    render(<PlatformCard
      {...defaultProps}
      globalInputs={{ ...defaultProps.globalInputs, name: '', sku: '' } as never}
    />);

    expect(profitMocks.calculateProfit).toHaveBeenCalledTimes(1);
  });

  it('renders all four coupon breakdown amounts with CNY symbols and no 楼 placeholder', () => {
    const { container } = render(<PlatformCard {...defaultProps} />);

    for (const amount of ['¥11.11', '¥33.33', '-¥22.22', '-¥44.44']) {
      expect(screen.getByText(amount)).toBeInTheDocument();
    }
    expect(container).not.toHaveTextContent('楼');
  });

  it.each([true, false])('hides non-finite auxiliary conversions when local-currency mode is %s', (useLocalCurrency) => {
    const { container } = render(<PlatformCard
      {...defaultProps}
      useLocalCurrency={useLocalCurrency}
      rateToCNY={Number.MIN_VALUE}
      data={{ ...DEFAULT_NODE_DATA, baseShippingFee: Number.MAX_SAFE_INTEGER }}
    />);

    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('uses the shared positive-rate parser for both preview rate checks', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules/PlatformCard.tsx'), 'utf8');

    expect(source.match(/parseCanonicalPositiveRate\(rateToCNY\)/g)).toHaveLength(2);
    expect(source).not.toContain('Number.MIN_VALUE');
    expect(source).not.toContain('parseCanonicalProfitNumber(rateToCNY');
  });
});
