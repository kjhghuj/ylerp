import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, safeRedis } from '../index';
import { logActivity } from '../services/activityLogger';
import { getProductListCacheKey } from '../services/productCache';
import {
    parseOptionalProductTaxRates,
    ProductTaxRateValidationError,
} from '../services/productTaxRates';
import {
    ProfitTemplateDataValidationError,
    validateProductProfitTemplateData,
} from '../services/profitTemplateData';
import {
    INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    isProductWithTemplatesPrismaConflict,
    isProductWithTemplatesValidationError,
    parseProductWithTemplatesRequest,
    parseProductTemplateCountry,
    ProductWithTemplatesError,
    saveProductWithTemplates,
} from '../services/productWithTemplates';

const router = Router();

const countryToCurrency: Record<string, string> = {
    'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR', 'CN': 'CNY',
};

const findUserProduct = (id: string, userId: string) => {
    return prisma.product.findFirst({ where: { id, userId } });
};

const hasPrismaErrorCode = (error: unknown, code: string): boolean => (
    typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === code
);

const DASHBOARD_PROFIT_PERMISSIONS = new Set([
    '*',
    'dashboard',
    'dashboard.margin',
    'dashboard.profitTable',
]);

const PRODUCT_TEMPLATE_WRITE_PERMISSIONS = new Set([
    '*',
    'product-list',
    'product-list.edit',
]);

const DASHBOARD_PROFIT_PAGE_SIZE = 4;
const DASHBOARD_PROFIT_MAX_PAGE = 250;
const DASHBOARD_PROFIT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

router.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const cacheKey = getProductListCacheKey(userId);
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
        const productTaxRates = parseOptionalProductTaxRates(req.body);
        const product = await prisma.product.create({
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, ...productTaxRates, userId }
        });
        await safeRedis.del(getProductListCacheKey(userId));
        logActivity(userId, 'product_create', 'product', { name, sku, country }).catch(err => console.error("活动记录失败:", err));
        res.status(201).json(product);
    } catch (error) {
        if (error instanceof ProductTaxRateValidationError) {
            return res.status(400).json({ error: 'Invalid tax rate fields' });
        }
        res.status(500).json({ error: 'Failed to create product' });
    }
});

const saveProductWithTemplatesHandler = (mode: 'create' | 'update') => async (
    req: Request,
    res: Response,
) => {
    try {
        const userId = req.user!.id;
        const request = parseProductWithTemplatesRequest(req.body, mode);
        const productId = mode === 'update' && typeof req.params.id === 'string'
            ? req.params.id
            : undefined;
        if (mode === 'update' && !productId) {
            throw new ProductWithTemplatesError(400, 'Product id is required');
        }
        const result = await saveProductWithTemplates({
            prisma,
            userId,
            ...(productId ? { productId } : {}),
            request,
        });

        await Promise.allSettled([
            safeRedis.del(getProductListCacheKey(userId)),
            logActivity(
                userId,
                mode === 'create' ? 'product_create' : 'product_update',
                'product',
                {
                    name: String(request.product.name),
                    sku: String(request.product.sku),
                    country: request.product.country === null || request.product.country === undefined
                        ? null
                        : String(request.product.country),
                },
            ),
        ]);
        return res.status(mode === 'create' ? 201 : 200).json(result);
    } catch (error) {
        if (error instanceof ProductWithTemplatesError) {
            return res.status(error.status).json({
                error: error.publicMessage,
                ...(error.status === 400 ? {
                    code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
                } : {}),
            });
        }
        if (isProductWithTemplatesValidationError(error)) {
            const message = error instanceof ProfitTemplateDataValidationError
                ? error.message
                : 'Invalid tax rate fields';
            return res.status(400).json({
                error: message,
                code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
            });
        }
        if (isProductWithTemplatesPrismaConflict(error)) {
            return res.status(409).json({ error: 'Product conflict' });
        }
        console.error('Failed to save product with templates:', error);
        return res.status(500).json({ error: 'Failed to save product with templates' });
    }
};

router.post('/with-templates', saveProductWithTemplatesHandler('create'));
router.put('/:id/with-templates', saveProductWithTemplatesHandler('update'));

router.get('/primary-profit-templates', async (req, res) => {
    try {
        if (req.user!.role !== 'owner') {
            const user = await prisma.user.findUnique({
                where: { id: req.user!.id },
                select: { permissions: true, isActive: true },
            });
            if (
                !user?.isActive ||
                !(user.permissions || []).some(permission => DASHBOARD_PROFIT_PERMISSIONS.has(permission))
            ) {
                return res.status(403).json({ error: 'Insufficient dashboard profit permission' });
            }
        }
        const rawPage = req.query.page;
        if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^\d+$/.test(rawPage))) {
            return res.status(400).json({ error: 'Invalid dashboard profit page' });
        }
        const page = rawPage === undefined ? 0 : Number(rawPage);
        if (!Number.isSafeInteger(page) || page < 0 || page > DASHBOARD_PROFIT_MAX_PAGE) {
            return res.status(400).json({ error: 'Invalid dashboard profit page' });
        }
        const templates = await prisma.productProfitTemplate.findMany({
            where: { isPrimary: true, product: { userId: req.user!.id } },
            include: { product: true },
            orderBy: [{ productId: 'asc' }, { country: 'asc' }, { id: 'asc' }],
            skip: page * DASHBOARD_PROFIT_PAGE_SIZE,
            take: DASHBOARD_PROFIT_PAGE_SIZE,
        });
        const payload = {
            items: templates,
            hasMore: templates.length === DASHBOARD_PROFIT_PAGE_SIZE,
        };
        if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > DASHBOARD_PROFIT_MAX_RESPONSE_BYTES) {
            return res.status(413).json({ error: 'Dashboard profit response is too large' });
        }
        res.json(payload);
    } catch (error) {
        console.error('Failed to fetch primary profit templates:', error);
        res.status(500).json({ error: 'Failed to fetch primary profit templates' });
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
        const validatedData = validateProductProfitTemplateData(data);
        const validatedCountry = parseProductTemplateCountry(country, 'country');

        if (templateId) {
            const template = await prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template) return res.status(404).json({ error: 'Template not found' });
        }

        const template = await prisma.productProfitTemplate.create({
            data: {
                productId: req.params.id,
                templateId: templateId || null,
                name,
                country: validatedCountry,
                platform,
                data: validatedData,
            },
        });
        res.status(201).json(template);
    } catch (error) {
        if (error instanceof ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
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
        const validatedCountry = country !== undefined
            ? parseProductTemplateCountry(country, 'country')
            : undefined;
        const validatedData = data !== undefined
            ? validateProductProfitTemplateData(data)
            : undefined;
        if (templateId) {
            const template = await prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template) return res.status(404).json({ error: 'Template not found' });
        }

        const template = await prisma.productProfitTemplate.update({
            where: { id: req.params.linkId },
            data: {
                ...(templateId !== undefined ? { templateId: templateId || null } : {}),
                ...(name ? { name } : {}),
                ...(validatedCountry !== undefined ? { country: validatedCountry } : {}),
                ...(platform !== undefined ? { platform } : {}),
                ...(validatedData !== undefined ? { data: validatedData } : {}),
            },
        });
        res.json(template);
    } catch (error) {
        if (error instanceof ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
        if (isProductWithTemplatesPrismaConflict(error)) {
            return res.status(409).json({ error: 'Product template conflict' });
        }
        console.error('Failed to update product template:', error);
        res.status(500).json({ error: 'Failed to update product template' });
    }
});

router.put('/:id/templates/:linkId/primary', async (req, res) => {
    try {
        const userId = req.user!.id;
        if (typeof req.body?.isPrimary !== 'boolean') {
            return res.status(400).json({ error: 'isPrimary must be a boolean' });
        }
        if (req.user!.role !== 'owner') {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { permissions: true, isActive: true },
            });
            if (
                !user?.isActive ||
                !(user.permissions || []).some(permission => (
                    PRODUCT_TEMPLATE_WRITE_PERMISSIONS.has(permission)
                ))
            ) {
                return res.status(403).json({ error: 'Insufficient product edit permission' });
            }
        }
        let updated;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                updated = await prisma.$transaction(async tx => {
                    const product = await tx.product.findFirst({
                        where: { id: req.params.id, userId },
                    });
                    if (!product) {
                        throw new ProductWithTemplatesError(404, 'Product not found');
                    }

                    const existing = await tx.productProfitTemplate.findFirst({
                        where: { id: req.params.linkId, productId: req.params.id },
                    });
                    if (!existing) {
                        throw new ProductWithTemplatesError(404, 'Product template not found');
                    }
                    if (!req.body.isPrimary) {
                        return tx.productProfitTemplate.update({
                            where: { id: existing.id },
                            data: { isPrimary: false },
                        });
                    }
                    const country = parseProductTemplateCountry(
                        existing.country,
                        'productTemplate.country',
                    );
                    await tx.productProfitTemplate.updateMany({
                        where: {
                            productId: req.params.id,
                            country,
                            isPrimary: true,
                            id: { not: existing.id },
                        },
                        data: { isPrimary: false },
                    });
                    return tx.productProfitTemplate.update({
                        where: { id: existing.id },
                        data: { country, isPrimary: true },
                    });
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
                break;
            } catch (error) {
                if (hasPrismaErrorCode(error, 'P2034') && attempt < 2) continue;
                throw error;
            }
        }
        res.json(updated);
    } catch (error) {
        if (error instanceof ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
        if (isProductWithTemplatesPrismaConflict(error)) {
            return res.status(409).json({ error: 'Primary template conflict' });
        }
        console.error('Failed to update primary profit template:', error);
        res.status(500).json({ error: 'Failed to update primary profit template' });
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
        const productTaxRates = parseOptionalProductTaxRates(req.body);
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, ...productTaxRates },
        });
        await safeRedis.del(getProductListCacheKey(userId));
        res.json(product);
    } catch (error) {
        if (error instanceof ProductTaxRateValidationError) {
            return res.status(400).json({ error: 'Invalid tax rate fields' });
        }
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

        await safeRedis.del(getProductListCacheKey(userId));
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
