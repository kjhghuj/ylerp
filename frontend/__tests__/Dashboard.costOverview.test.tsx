import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../modules/Dashboard';
import { en } from '../locales/en';
import api from '../src/api';

const dashboardState = vi.hoisted(() => ({
  rates: { MYR: 1.67, SGD: 5.2, PHP: 0.12, THB: 0.2, IDR: 0.00045 },
  primaryTemplates: [] as any[],
  rejectPrimaryRequest: false,
}));

vi.mock('../src/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({
    rates: dashboardState.rates,
    isLoading: false,
    lastUpdated: null,
    fetchRates: vi.fn(),
  }),
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { role: 'owner', permissions: [] } }),
}));

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    accountBalance: 1000,
    totalDebt: 100,
    products: [
      { id: 'p1', name: 'P1', cost: 10, country: 'MY', sites: [] },
      { id: 'p2', name: 'P2', cost: 30, country: 'SG', sites: ['SG'] },
      { id: 'p3', name: 'Oversized', cost: Number.MAX_SAFE_INTEGER + 1, country: 'MY', sites: ['MY'] },
      { id: 'p4', name: 'Infinite', cost: Number.POSITIVE_INFINITY, country: 'MY', sites: ['MY'] },
    ],
    inventory: [],
    strings: en,
  }),
}));

describe('Dashboard primary profit overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState.rates = { MYR: 1.67, SGD: 5.2, PHP: 0.12, THB: 0.2, IDR: 0.00045 };
    dashboardState.rejectPrimaryRequest = false;
    dashboardState.primaryTemplates = [
      {
        id: 'link-small', productId: 'p1', templateId: null, name: 'Small',
        country: 'MYR', platform: 'shopee', isPrimary: true,
        data: {
          kind: 'standard', schemaVersion: 2, exchangeRate: 1,
          exchangeRateAt: '2026-07-18T00:00:00.000Z',
        },
        product: {
          id: 'p1', name: 'P1', sku: 'P1', country: 'MY', sites: ['MY'],
          cost: 50, productWeight: 0, supplierInvoice: 'no', supplierTaxPoint: 0,
          vatRate: 0, corporateIncomeTaxRate: 0,
          siteData: { MY: { totalRevenue: 100, adROI: 0 } },
        },
      },
      {
        id: 'link-large', productId: 'p2', templateId: null, name: 'Large',
        country: 'MYR', platform: 'shopee', isPrimary: true,
        data: {
          kind: 'standard', schemaVersion: 2, exchangeRate: 1,
          exchangeRateAt: '2026-07-18T00:00:00.000Z',
        },
        product: {
          id: 'p2', name: 'P2', sku: 'P2', country: 'MY', sites: ['MY'],
          cost: 810, productWeight: 0, supplierInvoice: 'no', supplierTaxPoint: 0,
          vatRate: 0, corporateIncomeTaxRate: 0,
          siteData: { MY: { totalRevenue: 900, adROI: 0 } },
        },
      },
    ];
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => (
      url.startsWith('/products/primary-profit-templates?page=') && dashboardState.rejectPrimaryRequest
        ? Promise.reject(new Error('offline'))
        :
      Promise.resolve({
        data: url.startsWith('/products/primary-profit-templates?page=')
          ? { items: dashboardState.primaryTemplates, hasMore: false }
          : [],
      })
    ));
  });

  it('labels and renders the revenue-weighted primary-template profit margin', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('Weighted Profit Margin')).toBeInTheDocument();
    expect(screen.getByText('14.00%')).toBeInTheDocument();
    expect(screen.queryByText('Avg Purchase Cost')).not.toBeInTheDocument();
    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
  });

  it('renders the primary profit rows with net profit and post-coupon revenue', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('Primary Profit Overview')).toBeInTheDocument();
    expect(await screen.findByText('CNY 50.00')).toBeInTheDocument();
    expect(screen.getByText('CNY 90.00')).toBeInTheDocument();
    expect(screen.getByText('CNY 900.00')).toBeInTheDocument();
  });

  it('shows an explicit chart empty state without fake weekday data', () => {
    render(<Dashboard />);

    expect(screen.getByText('Historical trend data is not available')).toBeInTheDocument();
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.queryByText(weekday)).not.toBeInTheDocument();
    }
  });

  it('requests only the current user primary-template summary endpoint', async () => {
    render(<Dashboard />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/schedule/upcoming'));
    expect(api.get).toHaveBeenCalledWith('/products/primary-profit-templates?page=0');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shows an explicit empty value when no primary template is selected', async () => {
    dashboardState.primaryTemplates = [];
    render(<Dashboard />);

    expect(await screen.findByText('No eligible primary profit templates')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('does not misreport a request failure as an empty primary-template list and can retry', async () => {
    dashboardState.rejectPrimaryRequest = true;
    render(<Dashboard />);

    expect(await screen.findByText('Profit data is temporarily unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No eligible primary profit templates')).not.toBeInTheDocument();

    dashboardState.rejectPrimaryRequest = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('CNY 50.00')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/products/primary-profit-templates?page=0');
  });

  it('loads every bounded primary-template page before aggregating', async () => {
    const firstPage = dashboardState.primaryTemplates.slice(0, 1);
    const secondPage = dashboardState.primaryTemplates.slice(1);
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/products/primary-profit-templates?page=0') {
        return Promise.resolve({ data: { items: firstPage, hasMore: true } });
      }
      if (url === '/products/primary-profit-templates?page=1') {
        return Promise.resolve({ data: { items: secondPage, hasMore: false } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<Dashboard />);

    expect(await screen.findByText('14.00%')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/products/primary-profit-templates?page=0');
    expect(api.get).toHaveBeenCalledWith('/products/primary-profit-templates?page=1');
  });

  it('rejects a primary-template page above the four-record memory boundary', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => (
      url.startsWith('/products/primary-profit-templates?page=')
        ? Promise.resolve({
            data: {
              items: Array.from({ length: 5 }, (_, index) => ({ id: `item-${index}` })),
              hasMore: false,
            },
          })
        : Promise.resolve({ data: [] })
    ));

    render(<Dashboard />);

    expect(await screen.findByText('Profit data is temporarily unavailable')).toBeInTheDocument();
  });

  it('rejects malformed primary-template page payloads instead of treating them as empty', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => (
      url.startsWith('/products/primary-profit-templates?page=')
        ? Promise.resolve({ data: { items: [null], hasMore: 'no' } })
        : Promise.resolve({ data: [] })
    ));

    render(<Dashboard />);

    expect(await screen.findByText('Profit data is temporarily unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No eligible primary profit templates')).not.toBeInTheDocument();
  });

  it('never renders non-finite third-party exchange rates in either direction', () => {
    dashboardState.rates = {
      ...dashboardState.rates,
      MYR: Number.POSITIVE_INFINITY,
      SGD: Number.MIN_VALUE,
    };
    const { container } = render(<Dashboard />);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);

    const toggle = screen.getByTitle('切换为 1CNY → 本地币');
    fireEvent.click(toggle);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it.each([true, -2, 0, '12abc'])(
    'does not calculate dashboard exchange text from invalid rate %j',
    (invalidRate) => {
      dashboardState.rates = {
        ...dashboardState.rates,
        MYR: invalidRate,
      } as never;

      const { container } = render(<Dashboard />);
      expect(container.textContent).not.toMatch(/Infinity|NaN|12abc/);
      expect(screen.getByText('1 MYR').parentElement).toHaveTextContent('1 MYR-CNY');

      fireEvent.click(screen.getByRole('button', { name: /CNY/ }));
      expect(screen.getByText('MYR').parentElement).toHaveTextContent('MYR-');
    },
  );
});
