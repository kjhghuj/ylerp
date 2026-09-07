"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageMeta = void 0;
exports.buildReport = buildReport;
exports.nativeUsageRows = nativeUsageRows;
exports.getUsageReport = getUsageReport;
const client_1 = require("@prisma/client");
const usagePolicy_1 = require("./usagePolicy");
const zero = () => ({ activeUsers: 0, activeDays: 0, loginCount: 0, operationCount: 0, affectedCount: 0, generationCount: 0, imageCount: 0, analysisCount: 0, currentGalleryCount: 0, estimatedCost: '0.000000', analysisCost: '0.000000', generationCost: '0.000000', pendingCount: 0, failedCount: 0, unknownCount: 0, unpricedCount: 0 });
const usageMeta = (f) => ({ timezone: 'Asia/Shanghai', currency: 'CNY', version: usagePolicy_1.USAGE_VERSION, asOf: f.asOf.toISOString(), startDate: f.startDate, endDate: f.endDate, startAt: f.startAt.toISOString(), endAt: f.endAt.toISOString() });
exports.usageMeta = usageMeta;
function addGroup(target, g) {
    const count = Number(g.count);
    if (g.type === 'event' && g.status === 'success' && g.source === 'user') {
        if (g.action === 'login')
            target.loginCount += count;
        else {
            target.operationCount += count;
            target.affectedCount += Number(g.affectedCount);
        }
    }
    if (g.type !== 'ai')
        return;
    if (g.status === 'pending')
        target.pendingCount += count;
    if (g.status === 'failed')
        target.failedCount += count;
    if (g.status === 'unknown')
        target.unknownCount += count;
    if (g.status !== 'success')
        return;
    target.unpricedCount += Number(g.unpriced);
    if (g.kind === 'generation') {
        target.generationCount += count;
        target.imageCount += Number(g.outputCount);
    }
    if (g.kind === 'analysis')
        target.analysisCount += count;
    target.estimatedCost = new client_1.Prisma.Decimal(target.estimatedCost).plus(g.cost).toFixed(6);
    const costKey = g.kind === 'analysis' ? 'analysisCost' : 'generationCost';
    target[costKey] = new client_1.Prisma.Decimal(target[costKey]).plus(g.cost).toFixed(6);
}
function buildReport(f, groups, users, gallery, last) {
    const summary = zero();
    const userMap = new Map(users.map(u => [u.id, { ...zero(), userId: u.id, username: u.username, displayName: u.displayName, role: u.role, isActive: u.isActive, lastLogin: null, lastActivity: null }]));
    const days = new Map(f.dates.map(date => [date, { ...zero(), date }]));
    const modules = new Map();
    const activeUsers = new Set(), activeDays = new Set();
    const userDays = new Map(), dayUsers = new Map();
    for (const g of groups) {
        if (!userMap.has(g.userId))
            userMap.set(g.userId, { ...zero(), userId: g.userId, username: g.userId, displayName: g.actorName || '历史账号', role: 'deleted', isActive: false, lastLogin: null, lastActivity: null });
        const user = userMap.get(g.userId);
        addGroup(summary, g);
        addGroup(user, g);
        const day = days.get(g.date);
        if (day)
            addGroup(day, g);
        if (g.status === 'success' && g.source === 'user') {
            activeUsers.add(g.userId);
            activeDays.add(g.date);
            if (!userDays.has(g.userId))
                userDays.set(g.userId, new Set());
            userDays.get(g.userId).add(g.date);
            if (!dayUsers.has(g.date))
                dayUsers.set(g.date, new Set());
            dayUsers.get(g.date).add(g.userId);
        }
        if (!modules.has(g.module))
            modules.set(g.module, { module: g.module, operationCount: 0, affectedCount: 0, generationCount: 0, analysisCount: 0 });
        const mod = modules.get(g.module);
        if (g.status === 'success') {
            if (g.type === 'event' && g.action !== 'login' && g.source === 'user') {
                mod.operationCount += Number(g.count);
                mod.affectedCount += Number(g.affectedCount);
            }
            if (g.type === 'ai' && g.kind === 'generation')
                mod.generationCount += Number(g.count);
            if (g.type === 'ai' && g.kind === 'analysis')
                mod.analysisCount += Number(g.count);
        }
    }
    for (const g of gallery) {
        const user = userMap.get(g.userId);
        if (user) {
            user.currentGalleryCount = g.count;
            summary.currentGalleryCount += g.count;
        }
    }
    for (const l of last) {
        const user = userMap.get(l.userId);
        if (user) {
            user.lastLogin = l.lastLogin?.toISOString() || null;
            user.lastActivity = l.lastActivity?.toISOString() || null;
        }
    }
    summary.activeUsers = activeUsers.size;
    summary.activeDays = activeDays.size;
    for (const [id, u] of userMap) {
        u.activeDays = userDays.get(id)?.size || 0;
        u.activeUsers = u.activeDays ? 1 : 0;
    }
    const timeline = [...days].map(([date, d]) => { const { currentGalleryCount: _gallery, ...metrics } = d; return { ...metrics, activeUsers: dayUsers.get(date)?.size || 0, activeDays: activeDays.has(date) ? 1 : 0 }; });
    return { meta: (0, exports.usageMeta)(f), summary, timeline, users: [...userMap.values()], modules: [...modules.values()], quality: { legacyEventCount: 0, legacyGenerationCount: 0, legacyEstimatedCost: '0.000000', unpricedCalls: summary.unpricedCount, stalePendingCalls: 0, unknownCalls: summary.unknownCount, nativeRecordingSince: null, notes: ['主统计仅包含新口径记录；历史记录单独列示。', 'AI 调用按开始时间归日；图库数量为当前存量，不受日期、模块和结果筛选影响。', '活跃账号和活跃天数为去重指标，不能跨账号或日期直接相加。', '预估费用仅汇总成功且已计价调用，未计价和结果未知不代表免费。'] } };
}
// Prisma stores DateTime as UTC timestamp without time zone. Attach UTC before Shanghai conversion.
function nativeUsageRows(f) {
    const ev = client_1.Prisma.sql `"occurredAt" >= ${f.startAt} AND "occurredAt" < ${f.endAt} AND "provenance" = 'native'
    ${f.userId ? client_1.Prisma.sql `AND "actorId" = ${f.userId}` : client_1.Prisma.empty}
    ${f.module ? client_1.Prisma.sql `AND "module" = ${f.module}` : client_1.Prisma.empty}
    ${f.status ? client_1.Prisma.sql `AND "status" = ${f.status}` : client_1.Prisma.empty}`;
    const ai = client_1.Prisma.sql `"startedAt" >= ${f.startAt} AND "startedAt" < ${f.endAt} AND "provenance" = 'native'
    ${f.userId ? client_1.Prisma.sql `AND "userId" = ${f.userId}` : client_1.Prisma.empty}
    ${f.module ? client_1.Prisma.sql `AND "module" = ${f.module}` : client_1.Prisma.empty}
    ${f.status ? client_1.Prisma.sql `AND "status" = ${f.status}` : client_1.Prisma.empty}`;
    return client_1.Prisma.sql `SELECT "id", 'event'::text AS "type", "actorId" AS "userId", "actorName", "module", "action", "status", "source", "occurredAt", "objectType", "objectId", "affectedCount", 0 AS "outputCount", NULL::numeric AS "estimatedCost", ''::text AS "kind", NULL::text AS "model", 'CNY'::text AS "currency", NULL::text AS "pricingVersion", NULL::text AS "deliveryStatus", NULL::text AS "storageStatus", NULL::text AS "operationId", NULL::text AS "providerRequestId", "provenance", "legacySource", "legacyId" FROM "UsageEvent" WHERE ${ev}
  UNION ALL SELECT "id", 'ai'::text, "userId", "actorName", "module", "kind", "status", 'user'::text, "startedAt", 'ai_call'::text, "id", 0, "outputCount", "estimatedCost", "kind", "model", "currency", "pricingVersion", "deliveryStatus", "storageStatus", "operationId", "providerRequestId", "provenance", "legacySource", "legacyId" FROM "AiUsageCall" WHERE ${ai}`;
}
async function getUsageReport(db, filter) {
    return db.$transaction(async (tx) => {
        const [groups, users, gallery, last, legacyEvents, legacyCalls, stale, nativeStart] = await Promise.all([
            tx.$queryRaw(client_1.Prisma.sql `WITH rows AS (${nativeUsageRows(filter)}) SELECT "userId", MAX("actorName") AS "actorName", to_char("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS "date", "module", "action", "status", "source", "type", "kind", COUNT(*) AS "count", SUM("affectedCount")::bigint AS "affectedCount", SUM("outputCount")::bigint AS "outputCount", COALESCE(SUM("estimatedCost"),0)::text AS "cost", COUNT(*) FILTER(WHERE "type"='ai' AND "estimatedCost" IS NULL)::bigint AS "unpriced" FROM rows GROUP BY "userId", "date", "module", "action", "status", "source", "type", "kind"`),
            tx.user.findMany({ where: filter.userId ? { id: filter.userId } : {}, select: { id: true, username: true, displayName: true, role: true, isActive: true }, orderBy: { createdAt: 'asc' } }),
            tx.chromaImage.groupBy({ by: ['userId'], where: filter.userId ? { userId: filter.userId } : {}, _count: { id: true } }),
            tx.$queryRaw(client_1.Prisma.sql `WITH history AS (
        SELECT "actorId" AS "userId", "action", "occurredAt" AS "at" FROM "UsageEvent" WHERE "status"='success' AND "source"='user' ${filter.userId ? client_1.Prisma.sql `AND "actorId"=${filter.userId}` : client_1.Prisma.empty}
        UNION ALL SELECT "userId", 'ai_call', "startedAt" FROM "AiUsageCall" WHERE "status"='success' ${filter.userId ? client_1.Prisma.sql `AND "userId"=${filter.userId}` : client_1.Prisma.empty}
        UNION ALL SELECT "userId", "action", "createdAt" FROM "UserActivity" WHERE "action"='login' ${filter.userId ? client_1.Prisma.sql `AND "userId"=${filter.userId}` : client_1.Prisma.empty}
      ) SELECT "userId", MAX("at") FILTER (WHERE "action"='login') AS "lastLogin", MAX("at") AS "lastActivity" FROM history WHERE "at" < ${filter.asOf} GROUP BY "userId"`),
            tx.userActivity.count({ where: { createdAt: { gte: filter.startAt, lt: filter.endAt }, ...(filter.userId ? { userId: filter.userId } : {}), ...(filter.module ? { module: filter.module } : {}), ...(filter.status && filter.status !== 'unknown' ? { id: '__no_legacy_status__' } : {}) } }),
            tx.chromaGenerationRecord.aggregate({ where: { createdAt: { gte: filter.startAt, lt: filter.endAt }, ...(filter.userId ? { userId: filter.userId } : {}), ...(filter.module && filter.module !== 'chroma' ? { id: '__no_chroma_module__' } : {}), ...(filter.status ? { status: filter.status === 'failed' ? { in: ['failed', 'error'] } : filter.status } : {}) }, _count: { id: true }, _sum: { cost: true } }),
            tx.aiUsageCall.count({ where: { provenance: 'native', status: 'pending', startedAt: { gte: filter.startAt, lt: new Date(Math.min(filter.endAt.getTime(), filter.asOf.getTime() - 15 * 60_000)) }, ...(filter.userId ? { userId: filter.userId } : {}), ...(filter.module ? { module: filter.module } : {}), ...(filter.status && filter.status !== 'pending' ? { id: '__no_pending_status__' } : {}) } }),
            tx.$queryRaw(client_1.Prisma.sql `SELECT MIN("at") AS "at" FROM (SELECT MIN("occurredAt") AS "at" FROM "UsageEvent" WHERE "provenance"='native' UNION ALL SELECT MIN("startedAt") FROM "AiUsageCall" WHERE "provenance"='native') s`),
        ]);
        const report = buildReport(filter, groups, users, gallery.map(g => ({ userId: g.userId, count: g._count.id })), last);
        report.quality.legacyEventCount = legacyEvents;
        report.quality.legacyGenerationCount = legacyCalls._count.id;
        report.quality.legacyEstimatedCost = new client_1.Prisma.Decimal(legacyCalls._sum.cost || 0).toFixed(6);
        report.quality.stalePendingCalls = stale;
        report.quality.nativeRecordingSince = nativeStart[0]?.at?.toISOString() || null;
        return report;
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
