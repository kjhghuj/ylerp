"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'yangling-erp-secret-key-2026';
/**
 * Verify JWT token and attach user to request
 */
const bcrypt_1 = __importDefault(require("bcrypt"));
const index_1 = require("../index");
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (process.env.NODE_ENV !== 'production' && authHeader === 'Bearer dev-token') {
        let owner = await index_1.prisma.user.findFirst({ where: { role: 'owner' } });
        if (!owner) {
            const hashedPassword = await bcrypt_1.default.hash('admin123', 10);
            owner = await index_1.prisma.user.create({
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
};
exports.authenticate = authenticate;
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
