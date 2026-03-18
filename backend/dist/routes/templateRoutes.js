"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get templates by country
router.get('/:country', async (req, res) => {
    try {
        const { country } = req.params;
        const templates = await prisma.profitTemplate.findMany({
            where: { country },
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});
// Create a new template
router.post('/', async (req, res) => {
    try {
        const { name, country, data } = req.body;
        if (!name || !country || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const template = await prisma.profitTemplate.create({
            data: {
                name,
                country,
                data
            }
        });
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});
// Delete a template
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.profitTemplate.delete({
            where: { id }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});
exports.default = router;
