import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { parseTrustedProxyCidrs } from './services/trustedProxy';
import { assertJwtSecretConfigured } from './services/jwtSecret';
import { guardAiRequest } from './middleware/aiRequestGuard';
import shopeeRoutes from './routes/shopeeRoutes';
import {
  configureJsonBodyParsing,
  chromaJsonErrorHandler,
  chromaJsonParser,
  productAnalysisUploadJsonParser,
  productAtomicRouteErrorHandler,
} from './middleware/productAtomicJsonMiddleware';

dotenv.config();
assertJwtSecretConfigured();

const app = express();
app.set('trust proxy', parseTrustedProxyCidrs(process.env.TRUSTED_PROXY_CIDRS));
const port = process.env.PORT || 4002;

// Middlewares
app.use(cors());
// Shopee verifies signatures over the raw body, before general JSON parsing.
app.use('/api/shopee', shopeeRoutes);
configureJsonBodyParsing(app);

export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
});

redis.on('connect', () => {
    console.log('Redis TCP connected');
});

let redisReady = false;
redis.on('ready', () => { redisReady = true; console.log('Redis ready'); });
redis.on('close', () => { redisReady = false; });
redis.on('end', () => { redisReady = false; });
redis.on('error', (err) => {
    console.warn('Redis error (continuing without cache):', err.message);
});

export const safeRedis = {
    async get(key: string): Promise<string | null> {
        if (!redisReady) return null;
        try { return await redis.get(key); } catch { return null; }
    },
    async set(key: string, value: string, ...args: (string | number)[]): Promise<void> {
        if (!redisReady) return;
        try { await (redis.set as (...a: any[]) => any)(key, value, ...args); } catch {}
    },
    async del(key: string): Promise<void> {
        if (!redisReady) return;
        try { await redis.del(key); } catch {}
    },
};

// Import middleware
import { authenticate, authorize, authorizeAnyPermission } from './middleware/authMiddleware';
import { ShopeeAuthorizationService, startShopeeTokenRefresh } from './services/shopeeAuthorization';
import { configureShopeeAuthorization, createShopeeManagementRoutes } from './routes/shopeeAuthorizationRoutes';

// Import routes
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import productRoutes from './routes/productRoutes';
import financeRoutes from './routes/financeRoutes';
import nodeGraphRoutes from './routes/nodeGraphRoutes';
import templateRoutes from './routes/templateRoutes';
import chromaAdaptRoutes from './routes/chromaAdaptRoutes';
import restockV2Routes from './routes/restockV2Routes';
import scheduleRoutes from './routes/scheduleRoutes';
import chromaRecordRoutes from './routes/chromaRecordRoutes';
import usageRoutes from './routes/usageRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import productAnalysisRoutes from './routes/productAnalysisRoutes';
import { startFinanceBackup } from './services/financeBackup';

// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes (auth required)
const shopeeAuthorization = new ShopeeAuthorizationService(prisma);
configureShopeeAuthorization(shopeeAuthorization);
app.use('/api/shopee/manage', authenticate, authorize('owner'), createShopeeManagementRoutes(shopeeAuthorization));
app.use('/api/users', userRoutes);
app.use('/api/products', authenticate, productRoutes);
app.use(productAtomicRouteErrorHandler);
app.use('/api/finance', authenticate, financeRoutes);
app.use('/api/templates', authenticate, templateRoutes);
app.use('/api/restock-v2', authenticate, restockV2Routes);
app.use('/api/schedule', authenticate, scheduleRoutes);
app.use('/api/node-graphs', authenticate, nodeGraphRoutes);
app.use('/api/chroma-adapt', authenticate, chromaJsonParser, chromaJsonErrorHandler, guardAiRequest, chromaAdaptRoutes);
app.use('/api/chroma-data', authenticate, authorizeAnyPermission('chroma-adapt.translate', 'chroma-adapt.edit', 'chroma-adapt.generate'), chromaJsonParser, chromaJsonErrorHandler, chromaRecordRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/product-analysis', authenticate, productAnalysisUploadJsonParser, chromaJsonErrorHandler, guardAiRequest, productAnalysisRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

startFinanceBackup();
startShopeeTokenRefresh(shopeeAuthorization);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
