"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const authMiddleware_1 = require("../middleware/authMiddleware");
const ycCredentials_1 = require("../services/ycCredentials");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(authMiddleware_1.authenticate);
const ycCredentialsSchema = zod_1.z.object({
    appKey: zod_1.z.string().max(512),
    appSecret: zod_1.z.string().max(1024).optional(),
}).strict();
const ycCredentialsResponse = (credentials) => ({
    appKey: credentials.ycAppKey || '',
    appSecretConfigured: Boolean(credentials.ycAppSecret),
    environmentConfigured: Boolean(process.env.YC_APP_KEY && process.env.YC_APP_SECRET),
});
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
router.get('/me/yc-credentials', async (req, res) => {
    try {
        const credentials = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { ycAppKey: true, ycAppSecret: true },
        });
        if (!credentials) {
            return res.status(404).json({ error: '用户不存在' });
        }
        return res.json(ycCredentialsResponse(credentials));
    }
    catch {
        return res.status(500).json({ error: '获取元仓配置失败' });
    }
});
router.put('/me/yc-credentials', async (req, res) => {
    const parsed = ycCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: '元仓配置格式不正确' });
    }
    try {
        const appKey = parsed.data.appKey.trim();
        const updateData = {
            ycAppKey: appKey || null,
        };
        if (parsed.data.appSecret !== undefined) {
            const appSecret = parsed.data.appSecret.trim();
            updateData.ycAppSecret = appSecret ? (0, ycCredentials_1.encryptYcAppSecret)(appSecret) : null;
        }
        const credentials = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: { ycAppKey: true, ycAppSecret: true },
        });
        return res.json(ycCredentialsResponse(credentials));
    }
    catch {
        return res.status(500).json({ error: '保存元仓配置失败' });
    }
});
// ---- 个人 AI 接口配置（个人优先，环境变量回退；Key 加密存储、只回显已配置状态） ----
const AI_ENDPOINT_KEYS = ['analysisLite', 'analysisMini', 'analysisPro', 'generationDefault', 'generationLite'];
const aiConfigPutSchema = zod_1.z.object({
    chat: zod_1.z.object({
        baseUrl: zod_1.z.string().max(512).optional(),
        model: zod_1.z.string().max(128).optional(),
        apiKey: zod_1.z.string().max(512).optional(),
        provider: zod_1.z.string().max(32).optional(),
    }).strict().optional(),
    image: zod_1.z.object({
        baseUrl: zod_1.z.string().max(512).optional(),
        apiKey: zod_1.z.string().max(512).optional(),
        endpoints: zod_1.z.object({
            analysisLite: zod_1.z.string().max(256).optional(),
            analysisMini: zod_1.z.string().max(256).optional(),
            analysisPro: zod_1.z.string().max(256).optional(),
            generationDefault: zod_1.z.string().max(256).optional(),
            generationLite: zod_1.z.string().max(256).optional(),
        }).strict().optional(),
    }).strict().optional(),
}).strict();
const endpointStringValue = (value) => (typeof value === 'string' ? value.trim() : '');
const aiConfigResponse = (user) => {
    const rawEndpoints = (typeof user.aiImageEndpoints === 'object' && user.aiImageEndpoints !== null && !Array.isArray(user.aiImageEndpoints))
        ? user.aiImageEndpoints
        : {};
    return {
        chat: {
            baseUrl: user.aiChatBaseUrl || '',
            model: user.aiChatModel || '',
            provider: user.aiChatProvider || '',
            apiKeyConfigured: Boolean(user.aiChatApiKeyEnc),
            environmentConfigured: Boolean(process.env.GLM_API_KEY),
        },
        image: {
            baseUrl: user.aiImageBaseUrl || '',
            apiKeyConfigured: Boolean(user.aiImageApiKeyEnc),
            environmentConfigured: Boolean(process.env.ARK_API_KEY),
            endpoints: Object.fromEntries(AI_ENDPOINT_KEYS.map((key) => [key, endpointStringValue(rawEndpoints[key])])),
            environmentEndpoints: {
                analysisLite: Boolean(process.env.ARK_ANALYSIS_ENDPOINT_ID),
                analysisMini: Boolean(process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI),
                analysisPro: Boolean(process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO),
                generationDefault: Boolean(process.env.ARK_ENDPOINT_ID),
                generationLite: Boolean(process.env.ARK_ENDPOINT_ID_SEEDREAM_5_LITE),
            },
        },
    };
};
router.get('/me/ai-config', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                aiChatBaseUrl: true, aiChatApiKeyEnc: true, aiChatModel: true, aiChatProvider: true,
                aiImageApiKeyEnc: true, aiImageBaseUrl: true, aiImageEndpoints: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        return res.json(aiConfigResponse(user));
    }
    catch {
        return res.status(500).json({ error: '获取 AI 配置失败' });
    }
});
router.put('/me/ai-config', async (req, res) => {
    const parsed = aiConfigPutSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'AI 配置格式不正确' });
    }
    try {
        const updateData = {};
        const chat = parsed.data.chat;
        if (chat) {
            if (chat.baseUrl !== undefined)
                updateData.aiChatBaseUrl = chat.baseUrl.trim() || null;
            if (chat.model !== undefined)
                updateData.aiChatModel = chat.model.trim() || null;
            if (chat.provider !== undefined)
                updateData.aiChatProvider = chat.provider.trim() || null;
            // apiKey：不传或为掩码=保持不变；空串=清除；其他=加密保存
            if (chat.apiKey !== undefined && chat.apiKey !== ycCredentials_1.AI_KEY_MASK) {
                const apiKey = chat.apiKey.trim();
                updateData.aiChatApiKeyEnc = apiKey ? (0, ycCredentials_1.encryptSecret)(apiKey) : null;
            }
        }
        const image = parsed.data.image;
        if (image) {
            if (image.baseUrl !== undefined)
                updateData.aiImageBaseUrl = image.baseUrl.trim() || null;
            if (image.apiKey !== undefined && image.apiKey !== ycCredentials_1.AI_KEY_MASK) {
                const apiKey = image.apiKey.trim();
                updateData.aiImageApiKeyEnc = apiKey ? (0, ycCredentials_1.encryptSecret)(apiKey) : null;
            }
            if (image.endpoints) {
                const current = await prisma.user.findUnique({
                    where: { id: req.user.id },
                    select: { aiImageEndpoints: true },
                });
                const currentRaw = (typeof current?.aiImageEndpoints === 'object' && current?.aiImageEndpoints !== null && !Array.isArray(current.aiImageEndpoints))
                    ? current.aiImageEndpoints
                    : {};
                const provided = image.endpoints;
                const merged = Object.fromEntries(AI_ENDPOINT_KEYS.map((key) => [
                    key,
                    provided[key] !== undefined ? provided[key].trim() : endpointStringValue(currentRaw[key]),
                ]));
                updateData.aiImageEndpoints = Object.values(merged).some(Boolean) ? merged : null;
            }
        }
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                aiChatBaseUrl: true, aiChatApiKeyEnc: true, aiChatModel: true, aiChatProvider: true,
                aiImageApiKeyEnc: true, aiImageBaseUrl: true, aiImageEndpoints: true,
            },
        });
        return res.json(aiConfigResponse(user));
    }
    catch {
        return res.status(500).json({ error: '保存 AI 配置失败' });
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
