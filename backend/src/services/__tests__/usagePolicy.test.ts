import { parseUsageFilter, shanghaiDay, csvCell, canViewUsage, canExportUsage } from '../usagePolicy';

describe('usage policy', () => {
  const now = new Date('2026-09-04T17:20:00Z');
  it('includes today and exactly seven Shanghai calendar dates', () => {
    const f = parseUsageFilter({ days: '7' }, now);
    expect(f.startAt.toISOString()).toBe('2026-08-29T16:00:00.000Z');
    expect(f.endAt).toEqual(now);
    expect(f.dates).toHaveLength(7);
    expect(f.dates[6]).toBe('2026-09-05');
  });
  it('includes a custom end date and rejects normalized invalid dates', () => {
    expect(parseUsageFilter({ startDate: '2026-01-01', endDate: '2026-01-31' }, now).endAt.toISOString()).toBe('2026-01-31T16:00:00.000Z');
    for (const q of [{ startDate: '2026-02-30' }, { days: ['7'] }, { days: 'abc' }, { days: '366' }, { startDate: '2026-09-06', endDate: '2026-09-05' }]) {
      expect(() => parseUsageFilter(q, now)).toThrow();
    }
  });
  it('clamps future end to today before computing the default start', () => {
    expect(parseUsageFilter({days:'7',endDate:'2027-01-01'},now).startDate).toBe('2026-08-30');
  });
  it('groups midnight and year boundaries in Shanghai', () => {
    expect(shanghaiDay(new Date('2025-12-31T16:00:00Z'))).toBe('2026-01-01');
  });
  it('quotes CSV and neutralizes whitespace-prefixed formulas', () => {
    expect(csvCell('a,"b\nc')).toBe('"a,""b\nc"');
    expect(csvCell('  =HYPERLINK("x")')).toBe('"\'  =HYPERLINK(""x"")"');
  });
  it('uses current role, active flag and explicit independent permissions', () => {
    expect(canViewUsage({ role: 'owner', isActive: true, permissions: [] })).toBe(true);
    expect(canViewUsage({ role: 'admin', isActive: true, permissions: ['usage-stats.view'] })).toBe(true);
    expect(canExportUsage({ role: 'admin', isActive: true, permissions: ['usage-stats.view'] })).toBe(false);
    expect(canExportUsage({ role: 'admin', isActive: true, permissions: ['usage-stats.export'] })).toBe(false);
    expect(canExportUsage({ role: 'admin', isActive: true, permissions: ['usage-stats.view', 'usage-stats.export'] })).toBe(true);
    expect(canViewUsage({ role: 'owner', isActive: false, permissions: [] })).toBe(false);
    expect(canViewUsage({ role: 'viewer', isActive: true, permissions: ['usage:view'] })).toBe(false);
  });
});
