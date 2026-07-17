import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Dashboard } from '../modules/Dashboard';
import { en } from '../locales/en';
import api from '../src/api';

const dashboardState = vi.hoisted(() => ({
  rates: { MYR: 1.67, SGD: 5.2, PHP: 0.12, THB: 0.2, IDR: 0.00045 },
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

describe('Dashboard truthful cost overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState.rates = { MYR: 1.67, SGD: 5.2, PHP: 0.12, THB: 0.2, IDR: 0.00045 };
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('labels and renders the actual average purchase cost in CNY', () => {
    render(<Dashboard />);

    expect(screen.getByText('Avg Purchase Cost')).toBeInTheDocument();
    expect(screen.getByText('CNY 20.00')).toBeInTheDocument();
    expect(screen.queryByText('Avg Profit Margin')).not.toBeInTheDocument();
    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
  });

  it('uses a product cost overview title and does not claim recent profit analysis', () => {
    render(<Dashboard />);

    expect(screen.getByText('Product Cost Overview')).toBeInTheDocument();
    expect(screen.queryByText('Recent Profit Analysis')).not.toBeInTheDocument();
  });

  it('shows an explicit chart empty state without fake weekday data', () => {
    render(<Dashboard />);

    expect(screen.getByText('Historical trend data is not available')).toBeInTheDocument();
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.queryByText(weekday)).not.toBeInTheDocument();
    }
  });

  it('does not request templates and has no profit-calculation dependency', async () => {
    render(<Dashboard />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/schedule/upcoming'));
    expect(api.get).toHaveBeenCalledTimes(1);
    const source = readFileSync(
      resolve(process.cwd(), 'modules/Dashboard.tsx'),
      'utf8',
    );
    expect(source).not.toContain('calculateProfit');
    expect(source).not.toContain('/templates');
    expect(source).not.toMatch(/name:\s*['"]Mon['"]/);
    expect(source).not.toMatch(/const isOverdue\s*=.*Date\.now\(\)/);
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
