import { withUsageEvent } from '../services/usageEvents';
import { Router } from 'express';
import { prisma } from '../index';

import {
    ProfitTemplateDataValidationError,
    validateSharedProfitTemplateData,
} from '../services/profitTemplateData';

const router = Router();

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
        const { name, country, data, type, platform } = req.body;

        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const validatedData = validateSharedProfitTemplateData(data);

        const template = await withUsageEvent(prisma, req, { module: 'template', action: 'template_create', objectType: 'ProfitTemplate' }, tx => tx.profitTemplate.create({
            data: {
                name,
                country,
                data: validatedData,
                type: type || 'profit',
                platform,
                userId,
            }
        }));

        res.status(201).json(template);
    } catch (error) {
        if (error instanceof ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
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

        await withUsageEvent(prisma, req, { module: 'template', action: 'template_delete', objectType: 'ProfitTemplate' }, tx => tx.profitTemplate.delete({
            where: { id }
        }));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { name, country, data, type, platform } = req.body;

        const existing = await prisma.profitTemplate.findFirst({ where: { id, userId } });
        if (!existing) return res.status(404).json({ error: 'Template not found' });
        const validatedData = data !== undefined
            ? validateSharedProfitTemplateData(data)
            : undefined;

        const template = await withUsageEvent(prisma, req, { module: 'template', action: 'template_update', objectType: 'ProfitTemplate' }, tx => tx.profitTemplate.update({
            where: { id },
            data: {
                ...(name ? { name } : {}),
                ...(country ? { country } : {}),
                ...(validatedData !== undefined ? { data: validatedData } : {}),
                ...(type ? { type } : {}),
                ...(platform !== undefined ? { platform } : {}),
            }
        }));

        res.json(template);
    } catch (error) {
        if (error instanceof ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error updating template:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

export default router;
