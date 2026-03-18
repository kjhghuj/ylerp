import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../index';

const router = Router();
const prisma = new PrismaClient();

// Get all warehouse mappings
router.get('/', async (req, res) => {
    try {
        const cachedMappings = await redis.get('warehouse-mappings');
        if (cachedMappings) {
            return res.json(JSON.parse(cachedMappings));
        }

        const mappings = await prisma.warehouseMapping.findMany();
        await redis.set('warehouse-mappings', JSON.stringify(mappings), 'EX', 3600);
        res.json(mappings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch warehouse mappings' });
    }
});

// Create warehouse mapping
router.post('/', async (req, res) => {
    try {
        const mapping = await prisma.warehouseMapping.create({ data: req.body });
        await redis.del('warehouse-mappings');
        res.status(201).json(mapping);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create warehouse mapping' });
    }
});

// Delete warehouse mapping
router.delete('/:id', async (req, res) => {
    try {
        await prisma.warehouseMapping.delete({ where: { id: req.params.id } });
        await redis.del('warehouse-mappings');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete warehouse mapping' });
    }
});

export default router;
