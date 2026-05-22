"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.use((0, authMiddleware_1.authorize)('owner', 'admin'));
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate, userId, days } = req.query;
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        else if (days) {
            const d = new Date();
            d.setDate(d.getDate() - Math.min(365, Math.max(1, parseInt(days) || 30)));
            dateFilter.gte = d;
        }
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const hasDateFilter = Object.keys(dateFilter).length > 0;
        const activityDateFilter = hasDateFilter ? { createdAt: dateFilter } : {};
        const userWhere = {};
        if (userId)
            userWhere.id = userId;
        // Batch queries: 5 total instead of 5N+1
        const [users, activityGroups, imageCounts, generationAggs] = await Promise.all([
            index_1.prisma.user.findMany({
                select: { id: true, username: true, displayName: true, role: true, createdAt: true },
                where: userWhere,
                orderBy: { createdAt: 'desc' },
            }),
            index_1.prisma.userActivity.groupBy({
                by: ['userId', 'action'],
                where: activityDateFilter,
                _count: { id: true },
            }),
            index_1.prisma.chromaImage.groupBy({
                by: ['userId'],
                where: activityDateFilter,
                _count: { id: true },
            }),
            index_1.prisma.chromaGenerationRecord.groupBy({
                by: ['userId'],
                where: { status: 'success', ...activityDateFilter },
                _sum: { cost: true },
                _count: { id: true },
            }),
        ]);
        // Get last login per user (avoid DISTINCT ON which is error-prone across Prisma/PG versions)
        const allLogins = await index_1.prisma.userActivity.findMany({
            where: { action: 'login', ...activityDateFilter },
            orderBy: { createdAt: 'desc' },
            select: { userId: true, createdAt: true, ip: true },
        });
        const lastLoginMap = new Map();
        for (const login of allLogins) {
            if (!lastLoginMap.has(login.userId)) {
                lastLoginMap.set(login.userId, login);
            }
        }
        // Build lookup maps
        const imageMap = new Map(imageCounts.map(i => [i.userId, i._count.id]));
        const genMap = new Map(generationAggs.map(g => [g.userId, { count: g._count.id, cost: g._sum.cost || 0 }]));
        // Group activities by userId
        const activityMap = new Map();
        let totalLoginMap = new Map();
        for (const item of activityGroups) {
            if (!activityMap.has(item.userId))
                activityMap.set(item.userId, {});
            activityMap.get(item.userId)[item.action] = item._count.id;
            if (item.action === 'login')
                totalLoginMap.set(item.userId, item._count.id);
        }
        const stats = users.map(user => ({
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            createdAt: user.createdAt,
            loginCount: totalLoginMap.get(user.id) || 0,
            lastLogin: lastLoginMap.get(user.id)?.createdAt || null,
            lastLoginIp: lastLoginMap.get(user.id)?.ip || null,
            imageCount: imageMap.get(user.id) || 0,
            generationCount: genMap.get(user.id)?.count || 0,
            generationCost: genMap.get(user.id)?.cost || 0,
            actions: activityMap.get(user.id) || {},
        }));
        res.json({ users: stats });
    }
    catch (error) {
        console.error('Error fetching usage stats:', error);
        res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
});
router.get('/timeline', async (req, res) => {
    try {
        const { days = '30', userId } = req.query;
        const numDays = Math.min(365, Math.max(1, parseInt(days) || 30));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - numDays);
        const whereClause = {
            createdAt: { gte: startDate },
        };
        if (userId)
            whereClause.userId = userId;
        const activities = await index_1.prisma.userActivity.findMany({
            where: whereClause,
            select: { action: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
        const dailyMap = {};
        for (const item of activities) {
            const day = item.createdAt.toISOString().split('T')[0];
            if (!dailyMap[day])
                dailyMap[day] = {};
            dailyMap[day][item.action] = (dailyMap[day][item.action] || 0) + 1;
        }
        const timeline = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, actions]) => ({ date, ...actions }));
        res.json({ timeline });
    }
    catch (error) {
        console.error('Error fetching usage timeline:', error);
        res.status(500).json({ error: 'Failed to fetch usage timeline' });
    }
});
// Clear all activity data (owner only)
router.delete('/activity', (0, authMiddleware_1.authorize)('owner'), async (_req, res) => {
    try {
        const r = await index_1.prisma.userActivity.deleteMany();
        res.json({ message: 'Activity cleared', count: r.count });
    }
    catch (error) {
        console.error('Error clearing activity:', error);
        res.status(500).json({ error: 'Failed to clear activity' });
    }
});
exports.default = router;
