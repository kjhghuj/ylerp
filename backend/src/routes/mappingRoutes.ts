import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../index';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const cacheKey = `warehouse-mappings:${userId}`;
        const cachedMappings = await redis.get(cacheKey);
        if (cachedMappings) {
            return res.json(JSON.parse(cachedMappings));
        }

        const mappings = await prisma.warehouseMapping.findMany({ where: { userId } });
        await redis.set(cacheKey, JSON.stringify(mappings), 'EX', 3600);
        res.json(mappings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch warehouse mappings' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const mapping = await prisma.warehouseMapping.create({ data: { ...req.body, userId } });
        await redis.del(`warehouse-mappings:${userId}`);
        res.status(201).json(mapping);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create warehouse mapping' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const existing = await prisma.warehouseMapping.findFirst({ where: { id: req.params.id, userId } });
        if (!existing) return res.status(404).json({ error: 'Mapping not found' });

        await prisma.warehouseMapping.delete({ where: { id: req.params.id } });
        await redis.del(`warehouse-mappings:${userId}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete warehouse mapping' });
    }
});

export default router;
