import { Router } from 'express';
import { prisma, safeRedis } from '../index';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const cacheKey = `sku-groups:${userId}`;
        const cachedGroups = await safeRedis.get(cacheKey);
        if (cachedGroups) {
            return res.json(JSON.parse(cachedGroups));
        }

        const groups = await prisma.skuGroup.findMany({ where: { userId } });
        await safeRedis.set(cacheKey, JSON.stringify(groups), 'EX', 3600);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch SKU groups' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const group = await prisma.skuGroup.create({ data: { ...req.body, userId } });
        await safeRedis.del(`sku-groups:${userId}`);
        res.status(201).json(group);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create SKU group' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const existing = await prisma.skuGroup.findFirst({ where: { id: req.params.id, userId } });
        if (!existing) return res.status(404).json({ error: 'Group not found' });

        await prisma.skuGroup.delete({ where: { id: req.params.id } });
        await safeRedis.del(`sku-groups:${userId}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete SKU group' });
    }
});

export default router;
