import { describe, expect, it } from 'vitest';
import {
  derivePlatformCouponAmountLocal,
  derivePlatformCouponRate,
} from '../modules/profit/platformCoupon';

describe('platform coupon derived values', () => {
  it('derives a percentage from the canonical local-currency amount', () => {
    expect(derivePlatformCouponRate(20, 50, 2)).toBe(20);
  });

  it('derives a local-currency amount from a percentage without rounding storage', () => {
    const expected = 123.45 * (12.345 / 100) * 1.67;
    expect(derivePlatformCouponAmountLocal(12.345, 123.45, 1.67)).toBe(expected);
  });

  it.each([
    [0, 0, 2],
    [10, -1, 2],
    [10, 100, 0],
    [10, 100, Number.POSITIVE_INFINITY],
  ])('returns null when a rate cannot be derived from %#', (amount, revenue, rate) => {
    expect(derivePlatformCouponRate(amount, revenue, rate)).toBeNull();
  });

  it.each([
    [-1, 100, 2],
    [101, 100, 2],
    [20, 0, 2],
    [20, 100, 0],
  ])('returns null when an amount cannot be derived from %#', (percentage, revenue, rate) => {
    expect(derivePlatformCouponAmountLocal(percentage, revenue, rate)).toBeNull();
  });
});
