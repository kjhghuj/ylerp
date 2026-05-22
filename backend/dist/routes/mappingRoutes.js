"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `warehouse-mappings:${userId}`;
        const cachedMappings = await index_1.safeRedis.get(cacheKey);
        if (cachedMappings) {
            return res.json(JSON.parse(cachedMappings));
        }
        const mappings = await index_1.prisma.warehouseMapping.findMany({ where: { userId } });
        await index_1.safeRedis.set(cacheKey, JSON.stringify(mappings), 'EX', 3600);
        res.json(mappings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch warehouse mappings' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const mapping = await index_1.prisma.warehouseMapping.create({ data: { ...req.body, userId } });
        await index_1.safeRedis.del(`warehouse-mappings:${userId}`);
        res.status(201).json(mapping);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create warehouse mapping' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.warehouseMapping.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Mapping not found' });
        await index_1.prisma.warehouseMapping.delete({ where: { id: req.params.id } });
        await index_1.safeRedis.del(`warehouse-mappings:${userId}`);
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete warehouse mapping' });
    }
});
exports.default = router;
