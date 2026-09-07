"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const index_1 = require("../index");
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'chroma');
const MAX_IMAGES_PER_USER = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
async function ensureUserDir(userId) {
    const userDir = path_1.default.join(UPLOAD_DIR, userId);
    await promises_1.default.mkdir(userDir, { recursive: true });
    return userDir;
}
async function cleanupOldImages(userId) {
    const count = await index_1.prisma.chromaImage.count({ where: { userId } });
    if (count <= MAX_IMAGES_PER_USER)
        return;
    const toDelete = count - MAX_IMAGES_PER_USER;
    const oldImages = await index_1.prisma.chromaImage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: toDelete,
    });
    for (const img of oldImages) {
        try {
            const filePath = path_1.default.join(UPLOAD_DIR, userId, img.filename);
            await promises_1.default.unlink(filePath).catch(() => { });
        }
        catch { }
    }
    await index_1.prisma.chromaImage.deleteMany({
        where: { id: { in: oldImages.map(i => i.id) } },
    });
}
// Authoritative server calls and explicitly separate unverified legacy history.
router.get('/records', async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const legacy = req.query.source === 'legacy';
        if (legacy) {
            const [records, total] = await index_1.prisma.$transaction([
                index_1.prisma.chromaGenerationRecord.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
                index_1.prisma.chromaGenerationRecord.count({ where: { userId } }),
            ]);
            return res.json({ records: records.map(r => ({ ...r, provenance: 'legacy_unverified', costLabel: '历史上报估算' })), total, page, limit });
        }
        const where = { userId, provenance: 'native' };
        const [calls, total, legacyTotal] = await index_1.prisma.$transaction([
            index_1.prisma.aiUsageCall.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
            index_1.prisma.aiUsageCall.count({ where }), index_1.prisma.chromaGenerationRecord.count({ where: { userId } }),
        ]);
        res.json({ records: calls.map(c => ({ id: c.id, mode: c.mode, model: c.model, kind: c.kind, cost: c.estimatedCost == null ? null : Number(c.estimatedCost), status: c.status, imageId: c.imageIds[0], createdAt: c.startedAt, errorMessage: c.errorMessage, deliveryStatus: c.deliveryStatus, storageStatus: c.storageStatus, pricingVersion: c.pricingVersion, provenance: c.provenance, currency: c.currency })), total, legacyTotal, page, limit });
    }
    catch (error) {
        console.error('Error fetching chroma records:', error);
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});
router.get('/records/cost-summary', async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const chinaDate = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
        const startOfDay = new Date(chinaDate + 'T00:00:00+08:00');
        const startOfMonth = new Date(chinaDate.slice(0, 7) + '-01T00:00:00+08:00');
        const where = { userId, provenance: 'native', status: 'success' };
        const [today, month, total, totalRecords, unpriced, unknown, legacy] = await index_1.prisma.$transaction([
            index_1.prisma.aiUsageCall.aggregate({ where: { ...where, startedAt: { gte: startOfDay, lte: now } }, _sum: { estimatedCost: true } }),
            index_1.prisma.aiUsageCall.aggregate({ where: { ...where, startedAt: { gte: startOfMonth, lte: now } }, _sum: { estimatedCost: true } }),
            index_1.prisma.aiUsageCall.aggregate({ where, _sum: { estimatedCost: true } }),
            index_1.prisma.aiUsageCall.count({ where: { userId, provenance: 'native' } }),
            index_1.prisma.aiUsageCall.count({ where: { ...where, estimatedCost: null } }),
            index_1.prisma.aiUsageCall.count({ where: { userId, provenance: 'native', status: { in: ['unknown', 'pending'] } } }),
            index_1.prisma.chromaGenerationRecord.aggregate({ where: { userId }, _sum: { cost: true }, _count: true }),
        ]);
        res.json({ today: Number(today._sum.estimatedCost || 0), month: Number(month._sum.estimatedCost || 0), total: Number(total._sum.estimatedCost || 0), totalRecords, unpriced, unknown, currency: 'CNY', timezone: 'Asia/Shanghai', costLabel: '人民币预估费用', legacy: { total: legacy._count, reportedCost: legacy._sum.cost, provenance: 'legacy_unverified' } });
    }
    catch (error) {
        console.error('Error fetching cost summary:', error);
        res.status(500).json({ error: 'Failed to fetch cost summary' });
    }
});
router.post('/records', async (req, res) => {
    try {
        const userId = req.user.id;
        const { callId, imageId } = req.body;
        if (typeof callId !== 'string' || typeof imageId !== 'string')
            return res.status(400).json({ error: '请升级客户端：仅支持使用 callId 和 imageId 关联已有调用，不能提交次数或费用' });
        if (Object.keys(req.body).some(k => !['callId', 'imageId'].includes(k)))
            return res.status(400).json({ error: '仅允许 callId 和 imageId，费用由服务端记录' });
        const record = await index_1.prisma.$transaction(async (tx) => {
            const call = await tx.aiUsageCall.findFirst({ where: { id: callId, userId, kind: 'generation', status: 'success', provenance: 'native' } });
            const image = await tx.chromaImage.findFirst({ where: { id: imageId, userId } });
            if (!call || !image)
                return null;
            const imageIds = [...new Set([...call.imageIds, imageId])];
            if (imageIds.length > call.outputCount)
                return null;
            return tx.aiUsageCall.update({ where: { id: callId }, data: { imageIds, storageStatus: 'saved' } });
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if (!record)
            return res.status(404).json({ error: '未找到本人可关联的成功调用或图片' });
        res.json({ id: record.id, imageIds: record.imageIds, storageStatus: record.storageStatus });
    }
    catch (error) {
        console.error('Error associating chroma record:', error);
        res.status(500).json({ error: 'Failed to associate image with call; generation usage remains recorded' });
    }
});
// ── Images ──
router.get('/images', async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const [images, total] = await Promise.all([
            index_1.prisma.chromaImage.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: { id: true, filename: true, originalName: true, size: true, mode: true, model: true, createdAt: true },
            }),
            index_1.prisma.chromaImage.count({ where: { userId } }),
        ]);
        res.json({ images, total, page, limit });
    }
    catch (error) {
        console.error('Error fetching chroma images:', error);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});
router.get('/images/file/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const imageId = String(req.params.id);
        const image = await index_1.prisma.chromaImage.findFirst({
            where: { id: imageId, userId },
        });
        if (!image)
            return res.status(404).json({ error: 'Image not found' });
        const filePath = path_1.default.join(UPLOAD_DIR, userId, image.filename);
        try {
            await promises_1.default.access(filePath);
        }
        catch {
            return res.status(404).json({ error: 'Image file no longer exists' });
        }
        res.sendFile(filePath);
    }
    catch (error) {
        console.error('Error serving image:', error);
        res.status(500).json({ error: 'Failed to serve image' });
    }
});
router.delete('/images/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const imageId = String(req.params.id);
        const image = await index_1.prisma.chromaImage.findFirst({
            where: { id: imageId, userId },
        });
        if (!image)
            return res.status(404).json({ error: 'Image not found' });
        const filePath = path_1.default.join(UPLOAD_DIR, userId, image.filename);
        await promises_1.default.unlink(filePath).catch(() => { });
        await index_1.prisma.chromaImage.delete({ where: { id: image.id } });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});
router.post('/images', async (req, res) => {
    try {
        const userId = req.user.id;
        const { image, originalName, callId, outputIndex = 0 } = req.body;
        if (typeof callId !== 'string')
            return res.status(400).json({ error: 'callId is required for generated images' });
        const call = await index_1.prisma.aiUsageCall.findFirst({ where: { id: callId, userId, kind: 'generation', status: 'success', provenance: 'native' } });
        if (!call)
            return res.status(404).json({ error: 'Successful call not found' });
        if (!Number.isSafeInteger(outputIndex) || outputIndex < 0 || outputIndex >= call.outputCount)
            return res.status(400).json({ error: 'Invalid outputIndex' });
        if (typeof image !== 'string' || !image || (originalName != null && (typeof originalName !== 'string' || originalName.length > 255)))
            return res.status(400).json({ error: 'Invalid image or originalName' });
        const stableImageId = crypto_1.default.createHash('sha256').update(callId + ':' + outputIndex).digest('hex');
        {
            const existing = await index_1.prisma.chromaImage.findFirst({ where: { id: stableImageId, userId } });
            if (existing)
                return res.json(existing);
        }
        if (!image)
            return res.status(400).json({ error: 'Missing required field: image' });
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
        const filename = `${Date.now()}-${crypto_1.default.randomUUID()}.png`;
        const filePath = path_1.default.join(userDir, filename);
        await promises_1.default.writeFile(filePath, buffer);
        let chromaImage;
        try {
            for (let attempt = 0;; attempt++) {
                try {
                    chromaImage = await index_1.prisma.$transaction(async (tx) => {
                        const latest = await tx.aiUsageCall.findUniqueOrThrow({ where: { id: callId } });
                        {
                            const existing = await tx.chromaImage.findFirst({ where: { id: stableImageId, userId } });
                            if (existing)
                                return existing;
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
                        await tx.aiUsageCall.update({ where: { id: callId }, data: { imageIds: [...new Set([...latest.imageIds, saved.id])], storageStatus: latest.imageIds.length + 1 >= latest.outputCount ? 'saved' : 'pending' } });
                        return saved;
                    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
                    break;
                }
                catch (error) {
                    if (error.code !== 'P2034' || attempt >= 2)
                        throw error;
                }
            }
        }
        catch (error) {
            await promises_1.default.unlink(filePath).catch(() => { });
            throw error;
        }
        if (chromaImage.filename !== filename)
            await promises_1.default.unlink(filePath).catch(() => { });
        await cleanupOldImages(userId);
        res.status(201).json(chromaImage);
    }
    catch (error) {
        console.error('Error uploading image');
        if (typeof req.body.callId === 'string')
            await index_1.prisma.aiUsageCall.updateMany({ where: { id: req.body.callId, userId: req.user.id, storageStatus: { not: 'saved' } }, data: { storageStatus: 'failed' } }).catch(err => console.error('Storage status persistence failed:', err));
        res.status(500).json({ error: 'Failed to upload image' });
    }
});
exports.default = router;
