import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
    console.log('Connected to Redis');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

// Basic structure for routes (we'll implement them next)
import productRoutes from './routes/productRoutes';
import financeRoutes from './routes/financeRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import mappingRoutes from './routes/mappingRoutes';
import skuGroupRoutes from './routes/skuGroupRoutes';
import templateRoutes from './routes/templateRoutes';

app.use('/api/products', productRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/warehouse-mappings', mappingRoutes);
app.use('/api/sku-groups', skuGroupRoutes);
app.use('/api/templates', templateRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
