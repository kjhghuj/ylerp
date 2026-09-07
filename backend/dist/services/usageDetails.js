"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDetailsOptions = parseDetailsOptions;
exports.getUsageDetails = getUsageDetails;
const client_1 = require("@prisma/client");
const usageReport_1 = require("./usageReport");
function parseDetailsOptions(query) {
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 50);
    const kind = query.kind ?? 'all';
    if ((query.page !== undefined && (typeof query.page !== 'string' || !/^\d+$/.test(query.page))) || (query.pageSize !== undefined && (typeof query.pageSize !== 'string' || !/^\d+$/.test(query.pageSize))) || !Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200)
        throw new Error('分页参数无效');
    if (typeof kind !== 'string' || !['all', 'event', 'ai', 'legacy', 'rebuilt'].includes(kind))
        throw new Error('kind 无效');
    return { page, pageSize, kind };
}
function legacyUsageRows(f) {
    const dates = client_1.Prisma.sql `"createdAt">=${f.startAt} AND "createdAt"<${f.endAt} ${f.userId ? client_1.Prisma.sql `AND "userId"=${f.userId}` : client_1.Prisma.empty}`;
    return client_1.Prisma.sql `SELECT "id", 'legacy_event'::text AS "type", "userId", NULL::text AS "actorName", "module", "action", 'unknown'::text AS "status", "createdAt" AS "occurredAt", NULL::text AS "objectType", NULL::text AS "objectId", NULL::integer AS "affectedCount", 'legacy'::text AS "source", 'legacy'::text AS "provenance", NULL::text AS "model", NULL::numeric AS "estimatedCost", 'CNY'::text AS "currency", 'historical-client-estimate'::text AS "pricingVersion", NULL::text AS "deliveryStatus", NULL::text AS "storageStatus", 'UserActivity'::text AS "legacySource", "id" AS "legacyId", NULL::text AS "operationId", NULL::text AS "providerRequestId", NULL::integer AS "outputCount" FROM "UserActivity" WHERE ${dates} ${f.module ? client_1.Prisma.sql `AND "module"=${f.module}` : client_1.Prisma.empty} ${f.status && f.status !== 'unknown' ? client_1.Prisma.sql `AND FALSE` : client_1.Prisma.empty}
  UNION ALL SELECT "id", 'legacy_ai'::text, "userId", NULL::text, 'chroma'::text, 'generation'::text, CASE WHEN "status"='error' THEN 'failed' ELSE "status" END, "createdAt", 'legacy_generation'::text, "id", NULL::integer, 'legacy'::text, 'legacy'::text, "model", "cost"::numeric, 'CNY'::text, 'historical-client-estimate'::text, NULL::text, NULL::text, 'ChromaGenerationRecord'::text, "id", NULL::text, NULL::text, NULL::integer FROM "ChromaGenerationRecord" WHERE ${dates} ${f.module && f.module !== 'chroma' ? client_1.Prisma.sql `AND FALSE` : client_1.Prisma.empty} ${f.status ? client_1.Prisma.sql `AND (CASE WHEN "status"='error' THEN 'failed' ELSE "status" END)=${f.status}` : client_1.Prisma.empty}`;
}
async function getUsageDetails(db, f, options) {
    let rows;
    if (options.kind === 'legacy')
        rows = legacyUsageRows(f);
    else if (options.kind === 'rebuilt') {
        rows = client_1.Prisma.sql `SELECT "id", 'rebuilt_event'::text AS "type", "actorId" AS "userId", "actorName", "module", "action", "status", "occurredAt", "objectType", "objectId", "affectedCount", "source", "provenance", "legacySource", "legacyId", "migrationBatch", "ruleVersion" FROM "UsageEvent" WHERE "provenance"='rebuilt' AND "occurredAt">=${f.startAt} AND "occurredAt"<${f.endAt} ${f.userId ? client_1.Prisma.sql `AND "actorId"=${f.userId}` : client_1.Prisma.empty} ${f.module ? client_1.Prisma.sql `AND "module"=${f.module}` : client_1.Prisma.empty} ${f.status ? client_1.Prisma.sql `AND "status"=${f.status}` : client_1.Prisma.empty}`;
    }
    else
        rows = client_1.Prisma.sql `SELECT * FROM (${(0, usageReport_1.nativeUsageRows)(f)}) n ${options.kind === 'all' ? client_1.Prisma.empty : client_1.Prisma.sql `WHERE "type"=${options.kind}`}`;
    return db.$transaction(async (tx) => {
        const [items, totals] = await Promise.all([
            tx.$queryRaw(client_1.Prisma.sql `SELECT * FROM (${rows}) rows ORDER BY "occurredAt" DESC, "type", "id" LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}`),
            tx.$queryRaw(client_1.Prisma.sql `SELECT COUNT(*) AS "count" FROM (${rows}) rows`),
        ]);
        return { items, total: Number(totals[0].count), page: options.page, pageSize: options.pageSize, meta: (0, usageReport_1.usageMeta)(f) };
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
