"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const activityLogger_1 = require("../services/activityLogger");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'yangling-erp-secret-key-2026';
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }
        const user = await index_1.prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        if (!user.isActive) {
            return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
        }
        const isValid = await bcrypt_1.default.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        (0, activityLogger_1.logActivity)(user.id, 'login', 'auth', { username: user.username }, ip).catch(err => console.error('登录活动记录失败:', err));
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                phone: user.phone,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                parentId: user.parentId,
                permissions: user.permissions,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '登录失败' });
    }
});
// GET /api/auth/me — Get current user from token
router.get('/me', authMiddleware_1.authenticate, async (req, res) => {
    try {
        if (req.user.id === 'dev-admin-id') {
            return res.json({
                id: 'dev-admin-id',
                username: 'admin',
                displayName: '超级管理员(Dev)',
                role: 'owner',
                parentId: null,
                permissions: ['*'],
                isActive: true,
                createdAt: new Date(),
            });
        }
        const user = await index_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                displayName: true,
                phone: true,
                email: true,
                avatar: true,
                role: true,
                parentId: true,
                permissions: true,
                isActive: true,
                createdAt: true,
            },
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: '用户不存在或已被禁用' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: '获取用户信息失败' });
    }
});
// PUT /api/auth/password — Change own password
router.put('/password', authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '请输入旧密码和新密码' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }
        const user = await index_1.prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const isValid = await bcrypt_1.default.compare(oldPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ error: '旧密码错误' });
        }
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        await index_1.prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });
        res.json({ message: '密码修改成功' });
    }
    catch (error) {
        res.status(500).json({ error: '修改密码失败' });
    }
});
// POST /api/auth/verify-password — Verify current password for sensitive operations
router.post('/verify-password', authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: '请输入密码' });
        }
        const user = await index_1.prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const isValid = await bcrypt_1.default.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ valid: false, error: '密码错误' });
        }
        res.json({ valid: true });
    }
    catch (error) {
        res.status(500).json({ error: '验证失败' });
    }
});
exports.default = router;
