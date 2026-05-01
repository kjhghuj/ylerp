import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../index';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    try {
        const cacheKey = 'finance:shared';
        const cachedFinance = await redis.get(cacheKey);
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }

        const finance = await prisma.financeRecord.findMany();
        await redis.set(cacheKey, JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch finance records' });
    }
});

router.post('/batch', async (req, res) => {
    try {
        const userId = req.user!.id;
        const records = req.body;
        if (!Array.isArray(records)) {
            return res.status(400).json({ error: 'Expected an array of records' });
        }

        const formattedRecords = records.map((record: any) => ({
            ...record,
            userId,
            date: new Date(record.date)
        }));

        const result = await prisma.financeRecord.createMany({
            data: formattedRecords
        });

        await redis.del('finance:shared');
        res.status(201).json({ count: result.count });
    } catch (error) {
        console.error('Batch import failed:', error);
        res.status(500).json({ error: 'Failed to batch create finance records' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const recordData = { ...req.body, userId, date: new Date(req.body.date) };
        const record = await prisma.financeRecord.create({ data: recordData });
        await redis.del('finance:shared');
        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create finance record' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        const recordData = { ...req.body };
        if (req.body.date) recordData.date = new Date(req.body.date);

        const record = await prisma.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        });
        await redis.del('finance:shared');
        res.json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});

router.delete('/all', async (req, res) => {
    try {
        await prisma.financeRecord.deleteMany();
        await redis.del('finance:shared');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete all finance records' });
    }
});

router.delete('/month/:month', async (req, res) => {
    try {
        const [yearStr, monthStr] = req.params.month.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        if (isNaN(year) || isNaN(month)) {
            return res.status(400).json({ error: 'Invalid month format, expected YYYY-MM' });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        const result = await prisma.financeRecord.deleteMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                }
            }
        });

        await redis.del('finance:shared');
        res.json({ message: 'Deleted records', count: result.count });
    } catch (error) {
        console.error('Delete month failed:', error);
        res.status(500).json({ error: 'Failed to delete finance records for the month' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        await prisma.financeRecord.delete({ where: { id: req.params.id } });
        await redis.del('finance:shared');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});

export default router;
