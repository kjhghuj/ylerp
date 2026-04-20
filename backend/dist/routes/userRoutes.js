"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(authMiddleware_1.authenticate);
router.get('/me/profile', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true, username: true, displayName: true,
                phone: true, email: true, avatar: true,
                role: true, parentId: true, permissions: true,
                isActive: true, createdAt: true, updatedAt: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: '获取个人信息失败' });
    }
});
router.put('/me/profile', async (req, res) => {
    try {
        const { displayName, phone, email, avatar } = req.body;
        const updateData = {};
        if (displayName !== undefined && displayName.trim())
            updateData.displayName = displayName.trim();
        if (phone !== undefined)
            updateData.phone = phone.trim() || null;
        if (email !== undefined)
            updateData.email = email.trim() || null;
        if (avatar !== undefined)
            updateData.avatar = avatar.trim() || null;
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                id: true, username: true, displayName: true,
                phone: true, email: true, avatar: true,
                role: true, parentId: true, permissions: true,
                isActive: true, createdAt: true, updatedAt: true,
            },
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: '更新个人信息失败' });
    }
});
router.put('/me/password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '请填写旧密码和新密码' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const valid = await bcrypt_1.default.compare(oldPassword, user.password);
        if (!valid) {
            return res.status(400).json({ error: '旧密码不正确' });
        }
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword },
        });
        res.json({ message: '密码修改成功' });
    }
    catch (error) {
        res.status(500).json({ error: '修改密码失败' });
    }
});
router.get('/', (0, authMiddleware_1.authorize)('owner', 'admin'), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, username: true, displayName: true, role: true,
                parentId: true, permissions: true, isActive: true,
                createdAt: true, updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: '获取用户列表失败' });
    }
});
router.post('/', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        const { username, password, displayName, role, permissions } = req.body;
        if (!username || !password || !displayName) {
            return res.status(400).json({ error: '请填写所有必填字段' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(409).json({ error: '用户名已存在' });
        }
        const validRoles = ['admin', 'viewer'];
        const finalRole = validRoles.includes(role) ? role : 'viewer';
        const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!currentUser) {
            return res.status(401).json({ error: '当前账户不存在，请重新登录' });
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username, password: hashedPassword, displayName,
                role: finalRole, parentId: currentUser.id,
                permissions: Array.isArray(permissions) ? permissions : [],
            },
            select: {
                id: true, username: true, displayName: true, role: true,
                parentId: true, permissions: true, isActive: true,
                createdAt: true, updatedAt: true,
            },
        });
        res.status(201).json(user);
    }
    catch (error) {
        console.error('Create user error:', error);
        if (error?.code === 'P2002') {
            res.status(409).json({ error: '用户名已存在' });
        }
        else if (error?.code === 'P2003') {
            res.status(400).json({ error: '父账户不存在，请重新登录后重试' });
        }
        else {
            res.status(500).json({ error: '创建用户失败: ' + (error?.message || '') });
        }
    }
});
router.put('/:id', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        const { displayName, role, isActive, password, permissions } = req.body;
        const targetId = req.params.id;
        if (targetId === req.user.id) {
            return res.status(400).json({ error: '不能修改自己的角色' });
        }
        const updateData = {};
        if (displayName !== undefined)
            updateData.displayName = displayName;
        if (role !== undefined) {
            const validRoles = ['admin', 'viewer'];
            if (validRoles.includes(role))
                updateData.role = role;
        }
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (Array.isArray(permissions))
            updateData.permissions = permissions;
        if (password && password.length >= 6) {
            updateData.password = await bcrypt_1.default.hash(password, 10);
        }
        const user = await prisma.user.update({
            where: { id: targetId },
            data: updateData,
            select: {
                id: true, username: true, displayName: true, role: true,
                parentId: true, permissions: true, isActive: true,
                createdAt: true, updatedAt: true,
            },
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: '更新用户失败' });
    }
});
router.put('/:id/reset-password', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        const targetId = req.params.id;
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }
        if (targetId === req.user.id) {
            return res.status(400).json({ error: '请使用修改密码功能修改自己的密码' });
        }
        const target = await prisma.user.findUnique({ where: { id: targetId } });
        if (!target) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: targetId },
            data: { password: hashedPassword },
        });
        res.json({ message: '密码重置成功' });
    }
    catch (error) {
        res.status(500).json({ error: '重置密码失败' });
    }
});
router.delete('/:id', (0, authMiddleware_1.authorize)('owner'), async (req, res) => {
    try {
        const targetId = req.params.id;
        if (targetId === req.user.id) {
            return res.status(400).json({ error: '不能删除自己' });
        }
        await prisma.user.delete({ where: { id: targetId } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: '删除用户失败' });
    }
});
exports.default = router;
