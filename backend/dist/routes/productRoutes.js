"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const activityLogger_1 = require("../services/activityLogger");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `products:${userId}`;
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
        const product = await index_1.prisma.product.create({
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData, userId }
        });
        await index_1.safeRedis.del(`products:${userId}`);
        (0, activityLogger_1.logActivity)(userId, 'product_create', 'product', { name, sku, country }).catch(() => { });
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.product.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice, sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue, platformInfrastructureFee, sites, siteData } = req.body;
        const product = await index_1.prisma.product.update({
            where: { id: req.params.id },
            data: { name, sku, country, cost, productWeight, supplierTaxPoint, supplierInvoice,
                sellerCouponType, sellerCoupon, sellerCouponPlatformRatio, adROI, totalRevenue,
                platformInfrastructureFee, sites, siteData },
        });
        await index_1.safeRedis.del(`products:${userId}`);
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await index_1.prisma.product.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const site = req.query.site;
        const countryToCurrency = {
            'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR',
        };
        if (site) {
            const remainingSites = (existing.sites || []).filter(s => s !== site);
            const siteCurrency = countryToCurrency[site] || site;
            if (remainingSites.length === 0) {
                await index_1.prisma.profitTemplate.deleteMany({ where: { productId: req.params.id } });
                await index_1.prisma.product.delete({ where: { id: req.params.id } });
            }
            else {
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
        await index_1.safeRedis.del(`products:${userId}`);
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});
exports.default = router;
