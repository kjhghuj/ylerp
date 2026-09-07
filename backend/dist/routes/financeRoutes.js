"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const usageEvents_1 = require("../services/usageEvents");
const express_1 = require("express");
const index_1 = require("../index");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const cacheKey = 'finance:all';
        const cachedFinance = await index_1.safeRedis.get(cacheKey);
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }
        const finance = await index_1.prisma.financeRecord.findMany({
            include: { user: { select: { id: true, displayName: true } } }
        });
        await index_1.safeRedis.set(cacheKey, JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    }
    catch (error) {
        console.error('Failed to fetch finance records:', error);
        res.status(500).json({ error: 'Failed to fetch finance records' });
    }
});
router.post('/batch', async (req, res) => {
    try {
        const userId = req.user.id;
        const records = req.body;
        if (!Array.isArray(records)) {
            return res.status(400).json({ error: 'Expected an array of records' });
        }
        const formattedRecords = records.map((record) => ({
            ...record,
            userId,
            date: new Date(record.date)
        }));
        const result = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_import', objectType: 'FinanceRecord' }, tx => tx.financeRecord.createMany({
            data: formattedRecords
        }));
        await index_1.safeRedis.del('finance:all');
        res.status(201).json({ count: result.count });
    }
    catch (error) {
        console.error('Batch import failed:', error);
        res.status(500).json({ error: 'Failed to batch create finance records' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const recordData = { ...req.body, userId, date: new Date(req.body.date) };
        const record = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_create', objectType: 'FinanceRecord' }, tx => tx.financeRecord.create({ data: recordData }));
        await index_1.safeRedis.del('finance:all');
        res.status(201).json(record);
    }
    catch (error) {
        console.error('Failed to create finance record:', error);
        res.status(500).json({ error: 'Failed to create finance record' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const existing = await index_1.prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Record not found' });
        const recordData = { ...req.body };
        if (req.body.date)
            recordData.date = new Date(req.body.date);
        delete recordData.id;
        delete recordData.userId;
        recordData.updatedBy = req.user.username;
        const record = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_update', objectType: 'FinanceRecord' }, tx => tx.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        }));
        await index_1.safeRedis.del('finance:all');
        res.json(record);
    }
    catch (error) {
        console.error('Failed to update finance record:', error);
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});
router.delete('/all', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.deleteMany({ where: {} }));
        await index_1.safeRedis.del('finance:all');
        res.status(204).send();
    }
    catch (error) {
        console.error('Failed to delete all finance records:', error);
        res.status(500).json({ error: 'Failed to delete all finance records' });
    }
});
router.delete('/month/:month', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        const monthParam = Array.isArray(req.params.month) ? req.params.month[0] : req.params.month;
        const [yearStr, monthStr] = monthParam.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        if (isNaN(year) || isNaN(month)) {
            return res.status(400).json({ error: 'Invalid month format, expected YYYY-MM' });
        }
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        const result = await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.deleteMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                }
            }
        }));
        await index_1.safeRedis.del('finance:all');
        res.json({ message: 'Deleted records', count: result.count });
    }
    catch (error) {
        console.error('Delete month failed:', error);
        res.status(500).json({ error: 'Failed to delete finance records for the month' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const existing = await index_1.prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Record not found' });
        await (0, usageEvents_1.withUsageEvent)(index_1.prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.delete({ where: { id: req.params.id } }));
        await index_1.safeRedis.del('finance:all');
        res.status(204).send();
    }
    catch (error) {
        console.error('Failed to delete finance record:', error);
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});
exports.default = router;
