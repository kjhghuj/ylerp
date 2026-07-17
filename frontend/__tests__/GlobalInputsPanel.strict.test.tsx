import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalInputsPanel } from '../modules/profit/GlobalInputsPanel';
import { zh } from '../locales/zh';

const baseProps = {
  globalInputs: {
    name: 'Product',
    sku: 'SKU-1',
    purchaseCost: 10,
    productWeight: 100,
    supplierTaxPoint: 0,
    supplierInvoice: 'no' as const,
    vatRate: 1,
    corporateIncomeTaxRate: 5,
  },
  siteCountry: 'MYR',
  useLocalCurrency: false,
  rates: { MYR: 1.5 },
  onGlobalChange: vi.fn(),
  onSetGlobalInputs: vi.fn(),
  onSetUseLocalCurrency: vi.fn(),
  onSetSiteCountry: vi.fn(),
  t: zh.profit,
  currentRate: 0,
  isLoadingRate: false,
  lastUpdated: null,
  onRefreshRates: vi.fn(),
  onReset: vi.fn(),
  onSiteInputChange: vi.fn(),
};

describe('GlobalInputsPanel strict percent-coupon helper', () => {
  it.each([
    { totalRevenue: '   ', sellerCoupon: 20 },
    { totalRevenue: 100, sellerCoupon: '12abc' },
  ])('hides the approximate coupon amount for invalid inputs %#', (partial) => {
    const { container } = render(<GlobalInputsPanel
      {...baseProps}
      siteInputs={{
        totalRevenue: 100,
        sellerCoupon: 20,
        sellerCouponType: 'percent',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
        ...partial,
      } as never}
    />);

    expect(container).not.toHaveTextContent('≈ 0.00 CNY');
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('renders the helper for canonical finite inputs', () => {
    const { container } = render(<GlobalInputsPanel
      {...baseProps}
      siteInputs={{
        totalRevenue: '100',
        sellerCoupon: '20',
        sellerCouponType: 'percent',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
      } as never}
    />);

    expect(container).toHaveTextContent('≈ 20.00 CNY');
  });

  it.each([Number.POSITIVE_INFINITY, Number.NaN, true, -1, 0, '12abc'])(
    'shows a safe unavailable state for invalid current rate %j',
    (currentRate) => {
      const { container } = render(<GlobalInputsPanel
        {...baseProps}
        currentRate={currentRate as never}
        siteInputs={{
          totalRevenue: 100,
          sellerCoupon: 0,
          sellerCouponType: 'fixed',
          sellerCouponPlatformRatio: 0,
          platformInfrastructureFee: 0,
          adROI: 15,
        }}
      />);

      expect(container).toHaveTextContent('1 CNY ≈ - MYR');
      expect(container.textContent).not.toMatch(/Infinity|NaN|12abc/);
    },
  );
});
