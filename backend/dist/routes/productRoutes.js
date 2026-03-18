"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all products
router.get('/', async (req, res) => {
    try {
        const cachedProducts = await index_1.redis.get('products');
        if (cachedProducts) {
            return res.json(JSON.parse(cachedProducts));
        }
        const products = await prisma.product.findMany();
        await index_1.redis.set('products', JSON.stringify(products), 'EX', 3600); // Cache for 1 hour
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
// Create product
router.post('/', async (req, res) => {
    try {
        const product = await prisma.product.create({ data: req.body });
        await index_1.redis.del('products'); // Invalidate cache
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});
// Update product
router.put('/:id', async (req, res) => {
    try {
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: req.body,
        });
        await index_1.redis.del('products'); // Invalidate cache
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});
// Delete product
router.delete('/:id', async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        await index_1.redis.del('products'); // Invalidate cache
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});
exports.default = router;
