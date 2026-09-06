import { describe, expect, it } from 'vitest';
import {
  addDays,
  isValidDateString,
  presetToDays,
  resolveQuickRange,
} from '../modules/product-analysis/utils/range';

describe('range utils', () => {
  it('anchors quick ranges at the latest upload date (inclusive)', () => {
    expect(resolveQuickRange('2026-09-06', 7)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(resolveQuickRange('2026-09-06', 30)).toEqual({ from: '2026-08-08', to: '2026-09-06' });
    expect(resolveQuickRange('2026-09-06', 90)).toEqual({ from: '2026-06-09', to: '2026-09-06' });
  });

  it('crosses month and year boundaries correctly', () => {
    expect(resolveQuickRange('2026-03-02', 7)).toEqual({ from: '2026-02-24', to: '2026-03-02' });
    expect(resolveQuickRange('2026-01-02', 7)).toEqual({ from: '2025-12-27', to: '2026-01-02' });
  });

  it('addDays supports negative deltas', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('validates date strings strictly', () => {
    expect(isValidDateString('2026-09-06')).toBe(true);
    expect(isValidDateString('2026-9-6')).toBe(false);
    expect(isValidDateString('2026/09/06')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(42)).toBe(false);
  });

  it('maps presets to day counts', () => {
    expect(presetToDays('7d')).toBe(7);
    expect(presetToDays('30d')).toBe(30);
    expect(presetToDays('90d')).toBe(90);
    expect(presetToDays('custom')).toBeNull();
  });
});
