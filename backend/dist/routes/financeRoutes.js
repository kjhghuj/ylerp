"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all finance records
router.get('/', async (req, res) => {
    try {
        const cachedFinance = await index_1.redis.get('finance');
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }
        const finance = await prisma.financeRecord.findMany();
        await index_1.redis.set('finance', JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch finance records' });
    }
});
// Create finance record
router.post('/', async (req, res) => {
    try {
        // Handle date string to Date object conversion
        const recordData = { ...req.body, date: new Date(req.body.date) };
        const record = await prisma.financeRecord.create({ data: recordData });
        await index_1.redis.del('finance');
        res.status(201).json(record);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create finance record' });
    }
});
// Update finance record
router.put('/:id', async (req, res) => {
    try {
        const recordData = { ...req.body };
        if (req.body.date)
            recordData.date = new Date(req.body.date);
        const record = await prisma.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        });
        await index_1.redis.del('finance');
        res.json(record);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});
// Delete finance record
router.delete('/:id', async (req, res) => {
    try {
        await prisma.financeRecord.delete({ where: { id: req.params.id } });
        await index_1.redis.del('finance');
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});
exports.default = router;
