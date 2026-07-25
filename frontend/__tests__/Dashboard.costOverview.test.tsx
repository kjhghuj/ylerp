import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../modules/Dashboard';
import { en } from '../locales/en';
import api from '../src/api';

const state = vi.hoisted(() => ({
  accountBalance: 1000,
  totalDebt: 100,
}));

vi.mock('../src/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({
    rates: { MYR: 1.67, SGD: 5.2, PHP: 0.12, THB: 0.2, IDR: 0.00045 },
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
    accountBalance: state.accountBalance,
    totalDebt: state.totalDebt,
    strings: en,
  }),
}));

const summary = {
  generatedAt: '2026-07-23T00:00:00.000Z',
  sites: [
    { code: 'MY', name: 'Malaysia' },
    { code: 'SG', name: 'Singapore' },
  ],
  restock: {
    totalQuantity: 120,
    bySite: [
      { site: 'MY', name: 'Malaysia', quantity: 80 },
      { site: 'SG', name: 'Singapore', quantity: 40 },
    ],
  },
  slowMoving: {
    totalQuantity: 40,
    skuCount: 2,
    bySite: [
      { site: 'MY', name: 'Malaysia', quantity: 30 },
      { site: 'SG', name: 'Singapore', quantity: 10 },
    ],
  },
  warnings: { missingSalesCount: 1, incompleteAgeCount: 1, unavailableSites: [] },
};

const monitorPayload = (kind: 'aging' | 'restock') => ({
  kind,
  site: 'ALL',
  sites: summary.sites,
  items: kind === 'aging'
    ? [{
      name: 'Old product',
      sku: 'OLD-1',
      site: 'MY',
      warehouse: 'Kuala Lumpur',
      quantity: 10,
      inboundDays: 91,
      dailyStorageFee: 1.23456,
      totalStorageFee: 45.678,
      storageFeeStatus: 'ready',
      storageFeeCalculatedAt: '2026-07-22',
    }]
    : [{ name: 'Fast product', sku: 'FAST-1', site: 'SG', warehouse: 'Singapore DC', quantity: 5, availableDays: 2.5 }],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  sortBy: kind === 'aging' ? 'inboundDays' : 'availableDays',
  sortDir: kind === 'aging' ? 'desc' : 'asc',
  warnings: summary.warnings,
  generatedAt: summary.generatedAt,
});

describe('redesigned Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.accountBalance = 1000;
    state.totalDebt = 100;
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string, config?: any) => {
      if (url === '/dashboard/summary') return Promise.resolve({ data: summary });
      if (url === '/dashboard/warehouse-monitor') {
        return Promise.resolve({ data: monitorPayload(config?.params?.kind) });
      }
      return Promise.reject(new Error(`Unexpected legacy request: ${url}`));
    });
  });

  it('shows available funds and the two alert totals', async () => {
    render(<Dashboard />);

    expect(screen.getByText('Estimated Available Funds')).toBeInTheDocument();
    expect(screen.getByText(/900\.00/)).toBeInTheDocument();
    expect(await screen.findByText('Restock Alert')).toBeInTheDocument();
    expect(screen.getByText('Slow-moving Alert')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it('renders warehouse columns, default sorting, and no legacy modules or requests', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('Old product')).toBeInTheDocument();
    expect(await screen.findByText('Fast product')).toBeInTheDocument();
    expect(screen.getAllByText('Warehouse')).toHaveLength(2);
    expect(screen.queryByText('Weighted Profit Margin')).not.toBeInTheDocument();
    expect(screen.queryByText('Primary Profit Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Historical trend data is not available')).not.toBeInTheDocument();

    const monitorCalls = (api.get as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url]) => url === '/dashboard/warehouse-monitor');
    expect(monitorCalls).toEqual(expect.arrayContaining([
      expect.arrayContaining([
        '/dashboard/warehouse-monitor',
        expect.objectContaining({ params: expect.objectContaining({ kind: 'aging', sortBy: 'inboundDays', sortDir: 'desc' }) }),
      ]),
      expect.arrayContaining([
        '/dashboard/warehouse-monitor',
        expect.objectContaining({ params: expect.objectContaining({ kind: 'restock', sortBy: 'availableDays', sortDir: 'asc' }) }),
      ]),
    ]));
    expect((api.get as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => (
      url === '/schedule/upcoming' || String(url).includes('primary-profit-templates')
    ))).toBe(false);
  });

  it('shows the localized site for every warehouse monitor row', async () => {
    render(<Dashboard />);

    const oldProductRow = (await screen.findByText('Old product')).closest('tr');
    const fastProductRow = (await screen.findByText('Fast product')).closest('tr');

    expect(screen.getAllByRole('button', { name: 'Site sort' })).toHaveLength(2);
    expect(within(oldProductRow!).getByText('Malaysia')).toBeInTheDocument();
    expect(within(fastProductRow!).getByText('Singapore')).toBeInTheDocument();
  });

  it('shows storage fees only in the aging monitor with report-date precision', async () => {
    render(<Dashboard />);

    const agingMonitor = await screen.findByRole('region', { name: 'YC Aging Monitor' });
    const restockMonitor = screen.getByRole('region', { name: 'YC Restock Monitor' });

    expect(within(agingMonitor).getByText('Daily storage fee')).toBeInTheDocument();
    expect(within(agingMonitor).getByText('Total storage fee')).toBeInTheDocument();
    expect(within(agingMonitor).getByText('1.2346 CNY')).toBeInTheDocument();
    expect(within(agingMonitor).getByText('45.68 CNY')).toBeInTheDocument();
    expect(within(agingMonitor).getByText('Storage fee estimated as of 2026-07-22')).toBeInTheDocument();
    expect(within(restockMonitor).queryByText('Daily storage fee')).not.toBeInTheDocument();
    expect(within(restockMonitor).queryByText('Total storage fee')).not.toBeInTheDocument();
  });

  it('keeps site and sorting state independent between the tables', async () => {
    render(<Dashboard />);
    await screen.findByText('Old product');

    const malaysiaTabs = screen.getAllByRole('button', { name: 'Malaysia' });
    fireEvent.click(malaysiaTabs[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Name sort' })[1]);

    await waitFor(() => {
      const calls = (api.get as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([url, config]) => url === '/dashboard/warehouse-monitor'
        && config.params.kind === 'aging'
        && config.params.site === 'MY'
        && config.params.sortBy === 'inboundDays')).toBe(true);
      expect(calls.some(([url, config]) => url === '/dashboard/warehouse-monitor'
        && config.params.kind === 'restock'
        && config.params.site === 'ALL'
        && config.params.sortBy === 'name')).toBe(true);
    });
  });

  it('stretches both warehouse monitors to the bottom of the dashboard', async () => {
    render(<Dashboard />);
    await screen.findByText('Old product');

    const agingMonitor = screen.getByRole('region', { name: 'YC Aging Monitor' });
    const restockMonitor = screen.getByRole('region', { name: 'YC Restock Monitor' });
    const monitorGrid = agingMonitor.parentElement;

    expect(monitorGrid).toBe(restockMonitor.parentElement);
    expect(monitorGrid).toHaveClass('flex-1', 'items-stretch');
    expect(monitorGrid?.parentElement).toHaveClass('flex', 'h-full', 'min-h-full', 'flex-col');

    for (const monitor of [agingMonitor, restockMonitor]) {
      expect(monitor).toHaveClass('flex', 'h-full', 'flex-col');
      expect(monitor.querySelector('table')?.parentElement).toHaveClass('min-h-0', 'flex-1', 'overflow-auto');
    }
  });

  it('uses red for negative available funds', () => {
    state.accountBalance = 100;
    state.totalDebt = 300;
    render(<Dashboard />);

    const value = screen.getByText(/200\.00/);
    expect(value).toHaveClass('text-rose-600');
  });
});
