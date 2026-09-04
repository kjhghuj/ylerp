import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalInputsPanel } from '../modules/profit/GlobalInputsPanel';
import { zh } from '../locales/zh';
import { DEFAULT_SITE_INPUTS } from '../modules/profit/types';

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
    ['fixed', 20, '200.00', '300.00'],
    ['percent', 20, '180.00', '270.00'],
  ] as const)('shows buyer-paid prices below the input and hides storefront price for a %s coupon', (type, coupon, cny, local) => {
    const { container } = render(<GlobalInputsPanel {...baseProps} siteInputs={{ ...DEFAULT_SITE_INPUTS,
      totalRevenue: 200, sellerCouponType: type, sellerCoupon: coupon, sellerCouponPlatformRatio: 75,
    }} />);
    const ordinaryBuyerPaid = screen.getByText(type === 'fixed'
      ? '买家实付价格：180.00 CNY / 270.00 MYR' : '买家实付价格：160.00 CNY / 240.00 MYR');
    const buyerPaid = screen.getByText(`跨境买家实付价格：${cny} CNY / ${local} MYR`);
    const input = container.querySelector('input[name="totalRevenue"]')!;
    expect(input.compareDocumentPosition(ordinaryBuyerPaid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ordinaryBuyerPaid.parentElement!.nextElementSibling).toContainElement(buyerPaid);
    expect(screen.queryByText(/跨境前台价格/)).not.toBeInTheDocument();
  });

  it('updates cross-border buyer-paid price with country and coupon changes in local input mode', () => {
    const { rerender } = render(<GlobalInputsPanel {...baseProps} useLocalCurrency
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100, sellerCoupon: 20 }} />);
    expect(screen.getByText('跨境买家实付价格：90.00 CNY / 135.00 MYR')).toBeInTheDocument();
    rerender(<GlobalInputsPanel {...baseProps} useLocalCurrency siteCountry="THB" rates={{ THB: 5 }}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100, sellerCoupon: 10 }} />);
    expect(screen.getByText('跨境买家实付价格：106.00 CNY / 530.00 THB')).toBeInTheDocument();
  });

  it('retains CNY cross-border buyer-paid price without an exchange rate', () => {
    render(<GlobalInputsPanel {...baseProps} rates={{ MYR: 0 }}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100, sellerCoupon: 20 }} />);
    expect(screen.getByText('跨境买家实付价格：90.00 CNY / — MYR')).toBeInTheDocument();
  });

  it.each([
    ['MYR', '110.00', '165.00'], ['SGD', '109.00', '163.50'], ['PHP', '100.00', '150.00'],
    ['THB', '116.00', '174.00'], ['IDR', '100.00', '150'],
  ])('shows the configured cross-border buyer-paid price for %s without replacing the currency conversion', (currency, price, localPrice) => {
    const { container } = render(<GlobalInputsPanel {...baseProps}
      siteCountry={currency} rates={{ [currency]: 1.5 }}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100 }} />);
    const field = container.querySelector('input[name="totalRevenue"]')!.parentElement!.parentElement!;
    const storefront = screen.getByText(`跨境买家实付价格：${price} CNY / ${localPrice} ${currency}`);
    expect(field).toContainElement(storefront);
    expect(storefront.parentElement).toHaveClass('text-orange-600');
    expect(field).toHaveTextContent(`≈ ${currency === 'IDR' ? '150' : '150.00'} ${currency}`);
  });

  it('updates cross-border buyer-paid price when revenue, site or input currency changes', () => {
    const { rerender } = render(<GlobalInputsPanel {...baseProps}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100 }} />);
    expect(screen.getByText('跨境买家实付价格：110.00 CNY / 165.00 MYR')).toBeInTheDocument();
    rerender(<GlobalInputsPanel {...baseProps} useLocalCurrency
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100 }} />);
    expect(screen.getByText('跨境买家实付价格：110.00 CNY / 165.00 MYR')).toBeInTheDocument();
    rerender(<GlobalInputsPanel {...baseProps} useLocalCurrency
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 200 }} />);
    expect(screen.getByText('跨境买家实付价格：220.00 CNY / 330.00 MYR')).toBeInTheDocument();
    rerender(<GlobalInputsPanel {...baseProps} useLocalCurrency siteCountry="THB" rates={{ THB: 5 }}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 200 }} />);
    expect(screen.getByText('跨境买家实付价格：232.00 CNY / 1160.00 THB')).toBeInTheDocument();
  });

  it('keeps the CNY cross-border buyer-paid price when the local exchange rate is unavailable', () => {
    render(<GlobalInputsPanel {...baseProps} rates={{ MYR: 0 }}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 100 }} />);
    expect(screen.getByText('跨境买家实付价格：110.00 CNY / — MYR')).toBeInTheDocument();
  });

  it('shows a placeholder instead of a misleading cross-border buyer-paid price for invalid revenue', () => {
    render(<GlobalInputsPanel {...baseProps}
      siteInputs={{ ...DEFAULT_SITE_INPUTS, totalRevenue: 'invalid' as unknown as number }} />);
    expect(screen.getByText('跨境买家实付价格：—')).toBeInTheDocument();
  });

  it.each([
    { sellerCoupon: 20, sellerCouponType: 'fixed' as const },
    { sellerCoupon: 20, sellerCouponType: 'percent' as const },
  ])('shows buyer-paid price below total revenue for a $sellerCouponType store coupon', (coupon) => {
    render(<GlobalInputsPanel
      {...baseProps}
      siteInputs={{
        totalRevenue: 100,
        sellerCouponPlatformRatio: 75,
        platformInfrastructureFee: 0,
        adROI: 15,
        ...coupon,
      }}
    />);

    expect(screen.getByText('买家实付价格：80.00 CNY / 120.00 MYR')).toBeInTheDocument();
  });

  it('shows buyer-paid price in the active local currency', () => {
    render(<GlobalInputsPanel
      {...baseProps}
      useLocalCurrency
      siteInputs={{
        totalRevenue: 100,
        sellerCoupon: 20,
        sellerCouponType: 'fixed',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
      }}
    />);

    expect(screen.getByText('买家实付价格：80.00 CNY / 120.00 MYR')).toBeInTheDocument();
  });

  it('keeps the CNY buyer-paid price visible when the local exchange rate is unavailable', () => {
    render(<GlobalInputsPanel
      {...baseProps}
      rates={{ MYR: 0 }}
      siteInputs={{
        totalRevenue: 100,
        sellerCoupon: 20,
        sellerCouponType: 'fixed',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
      }}
    />);

    expect(screen.getByText('买家实付价格：80.00 CNY / — MYR')).toBeInTheDocument();
  });

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

  it.each([false, true])('renders the percent coupon helper in CNY and local currency when local mode is %s', (useLocalCurrency) => {
    const { container } = render(<GlobalInputsPanel
      {...baseProps}
      useLocalCurrency={useLocalCurrency}
      siteInputs={{
        totalRevenue: '100',
        sellerCoupon: '20',
        sellerCouponType: 'percent',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
      } as never}
    />);

    expect(container).toHaveTextContent('≈ 20.00 CNY / 30.00 MYR');
  });

  it('keeps the CNY percent coupon amount visible when the local exchange rate is unavailable', () => {
    const { container } = render(<GlobalInputsPanel
      {...baseProps}
      rates={{ MYR: 0 }}
      siteInputs={{
        totalRevenue: 100,
        sellerCoupon: 20,
        sellerCouponType: 'percent',
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
      }}
    />);

    expect(container).toHaveTextContent('≈ 20.00 CNY / — MYR');
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
