import { Router } from 'express';
import { prisma, safeRedis } from '../index';
import { logActivity } from '../services/activityLogger';

const router = Router();

const countryToCurrency: Record<string, string> = {
    'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR',
};

const findUserProduct = (id: string, userId: string) => {
    return prisma.product.findFirst({ where: { id, userId } });
};

router.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const cacheKey = `products:${userId}`;
        const cachedProducts = await safeRedis.get(cacheKey);
        if (cachedProducts) {
            return res.json(JSON.parse(cachedProducts));
        }

        const products = await prisma.product.findMany({ where: { userId } });
        await safeRedis.set(cacheKey, JSON.stringify(products), 'EX', 3600);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
            sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
            platformInfrastructureFee, sites, siteData } = req.body;
        const product = await prisma.product.create({
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, userId }
        });
        await safeRedis.del(`products:${userId}`);
        logActivity(userId, 'product_create', 'product', { name, sku, country }).catch(err => console.error("活动记录失败:", err));
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});

router.get('/:id/templates', async (req, res) => {
    try {
        const userId = req.user!.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const templates = await prisma.productProfitTemplate.findMany({
            where: { productId: req.params.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json(templates);
    } catch (error) {
        console.error('Failed to fetch product templates:', error);
        res.status(500).json({ error: 'Failed to fetch product templates' });
    }
});

router.post('/:id/templates', async (req, res) => {
    try {
        const userId = req.user!.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const { templateId, name, country, platform, data } = req.body;
        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (templateId) {
            const template = await prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template) return res.status(404).json({ error: 'Template not found' });
        }

        const template = await prisma.productProfitTemplate.create({
            data: {
                productId: req.params.id,
                templateId: templateId || null,
                name,
                country,
                platform,
                data,
            },
        });
        res.status(201).json(template);
    } catch (error) {
        console.error('Failed to create product template:', error);
        res.status(500).json({ error: 'Failed to create product template' });
    }
});

router.put('/:id/templates/:linkId', async (req, res) => {
    try {
        const userId = req.user!.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const existing = await prisma.productProfitTemplate.findFirst({
            where: { id: req.params.linkId, productId: req.params.id },
        });
        if (!existing) return res.status(404).json({ error: 'Product template not found' });

        const { templateId, name, country, platform, data } = req.body;
        if (templateId) {
            const template = await prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template) return res.status(404).json({ error: 'Template not found' });
        }

        const template = await prisma.productProfitTemplate.update({
            where: { id: req.params.linkId },
            data: {
                ...(templateId !== undefined ? { templateId: templateId || null } : {}),
                ...(name ? { name } : {}),
                ...(country ? { country } : {}),
                ...(platform !== undefined ? { platform } : {}),
                ...(data ? { data } : {}),
            },
        });
        res.json(template);
    } catch (error) {
        console.error('Failed to update product template:', error);
        res.status(500).json({ error: 'Failed to update product template' });
    }
});

router.delete('/:id/templates/:linkId', async (req, res) => {
    try {
        const userId = req.user!.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const existing = await prisma.productProfitTemplate.findFirst({
            where: { id: req.params.linkId, productId: req.params.id },
        });
        if (!existing) return res.status(404).json({ error: 'Product template not found' });

        await prisma.productProfitTemplate.delete({ where: { id: req.params.linkId } });
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete product template:', error);
        res.status(500).json({ error: 'Failed to delete product template' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const existing = await findUserProduct(req.params.id, userId);
        if (!existing) return res.status(404).json({ error: 'Product not found' });

        const { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
            sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
            platformInfrastructureFee, sites, siteData } = req.body;
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData },
        });
        await safeRedis.del(`products:${userId}`);
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user!.id;
        const existing = await findUserProduct(req.params.id, userId);
        if (!existing) return res.status(404).json({ error: 'Product not found' });

        const site = req.query.site as string | undefined;

        if (site) {
            const remainingSites = (existing.sites || []).filter(s => s !== site);
            const siteCurrency = countryToCurrency[site] || site;
            if (remainingSites.length === 0) {
                await prisma.productProfitTemplate.deleteMany({ where: { productId: req.params.id } });
                await prisma.profitTemplate.deleteMany({ where: { productId: req.params.id } });
                await prisma.product.delete({ where: { id: req.params.id } });
            } else {
                await prisma.productProfitTemplate.deleteMany({
                    where: { productId: req.params.id, country: { in: [site, siteCurrency] } },
                });
                await prisma.profitTemplate.deleteMany({
                    where: { productId: req.params.id, country: { in: [site, siteCurrency] } },
                });
                await prisma.product.update({
                    where: { id: req.params.id },
                    data: { sites: remainingSites },
                });
            }
        } else {
            await prisma.profitTemplate.deleteMany({ where: { productId: req.params.id } });
            await prisma.product.delete({ where: { id: req.params.id } });
        }

        await safeRedis.del(`products:${userId}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
