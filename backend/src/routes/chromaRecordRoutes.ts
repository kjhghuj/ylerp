import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../index';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'chroma');
const MAX_IMAGES_PER_USER = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_STORAGE_BYTES_PER_USER = 500 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

function decodeUploadedImage(value: unknown): { buffer: Buffer; extension: 'png' | 'jpg' | 'webp' } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const encoded = match[2].replace(/[\r\n]/g, '');
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const estimatedSize = Math.floor(encoded.length * 3 / 4);
  if (estimatedSize <= 0 || estimatedSize > MAX_IMAGE_SIZE) return null;
  const buffer = Buffer.from(encoded, 'base64');
  const mime = match[1].toLowerCase();
  const png = mime === 'image/png' && buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = mime === 'image/jpeg' && buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = mime === 'image/webp' && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) return null;
  if (png && buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > MAX_IMAGE_PIXELS) return null;
  return { buffer, extension: png ? 'png' : jpeg ? 'jpg' : 'webp' };
}

async function ensureUserDir(userId: string): Promise<string> {
  const userDir = path.join(UPLOAD_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

async function cleanupOldImages(userId: string): Promise<void> {
  const images = await prisma.chromaImage.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true, size: true },
  });
  let totalBytes = images.reduce((sum, image) => sum + image.size, 0);
  let remainingCount = images.length;
  const oldImages = [] as typeof images;
  for (const image of images) {
    if (remainingCount <= MAX_IMAGES_PER_USER && totalBytes <= MAX_STORAGE_BYTES_PER_USER) break;
    oldImages.push(image);
    remainingCount -= 1;
    totalBytes -= image.size;
  }
  if (!oldImages.length) return;

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

// Authoritative server calls and explicitly separate unverified legacy history.
router.get('/records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const legacy = req.query.source === 'legacy';
    if (legacy) {
      const [records, total] = await prisma.$transaction([
        prisma.chromaGenerationRecord.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.chromaGenerationRecord.count({ where: { userId } }),
      ]);
      return res.json({ records: records.map(r => ({ ...r, provenance: 'legacy_unverified', costLabel: '历史上报估算' })), total, page, limit });
    }
    const where = { userId, provenance: 'native' };
    const [calls, total, legacyTotal] = await prisma.$transaction([
      prisma.aiUsageCall.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.aiUsageCall.count({ where }), prisma.chromaGenerationRecord.count({ where: { userId } }),
    ]);
    res.json({ records: calls.map(c => ({ id: c.id, mode: c.mode, model: c.model, kind: c.kind, cost: c.estimatedCost == null ? null : Number(c.estimatedCost), status: c.status, imageId: c.imageIds[0], createdAt: c.startedAt, errorMessage: c.errorMessage, deliveryStatus: c.deliveryStatus, storageStatus: c.storageStatus, pricingVersion: c.pricingVersion, provenance: c.provenance, currency: c.currency })), total, legacyTotal, page, limit });
  } catch (error) {
    console.error('Error fetching chroma records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.get('/records/cost-summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const chinaDate = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const startOfDay = new Date(chinaDate + 'T00:00:00+08:00');
    const startOfMonth = new Date(chinaDate.slice(0, 7) + '-01T00:00:00+08:00');
    const where = { userId, provenance: 'native', status: 'success' };
    const [today, month, total, totalRecords, unpriced, unknown, legacy] = await prisma.$transaction([
      prisma.aiUsageCall.aggregate({ where: { ...where, startedAt: { gte: startOfDay, lte: now } }, _sum: { estimatedCost: true } }),
      prisma.aiUsageCall.aggregate({ where: { ...where, startedAt: { gte: startOfMonth, lte: now } }, _sum: { estimatedCost: true } }),
      prisma.aiUsageCall.aggregate({ where, _sum: { estimatedCost: true } }),
      prisma.aiUsageCall.count({ where: { userId, provenance: 'native' } }),
      prisma.aiUsageCall.count({ where: { ...where, estimatedCost: null } }),
      prisma.aiUsageCall.count({ where: { userId, provenance: 'native', status: { in: ['unknown', 'pending'] } } }),
      prisma.chromaGenerationRecord.aggregate({ where: { userId }, _sum: { cost: true }, _count: true }),
    ]);
    res.json({ today: Number(today._sum.estimatedCost || 0), month: Number(month._sum.estimatedCost || 0), total: Number(total._sum.estimatedCost || 0), totalRecords, unpriced, unknown, currency: 'CNY', timezone: 'Asia/Shanghai', costLabel: '人民币预估费用', legacy: { total: legacy._count, reportedCost: legacy._sum.cost, provenance: 'legacy_unverified' } });
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

router.post('/records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { callId, imageId } = req.body;
    if (typeof callId !== 'string' || typeof imageId !== 'string') return res.status(400).json({ error: '请升级客户端：仅支持使用 callId 和 imageId 关联已有调用，不能提交次数或费用' });
    if (Object.keys(req.body).some(k => !['callId', 'imageId'].includes(k))) return res.status(400).json({ error: '仅允许 callId 和 imageId，费用由服务端记录' });
    const record = await prisma.$transaction(async tx => {
      const call = await tx.aiUsageCall.findFirst({ where: { id: callId, userId, kind: 'generation', status: 'success', provenance: 'native' } });
      const image = await tx.chromaImage.findFirst({ where: { id: imageId, userId } });
      if (!call || !image) return null;
      const imageIds = [...new Set([...call.imageIds, imageId])];
      if (imageIds.length > call.outputCount) return null;
      const complete = imageIds.length >= call.outputCount;
      return tx.aiUsageCall.update({ where: { id: callId }, data: { imageIds, storageStatus: complete ? 'saved' : 'pending', result: complete ? Prisma.DbNull : undefined } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!record) return res.status(404).json({ error: '未找到本人可关联的成功调用或图片' });
    res.json({ id: record.id, imageIds: record.imageIds, storageStatus: record.storageStatus });
  } catch (error) {
    console.error('Error associating chroma record:', error);
    res.status(500).json({ error: 'Failed to associate image with call; generation usage remains recorded' });
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
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Image file no longer exists' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
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
    const { image, originalName, callId, outputIndex = 0 } = req.body;
    if (typeof callId !== 'string') return res.status(400).json({ error: 'callId is required for generated images' });
    const call = await prisma.aiUsageCall.findFirst({ where: { id: callId, userId, kind: 'generation', status: 'success', provenance: 'native' } });
    if (!call) return res.status(404).json({ error: 'Successful call not found' });
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0 || outputIndex >= call.outputCount) return res.status(400).json({ error: 'Invalid outputIndex' });
    if (originalName != null && (typeof originalName !== 'string' || originalName.length > 255)) return res.status(400).json({ error: 'Invalid image or originalName' });
    const stableImageId = crypto.createHash('sha256').update(callId + ':' + outputIndex).digest('hex');
    {
      const existing = await prisma.chromaImage.findFirst({ where: { id: stableImageId, userId } });
      if (existing) return res.json(existing);
    }

    const decoded = decodeUploadedImage(image);
    if (!decoded) return res.status(400).json({ error: 'Invalid PNG, JPEG or WebP image' });

    const userDir = await ensureUserDir(userId);

    const { buffer, extension } = decoded;
    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(userDir, filename);

    await fs.writeFile(filePath, buffer);

    let chromaImage;
    try {
    for (let attempt = 0; ; attempt++) {
    try {
    chromaImage = await prisma.$transaction(async tx => {
      const latest = await tx.aiUsageCall.findUniqueOrThrow({ where: { id: callId } });
      {
        const existing = await tx.chromaImage.findFirst({ where: { id: stableImageId, userId } });
        if (existing) return existing;
      }
      const saved = await tx.chromaImage.create({
      data: {
        id: stableImageId,
        filename,
        originalName: originalName || null,
        size: buffer.length,
        mode: call.mode,
        model: call.model,
        userId,
      },
    });

      const imageIds = [...new Set([...latest.imageIds, saved.id])];
      const complete = imageIds.length >= latest.outputCount;
      await tx.aiUsageCall.update({ where: { id: callId }, data: { imageIds, storageStatus: complete ? 'saved' : 'pending', result: complete ? Prisma.DbNull : undefined } });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    break;
    } catch (error: any) {
      if (error.code !== 'P2034' || attempt >= 2) throw error;
    }
    }
    } catch (error) {
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
    if (chromaImage.filename !== filename) await fs.unlink(filePath).catch(() => {});
    await cleanupOldImages(userId);

    res.status(201).json(chromaImage);
  } catch (error) {
    console.error('Error uploading image');
    if (typeof req.body.callId === 'string') await prisma.aiUsageCall.updateMany({ where: { id: req.body.callId, userId: req.user!.id, storageStatus: { not: 'saved' } }, data: { storageStatus: 'failed' } }).catch(err => console.error('Storage status persistence failed:', err));
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
