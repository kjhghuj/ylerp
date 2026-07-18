import { describe, expect, it } from 'vitest';
import {
  getCurrencyDecimalPlaces,
  formatCurrencyAmount,
  roundCurrencyAmount,
} from '../modules/profit/currencyRounding';

describe('profit currency rounding', () => {
  it('uses the approved settlement precision for every supported currency', () => {
    expect(getCurrencyDecimalPlaces('CNY')).toBe(2);
    expect(getCurrencyDecimalPlaces('MYR')).toBe(2);
    expect(getCurrencyDecimalPlaces('SGD')).toBe(2);
    expect(getCurrencyDecimalPlaces('PHP')).toBe(2);
    expect(getCurrencyDecimalPlaces('THB')).toBe(2);
    expect(getCurrencyDecimalPlaces('IDR')).toBe(0);
  });

  it.each([
    [1.005, 'CNY', 1.01],
    [10.075, 'CNY', 10.08],
    [-1.005, 'CNY', -1.01],
    [12.5, 'IDR', 13],
    [-12.5, 'IDR', -13],
  ] as const)('rounds %s in %s half away from zero', (amount, currency, expected) => {
    expect(roundCurrencyAmount(amount, currency)).toBe(expected);
  });

  it('is idempotent and does not accumulate rounding drift', () => {
    const once = roundCurrencyAmount(123.456789, 'MYR');
    expect(roundCurrencyAmount(once, 'MYR')).toBe(once);
  });

  it('does not invent value or overflow when rounding large finite amounts', () => {
    expect(roundCurrencyAmount(1e14, 'CNY')).toBe(1e14);
    expect(roundCurrencyAmount(Number.MAX_SAFE_INTEGER, 'CNY')).toBe(Number.MAX_SAFE_INTEGER);
    expect(roundCurrencyAmount(Number.MAX_VALUE, 'CNY')).toBe(Number.MAX_VALUE);
  });

  it('formats settlement displays with the same configured precision', () => {
    expect(formatCurrencyAmount(12.4, 'CNY')).toBe('12.40');
    expect(formatCurrencyAmount(12.6, 'IDR')).toBe('13');
  });

  it('rejects non-finite currency amounts', () => {
    expect(() => roundCurrencyAmount(Number.NaN, 'CNY')).toThrow(/finite/i);
    expect(() => roundCurrencyAmount(Number.POSITIVE_INFINITY, 'CNY')).toThrow(/finite/i);
  });
});
