"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const records = await index_1.prisma.restockRecord.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(records);
    }
    catch (error) {
        console.error('Failed to fetch restock records:', error);
        res.status(500).json({ error: 'Failed to fetch restock records' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, items } = req.body;
        if (!name || !items) {
            res.status(400).json({ error: 'name and items are required' });
            return;
        }
        const record = await index_1.prisma.restockRecord.create({
            data: { name, items, userId }
        });
        res.json(record);
    }
    catch (error) {
        console.error('Failed to create restock record:', error);
        res.status(500).json({ error: 'Failed to create restock record' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.restockRecord.findFirst({ where: { id: req.params.id, userId } });
        if (!existing) {
            res.status(404).json({ error: 'Record not found' });
            return;
        }
        await index_1.prisma.restockRecord.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Failed to delete restock record:', error);
        res.status(500).json({ error: 'Failed to delete restock record' });
    }
});
exports.default = router;
