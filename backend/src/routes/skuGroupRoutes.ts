import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../index';

const router = Router();
const prisma = new PrismaClient();

// Get all sku groups
router.get('/', async (req, res) => {
    try {
        const cachedGroups = await redis.get('sku-groups');
        if (cachedGroups) {
            return res.json(JSON.parse(cachedGroups));
        }

        const groups = await prisma.skuGroup.findMany();
        await redis.set('sku-groups', JSON.stringify(groups), 'EX', 3600);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch SKU groups' });
    }
});

// Create sku group
router.post('/', async (req, res) => {
    try {
        const group = await prisma.skuGroup.create({ data: req.body });
        await redis.del('sku-groups');
        res.status(201).json(group);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create SKU group' });
    }
});

// Delete sku group
router.delete('/:id', async (req, res) => {
    try {
        await prisma.skuGroup.delete({ where: { id: req.params.id } });
        await redis.del('sku-groups');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete SKU group' });
    }
});

export default router;
