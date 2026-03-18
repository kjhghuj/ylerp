"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all inventory items
router.get('/', async (req, res) => {
    try {
        const cachedInventory = await index_1.redis.get('inventory');
        if (cachedInventory) {
            return res.json(JSON.parse(cachedInventory));
        }
        const inventory = await prisma.inventoryItem.findMany();
        await index_1.redis.set('inventory', JSON.stringify(inventory), 'EX', 3600);
        res.json(inventory);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
});
// Create inventory item
router.post('/', async (req, res) => {
    try {
        const item = await prisma.inventoryItem.create({ data: req.body });
        await index_1.redis.del('inventory');
        res.status(201).json(item);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create inventory item' });
    }
});
// Update inventory item
router.put('/:id', async (req, res) => {
    try {
        const { id, ...data } = req.body;
        const item = await prisma.inventoryItem.update({
            where: { id: req.params.id },
            data,
        });
        await index_1.redis.del('inventory');
        res.json(item);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update inventory item' });
    }
});
// Delete inventory item
router.delete('/:id', async (req, res) => {
    try {
        await prisma.inventoryItem.delete({ where: { id: req.params.id } });
        await index_1.redis.del('inventory');
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete inventory item' });
    }
});
exports.default = router;
