"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `sku-groups:${userId}`;
        const cachedGroups = await index_1.redis.get(cacheKey);
        if (cachedGroups) {
            return res.json(JSON.parse(cachedGroups));
        }
        const groups = await prisma.skuGroup.findMany({ where: { userId } });
        await index_1.redis.set(cacheKey, JSON.stringify(groups), 'EX', 3600);
        res.json(groups);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch SKU groups' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const group = await prisma.skuGroup.create({ data: { ...req.body, userId } });
        await index_1.redis.del(`sku-groups:${userId}`);
        res.status(201).json(group);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create SKU group' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await prisma.skuGroup.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Group not found' });
        await prisma.skuGroup.delete({ where: { id: req.params.id } });
        await index_1.redis.del(`sku-groups:${userId}`);
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete SKU group' });
    }
});
exports.default = router;
