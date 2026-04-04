import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const records = await prisma.restockRecord.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(records);
    } catch (error) {
        console.error('Failed to fetch restock records:', error);
        res.status(500).json({ error: 'Failed to fetch restock records' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { name, items } = req.body;
        if (!name || !items) {
            res.status(400).json({ error: 'name and items are required' });
            return;
        }
        const record = await prisma.restockRecord.create({
            data: { name, items, userId }
        });
        res.json(record);
    } catch (error) {
        console.error('Failed to create restock record:', error);
        res.status(500).json({ error: 'Failed to create restock record' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const existing = await prisma.restockRecord.findFirst({ where: { id: req.params.id as string, userId } });
        if (!existing) {
            res.status(404).json({ error: 'Record not found' });
            return;
        }
        await prisma.restockRecord.delete({ where: { id: req.params.id as string } });
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete restock record:', error);
        res.status(500).json({ error: 'Failed to delete restock record' });
    }
});

export default router;
