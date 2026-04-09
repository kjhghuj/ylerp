import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { type, productId } = req.query;
        const templates = await prisma.profitTemplate.findMany({
            where: {
                userId,
                ...(type ? { type: String(type) } : {}),
                ...(productId ? { productId: String(productId) } : {}),
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

router.get('/:country', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { country } = req.params;
        const { type } = req.query;
        const templates = await prisma.profitTemplate.findMany({
            where: { userId, country, ...(type ? { type: String(type) } : {}) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { name, country, data, type, platform, productId } = req.body;

        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const template = await prisma.profitTemplate.create({
            data: {
                name,
                country,
                data,
                type: type || 'profit',
                platform,
                userId,
                ...(productId ? { productId } : {}),
            }
        });
        res.status(201).json(template);
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const existing = await prisma.profitTemplate.findFirst({ where: { id, userId } });
        if (!existing) return res.status(404).json({ error: 'Template not found' });

        await prisma.profitTemplate.delete({
            where: { id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

export default router;
