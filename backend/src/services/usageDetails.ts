import { Prisma, PrismaClient } from '@prisma/client';
import { UsageFilter } from './usagePolicy';
import { nativeUsageRows, usageMeta } from './usageReport';

export function parseDetailsOptions(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 50);
  const kind = query.kind ?? 'all';
  if ((query.page !== undefined && (typeof query.page !== 'string' || !/^\d+$/.test(query.page))) || (query.pageSize !== undefined && (typeof query.pageSize !== 'string' || !/^\d+$/.test(query.pageSize))) || !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 || (page - 1) * pageSize > 10_000) throw new Error('分页参数无效或超出可浏览深度');
  if (typeof kind !== 'string' || !['all','event','ai','legacy','rebuilt'].includes(kind)) throw new Error('kind 无效');
  return { page, pageSize, kind };
}
function legacyUsageRows(f: UsageFilter): Prisma.Sql {
  const dates = Prisma.sql`"createdAt">=${f.startAt} AND "createdAt"<${f.endAt} ${f.userId ? Prisma.sql`AND "userId"=${f.userId}` : Prisma.empty}`;
  return Prisma.sql`SELECT "id", 'legacy_event'::text AS "type", "userId", NULL::text AS "actorName", "module", "action", 'unknown'::text AS "status", "createdAt" AS "occurredAt", NULL::text AS "objectType", NULL::text AS "objectId", NULL::integer AS "affectedCount", 'legacy'::text AS "source", 'legacy'::text AS "provenance", NULL::text AS "model", NULL::numeric AS "estimatedCost", 'CNY'::text AS "currency", 'historical-client-estimate'::text AS "pricingVersion", NULL::text AS "deliveryStatus", NULL::text AS "storageStatus", 'UserActivity'::text AS "legacySource", "id" AS "legacyId", NULL::text AS "operationId", NULL::text AS "providerRequestId", NULL::integer AS "outputCount" FROM "UserActivity" WHERE ${dates} ${f.module ? Prisma.sql`AND "module"=${f.module}` : Prisma.empty} ${f.status && f.status !== 'unknown' ? Prisma.sql`AND FALSE` : Prisma.empty}
  UNION ALL SELECT "id", 'legacy_ai'::text, "userId", NULL::text, 'chroma'::text, 'generation'::text, CASE WHEN "status"='error' THEN 'failed' ELSE "status" END, "createdAt", 'legacy_generation'::text, "id", NULL::integer, 'legacy'::text, 'legacy'::text, "model", "cost"::numeric, 'CNY'::text, 'historical-client-estimate'::text, NULL::text, NULL::text, 'ChromaGenerationRecord'::text, "id", NULL::text, NULL::text, NULL::integer FROM "ChromaGenerationRecord" WHERE ${dates} ${f.module && f.module !== 'chroma' ? Prisma.sql`AND FALSE` : Prisma.empty} ${f.status ? Prisma.sql`AND (CASE WHEN "status"='error' THEN 'failed' ELSE "status" END)=${f.status}` : Prisma.empty}`;
}
export async function getUsageDetails(db: PrismaClient, f: UsageFilter, options: ReturnType<typeof parseDetailsOptions>) {
  let rows: Prisma.Sql;
  if (options.kind === 'legacy') rows = legacyUsageRows(f);
  else if (options.kind === 'rebuilt') {
    rows = Prisma.sql`SELECT "id", 'rebuilt_event'::text AS "type", "actorId" AS "userId", "actorName", "module", "action", "status", "occurredAt", "objectType", "objectId", "affectedCount", "source", "provenance", "legacySource", "legacyId", "migrationBatch", "ruleVersion" FROM "UsageEvent" WHERE "provenance"='rebuilt' AND "occurredAt">=${f.startAt} AND "occurredAt"<${f.endAt} ${f.userId ? Prisma.sql`AND "actorId"=${f.userId}` : Prisma.empty} ${f.module ? Prisma.sql`AND "module"=${f.module}` : Prisma.empty} ${f.status ? Prisma.sql`AND "status"=${f.status}` : Prisma.empty}`;
  } else rows = Prisma.sql`SELECT * FROM (${nativeUsageRows(f)}) n ${options.kind === 'all' ? Prisma.empty : Prisma.sql`WHERE "type"=${options.kind}`}`;
  return db.$transaction(async tx => {
    const [items, totals] = await Promise.all([
      tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT * FROM (${rows}) rows ORDER BY "occurredAt" DESC, "type", "id" LIMIT ${options.pageSize} OFFSET ${(options.page-1)*options.pageSize}`),
      tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "count" FROM (${rows}) rows`),
    ]);
    return { items, total: Number(totals[0].count), page: options.page, pageSize: options.pageSize, meta: usageMeta(f) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
