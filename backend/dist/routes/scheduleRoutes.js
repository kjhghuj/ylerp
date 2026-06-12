"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const activityLogger_1 = require("../services/activityLogger");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, completed, archived } = req.query;
        const where = { userId };
        if (type)
            where.type = String(type);
        if (completed !== undefined)
            where.completed = completed === 'true';
        if (archived === 'true') {
            where.completed = true;
            where.completedAt = { not: null };
        }
        const items = await index_1.prisma.scheduleItem.findMany({
            where,
            orderBy: [{ sortKey: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(items);
    }
    catch (error) {
        console.error('Error fetching schedule items:', error);
        res.status(500).json({ error: 'Failed to fetch schedule items' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, title, description, deadline, remindAt, sortKey } = req.body;
        if (!type || !title) {
            return res.status(400).json({ error: 'Missing required fields: type, title' });
        }
        const item = await index_1.prisma.scheduleItem.create({
            data: {
                type,
                title,
                description: description || null,
                deadline: deadline ? new Date(deadline) : null,
                remindAt: remindAt ? new Date(remindAt) : null,
                sortKey: sortKey || 0,
                userId,
            },
        });
        (0, activityLogger_1.logActivity)(userId, 'schedule_create', 'schedule', { type, title }).catch(err => console.error("活动记录失败:", err));
        res.status(201).json(item);
    }
    catch (error) {
        console.error('Error creating schedule item:', error);
        res.status(500).json({ error: 'Failed to create schedule item' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const id = String(req.params.id);
        const { title, description, deadline, remindAt, completed, notes, feedback, sortKey } = req.body;
        const existing = await index_1.prisma.scheduleItem.findFirst({ where: { id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Item not found' });
        const item = await index_1.prisma.scheduleItem.update({
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
        });
        res.json(item);
    }
    catch (error) {
        console.error('Error updating schedule item:', error);
        res.status(500).json({ error: 'Failed to update schedule item' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const id = String(req.params.id);
        const existing = await index_1.prisma.scheduleItem.findFirst({ where: { id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Item not found' });
        await index_1.prisma.scheduleItem.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting schedule item:', error);
        res.status(500).json({ error: 'Failed to delete schedule item' });
    }
});
router.post('/reorder', async (req, res) => {
    try {
        const userId = req.user.id;
        const { orders } = req.body;
        if (!Array.isArray(orders))
            return res.status(400).json({ error: 'orders must be an array' });
        await Promise.all(orders.map(({ id, sortKey }) => index_1.prisma.scheduleItem.updateMany({
            where: { id, userId },
            data: { sortKey },
        })));
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error reordering schedule items:', error);
        res.status(500).json({ error: 'Failed to reorder items' });
    }
});
router.post('/reset-daily', async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await index_1.prisma.scheduleItem.updateMany({
            where: {
                userId,
                type: 'routine',
                completed: true,
            },
            data: {
                completed: false,
                completedAt: null,
            },
        });
        res.json({ reset: result.count });
    }
    catch (error) {
        console.error('Error resetting daily routines:', error);
        res.status(500).json({ error: 'Failed to reset daily routines' });
    }
});
router.get('/upcoming', async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const items = await index_1.prisma.scheduleItem.findMany({
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
    }
    catch (error) {
        console.error('Error fetching upcoming items:', error);
        res.status(500).json({ error: 'Failed to fetch upcoming items' });
    }
});
exports.default = router;
