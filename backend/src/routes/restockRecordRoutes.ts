import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
    try {
        const records = await prisma.restockRecord.findMany({
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
        const { name, items } = req.body;
        if (!name || !items) {
            res.status(400).json({ error: 'name and items are required' });
            return;
        }
        const record = await prisma.restockRecord.create({
            data: { name, items }
        });
        res.json(record);
    } catch (error) {
        console.error('Failed to create restock record:', error);
        res.status(500).json({ error: 'Failed to create restock record' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        await prisma.restockRecord.delete({ where: { id: req.params.id as string } });
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete restock record:', error);
        res.status(500).json({ error: 'Failed to delete restock record' });
    }
});

export default router;
