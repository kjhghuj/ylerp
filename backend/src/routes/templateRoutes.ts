import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get templates by country
router.get('/:country', async (req, res) => {
    try {
        const { country } = req.params;
        const { type } = req.query;
        const templates = await prisma.profitTemplate.findMany({
            where: { country, ...(type ? { type: String(type) } : {}) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// Create a new template
router.post('/', async (req, res) => {
    try {
        const { name, country, data, type } = req.body;
        
        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const template = await prisma.profitTemplate.create({
            data: {
                name,
                country,
                data,
                type: type || 'profit'
            }
        });
        res.status(201).json(template);
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

// Delete a template
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
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
