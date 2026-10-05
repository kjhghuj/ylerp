import { handleJsonRouteErrors } from '../utils/routeHandler';
import { withUsageEvent } from '../services/usageEvents';
import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../infrastructure/runtimeResources';


const router = Router();

router.get('/', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { type, completed, archived } = req.query;

    const where: Prisma.ScheduleItemWhereInput = { userId };
    if (type) where.type = String(type);
    if (completed !== undefined) where.completed = completed === 'true';
    if (archived === 'true') {
        where.completed = true;
        where.completedAt = { not: null };
    }

    const items = await prisma.scheduleItem.findMany({
        where,
        orderBy: [{ sortKey: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(items);
}, 'Failed to fetch schedule items', { logMessage: 'Error fetching schedule items:' }));

router.post('/', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { type, title, description, deadline, remindAt, sortKey } = req.body;

    if (!type || !title) {
        return res.status(400).json({ error: 'Missing required fields: type, title' });
    }

    const item = await withUsageEvent(prisma, req, { module: 'schedule', action: 'schedule_create', objectType: 'ScheduleItem' }, tx => tx.scheduleItem.create({
        data: {
            type,
            title,
            description: description || null,
            deadline: deadline ? new Date(deadline) : null,
            remindAt: remindAt ? new Date(remindAt) : null,
            sortKey: sortKey || 0,
            userId,
        },
    }));

    res.status(201).json(item);
}, 'Failed to create schedule item', { logMessage: 'Error creating schedule item:' }));

router.put('/:id', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const { title, description, deadline, remindAt, completed, notes, feedback, sortKey } = req.body;

    const existing = await prisma.scheduleItem.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const item = await withUsageEvent(prisma, req, { module: 'schedule', action: req.body.completed === true ? 'schedule_complete' : 'schedule_update', objectType: 'ScheduleItem' }, tx => tx.scheduleItem.update({
        where: { id },
        data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
            ...(remindAt !== undefined && { remindAt: remindAt ? new Date(remindAt) : null }),
            ...(completed !== undefined && {
                completed,
                completedAt: completed ? new Date() : null,
            }),
            ...(notes !== undefined && { notes }),
            ...(feedback !== undefined && { feedback }),
            ...(sortKey !== undefined && { sortKey }),
        },
    }));
    res.json(item);
}, 'Failed to update schedule item', { logMessage: 'Error updating schedule item:' }));

router.delete('/:id', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const existing = await prisma.scheduleItem.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    await withUsageEvent(prisma, req, { module: 'schedule', action: 'schedule_delete', objectType: 'ScheduleItem' }, tx => tx.scheduleItem.delete({ where: { id } }));
    res.json({ success: true });
}, 'Failed to delete schedule item', { logMessage: 'Error deleting schedule item:' }));

router.post('/reorder', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { orders }: { orders: { id: string; sortKey: number }[] } = req.body;

    if (!Array.isArray(orders)) return res.status(400).json({ error: 'orders must be an array' });

    await withUsageEvent(prisma, req, {
        module: 'schedule', action: 'schedule_reorder', objectType: 'ScheduleItem',
        affectedCount: (results: Array<{ count: number }>) => results.reduce((total, result) => total + result.count, 0),
    }, tx => Promise.all(
        orders.map(({ id, sortKey }) => tx.scheduleItem.updateMany({
            where: { id, userId }, data: { sortKey },
        }))
    ));
    res.json({ success: true });
}, 'Failed to reorder items', { logMessage: 'Error reordering schedule items:' }));

router.post('/reset-daily', handleJsonRouteErrors(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const result = await withUsageEvent(prisma, req, { module: 'schedule', action: 'schedule_reset', objectType: 'ScheduleItem' }, tx => tx.scheduleItem.updateMany({
        where: {
            userId,
            type: 'routine',
            completed: true,
        },
        data: {
            completed: false,
            completedAt: null,
        },
    }));
    res.json({ reset: result.count });
}, 'Failed to reset daily routines', { logMessage: 'Error resetting daily routines:' }));

router.get('/upcoming', handleJsonRouteErrors(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const items = await prisma.scheduleItem.findMany({
    where: {
      userId,
      completed: false,
      OR: [
        { remindAt: { not: null } },
        { deadline: { not: null } },
      ],
    },
    orderBy: [{ remindAt: 'asc' }, { deadline: 'asc' }],
    take: 10,
  });
  res.json(items);
}, 'Failed to fetch upcoming items', { logMessage: 'Error fetching upcoming items:' }));

export default router;
