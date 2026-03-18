"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all warehouse mappings
router.get('/', async (req, res) => {
    try {
        const cachedMappings = await index_1.redis.get('warehouse-mappings');
        if (cachedMappings) {
            return res.json(JSON.parse(cachedMappings));
        }
        const mappings = await prisma.warehouseMapping.findMany();
        await index_1.redis.set('warehouse-mappings', JSON.stringify(mappings), 'EX', 3600);
        res.json(mappings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch warehouse mappings' });
    }
});
// Create warehouse mapping
router.post('/', async (req, res) => {
    try {
        const mapping = await prisma.warehouseMapping.create({ data: req.body });
        await index_1.redis.del('warehouse-mappings');
        res.status(201).json(mapping);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create warehouse mapping' });
    }
});
// Delete warehouse mapping
router.delete('/:id', async (req, res) => {
    try {
        await prisma.warehouseMapping.delete({ where: { id: req.params.id } });
        await index_1.redis.del('warehouse-mappings');
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete warehouse mapping' });
    }
});
exports.default = router;
