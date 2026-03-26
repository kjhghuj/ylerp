import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yangling-erp-secret-key-2026';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }

        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
        }

        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
                parentId: user.parentId,
                permissions: user.permissions,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

// GET /api/auth/me — Get current user from token
router.get('/me', authenticate, async (req, res) => {
    try {
        if (req.user!.id === 'dev-admin-id') {
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

        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true,
                username: true,
                displayName: true,
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
    } catch (error) {
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

// PUT /api/auth/password — Change own password
router.put('/password', authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '请输入旧密码和新密码' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ error: '旧密码错误' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        res.json({ message: '密码修改成功' });
    } catch (error) {
        res.status(500).json({ error: '修改密码失败' });
    }
});

export default router;
