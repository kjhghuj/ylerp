"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const activityLogger_1 = require("../services/activityLogger");
const productCache_1 = require("../services/productCache");
const productTaxRates_1 = require("../services/productTaxRates");
const profitTemplateData_1 = require("../services/profitTemplateData");
const router = (0, express_1.Router)();
const countryToCurrency = {
    'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR',
};
const findUserProduct = (id, userId) => {
    return index_1.prisma.product.findFirst({ where: { id, userId } });
};
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
                country,
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
                ...(country ? { country } : {}),
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
        console.error('Failed to update product template:', error);
        res.status(500).json({ error: 'Failed to update product template' });
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
