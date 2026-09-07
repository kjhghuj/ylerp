import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { auditUsageHistory, rebuildUsageHistory } from '../usageHistory';

const databaseUrl = process.env.USAGE_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('usage history audit and rebuild on PostgreSQL', () => {
  const db = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
  const userId = `usage-history-${randomUUID()}`;
  const sourceIds: string[] = [];

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.includes('test')) {
      throw new Error('Requires an isolated test database');
    }
    await db.user.create({ data: { id: userId, username: userId, displayName: '历史核对测试', password: 'unused' } });
    const activities = await Promise.all([
      db.userActivity.create({ data: { userId, module: 'auth', action: 'login', createdAt: new Date('2026-09-06T16:10:00Z') } }),
      db.userActivity.create({ data: { userId, module: 'chroma', action: 'image_generate', createdAt: new Date('2026-09-06T16:20:00Z') } }),
    ]);
    sourceIds.push(...activities.map(row => row.id));
    const generation = await db.chromaGenerationRecord.create({
      data: { userId, mode: 'legacy', model: 'legacy', cost: 0.5, status: 'success', createdAt: new Date('2026-09-06T16:20:00Z') },
    });
    sourceIds.push(generation.id);
  });

  afterAll(async () => {
    await db.usageEvent.deleteMany({ where: { actorId: userId } });
    await db.aiUsageCall.deleteMany({ where: { userId } });
    await db.userActivity.deleteMany({ where: { userId } });
    await db.chromaGenerationRecord.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('audits raw rows without combining duplicate-looking sources', async () => {
    const before = await db.userActivity.count({ where: { userId } });
    const audit = await auditUsageHistory(db);
    const row = audit.rows.find(candidate => candidate.userId === userId);
    expect(row).toMatchObject({
      date: '2026-09-07', activityCount: 2, rawGenerationActivityCount: 1,
      generationRecordCount: 1, reportedSuccessCount: 1, historicalReportedEstimate: '0.5',
    });
    expect(await db.userActivity.count({ where: { userId } })).toBe(before);
  });

  it('rebuilds provenance idempotently and never changes raw source rows', async () => {
    const first = await rebuildUsageHistory(db, 'history-test');
    const second = await rebuildUsageHistory(db, 'history-test-retry');
    expect(first).toMatchObject({ insertedEvents: 2, insertedCalls: 1 });
    expect(second).toMatchObject({ insertedEvents: 0, insertedCalls: 0 });
    expect(await db.usageEvent.count({ where: { actorId: userId } })).toBe(2);
    expect(await db.aiUsageCall.count({ where: { userId } })).toBe(1);
    expect(await db.userActivity.count({ where: { id: { in: sourceIds } } })).toBe(2);
    expect(await db.chromaGenerationRecord.count({ where: { id: { in: sourceIds } } })).toBe(1);
  });
});
