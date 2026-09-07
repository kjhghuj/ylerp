"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordUsageEvent = recordUsageEvent;
exports.withUsageEvent = withUsageEvent;
const node_crypto_1 = require("node:crypto");
/** Append only. Call with the same transaction client as the business mutation. */
async function recordUsageEvent(tx, event) {
    const affectedCount = event.affectedCount ?? 1;
    if (!Number.isSafeInteger(affectedCount) || affectedCount < 0) {
        throw new Error('Invalid usage event affectedCount');
    }
    await tx.usageEvent.create({ data: {
            ...event,
            eventKey: event.eventKey ?? (0, node_crypto_1.randomUUID)(),
            source: event.source ?? 'user',
            status: event.status ?? 'success',
            affectedCount,
            provenance: 'native',
        } });
}
/** Explicit business boundary, never an HTTP response hook. Fail closed on event loss. */
async function withUsageEvent(db, req, event, operation, options) {
    if (!req.user)
        throw new Error('Usage event actor is required');
    const eventKey = event.eventKey ?? (0, node_crypto_1.randomUUID)();
    return db.$transaction(async (tx) => {
        const result = await operation(tx);
        const record = result && typeof result === 'object' ? result : {};
        const objectId = typeof event.objectId === 'function'
            ? event.objectId(result) : event.objectId ?? (typeof record.id === 'string' ? record.id : undefined);
        const affectedCount = typeof event.affectedCount === 'function'
            ? event.affectedCount(result) : event.affectedCount ?? (typeof record.count === 'number' ? record.count : 1);
        await recordUsageEvent(tx, {
            ...event, eventKey, objectId, affectedCount,
            actorId: req.user.id,
            actorName: req.user.username,
        });
        return result;
    }, options);
}
