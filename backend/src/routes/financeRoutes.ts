import { withUsageEvent } from '../services/usageEvents';
import { Router } from 'express';
import { prisma, safeRedis } from '../infrastructure/runtimeResources';
import { authorize } from '../middleware/authMiddleware';
import { FinanceInputError, parseFinanceInput, parseFinanceMonth } from '../services/financeInput';


const router = Router();

router.get('/', async (req, res) => {
    try {
        const cacheKey = 'finance:all';
        const cachedFinance = await safeRedis.get(cacheKey);
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }

        const finance = await prisma.financeRecord.findMany({
            include: { user: { select: { id: true, displayName: true } } }
        });
        await safeRedis.set(cacheKey, JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    } catch (error) {
        console.error('Failed to fetch finance records:', error);
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

        const formattedRecords = records.map(record => ({ ...parseFinanceInput(record), userId }));

        const result = await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_import', objectType: 'FinanceRecord' }, tx => tx.financeRecord.createMany({
            data: formattedRecords
        }));

        await safeRedis.del('finance:all');

        res.status(201).json({ count: result.count });
    } catch (error) {
        if (error instanceof FinanceInputError) return res.status(400).json({ error: error.message });
        console.error('Batch import failed:', error);
        res.status(500).json({ error: 'Failed to batch create finance records' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const recordData = { ...parseFinanceInput(req.body), userId };
        const record = await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_create', objectType: 'FinanceRecord' }, tx => tx.financeRecord.create({ data: recordData }));
        await safeRedis.del('finance:all');
        res.status(201).json(record);
    } catch (error) {
        if (error instanceof FinanceInputError) return res.status(400).json({ error: error.message });
        console.error('Failed to create finance record:', error);
        res.status(500).json({ error: 'Failed to create finance record' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        const recordData = { ...parseFinanceInput(req.body, true), updatedBy: req.user!.username };

        const record = await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_update', objectType: 'FinanceRecord' }, tx => tx.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        }));
        await safeRedis.del('finance:all');
        res.json(record);
    } catch (error) {
        if (error instanceof FinanceInputError) return res.status(400).json({ error: error.message });
        console.error('Failed to update finance record:', error);
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});

router.delete('/all', authorize('owner'), async (req, res) => {
    try {
        await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.deleteMany({ where: {} }));
        await safeRedis.del('finance:all');
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete all finance records:', error);
        res.status(500).json({ error: 'Failed to delete all finance records' });
    }
});

router.delete('/month/:month', authorize('owner'), async (req, res) => {
    try {
        const { startDate, endDate } = parseFinanceMonth(req.params.month);

        const result = await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.deleteMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                }
            }
        }));

        await safeRedis.del('finance:all');
        res.json({ message: 'Deleted records', count: result.count });
    } catch (error) {
        if (error instanceof FinanceInputError) return res.status(400).json({ error: error.message });
        console.error('Delete month failed:', error);
        res.status(500).json({ error: 'Failed to delete finance records for the month' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        await withUsageEvent(prisma, req, { module: 'finance', action: 'finance_delete', objectType: 'FinanceRecord' }, tx => tx.financeRecord.delete({ where: { id: req.params.id } }));
        await safeRedis.del('finance:all');
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete finance record:', error);
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});

export default router;
