import { buildReport, UsageGroup } from '../usageReport';
import { parseUsageFilter } from '../usagePolicy';

const filter = parseUsageFilter({ days: '2' }, new Date('2026-09-04T18:00:00Z'));
const group = (data: Partial<UsageGroup>): UsageGroup => ({ userId: 'u1', actorName: '甲', date: '2026-09-05', module: 'finance', action: 'finance_import', status: 'success', source: 'user', type: 'event', kind: '', count: 1n, affectedCount: 200n, outputCount: 0n, cost: '0', unpriced: 0n, ...data });
describe('usage aggregation invariants', () => {
  it('counts successful native generations independently from gallery and keeps decimal precision', () => {
    const report = buildReport(filter, [group({}), group({ type: 'ai', module: 'chroma', action: 'generation', kind: 'generation', outputCount: 2n, affectedCount: 0n, cost: '0.100001' }), group({ type: 'ai', module: 'chroma', action: 'analysis', kind: 'analysis', affectedCount: 0n, cost: '0.200002' }), group({ userId: 'deleted', actorName: '已删除', type: 'ai', module: 'chroma', kind: 'generation', status: 'unknown', affectedCount: 0n })], [], [{ userId: 'u1', count: 8 }], []);
    expect(report.summary).toMatchObject({ operationCount: 1, affectedCount: 200, generationCount: 1, imageCount: 2, analysisCount: 1, currentGalleryCount: 8, estimatedCost: '0.300003', activeUsers: 1, unknownCount: 1 });
    expect(report.timeline).toHaveLength(2);
    expect(report.timeline[0].generationCount).toBe(0);
    expect(report.timeline[1]).not.toHaveProperty('currentGalleryCount');
    expect(report.users.find(u => u.userId === 'deleted')?.displayName).toBe('已删除');
    for (const key of ['operationCount','generationCount','imageCount','analysisCount','affectedCount','unknownCount'] as const) {
      expect(report.users.reduce((a,u) => a+u[key],0)).toBe(report.summary[key]);
      expect(report.timeline.reduce((a,u) => a+u[key],0)).toBe(report.summary[key]);
    }
  });
  it('last login/activity is independent of period, and system events do not activate a user', () => {
    const report = buildReport(filter, [group({source:'system'})], [], [], [{ userId:'u1',lastLogin:new Date('2025-01-01Z'),lastActivity:new Date('2026-01-01Z') }]);
    expect(report.summary.activeUsers).toBe(0);
    expect(report.summary.operationCount).toBe(0);
    expect(report.summary.affectedCount).toBe(0);
    expect(report.users[0].lastLogin).toBe('2025-01-01T00:00:00.000Z');
  });
});
