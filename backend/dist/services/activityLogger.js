"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const index_1 = require("../index");
const usageEvents_1 = require("./usageEvents");
/** Compatibility only. Business mutations must use withUsageEvent with their transaction. */
async function logActivity(userId, action, module, metadata, ip) {
    await (0, usageEvents_1.recordUsageEvent)(index_1.prisma, {
        actorId: userId, action, module,
        actorName: typeof metadata?.username === 'string' ? metadata.username : undefined,
        metadata: metadata || ip ? { ...metadata, ...(ip ? { ip } : {}) } : undefined,
    });
}
