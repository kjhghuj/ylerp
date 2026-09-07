import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient, type UserActivity, type ChromaGenerationRecord } from '@prisma/client';

export const HISTORY_RULE = 'usage-history-v1';

/** Read-only, works before the new ledger migration is applied. No prompt/IP data is returned. */
export async function auditUsageHistory(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH sources AS (
        SELECT "userId", "createdAt", 'activity'::text AS source, "action", NULL::double precision AS cost, NULL::text AS status FROM "UserActivity"
        UNION ALL SELECT "userId", "createdAt", 'generation', 'generation', cost, status FROM "ChromaGenerationRecord"
        UNION ALL SELECT "userId", "createdAt", 'gallery', 'gallery', NULL::double precision, NULL::text FROM "ChromaImage"
      ) SELECT "userId", to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS date,
        COUNT(*) FILTER(WHERE source='activity')::int AS "activityCount",
        COUNT(*) FILTER(WHERE source='activity' AND action='image_generate')::int AS "rawGenerationActivityCount",
        COUNT(*) FILTER(WHERE source='generation')::int AS "generationRecordCount",
        COUNT(*) FILTER(WHERE source='generation' AND status='success')::int AS "reportedSuccessCount",
        COUNT(*) FILTER(WHERE source='gallery')::int AS "currentGalleryCount",
        COUNT(*) FILTER(WHERE source='generation' AND (cost < 0 OR cost::text IN ('NaN','Infinity','-Infinity')))::int AS "invalidCostCount",
        COALESCE(SUM(cost::numeric) FILTER(WHERE source='generation' AND cost>=0 AND cost::text NOT IN ('NaN','Infinity','-Infinity')),0)::text AS "historicalReportedEstimate"
      FROM sources GROUP BY "userId", date ORDER BY date, "userId"`);
    return { ruleVersion: HISTORY_RULE, timezone: 'Asia/Shanghai', auditedAt: new Date().toISOString(), rows,
      notes: ['只读源记录计数，不依据时间接近推测重复。', '图库为当前存量；历史上报金额并非已核验供应商费用。', '原始 image_generate 与生成记录分别列示，不相加。'] };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 });
}

/** Copies provenance, never changes a raw row or upgrades an unverified AI result to trusted usage. */
export async function rebuildUsageHistory(db: PrismaClient, batch: string) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(batch)) throw new Error('batch 必须为 1-100 位字母、数字、点、横线或下划线');
  return db.$transaction(async tx => {
    // Serialize import runs while unique source IDs make retries idempotent.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83192457)`;
    let events = 0, calls = 0;
    const actors = new Map((await tx.user.findMany({ select: { id: true, displayName: true } })).map(u => [u.id,u.displayName]));
    let cursor: string | undefined;
    for (;;) {
      const page: UserActivity[] = await tx.userActivity.findMany({ orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!page.length) break;
      const inserted = await tx.usageEvent.createMany({ skipDuplicates: true, data: page.map(row => ({
        id: randomUUID(), actorId: row.userId, actorName: actors.get(row.userId), module: row.module, action: row.action,
        status: row.action === 'login' ? 'success' : 'unknown', source: 'user', affectedCount: 0,
        occurredAt: row.createdAt, eventKey: `history:UserActivity:${row.id}`, provenance: row.action === 'login' ? 'rebuilt' : 'legacy',
        legacySource: 'UserActivity', legacyId: row.id, migrationBatch: batch, ruleVersion: HISTORY_RULE,
        metadata: { confidence: row.action === 'login' ? 'legacy-authentication-event' : 'unverified', note: '原始条数不代表影响条数；不推断重复或缺失' },
      })) });
      events += inserted.count; cursor = page[page.length-1].id;
    }
    cursor = undefined;
    for (;;) {
      const page: ChromaGenerationRecord[] = await tx.chromaGenerationRecord.findMany({ orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!page.length) break;
      const inserted = await tx.aiUsageCall.createMany({ skipDuplicates: true, data: page.map(row => ({
        id: randomUUID(), userId: row.userId, actorName: actors.get(row.userId), requestKey: `history:${row.id}`,
        operationId: `history:${row.id}`, requestHash: createHash('sha256').update(`ChromaGenerationRecord:${row.id}`).digest('hex'),
        kind: 'generation', module: 'chroma', mode: row.mode, model: row.model, status: 'unknown', startedAt: row.createdAt,
        outputCount: 0, estimatedCost: null, currency: 'CNY', pricingVersion: 'historical-client-estimate',
        deliveryStatus: 'unknown', storageStatus: 'unknown', provenance: 'legacy', legacySource: 'ChromaGenerationRecord',
        legacyId: row.id, migrationBatch: batch, ruleVersion: HISTORY_RULE,
        result: { reportedStatus: row.status, reportedCost: String(row.cost), reportedImageId: row.imageId, confidence: 'unverified' },
      })) });
      calls += inserted.count; cursor = page[page.length-1].id;
    }
    return { batch, ruleVersion: HISTORY_RULE, insertedEvents: events, insertedCalls: calls };
  }, { timeout: 120_000 });
}
