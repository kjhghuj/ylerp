"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const activityLogger_1 = require("../services/activityLogger");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, productId } = req.query;
        const templates = await index_1.prisma.profitTemplate.findMany({
            where: {
                userId,
                ...(type ? { type: String(type) } : {}),
                ...(productId ? { productId: String(productId) } : {}),
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});
router.get('/:country', async (req, res) => {
    try {
        const userId = req.user.id;
        const { country } = req.params;
        const { type } = req.query;
        const templates = await index_1.prisma.profitTemplate.findMany({
            where: { userId, country, ...(type ? { type: String(type) } : {}) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, country, data, type, platform } = req.body;
        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const template = await index_1.prisma.profitTemplate.create({
            data: {
                name,
                country,
                data,
                type: type || 'profit',
                platform,
                userId,
            }
        });
        (0, activityLogger_1.logActivity)(userId, 'template_save', 'template', { name, country, type: type || 'profit' }).catch(err => console.error("活动记录失败:", err));
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const existing = await index_1.prisma.profitTemplate.findFirst({ where: { id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Template not found' });
        await index_1.prisma.profitTemplate.delete({
            where: { id }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { name, country, data, type, platform } = req.body;
        const existing = await index_1.prisma.profitTemplate.findFirst({ where: { id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Template not found' });
        const template = await index_1.prisma.profitTemplate.update({
            where: { id },
            data: {
                ...(name ? { name } : {}),
                ...(country ? { country } : {}),
                ...(data ? { data } : {}),
                ...(type ? { type } : {}),
                ...(platform !== undefined ? { platform } : {}),
            }
        });
        (0, activityLogger_1.logActivity)(userId, 'template_save', 'template', { name: name || existing.name, action: 'update' }).catch(err => console.error("活动记录失败:", err));
        res.json(template);
    }
    catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});
exports.default = router;
