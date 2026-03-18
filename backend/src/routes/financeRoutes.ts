import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../index';

const router = Router();
const prisma = new PrismaClient();

// Get all finance records
router.get('/', async (req, res) => {
    try {
        const cachedFinance = await redis.get('finance');
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }

        const finance = await prisma.financeRecord.findMany();
        await redis.set('finance', JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch finance records' });
    }
});

// Create multiple finance records (batch import)
router.post('/batch', async (req, res) => {
    try {
        const records = req.body;
        if (!Array.isArray(records)) {
            return res.status(400).json({ error: 'Expected an array of records' });
        }
        
        // Handle date string to Date object conversion for each record
        const formattedRecords = records.map((record: any) => ({
            ...record,
            date: new Date(record.date)
        }));

        const result = await prisma.financeRecord.createMany({ 
            data: formattedRecords 
        });
        
        await redis.del('finance');
        res.status(201).json({ count: result.count });
    } catch (error) {
        console.error('Batch import failed:', error);
        res.status(500).json({ error: 'Failed to batch create finance records' });
    }
});

// Create single finance record
router.post('/', async (req, res) => {
    try {
        // Handle date string to Date object conversion
        const recordData = { ...req.body, date: new Date(req.body.date) };
        const record = await prisma.financeRecord.create({ data: recordData });
        await redis.del('finance');
        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create finance record' });
    }
});

// Update finance record
router.put('/:id', async (req, res) => {
    try {
        const recordData = { ...req.body };
        if (req.body.date) recordData.date = new Date(req.body.date);

        const record = await prisma.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        });
        await redis.del('finance');
        res.json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});

// Delete all finance records
router.delete('/all', async (req, res) => {
    try {
        await prisma.financeRecord.deleteMany({});
        await redis.del('finance');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete all finance records' });
    }
});

// Delete finance record
router.delete('/:id', async (req, res) => {
    try {
        await prisma.financeRecord.delete({ where: { id: req.params.id } });
        await redis.del('finance');
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});

export default router;
