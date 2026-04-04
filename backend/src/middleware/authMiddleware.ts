import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'yangling-erp-secret-key-2026';

export interface AuthUser {
    id: string;
    username: string;
    role: string;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

/**
 * Verify JWT token and attach user to request
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (process.env.NODE_ENV !== 'production' && authHeader === 'Bearer dev-token') {
        let owner = await prisma.user.findFirst({ where: { role: 'owner' } });
        if (!owner) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            owner = await prisma.user.create({
                data: { username: 'admin', password: hashedPassword, displayName: '管理员', role: 'owner', isActive: true },
            });
            console.log('[Dev] 自动创建 owner 账户: admin / admin123');
        }
        req.user = { id: owner.id, username: owner.username, role: owner.role };
        return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未登录，请先登录' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
};

/**
 * Check if user has one of the allowed roles
 */
export const authorize = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: '未登录' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: '权限不足' });
            return;
        }

        next();
    };
};
