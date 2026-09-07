import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../services/jwtSecret';

export interface AuthUser {
    id: string;
    username: string;
    role: string;
    permissions?: string[];
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
import { prisma } from '../index';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未登录，请先登录' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, getJwtSecret()) as Pick<AuthUser, 'id'>;
        const current = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, role: true, permissions: true, isActive: true },
        });
        if (!current?.isActive) {
            res.status(401).json({ error: '用户不存在或已被禁用' });
            return;
        }
        req.user = { id: current.id, username: current.username, role: current.role, permissions: current.permissions };
        next();
    } catch (error) {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
};

export const authorizeAnyPermission = (...permissionKeys: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: '未登录' });
            return;
        }
        const permissions = user.permissions || [];
        const allowed = user.role === 'owner' || permissions.includes('*') || permissionKeys.some(key => {
            const moduleKey = key.includes('.') ? key.split('.')[0] : key;
            return permissions.includes(key) || permissions.includes(moduleKey);
        });
        if (!allowed) {
            res.status(403).json({ error: '权限不足' });
            return;
        }
        next();
    };
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
