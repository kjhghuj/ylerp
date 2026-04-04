import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();
const prisma = new PrismaClient();

// All user routes require authentication
router.use(authenticate);

// GET /api/users — List users
router.get('/', authorize('owner', 'admin'), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                displayName: true,
                role: true,
                parentId: true,
                permissions: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(users);
    } catch (error) {
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

// POST /api/users — Create sub-account (owner only)
router.post('/', authorize('owner'), async (req, res) => {
    try {
        const { username, password, displayName, role, permissions } = req.body;

        if (!username || !password || !displayName) {
            return res.status(400).json({ error: '请填写所有必填字段' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }

        // Check if username already exists
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(409).json({ error: '用户名已存在' });
        }

        const validRoles = ['admin', 'viewer'];
        const finalRole = validRoles.includes(role) ? role : 'viewer';

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                displayName,
                role: finalRole,
                parentId: req.user!.id,
                permissions: Array.isArray(permissions) ? permissions : [],
            },
            select: {
                id: true,
                username: true,
                displayName: true,
                role: true,
                parentId: true,
                permissions: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        res.status(201).json(user);
    } catch (error: any) {
        console.error('Create user error:', error);
        const msg = error?.message || '创建用户失败';
        if (error?.code === 'P2002') {
            res.status(409).json({ error: '用户名已存在' });
        } else if (error?.code === 'P2003') {
            res.status(400).json({ error: '父账户不存在，请重新登录后重试' });
        } else {
            res.status(500).json({ error: '创建用户失败: ' + msg });
        }
    }
});

// PUT /api/users/:id — Update user (owner only)
router.put('/:id', authorize('owner'), async (req, res) => {
    try {
        const { displayName, role, isActive, password, permissions } = req.body;
        const targetId = req.params.id as string;

        // Prevent owner from demoting themselves
        if (targetId === req.user!.id) {
            return res.status(400).json({ error: '不能修改自己的角色' });
        }

        const updateData: any = {};
        if (displayName !== undefined) updateData.displayName = displayName;
        if (role !== undefined) {
            const validRoles = ['admin', 'viewer'];
            if (validRoles.includes(role)) updateData.role = role;
        }
        if (isActive !== undefined) updateData.isActive = isActive;
        if (Array.isArray(permissions)) updateData.permissions = permissions;
        if (password && password.length >= 6) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: targetId },
            data: updateData,
            select: {
                id: true,
                username: true,
                displayName: true,
                role: true,
                parentId: true,
                permissions: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: '更新用户失败' });
    }
});

// DELETE /api/users/:id — Delete sub-account (owner only)
router.delete('/:id', authorize('owner'), async (req, res) => {
    try {
        const targetId = req.params.id as string;

        // Prevent owner from deleting themselves
        if (targetId === req.user!.id) {
            return res.status(400).json({ error: '不能删除自己' });
        }

        await prisma.user.delete({ where: { id: targetId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: '删除用户失败' });
    }
});

export default router;
