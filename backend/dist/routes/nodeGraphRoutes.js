"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const templateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Template name is required'),
    nodes: zod_1.z.array(zod_1.z.unknown()),
    edges: zod_1.z.array(zod_1.z.unknown()),
    productId: zod_1.z.string().optional().nullable(),
});
const updateSchema = templateSchema.partial();
const castJson = (value) => value;
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const templates = await index_1.prisma.nodeGraphTemplate.findMany({
            where: { userId },
            select: { id: true, name: true, createdAt: true },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Failed to fetch templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const template = await index_1.prisma.nodeGraphTemplate.findFirst({
            where: { id: req.params.id, userId },
        });
        if (!template)
            return res.status(404).json({ error: 'Template not found' });
        res.json(template);
    }
    catch (error) {
        console.error('Failed to fetch template:', error);
        res.status(500).json({ error: 'Failed to fetch template' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const parsed = templateSchema.parse(req.body);
        const template = await index_1.prisma.nodeGraphTemplate.create({
            data: {
                name: parsed.name,
                nodes: castJson(parsed.nodes),
                edges: castJson(parsed.edges),
                productId: parsed.productId ?? undefined,
                userId,
            },
        });
        res.status(201).json(template);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        console.error('Failed to create template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const parsed = updateSchema.parse(req.body);
        const existing = await index_1.prisma.nodeGraphTemplate.findFirst({
            where: { id: req.params.id, userId },
        });
        if (!existing)
            return res.status(404).json({ error: 'Template not found' });
        const data = {};
        if (parsed.name !== undefined)
            data.name = parsed.name;
        if (parsed.nodes !== undefined)
            data.nodes = castJson(parsed.nodes);
        if (parsed.edges !== undefined)
            data.edges = castJson(parsed.edges);
        if (parsed.productId !== undefined)
            data.productId = parsed.productId;
        const template = await index_1.prisma.nodeGraphTemplate.update({
            where: { id: req.params.id },
            data,
        });
        res.json(template);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.issues });
        }
        console.error('Failed to update template:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.nodeGraphTemplate.findFirst({
            where: { id: req.params.id, userId },
        });
        if (!existing)
            return res.status(404).json({ error: 'Template not found' });
        await index_1.prisma.nodeGraphTemplate.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Failed to delete template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});
exports.default = router;
