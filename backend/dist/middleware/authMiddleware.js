"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authorizeAnyPermission = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtSecret_1 = require("../services/jwtSecret");
/**
 * Verify JWT token and attach user to request
 */
const index_1 = require("../index");
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未登录，请先登录' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, (0, jwtSecret_1.getJwtSecret)());
        const current = await index_1.prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, role: true, permissions: true, isActive: true },
        });
        if (!current?.isActive) {
            res.status(401).json({ error: '用户不存在或已被禁用' });
            return;
        }
        req.user = { id: current.id, username: current.username, role: current.role, permissions: current.permissions };
        next();
    }
    catch (error) {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
};
exports.authenticate = authenticate;
const authorizeAnyPermission = (...permissionKeys) => {
    return (req, res, next) => {
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
exports.authorizeAnyPermission = authorizeAnyPermission;
/**
 * Check if user has one of the allowed roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
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
exports.authorize = authorize;
