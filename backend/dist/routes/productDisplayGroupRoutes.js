"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
const canView = (0, authMiddleware_1.authorizeAnyPermission)('product-list.view', 'product-list.edit');
const canEdit = (0, authMiddleware_1.authorizeAnyPermission)('product-list.edit');
const memberSelection = { productId: true, createdAt: true };
const groupInclude = { members: { select: memberSelection } };
const normalizeName = (value) => {
    if (typeof value !== 'string')
        return null;
    const name = value.trim();
    return name.length > 0 && name.length <= 120 ? name : null;
};
const normalizeProductIds = (value) => {
    if (!Array.isArray(value))
        return null;
    if (value.some(id => typeof id !== 'string' || id.trim().length === 0 || id.length > 100))
        return null;
    return Array.from(new Set(value.map(id => id.trim())));
};
const findOwnedGroup = (client, id, userId) => (client.productDisplayGroup.findFirst({ where: { id, userId } }));
const readOwnedGroup = (client, id, userId) => (client.productDisplayGroup.findFirst({ where: { id, userId }, include: groupInclude }));
const allProductsBelongToUser = async (client, productIds, userId) => {
    const count = await client.product.count({ where: { userId, id: { in: productIds } } });
    return count === productIds.length;
};
const isUniqueConflict = (error) => (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') || (typeof error === 'object' && error !== null && error.code === 'P2002');
const isSchemaNotReady = (error) => (typeof error === 'object' && error !== null &&
    ['P2021', 'P2022'].includes(String(error.code)));
const schemaNotReadyResponse = {
    error: '商品分组数据表尚未初始化，请联系管理员执行数据库迁移',
    code: 'GROUP_SCHEMA_NOT_READY',
};
router.get('/', canView, async (req, res) => {
    try {
        const groups = await index_1.prisma.productDisplayGroup.findMany({
            where: { userId: req.user.id },
            include: groupInclude,
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        });
        res.json(groups);
    }
    catch (error) {
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        console.error('Failed to fetch product display groups:', error);
        res.status(500).json({ error: 'Failed to fetch product groups' });
    }
});
router.post('/', canEdit, async (req, res) => {
    const name = normalizeName(req.body?.name);
    const productIds = normalizeProductIds(req.body?.productIds);
    if (!name || !productIds || productIds.length < 2) {
        return res.status(400).json({ error: 'A name and at least two distinct products are required' });
    }
    try {
        const group = await index_1.prisma.$transaction(async (tx) => {
            if (!await allProductsBelongToUser(tx, productIds, req.user.id)) {
                throw new Error('INVALID_PRODUCTS');
            }
            const created = await tx.productDisplayGroup.create({
                data: { name, userId: req.user.id },
            });
            await tx.productDisplayGroupMember.createMany({
                data: productIds.map(productId => ({ groupId: created.id, productId })),
            });
            return readOwnedGroup(tx, created.id, req.user.id);
        });
        return res.status(201).json(group);
    }
    catch (error) {
        if (isUniqueConflict(error))
            return res.status(409).json({ error: 'One or more products already belong to a group' });
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        if (error instanceof Error && error.message === 'INVALID_PRODUCTS') {
            return res.status(400).json({ error: 'One or more products are invalid' });
        }
        console.error('Failed to create product display group:', error);
        return res.status(500).json({ error: 'Failed to create product group' });
    }
});
router.put('/:id', canEdit, async (req, res) => {
    const name = normalizeName(req.body?.name);
    if (!name)
        return res.status(400).json({ error: 'A valid group name is required' });
    try {
        const group = await findOwnedGroup(index_1.prisma, String(req.params.id), req.user.id);
        if (!group)
            return res.status(404).json({ error: 'Product group not found' });
        const updated = await index_1.prisma.productDisplayGroup.update({
            where: { id: group.id },
            data: { name },
            include: groupInclude,
        });
        return res.json(updated);
    }
    catch (error) {
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        console.error('Failed to rename product display group:', error);
        return res.status(500).json({ error: 'Failed to rename product group' });
    }
});
router.post('/:id/members', canEdit, async (req, res) => {
    const productIds = normalizeProductIds(req.body?.productIds);
    if (!productIds?.length)
        return res.status(400).json({ error: 'At least one product is required' });
    try {
        const updated = await index_1.prisma.$transaction(async (tx) => {
            const group = await findOwnedGroup(tx, String(req.params.id), req.user.id);
            if (!group)
                throw new Error('GROUP_NOT_FOUND');
            if (!await allProductsBelongToUser(tx, productIds, req.user.id))
                throw new Error('INVALID_PRODUCTS');
            await tx.productDisplayGroupMember.createMany({
                data: productIds.map(productId => ({ groupId: group.id, productId })),
            });
            await tx.productDisplayGroup.update({ where: { id: group.id }, data: { updatedAt: new Date() } });
            return readOwnedGroup(tx, group.id, req.user.id);
        });
        return res.json(updated);
    }
    catch (error) {
        if (isUniqueConflict(error))
            return res.status(409).json({ error: 'One or more products already belong to a group' });
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        if (error instanceof Error && error.message === 'GROUP_NOT_FOUND')
            return res.status(404).json({ error: 'Product group not found' });
        if (error instanceof Error && error.message === 'INVALID_PRODUCTS')
            return res.status(400).json({ error: 'One or more products are invalid' });
        console.error('Failed to add product display group members:', error);
        return res.status(500).json({ error: 'Failed to add group members' });
    }
});
router.delete('/:id/members/:productId', canEdit, async (req, res) => {
    try {
        const removed = await index_1.prisma.$transaction(async (tx) => {
            const group = await findOwnedGroup(tx, String(req.params.id), req.user.id);
            if (!group)
                return null;
            const result = await tx.productDisplayGroupMember.deleteMany({
                where: { groupId: group.id, productId: String(req.params.productId) },
            });
            if (result.count > 0) {
                await tx.productDisplayGroup.update({ where: { id: group.id }, data: { updatedAt: new Date() } });
            }
            return result.count;
        });
        if (removed === null)
            return res.status(404).json({ error: 'Product group not found' });
        if (removed === 0)
            return res.status(404).json({ error: 'Group member not found' });
        return res.status(204).send();
    }
    catch (error) {
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        console.error('Failed to remove product display group member:', error);
        return res.status(500).json({ error: 'Failed to remove group member' });
    }
});
router.delete('/:id', canEdit, async (req, res) => {
    try {
        const group = await findOwnedGroup(index_1.prisma, String(req.params.id), req.user.id);
        if (!group)
            return res.status(404).json({ error: 'Product group not found' });
        await index_1.prisma.productDisplayGroup.delete({ where: { id: group.id } });
        return res.status(204).send();
    }
    catch (error) {
        if (isSchemaNotReady(error))
            return res.status(503).json(schemaNotReadyResponse);
        console.error('Failed to delete product display group:', error);
        return res.status(500).json({ error: 'Failed to delete product group' });
    }
});
exports.default = router;
