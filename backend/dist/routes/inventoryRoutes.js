"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `inventory:${userId}`;
        const cachedInventory = await index_1.safeRedis.get(cacheKey);
        if (cachedInventory) {
            return res.json(JSON.parse(cachedInventory));
        }
        const inventory = await index_1.prisma.inventoryItem.findMany({ where: { userId } });
        await index_1.safeRedis.set(cacheKey, JSON.stringify(inventory), 'EX', 3600);
        res.json(inventory);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const item = await index_1.prisma.inventoryItem.create({ data: { ...req.body, userId } });
        await index_1.safeRedis.del(`inventory:${userId}`);
        res.status(201).json(item);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create inventory item' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.inventoryItem.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Item not found' });
        const { id, ...data } = req.body;
        const item = await index_1.prisma.inventoryItem.update({
            where: { id: req.params.id },
            data,
        });
        await index_1.safeRedis.del(`inventory:${userId}`);
        res.json(item);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update inventory item' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.inventoryItem.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Item not found' });
        await index_1.prisma.inventoryItem.delete({ where: { id: req.params.id } });
        await index_1.safeRedis.del(`inventory:${userId}`);
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete inventory item' });
    }
});
exports.default = router;
