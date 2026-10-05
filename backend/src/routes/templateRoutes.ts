import { handleJsonRouteErrors } from '../utils/routeHandler';
import { withUsageEvent } from '../services/usageEvents';
import { Router } from 'express';
import { prisma } from '../infrastructure/runtimeResources';

import {
    ProfitTemplateDataValidationError,
    validateSharedProfitTemplateData,
} from '../services/profitTemplateData';

const mapValidationError = (error: unknown) => error instanceof ProfitTemplateDataValidationError
  ? { status: 400, body: { error: error.message } }
  : undefined;

const router = Router();

router.get('/', handleJsonRouteErrors(async (req, res) => {
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
}, 'Failed to fetch templates', { logMessage: 'Error fetching templates:' }));

router.get('/:country', handleJsonRouteErrors(async (req, res) => {
    const userId = req.user!.id;
    const { country } = req.params;
    const { type } = req.query;
    const templates = await prisma.profitTemplate.findMany({
        where: { userId, country, ...(type ? { type: String(type) } : {}) },
        orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
}, 'Failed to fetch templates', { logMessage: 'Error fetching templates:' }));

router.post('/', handleJsonRouteErrors(async (req, res) => {
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
}, 'Failed to create template', { logMessage: 'Error creating template:', mapError: mapValidationError }));

router.delete('/:id', handleJsonRouteErrors(async (req, res) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const existing = await prisma.profitTemplate.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    await withUsageEvent(prisma, req, { module: 'template', action: 'template_delete', objectType: 'ProfitTemplate' }, tx => tx.profitTemplate.delete({
        where: { id }
    }));
    res.json({ success: true });
}, 'Failed to delete template', { logMessage: 'Error deleting template:' }));

router.put('/:id', handleJsonRouteErrors(async (req, res) => {
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
}, 'Failed to update template', { logMessage: 'Error updating template:', mapError: mapValidationError }));

export default router;
