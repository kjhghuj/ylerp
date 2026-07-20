"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const activityLogger_1 = require("../services/activityLogger");
const productCache_1 = require("../services/productCache");
const productTaxRates_1 = require("../services/productTaxRates");
const profitTemplateData_1 = require("../services/profitTemplateData");
const productWithTemplates_1 = require("../services/productWithTemplates");
const router = (0, express_1.Router)();
const countryToCurrency = {
    'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR', 'CN': 'CNY',
};
const findUserProduct = (id, userId) => {
    return index_1.prisma.product.findFirst({ where: { id, userId } });
};
const hasPrismaErrorCode = (error, code) => (typeof error === 'object' && error !== null &&
    error.code === code);
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
        const userId = req.user.id;
        const cacheKey = (0, productCache_1.getProductListCacheKey)(userId);
        const cachedProducts = await index_1.safeRedis.get(cacheKey);
        if (cachedProducts) {
            return res.json(JSON.parse(cachedProducts));
        }
        const products = await index_1.prisma.product.findMany({ where: { userId } });
        await index_1.safeRedis.set(cacheKey, JSON.stringify(products), 'EX', 3600);
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice, sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue, platformInfrastructureFee, sites, siteData } = req.body;
        const productTaxRates = (0, productTaxRates_1.parseOptionalProductTaxRates)(req.body);
        const product = await index_1.prisma.product.create({
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, ...productTaxRates, userId }
        });
        await index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId));
        (0, activityLogger_1.logActivity)(userId, 'product_create', 'product', { name, sku, country }).catch(err => console.error("活动记录失败:", err));
        res.status(201).json(product);
    }
    catch (error) {
        if (error instanceof productTaxRates_1.ProductTaxRateValidationError) {
            return res.status(400).json({ error: 'Invalid tax rate fields' });
        }
        res.status(500).json({ error: 'Failed to create product' });
    }
});
const saveProductWithTemplatesHandler = (mode) => async (req, res) => {
    try {
        const userId = req.user.id;
        const request = (0, productWithTemplates_1.parseProductWithTemplatesRequest)(req.body, mode);
        const productId = mode === 'update' && typeof req.params.id === 'string'
            ? req.params.id
            : undefined;
        if (mode === 'update' && !productId) {
            throw new productWithTemplates_1.ProductWithTemplatesError(400, 'Product id is required');
        }
        const result = await (0, productWithTemplates_1.saveProductWithTemplates)({
            prisma: index_1.prisma,
            userId,
            ...(productId ? { productId } : {}),
            request,
        });
        await Promise.allSettled([
            index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId)),
            (0, activityLogger_1.logActivity)(userId, mode === 'create' ? 'product_create' : 'product_update', 'product', {
                name: String(request.product.name),
                sku: String(request.product.sku),
                country: request.product.country === null || request.product.country === undefined
                    ? null
                    : String(request.product.country),
            }),
        ]);
        return res.status(mode === 'create' ? 201 : 200).json(result);
    }
    catch (error) {
        if (error instanceof productWithTemplates_1.ProductWithTemplatesError) {
            return res.status(error.status).json({
                error: error.publicMessage,
                ...(error.status === 400 ? {
                    code: productWithTemplates_1.INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
                } : {}),
            });
        }
        if ((0, productWithTemplates_1.isProductWithTemplatesValidationError)(error)) {
            const message = error instanceof profitTemplateData_1.ProfitTemplateDataValidationError
                ? error.message
                : 'Invalid tax rate fields';
            return res.status(400).json({
                error: message,
                code: productWithTemplates_1.INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
            });
        }
        if ((0, productWithTemplates_1.isProductWithTemplatesPrismaConflict)(error)) {
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
        if (req.user.role !== 'owner') {
            const user = await index_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: { permissions: true, isActive: true },
            });
            if (!user?.isActive ||
                !(user.permissions || []).some(permission => DASHBOARD_PROFIT_PERMISSIONS.has(permission))) {
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
        const templates = await index_1.prisma.productProfitTemplate.findMany({
            where: { isPrimary: true, product: { userId: req.user.id } },
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
    }
    catch (error) {
        console.error('Failed to fetch primary profit templates:', error);
        res.status(500).json({ error: 'Failed to fetch primary profit templates' });
    }
});
router.get('/:id/templates', async (req, res) => {
    try {
        const userId = req.user.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        const templates = await index_1.prisma.productProfitTemplate.findMany({
            where: { productId: req.params.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Failed to fetch product templates:', error);
        res.status(500).json({ error: 'Failed to fetch product templates' });
    }
});
router.post('/:id/templates', async (req, res) => {
    try {
        const userId = req.user.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        const { templateId, name, country, platform, data } = req.body;
        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const validatedData = (0, profitTemplateData_1.validateProductProfitTemplateData)(data);
        const validatedCountry = (0, productWithTemplates_1.parseProductTemplateCountry)(country, 'country');
        if (templateId) {
            const template = await index_1.prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template)
                return res.status(404).json({ error: 'Template not found' });
        }
        const template = await index_1.prisma.productProfitTemplate.create({
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
    }
    catch (error) {
        if (error instanceof profitTemplateData_1.ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof productWithTemplates_1.ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
        console.error('Failed to create product template:', error);
        res.status(500).json({ error: 'Failed to create product template' });
    }
});
router.put('/:id/templates/:linkId', async (req, res) => {
    try {
        const userId = req.user.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        const existing = await index_1.prisma.productProfitTemplate.findFirst({
            where: { id: req.params.linkId, productId: req.params.id },
        });
        if (!existing)
            return res.status(404).json({ error: 'Product template not found' });
        const { templateId, name, country, platform, data } = req.body;
        const validatedCountry = country !== undefined
            ? (0, productWithTemplates_1.parseProductTemplateCountry)(country, 'country')
            : undefined;
        const validatedData = data !== undefined
            ? (0, profitTemplateData_1.validateProductProfitTemplateData)(data)
            : undefined;
        if (templateId) {
            const template = await index_1.prisma.profitTemplate.findFirst({ where: { id: templateId, userId } });
            if (!template)
                return res.status(404).json({ error: 'Template not found' });
        }
        const template = await index_1.prisma.productProfitTemplate.update({
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
    }
    catch (error) {
        if (error instanceof profitTemplateData_1.ProfitTemplateDataValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof productWithTemplates_1.ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
        if ((0, productWithTemplates_1.isProductWithTemplatesPrismaConflict)(error)) {
            return res.status(409).json({ error: 'Product template conflict' });
        }
        console.error('Failed to update product template:', error);
        res.status(500).json({ error: 'Failed to update product template' });
    }
});
router.put('/:id/templates/:linkId/primary', async (req, res) => {
    try {
        const userId = req.user.id;
        if (typeof req.body?.isPrimary !== 'boolean') {
            return res.status(400).json({ error: 'isPrimary must be a boolean' });
        }
        if (req.user.role !== 'owner') {
            const user = await index_1.prisma.user.findUnique({
                where: { id: userId },
                select: { permissions: true, isActive: true },
            });
            if (!user?.isActive ||
                !(user.permissions || []).some(permission => (PRODUCT_TEMPLATE_WRITE_PERMISSIONS.has(permission)))) {
                return res.status(403).json({ error: 'Insufficient product edit permission' });
            }
        }
        let updated;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                updated = await index_1.prisma.$transaction(async (tx) => {
                    const product = await tx.product.findFirst({
                        where: { id: req.params.id, userId },
                    });
                    if (!product) {
                        throw new productWithTemplates_1.ProductWithTemplatesError(404, 'Product not found');
                    }
                    const existing = await tx.productProfitTemplate.findFirst({
                        where: { id: req.params.linkId, productId: req.params.id },
                    });
                    if (!existing) {
                        throw new productWithTemplates_1.ProductWithTemplatesError(404, 'Product template not found');
                    }
                    if (!req.body.isPrimary) {
                        return tx.productProfitTemplate.update({
                            where: { id: existing.id },
                            data: { isPrimary: false },
                        });
                    }
                    const country = (0, productWithTemplates_1.parseProductTemplateCountry)(existing.country, 'productTemplate.country');
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
                }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
                break;
            }
            catch (error) {
                if (hasPrismaErrorCode(error, 'P2034') && attempt < 2)
                    continue;
                throw error;
            }
        }
        res.json(updated);
    }
    catch (error) {
        if (error instanceof productWithTemplates_1.ProductWithTemplatesError) {
            return res.status(error.status).json({ error: error.publicMessage });
        }
        if ((0, productWithTemplates_1.isProductWithTemplatesPrismaConflict)(error)) {
            return res.status(409).json({ error: 'Primary template conflict' });
        }
        console.error('Failed to update primary profit template:', error);
        res.status(500).json({ error: 'Failed to update primary profit template' });
    }
});
router.delete('/:id/templates/:linkId', async (req, res) => {
    try {
        const userId = req.user.id;
        const product = await findUserProduct(req.params.id, userId);
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        const existing = await index_1.prisma.productProfitTemplate.findFirst({
            where: { id: req.params.linkId, productId: req.params.id },
        });
        if (!existing)
            return res.status(404).json({ error: 'Product template not found' });
        await index_1.prisma.productProfitTemplate.delete({ where: { id: req.params.linkId } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Failed to delete product template:', error);
        res.status(500).json({ error: 'Failed to delete product template' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await findUserProduct(req.params.id, userId);
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice, sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue, platformInfrastructureFee, sites, siteData } = req.body;
        const productTaxRates = (0, productTaxRates_1.parseOptionalProductTaxRates)(req.body);
        const product = await index_1.prisma.product.update({
            where: { id: req.params.id },
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, ...productTaxRates },
        });
        await index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId));
        res.json(product);
    }
    catch (error) {
        if (error instanceof productTaxRates_1.ProductTaxRateValidationError) {
            return res.status(400).json({ error: 'Invalid tax rate fields' });
        }
        res.status(500).json({ error: 'Failed to update product' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await findUserProduct(req.params.id, userId);
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const site = req.query.site;
        if (site) {
            const remainingSites = (existing.sites || []).filter(s => s !== site);
            const siteCurrency = countryToCurrency[site] || site;
            if (remainingSites.length === 0) {
                await index_1.prisma.productProfitTemplate.deleteMany({ where: { productId: req.params.id } });
                await index_1.prisma.profitTemplate.deleteMany({ where: { productId: req.params.id } });
                await index_1.prisma.product.delete({ where: { id: req.params.id } });
            }
            else {
                await index_1.prisma.productProfitTemplate.deleteMany({
                    where: { productId: req.params.id, country: { in: [site, siteCurrency] } },
                });
                await index_1.prisma.profitTemplate.deleteMany({
                    where: { productId: req.params.id, country: { in: [site, siteCurrency] } },
                });
                await index_1.prisma.product.update({
                    where: { id: req.params.id },
                    data: { sites: remainingSites },
                });
            }
        }
        else {
            await index_1.prisma.profitTemplate.deleteMany({ where: { productId: req.params.id } });
            await index_1.prisma.product.delete({ where: { id: req.params.id } });
        }
        await index_1.safeRedis.del((0, productCache_1.getProductListCacheKey)(userId));
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});
exports.default = router;
