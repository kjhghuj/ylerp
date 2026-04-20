"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `products:${userId}`;
        const cachedProducts = await index_1.redis.get(cacheKey);
        if (cachedProducts) {
            return res.json(JSON.parse(cachedProducts));
        }
        const products = await prisma.product.findMany({ where: { userId } });
        await index_1.redis.set(cacheKey, JSON.stringify(products), 'EX', 3600);
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const product = await prisma.product.create({ data: { ...req.body, userId } });
        await index_1.redis.del(`products:${userId}`);
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await prisma.product.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: req.body,
        });
        await index_1.redis.del(`products:${userId}`);
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await prisma.product.findFirst({ where: { id: req.params.id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        await prisma.product.delete({ where: { id: req.params.id } });
        await index_1.redis.del(`products:${userId}`);
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});
exports.default = router;
