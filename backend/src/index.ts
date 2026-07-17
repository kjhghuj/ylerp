import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import {
  configureJsonBodyParsing,
  productAtomicRouteErrorHandler,
} from './middleware/productAtomicJsonMiddleware';

dotenv.config();

const app = express();
const port = process.env.PORT || 4002;

// Middlewares
app.use(cors());
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
import { authenticate } from './middleware/authMiddleware';

// Import routes
import authRoutes from './routes/authRoutes';
import shopeeRoutes from './routes/shopeeRoutes';
import userRoutes from './routes/userRoutes';
import productRoutes from './routes/productRoutes';
import financeRoutes from './routes/financeRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import mappingRoutes from './routes/mappingRoutes';
import skuGroupRoutes from './routes/skuGroupRoutes';
import nodeGraphRoutes from './routes/nodeGraphRoutes';
import templateRoutes from './routes/templateRoutes';
import chromaAdaptRoutes from './routes/chromaAdaptRoutes';
import restockRecordRoutes from './routes/restockRecordRoutes';
import restockV2Routes from './routes/restockV2Routes';
import scheduleRoutes from './routes/scheduleRoutes';
import chromaRecordRoutes from './routes/chromaRecordRoutes';
import usageRoutes from './routes/usageRoutes';
import { startFinanceBackup } from './services/financeBackup';

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/shopee', shopeeRoutes);

// Protected routes (auth required)
app.use('/api/users', userRoutes);
app.use('/api/products', authenticate, productRoutes);
app.use(productAtomicRouteErrorHandler);
app.use('/api/finance', authenticate, financeRoutes);
app.use('/api/inventory', authenticate, inventoryRoutes);
app.use('/api/warehouse-mappings', authenticate, mappingRoutes);
app.use('/api/sku-groups', authenticate, skuGroupRoutes);
app.use('/api/templates', authenticate, templateRoutes);
app.use('/api/restock-records', authenticate, restockRecordRoutes);
app.use('/api/restock-v2', authenticate, restockV2Routes);
app.use('/api/schedule', authenticate, scheduleRoutes);
app.use('/api/node-graphs', authenticate, nodeGraphRoutes);
app.use('/api/chroma-adapt', authenticate, chromaAdaptRoutes);
app.use('/api/chroma-data', authenticate, chromaRecordRoutes);
app.use('/api/usage', usageRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

startFinanceBackup();

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
