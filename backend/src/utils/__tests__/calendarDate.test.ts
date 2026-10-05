import { addDays, diffDays, isValidCalendarDate, parseCalendarRange, parseDateUtc } from '../calendarDate';
import { yesterdayInTz } from '../../collector/dates';

describe('shared calendar dates', () => {
  it.each(['2024-02-29', '2026-10-05', '0000-01-01'])('accepts valid calendar date %s', value => {
    expect(isValidCalendarDate(value)).toBe(true);
  });
  it.each(['2026-02-29', '2026-02-31', '2026-13-01', '2026-10-5', '', null, ['2026-10-05']])('rejects %j without normalization', value => {
    expect(isValidCalendarDate(value)).toBe(false);
  });
  it('uses UTC calendar days across leap years and server timezones', () => {
    expect(parseDateUtc('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2);
  });
  it('counts both endpoints when enforcing calendar range limits', () => {
    expect(parseCalendarRange({ from: '2024-01-01', to: '2024-12-31' }, 366))
      .toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(parseCalendarRange({ from: '2024-01-01', to: '2025-01-01' }, 366)).toBeNull();
    expect(parseCalendarRange({ from: '2024-02-29', to: '2024-02-29' }, 1))
      .toEqual({ from: '2024-02-29', to: '2024-02-29' });
  });
  it.each([
    {},
    { from: '2024-02-28' },
    { from: '2024-02-31', to: '2024-03-01' },
    { from: '2024-03-01', to: '2024-02-29' },
    { from: ['2024-02-29'], to: '2024-03-01' },
    { from: ' 2024-02-29 ', to: '2024-03-01' },
  ])('rejects malformed, incomplete or reversed calendar range %j', query => {
    expect(parseCalendarRange(query, 366)).toBeNull();
  });
  it('returns the previous local date during a 25-hour daylight-saving day', () => {
    const at = Date.parse('2026-11-02T07:30:00.000Z'); // Nov 1 23:30 in Los Angeles.
    expect(yesterdayInTz('America/Los_Angeles', at)).toBe('2026-10-31');
  });
});
