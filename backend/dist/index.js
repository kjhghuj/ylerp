"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeRedis = exports.redis = exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 4002;
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '100mb' }));
exports.prisma = new client_1.PrismaClient();
exports.redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
});
exports.redis.on('connect', () => {
    console.log('Redis TCP connected');
});
let redisReady = false;
exports.redis.on('ready', () => { redisReady = true; console.log('Redis ready'); });
exports.redis.on('close', () => { redisReady = false; });
exports.redis.on('end', () => { redisReady = false; });
exports.redis.on('error', (err) => {
    console.warn('Redis error (continuing without cache):', err.message);
});
exports.safeRedis = {
    async get(key) {
        if (!redisReady)
            return null;
        try {
            return await exports.redis.get(key);
        }
        catch {
            return null;
        }
    },
    async set(key, value, ...args) {
        if (!redisReady)
            return;
        try {
            await exports.redis.set(key, value, ...args);
        }
        catch { }
    },
    async del(key) {
        if (!redisReady)
            return;
        try {
            await exports.redis.del(key);
        }
        catch { }
    },
};
// Import middleware
const authMiddleware_1 = require("./middleware/authMiddleware");
// Import routes
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const financeRoutes_1 = __importDefault(require("./routes/financeRoutes"));
const inventoryRoutes_1 = __importDefault(require("./routes/inventoryRoutes"));
const mappingRoutes_1 = __importDefault(require("./routes/mappingRoutes"));
const skuGroupRoutes_1 = __importDefault(require("./routes/skuGroupRoutes"));
const nodeGraphRoutes_1 = __importDefault(require("./routes/nodeGraphRoutes"));
const templateRoutes_1 = __importDefault(require("./routes/templateRoutes"));
const chromaAdaptRoutes_1 = __importDefault(require("./routes/chromaAdaptRoutes"));
const restockRecordRoutes_1 = __importDefault(require("./routes/restockRecordRoutes"));
const scheduleRoutes_1 = __importDefault(require("./routes/scheduleRoutes"));
const chromaRecordRoutes_1 = __importDefault(require("./routes/chromaRecordRoutes"));
const usageRoutes_1 = __importDefault(require("./routes/usageRoutes"));
// Public routes (no auth required)
app.use('/api/auth', authRoutes_1.default);
// Protected routes (auth required)
app.use('/api/users', userRoutes_1.default);
app.use('/api/products', authMiddleware_1.authenticate, productRoutes_1.default);
app.use('/api/finance', authMiddleware_1.authenticate, financeRoutes_1.default);
app.use('/api/inventory', authMiddleware_1.authenticate, inventoryRoutes_1.default);
app.use('/api/warehouse-mappings', authMiddleware_1.authenticate, mappingRoutes_1.default);
app.use('/api/sku-groups', authMiddleware_1.authenticate, skuGroupRoutes_1.default);
app.use('/api/templates', authMiddleware_1.authenticate, templateRoutes_1.default);
app.use('/api/restock-records', authMiddleware_1.authenticate, restockRecordRoutes_1.default);
app.use('/api/schedule', authMiddleware_1.authenticate, scheduleRoutes_1.default);
app.use('/api/node-graphs', authMiddleware_1.authenticate, nodeGraphRoutes_1.default);
app.use('/api/chroma-adapt', authMiddleware_1.authenticate, chromaAdaptRoutes_1.default);
app.use('/api/chroma-data', authMiddleware_1.authenticate, chromaRecordRoutes_1.default);
app.use('/api/usage', usageRoutes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
