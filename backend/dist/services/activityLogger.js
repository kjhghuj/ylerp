"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const index_1 = require("../index");
async function logActivity(userId, action, module, metadata, ip) {
    try {
        await index_1.prisma.userActivity.create({
            data: {
                userId,
                action,
                module,
                metadata: metadata || undefined,
                ip: ip || undefined,
            },
        });
    }
    catch (error) {
        console.error('Failed to log activity:', error);
    }
}
