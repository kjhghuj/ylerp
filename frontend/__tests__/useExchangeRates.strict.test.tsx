import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExchangeRates } from '../hooks/useExchangeRates';

const fallbackRates = {
  MYR: 0.65,
  PHP: 8.05,
  SGD: 0.19,
  THB: 5.01,
  IDR: 2150,
};

const mockRateResponse = (rates: Record<string, unknown>) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      base: 'CNY',
      time_last_updated: Math.floor(Date.now() / 1000),
      rates,
    }),
  }));
};

const mockPayloadResponse = (payload: unknown) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  }));
};

describe('useExchangeRates strict API normalization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts finite positive numbers and strict numeric strings from the existing nested rates shape', async () => {
    mockRateResponse({
      MYR: '0.66',
      PHP: 8.1,
      SGD: ' 0.20 ',
      THB: '5e0',
      IDR: 2200,
    });

    const { result } = renderHook(() => useExchangeRates());
    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull());

    expect(result.current.rates).toEqual({
      MYR: 0.66,
      PHP: 8.1,
      SGD: 0.2,
      THB: 5,
      IDR: 2200,
    });
    expect(result.current.isStale).toBe(false);
  });

  it.each([
    Number.POSITIVE_INFINITY,
    Number.NaN,
    true,
    -1,
    0,
    Number.MIN_VALUE,
    '12abc',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects invalid rate %j and keeps that currency on its safe fallback', async (invalidRate) => {
    mockRateResponse({
      ...fallbackRates,
      MYR: invalidRate,
    });

    const { result } = renderHook(() => useExchangeRates());
    await waitFor(() => expect(result.current.isStale).toBe(true));

    expect(result.current.rates.MYR).toBe(fallbackRates.MYR);
    expect(typeof result.current.rates.MYR).toBe('number');
    expect(result.current.lastUpdated).toBeNull();
  });

  it.each([undefined, null, true, {}, { rates: null }, { rates: 'invalid' }])(
    'rejects malformed API payload shape %# and retains the complete fallback set',
    async (payload) => {
      mockPayloadResponse(payload);

      const { result } = renderHook(() => useExchangeRates());
      await waitFor(() => expect(result.current.isStale).toBe(true));

      expect(result.current.rates).toEqual(fallbackRates);
      expect(result.current.lastUpdated).toBeNull();
    },
  );

  it('normalizes a partial rates object field-by-field without exposing undefined values', async () => {
    mockRateResponse({ MYR: '0.7' });

    const { result } = renderHook(() => useExchangeRates());
    await waitFor(() => expect(result.current.isStale).toBe(true));

    expect(result.current.rates).toEqual({ ...fallbackRates, MYR: 0.7 });
    expect(result.current.lastUpdated).toBeNull();
  });

  it.each([
    {
      base: 'USD',
      time_last_updated: Math.floor(Date.now() / 1000),
      rates: fallbackRates,
    },
    {
      base: 'CNY',
      time_last_updated: Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000),
      rates: fallbackRates,
    },
    {
      base: 'CNY',
      time_last_updated: Math.floor(Date.now() / 1000),
      rates: { ...fallbackRates, MYR: fallbackRates.MYR * 10 },
    },
    {
      base: 'CNY',
      time_last_updated: Math.floor(Date.now() / 1000),
      rates: { ...fallbackRates, MYR: fallbackRates.MYR / 10 },
    },
    {
      base: 'CNY',
      time_last_updated: Math.floor(Date.now() / 1000),
      rates: { ...fallbackRates, MYR: 1e-292 },
    },
  ])('rejects untrusted third-party rate metadata or semantic outliers %#', async (payload) => {
    mockPayloadResponse(payload);

    const { result } = renderHook(() => useExchangeRates());
    await waitFor(() => expect(result.current.isStale).toBe(true));

    expect(result.current.rates).toEqual(fallbackRates);
    expect(result.current.lastUpdated).toBeNull();
  });
});
