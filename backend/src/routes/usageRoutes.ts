import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { prisma } from '../index';

const router = Router();

router.use(authenticate);
router.use(authorize('owner', 'admin'));

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId, days } = req.query;

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    else if (days) {
      const d = new Date();
      d.setDate(d.getDate() - Math.min(365, Math.max(1, parseInt(days as string) || 30)));
      dateFilter.gte = d;
    }
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const hasDateFilter = Object.keys(dateFilter).length > 0;
    const activityDateFilter = hasDateFilter ? { createdAt: dateFilter } : {};

    const userWhere: Record<string, unknown> = {};
    if (userId) userWhere.id = userId;

    // Batch queries: 5 total instead of 5N+1
    const [users, activityGroups, imageCounts, generationAggs] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, username: true, displayName: true, role: true, createdAt: true },
        where: userWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userActivity.groupBy({
        by: ['userId', 'action'],
        where: activityDateFilter,
        _count: { id: true },
      }),
      prisma.chromaImage.groupBy({
        by: ['userId'],
        where: activityDateFilter,
        _count: { id: true },
      }),
      prisma.chromaGenerationRecord.groupBy({
        by: ['userId'],
        where: { status: 'success', ...activityDateFilter },
        _sum: { cost: true },
        _count: { id: true },
      }),
    ]);

    // Get last login per user (avoid DISTINCT ON which is error-prone across Prisma/PG versions)
    const allLogins = await prisma.userActivity.findMany({
      where: { action: 'login', ...activityDateFilter },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, createdAt: true, ip: true },
    });
    const lastLoginMap = new Map<string, typeof allLogins[0]>();
    for (const login of allLogins) {
      if (!lastLoginMap.has(login.userId)) {
        lastLoginMap.set(login.userId, login);
      }
    }

    // Build lookup maps
    const imageMap = new Map(imageCounts.map(i => [i.userId, i._count.id]));
    const genMap = new Map(generationAggs.map(g => [g.userId, { count: g._count.id, cost: g._sum.cost || 0 }]));

    // Group activities by userId
    const activityMap = new Map<string, Record<string, number>>();
    let totalLoginMap = new Map<string, number>();
    for (const item of activityGroups) {
      if (!activityMap.has(item.userId)) activityMap.set(item.userId, {});
      activityMap.get(item.userId)![item.action] = item._count.id;
      if (item.action === 'login') totalLoginMap.set(item.userId, item._count.id);
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
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
});

router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const { days = '30', userId } = req.query;
    const numDays = Math.min(365, Math.max(1, parseInt(days as string) || 30));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);

    const whereClause: Record<string, unknown> = {
      createdAt: { gte: startDate },
    };
    if (userId) whereClause.userId = userId;

    const activities = await prisma.userActivity.findMany({
      where: whereClause,
      select: { action: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailyMap: Record<string, Record<string, number>> = {};
    for (const item of activities) {
      const day = item.createdAt.toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][item.action] = (dailyMap[day][item.action] || 0) + 1;
    }

    const timeline = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, actions]) => ({ date, ...actions }));

    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching usage timeline:', error);
    res.status(500).json({ error: 'Failed to fetch usage timeline' });
  }
});

export default router;
