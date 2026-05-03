import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../index';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'chroma');
const MAX_IMAGES_PER_USER = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

async function ensureUserDir(userId: string): Promise<string> {
  const userDir = path.join(UPLOAD_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

async function cleanupOldImages(userId: string): Promise<void> {
  const count = await prisma.chromaImage.count({ where: { userId } });
  if (count <= MAX_IMAGES_PER_USER) return;

  const toDelete = count - MAX_IMAGES_PER_USER;
  const oldImages = await prisma.chromaImage.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: toDelete,
  });

  for (const img of oldImages) {
    try {
      const filePath = path.join(UPLOAD_DIR, userId, img.filename);
      await fs.unlink(filePath).catch(() => {});
    } catch {}
  }

  await prisma.chromaImage.deleteMany({
    where: { id: { in: oldImages.map(i => i.id) } },
  });
}

// ── Generation Records ──

router.get('/records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.chromaGenerationRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.chromaGenerationRecord.count({ where: { userId } }),
    ]);

    res.json({ records, total, page, limit });
  } catch (error) {
    console.error('Error fetching chroma records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.get('/records/cost-summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayCost, monthCost, totalCost, totalRecords] = await Promise.all([
      prisma.chromaGenerationRecord.aggregate({
        where: { userId, createdAt: { gte: startOfDay }, status: 'success' },
        _sum: { cost: true },
      }),
      prisma.chromaGenerationRecord.aggregate({
        where: { userId, createdAt: { gte: startOfMonth }, status: 'success' },
        _sum: { cost: true },
      }),
      prisma.chromaGenerationRecord.aggregate({
        where: { userId, status: 'success' },
        _sum: { cost: true },
      }),
      prisma.chromaGenerationRecord.count({ where: { userId } }),
    ]);

    res.json({
      today: todayCost._sum.cost || 0,
      month: monthCost._sum.cost || 0,
      total: totalCost._sum.cost || 0,
      totalRecords,
    });
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

router.post('/records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { mode, model, cost, prompt, parameters, status, errorMessage, imageId } = req.body;

    if (!mode || !model || cost === undefined || !status) {
      return res.status(400).json({ error: 'Missing required fields: mode, model, cost, status' });
    }

    const record = await prisma.chromaGenerationRecord.create({
      data: {
        mode,
        model,
        cost: Number(cost) || 0,
        prompt: prompt || null,
        parameters: parameters || null,
        status,
        errorMessage: errorMessage || null,
        imageId: imageId || null,
        userId,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating chroma record:', error);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// ── Images ──

router.get('/images', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [images, total] = await Promise.all([
      prisma.chromaImage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, filename: true, originalName: true, size: true, mode: true, model: true, createdAt: true },
      }),
      prisma.chromaImage.count({ where: { userId } }),
    ]);

    res.json({ images, total, page, limit });
  } catch (error) {
    console.error('Error fetching chroma images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

router.get('/images/file/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const imageId = String(req.params.id);
    const image = await prisma.chromaImage.findFirst({
      where: { id: imageId, userId },
    });

    if (!image) return res.status(404).json({ error: 'Image not found' });

    const filePath = path.join(UPLOAD_DIR, userId, image.filename);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

router.delete('/images/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const imageId = String(req.params.id);
    const image = await prisma.chromaImage.findFirst({
      where: { id: imageId, userId },
    });

    if (!image) return res.status(404).json({ error: 'Image not found' });

    const filePath = path.join(UPLOAD_DIR, userId, image.filename);
    await fs.unlink(filePath).catch(() => {});
    await prisma.chromaImage.delete({ where: { id: image.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

router.post('/images', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { image, mode, model, originalName } = req.body;

    if (!image) return res.status(400).json({ error: 'Missing required field: image' });

    // Validate image data
    const isBase64 = image.startsWith('data:');
    const rawBase64 = isBase64 ? image.split(',')[1] || '' : image;
    const estimatedSize = Math.floor(rawBase64.length * 3 / 4);
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: `Image too large, max ${MAX_IMAGE_SIZE / 1024 / 1024}MB` });
    }
    if (isBase64 && !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format, only image uploads are allowed' });
    }

    const userDir = await ensureUserDir(userId);

    let base64Data = rawBase64.replace(/\n/g, '').replace(/\r/g, '');

    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${Date.now()}-${mode || 'unknown'}-${Math.random().toString(36).substr(2, 6)}.png`;
    const filePath = path.join(userDir, filename);

    await fs.writeFile(filePath, buffer);

    const chromaImage = await prisma.chromaImage.create({
      data: {
        filename,
        originalName: originalName || null,
        size: buffer.length,
        mode: mode || 'unknown',
        model: model || 'unknown',
        userId,
      },
    });

    await cleanupOldImages(userId);

    res.status(201).json(chromaImage);
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
