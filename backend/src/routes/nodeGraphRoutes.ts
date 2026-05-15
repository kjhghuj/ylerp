import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const templates = await prisma.nodeGraphTemplate.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const template = await prisma.nodeGraphTemplate.findFirst({
      where: { id: req.params.id },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, nodes, edges, productId } = req.body;
    const template = await prisma.nodeGraphTemplate.create({
      data: { name, nodes, edges, productId, userId },
    });
    res.status(201).json(template);
  } catch {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nodes, edges, productId } = req.body;
    const template = await prisma.nodeGraphTemplate.update({
      where: { id: req.params.id },
      data: { name, nodes, edges, productId },
    });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.nodeGraphTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
